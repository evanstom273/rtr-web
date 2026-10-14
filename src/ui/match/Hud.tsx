import type { MutableRefObject } from 'react';
import { fmtClock, heatWord, type MatchEngine } from '../../engine';
import { CrowdCanvas } from './CrowdCanvas';

export function Hud({ engine, pulse }: { engine: MatchEngine; pulse: MutableRefObject<number> }) {
  const S = engine.state, v = S.view;
  return (
    <header id="hud">
      <CrowdCanvas engine={engine} pulse={pulse} />
      <div className="hudrow">
        <span id="evt">
          {S.event} · {S.venue}
          {S.title ? ' · ' + S.titleName : ''}
        </span>
        <span id="clock">{fmtClock(v.t)}</span>
        <span id="phase">{v.phase}</span>
        <span id="heatLbl">
          Crowd {Math.round(v.heat)} · {heatWord(v.heat)}
        </span>
      </div>
    </header>
  );
}
