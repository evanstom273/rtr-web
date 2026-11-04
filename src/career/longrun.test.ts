// The world over years with the quick stand-in sim (opt-in, slow).
// LONG=1 npx vitest run src/career/longrun.test.ts  [YEARS=3 SEEDS=7,11,23]
import { it } from 'vitest';
import { fansTotal, fmtFans, globalScore, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { addDays, weekStart } from './dates';
import { REGION_OF } from './places';
import { begin, day, pct } from './testkit';
import type { Career } from './types';

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
      out.push(...bookingReport(c));
    }
    console.log(out.join('\n'));
  }
}, 3600000);

/** Who's working: indie dates a month over the last year (reported, not asserted: some are meant to struggle). */
function bookingReport(c: Career): string[] {
  const H = activeWorld().history;
  const from = addDays(c.today, -365);
  const year = H.shows.filter((x) => x.date >= from);
  const count = (since: string) => {
    const m = new Map<string, number>();
    for (const sh of year) if (sh.date >= since) for (const b of sh.bouts) for (const id of [b.a, b.b]) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };
  const yr = count(from), d60 = count(addDays(c.today, -60)), d120 = count(addDays(c.today, -120));
  const indies = WRESTLERS.filter((x) => x.promotion === 'TIS' && !c.people[x.id]?.retired && x.id !== c.player);
  const signed = WRESTLERS.filter((x) => x.promotion !== 'TIS' && !c.people[x.id]?.retired);
  const perMonth = (xs: typeof indies) => xs.map((x) => ((yr.get(x.id) ?? 0) * 30) / 365);
  const f = (xs: number[]) => `p10 ${pct(xs, 0.1).toFixed(1)} · median ${pct(xs, 0.5).toFixed(1)} · p90 ${pct(xs, 0.9).toFixed(1)}`;
  const idle = (xs: typeof indies, m: Map<string, number>) => `${Math.round((xs.filter((x) => !m.has(x.id)).length / Math.max(1, xs.length)) * 100)}%`;
  const byPop = [...indies].sort((a, b) => globalScore(a) - globalScore(b));
  const q = (i: number) => byPop.slice(Math.floor((byPop.length * i) / 4), Math.floor((byPop.length * (i + 1)) / 4));
  const weeks = new Map<string, number>();
  for (const sh of year) if (sh.promo === 'TIS' && !sh.promos?.length) weeks.set(weekStart(sh.date), (weeks.get(weekStart(sh.date)) ?? 0) + 1);
  const wk = [...weeks.values()];
  const regions = ['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'];
  const regionShows = regions.map((r) => `${r} ${year.filter((sh) => sh.promo === 'TIS' && (REGION_OF[sh.country] ?? 'europe') === r).length}`).join(', ');
  return [
    `    indie dates a month: ${f(perMonth(indies))}; none in 60 days ${idle(indies, d60)}, in 120 days ${idle(indies, d120)}`,
    `    by popularity quarter (low → high), dates a month: ${[0, 1, 2, 3].map((i) => pct(perMonth(q(i)), 0.5).toFixed(1)).join(' · ')}; none in 120 days: ${[0, 1, 2, 3].map((i) => idle(q(i), d120)).join(' · ')}`,
    `    signed dates a month: ${f(perMonth(signed))}; none in 60 days ${idle(signed, d60)}`,
    `    indie shows a week: min ${Math.min(...wk)} · median ${pct(wk, 0.5)} · max ${Math.max(...wk)}; by region a year: ${regionShows}`,
    `    fans worldwide: signed p10 ${fmtFans(pct(signed.map(fansTotal), 0.1))} · median ${fmtFans(pct(signed.map(fansTotal), 0.5))} · max ${fmtFans(Math.max(...signed.map(fansTotal)))}; indies median ${fmtFans(pct(indies.map(fansTotal), 0.5))} · p90 ${fmtFans(pct(indies.map(fansTotal), 0.9))} · max ${fmtFans(Math.max(...indies.map(fansTotal)))}`,
  ];
}
