import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWrestler } from '../../data/rtr';
import { marketIdx } from '../../world/lifeWorld';
import { spend } from '../career';
import { addDays } from '../dates';
import { relocate } from '../day';
import { begin as kitBegin, day } from '../testkit';
import { FEATURES, PRICE_BOOK as PB } from '../tuning';
import { buyVehicle } from './garage';
import { buyHome, homeValue, letHome, monthlyHomes, rentWeek, switchTo, weeklyHome } from './homes';
import { monthlyLoans } from './loans';
import { hireAgent, taxOn } from './money';
import { life, liveHome } from './state';
import { band, legHalves, tripCost } from './travel';
import { seizeHome } from './homes';

const was = FEATURES.life;
/** A career with Life on, whatever LIFE_ON / LIFE_OFF say. */
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { life: boolean }).life = true; return c; };
beforeEach(() => { (FEATURES as { life: boolean }).life = true; });
afterEach(() => { (FEATURES as { life: boolean }).life = was; });

describe('Life: homes', () => {
  it('you start renting where you live: a shared room on the indies, about what living costs were', () => {
    const c = begin('@indie');
    const h = liveHome(c);
    expect(h.own).toBe(false);
    expect(h.tier).toBe('room');
    expect(c.base).toBe(h.country);
    // The shared room is today's living cost in an average European city (other cities by their price).
    expect(PB.rent.room.rent + PB.rent.room.bills).toBe(220);
    c.livingFrom = c.today;
    let monday = c.today;
    while (new Date(`${monday}T12:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
    const before = c.money;
    c.today = monday;
    weeklyHome(c, monday);
    expect(before - c.money).toBe(rentWeek('room', h.city));
    expect(c.ledger[0]!.kind).toBe('rent');
  });

  it('buy with a mortgage: deposit and fees now, repayments on the 1st; three missed and it’s taken', () => {
    const c = begin('@indie');
    const L = life(c);
    // A star's earnings, so the bank will lend.
    L.months = { [c.today.slice(0, 7)]: 400_000 };
    c.money = 200_000;
    const city = L.city;
    const r = buyHome(c, city, 'house', true);
    expect(r.ok).toBe(true);
    const loan = L.loans[0]!;
    const h = L.homes.find((x) => x.id === r.id)!;
    expect(h.own).toBe(true);
    expect(loan.left).toBe(Math.round(h.paid! * (1 - 0.15)));
    expect(loan.monthly).toBeGreaterThan(1000);
    // Pay one.
    const before = c.money;
    monthlyLoans(c, () => 0);
    expect(before - c.money).toBe(loan.monthly);
    // Skint: three missed and it's gone.
    c.money = 0;
    for (let i = 0; i < 3; i++) monthlyLoans(c, (cc, l) => seizeHome(cc, l.on));
    expect(L.homes.some((x) => x.id === r.id)).toBe(false);
    expect(L.loans.length).toBe(0);
    expect(L.credit).toBeLessThan(PB.credit.start);
    expect(c.letters.some((l) => /Repossessed/.test(l.subject))).toBe(true);
  });

  it('switching to a home you own is instant; letting one pays monthly', () => {
    const c = begin('@indie');
    c.money = 2_000_000;
    const L = life(c);
    const a = buyHome(c, 'Manchester', 'flat', false), b = buyHome(c, 'Tokyo', 'flat', false);
    expect(a.ok && b.ok).toBe(true);
    expect(switchTo(c, a.id!)).toMatch(/living/);
    expect(L.city).toBe('Manchester');
    expect(c.base).toBe('UK');
    // The rented room's given up.
    expect(L.homes.filter((x) => !x.own)).toHaveLength(0);
    expect(switchTo(c, b.id!)).toMatch(/living/);
    expect(c.base).toBe('Japan');
    expect(letHome(c, a.id!, true)).toMatch(/Let out/);
    const before = c.money;
    c.today = '2026-12-01';
    monthlyHomes(c);
    expect(c.ledger.some((e) => /Rent in|Empty this month/.test(e.text))).toBe(true);
    expect(homeValue(L.homes.find((x) => x.id === a.id)!)).toBeGreaterThan(0);
    void before;
  });

  it('moving to another city: three days, then you rent there', async () => {
    const c = begin('@indie');
    c.money = 10_000;
    const from = life(c).city;
    const to = from === 'Chicago' ? 'Atlanta' : 'Chicago';
    expect(relocate(c, 'USA', 0, { city: to, tier: 'flat' })).toMatch(/Moving to/);
    for (let i = 0; i < 4; i++) await day(c);
    expect(life(c).city).toBe(to);
    expect(liveHome(c).tier).toBe('flat');
    expect(life(c).homes.filter((h) => h.use === 'live')).toHaveLength(1);
  }, 60_000);

  it('markets move: a city’s index changes month to month', async () => {
    const c = begin('@indie');
    life(c);
    const city = life(c).city;
    const before = marketIdx(city);
    for (let i = 0; i < 40; i++) await day(c);
    expect(marketIdx(city)).not.toBe(before);
  }, 120_000);
});

describe('Life: tax and the agent', () => {
  it('banded tax on what you’ve earned this year: nothing on indie money, about 38% for a star', () => {
    const c = begin('@indie');
    const L = life(c);
    L.city = 'Manchester';
    expect(taxOn(c, 14_000)).toBe(0);
    L.tax = { year: c.today.slice(0, 4), earned: 0, paid: 0 };
    const star = taxOn(c, 1_300_000) / 1_300_000;
    expect(star).toBeGreaterThan(0.36);
    expect(star).toBeLessThan(0.4);
  });

  it('tax rides on the payment’s own line; the agent only takes contract money, never indie fees', () => {
    const c = begin('@indie');
    const L = life(c);
    L.tax = { year: c.today.slice(0, 4), earned: 100_000, paid: 0 };
    findWrestler(c.player)!.fans.northAmerica = 50_000;
    expect(hireAgent(c, 'local')).toMatch(/agent now/);
    const n = c.ledger.length;
    spend(c, 1000, 'An indie date', 'fee');
    expect(c.ledger.length).toBe(n + 1);
    expect(c.ledger[0]!.gross).toBe(1000);
    expect(c.ledger[0]!.agent).toBe(0);
    expect(c.ledger[0]!.tax).toBeGreaterThan(0);
    // Not a deal they did: no cut.
    spend(c, 1000, 'A contract date', 'fee', { contract: true });
    expect(c.ledger[0]!.agent).toBe(0);
    // Signed through them: their 10%.
    c.people[c.player]!.contract = { promo: 'VWF', start: c.today, end: addDays(c.today, 365), fee: 1000, clauses: [], agent: true } as never;
    spend(c, 1000, 'A contract date', 'fee', { contract: true });
    expect(c.ledger[0]!.agent).toBe(100);
    expect(c.ledger[0]!.amount).toBe(1000 - 100 - c.ledger[0]!.tax!);
  });
});

describe('Life: getting about', () => {
  it('a jet makes a Japan-to-UK back-to-back fit that the bus and economy can’t', () => {
    const c = begin('@indie');
    c.money = 30_000_000;
    life(c).city = 'London';
    c.base = 'UK';
    const tokyo = { country: 'Japan', city: 'Tokyo' }, london = { country: 'UK', city: 'London' };
    expect(band(tokyo, london)).toBe('abroad');
    const slow = legHalves(c, tokyo, london, '2026-12-10', false);
    expect(slow).toHaveLength(2);
    expect(buyVehicle(c, 'jet', false).ok).toBe(true);
    const fast = legHalves(c, tokyo, london, '2026-12-10', false);
    expect(fast).toEqual([['2026-12-10', 'am']]);
    expect(tripCost(c, tokyo)).toBe(0);
  });

  it('a car makes road trips cheaper; a short trip is a morning, a local one is nothing', () => {
    const c = begin('@indie');
    c.money = 50_000;
    life(c).city = 'London';
    c.base = 'UK';
    const leeds = { country: 'UK', city: 'Leeds' }, london = { country: 'UK', city: 'London' };
    expect(band(london, leeds)).toBe('short');
    expect(tripCost(c, leeds)).toBe(PB.trip.short.cost);
    buyVehicle(c, 'car', false);
    expect(tripCost(c, leeds)).toBe(PB.trip.short.road);
    expect(tripCost(c, london)).toBe(0);
    expect(legHalves(c, london, leeds, '2026-12-10', false)).toEqual([['2026-12-10', 'am']]);
  });

  it('with Life off, travel is today’s rules, from where you live (not where you were born)', () => {
    const c = kitBegin('@indie');
    (FEATURES as { life: boolean }).life = false;
    c.base = 'Japan';
    expect(tripCost(c, { country: 'Japan' })).toBe(0);
    expect(tripCost(c, { country: 'USA' })).toBe(250);
    expect(c.life).toBeUndefined();
  });
});
