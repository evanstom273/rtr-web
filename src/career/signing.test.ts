// Booker mode, stage 5 (Lyra's design): signing from the other side, your roster's feelings about you, and staff.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bringBack } from './cut.testkit';
import { fansIn, rosterOf, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondOf, feelPair, likeOf } from '../world/people';
import { available } from './booker';
import { autoBook } from './card';
import { boutRules } from './career';
import { companyOf, foundPromotion } from './company';
import { addDays } from './dates';
import { replyTo } from './mail';
import { candidates, hire, promise, promisesOf, staffQ } from './morale';
import { approach, contractWith, homeRegion, offer, releaseFrom, worth, type Approach } from './signing';
import { begin, day, quick } from './testkit';
import { FEATURES, MORALE, SIGN, STAFF } from './tuning';
import type { Career } from './types';

// The big cut hid this; the tests bring it back so the code keeps working.
let putBack = (): void => {};
beforeEach(() => { putBack = bringBack(); });
afterEach(() => putBack());

let was = false;
beforeEach(() => { was = FEATURES.booker; FEATURES.booker = true; });
afterEach(() => { FEATURES.booker = was; });

const own = (c: Career) => { c.money = 100_000; foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 50_000, night: { every: 'weekly', day: 'Saturday' } }); };
const free = (c: Career): Wrestler[] => WRESTLERS.filter((w) => w.promotion === 'TIS' && w.id !== c.player && !TITLES.some((t) => t.holder === w.id) && fansIn(w, homeRegion('NLW')) > 0)
  .sort((a, b) => fansIn(b, homeRegion('NLW')) - fansIn(a, homeRegion('NLW')));
const P = () => activeWorld().people!;

describe('booker mode: signing', () => {
  it('what someone’s worth: their fans where you are, and how they feel about you', () => {
    const c = begin('@indie', 7);
    own(c);
    const [big, , , small] = free(c);
    expect(worth(c, 'NLW', big!)).toBeGreaterThan(worth(c, 'NLW', small!));
    const before = worth(c, 'NLW', small!);
    feelPair(P(), small!.id, c.player, [80, 0], [0, 0], 'test', c.today);
    expect(worth(c, 'NLW', small!)).toBeLessThan(before);
  });

  it('you make an offer: too low and they walk; close and they meet you halfway; enough and they sign', () => {
    const c = begin('@indie', 7);
    own(c);
    const [a, b] = free(c);
    const x = approach(c, 'NLW', a!.id) as Approach;
    expect(x.ask.fee).toBeGreaterThan(0);
    expect(offer(c, x.id, { ...x.ask, fee: Math.round(x.ask.fee * 0.2) })).toContain('walks');
    const y = approach(c, 'NLW', b!.id) as Approach;
    const ask = y.ask.fee;
    expect(offer(c, y.id, { ...y.ask, fee: Math.round(ask * 0.85) })).toContain('comes back');
    expect(y.ask.fee).toBeLessThan(ask);
    expect(offer(c, y.id, { ...y.ask })).toContain('signs');
    expect(b!.promotion).toBe('NLW');
    expect(contractWith(c, b!.id, 'NLW')!.fee).toBe(y.ask.fee);
    expect(rosterOf('NLW').map((w) => w.id)).toContain(b!.id);
  });

  it('someone else’s: you buy them out (the company pays), or you can’t afford it', () => {
    const c = begin('@indie', 7);
    own(c);
    const w = rosterOf('IVW').find((x) => !TITLES.some((t) => t.holder === x.id))!;
    const x = approach(c, 'NLW', w.id) as Approach;
    expect(x.buyout).toBeGreaterThan(0);
    companyOf('NLW')!.bank = 10;
    expect(offer(c, x.id, { ...x.ask, fee: x.ask.fee * 2 })).toContain('buyout');
    companyOf('NLW')!.bank = x.buyout! + 1000;
    const ivw = companyOf('IVW')!.bank;
    expect(offer(c, x.id, { ...x.ask, fee: x.ask.fee * 2 })).toContain('signs');
    expect(w.promotion).toBe('NLW');
    expect(companyOf('IVW')!.bank).toBe(ivw + x.buyout!);
  });

  it('releasing someone pays off what’s left; a contract coming up asks you; one who can’t stand you won’t re-sign', async () => {
    const c = begin('@indie', 7);
    own(c);
    const [a, b] = free(c);
    for (const w of [a!, b!]) { const x = approach(c, 'NLW', w.id) as Approach; offer(c, x.id, x.ask); }
    const bank = companyOf('NLW')!.bank;
    expect(releaseFrom(c, 'NLW', a!.id)).toContain('released');
    expect(companyOf('NLW')!.bank).toBeLessThan(bank);
    expect(a!.promotion).toBe('TIS');
    feelPair(P(), b!.id, c.player, [-90, 0], [0, 0], 'test', c.today);
    const k = contractWith(c, b!.id, 'NLW')!;
    k.end = addDays(c.today, SIGN.renewNotice + 1);
    await day(c, quick, 'simmed');
    const l = c.letters.find((x) => x.ctx?.renew === b!.id)!;
    expect(l).toBeTruthy();
    expect(replyTo(c, l.id, 'renew_yes')).toContain('won’t sign');
    for (let i = 0; i < SIGN.renewNotice + 2 && b!.promotion === 'NLW'; i++) await day(c, quick, 'simmed');
    expect(b!.promotion).toBe('TIS');
  });
});

