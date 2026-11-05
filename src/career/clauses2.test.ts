import { describe, expect, it } from 'vitest';
import { findWrestler, rosterOf, TITLES } from '../data/rtr';
import { HARDCORE_STIPS } from './booker';
import { C } from './clauses';
import { addDays, addMonths } from './dates';
import { announceRetirement, bookHoliday, mod, noShow, setPartTime, socialAct, takeOption } from './index';
import { begin, day } from './testkit';
import type { Career } from './types';

const k = (c: Career) => c.people[c.player]!.contract!;
// Before tax and the agent (Life): what was paid, not what reached the bank.
const got = (c: Career, re: RegExp) => c.ledger.filter((e) => re.test(e.text)).reduce((t, e) => t + (e.gross ?? e.amount), 0);
const days = async (c: Career, n: number) => { for (let i = 0; i < n; i++) await day(c); };
const myBouts = (c: Career) => Object.values(c.shows).flatMap((s) => (s.card ?? []).filter((b) => b.a === c.player || b.b === c.player).map((b) => ({ s, b })));

describe('body and schedule clauses (Lyra’s design)', () => {
  it('Training & Development: cheaper, then free with coaching, then faster recovery and rehab', () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.training] = 0;
    expect(mod('trainPrice', c, c.player)).toBe(1);
    k(c).clauses[C.training] = 1;
    expect(mod('trainPrice', c, c.player)).toBe(0.75);
    k(c).clauses[C.training] = 2;
    expect(mod('trainPrice', c, c.player)).toBe(0);
    expect(mod('trainGain', c, c.player)).toBeGreaterThan(1);
    k(c).clauses[C.training] = 3;
    expect(mod('recovery', c, c.player)).toBeGreaterThan(1);
    expect(mod('rehab', c, c.player)).toBeLessThan(1);
  });

  it('Match Conditions: no hardcore stipulations for you from Tier 1', async () => {
    const c = begin('jamie_mercer', 3);
    k(c).clauses[C.conditions] = 1;
    await days(c, 40);
    const hard = myBouts(c).filter(({ s, b }) => s.promo !== 'TIS' && b.stip && HARDCORE_STIPS.has(b.stip));
    expect(hard).toHaveLength(0);
  });

  it('Travel: without the clause you pay your own way; long trips tire you', async () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.travel] = 0;
    await days(c, 30);
    const abroad = c.history.some((m) => !m.indie && c.shows[m.show] && c.shows[m.show]!.country !== findWrestler(c.player)!.country);
    if (abroad) expect(got(c, /your own way/)).toBeLessThan(0);
  });

  it('Medical Pay Tier 2+: a deal ending while you’re injured runs on', async () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.medical] = 2;
    k(c).end = addDays(c.today, 1);
    const until = addDays(c.today, 20);
    c.people[c.player]!.injury = { until, what: 'test' };
    await days(c, 3);
    expect(c.people[c.player]!.contract?.end).toBe(addDays(until, 14));
  });

  it('Schedule Flexibility: a holiday week keeps you off cards; part-time caps your dates', async () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.schedule] = 2;
    expect(bookHoliday(c, addDays(c.today, 8))).toMatch(/Holiday booked/);
    expect(c.people[c.player]!.daysOff!.length).toBe(7);
    expect(setPartTime(c, true)).toMatch(/part-time/);
    expect(k(c).dates).toBe(4);
    await days(c, 40);
    const month = addDays(c.today, -5).slice(0, 7);
    expect(myBouts(c).filter(({ s }) => s.promo === k(c).promo && s.date.startsWith(month)).length).toBeLessThanOrEqual(4);
  });
});

describe('career shape (Lyra’s design)', () => {
  it('Booking Commitments: the booker keeps you busy, never the opener', async () => {
    const c = begin('jamie_mercer', 5);
    k(c).clauses[C.booking] = 2;
    await days(c, 30);
    const mine = myBouts(c).filter(({ s }) => s.promo === k(c).promo && s.card!.length > 2);
    expect(mine.length).toBeGreaterThanOrEqual(3);
    for (const { s, b } of mine) expect(s.card!.indexOf(b)).toBeGreaterThanOrEqual(Math.floor(s.card!.length / 2));
  });

  it('Contract options: yours to take (Tier 1+) in the last six months', () => {
    const c = begin('jamie_mercer');
    k(c).clauses[C.renewal] = 0;
    expect(takeOption(c)).toMatch(/to them/);
    k(c).clauses[C.renewal] = 2;
    k(c).end = addMonths(c.today, 3);
    const end = k(c).end;
    expect(takeOption(c)).toMatch(/Option taken/);
    expect(k(c).end).toBe(addMonths(end, 12));
  });

  it('Retirement & Legacy Tier 3: a farewell, then the career ends with a pension', async () => {
    const c = begin('jamie_mercer', 4);
    for (const t of TITLES) if (t.holder === c.player) t.holder = null;
    k(c).clauses[C.retirement] = 3;
    expect(announceRetirement(c)).toMatch(/last day/);
    const last = c.people[c.player]!.retiring!;
    expect(Object.values(c.shows).some((s) => s.special?.kind === 'farewell' && s.special.for === c.player)).toBe(true);
    while (c.today <= addDays(last, 2)) await day(c);
    expect(c.over).toBeTruthy();
    expect(got(c, /^Pension/)).toBeGreaterThan(0);
  });
});

describe('behaviour (Lyra’s design)', () => {
  it('No-shows: off the card, fined by Conduct, and three in 90 days is a suspension', async () => {
    const c = begin('jamie_mercer', 6);
    k(c).clauses[C.conduct] = 0;
    let n = 0;
    for (let i = 0; i < 60 && n < 3; i++) {
      const b = myBouts(c).find(({ s, b }) => s.date === c.today && !b.result && s.promo !== 'TIS');
      if (b) { noShow(c, b.s.id); n++; }
      await day(c);
    }
    expect(n).toBe(3);
    expect(got(c, /^Fined by/)).toBeLessThan(0);
    expect(c.people[c.player]!.suspendedUntil).toBeTruthy();
  });

  it('Social Media Policy: going after their roster costs you without it, nothing with Free Rein', () => {
    const c = begin('jamie_mercer');
    const them = rosterOf(k(c).promo).find((w) => w.id !== c.player)!;
    k(c).clauses[C.social] = 0;
    const before = c.money;
    socialAct(c, 'beef', them.id);
    expect(c.money).toBeLessThan(before);
    const c2 = begin('jamie_mercer');
    k(c2).clauses[C.social] = 2;
    const b2 = c2.money;
    socialAct(c2, 'beef', them.id);
    expect(c2.money).toBe(b2);
  });
});
