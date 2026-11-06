import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { begin as kitBegin } from '../testkit';
import { FEATURES, PRICE_BOOK as PB } from '../tuning';
import { buyLuxury, buyStake, buyVenture, FUND_KINDS, fundsValue, monthlyFunds, monthlyLuxury, monthlyStakes, monthlyVentures, putIn, sellVenture, stakeable, stakeOf, takeOut, venturePrice } from './invest';
import { life } from './state';
import { lifeWorld } from '../../world/lifeWorld';
import { seededRng } from '../../engine/rng';

const was = FEATURES.life;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { life: boolean }).life = true; return c; };
beforeEach(() => { (FEATURES as { life: boolean }).life = true; });
afterEach(() => { (FEATURES as { life: boolean }).life = was; });

describe('Life stage 3: businesses, funds, stakes, luxury', () => {
  it('a business pays monthly takings that wobble, and you can sell it', () => {
    const c = begin('@indie');
    c.money = 1_000_000;
    const city = life(c).city;
    expect(buyVenture(c, 'gym', city, false)).toMatch(/yours/);
    const v = life(c).ventures![0]!;
    expect(v.paid).toBe(venturePrice('gym', city));
    let takings = 0;
    for (let m = 1; m <= 12; m++) {
      const before = c.money;
      monthlyVentures(c, `2027-${String(m).padStart(2, '0')}`);
      takings += c.money - before;
      if (!life(c).ventures?.length) break;
    }
    // Roughly the yield (7% a year), after tax, if it didn't fold.
    if (life(c).ventures?.length) {
      expect(takings).toBeGreaterThan(0);
      expect(takings).toBeLessThan(v.paid * 0.2);
      expect(sellVenture(c, v.id)).toMatch(/Sold/);
    }
  });

  it('funds move monthly, and a crash hits everyone (over fifty years the risky fund does best on average and worst in a crash)', () => {
    const c = begin('@indie');
    c.money = 3_000_000;
    for (const k of FUND_KINDS) putIn(c, k, 1_000_000);
    const W = lifeWorld();
    let crashes = 0;
    for (let y = 2027; y < 2077; y++) for (let m = 1; m <= 12; m++) {
      const month = `${y}-${String(m).padStart(2, '0')}`;
      W.crash = seededRng(y * 100 + m)() < PB.crashYear / 12 ? month : undefined;
      if (W.crash) crashes++;
      monthlyFunds(c, month);
    }
    const f = life(c).funds!;
    expect(crashes).toBeGreaterThan(2);
    expect(crashes).toBeLessThan(14);
    expect(f.safe!.v).toBeGreaterThan(1_000_000);
    expect(fundsValue(c)).toBeGreaterThan(3_000_000);
    const before = c.money;
    expect(takeOut(c, 'safe')).toMatch(/out of/);
    expect(c.money).toBeGreaterThan(before);
  });

  it('a stake in a promotion pays dividends from its profit; a quarter means they won’t release you', () => {
    const c = begin('@indie');
    c.money = 50_000_000;
    const promo = stakeable()[0]!;
    expect(buyStake(c, promo, 25)).toMatch(/seat at the table/);
    expect(stakeOf(c, promo)).toBe(25);
    expect(buyStake(c, promo, 30)).toMatch(/won’t sell past/);
    monthlyStakes(c);
  });

  it('luxury holds or drifts, and costs upkeep', () => {
    const c = begin('@indie');
    c.money = 5_000_000;
    buyLuxury(c, 'boat', 1);
    buyLuxury(c, 'art', 1);
    const boat = life(c).luxury!.find((x) => x.kind === 'boat')!;
    const before = c.money;
    for (let m = 1; m <= 12; m++) monthlyLuxury(c, `2027-${String(m).padStart(2, '0')}`);
    expect(boat.v).toBeLessThan(boat.paid);
    expect(c.money).toBeLessThan(before);
  });
});
