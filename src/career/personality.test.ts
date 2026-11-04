// Personality in a career: you earn traits only from how you play, always confirm them (even into an
// empty slot), never more than three, and a turned-down trait stays away for a year; buying one costs
// money and has a cooldown; AI personalities drift slowly and only from what happens to them.
import { describe, expect, it } from 'vitest';
import { TITLES, WRESTLERS, findWrestler, validTraits, type TraitId } from '../data/rtr';
import { activeWorld } from '../world/world';
import { answerEvent, buyBlock, buyTrait, eventChoices, offerAt, offerDue, traitPrice } from './index';
import { addDays } from './dates';
import { TRAIT_BUY_COOLDOWN, TRAIT_DECLINE_COOLDOWN, TRAIT_OFFER_GAP_DAYS } from './tuning';
import { begin, day, quick, type Runner } from './testkit';
import type { Career } from './types';

const me = (c: Career) => findWrestler(c.player)!;
const offers = (c: Career) => c.letters.filter((l) => l.action?.type === 'event' && l.action.event === 'trait_offer');

/** A player who wrestles the same way every night: three high-risk tries and a couple of taunts. */
const flyer: Runner = async (jobs) => (await quick(jobs)).map((o) => (o.key === 'mine' ? { ...o, stats: { you: { ...o.stats.you, highTried: 3, taunts: 2, rests: 3 }, them: { ...o.stats.them, highTried: 3, taunts: 2, rests: 3 } } } : o));

describe('earning traits', () => {
  it('a passive career (every match simmed, no choices made) is never offered one', async () => {
    const c = begin('jamie_mercer', 7);
    for (let i = 0; i < 365; i++) await day(c, quick, 'simmed');
    expect(offers(c)).toHaveLength(0);
  }, 120000);

  it('an active one gets one or two a year, from what they actually do, and has to say yes', async () => {
    const c = begin('jamie_mercer', 11);
    me(c).traits = ['loyal'];
    let taken = 0;
    // Counted as they arrive: the mailbox only keeps the latest 200 letters.
    const seen = new Set<string>();
    for (let i = 0; i < 365; i++) {
      await day(c, flyer);
      for (const l of offers(c)) seen.add(l.id);
      for (const l of offers(c).filter((x) => !x.done)) {
        // The card waits: nothing changes until you choose, even with slots free.
        const t = l.subject.replace('You’re becoming a ', '');
        expect(me(c).traits!.map(String)).not.toContain(t);
        const choices = eventChoices(c, l.id).map((o) => o.id);
        expect(choices).toContain('no');
        const pick = choices.includes('take') ? 'take' : choices.find((x) => x.startsWith('r'))!;
        answerEvent(c, l.id, pick);
        taken++;
      }
    }
    const n = seen.size;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(2);
    expect(me(c).traits).toContain('risk_taker');
    expect(validTraits(me(c).traits!)).toBe(true);
    expect(taken).toBe(n);
    // They're at least the offer gap apart.
    const days = offers(c).map((l) => l.day).sort();
    if (days.length === 2) expect(new Date(days[1]!).getTime() - new Date(days[0]!).getTime()).toBeGreaterThanOrEqual(TRAIT_OFFER_GAP_DAYS * 864e5);
  }, 120000);

  it('the bar rises as your personality settles', () => {
    expect(offerAt(0)).toBeLessThan(offerAt(1));
    expect(offerAt(1)).toBeLessThan(offerAt(2));
    expect(offerAt(2)).toBeLessThan(offerAt(3));
  });

  it('with three traits the card only offers to replace one; turning it down resets it and keeps it away for a year', async () => {
    const c = begin('jamie_mercer', 23);
    me(c).traits = ['loyal', 'mentor', 'methodical'];
    const p = c.people[c.player]!;
    p.leanings = { showboat: 400 };
    await day(c, quick, 'simmed');
    const l = offers(c).at(-1)!;
    expect(l).toBeTruthy();
    const ids = eventChoices(c, l.id).map((o) => o.id);
    expect(ids).not.toContain('take');
    expect(ids.filter((x) => x.startsWith('r'))).toHaveLength(3);
    answerEvent(c, l.id, 'no');
    expect(me(c).traits).toEqual(['loyal', 'mentor', 'methodical']);
    expect(p.leanings?.showboat ?? 0).toBe(0);
    expect(p.declined?.showboat).toBe(c.today);
    // Even if the behaviour comes straight back, not for a year.
    p.leanings = { showboat: 400 };
    p.lastOfferAt = addDays(c.today, -TRAIT_OFFER_GAP_DAYS - 1);
    expect(offerDue(c)).toBeNull();
    c.today = addDays(c.today, TRAIT_DECLINE_COOLDOWN + 1);
    expect(offerDue(c)).toBe('showboat');
  }, 60000);

  it('a conflicting trait can only come in by replacing the one it clashes with', async () => {
    const c = begin('jamie_mercer', 5);
    me(c).traits = ['loyal', 'showboat'];
    c.people[c.player]!.leanings = { mercenary: 400 };
    await day(c, quick, 'simmed');
    const l = offers(c).at(-1)!;
    const choices = eventChoices(c, l.id);
    expect(choices.map((o) => o.id)).not.toContain('take');
    expect(choices.filter((o) => o.id.startsWith('r')).map((o) => o.label)).toEqual(['Replace Loyal']);
    answerEvent(c, l.id, 'r0');
    expect(me(c).traits).toEqual(['showboat', 'mercenary']);
  }, 60000);
});

