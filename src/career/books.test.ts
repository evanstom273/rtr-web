// Booker mode, stage 4 (Lyra's design): full books for every company; your money and the company's; tiers moving;
// TV and sponsors; going bust.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROMOTIONS, rosterOf, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { borrow, closeCompany, invest, setWage, withdraw } from './books';
import { companyOf, foundPromotion, rolesOf, takeRole } from './company';
import { replyTo } from './mail';
import { begin, day, quick } from './testkit';
import { BIZ, FEATURES } from './tuning';
import type { Career, Show } from './types';

let was = false;
beforeEach(() => { was = FEATURES.booker; FEATURES.booker = true; });
afterEach(() => { FEATURES.booker = was; });

const own = (c: Career) => { c.money = 50_000; foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 5000, night: { every: 'weekly', day: 'Saturday' } }); };
const next = (c: Career): Show => Object.values(c.shows).filter((s) => s.promo === 'NLW' && !s.done && s.date > c.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
const toMonthEnd = async (c: Career) => { const m = c.today.slice(0, 7); while (c.today.slice(0, 7) === m) await day(c, quick, 'simmed'); };

describe('booker mode: the books', () => {
  it('a show is settled: the gate and merch in, free agents, venue and production out; the office tells you', async () => {
    const c = begin('@indie', 7);
    own(c);
    const show = next(c);
    const co = companyOf('NLW')!;
    while (!show.done) await day(c, quick, 'simmed');
    await day(c, quick, 'simmed');
    expect(show.books).toBeTruthy();
    expect(show.books!.sold).toBeGreaterThan(0);
    expect(show.books!.sold).toBeLessThanOrEqual(show.books!.cap);
    expect(co.month?.gate ?? co.books?.at(-1)?.lines.gate).toBeGreaterThan(0);
    expect((co.month?.fees ?? 0) + (co.books?.at(-1)?.lines.fees ?? 0)).toBeGreaterThan(0);
    expect(c.letters.some((l) => l.body.some((b) => b.includes('Took £')))).toBe(true);
  });

  it('every company’s month closes; the AI majors make money', async () => {
    const c = begin('@indie', 7);
    await toMonthEnd(c);
    await toMonthEnd(c);
    for (const p of PROMOTIONS.filter((x) => !x.indie)) {
      const co = companyOf(p.initials)!;
      expect(co.books?.length).toBeGreaterThan(0);
      expect(co.closed).toBeUndefined();
    }
    const vwf = companyOf('VWF')!.books!.at(-1)!.lines;
    expect((vwf.gate ?? 0) + (vwf.tv ?? 0)).toBeGreaterThan((vwf.wages ?? 0) + (vwf.production ?? 0) + (vwf.venue ?? 0));
  });

  it('your money and the company’s: put in, take out (if it has it), a wage, a loan', () => {
    const c = begin('@indie', 7);
    own(c);
    const co = companyOf('NLW')!;
    expect(invest(c, 'NLW', 10_000)).toContain('into');
    expect(co.bank).toBe(15_000);
    expect(c.money).toBe(35_000);
    expect(withdraw(c, 'NLW', 20_000)).toContain('hasn’t got');
    expect(withdraw(c, 'NLW', 5000)).toContain('out of');
    expect(setWage(c, 'NLW', 800)).toContain('800');
    expect(borrow(c, 'NLW', 1_000_000)).toContain('up to');
    expect(borrow(c, 'NLW', 10_000)).toContain('a month');
    expect(co.loan!.left).toBeGreaterThan(10_000);
    expect(borrow(c, 'NLW', 5000)).toContain('Pay off');
    // Someone else's: not yours to touch.
    takeRole(c, 'IVW', 'booker');
    expect(invest(c, 'IVW', 100)).toContain('isn’t yours');
  });

  it('a booker’s salary comes monthly; an owner’s wage too', async () => {
    const c = begin('@indie', 7);
    own(c);
    setWage(c, 'NLW', 300);
    takeRole(c, 'IVW', 'booker');
    await toMonthEnd(c);
    expect(c.ledger.some((e) => e.text.includes('IVW booker’s salary') && e.amount === BIZ.salary.national)).toBe(true);
    expect(c.ledger.some((e) => e.text.includes('NLW owner’s wage'))).toBe(true);
  });

  it('too long past the overdraft and it closes: the roster goes free, the shows are off', async () => {
    const c = begin('@indie', 7);
    own(c);
    const co = companyOf('NLW')!;
    for (let m = 0; m < BIZ.redMonths.player && !co.closed; m++) { co.bank = -BIZ.overdraft.local! - 1000; await toMonthEnd(c); }
    expect(co.closed).toBeTruthy();
    expect(PROMOTIONS.find((p) => p.initials === 'NLW')!.closed).toBeTruthy();
    expect(Object.values(c.shows).some((s) => s.promo === 'NLW' && !s.done)).toBe(false);
    expect(rolesOf(c)).toEqual([]);
    expect(c.letters.some((l) => l.subject.includes('has closed'))).toBe(true);
    // An AI major can go too, and its roster goes free.
    const roster = rosterOf('UFC').map((w) => w.id);
    closeCompany(c, 'UFC', 'test');
    expect(rosterOf('UFC').length).toBe(0);
    expect(roster.every((id) => WRESTLERS.find((w) => w.id === id)!.promotion !== 'UFC')).toBe(true);
  });

  it('popularity, money and a roster take it up a tier; TV comes calling', async () => {
    const c = begin('@indie', 7);
    own(c);
    const co = companyOf('NLW')!;
    const p = PROMOTIONS.find((x) => x.initials === 'NLW')!;
    p.popularity = 35; co.bank = 60_000; co.rep = 3.4;
    for (const w of WRESTLERS.filter((x) => x.promotion === 'TIS' && x.id !== c.player).slice(0, BIZ.up.regional!.roster)) w.promotion = 'NLW';
    await toMonthEnd(c);
    expect(co.tier).toBe('regional');
    expect(c.letters.some((l) => l.subject.includes('goes regional'))).toBe(true);
    for (let i = 0; i < 4 && !c.letters.some((l) => l.ctx?.tvFor === 'NLW'); i++) { co.rep = 3.4; await toMonthEnd(c); }
    const tv = c.letters.find((l) => l.ctx?.tvFor === 'NLW');
    expect(tv).toBeTruthy();
    expect(replyTo(c, tv!.id, 'tv_yes')).toContain('on ');
    expect(co.tv?.fee).toBeGreaterThan(0);
    void activeWorld;
  });
});
