import type { MutableRefObject, ReactNode } from 'react';
import { fmtClock, heatWord, type MatchEngine } from '../../engine';
import { CrowdCanvas } from './CrowdCanvas';

export function Hud({ engine, pulse, children }: { engine: MatchEngine; pulse: MutableRefObject<number>; children?: ReactNode }) {
  const S = engine.state, v = S.view;
  return (
    <header id="hud">
      <div className="hudmain">
        <CrowdCanvas engine={engine} pulse={pulse} />
        <div className="hudrow">
          <span id="evt">
            {S.event} · {S.venue}
            {S.rules.title && S.titleName ? ' · ' + S.titleName : ''}
          </span>
          <span id="clock">{fmtClock(v.t)}</span>
          <span id="phase">{v.phase}</span>
          {v.count !== null && <span id="countout">Count {v.count}</span>}
          <span id="heatLbl">
            Crowd {Math.round(v.heat)} · {heatWord(v.heat)}
          </span>
        </div>
      </div>
      {children}
    </header>
  );
}
