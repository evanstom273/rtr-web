// How long a day takes with the real match engine (opt-in, slow).
// PERF=1 npx vitest run src/career/perf.test.ts  [DAYS=14]
import { it } from 'vitest';
import { activeWorld } from '../world/world';
import { simOne } from './sim';
import { begin, day, pct, type Runner } from './testkit';

it.skipIf(!process.env.PERF)('a day with the real engine', async () => {
  const days = Number(process.env.DAYS ?? 14);
  for (const seed of [7, 11]) {
    const c = begin('jamie_mercer', seed);
    const perJob: number[] = [], simDay: number[] = [], mainDay: number[] = [], jobsDay: number[] = [];
    let retries = 0;
    for (let i = 0; i < days; i++) {
      let sim = 0, jobs = 0, calls = 0;
      const run: Runner = async (js) => {
        const t = performance.now();
        const outs = js.map((j) => { const t0 = performance.now(); const o = simOne(j).out; perJob.push(performance.now() - t0); return o; });
        sim += performance.now() - t;
        // The night's first run is the card; anything after it is a planned finish wrestled again.
        if (js.length && js[0]!.key !== 'mine') { if (calls++ === 0) jobs += js.length; else retries += js.length; } else jobs += js.length;
        return outs;
      };
      const t0 = performance.now();
      await day(c, run);
      const total = performance.now() - t0;
      simDay.push(sim);
      mainDay.push(total - sim);
      jobsDay.push(jobs);
    }
    const t1 = performance.now();
    const bytes = JSON.stringify(activeWorld()).length;
    const save = performance.now() - t1;
    const f = (xs: number[]) => `median ${pct(xs, 0.5).toFixed(0)} · p95 ${pct(xs, 0.95).toFixed(0)}`;
    console.log([
      `seed ${seed}, ${days} days`,
      `  jobs a day: ${f(jobsDay)} (retries ${(retries / days).toFixed(1)} a day)`,
      `  ms a job: ${f(perJob)}`,
      `  sim ms a day: ${f(simDay)}`,
      `  main-thread ms a day: ${f(mainDay)}`,
      `  world: ${(bytes / 1024).toFixed(0)} KB, serialised in ${save.toFixed(0)} ms`,
    ].join('\n'));
  }
}, 1800000);
