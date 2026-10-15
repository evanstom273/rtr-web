import { useCallback, useEffect, useRef, useState } from 'react';
import { interactions as ix, type CoverSpec, type MatchEngine } from '../../engine';
import { buzz } from '../format';
import { Countdown } from './Countdown';
import { useActionKey, useLeadIn } from './useLeadIn';

type Grade = 'clean' | 'near' | 'miss' | 'timeout';
const NEAR_MISS = 0.09;
const R_MAX = 120;
const NO_COUNT: readonly string[] = [];

interface RingProps {
  window: number;
  timeLimit: number;
  target: number;
  kicker: string;
  title: string;
  sub: string;
  hitWord: string;
  tone: 'def' | 'off';
  strong?: boolean;
  /** Skip the 3-2-1 (reaction prompts like the cover). */
  quick?: boolean;
  onResult: (hit: boolean) => void;
}

/** Shrinking-ring timing (Godot timing_circle_interaction). Used for the pin-combo cover. */
function Ring({ window: band, timeLimit, target, kicker, title, sub, hitWord, tone, strong, quick, onResult }: RingProps) {
  const cd = useLeadIn(quick ? NO_COUNT : undefined, quick ? 0.25 : undefined);
  const live = cd === null;
  const ring = useRef<SVGCircleElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const st = useRef({ progress: 1, done: false });
  const [grade, setGrade] = useState<Grade | null>(null);

  const finish = useCallback((g: Grade) => {
    if (st.current.done) return;
    st.current.done = true;
    setGrade(g);
    buzz(g === 'clean' ? [10, 30, 18] : 40);
    window.setTimeout(() => onResult(g === 'clean'), g === 'clean' ? 420 : 520);
  }, [onResult]);

  useEffect(() => {
    if (!live) return;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (st.current.done) return;
      const e = (now - t0) / 1000;
      const p = ix.ringProgress(e, timeLimit);
      st.current.progress = p;
      if (ring.current) ring.current.setAttribute('r', String(Math.max(1.5, R_MAX * p)));
      if (timer.current) timer.current.textContent = Math.max(0, timeLimit - e).toFixed(1) + 's';
      if (p <= 0 || e >= timeLimit) return finish('timeout');
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, timeLimit, finish]);

  const press = useCallback(() => {
    if (!live || st.current.done) return;
    const p = st.current.progress, half = band / 200, d = Math.abs(p - target);
    finish(ix.ringHit(p, target, band) ? 'clean' : d - half <= NEAR_MISS ? 'near' : 'miss');
  }, [live, band, target, finish]);
  useActionKey(press);

  const tR = R_MAX * target, hw = R_MAX * (band / 200);
  const verdict = grade === 'clean' ? hitWord : grade === 'near' ? 'SO CLOSE' : grade === 'miss' ? 'MISSED' : grade === 'timeout' ? 'TOO LATE' : '';
  return (
    <div className={`ov timing ${tone}${strong ? ' strong' : ''}${quick ? ' quick' : ''}${grade ? ` g-${grade}` : ''}`} onPointerDown={(e) => { e.preventDefault(); press(); }}>
      <div className="inner">
        <div className="mt-kicker">{kicker}</div>
        <div className="mt-title">{title}</div>
        <div className="mt-sub">{sub}</div>
        <div className="ringwrap">
          <svg viewBox="-130 -130 260 260" className="tring">
            <circle className="bg" r={R_MAX} />
            <circle className="band" r={tR} strokeWidth={Math.max(2, hw * 2)} />
            <circle className="band-in" r={Math.max(1, tR - hw)} />
            <circle className="band-out" r={tR + hw} />
            <circle ref={ring} className="shrink" r={R_MAX} />
            <circle className="dot" r="6" />
          </svg>
          {!live && cd && <Countdown label={cd} />}
          {grade && <div className="verdict">{verdict}</div>}
        </div>
        <div className="mt-hint">
          <span ref={timer}>{timeLimit.toFixed(1)}s</span> · tap anywhere or press Space
        </div>
      </div>
    </div>
  );
}

/** Pin combo landed: hit the ring again to make the cover stick. */
export function CoverRing({ engine, spec }: { engine: MatchEngine; spec: CoverSpec }) {
  const onResult = useCallback((hit: boolean) => engine.resolveCover(hit), [engine]);
  return (
    <Ring window={spec.window} timeLimit={spec.timeLimit} target={spec.target} tone="off" quick kicker={`${spec.moveName} lands`}
      title="Cover!" sub="Hit the gold to hook the leg." hitWord="HOOKED!" onResult={onResult} />
  );
}
