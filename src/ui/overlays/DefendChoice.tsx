import { useEffect } from 'react';
import { BRACE_DAMAGE, CAUGHT_DAMAGE, RIDE_MOMENTUM, staminaPercent, type Defence, type DefendSpec, type MatchEngine } from '../../engine';
import { buzz } from '../format';

/**
 * A move is coming at you: see it, then decide. Go for the reversal (the dice come out), brace for
 * it, or ride it out.
 */
export function DefendChoice({ engine, spec }: { engine: MatchEngine; spec: DefendSpec }) {
  const S = engine.state, them = S.them.w.name;
  const pick = (d: Defence) => {
    buzz(d === 'reverse' ? [12, 30, 12] : 10);
    engine.defend(d);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'r' || k === '1') pick('reverse');
      else if (k === 'b' || k === '2') pick('brace');
      else if (k === 'o' || k === '3') pick('ride');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const chance = Math.round(spec.reverseChance);
  const sta = Math.round(staminaPercent(S.you));
  return (
    <div className={`ov defend${spec.major ? ' strong' : ''}`}>
      <div className="inner">
        <div className="mt-kicker def">
          {spec.major ? `${spec.major === 'FINISHER' ? 'Finisher' : 'Signature'} · ` : ''}
          {them} goes for it
        </div>
        <div className="mt-title">{spec.moveName}</div>
        <div className="sc-read">
          <span>
            {spec.moveType} <b className={spec.impact >= 8 ? 'bad' : spec.impact >= 6 ? 'warn' : ''}>impact {spec.impact}</b>
          </span>
          {spec.aimed && (
            <span>
              Aimed at your <b>{spec.aimed}</b>
            </span>
          )}
          <span>
            You're on <b className={sta < 30 ? 'bad' : sta < 55 ? 'warn' : ''}>{sta}% stamina</b>
          </span>
        </div>
        {spec.telegraphed && <p className="sc-note">You can see this one coming: easier to reverse.</p>}
        <div className="sc-actions df-actions">
          <button className="sc-btn tap df-rev" onClick={() => pick('reverse')}>
            <span className="pl">
              Go for the reversal <small>{chance}%</small>
            </span>
            <span className="ps">Roll for it. Win and it's yours, momentum and all. Lose and it lands {Math.round((CAUGHT_DAMAGE - 1) * 100)}% harder.</span>
          </button>
          <button className="sc-btn work df-brace" onClick={() => pick('brace')}>
            <span className="pl">Brace</span>
            <span className="ps">No roll. It lands, but for {Math.round((1 - BRACE_DAMAGE) * 100)}% less.</span>
          </button>
          <button className="sc-btn df-ride" onClick={() => pick('ride')}>
            <span className="pl">Ride it out</span>
            <span className="ps">No roll. It lands in full, but you save your energy and take +{RIDE_MOMENTUM} momentum from it.</span>
          </button>
        </div>
        <div className="mt-hint">R reverse · B brace · O ride it out</div>
      </div>
    </div>
  );
}
