/* Prints match-length, finish-type and star-rating distributions from headless AI-vs-AI runs. */
import { runBatch, type HitModel } from '../src/engine/sim/runHeadless';

const N = Number(process.argv[2] ?? 500);
const models: [string, HitModel][] = [
  ['Fixed hit rate 60%', { kind: 'fixed', rate: 0.6 }],
  ['Skill-based (σ = 6% of track)', { kind: 'skill', sigma: 6 }],
];

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
};

for (const [name, model] of models) {
  const rs = runBatch({ n: N, seed: 1000, model }).filter((r) => r.result && r.rating);
  const mins = rs.map((r) => r.result!.t / 60);
  const stars = rs.map((r) => r.rating!.stars);
  console.log(`\n### ${name} — ${rs.length} matches\n`);
  console.log(`Match length (minutes): min ${Math.min(...mins).toFixed(1)}, p10 ${q(mins, 0.1).toFixed(1)}, median ${q(mins, 0.5).toFixed(1)}, p90 ${q(mins, 0.9).toFixed(1)}, max ${Math.max(...mins).toFixed(1)}\n`);
  const lenB: [string, (m: number) => boolean][] = [['< 6', (m) => m < 6], ['6–10', (m) => m >= 6 && m < 10], ['10–20', (m) => m >= 10 && m < 20], ['20–28', (m) => m >= 20 && m <= 28], ['> 28', (m) => m > 28]];
  console.log('| Length | Matches |\n|---|---|');
  for (const [l, f] of lenB) console.log(`| ${l} min | ${pct(mins.filter(f).length, rs.length)} |`);
  const finish: Record<string, number> = {};
  for (const r of rs) {
    const R = r.result!;
    const k = R.how === 'sub' ? (R.move?.fin ? 'Submission (finisher)' : 'Submission (regular hold)') : R.byFin ? 'Pin after finisher' : R.byFlash ? 'Roll-up pin' : R.move?.sig ? 'Pin after signature' : R.move ? 'Pin after other move' : 'Pin (cold cover)';
    finish[k] = (finish[k] ?? 0) + 1;
  }
  console.log('\n| Finish | Matches |\n|---|---|');
  for (const [k, v] of Object.entries(finish).sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${pct(v, rs.length)} |`);
  const youWin = rs.filter((r) => r.result!.winner === 'you').length;
  console.log(`\nWinner: "you" side ${pct(youWin, rs.length)}, "them" side ${pct(rs.length - youWin, rs.length)}`);
  console.log('\n| Stars | Matches |\n|---|---|');
  const buckets = new Map<number, number>();
  for (const s of stars) buckets.set(s, (buckets.get(s) ?? 0) + 1);
  for (const [s, v] of [...buckets].sort((a, b) => a[0] - b[0])) console.log(`| ${s} | ${pct(v, rs.length)} |`);
  console.log(`\nMean ${(stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2)}★, median ${q(stars, 0.5)}★. Off the scale (raw ≥ 5.5): ${pct(rs.filter((r) => r.rating!.raw >= 5.5).length, rs.length)}`);
  const steps = rs.map((r) => r.steps);
  console.log(`Engine steps per match: median ${q(steps, 0.5)}, max ${Math.max(...steps)}`);
}
