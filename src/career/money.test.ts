import { describe, expect, it } from 'vitest';
import { fansTotal, findWrestler } from '../data/rtr';
import { C } from './clauses';
import { addDays, addMonths } from './dates';
import { advanceAvailable, leaveContract, makeOffer, rebrand, signOffer, takeAdvance } from './index';
import { begin, day } from './testkit';
import type { Career } from './types';

const k = (c: Career) => c.people[c.player]!.contract!;
// Before tax and the agent (Life): what was paid, not what reached the bank.
const got = (c: Career, re: RegExp) => c.ledger.filter((e) => re.test(e.text)).reduce((t, e) => t + (e.gross ?? e.amount), 0);
const days = async (c: Career, n: number) => { for (let i = 0; i < n; i++) await day(c); };

describe('the money clauses (Lyra’s design)', () => {
  it('Signing Bonus: paid when you sign, by tier', () => {
    const c = begin('@indie');
    makeOffer(c, 'TCG', 'Test');
    const o = c.offers.find((x) => x.promo === 'TCG')!;
    o.clauses[C.signing] = 2;
    const before = c.money;
    signOffer(c, o);
    expect(got(c, /^Signing bonus/)).toBe(o.fee * 5);
    const line = c.ledger.find((e) => /^Signing bonus/.test(e.text))!;
    expect(c.money).toBeGreaterThanOrEqual(before + o.fee * 5 - (line.tax ?? 0) - (line.agent ?? 0));
  });

  it('Advances: only when you’re skint, paid back out of your fees with interest', async () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.signing] = 1;
    c.money = k(c).fee * 3;
    expect(advanceAvailable(c).amount).toBe(0);
    c.money = -500;
    const a = advanceAvailable(c);
    expect(a.amount).toBe(k(c).fee * 2);
    expect(a.owed).toBeGreaterThan(a.amount);
    takeAdvance(c);
    expect(k(c).advance).toBe(a.owed);
    await days(c, 30);
    expect(got(c, /^Advance repayment/)).toBeLessThan(0);
    expect(k(c).advance ?? 0).toBeLessThan(a.owed);
  });

  it('Performance Bonuses pay for the triggers you picked; Profit Share pays a cut of the takings', async () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.bonuses] = 3;
    k(c).triggers = ['great', 'main', 'big', 'title'];
    k(c).clauses[C.profit] = 3;
    await days(c, 40);
    expect(got(c, /^Bonus ·/)).toBeGreaterThan(0);
    expect(got(c, /^Profit share/)).toBeGreaterThan(0);
  });

  it('Guaranteed Pay Tier 3: guaranteed paid dates on PPA; Merchandise Rights: a cut of their online store', async () => {
    const c = begin('jamie_mercer');
    k(c).pay = 'ppa';
    k(c).clauses[C.guaranteed] = 3;
    k(c).clauses[C.merch] = 2;
    k(c).start = addMonths(c.today, -2);
    // Keep you off their cards so the month comes in short.
    c.people[c.player]!.daysOff = Array.from({ length: 70 }, (_, i) => addDays(c.today, i));
    await days(c, 60);
    expect(got(c, /^Guaranteed dates/)).toBeGreaterThan(0);
    expect(got(c, /^Online store cut/)).toBeGreaterThan(0);
  });

  it('a Monthly salary comes on the first, booked or not (Lyra’s call: always)', async () => {
    const c = begin('jamie_mercer');
    k(c).pay = 'monthly';
    k(c).start = addMonths(c.today, -2);
    c.people[c.player]!.daysOff = Array.from({ length: 70 }, (_, i) => addDays(c.today, i));
    await days(c, 60);
    expect(got(c, /^Salary · /)).toBeGreaterThanOrEqual(2 * k(c).fee * 1);
  });

  it('Wage Matching: a yearly raise; Loyalty: a bonus for years served and protection from release', async () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.wage] = 2;
    k(c).clauses[C.loyalty] = 2;
    k(c).start = addMonths(c.today, -12);
    k(c).since = addMonths(c.today, -37);
    const fee = k(c).fee;
    await days(c, 2);
    expect(k(c).fee).toBeGreaterThan(fee);
    expect(got(c, /^Loyalty bonus · 3 years/)).toBeGreaterThan(0);
  });

  it('Image Rights: leave without them and you rebrand, losing fans; Licensed keeps the name', () => {
    const c = begin('jamie_mercer');
    const me = findWrestler(c.player)!;
    const name = me.name;
    const fans = fansTotal(me);
    k(c).clauses[C.image] = 0;
    k(c).clauses[C.exit] = 3;
    k(c).since = addMonths(c.today, -36);
    leaveContract(c);
    expect(c.rebrand?.old).toBe(name);
    expect(fansTotal(me)).toBeLessThan(fans * 0.85);
    expect(rebrand(c, name === 'Nova' ? 'Comet' : 'Nova')).toMatch(/you’re/);
    expect(c.rebrand).toBeUndefined();
    const c2 = begin('jamie_mercer');
    k(c2).clauses[C.image] = 2;
    k(c2).clauses[C.exit] = 3;
    leaveContract(c2);
    expect(c2.rebrand).toBeUndefined();
  });
});
