import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { begin as kitBegin, day } from '../testkit';
import { FEATURES } from '../tuning';
import { replyTo } from '../mail';
import { findWrestler } from '../../data/rtr';
import { carryOn, comeback, endComeback, isRetired, monthlyAfter } from './afterlife';
import { life } from './state';

const was = FEATURES.life;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { life: boolean }).life = true; return c; };
beforeEach(() => { (FEATURES as { life: boolean }).life = true; });
afterEach(() => { (FEATURES as { life: boolean }).life = was; });

describe('Life stage 8: after you retire', () => {
  it('retired and carrying on: the days keep going, nobody books you, wrestlers ask you to train them', async () => {
    const c = begin('buck_stratton');
    const p = c.people[c.player]!;
    p.retired = true; p.retiredOn = c.today;
    await day(c);
    expect(c.over).toBeTruthy();
    carryOn(c);
    expect(life(c).after).toBeTruthy();
    // (Cards drawn before you retired still run their course; after that, nothing.)
    for (let i = 0; i < 14; i++) await day(c);
    const matches = c.history.length;
    for (let i = 0; i < 60; i++) await day(c);
    expect(c.history.length).toBe(matches);
    // Someone asks to be trained; say yes, and they improve (and pay).
    for (let m = 1; m <= 24 && !c.letters.some((l) => l.subject === 'Would you train me?'); m++) monthlyAfter(c, `2030-${String(m).padStart(2, '0')}`);
    const ask = c.letters.find((l) => l.subject === 'Would you train me?')!;
    expect(ask).toBeTruthy();
    replyTo(c, ask.id, 'client_yes');
    const who = findWrestler(ask.ctx!.who!)!;
    const total = () => Object.values(who.stats).reduce((t, v) => t + v, 0);
    const before = total(), money = c.money;
    monthlyAfter(c, '2032-01');
    expect(c.money).toBeGreaterThan(money);
    expect(total()).toBeGreaterThanOrEqual(before);
  });

  it('a comeback: one night only takes you out of retirement, and back in after the match', () => {
    const c = begin('buck_stratton');
    const p = c.people[c.player]!;
    p.retired = true; p.retiredOn = c.today; c.over = c.today;
    carryOn(c);
    expect(comeback(c, 'one')).toMatch(/One night only/);
    expect(isRetired(c)).toBe(false);
    expect(c.over).toBeUndefined();
    endComeback(c);
    expect(isRetired(c)).toBe(true);
    expect(life(c).after).toBeTruthy();
  });
});
