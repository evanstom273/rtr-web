// Headless matches for every stipulation: finishes, length, stuck matches, invalid AI choices.
import { STIPULATIONS } from '../src/engine/stipulations';
import { pairings, runHeadless } from '../src/engine/sim/runHeadless';

const N = Number(process.argv[2] ?? 100);
const only = process.argv[3];
const q = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))] ?? NaN;
for (const st of STIPULATIONS) {
  if (only && st.id !== only) continue;
  const finish: Record<string, number> = {};
  const mins: number[] = [];
  let stuck = 0, invalid = 0, weaponHits = 0, tables = 0, bleeds = 0, dirty = 0, dq = 0;
  const examples: string[] = [];
  pairings(N, 77).forEach(([you, them], i) => {
    const r = runHeadless({ seed: 77 + i, you, them, model: { kind: 'skill', sigmaSeconds: 0.09 }, rules: { stipulation: st.id } });
    if (r.stuck) {
      stuck++;
      if (examples.length < 2) examples.push(`${r.stuck} | ${r.engine.state.log.slice(-6).map((l) => l.segs.map((x) => x.v).join('')).join(' / ')}`);
    }
    invalid += r.invalid.length;
    const S = r.engine.state, R = S.result;
    if (R) {
      finish[R.finish] = (finish[R.finish] ?? 0) + 1;
      mins.push(R.t / 60);
      if (R.finish === 'DISQUALIFICATION') dq++;
    }
    weaponHits += S.crowd.weaponHits; tables += S.crowd.tableBreaks; bleeds += S.crowd.bleeds; dirty += S.crowd.dirty;
  });
  const pct = (n: number) => `${Math.round((n / N) * 100)}%`;
  console.log(`${st.name.padEnd(22)} len ${q(mins, 0.5).toFixed(1)} (p90 ${q(mins, 0.9).toFixed(1)}) stuck ${stuck} invalid ${invalid} | ${Object.entries(finish).map(([k, v]) => `${k} ${pct(v)}`).join(', ')} | per match: weapon hits ${(weaponHits / N).toFixed(1)}, tables ${(tables / N).toFixed(1)}, bleeds ${(bleeds / N).toFixed(1)}, dirty ${(dirty / N).toFixed(1)}`);
  for (const e of examples) console.log('   ', e);
}
