import { describe, expect, it } from 'vitest';
import { findWrestler } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { C, NO_CLAUSES } from './clauses';
import { acceptLetter, askForSpot, dayOff, exitTerms, gate, leaveContract, makeOffer, matchPay, mood, propose, signOffer, startCareer, willingness } from './index';
import type { Career } from './types';
import { who } from './testkit';

function begin(player = 'jamie_mercer'): Career {
  const w = setWorld(freshWorld(5));
  const c = startCareer({ player: who(player), today: '2026-11-03', seed: 5 });
  w.career = c;
  return c;
}

describe('contracts', () => {
  it('a fair ask is accepted; a greedy one is countered; an absurd one makes them walk', () => {
    const c = begin();
    makeOffer(c, 'TCG', 'Test');
    const o = c.offers.at(-1)!;
    const base = willingness(c, 'TCG', o.id);
    expect(propose(c, o, { fee: base, months: 12, clauses: NO_CLAUSES() })).toBe('accept');
    makeOffer(c, 'NWGP', 'Test');
    const o2 = c.offers.at(-1)!;
    const b2 = willingness(c, 'NWGP', o2.id);
    expect(propose(c, o2, { fee: Math.round(b2 * 1.25), months: 12, clauses: NO_CLAUSES() })).toBe('counter');
    expect(o2.fee).toBeLessThan(Math.round(b2 * 1.25));
    expect(propose(c, o2, { fee: b2 * 3, months: 12, clauses: NO_CLAUSES() })).toBe('walk');
    expect(o2.status).toBe('walked');
  });

  it('you can\'t have every clause at Tier 3', () => {
    const c = begin();
    makeOffer(c, 'VWF', 'Test');
    const o = c.offers.at(-1)!;
    // Reputation 50 locks every Tier 3.
    expect(gate(c, 'VWF', C.creative, 3)).toMatch(/reputation/);
    c.people[c.player]!.rep = 90;
    const all3 = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
    expect(mood(c, o, { fee: o.fee, months: 12, clauses: all3 })).toBe('losing');
    expect(propose(c, o, { fee: o.fee, months: 12, clauses: all3 })).not.toBe('accept');
  });

  it('resisted clauses cost more than flexible ones', () => {
    const c = begin();
    makeOffer(c, 'TCG', 'Test');
    const o = c.offers.at(-1)!;
    const creative = [...NO_CLAUSES()]; creative[C.creative] = 2; // TCG resist
    const wage = [...NO_CLAUSES()]; wage[C.wage] = 2; // TCG flexible
    const order = ['keen', 'happy', 'hesitant', 'losing'];
    const fee = Math.round(willingness(c, 'TCG', o.id) * 1.05);
    expect(order.indexOf(mood(c, o, { fee, months: 12, clauses: creative }))).toBeGreaterThanOrEqual(order.indexOf(mood(c, o, { fee, months: 12, clauses: wage })));
  });

  it('Guaranteed Pay changes what a loss costs', () => {
    const k = { promo: 'VWF', start: '2026-11-03', end: '2027-11-03', fee: 1000, clauses: NO_CLAUSES() };
    expect(matchPay(k, 'weekly', true).pay).toBe(750);
    k.clauses[C.guaranteed] = 1; expect(matchPay(k, 'weekly', true).pay).toBe(900);
    k.clauses[C.guaranteed] = 2; expect(matchPay(k, 'weekly', true).pay).toBe(1000);
    k.clauses[C.guaranteed] = 3; expect(matchPay(k, 'flagship', true)).toEqual({ pay: 2500, bonus: 250 });
  });

  it('signing as a free agent starts today; Contract Exit tiers decide how you leave', () => {
    const c = begin('@champ');
    expect(findWrestler(c.player)!.promotion).toBe('TIS');
    makeOffer(c, 'END', 'Test');
    const o = c.offers.at(-1)!;
    o.clauses[C.exit] = 2;
    signOffer(c, o);
    expect(findWrestler(c.player)!.promotion).toBe('END');
    expect(exitTerms(c).tier).toBe(2);
    expect(leaveContract(c)).toMatch(/Notice given/);
    c.people[c.player]!.contract!.clauses[C.exit] = 3;
    expect(leaveContract(c)).toMatch(/free agent/);
    expect(findWrestler(c.player)!.promotion).toBe('TIS');
  });

  it('a free agent can ask for a spot on an indie show', () => {
    const c = begin('@champ');
    const shows = Object.values(c.shows).filter((s) => s.promo === 'TIS' && s.date > c.today);
    const results = shows.slice(0, 12).map((s) => askForSpot(c, s));
    expect(results.some((r) => r.ok)).toBe(true);
    expect(Object.keys(c.indie).length).toBeGreaterThan(0);
  });

  it('Schedule Flexibility Tier 3 lets you refuse a booked date, with no penalty', () => {
    const c = begin();
    const k = c.people[c.player]!.contract!;
    k.clauses[C.schedule] = 3;
    const show = Object.values(c.shows).find((s) => s.date > c.today && s.card?.some((b) => b.a === c.player || b.b === c.player))!;
    expect(show).toBeTruthy();
    const rep = c.people[c.player]!.rep;
    expect(dayOff(c, show.date)).toMatch(/Refused/);
    expect(show.card!.some((b) => b.a === c.player || b.b === c.player)).toBe(false);
    expect(c.people[c.player]!.rep).toBe(rep);
    k.clauses[C.schedule] = 0;
    expect(dayOff(c, show.date)).toMatch(/no Schedule Flexibility/);
  });

  it('Indie Bookings Tier 3: a clashing indie date pulls you off the contracted show and costs reputation', () => {
    const c = begin();
    const k = c.people[c.player]!.contract!;
    k.clauses[C.indie] = 3;
    // A VWF date you're booked on, with an indie show the same night.
    const indie = Object.values(c.shows).find((s) => s.promo === 'TIS' && s.date > c.today)!;
    const mine = { ...indie, id: 'vwf-test', promo: 'VWF', kind: 'weekly' as const, name: 'Defiance', card: [{ a: 'ray_hollis', b: c.player }] };
    c.shows[mine.id] = mine;
    const rep = c.people[c.player]!.rep;
    const l = { id: 'x', day: c.today, kind: 'offer' as const, from: 'x', subject: 'x', body: [], read: false, action: { type: 'indie' as const, show: indie.id, fee: 100, travel: 0 } };
    expect(acceptLetter(c, l)).toMatch(/You’re booked:/);
    expect(mine.card!.some((b) => b.a === c.player || b.b === c.player)).toBe(false);
    expect(c.people[c.player]!.rep).toBeLessThan(rep);
  });
});