describe('buying traits', () => {
  it('costs money, goes in the ledger, has a cooldown, and asks you to give one up when you hold three', () => {
    const c = begin('jamie_mercer', 3);
    me(c).traits = ['loyal'];
    c.money = 100;
    expect(buyBlock(c, 'showboat')).toMatch(/costs/);
    c.money = 50000;
    expect(buyTrait(c, 'showboat')).toMatch(/Showboat/);
    expect(me(c).traits).toEqual(['loyal', 'showboat']);
    expect(c.money).toBe(50000 - traitPrice('showboat'));
    expect(c.ledger[0]!.text).toMatch(/Showboat/);
    expect(buyBlock(c, 'resilient')).toMatch(new RegExp(`${TRAIT_BUY_COOLDOWN} days`));
    c.today = addDays(c.today, TRAIT_BUY_COOLDOWN);
    expect(buyBlock(c, 'mercenary')).toMatch(/clashes with Loyal/);
    expect(buyTrait(c, 'big_match')).toMatch(/Big-Match/);
    expect(traitPrice('big_match')).toBeGreaterThan(traitPrice('resilient'));
    c.today = addDays(c.today, TRAIT_BUY_COOLDOWN);
    expect(buyBlock(c, 'resilient')).toMatch(/three/);
    expect(buyTrait(c, 'resilient', 'showboat')).toMatch(/no longer Showboat/);
    expect(me(c).traits).toEqual(['loyal', 'big_match', 'resilient']);
  });
});

describe('the world’s personalities', () => {
  it('change slowly and only for a reason: a few a year, never more than three, never a clash', async () => {
    const c = begin('jamie_mercer', 7);
    const start = new Map(WRESTLERS.map((w) => [w.id, [...(w.traits ?? [])]]));
    for (let i = 0; i < 730; i++) await day(c, quick, 'simmed');
    const H = activeWorld().history;
    const changes = H.events.filter((e) => e.kind === 'trait' && e.who !== c.player);
    const people = WRESTLERS.filter((w) => w.id !== c.player).length;
    const rate = changes.length / (people * 2);
    expect(rate).toBeGreaterThanOrEqual(0.05);
    expect(rate).toBeLessThanOrEqual(0.15);
    for (const w of WRESTLERS) {
      expect(validTraits(w.traits ?? []), `${w.name} ${w.traits}`).toBe(true);
      const before = start.get(w.id);
      // Anyone whose traits changed has it on record.
      if (before && JSON.stringify(before) !== JSON.stringify(w.traits)) expect(changes.some((e) => e.who === w.id), w.name).toBe(true);
    }
    // Every change says what it was.
    for (const e of changes) expect(e.what).toMatch(/^became /);
  }, 180000);

  it('veterans who mentor bring on a young wrestler near them', async () => {
    const c = begin('jamie_mercer', 11);
    const promo = 'VWF';
    const vet = WRESTLERS.find((w) => w.promotion === promo && w.age >= 34 && w.id !== c.player)!;
    vet.traits = ['mentor'];
    const young = WRESTLERS.filter((w) => w.promotion === promo && w.age <= 25 && w.id !== c.player);
    expect(young.length).toBeGreaterThan(0);
    const before = new Map(young.map((w) => [w.id, Object.values(w.stats).reduce((a, b) => a + b, 0)]));
    for (let i = 0; i < 200; i++) await day(c, quick, 'simmed');
    const P = activeWorld().people!;
    const bond = Object.values(P.bonds).find((b) => b.mentor === vet.id);
    expect(bond, 'a mentor bond').toBeTruthy();
    const protege = young.find((w) => w.id === bond!.a || w.id === bond!.b)!;
    const now = Object.values(protege.stats).reduce((a, b) => a + b, 0);
    expect(now).toBeGreaterThan(before.get(protege.id)!);
    expect(bond!.given).toBeLessThanOrEqual(4);
  }, 120000);
});

// Keep the imports honest: titles are read by personality drift (long reigns).
void TITLES;
void ({} as TraitId);
