// The world over years with the quick stand-in sim (opt-in, slow).
// LONG=1 npx vitest run src/career/longrun.test.ts  [YEARS=3 SEEDS=7,11,23]
import { it } from 'vitest';
import { WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { begin, day, pct } from './testkit';

it.skipIf(!process.env.LONG)('years of the world', async () => {
  const years = Number(process.env.YEARS ?? 3);
  const seeds = (process.env.SEEDS ?? '7,11,23').split(',').map(Number);
  for (const seed of seeds) {
    const c = begin('jamie_mercer', seed);
    const out: string[] = [`seed ${seed}`];
    for (let y = 1; y <= years; y++) {
      const ms: number[] = [];
      for (let i = 0; i < 365; i++) {
        const t = performance.now();
        await day(c);
        ms.push(performance.now() - t);
      }
      const w = activeWorld();
      const t = performance.now();
      const bytes = JSON.stringify(w).length;
      const ser = performance.now() - t;
      const active = WRESTLERS.filter((x) => !c.people[x.id]?.retired);
      out.push(`  year ${y}: ${(bytes / 1024).toFixed(0)} KB (serialised ${ser.toFixed(0)} ms) · ${w.history.shows.length} shows archived · `
        + `${WRESTLERS.length} wrestlers (${active.length} active, ${active.filter((x) => x.promotion === 'TIS').length} indie) · `
        + `day ${pct(ms, 0.5).toFixed(1)} ms median, ${pct(ms, 0.95).toFixed(1)} p95`);
    }
    console.log(out.join('\n'));
  }
}, 3600000);
