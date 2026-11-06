import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { begin as kitBegin } from '../testkit';
import { FEATURES } from '../tuning';
import { fansTotal, findWrestler } from '../../data/rtr';
import { activeWorld } from '../../world/world';
import { buyVehicle } from './garage';
import { buyLuxury } from './invest';
import { flaunt, flauntWhat } from './status';
import { divorce, kidsOf, monthlyFamily } from './family';
import { netWorth } from './worth';
import { life } from './state';

const was = FEATURES.life;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { life: boolean }).life = true; return c; };
beforeEach(() => { (FEATURES as { life: boolean }).life = true; });
afterEach(() => { (FEATURES as { life: boolean }).life = was; });

describe('Life stage 6: status and family money', () => {
  it('showing off only works with something to show; a heel gets heat for it; once a week', () => {
    const c = begin('buck_stratton');
    c.money = 1_000_000;
    expect(flauntWhat(c, 'car')).toBeNull();
    expect(flaunt(c, 'car')).toMatch(/nothing like that/);
    buyVehicle(c, 'luxury_car', false);
    const me = findWrestler(c.player)!;
    me.disposition = 'HEEL';
    const fans = fansTotal(me);
    expect(flaunt(c, 'car')).toMatch(/You showed off the new car/);
    expect(fansTotal(me)).toBeGreaterThan(fans);
    expect(flaunt(c, 'party')).toMatch(/this week already/);
    expect(life(c).flaunts?.length).toBe(1);
  });

  it('a divorce takes half of everything (no prenup), selling things if the cash won’t cover it', () => {
    const c = begin('buck_stratton');
    c.money = 1_000_000;
    buyLuxury(c, 'art', 1);
    expect(life(c).luxury?.length).toBe(1);
    c.money = 20_000;
    const before = netWorth(c);
    expect(divorce(c, 'someone')).toMatch(/Divorce/);
    expect(netWorth(c)).toBeLessThan(before * 0.6);
    expect(life(c).luxury?.length ?? 0).toBe(0);
    expect(c.letters.some((l) => /divorce is settled/.test(l.subject) && l.body.some((b) => /sell/.test(b)))).toBe(true);
  });

  it('children cost money until they’re grown', () => {
    const c = begin('buck_stratton');
    const P = activeWorld().people!;
    (P.folk ??= {}).kid1 = { id: 'kid1', name: 'Lily Stratton', kind: 'family', rel: 'daughter', of: c.player, gender: 'FEMALE', country: 'USA', born: '2020-05-01' };
    expect(kidsOf(c).map((k) => k.age)).toEqual([6]);
    const m = c.money;
    monthlyFamily(c);
    expect(c.money).toBeLessThan(m);
    expect(c.ledger.some((e) => e.kind === 'family' && /school and clothes/.test(e.text))).toBe(true);
  });
});
