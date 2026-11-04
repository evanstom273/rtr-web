import { describe, expect, it } from 'vitest';
import { findWrestler, globalScore } from '../data/rtr';
import { C, tierOf } from './clauses';
import { creativeAsk, creativeBouts, creativeOdds, vetoNext } from './creative';
import { dealWith } from './deals';
import { begin, day } from './testkit';
import type { Career } from './types';

/** A career a week in, so cards are drawn, with your Creative Control at `tier`. */
async function withCreative(tier: number, seed = 7): Promise<Career> {
  const c = begin('jamie_mercer', seed);
  c.people[c.player]!.contract!.clauses[C.creative] = tier;
  for (let i = 0; i < 2; i++) await day(c);
  return c;
}

describe('Creative Control (Lyra’s design)', () => {
  it('Full Creative Control decides: win or lose, the main event, a feud, a turn', async () => {
    const c = await withCreative(3);
    const b = creativeBouts(c)[0];
    expect(b).toBeTruthy();
    const promo = b!.show.promo;
    const opp = b!.bout.a === c.player ? b!.bout.b : b!.bout.a;
    if (b!.bout.planned !== opp) {
      expect(creativeAsk(c, { kind: 'lose', promo, show: b!.show.id }).answer).toBe('yes');
      expect(b!.bout.planned).toBe(opp);
    }
    expect(creativeAsk(c, { kind: 'win', promo, show: b!.show.id }).answer).toBe('yes');
    expect(b!.bout.planned).toBe(c.player);
    expect(creativeAsk(c, { kind: 'lose', promo, show: b!.show.id }).answer).toBe('yes');
    expect(b!.bout.planned).toBe(opp);
    if (b!.show.card!.at(-1) !== b!.bout) expect(creativeAsk(c, { kind: 'position', promo, show: b!.show.id }).answer).toBe('yes');
    expect(b!.show.card!.at(-1)).toBe(b!.bout);
    const was = findWrestler(c.player)!.disposition;
    expect(creativeAsk(c, { kind: 'turn', promo }).answer).toBe('yes');
    expect(findWrestler(c.player)!.disposition).not.toBe(was);
    const rival = findWrestler(opp)!;
    c.feuds = c.feuds.filter((f) => f.a !== c.player && f.b !== c.player);
    expect(creativeAsk(c, { kind: 'feud', promo, opp: rival.id }).answer).toBe('yes');
    expect(c.feuds.some((f) => !f.done && f.a === c.player && f.b === rival.id)).toBe(true);
    expect(creativeAsk(c, { kind: 'endFeud', promo }).answer).toBe('yes');
  });

  it('Protected Booking: asks by the odds, and a veto about once a month that can’t be refused', async () => {
    const c = await withCreative(2);
    const b = creativeBouts(c)[0]!;
    const promo = b.show.promo;
    expect(vetoNext(c, promo)).toBeNull();
    const first = b.bout.planned === c.player ? 'lose' : 'win';
    expect(creativeAsk(c, { kind: first, promo, show: b.show.id }, true).answer).toBe('yes');
    expect(vetoNext(c, promo)).not.toBeNull();
    // The veto's spent: using it again is refused until the month's up.
    expect(creativeAsk(c, { kind: first === 'win' ? 'lose' : 'win', promo, show: b.show.id }, true).said).toMatch(/veto’s used/);
  });

  it('Consultation: the odds follow the booker’s patience', async () => {
    const c = await withCreative(1);
    const promo = c.people[c.player]!.contract!.promo;
    const before = creativeOdds(c, promo);
    (c.patience ??= {});
    const key = Object.keys(c.patience).find((x) => x.includes(promo));
    if (key) { c.patience[key]!.v = 10; expect(creativeOdds(c, promo)).toBeLessThan(before); }
    // Without the clause: no.
    c.people[c.player]!.contract!.clauses[C.creative] = 0;
    expect(creativeAsk(c, { kind: 'turn', promo }).said).toMatch(/no Creative Control/);
  });

  it('AI stars with Creative Control protect themselves against anyone below them, outside title matches', async () => {
    const c = begin('jamie_mercer', 11);
    for (let i = 0; i < 10; i++) await day(c);
    let checked = 0;
    for (const s of Object.values(c.shows)) {
      if (s.promo === 'TIS' || !s.card) continue;
      for (const b of s.card) {
        if (b.title || b.tourney || b.farewell || b.tryout || b.a === c.player || b.b === c.player) continue;
        const wa = findWrestler(b.a)!, wb = findWrestler(b.b)!;
        const top = globalScore(wa) >= globalScore(wb) ? wa : wb;
        const say = tierOf(dealWith(c.people[top.id], s.promo), 'creative');
        if (say >= 1) { expect(b.planned).toBe(top.id); checked++; }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
