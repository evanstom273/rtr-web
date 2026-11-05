// The golden singles record (match overhaul, stage 1): a spread of seeded singles matches across every stipulation,
// fingerprinted (winner, finish, time, stars, steps, the log). The engine rebuild for any number of wrestlers must
// leave singles playing exactly as before. Regenerate only on purpose: GOLDEN=write npx vitest run src/engine/__tests__/golden.test.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { StipulationId } from '../types';

/** The eleven stipulations from before the match overhaul: the fixture is pinned to these. */
const ORIGINAL: StipulationId[] = ['standard', 'no_dq', 'tables', 'ladder', 'submission', 'steel_cage', 'falls_count_anywhere', 'iron_man', 'two_out_of_three', 'last_man_standing', 'i_quit'];
import { pairings, runHeadless } from '../sim/runHeadless';

const FILE = 'src/engine/__tests__/golden.json';

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

function fingerprints(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const st of ORIGINAL.map((id) => ({ id }))) {
    pairings(8, 4100).forEach(([you, them], i) => {
      for (const model of [{ kind: 'skill', sigmaSeconds: 0.09 }, { kind: 'fixed', rate: 0.5 }] as const) {
        const r = runHeadless({ seed: 4100 + i * 7, you, them, model, rules: { stipulation: st.id } });
        const S = r.engine.state;
        const log = S.log.map((l) => `${l.t}|${l.cls}|${l.segs.map((s) => s.v).join('')}`).join('\n');
        out[`${st.id}:${i}:${model.kind}`] = [r.steps, r.result?.winner, r.result?.finish, r.result?.t, r.rating?.stars, S.log.length, hash(log)].join('·');
      }
    });
  }
  return out;
}

it('singles play exactly as they did before the rebuild', () => {
  const now = fingerprints();
  if (process.env.GOLDEN === 'write' || !existsSync(FILE)) { writeFileSync(FILE, JSON.stringify(now, null, 1)); return; }
  const was = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, string>;
  const diffs = Object.keys(was).filter((k) => was[k] !== now[k]).slice(0, 10).map((k) => `${k}\n  was ${was[k]}\n  now ${now[k]}`);
  expect(diffs).toEqual([]);
}, 600_000);
