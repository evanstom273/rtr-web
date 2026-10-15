import { useEffect } from 'react';
import type { MatchEngine, SubChoiceSpec } from '../../engine';
import { buzz } from '../format';

/** A hold has landed: risk the tug for the win, or bank the damage and keep control. */
export function SubChoice({ engine, spec }: { engine: MatchEngine; spec: SubChoiceSpec }) {
  const S = engine.state;
  const tech = S.you.w.classes.includes('TECHNICIAN');
  const pick = (tap: boolean) => {
    buzz(tap ? [12, 30, 12] : 10);
    engine.resolveSubChoice(tap);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') pick(true);
      else if (e.key === 'w' || e.key === 'W') pick(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const hp = Math.round(spec.partHp);
  return (
    <div className="ov subchoice">
      <div className="inner">
        <div className="mt-kicker off">Hold locked in · {spec.partLabel}</div>
        <div className="mt-title">{spec.moveName}</div>
        <div className="sc-read">
          <span>
            Their {spec.partLabel} <b className={hp < 35 ? 'bad' : hp < 60 ? 'warn' : ''}>{hp}</b>
          </span>
          <span>
            They look <b className={spec.condition === 'wrecked' || spec.condition === 'worn' ? 'bad' : ''}>{spec.condition}</b>
          </span>
        </div>
        <div className="sc-actions">
          <button className="sc-btn tap" onClick={() => pick(true)}>
            <span className="pl">Go for the tap</span>
            <span className="ps">Win it here — but if they escape, they take over.</span>
          </button>
          <button className="sc-btn work" onClick={() => pick(false)}>
            <span className="pl">Work the hold</span>
            <span className="ps">
              −{Math.round(spec.workDamage)} to the {spec.partLabel}
              {tech ? ' (technician)' : ''}, then let go. You keep control.
            </span>
          </button>
        </div>
        <div className="mt-hint">T to go for the tap · W to work the hold</div>
      </div>
    </div>
  );
}
