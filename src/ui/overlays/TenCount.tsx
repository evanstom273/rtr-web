import { useCallback, useEffect, useRef, useState } from 'react';
import { interactions as ix, type MatchEngine, type TenCountSpec } from '../../engine';
import { buzz } from '../format';
import { Countdown } from './Countdown';
import { useActionKey, useLeadIn } from './useLeadIn';

const WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

/** Last Man Standing: you're down and the referee is counting. Hold, release in the gold, before ten. */
export function TenCount({ engine, spec }: { engine: MatchEngine; spec: TenCountSpec }) {
  const cd = useLeadIn();
  const live = cd === null;
  const S = engine.state;
  const fill = useRef<HTMLDivElement>(null);
  const countEl = useRef<HTMLDivElement>(null);
  const st = useRef({ t0: 0, holding: false, locked: false, fill: 0, done: false, last: 0 });
  const [state, setState] = useState<'idle' | 'hit' | 'shake' | 'pinned'>('idle');
  const countAt = (e: number) => Math.min(10, Math.floor((e / spec.timeLimit) * 10) + 1);

  const end = useCallback((success: boolean, count: number) => {
    if (st.current.done) return;
    st.current.done = true;
    setState(success ? 'hit' : 'pinned');
    if (countEl.current) countEl.current.textContent = success ? `UP AT ${count}!` : 'TEN!';
    buzz(success ? [12, 40, 12] : [60, 40, 120]);
    window.setTimeout(() => engine.resolveTenCount(success, count), success ? 750 : 850);
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
      if (countEl.current) countEl.current.textContent = WORDS[countAt(e) - 1]!;
      if (s.holding) {
        s.fill += dt / spec.fillDuration;
        if (s.fill >= 1) {
          s.fill = 0;
          s.holding = false;
          s.locked = true;
          setState('shake');
          window.setTimeout(() => setState((x) => (x === 'shake' ? 'idle' : x)), 260);
        }
      }
      if (fill.current) fill.current.style.width = s.fill * 100 + '%';
      if (e >= spec.timeLimit) return end(false, 10);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      end(true, countAt((performance.now() - s.t0) / 1000));
    } else {
      s.fill = 0;
      buzz(30);
      setState('shake');
      window.setTimeout(() => setState((x) => (x === 'shake' ? 'idle' : x)), 260);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, end]);
  useActionKey(down, up);

  const lo = (spec.center - spec.width / 200 - spec.forgiveness / 100) * 100;
  return (
    <div className={`ov pin ${state}`}>
      <div className="inner">
        <div className="mt-kicker def">You're down. {S.them.w.name} wants the ten.</div>
        <div className="pin-count" ref={countEl}>
          …
        </div>
        <div className="pin-sub">Hold, then let go inside the gold to get up. Miss and you can go again, until ten.</div>
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

/** Last Man Standing: the AI is down. The engine has already rolled it; this counts it out. */
export function RefTen({ engine, beatenAt }: { engine: MatchEngine; beatenAt: number | null }) {
  const cd = useLeadIn();
  const live = cd === null;
  const [text, setText] = useState('');
  const [hit, setHit] = useState<'' | 'kick' | 'three'>('');
  const S = engine.state;

  useEffect(() => {
    if (!live) return;
    const timers: number[] = [];
    let i = 0;
    const step = () => {
      if (beatenAt !== null && i === beatenAt) {
        setText(`UP AT ${beatenAt}!`);
        setHit('kick');
        buzz([12, 40, 12]);
        timers.push(window.setTimeout(() => engine.advance(), 800));
        return;
      }
      setText(WORDS[i]!);
      buzz(i === 9 ? [40, 60, 120] : 8);
      if (i === 9) {
        setHit('three');
        timers.push(window.setTimeout(() => engine.advance(), 900));
        return;
      }
      i++;
      timers.push(window.setTimeout(step, 520));
    };
    timers.push(window.setTimeout(step, 250));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [live, engine, beatenAt]);

  return (
    <div className={`ov pin ref ${hit}`}>
      <div className="inner">
        <div className="mt-kicker off">{S.them.w.name} is down</div>
        <div className="pin-count">{text || '…'}</div>
        <div className="pin-sub">The referee counts to ten…</div>
        {!live && cd !== null && <Countdown label={cd} />}
      </div>
    </div>
  );
}
