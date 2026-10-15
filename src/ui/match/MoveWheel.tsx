import { useEffect, useMemo, useState } from 'react';
import { POSITION_LABEL } from '../../data/commentary';
import {
  isFinisherMove, isSignatureMove, partLabel, targetHp, type BodyPart, type MatchEngine, type Move, type MoveType, type Part,
} from '../../engine';
import { Mannequin } from '../common/Mannequin';
import { buzz, pts } from '../format';

/** Small line icons, drawn in a 20×20 box centred on 0,0. */
const ICON: Record<string, string> = {
  STRIKE: 'M-7 3 L-2 -2 L1 1 L7 -6 M3 -6 H7 V-2 M-8 7 H-3',
  GRAPPLE: 'M-7 -1 A7 7 0 1 1 -1 7 M-7 -1 L-8 -6 M-7 -1 L-2 -2',
  SUBMISSION: 'M-8 0 H-3 M3 0 H8 M-3 -3 A3 3 0 1 1 -3 3 M3 -3 A3 3 0 1 0 3 3',
  AERIAL: 'M-8 6 L0 -7 L8 6 M-3 1 H3',
  SPRINGBOARD: 'M-8 7 H8 M-6 7 Q-6 -2 2 -6 L6 -8 M2 -8 H6 V-4',
  RUNNING: 'M-8 -5 L-2 0 L-8 5 M0 -5 L6 0 L0 5',
  PINNING_MOVE: 'M-8 4 H8 M-5 4 V-2 M5 4 V-2 M-7 -4 A3 3 0 0 1 -1 -4 M1 -4 A3 3 0 0 1 7 -4',
};

const CATEGORIES: { type: MoveType; label: string }[] = [
  { type: 'STRIKE', label: 'Strikes' },
  { type: 'GRAPPLE', label: 'Grapples' },
  { type: 'SUBMISSION', label: 'Submissions' },
  { type: 'AERIAL', label: 'Aerial' },
  { type: 'SPRINGBOARD', label: 'Springboard' },
  { type: 'RUNNING', label: 'Running' },
  { type: 'PINNING_MOVE', label: 'Pinning' },
];

