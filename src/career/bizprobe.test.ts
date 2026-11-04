// The books over months (opt-in): every company's money, month by month, to tune the business numbers.
// BIZ=1 npx vitest run src/career/bizprobe.test.ts  [MONTHS=6]
import { it } from 'vitest';
import { PROMOTIONS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { begin, day, quick } from './testkit';
import { FEATURES } from './tuning';
import { foundPromotion } from './company';

it.skipIf(!process.env.BIZ)('the books over months', async () => {
  FEATURES.booker = true;
  const c = begin('@indie', 7);
  c.money = 20_000;
  foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 5000, night: { every: 'weekly', day: 'Saturday' } });
  const months = Number(process.env.MONTHS ?? 6);
  for (let i = 0; i < months * 30; i++) await day(c, quick, 'simmed');
  const cos = activeWorld().companies!;
  for (const p of PROMOTIONS.filter((x) => !x.indie)) {
    const co = cos[p.initials]!;
    const rows = (co.books ?? []).map((b) => {
      const inn = ['gate', 'merch', 'ppv', 'tv', 'sponsors'].reduce((t, l) => t + (b.lines[l] ?? 0), 0);
      const out = ['wages', 'fees', 'venue', 'production', 'travel', 'insurance', 'staff', 'salary', 'repay'].reduce((t, l) => t + (b.lines[l] ?? 0), 0);
      return `${b.m}: in ${Math.round(inn / 1000)}k out ${Math.round(out / 1000)}k`;
    });
    const last = co.books?.at(-1)?.lines ?? {};
    console.log(`${p.initials} ${co.tier} pop ${p.popularity} bank ${Math.round(co.bank / 1000)}k rep ${co.rep} ${co.closed ? 'CLOSED' : ''}\n  ${rows.join(' · ')}\n  last: ${Object.entries(last).map(([k, v]) => `${k} ${Math.round(v / 1000)}k`).join(', ')}`);
  }
}, 3_600_000);
