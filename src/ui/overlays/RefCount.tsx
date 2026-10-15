import { useEffect, useState } from 'react';
import type { MatchEngine } from '../../engine';
import { buzz } from '../format';
import { Countdown } from './Countdown';
import { useLeadIn } from './useLeadIn';

const STEP_MS = 760;

/** The AI is covered. The engine has already rolled the kickout; this counts it out. */
export function RefCount({ engine, kickoutAt }: { engine: MatchEngine; kickoutAt: 1 | 2 | 3 | null }) {
  const cd = useLeadIn();
  const live = cd === null;
  const [text, setText] = useState('');
  const [hit, setHit] = useState<'' | 'kick' | 'three'>('');
  const S = engine.state;

  useEffect(() => {
    if (!live) return;
    const timers: number[] = [];
    const words = ['ONE', 'TWO', 'THREE'];
    let i = 0;
    const done = (t: string, h: 'kick' | 'three') => {
      setText(t);
      setHit(h);
      buzz(h === 'three' ? [40, 60, 120] : [12, 40, 12]);
      timers.push(window.setTimeout(() => engine.advance(), 800));
    };
    const step = () => {
      if (kickoutAt !== null && i === kickoutAt) return done('KICKOUT!', 'kick');
      if (i === 2) return kickoutAt === 3 ? done('THR— NO!', 'kick') : done('THREE!', 'three');
      setText(words[i]!);
      buzz(8);
      i++;
      timers.push(window.setTimeout(step, STEP_MS));
    };
    timers.push(window.setTimeout(step, 250));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [live, engine, kickoutAt]);

  return (
    <div className={`ov pin ref ${hit}`}>
      <div className="inner">
        <div className="mt-kicker off">You cover {S.them.w.name}</div>
        <div className="pin-count">{text || '…'}</div>
        <div className="pin-sub">The referee counts…</div>
        {!live && cd !== null && <Countdown label={cd} />}
      </div>
    </div>
  );
}
