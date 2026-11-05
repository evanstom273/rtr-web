import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { TITLES, databaseChanged, databaseVersion, findWrestler, onDatabaseChange, type Wrestler } from '../../data/rtr';
import type { Career } from '../../career/types';
import { activeWorld, saveWorld } from '../../world/world';
import { useSkin, type Skin } from '../skin';

/** Re-render whenever the world changes; returns the active career (null if there isn't one). */
export function useCareer(): Career | null {
  useSyncExternalStore(onDatabaseChange, databaseVersion, databaseVersion);
  return activeWorld().career;
}

/** After changing the career or database: refresh every screen and save. */
export function commit(): void {
  databaseChanged();
  void saveWorld();
}

/** Skin wording: the paper's own words, or the broadcast/building ones (shouted). */
export function useWords(): { skin: Skin; w: (paper: string, other?: string) => string } {
  const skin = useSkin();
  const w = useCallback((paper: string, other?: string) => (skin === 'paper' ? paper : (other ?? paper).toUpperCase()), [skin]);
  return { skin, w };
}

export const money = (v: number): string => `${v < 0 ? '−' : ''}£${Math.abs(Math.round(v)).toLocaleString('en-GB')}`;
/** Big money in a small box: £2.5m, £84k. */
export const shortMoney = (v: number): string => {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  return a >= 1e6 ? `${s}£${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}m` : a >= 1e4 ? `${s}£${Math.round(a / 1000)}k` : money(v);
};

export function tone(w: Wrestler | undefined): 'face' | 'heel' | 'champ' {
  if (!w) return 'face';
  if (TITLES.some((t) => t.holder === w.id || t.holders?.includes(w.id))) return 'champ';
  return w.disposition === 'HEEL' ? 'heel' : 'face';
}

/** A name in Lyra's convention: (f)/(h) before, (c) after, coloured face/heel/champion. */
export function Nm({ id, w: given, cls = 'c-nl', name, plain }: { id?: string; w?: Wrestler; cls?: string; name?: string; plain?: boolean }) {
  const w = given ?? (id ? findWrestler(id) : undefined);
  if (!w) return <span className={`${cls} face`}>{name ?? '?'}</span>;
  // `plain`: a name from history, where today's (c) would mislead.
  const t = plain && tone(w) === 'champ' ? (w.disposition === 'HEEL' ? 'heel' : 'face') : tone(w);
  return (
    <span className={`${cls} ${t}`}>
      <span className="c-pre">({w.disposition === 'HEEL' ? 'h' : 'f'}) </span>
      {name ?? w.name}
      {t === 'champ' && <span className="c-pre"> (c)</span>}
    </span>
  );
}

export function Head({ title, meta, onBack, back }: { title: string; meta?: string; onBack: () => void; back?: string }) {
  const { skin } = useWords();
  return (
    <>
      <div className="c-top">
        <button className="c-back" onClick={onBack} aria-label="Back">{back ?? (skin === 'paper' ? '‹ Back' : '‹')}</button>
        <div className="c-ttl">{title}</div>
        {meta && <span className="c-meta">{meta}</span>}
      </div>
      <div className="c-mast">{title}</div>
    </>
  );
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className="cr">
      <div className={`c-scr ${className}`}>{children}</div>
    </section>
  );
}

/** A message that sits over the screen for a few seconds. */
export function useToast(): [ReactNode, (s: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [msg]);
  return [msg ? <div className="c-toast" role="status" onClick={() => setMsg(null)}>{msg}</div> : null, setMsg];
}

export const stars = (s: number): string => `${Number.isInteger(s) ? s : s.toFixed(2).replace(/0$/, '')}★`;
