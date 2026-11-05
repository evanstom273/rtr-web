import { afterEach, describe, expect, it } from 'vitest';
import { FAN_REGIONS, fansForScore, fansTotal, findWrestler, getPromotion, globalScore, PROMOTIONS, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { activeWorld, freshWorld, raiseToFloor, setWorld } from '../world/world';
import { acceptLetter, attributeTotal, livingCosts, matchPay, spend, trainingPrice, type Career } from './index';
import { feeFloor } from './clauses';
import { addDays, weekday } from './dates';
import { contractFee, indieFee, isWeeklyFlagship, livingCost } from './economy';
import { hashSeed } from '../engine/rng';
import { begin, day, type Runner } from './testkit';
import { FEATURES } from './tuning';
import type { Show } from './types';
import { buyHome, homesValue, letHome, switchTo } from './life/homes';
import { buyVehicle, garageValue } from './life/garage';
import { hireAgent } from './life/money';
import { life } from './life/state';

const setFans = (w: Wrestler, region: (typeof FAN_REGIONS)[number], n: number) => { w.fans[region] = n; };
const nextMonday = (d: string) => { let x = d; while (weekday(x) !== 1) x = addDays(x, 1); return x; };
const DEFAULTS = { ...FEATURES };
afterEach(() => { Object.assign(FEATURES, DEFAULTS); });

describe('pay (Lyra’s calls: about £2,500 a match at the bottom; dates decide income)', () => {
  it('every major promotion pays at least its floor, bigger promotions more, and stars far more', () => {
    begin('@indie');
    const floors = PROMOTIONS.filter((p) => !p.indie).map((p) => [p.initials, feeFloor(p.initials), p.popularity!] as const).sort((a, b) => a[2] - b[2]);
    expect(floors[0]![1]).toBeGreaterThanOrEqual(2500);
    expect(floors[floors.length - 1]![1]).toBeGreaterThanOrEqual(3400);
    for (let i = 1; i < floors.length; i++) expect(floors[i]![1]).toBeGreaterThanOrEqual(floors[i - 1]![1]);
    // Below a roster's median: the floor. The biggest names: several times it, never more than eight.
    for (const p of PROMOTIONS.filter((x) => !x.indie)) {
      const fees = WRESTLERS.filter((w) => w.promotion === p.initials).map((w) => contractFee(w, p.initials)).sort((a, b) => a - b);
      expect(fees[0]).toBe(feeFloor(p.initials));
      expect(fees[fees.length - 1]!).toBeGreaterThan(feeFloor(p.initials));
      expect(fees[fees.length - 1]!).toBeLessThanOrEqual(feeFloor(p.initials) * 8);
    }
    // The same nobody is worth more at TCG than at UFC.
    const nobody = WRESTLERS.find((w) => w.promotion === 'TIS')!;
    expect(contractFee(nobody, 'TCG')).toBeGreaterThan(contractFee(nobody, 'UFC'));
  });

  it('an opening offer never comes in under the promotion’s floor', async () => {
    const c = begin('@indie');
    const { makeOffer } = await import('./index');
    makeOffer(c, 'IVW', 'Test');
    expect(c.offers.at(-1)!.fee).toBeGreaterThanOrEqual(feeFloor('IVW'));
  });

  it('indie fees follow your fans where the show is, the brand, a belt and the night', () => {
    begin('@indie');
    const w = WRESTLERS.find((x) => x.promotion === 'TIS' && !TITLES.some((t) => t.holder === x.id))!;
    const fee = (fans: number, show?: Partial<Show>) => { setFans(w, 'europe', fans); return indieFee(w, { region: 'europe', kind: 'indie', ...show } as Show); };
    expect(fee(500)).toBe(50);
    expect(fee(5000)).toBe(150);
    expect(fee(50000)).toBe(455);
    expect(fee(10)).toBe(30);
    expect(fee(50_000_000)).toBe(1500);
    expect(fee(5000, { special: { kind: 'charity', tag: 'x' } as Show['special'] })).toBe(195);
    // A bigger brand pays more than a small one.
    const brands = Object.values(activeWorld().people!.brands).filter((b) => b.popularity !== undefined).sort((a, b) => a.popularity! - b.popularity!);
    expect(fee(5000, { brand: brands.at(-1)!.id })).toBeGreaterThan(fee(5000, { brand: brands[0]!.id }));
    // An indie champion is worth half as much again.
    const champ = findWrestler(TITLES.find((t) => t.id === 'WORLD_INDEPENDENT_CHAMPIONSHIP')!.holder!)!;
    const plain = WRESTLERS.find((x) => x.promotion === 'TIS' && !TITLES.some((t) => t.holder === x.id) && x.id !== w.id)!;
    plain.fans = { ...champ.fans };
    expect(Math.abs(indieFee(champ, 'europe') - indieFee(plain, 'europe') * 1.5)).toBeLessThanOrEqual(5);
  });

  it('SLN’s weekly Friday flagship pays like a big weekly show, a real flagship two and a half times', () => {
    const k = { promo: 'SLN', start: '', end: '', fee: 3000, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    const friday: Pick<Show, 'kind' | 'promo' | 'date'> = { kind: 'flagship', promo: 'SLN', date: '2026-11-06' };
    expect(isWeeklyFlagship(friday)).toBe(true);
    expect(isWeeklyFlagship({ kind: 'flagship', promo: 'VWF', date: '2026-11-06' })).toBe(false);
    expect(matchPay(k, 'flagship', false, true).pay).toBe(3750);
    expect(matchPay(k, 'flagship', false, false).pay).toBe(7500);
  });

  it('an older save: contracts and open offers below the new floor come up to it, nothing else changes', () => {
    const w = freshWorld(4);
    setWorld(w);
    const c = begin('@indie', 4);
    const low = Object.entries(c.people).find(([, p]) => p.contract)!;
    const [, p] = low;
    p.contract!.fee = 900;
    const high = Object.values(c.people).find((x) => x.contract && x !== p)!;
    high.contract!.fee = 50000;
    c.offers.push({ id: 'o1', promo: 'IVW', day: c.today, fee: 1005, months: 12, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], start: c.today, rounds: 0, said: '', status: 'open' });
    raiseToFloor(activeWorld());
    expect(p.contract!.fee).toBe(feeFloor(p.contract!.promo));
    expect(high.contract!.fee).toBe(50000);
    expect(c.offers.at(-1)!.fee).toBe(feeFloor('IVW'));
  });

  it('lifetime totals keep counting when the ledger drops old entries', () => {
    const c = begin('@indie');
    for (let i = 0; i < 500; i++) spend(c, 10, 'x', 'event');
    expect(c.ledger.length).toBe(400);
    expect(c.totals!.event).toEqual({ amount: 5000, n: 500 });
  });
});

describe('living costs (Lyra’s call: weekly, where you live; switched on with their screens)', () => {
  it('an existing career gets four weeks’ notice, then pays every Monday, never twice for the same one', () => {
    FEATURES.livingCosts = true;
    const c = begin('@indie');
    delete c.livingFrom;
    const mon = nextMonday(addDays(c.today, 1));
    const money = c.money;
    livingCosts(c, mon);
    expect(c.livingFrom).toBe(addDays(mon, 28));
    expect(c.money).toBe(money);
    expect(c.letters[0]!.subject).toMatch(/rent/i);
    const due = c.livingFrom!;
    livingCosts(c, addDays(mon, 7));
    expect(c.money).toBe(money);
    livingCosts(c, due);
    livingCosts(c, due);
    const region = 'northAmerica';
    expect(money - c.money).toBe(livingCost(findWrestler(c.player)!.country === 'USA' ? region : region));
  });

  it('a new career pays from its first Monday, by where it lives', async () => {
    FEATURES.livingCosts = true;
    // The flat living cost (with Life on, it's rent on your home: see life.test.ts).
    const life = FEATURES.life;
    (FEATURES as { life: boolean }).life = false;
    const c = begin('@indie');
    (FEATURES as { life: boolean }).life = false;
    expect(c.livingFrom).toBe(c.today);
    const start = c.money;
    for (let i = 0; i < 8; i++) await day(c);
    const paid = c.ledger.filter((e) => e.kind === 'living');
    expect(paid.length).toBe(1);
    expect(-paid[0]!.amount).toBe(livingCost('northAmerica'));
    expect(c.money).toBeLessThanOrEqual(start + 10000);
    (FEATURES as { life: boolean }).life = life;
  });

  it('switched off, nobody pays rent', async () => {
    FEATURES.livingCosts = false;
    const c = begin('@indie');
    for (let i = 0; i < 15; i++) await day(c);
    expect(c.ledger.some((e) => e.kind === 'living')).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------- ECON=1
// Five lives over two years in the real game (quick matches), living costs on: what they earn, what
// they spend, and what's left. Anything over £1,000 goes on training at today's prices, up to four
// points a week, like the model on the balance sheet (16l). A day job is paid as its weekly wage.

/**
 * Matches for the economy harness: stars from the recalibrated distribution (median 3, 12% at 4★+,
 * 2% at 4.5★+), the winner by draw, and your own match varying from night to night (the test kit's
 * plays yours with one seed, which would make every match of yours the same).
 */
let nightly = 0;
const STAR_Q: [number, number][] = [[0.02, 1.25], [0.1, 2], [0.3, 2.5], [0.5, 3], [0.75, 3.5], [0.88, 4], [0.98, 4.5], [0.999, 5]];
const starsAt = (u: number) => { let s = 0.75; for (const [q, v] of STAR_Q) if (u >= q) s = v; return s; };
const realistic: Runner = async (jobs) => jobs.map((j) => {
  const seed = j.key === 'mine' ? hashSeed(++nightly, 'mine') : j.seed;
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const u = ((seed >>> 0) % 10007) / 10007, h = ((seed >>> 8) % 1000) / 1000;
  const pa = (globalScore(a) + 1) / (globalScore(a) + globalScore(b) + 2);
  return { key: j.key, winner: h < pa ? 'you' : 'them', finish: 'PINFALL', t: 900, stars: starsAt(u), stats: { you: STAT, them: STAT } };
});
const STAT = { movesTried: 20, movesLanded: 12, finTried: 1, finHit: 1, sigTried: 1, sigHit: 1, reversalTries: 5, reversalWins: 2, kickouts: 2, pinTries: 3 };

interface Life { name: string; player: string; setup?: (c: Career, w: Wrestler) => void; acceptPerMonth: number; wage: number; /** Spend spare money on training (the old sink); off for the Life lives. */ training?: boolean; /** Life: buy things on this day of the career. */ at?: number; buy?: (c: Career) => void }

async function live(life: Life, months = 24) {
  const c = begin(life.player, 11);
  FEATURES.livingCosts = true;
  c.livingFrom = c.today;
  const me = findWrestler(c.player)!;
  life.setup?.(c, me);
  // Fans held where they start (the model's assumption; fan growth gets its own stage), and a signed
  // life on a two-year deal so it doesn't drop out of contract halfway.
  const fans = { ...me.fans };
  const k = c.people[c.player]!.contract;
  if (k) k.end = addDays(c.today, 760);
  const startTotal = attributeTotal(me);
  const rows: string[] = [];
  let accepted = 0, month = c.today.slice(0, 7), dates = 0, points = 0;
  const end = addDays(c.today, Math.round(months * 30.44));
  while (c.today < end) {
    const before = c.history.length;
    // Indie offers: take as many as the life takes in a month.
    const offers = c.letters.filter((x) => !x.done && x.action?.type === 'indie')
      .map((l) => ({ l, net: (l.action as { fee: number; travel: number }).fee - (l.action as { fee: number; travel: number }).travel }))
      .filter((o) => o.net > 0).sort((a, b) => b.net - a.net);
    for (const { l } of offers) {
      if (accepted >= life.acceptPerMonth) break;
      if (!acceptLetter(c, l).startsWith('That')) accepted++;
    }
    await day(c, realistic, 'simmed');
    if (life.buy && c.today === addDays(c.startedOn, life.at ?? 0)) life.buy(c);
    me.fans = { ...fans };
    dates += c.history.length - before;
    if (weekday(c.today) === 1) {
      if (life.wage) spend(c, life.wage, 'Day job', 'wage');
      for (let k = 0; k < 4 && life.training !== false && c.money - trainingPrice(attributeTotal(me)) >= 1000; k++) {
        const price = trainingPrice(attributeTotal(me));
        const key = (['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'] as const).find((s) => me.stats[s] < 100);
        if (!key) break;
        me.stats[key]++;
        spend(c, -price, 'Training', 'training');
        points++;
      }
    }
    if (c.today.slice(0, 7) !== month) {
      month = c.today.slice(0, 7);
      accepted = 0;
    }
    if ([90, 182, 365, 547, 730].some((d) => c.today === addDays(c.startedOn, d))) rows.push(`£${Math.round(c.money).toLocaleString('en-GB')}`);
  }
  const by = (k: string) => Math.round(c.totals?.[k as 'fee']?.amount ?? 0);
  // Life: what you own less what you owe.
  const L = c.life;
  const worth = Math.round(c.money + (L ? homesValue(c) + garageValue(c) - L.loans.reduce((t, l) => t + l.left, 0) : 0));
  const life$ = L ? ` · rent £${(-by('rent')).toLocaleString('en-GB')} · homes £${(-by('home')).toLocaleString('en-GB')} · transport £${(-by('transport')).toLocaleString('en-GB')} · repayments £${(-by('loan')).toLocaleString('en-GB')} · tax £${(-by('tax')).toLocaleString('en-GB')} · agent £${(-by('agent')).toLocaleString('en-GB')} · worth £${worth.toLocaleString('en-GB')}${L.loans.length ? ` (owes £${Math.round(L.loans.reduce((t, l) => t + l.left, 0)).toLocaleString('en-GB')})` : ''}${c.letters.some((x) => /Repossessed/.test(x.subject)) ? ' · REPOSSESSED' : ''}` : '';
  return `${life.name}: balance at 3/6/12/18/24 months ${rows.join(', ')} · ${(dates / months).toFixed(1)} dates a month · fees £${by('fee').toLocaleString('en-GB')} · merch £${by('merch').toLocaleString('en-GB')} · events £${by('event').toLocaleString('en-GB')} · wages £${by('wage').toLocaleString('en-GB')} · travel £${(-by('travel')).toLocaleString('en-GB')} · living £${(-by('living')).toLocaleString('en-GB')}${life$} · ${points} points (total ${startTotal} → ${attributeTotal(me)}) · fans ${fansTotal(me).toLocaleString('en-GB')}`;
}

describe.skipIf(!process.env.ECON)('ECON=1: two years of five lives', () => {
  it('reports', async () => {
    const indieWith = (homeFans: number) => (_c: Career, w: Wrestler) => {
      for (const r of FAN_REGIONS) w.fans[r] = Math.round(homeFans * (r === 'europe' ? 1 : 0.05));
      w.country = 'UK';
      w.region = 'EUROPE';
    };
    const lives: Life[] = [
      { name: 'Unknown indie, a couple of dates a month, no job', player: '@indie', setup: indieWith(565), acceptPerMonth: 2, wage: 0 },
      { name: '…the same with part-time retail', player: '@indie', setup: indieWith(565), acceptPerMonth: 2, wage: 250 },
      { name: 'Indie regular (5k fans) with part-time retail', player: '@indie', setup: indieWith(5000), acceptPerMonth: 4, wage: 250 },
      { name: 'Successful indie (50k fans), full-time', player: '@indie', setup: indieWith(50000), acceptPerMonth: 10, wage: 0 },
      { name: 'Newly signed, bottom of VWF', player: [...WRESTLERS].filter((w) => w.promotion === 'VWF').sort((a, b) => fansTotal(a) - fansTotal(b))[0]!.id, acceptPerMonth: 0, wage: 0 },
      { name: 'Established star (Buck Stratton)', player: 'buck_stratton', acceptPerMonth: 0, wage: 0 },
      ...(FEATURES.life ? [
        // Life: a careful star (a house on a mortgage, a decent car, an established agent) and a flash one (a mansion
        // and a jet on finance, a luxury car, a penthouse to let).
        // Stars start a career with a few thousand in the bank: they buy three months in.
        { name: 'Established star, careful', player: 'buck_stratton', acceptPerMonth: 0, wage: 0, training: false, setup: (c: Career) => { hireAgent(c, 'established'); }, at: 91, buy: (c: Career) => {
          const L = life(c);
          for (const t of ['house', 'flat'] as const) if (buyHome(c, L.city, t, true).ok) break;
          const h = L.homes.find((x) => x.own); if (h) switchTo(c, h.id);
          buyVehicle(c, 'car', false);
        } },
        { name: 'Established star, flash', player: 'buck_stratton', acceptPerMonth: 0, wage: 0, training: false, setup: (c: Career) => { hireAgent(c, 'super'); }, at: 91, buy: (c: Career) => {
          const L = life(c);
          for (const t of ['mansion', 'penthouse', 'house'] as const) if (buyHome(c, L.city, t, true).ok) break;
          const h = L.homes.find((x) => x.own); if (h) switchTo(c, h.id);
          buyVehicle(c, 'jet_share', true); buyVehicle(c, 'luxury_car', true); buyVehicle(c, 'tour_bus', true);
          const second = buyHome(c, L.city === 'London' ? 'Manchester' : 'London', 'flat', true); if (second.id) letHome(c, second.id, true);
        } },
      ] as Life[] : []),
    ];
    for (const l of lives) console.log(await live(l));
    void fansForScore; void getPromotion;
  }, 1_800_000);
});
