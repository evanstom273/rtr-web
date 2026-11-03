import { useEffect, useRef, useState } from 'react';
import { AREA_LABEL } from '../../data/commentary';
import { LADDER_PULLS, fmtClock, liveObjects, stipulation, weaponOf, type MatchState } from '../../engine';

const OBJ_STATE: Record<string, string> = {
  dropped: 'on the floor', flat: 'set up', corner: 'in the corner', stacked: 'stacked', spread: 'spread out', ladder: 'set up',
};

/** The stipulation at a glance: score, time, the prize, what's lying around, the referee. */
export function StipRow({ S }: { S: MatchState }) {
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

const fmtStars = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));

/** The star rating so far. Tap for the breakdown. Flashes when it climbs. */
export function LiveStars({ live }: { live: MatchState['view']['live'] }) {
  const [open, setOpen] = useState(false);
  const [bump, setBump] = useState<'' | 'up' | 'down'>('');
  const prev = useRef(live.stars);
  useEffect(() => {
    if (live.stars === prev.current) return;
    setBump(live.stars > prev.current ? 'up' : 'down');
    prev.current = live.stars;
    const id = window.setTimeout(() => setBump(''), 1200);
    return () => window.clearTimeout(id);
  }, [live.stars]);
  const rows: [string, number][] = [['Crowd', live.crowd], ['Story', live.story], ['Drama', live.drama], ['Action', live.action]];
  return (
    <span className="livestars-wrap">
      <button className={`livestars ${bump}`} onClick={() => setOpen((x) => !x)} aria-expanded={open}
        aria-label={`Rating so far: ${live.stars} stars. Tap for the breakdown.`}>
        ★ {fmtStars(live.stars)}
      </button>
      {open && (
        <span className="livestars-pop" onClick={() => setOpen(false)}>
          <b>On course for {fmtStars(live.stars)}★</b>
          <small>If it ended now, with an ordinary finish.</small>
          {rows.map(([l, x]) => (
            <span key={l} className="ls-row">
              <span>{l}</span>
              <i>
                <i style={{ width: `${Math.round(Math.max(0.03, Math.min(1, x)) * 100)}%` }} />
              </i>
            </span>
          ))}
          <small className="ls-miss">{live.missing}</small>
        </span>
      )}
    </span>
  );
}
