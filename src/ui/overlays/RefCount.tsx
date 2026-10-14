import { useEffect, useState } from 'react';
import type { KickoutCount, MatchEngine } from '../../engine';

const STEP_MS = 640;
const OUT_MS = 700;

/** The AI is pinned. The engine has already decided the count; this just counts it out. Port of runRefCount(). */
export function RefCount({ engine, count }: { engine: MatchEngine; count: KickoutCount }) {
  const [text, setText] = useState('ONE');
  const [hit, setHit] = useState(false);

  useEffect(() => {
    const surv = count !== 0;
    const seq = ['ONE', 'TWO'];
    let i = 0;
    const timers: number[] = [];
    const out = () => timers.push(window.setTimeout(() => engine.advance(), OUT_MS));
    const step = () => {
      if (surv && ((count === 1 && i === 1) || (count === 2 && i === 2))) {
        setText('KICKOUT');
        setHit(true);
        return out();
      }
      if (i === 2) {
        setText(surv ? 'THR— NO!' : 'THREE!');
        setHit(true);
        return out();
      }
      setText(seq[i] ?? '');
      i++;
      timers.push(window.setTimeout(step, STEP_MS));
    };
    setHit(false);
    step();
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [engine, count]);

  return (
    <div id="pinOv" className={`ov${hit ? ' hit' : ''}`} data-mode="ref">
      <div className="inner">
        <div className="pin-count">{text}</div>
        <div className="pin-sub">{engine.state.them.name} is covered…</div>
      </div>
    </div>
  );
}
