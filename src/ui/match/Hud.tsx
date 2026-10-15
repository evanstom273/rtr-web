import type { MutableRefObject, ReactNode } from 'react';
import { AREA_LABEL } from '../../data/commentary';
import { LADDER_PULLS, fmtClock, heatWord, liveObjects, stipulation, weaponOf, type MatchEngine, type MatchState } from '../../engine';
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
        <StipRow S={S} />
      </div>
      {children}
    </header>
  );
}

const OBJ_STATE: Record<string, string> = {
  dropped: 'on the floor', flat: 'set up', corner: 'in the corner', stacked: 'stacked', spread: 'spread out', ladder: 'set up',
};

/** The stipulation at a glance: score, time, the prize, what's lying around, the referee. */
function StipRow({ S }: { S: MatchState }) {
  const r = S.rules, o = S.obj, def = stipulation(r.stipulation);
  const bits: { t: string; c?: string }[] = [];
  if (r.stipulation !== 'standard') bits.push({ t: def.name, c: 'sn' });
  if (def.multiFall) bits.push({ t: `Falls ${o.score.you}–${o.score.them}`, c: 'hot' });
  if (r.stipulation === 'iron_man') {
    const left = r.ironManMinutes * 60 - S.t;
    bits.push({ t: o.overtime ? 'Sudden death' : `${fmtClock(Math.max(0, left))} left`, c: o.overtime ? 'bad' : undefined });
  }
  const locked = !o.gateOpen && (r.stipulation === 'ladder' || r.stipulation === 'tables' || (r.stipulation === 'steel_cage' && r.cageEscape));
  if (r.stipulation === 'ladder') bits.push({ t: `Prize ${o.ladderPulls}/${LADDER_PULLS}`, c: o.ladderPulls ? 'hot' : undefined });
  if (locked) bits.push({ t: 'Locked until a finisher is banked' });
  if (r.stipulation === 'last_man_standing' && o.lmsFor === 'them') bits.push({ t: 'They are down: make the ref count', c: 'hot' });
  if (r.stipulation === 'i_quit' && o.quitPressure.them) bits.push({ t: `Breaking them: +${o.quitPressure.them}`, c: 'hot' });
  for (const x of liveObjects(S)) {
    if (x.state === 'held') continue;
    bits.push({ t: `${weaponOf(x).name} ${OBJ_STATE[x.state] ?? ''} (${AREA_LABEL[x.area].toLowerCase()})` });
  }
  if (S.env.padRemoved) bits.push({ t: 'Turnbuckle exposed' });
  if (S.ref.distracted > 0) bits.push({ t: 'Referee distracted', c: 'bad' });
  if (!bits.length) return null;
  return (
    <div className="stiprow">
      {bits.map((b, i) => (
        <span key={i} className={b.c}>
          {b.t}
        </span>
      ))}
    </div>
  );
}
