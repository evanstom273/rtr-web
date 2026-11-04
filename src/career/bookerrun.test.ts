// Booker mode over years (opt-in, slow): the companies' money and tiers, closures, startups and merges, rosters,
// your own promotion booked by its staff, the time a day takes and the save's size.
// BOOKER=1 npx vitest run src/career/bookerrun.test.ts  [YEARS=3 SEEDS=7]
import { expect, it } from 'vitest';
import { PROMOTIONS, rosterOf } from '../data/rtr';
import { activeWorld } from '../world/world';
import { foundPromotion } from './company';
import { candidates, hire } from './morale';
import { begin, day, quick } from './testkit';
import { FEATURES } from './tuning';

it.skipIf(!process.env.BOOKER)('booker mode over years', async () => {
  FEATURES.booker = true;
  const years = Number(process.env.YEARS ?? 3);
  for (const seed of (process.env.SEEDS ?? '7').split(',').map(Number)) {
    const c = begin('@indie', seed);
    c.money = 30_000;
    foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 10_000, night: { every: 'fortnightly', day: 'Saturday' } });
    hire(c, 'NLW', 'writer', candidates(c, 'NLW', 'writer')[0]!.s.id);
    const out: string[] = [`seed ${seed}`];
    const start = PROMOTIONS.length;
    for (let half = 1; half <= years * 2; half++) {
      const t = performance.now();
      for (let i = 0; i < 182; i++) await day(c, quick, 'simmed');
      const ms = (performance.now() - t) / 182;
      const cos = activeWorld().companies!;
      const rows = PROMOTIONS.filter((p) => !p.indie).map((p) => {
        const co = cos[p.initials]!;
        return `${p.initials}${co.closed ? '✗' : ''} ${co.tier[0]} ${p.popularity} £${Math.round(co.bank / 1000)}k r${rosterOf(p.initials).length}`;
      });
      const nlw = cos.NLW!;
      out.push(`after ${half * 6} months · ${ms.toFixed(1)} ms/day · ${PROMOTIONS.length - start} new · closed ${PROMOTIONS.filter((p) => p.closed).length}`,
        `  ${rows.join(' · ')}`,
        `  NLW: ${nlw.closed ? 'CLOSED' : `${nlw.tier}, popularity ${PROMOTIONS.find((p) => p.initials === 'NLW')?.popularity}, bank £${nlw.bank.toLocaleString('en-GB')}, shows rated ${nlw.rep}`} · save: companies ${(JSON.stringify(cos).length / 1024).toFixed(0)} KB, world ${(JSON.stringify(activeWorld()).length / 1024).toFixed(0)} KB`);
    }
    console.log(out.join('\n'));
    expect(PROMOTIONS.filter((p) => !p.indie && !p.closed).length).toBeGreaterThan(5);
  }
}, 7_200_000);
