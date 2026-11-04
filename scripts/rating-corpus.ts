/*
 * The match-rating corpus: thousands of headless matches across the whole world (shipped and generated
 * wrestlers), with career-like stipulations and titles, played-style (σ 70ms) and simmed (σ 100ms).
 * Writes one JSON line per match: the rating's raw features, the wrestlers' styles and today's stars.
 *   npx vite-node scripts/rating-corpus.ts N SEED OUT.jsonl
 */
import { writeFileSync } from 'node:fs';
import { WRESTLERS } from '../src/data/rtr';
import { seededRng } from '../src/engine/rng';
import { matchFeatures } from '../src/engine/rating';
import { runHeadless } from '../src/engine/sim/runHeadless';
import type { MatchRulesConfig, StipulationId } from '../src/engine/types';
import { freshWorld, setWorld } from '../src/world/world';

const N = Number(process.argv[2] ?? 500), SEED = Number(process.argv[3] ?? 1), OUT = process.argv[4] ?? 'corpus.jsonl';
setWorld(freshWorld(SEED));
const rnd = seededRng(SEED * 7919);
const STIPS: [StipulationId, number][] = [['no_dq', 3], ['falls_count_anywhere', 2], ['tables', 2], ['ladder', 2], ['steel_cage', 2], ['last_man_standing', 1], ['i_quit', 1], ['submission', 1], ['two_out_of_three_falls', 1], ['iron_man', 0.5]];
const pickStip = (): StipulationId => {
  const t = STIPS.reduce((a, s) => a + s[1], 0);
  let r = rnd() * t;
  for (const [s, w] of STIPS) { r -= w; if (r <= 0) return s; }
  return 'no_dq';
};
const lines: string[] = [];
for (let i = 0; i < N; i++) {
  const a = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!;
  const pool = WRESTLERS.filter((w) => w.id !== a.id && w.gender === a.gender);
  const b = pool[Math.floor(rnd() * pool.length)]!;
  const stip = rnd() < 0.12 ? pickStip() : 'standard';
  const title = rnd() < 0.15;
  const played = rnd() < 0.3;
  const rules: Partial<MatchRulesConfig> = { stipulation: stip, ...(title ? { title: true } : {}) };
  const r = runHeadless({ seed: SEED * 100000 + i, you: a.id, them: b.id, rules: rules as MatchRulesConfig, model: { kind: 'skill', sigmaSeconds: played ? 0.07 : 0.1 } });
  if (!r.ended || !r.rating) continue;
  const S = r.engine.state;
  lines.push(JSON.stringify({
    f: matchFeatures(S), stars: r.rating.stars, raw: r.rating.raw, stip, played,
    ca: a.classes, cb: b.classes, ov: Math.round((Object.values(a.stats).reduce((x, y) => x + y, 0) + Object.values(b.stats).reduce((x, y) => x + y, 0)) / 12),
    indie: a.promotion === 'TIS' || b.promotion === 'TIS',
  }));
}
writeFileSync(OUT, lines.join('\n') + '\n');
console.log('wrote', lines.length, 'of', N, 'to', OUT);
