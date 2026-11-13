import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bringBack } from '../cut.testkit';
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
import { band, legHalves, tripCost, tripFatigue } from './travel';
import { seizeHome } from './homes';

// The big cut hid this; the tests bring it back so the code keeps working.
let putBack = (): void => {};
beforeEach(() => { putBack = bringBack(); });
afterEach(() => putBack());

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
    // The shared room is today's living cost in an average European city (other cities by their price): £220 × 2.5 since the pay rework.
    expect(PB.rent.room.rent + PB.rent.room.bills).toBe(550);
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
    L.months = { [c.today.slice(0, 7)]: 1_000_000 };
    c.money = 500_000;
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
    c.money = 60_000_000;
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
    expect(tripCost(c, { country: 'USA' })).toBe(625);
    expect(c.life).toBeUndefined();
  });
});

describe('Life stage 2: staff, medical and entrances', () => {
  it('an entrance raises the crowd’s heat at the bell; pyro only at the top of the card or with the contract term', async () => {
    const { boutRules } = await import('../career');
    const { MatchEngine } = await import('../../engine/match');
    const { buyGear, setGearUse, entranceFor } = await import('./staff');
    const c = begin('@indie');
    c.money = 100_000;
    buyGear(c, 'theme'); buyGear(c, 3);
    setGearUse(c, 'pyro', true);
    const show = Object.values(c.shows).find((s) => s.promo === 'TIS')!;
    const opp = Object.keys(c.people).find((id) => id !== c.player && findWrestler(id))!;
    const top = { a: c.player, b: opp }, under = { a: c.player, b: opp };
    show.card = [under, { a: opp, b: opp }, top];
    expect(entranceFor(c, show, top).heat).toBe(PB.entrance.theme.heat + PB.entrance.gear[2]!.heat + PB.entrance.pyro.heat);
    expect(entranceFor(c, show, under).heat).toBe(PB.entrance.theme.heat + PB.entrance.gear[2]!.heat);
    const rules = boutRules(c, show, top, c.player, opp, false);
    expect(rules.entrance?.side).toBe('you');
    const e = new MatchEngine({ you: c.player, them: opp, seed: 3, rules });
    const plain = new MatchEngine({ you: c.player, them: opp, seed: 3, rules: { ...rules, entrance: undefined } });
    expect(e.state.heat - plain.state.heat).toBe(rules.entrance!.heat);
    expect(e.state.log.some((l) => l.segs.some((x) => /The lights go down/.test(x.v)))).toBe(true);
    expect(plain.state.log.some((l) => l.segs.some((x) => /The lights go down/.test(x.v)))).toBe(false);
  });

  it('staff cost wages on the 1st and do their jobs; a surgeon gets you back sooner', async () => {
    const { hire, monthlyStaff, seeSurgeon, wageOf } = await import('./staff');
    const { mod } = await import('../career');
    const c = begin('@indie');
    c.money = 100_000;
    expect(mod('rehab', c, c.player)).toBe(1);
    hire(c, 'physio'); hire(c, 'trainer');
    expect(mod('rehab', c, c.player)).toBeCloseTo(0.8);
    expect(mod('wear', c, c.player)).toBeCloseTo(1.5);
    expect(mod('trainGain', c, c.player)).toBeGreaterThan(1.1);
    const before = c.money;
    monthlyStaff(c);
    expect(before - c.money).toBe(wageOf(c, 'physio') + wageOf(c, 'trainer'));
    c.people[c.player]!.injury = { what: 'a torn bicep', until: addDays(c.today, 60) };
    expect(seeSurgeon(c)).toMatch(/sooner/);
    expect(c.people[c.player]!.injury!.until < addDays(c.today, 60)).toBe(true);
  });

  it('with a driver, road trips cost no fatigue', () => {
    const c = begin('@indie');
    c.money = 100_000;
    life(c).city = 'London'; c.base = 'UK';
    buyVehicle(c, 'car', false);
    const leeds = { country: 'UK', city: 'Leeds' };
    expect(tripFatigue(c, leeds)).toBe(PB.trip.short.fatigue);
    life(c).staff = [{ role: 'driver', name: 'Sam', since: c.today }];
    expect(tripFatigue(c, leeds)).toBe(0);
  });
});
