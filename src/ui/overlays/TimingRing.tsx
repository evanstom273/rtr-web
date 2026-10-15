import { useCallback, useEffect, useRef, useState } from 'react';
import { interactions as ix, type MatchEngine, type ReversalSpec } from '../../engine';
import { buzz } from '../format';
import { Countdown } from './Countdown';
import { useActionKey, useLeadIn } from './useLeadIn';

type Grade = 'clean' | 'near' | 'miss' | 'timeout';
const NEAR_MISS = 0.09;
const R_MAX = 120;

/** Shrinking-ring reversal (Godot timing_circle_interaction). */
export function TimingRing({ engine, spec }: { engine: MatchEngine; spec: ReversalSpec }) {
  const cd = useLeadIn();
  const live = cd === null;
  const ring = useRef<SVGCircleElement>(null);
  const timer = useRef<HTMLSpanElement>(null);
  const st = useRef({ t0: 0, progress: 1, done: false });
  const [grade, setGrade] = useState<Grade | null>(null);
  const defend = spec.role === 'defend';

  const finish = useCallback((g: Grade) => {
    if (st.current.done) return;
    st.current.done = true;
    setGrade(g);
    buzz(g === 'clean' ? [10, 30, 18] : 40);
    window.setTimeout(() => engine.resolveReversal(g === 'clean'), g === 'clean' ? 420 : 520);
  }, [engine]);

  useEffect(() => {
    if (!live) return;
    st.current.t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (st.current.done) return;
      const e = (now - st.current.t0) / 1000;
      const p = ix.ringProgress(e, spec.timeLimit);
      st.current.progress = p;
      if (ring.current) ring.current.setAttribute('r', String(Math.max(1.5, R_MAX * p)));
      if (timer.current) timer.current.textContent = Math.max(0, spec.timeLimit - e).toFixed(1) + 's';
      if (p <= 0 || e >= spec.timeLimit) return finish('timeout');
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, spec, finish]);

  const press = useCallback(() => {
    if (!live || st.current.done) return;
    const p = st.current.progress, half = spec.window / 200, d = Math.abs(p - spec.target);
    finish(ix.ringHit(p, spec.target, spec.window) ? 'clean' : d - half <= NEAR_MISS ? 'near' : 'miss');
  }, [live, spec, finish]);
  useActionKey(press);

  const tR = R_MAX * spec.target, hw = R_MAX * (spec.window / 200);
  const verdict = grade === 'clean' ? (defend ? 'REVERSED!' : 'LANDED!') : grade === 'near' ? 'SO CLOSE' : grade === 'miss' ? 'MISSED' : grade === 'timeout' ? 'TOO LATE' : '';
  const strong = spec.major !== null;
  return (
    <div className={`ov timing ${defend ? 'def' : 'off'}${strong ? ' strong' : ''}${grade ? ` g-${grade}` : ''}`} onPointerDown={(e) => { e.preventDefault(); press(); }}>
      <div className="inner">
        <div className="mt-kicker">
          {spec.major ? `${spec.major} — ` : ''}
          {defend ? 'Reversal window' : 'Break through'}
        </div>
        <div className="mt-title">{spec.moveName}</div>
        <div className="mt-sub">{defend ? 'Tap as the ring crosses the gold to reverse.' : 'Tap as the ring crosses the gold to land it.'}</div>
        <div className="ringwrap">
          <svg viewBox="-130 -130 260 260" className="tring">
            <circle className="bg" r={R_MAX} />
            <circle className="band" r={tR} strokeWidth={Math.max(2, hw * 2)} />
            <circle className="band-in" r={Math.max(1, tR - hw)} />
            <circle className="band-out" r={tR + hw} />
            <circle ref={ring} className="shrink" r={R_MAX} />
            <circle className="dot" r="6" />
          </svg>
          {!live && cd !== null && <Countdown label={cd} />}
          {grade && <div className="verdict">{verdict}</div>}
        </div>
        <div className="mt-hint">
          <span ref={timer}>{spec.timeLimit.toFixed(1)}s</span> · tap anywhere or press Space
        </div>
      </div>
    </div>
  );
}
