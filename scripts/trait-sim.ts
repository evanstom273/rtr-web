/*
 * Trait calibration: mirror matches between two copies of the same wrestler, one with an in-ring trait
 * and one without, through the real engine. Prints each trait's win rate, star rating, length and
 * disqualifications against the same mirror with no traits at all.
 * Run: npx vite-node scripts/trait-sim.ts [matches per trait, default 200]
 */
import { WRESTLERS, databaseChanged, findWrestler, type TraitId } from '../src/data/rtr';
import { runHeadless } from '../src/engine/sim/runHeadless';
import type { MatchRulesConfig } from '../src/engine/types';

const N = Number(process.argv[2] ?? 200);
const base = findWrestler('jamie_mercer')!;
const twin = (id: string, traits: TraitId[]) => ({ ...structuredClone(base), id, name: id, traits });
WRESTLERS.push(twin('mirror_a', []), twin('mirror_b', []));
databaseChanged();
const A = findWrestler('mirror_a')!, B = findWrestler('mirror_b')!;

function run(traits: TraitId[], rules: Partial<MatchRulesConfig> = {}) {
  A.traits = traits;
  B.traits = [];
  let wins = 0, decided = 0, stars = 0, mins = 0, dq = 0;
  for (let i = 0; i < N; i++) {
    // Swap corners every other match so neither side's position counts.
    const flip = i % 2 === 1;
    const r = runHeadless({ seed: 9000 + i, you: flip ? 'mirror_b' : 'mirror_a', them: flip ? 'mirror_a' : 'mirror_b', model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: rules as MatchRulesConfig });
    const S = r.engine.state, R = S.result;
    if (!R) continue;
    stars += S.rating?.stars ?? 0;
    mins += R.t / 60;
    if (R.finish === 'DISQUALIFICATION') dq++;
    if (R.winner) {
      decided++;
      const aSide = flip ? 'them' : 'you';
      if (R.winner === aSide) wins++;
    }
  }
  return { win: (wins / Math.max(1, decided)) * 100, stars: stars / N, mins: mins / N, dq: (dq / N) * 100 };
}

const RING: TraitId[] = ['risk_taker', 'methodical', 'showboat', 'aggressive', 'defensive', 'resilient', 'opportunist', 'dirty_fighter', 'big_match', 'inconsistent', 'submission_specialist', 'crowd_pleaser'];
const baseline = run([]);
const fmt = (x: { win: number; stars: number; mins: number; dq: number }) => `${x.win.toFixed(1).padStart(5)}% · ${x.stars.toFixed(2)}★ · ${x.mins.toFixed(1)} min · DQ ${x.dq.toFixed(1)}%`;
console.log(`Mirror matches, ${N} each (${base.name} against a copy of themselves)`);
console.log(`${'no traits'.padEnd(24)} ${fmt(baseline)}`);
for (const t of RING) {
  const r = run([t], t === 'big_match' ? { big: true } : {});
  const shift = r.win - 50;
  console.log(`${t.padEnd(24)} ${fmt(r)}   win ${shift >= 0 ? '+' : ''}${shift.toFixed(1)} · stars ${(r.stars - baseline.stars >= 0 ? '+' : '')}${(r.stars - baseline.stars).toFixed(2)}`);
}
