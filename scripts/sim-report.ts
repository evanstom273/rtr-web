/*
 * Prints match-length, finish-type and star distributions from headless matches. Moves and setups
 * are contested dice rolls (both sides choose pushes like the AI); the hit model only covers the
 * hands-on bits left: the kickout hold and the submission mash.
 */
import { runBatch, type HitModel } from '../src/engine/sim/runHeadless';

const N = Number(process.argv[2] ?? 300);
const models: [string, HitModel][] = [
  ['Steady hands (kickout timing σ = 70ms)', { kind: 'skill', sigmaSeconds: 0.07 }],
  ['Casual (kickout timing σ = 120ms)', { kind: 'skill', sigmaSeconds: 0.12 }],
];
const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};
for (const [name, model] of models) {
  const all = runBatch(N, 1000, model);
  const rs = all.filter((r) => r.result && r.rating);
  const mins = rs.map((r) => r.result!.t / 60);
  const stars = rs.map((r) => r.rating!.stars);
  console.log(`\n### ${name} — ${rs.length}/${all.length} matches finished\n`);
  console.log(`Length (min): p10 ${q(mins, 0.1).toFixed(1)}, median ${q(mins, 0.5).toFixed(1)}, p90 ${q(mins, 0.9).toFixed(1)}, max ${Math.max(...mins).toFixed(1)}\n`);
  console.log('| Length | Matches |\n|---|---|');
  for (const [l, f] of [['< 5', (m: number) => m < 5], ['5–8', (m: number) => m >= 5 && m < 8], ['8–25', (m: number) => m >= 8 && m <= 25], ['25–40', (m: number) => m > 25 && m <= 40], ['> 40', (m: number) => m > 40]] as const) {
    console.log(`| ${l} min | ${pct(mins.filter(f).length, rs.length)} |`);
  }
  const finish: Record<string, number> = {};
  for (const r of rs) {
    const R = r.result!;
    const k = R.finish === 'SUBMISSION' ? (R.byFin ? 'Submission (finisher)' : 'Submission (hold)')
      : R.finish === 'PINFALL' ? (R.byFin ? 'Pin after finisher' : R.byFlash ? 'Flash pin' : R.move ? 'Pin after other move' : 'Pin (cold cover)')
      : R.finish === 'COUNT_OUT' ? 'Count-out' : R.finish === 'DOUBLE_COUNT_OUT' ? 'Double count-out' : R.finish === 'DISQUALIFICATION' ? 'Disqualification' : R.finish;
    finish[k] = (finish[k] ?? 0) + 1;
  }
  console.log('\n| Finish | Matches |\n|---|---|');
  for (const [k, v] of Object.entries(finish).sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${pct(v, rs.length)} |`);
  const youWin = rs.filter((r) => r.result!.winner === 'you').length;
  console.log(`\nWinner: player side ${pct(youWin, rs.length)}, AI side ${pct(rs.filter((r) => r.result!.winner === 'them').length, rs.length)}`);
  console.log(`Stars: mean ${(stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2)}, median ${q(stars, 0.5)}, p10 ${q(stars, 0.1)}, p90 ${q(stars, 0.9)}`);
  const steps = all.map((r) => r.steps);
  console.log(`Engine steps per match: median ${q(steps, 0.5)}, max ${Math.max(...steps)}. Stuck: ${all.filter((r) => r.stuck).length}. Invalid AI choices: ${all.reduce((t, r) => t + r.invalid.length, 0)}`);
}