const FOCUS: Part[] = ['NONE', 'HEAD', 'BODY', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG'];

interface CatInfo {
  type: MoveType;
  label: string;
  display: Move[];
  valid: number;
  finisherReady: boolean;
  lockedSpecial: boolean;
}

/** Wedge i of n, with the first wedge centred at the top. */
const angle = (i: number, n: number) => -Math.PI / 2 - Math.PI / n + (i / n) * Math.PI * 2;

function wedgePath(i: number, n: number, r0: number, r1: number, gap = 0.035): string {
  const a0 = angle(i, n) + gap, a1 = angle(i + 1, n) - gap;
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(r0, a0)} L${p(r1, a0)} A${r1} ${r1} 0 ${large} 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${p(r0, a0)}Z`;
}

export function MoveWheel({ engine, onClose }: { engine: MatchEngine; onClose: () => void }) {
  const S = engine.state, me = S.you, op = S.them;
  const [cat, setCat] = useState<MoveType | null>(null);
  const [, bump] = useState(0);

  const cats: CatInfo[] = useMemo(() => CATEGORIES.map((c) => {
    const mine = me.all.filter((m) => m.type === c.type && engine.movePositionsFit(m));
    const special = (m: Move) => isFinisherMove(me, m) || isSignatureMove(me, m);
    const display = mine.filter((m) => engine.moveAvailable(m) || special(m));
    const valid = display.filter((m) => engine.moveAvailable(m));
    return {
      ...c, display, valid: valid.length,
      finisherReady: valid.some((m) => isFinisherMove(me, m)),
      lockedSpecial: display.some((m) => special(m) && !engine.moveAvailable(m)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [engine, S.view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') (cat ? setCat(null) : onClose());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [cat, onClose]);

  const current = cats.find((c) => c.type === cat);
  const n = cats.length;

  if (current) {
    const sorted = [...current.display].sort((a, b) => {
      const fa = isFinisherMove(me, a) ? 2 : isSignatureMove(me, a) ? 1 : 0, fb = isFinisherMove(me, b) ? 2 : isSignatureMove(me, b) ? 1 : 0;
      return fa - fb || a.name.localeCompare(b.name);
    });
    const preview = (m: Move) => engine.previewTarget(m);
    return (
      <div className="wheel-ov" onClick={onClose}>
        <div className="movepanel" onClick={(e) => e.stopPropagation()}>
          <div className="mp-head">
            <button className="ghost sm" onClick={() => setCat(null)}>
              ‹ Back
            </button>
            <h3>{current.label}</h3>
            <button className="ghost sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="mp-focus">
            <Mannequin hp={op.hp} focus={me.targetFocus} onPick={(p: BodyPart) => { engine.setFocus(p); bump((x) => x + 1); }} className="fig-sm" />
            <div className="focus-chips" role="radiogroup" aria-label="Target focus">
              {FOCUS.map((p) => (
                <button key={p} role="radio" aria-checked={me.targetFocus === p} className={me.targetFocus === p ? 'on' : ''}
                  onClick={() => { engine.setFocus(p === 'NONE' ? me.targetFocus : p); bump((x) => x + 1); }}>
                  {partLabel(p)}
                </button>
              ))}
            </div>
          </div>
          <div className="mgrid">
            {sorted.map((m) => {
              const ok = engine.moveAvailable(m);
              const t = preview(m);
              const fin = isFinisherMove(me, m), sig = !fin && isSignatureMove(me, m);
              const why = ok ? null : engine.lockedReason(m);
              return (
                <button key={m.id} className={`mv${fin ? ' fin' : sig ? ' sigmv' : ''}`} disabled={!ok}
                  onClick={() => { buzz(); onClose(); engine.chooseMove(m.id); }}>
                  <span className="mn">
                    {fin && <span className="tagf">F</span>}
                    {sig && <span className="tags">SIG</span>}
                    {m.name}
                  </span>
                  <span className="mi">
                    <span className="tgt">
                      {t.fullTag} {Math.round(targetHp(op.hp, t))}
                    </span>
                    <span className="pts">{pts(m.impact)}</span>
                    {m.submission && <span className="sub">submission</span>}
                    {m.flashPin && <span className="flash">flash pin</span>}
                    {m.pinningCombo && <span className="flash">pin combo</span>}
                    {(me.moveUseCounts[m.id] ?? 0) >= 2 && <span className="warn">used ×{me.moveUseCounts[m.id]}</span>}
                    {why && <span className="lock">Locked: {why}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wheel-ov" onClick={onClose}>
      <svg className="wheel" viewBox="-150 -150 300 300" onClick={(e) => e.stopPropagation()}>
        {cats.map((c, i) => {
          const enabled = c.display.length > 0;
          const mid = angle(i + 0.5, n);
          const lx = Math.cos(mid) * 98, ly = Math.sin(mid) * 98;
          return (
            <g key={c.type} className={`wedge${enabled ? '' : ' off'}${c.finisherReady ? ' finready' : ''}`} style={{ animationDelay: `${i * 22}ms` }}
              onClick={() => { if (enabled) { buzz(8); setCat(c.type); } }} role="button" aria-disabled={!enabled} aria-label={`${c.label}: ${c.valid} moves`}>
              <path d={wedgePath(i, n, 54, 144)} />
              <path className="wi" d={ICON[c.type]} transform={`translate(${lx.toFixed(1)} ${(ly - 14).toFixed(1)})`} />
              <text x={lx} y={ly + 8} className="wl">{c.label}</text>
              <text x={lx} y={ly + 22} className="wc">
                {enabled ? `${c.valid} ready${c.lockedSpecial ? ' · +locked' : ''}` : '—'}
              </text>
            </g>
          );
        })}
        <g className="hub" onClick={onClose} role="button" aria-label="Close">
          <circle r="48" />
          <text y="-10" className="hub-a">{POSITION_LABEL[me.state.position]}</text>
          <text y="4" className="hub-vs">vs</text>
          <text y="18" className="hub-b">{POSITION_LABEL[op.state.position]}</text>
          <text y="36" className="hub-x">✕</text>
        </g>
      </svg>
    </div>
  );
}
