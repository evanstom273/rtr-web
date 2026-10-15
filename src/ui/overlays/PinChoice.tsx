import { useEffect } from 'react';
import type { MatchEngine, PinChoiceSpec } from '../../engine';
import { buzz } from '../format';

/** A pin combo has landed: hook the leg now, or keep the upper hand and wear them down first. */
export function PinChoice({ engine, spec }: { engine: MatchEngine; spec: PinChoiceSpec }) {
  const S = engine.state;
  const pick = (cover: boolean) => {
    buzz(cover ? [12, 30, 12] : 10);
    engine.resolvePinChoice(cover);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C') pick(true);
      else if (e.key === 'k' || e.key === 'K') pick(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const odds = Math.round(spec.odds);
  return (
    <div className="ov subchoice">
      <div className="inner">
        <div className="mt-kicker off">{spec.moveName} lands</div>
        <div className="mt-title">Cover?</div>
        <div className="sc-read">
          <span>
            Chance of the three <b className={odds >= 50 ? 'good' : odds < 20 ? 'bad' : 'warn'}>{odds}%</b>
          </span>
          <span>
            They look <b className={spec.condition === 'wrecked' || spec.condition === 'worn' ? 'bad' : ''}>{spec.condition}</b>
          </span>
        </div>
        {spec.resiliency && <p className="sc-note">{S.them.w.name} still has Resiliency and may survive a three.</p>}
        <div className="sc-actions">
          <button className="sc-btn tap" onClick={() => pick(true)}>
            <span className="pl">Hook the leg</span>
            <span className="ps">Go for the pin now. If they kick out, it’s anyone’s again.</span>
          </button>
          <button className="sc-btn work" onClick={() => pick(false)}>
            <span className="pl">Keep the upper hand</span>
            <span className="ps">Roll through and stay on them. You keep control.</span>
          </button>
        </div>
        <div className="mt-hint">C to cover · K to keep the upper hand</div>
      </div>
    </div>
  );
}
