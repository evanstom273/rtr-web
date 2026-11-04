// Booker mode, stage 6 (Lyra's design): the ways in (offered, applying, buying, handed one), owners (goals, meddling,
// the sack), selling up, and the war (poaching, startups).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROMOTIONS, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { feelPair, likeOf } from '../world/people';
import { companyOf, foundPromotion, rolesOf, takeRole } from './company';
import { replyTo } from './mail';
import { applyFor, askingPrice, buy, ownerOf, ownerView, resign, sellUp } from './owners';
import { approach, contractWith, offer, type Approach } from './signing';
import { begin, day, quick } from './testkit';
import { FEATURES, OWNER, WAR } from './tuning';
import type { Career } from './types';

let was = false;
beforeEach(() => { was = FEATURES.booker; FEATURES.booker = true; });
afterEach(() => { FEATURES.booker = was; });
const P = () => activeWorld().people!;
const toMonthEnd = async (c: Career) => { const m = c.today.slice(0, 7); while (c.today.slice(0, 7) === m) await day(c, quick, 'simmed'); };

describe('booker mode: ways in and owners', () => {
  it('buy a promotion at the owner’s price (or buy out the one you book); sell it on', () => {
    const c = begin('@indie', 7);
    const ask = askingPrice(c, 'END');
    expect(ask).toBeGreaterThan(0);
    c.money = ask * 2;
    expect(buy(c, 'END', Math.round(ask * 0.5))).toContain('laughs');
    expect(buy(c, 'END', Math.round(ask * 0.9))).toContain('won’t take less');
    const owner = ownerOf('END')!;
    expect(buy(c, 'END', ask)).toContain('yours');
    expect(companyOf('END')!.owner).toBe('player');
    expect(owner.job).toBeNull();
    expect(rolesOf(c)).toEqual([{ promo: 'END', as: 'owner', since: c.today }]);
    const money = c.money;
    expect(sellUp(c, 'END')).toContain('Sold');
    expect(c.money).toBeGreaterThan(money);
    expect(companyOf('END')!.owner).not.toBe('player');
    expect(rolesOf(c)).toEqual([]);
    // Book IVW, then buy it out from under its owner.
    takeRole(c, 'IVW', 'booker');
    c.money = askingPrice(c, 'IVW') + 10;
    expect(buy(c, 'IVW', askingPrice(c, 'IVW'))).toContain('yours');
    expect(rolesOf(c)[0]!.as).toBe('owner');
  });

  it('apply for the book: no name, no job; a name, and you’re on probation with goals', () => {
    const c = begin('@indie', 7);
    c.people[c.player]!.rep = 5;
    expect(applyFor(c, 'IVW')).toContain('Not yet');
    expect(applyFor(c, 'IVW')).toContain('recently');
    c.people[c.player]!.rep = 100;
    expect(applyFor(c, 'SSWC')).toContain('probation');
    expect(rolesOf(c)[0]).toMatchObject({ promo: 'SSWC', as: 'booker' });
    const boss = ownerView(companyOf('SSWC')!);
    expect(boss.patience).toBe(OWNER.probation);
    expect(boss.goals.length).toBe(OWNER.goals);
    expect(c.letters.some((l) => l.subject === 'What I want this quarter')).toBe(true);
    expect(resign(c, 'SSWC')).toContain('quit');
  });

  it('the owner runs out of patience and you’re sacked', async () => {
    const c = begin('@indie', 7);
    takeRole(c, 'IVW', 'booker');
    const boss = ownerView(companyOf('IVW')!);
    boss.patience = 1;
    companyOf('IVW')!.bank = -5_000_000;
    await toMonthEnd(c);
    expect(rolesOf(c)).toEqual([]);
    expect(c.letters.some((l) => l.subject === 'You’re fired')).toBe(true);
  });

  it('an old owner who likes you hands it on', async () => {
    const c = begin('@indie', 7);
    const o = ownerOf('AAWA')!;
    o.born = '1930-01-01';
    feelPair(P(), o.id, c.player, [90, 0], [0, 0], 'test', c.today);
    const was2 = OWNER.handOn;
    OWNER.handOn = 1;
    await toMonthEnd(c);
    OWNER.handOn = was2;
    const l = c.letters.find((x) => x.replies?.some((r) => r.id === 'own_take'))!;
    expect(l).toBeTruthy();
    expect(replyTo(c, l.id, 'own_take')).toContain('yours');
    expect(companyOf(l.ctx!.promo!)!.owner).toBe('player');
    void likeOf;
  });
});

describe('booker mode: the war', () => {
  it('rivals come for your roster: match it, or let them go', async () => {
    const c = begin('@indie', 7);
    c.money = 100_000;
    foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 50_000, night: { every: 'weekly', day: 'Saturday' } });
    const free = WRESTLERS.filter((w) => w.promotion === 'TIS' && w.id !== c.player).slice(0, 2);
    for (const w of free) { const a = approach(c, 'NLW', w.id) as Approach; offer(c, a.id, a.ask); }
    const was2 = WAR.poach;
    WAR.poach = 1;
    await toMonthEnd(c);
    WAR.poach = was2;
    const letters = c.letters.filter((l) => l.ctx?.poached);
    expect(letters.length).toBeGreaterThan(0);
    const fee = contractWith(c, letters[0]!.ctx!.poached!, 'NLW')!.fee;
    expect(replyTo(c, letters[0]!.id, 'war_match')).toContain('stays');
    expect(contractWith(c, letters[0]!.ctx!.poached!, 'NLW')!.fee).toBeGreaterThan(fee);
    if (letters[1]) { expect(replyTo(c, letters[1].id, 'war_let')).toContain('off to'); expect(WRESTLERS.find((w) => w.id === letters[1]!.ctx!.poached)!.promotion).not.toBe('NLW'); }
  });

  it('an indie brand that’s made a name becomes a promotion', async () => {
    const c = begin('@indie', 7);
    const P0 = P();
    const b = Object.values(P0.brands).find((x) => !x.closed && x.promoter)!;
    b.popularity = 30;
    P0.staff[b.promoter!]!.rep = 80;
    const before = PROMOTIONS.length;
    const was2 = WAR.startup;
    WAR.startup = 1;
    await toMonthEnd(c);
    WAR.startup = was2;
    expect(PROMOTIONS.length).toBeGreaterThan(before);
    const p = PROMOTIONS.at(-1)!;
    expect(companyOf(p.initials)!.tier).toBe('local');
    expect(Object.values(c.shows).some((s) => s.promo === p.initials)).toBe(true);
  });
});
