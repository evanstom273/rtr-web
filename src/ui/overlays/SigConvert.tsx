import { useEffect } from 'react';
import type { MatchEngine, SigConvertSpec } from '../../engine';
import { buzz } from '../format';

/** A signature has landed: cash in 50 momentum for a finisher, or keep the momentum. */
export function SigConvert({ engine, spec }: { engine: MatchEngine; spec: SigConvertSpec }) {
  const pick = (convert: boolean) => {
    buzz(convert ? [12, 30, 12] : 10);
    engine.resolveSigConvert(convert);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') pick(true);
      else if (e.key === 'k' || e.key === 'K') pick(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const left = Math.round(spec.momentum) - 50;
  return (
    <div className="ov subchoice">
      <div className="inner">
        <div className="mt-kicker off">{spec.moveName} lands</div>
        <div className="mt-title">Bank a finisher?</div>
        <div className="sc-read">
          <span>
            Momentum <b>{Math.round(spec.momentum)}</b>
          </span>
          <span>
            Finishers banked <b>{spec.stock}</b>/3
          </span>
        </div>
        <div className="sc-actions">
          <button className="sc-btn tap" onClick={() => pick(true)}>
            <span className="pl">Bank a finisher</span>
            <span className="ps">Cash in 50 momentum ({left} left). The finisher’s yours to use whenever it fits.</span>
          </button>
          <button className="sc-btn work" onClick={() => pick(false)}>
            <span className="pl">Keep the momentum</span>
            <span className="ps">Stay at {Math.round(spec.momentum)} and push on for 100, which banks a finisher anyway.</span>
          </button>
        </div>
        <div className="mt-hint">F to bank a finisher · K to keep the momentum</div>
      </div>
    </div>
  );
}
