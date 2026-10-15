import { useCallback, useEffect, useRef, useState } from 'react';
import { COUNT_WORDS } from '../../data/commentary';
import { interactions as ix, type KickoutCount, type KickoutSpec, type MatchEngine } from '../../engine';
import { buzz } from '../format';
import { Countdown } from './Countdown';
import { useActionKey, useLeadIn } from './useLeadIn';

/** You're pinned: hold to fill, release inside the gold before three (Godot hold_release_interaction). */
export function KickoutHold({ engine, spec }: { engine: MatchEngine; spec: KickoutSpec }) {
  const cd = useLeadIn();
  const live = cd === null;
  const S = engine.state;
  const fill = useRef<HTMLDivElement>(null);
  const countEl = useRef<HTMLDivElement>(null);
  const st = useRef({ t0: 0, holding: false, locked: false, fill: 0, done: false, last: 0 });
  const [state, setState] = useState<'idle' | 'hit' | 'shake' | 'pinned'>('idle');

  const end = useCallback((success: boolean, count: KickoutCount) => {
    if (st.current.done) return;
    st.current.done = true;
    setState(success ? 'hit' : 'pinned');
    buzz(success ? [12, 40, 12] : [60, 40, 120]);
    window.setTimeout(() => engine.resolveKickout(success, count), success ? 650 : 750);
  }, [engine]);

  useEffect(() => {
    if (!live) return;
    const s = st.current;
    s.t0 = s.last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (s.done) return;
      const dt = (now - s.last) / 1000;
      s.last = now;
      const e = (now - s.t0) / 1000;
      if (countEl.current) countEl.current.textContent = e < 1 ? '…' : e < 2 ? 'ONE' : e < spec.timeLimit ? 'TWO' : 'THREE';
      if (s.holding) {
        s.fill += dt / spec.fillDuration;
        if (s.fill >= 1) {
          // Held too long: the attempt is wasted, let go and go again.
          s.fill = 0;
          s.holding = false;
          s.locked = true;
          setState('shake');
          window.setTimeout(() => setState((x) => (x === 'shake' ? 'idle' : x)), 260);
        }
      }
      if (fill.current) fill.current.style.width = s.fill * 100 + '%';
      if (e >= spec.timeLimit) return end(false, 3);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, spec, end]);

  const down = useCallback(() => {
    const s = st.current;
    if (!live || s.done || s.locked) return;
    s.holding = true;
  }, [live]);
  const up = useCallback(() => {
    const s = st.current;
    if (s.locked) {
      s.locked = false;
      return;
    }
    if (!s.holding || s.done) return;
    s.holding = false;
    if (ix.kickoutReleaseHit(s.fill, spec.center, spec.width, spec.forgiveness)) {
      end(true, ix.pinCountAt((performance.now() - s.t0) / 1000) as KickoutCount);
    } else {
      s.fill = 0;
      buzz(30);
      setState('shake');
      window.setTimeout(() => setState((x) => (x === 'shake' ? 'idle' : x)), 260);
    }
  }, [spec, end]);
  useActionKey(down, up);

  const lo = (spec.center - spec.width / 200 - spec.forgiveness / 100) * 100;
  return (
    <div className={`ov pin ${state}`}>
      <div className="inner">
        <div className="mt-kicker def">{S.them.w.name} covers you</div>
        <div className="pin-count" ref={countEl}>
          {state === 'hit' ? 'KICKOUT!' : state === 'pinned' ? COUNT_WORDS[3] : '…'}
        </div>
        <div className="pin-sub">Hold, then let go inside the gold. Miss and you can go again — until three.</div>
        <div className="track">
          <div className="goldz" style={{ left: lo + '%', width: spec.width + spec.forgiveness * 2 + '%' }} />
          <div className="fill" ref={fill} />
          {!live && cd !== null && <Countdown label={cd} />}
        </div>
        <button className="bigbtn" onPointerDown={(e) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } down(); }}
          onPointerUp={(e) => { e.preventDefault(); up(); }} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()}>
          Hold · let go in the gold
        </button>
      </div>
    </div>
  );
}
