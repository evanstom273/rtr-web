import { describe, expect, it } from 'vitest';
import { findWrestler, globalScore, rosterOf, worksFor, WRESTLERS } from '../data/rtr';
import { C, NCLAUSES, packageClauses } from './clauses';
import { addDeal, aiContract, dealsOf, freshContracts, sideWork } from './deals';
import { makeOffer, propose, signOffer } from './index';
import { begin, day } from './testkit';
import { seededRng } from '../engine/rng';
import type { Career, Offer } from './types';

const signedPeople = (c: Career) => WRESTLERS.filter((w) => w.promotion !== 'TIS' && w.id !== c.player).map((w) => [w, c.people[w.id]!] as const);

describe('contracts: the 25 clauses (Lyra’s design)', () => {
  it('everyone signed starts on a 25-clause deal from a package, stars on star (or special attraction) deals', () => {
    const c = begin('jamie_mercer');
    const all = signedPeople(c);
    expect(all.length).toBeGreaterThan(300);
    for (const [, p] of all) {
      expect(p.contract!.clauses).toHaveLength(NCLAUSES);
      expect(p.contract!.pkg).toBeTruthy();
    }
    const pk = (id: string) => all.filter(([, p]) => p.contract!.pkg === id).length;
    expect(pk('star') + pk('attraction')).toBeGreaterThan(20);
    expect(pk('attraction')).toBeGreaterThan(0);
    expect(pk('standard')).toBeGreaterThan(pk('star'));
    // Special attractions are non-exclusive with a few agreed dates; standard deals are exclusive to them.
    for (const [, p] of all.filter(([, p]) => p.contract!.pkg === 'attraction')) {
      expect(p.contract!.clauses[C.exclusivity]).toBe(0);
      expect(p.contract!.dates).toBeGreaterThan(0);
    }
    for (const [, p] of all.filter(([, p]) => p.contract!.pkg === 'standard')) expect(p.contract!.clauses[C.exclusivity]).toBeGreaterThanOrEqual(1);
  });

  it('a promotion’s character shows in its packages: TCG fights Creative Control, SLN gives it', () => {
    expect(packageClauses('TCG', 'star')[C.creative]).toBeLessThan(packageClauses('SLN', 'star')[C.creative]!);
    // NWGP is possessive: its star deals are totally exclusive; a relaxed promotion lets that down.
    expect(packageClauses('NWGP', 'star')[C.exclusivity]).toBe(3);
    expect(packageClauses('END', 'star')[C.exclusivity]).toBeLessThan(3);
  });

  it('old saves: every contract is rewritten, and you keep what you’d negotiated', () => {
    const c = begin('jamie_mercer');
    const me = c.people[c.player]!;
    me.contract!.clauses = [3, 0, 2, 0, 1, 0, 0, 2, 0, 0];
    const someone = signedPeople(c)[0]![1];
    someone.contract!.clauses = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(freshContracts(c)).toBe(true);
    expect(me.contract!.clauses).toHaveLength(NCLAUSES);
    expect(me.contract!.clauses[C.creative]).toBe(3);
    expect(me.contract!.clauses[C.medical]).toBeGreaterThanOrEqual(2);
    expect(me.contract!.clauses[C.exit]).toBeGreaterThanOrEqual(2);
    expect(someone.contract!.clauses).toHaveLength(NCLAUSES);
    expect(c.letters[0]!.subject).toBe('Your contract, rewritten');
    expect(freshContracts(c)).toBe(false);
  });

  it('a wrestler on two majors is on both rosters, fully, and each gets only its agreed dates', async () => {
    const c = begin('jamie_mercer');
    const star = rosterOf('TCG').filter((w) => w.id !== c.player).sort((a, b) => globalScore(b) - globalScore(a))[0]!;
    const p = c.people[star.id]!;
    p.contract!.clauses[C.exclusivity] = 0;
    p.contract!.dates = 6;
    const k = aiContract(seededRng(1), star, 'VWF', c.today, 12, 'attraction');
    k.dates = 2;
    addDeal(p, star, k);
    expect(worksFor(star, 'TCG') && worksFor(star, 'VWF')).toBe(true);
    expect(rosterOf('VWF').some((w) => w.id === star.id)).toBe(true);
    for (let i = 0; i < 45; i++) await day(c);
    const month = c.today.slice(0, 7);
    const dates = (promo: string) => Object.values(c.shows).filter((s) => s.date.startsWith(month) && s.promo === promo && s.card?.some((b) => b.a === star.id || b.b === star.id)).length;
    expect(dates('VWF')).toBeLessThanOrEqual(2);
    expect(dates('TCG')).toBeLessThanOrEqual(6);
  });

  it('non-exclusive, you can sign a second major: the month splits between them', () => {
    const c = begin('jamie_mercer');
    const me = c.people[c.player]!;
    const mine = me.contract!.promo;
    me.contract!.clauses[C.exclusivity] = 0;
    me.contract!.end = '2028-11-03';
    const other = mine === 'TCG' ? 'NWGP' : 'TCG';
    makeOffer(c, other, 'Test');
    const o = c.offers.find((x) => x.promo === other && x.status === 'open')!;
    expect(o.second).toBe(true);
    expect(o.clauses[C.exclusivity]).toBeLessThanOrEqual(1);
    // A second deal can't be exclusive.
    expect(propose(c, o, { fee: o.fee, months: 12, clauses: (() => { const x = [...o.clauses]; x[C.exclusivity] = 2; return x; })(), dates: 4 })).toBe('counter');
    o.status = 'open';
    expect(propose(c, o, { fee: Math.round(o.fee * 0.9), months: 12, clauses: o.clauses, dates: 4 })).toBe('accept');
    expect(signOffer(c, o)).toMatch(/as well/);
    expect(dealsOf(me).map((k) => k.promo)).toEqual([mine, other]);
    expect(me.deals![0]!.dates).toBe(4);
    expect(me.contract!.dates).toBe(8);
    expect(worksFor(findWrestler(c.player)!, other)).toBe(true);
  });

  it('First Refusal: they can block a second deal, and it costs them', () => {
    let blocked = 0, signed = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const c = begin('jamie_mercer', seed);
      const me = c.people[c.player]!;
      me.contract!.clauses[C.exclusivity] = 1;
      me.contract!.end = '2028-11-03';
      const other = me.contract!.promo === 'TCG' ? 'ZWA' : 'TCG';
      makeOffer(c, other, 'Test');
      const o = c.offers.find((x) => x.promo === other && x.status === 'open')!;
      o.said = '“Done.”';
      const money = c.money;
      const said = signOffer(c, o);
      if (o.status === 'blocked') { blocked++; expect(c.money).toBeGreaterThan(money); expect(said).toMatch(/first refusal/); } else signed++;
    }
    expect(blocked).toBeGreaterThan(0);
    expect(signed).toBeGreaterThan(0);
  });

  it('Major Exclusive or Total: no second majors at all', () => {
    const c = begin('jamie_mercer');
    const me = c.people[c.player]!;
    me.contract!.clauses[C.exclusivity] = 2;
    me.contract!.end = '2028-11-03';
    const other = me.contract!.promo === 'TCG' ? 'NWGP' : 'TCG';
    makeOffer(c, other, 'Test');
    const o = c.offers.find((x) => x.promo === other && x.status === 'open')!;
    // A full deal, for after this one ends.
    expect(o.second).toBeFalsy();
    expect(o.start > c.today).toBe(true);
    expect(sideWork(me).rule).toBe('approval');
  });

  it('your promotion always gets a courtesy call before you sign elsewhere', () => {
    const c = begin('jamie_mercer');
    const me = c.people[c.player]!;
    const mine = me.contract!.promo;
    me.contract!.end = '2027-01-03';
    const other = mine === 'TCG' ? 'NWGP' : 'TCG';
    makeOffer(c, other, 'Test');
    const o = c.offers.find((x) => x.promo === other && x.status === 'open') as Offer;
    const said = signOffer(c, o);
    expect(said).toMatch(/want a word|good luck|Signed/);
    if (/want a word/.test(said)) {
      const counter = c.offers.find((x) => x.id === o.courtesy)!;
      expect(counter.promo).toBe(mine);
      expect(counter.fee).toBeGreaterThanOrEqual(o.fee);
      // Sign the one you wanted after all.
      expect(signOffer(c, o)).toMatch(/Signed with/);
      expect(me.next?.promo).toBe(other);
    }
  });

});