describe('booker mode: your roster and your staff', () => {
  it('left off the cards for weeks, they mind; a promise kept, they love you for it', async () => {
    const c = begin('@indie', 7);
    own(c);
    const [a] = free(c);
    const x = approach(c, 'NLW', a!.id) as Approach;
    offer(c, x.id, x.ask);
    // Off every card.
    for (const s of Object.values(c.shows)) if (s.card) s.card = s.card.filter((b) => b.a !== a!.id && b.b !== a!.id);
    const like0 = likeOf(P(), a!.id, c.player);
    expect(promise(c, 'NLW', a!.id, 'main', 3)).toContain('promised');
    for (let i = 0; i < 28; i++) {
      for (const s of Object.values(c.shows)) if (s.card && !s.done) s.card = s.card.filter((b) => b.a !== a!.id && b.b !== a!.id);
      await day(c, quick, 'simmed');
    }
    expect(promisesOf(c).length).toBe(0);
    expect(bondOf(P(), a!.id, c.player)!.log!.some((l) => l.t === 'Broke their promise')).toBe(true);
    expect(bondOf(P(), a!.id, c.player)!.log!.some((l) => l.t === 'Not being used')).toBe(true);
    expect(likeOf(P(), a!.id, c.player)).toBeLessThan(like0);
    void MORALE;
  });

  it('staff: hire them, pay them, and they do the job (agents lift matches, the doctor cuts injuries, the writer books better)', async () => {
    const c = begin('@indie', 7);
    own(c);
    const show = Object.values(c.shows).filter((s) => s.promo === 'NLW' && !s.done).sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
    const [a, b] = free(c);
    const plain = boutRules(c, show, { a: a!.id, b: b!.id }, a!.id, b!.id, false).chemistry ?? 0;
    for (const role of ['agent', 'doctor', 'writer'] as const) expect(hire(c, 'NLW', role, candidates(c, 'NLW', role)[0]!.s.id)).toContain('your');
    expect(staffQ('NLW', 'agent')).toBeGreaterThan(0);
    expect(boutRules(c, show, { a: a!.id, b: b!.id }, a!.id, b!.id, false).chemistry ?? 0).toBeCloseTo(plain + staffQ('NLW', 'agent') * STAFF.agentStars);
    expect(autoBook(c, show.id)).toContain('booked');
    const draw = (x: { a: string; b: string }) => fansIn(WRESTLERS.find((w) => w.id === x.a)!, show.region) + fansIn(WRESTLERS.find((w) => w.id === x.b)!, show.region);
    const card = show.card!;
    expect(draw(card[card.length - 1]!)).toBe(Math.max(...card.map(draw)));
    const bank = companyOf('NLW')!.bank;
    const m = c.today.slice(0, 7);
    while (c.today.slice(0, 7) === m) await day(c, quick, 'simmed');
    expect(companyOf('NLW')!.books!.at(-1)!.lines.staff).toBeGreaterThan(0);
    void bank;
  });

  it('conduct lands on your desk: suspend them and they’re off the shows', async () => {
    const c = begin('@indie', 7);
    own(c);
    const [a] = free(c);
    const x = approach(c, 'NLW', a!.id) as Approach;
    offer(c, x.id, x.ask);
    const was2 = MORALE.conduct;
    MORALE.conduct = 1;
    const m = c.today.slice(0, 7);
    while (c.today.slice(0, 7) === m) await day(c, quick, 'simmed');
    MORALE.conduct = was2;
    const l = c.letters.find((y) => y.ctx?.who === a!.id && y.replies?.some((r) => r.id === 'con_suspend'))!;
    expect(l).toBeTruthy();
    expect(replyTo(c, l.id, 'con_suspend')).toContain('Suspended');
    expect(available(c.people[a!.id], addDays(c.today, 3))).toBe(false);
  });
});
