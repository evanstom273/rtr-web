import { describe, expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { RATING_CURVE } from '../../career/tuning';
import { seededRng } from '../rng';
import { matchFeatures, ratingComposite, ratingCurve, ratingDims, type MatchFeatures } from '../rating';
import { runHeadless } from '../sim/runHeadless';
import type { MatchRulesConfig, StipulationId } from '../types';

const base: MatchFeatures = {
  mins: 18, avg: 50, peak: 85, heatSeg: true, comeback: true, limbN: 5, payoff: true, repeats: 0, rest: 2, nf: 3, nearTaps: 0, fk: 1, finRev: 1,
  reversals: 8, counters: 2, ropeBreaks: 0, stip: 0, tableBreaks: 0, weaponHits: 0, bleeds: 0, high: 2, spots: 1, bigHits: 2,
  how: 'pin', byFin: true, afterFk: true, byFlash: false, title: false, big: false,
};

describe('match ratings (Lyra’s call: median about 3★, 4★+ about 12%, 4.5★+ about 2%, 5★ about 1 in 1,000)', () => {
  it('the curve only ever rises, and every score is between 0 and 1', () => {
    for (let i = 1; i < RATING_CURVE.at.length; i++) {
      expect(RATING_CURVE.at[i]!).toBeGreaterThanOrEqual(RATING_CURVE.at[i - 1]!);
      expect(RATING_CURVE.stars[i]!).toBeGreaterThan(RATING_CURVE.stars[i - 1]!);
    }
    let last = -1;
    for (let c = 0; c <= 1.0001; c += 0.01) {
      const s = ratingCurve(c);
      expect(s).toBeGreaterThanOrEqual(last);
      last = s;
    }
    for (const v of Object.values(ratingDims(base))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('the best four count: a technical classic isn’t marked down for having no high spots', () => {
    const technical = { ...base, high: 0, spots: 0, bigHits: 0, nearTaps: 3, ropeBreaks: 2, how: 'sub' as const, byFin: true };
    const d = ratingDims(technical);
    expect(d.spectacle).toBe(0);
    // Dropping the empty dimension: the composite is the weighted mean of the other four.
    expect(ratingComposite(d)).toBeCloseTo(ratingComposite({ ...d, spectacle: 0.0001 }), 3);
    expect(ratingComposite(d)).toBeGreaterThan(0.7);
  });

  it('more drama, a hotter crowd or a better finish never lowers the rating', () => {
    const c0 = ratingComposite(ratingDims(base));
    expect(ratingComposite(ratingDims({ ...base, nf: 6, fk: 2 }))).toBeGreaterThanOrEqual(c0);
    expect(ratingComposite(ratingDims({ ...base, avg: 60, peak: 96 }))).toBeGreaterThanOrEqual(c0);
    expect(ratingComposite(ratingDims({ ...base, how: 'dq', byFin: false, afterFk: false }))).toBeLessThan(c0);
  });

  it('a few hundred matches land near the targets, and promotion size plays no part', () => {
    const rnd = seededRng(4242);
    const stars: number[] = [];
    for (let i = 0; i < 160; i++) {
      const a = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!;
      const pool = WRESTLERS.filter((w) => w.id !== a.id && w.gender === a.gender);
      const b = pool[Math.floor(rnd() * pool.length)]!;
      const r = runHeadless({ seed: 70000 + i, you: a.id, them: b.id, model: { kind: 'skill', sigmaSeconds: 0.1 } });
      if (r.rating) stars.push(r.rating.stars);
    }
    stars.sort((x, y) => x - y);
    const median = stars[Math.floor(stars.length / 2)]!;
    const four = stars.filter((s) => s >= 4).length / stars.length;
    expect(median).toBeGreaterThanOrEqual(2.5);
    expect(median).toBeLessThanOrEqual(3.5);
    expect(four).toBeLessThan(0.3);
    // The engine never reads promotion size: the same match rates the same under any banner.
    const [a, b] = [WRESTLERS[0]!, WRESTLERS.find((w) => w.id !== WRESTLERS[0]!.id && w.gender === WRESTLERS[0]!.gender)!];
    const big = runHeadless({ seed: 5, you: a.id, them: b.id, model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { eventPromotion: 'TCG' } as MatchRulesConfig });
    const small = runHeadless({ seed: 5, you: a.id, them: b.id, model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { eventPromotion: '' } as MatchRulesConfig });
    expect(big.rating!.stars).toBe(small.rating!.stars);
  }, 120_000);

  // The full check (RATING=1): a few thousand matches across stipulations and titles.
  it.skipIf(!process.env.RATING)('a few thousand matches hit the long-run targets', () => {
    const rnd = seededRng(99);
    const STIPS: StipulationId[] = ['no_dq', 'tables', 'ladder', 'steel_cage', 'submission', 'last_man_standing'];
    const stars: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const a = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!;
      const pool = WRESTLERS.filter((w) => w.id !== a.id && w.gender === a.gender);
      const b = pool[Math.floor(rnd() * pool.length)]!;
      const rules = { stipulation: rnd() < 0.12 ? STIPS[Math.floor(rnd() * STIPS.length)]! : 'standard', ...(rnd() < 0.15 ? { title: true } : {}) } as MatchRulesConfig;
      const r = runHeadless({ seed: 900000 + i, you: a.id, them: b.id, rules, model: { kind: 'skill', sigmaSeconds: rnd() < 0.3 ? 0.07 : 0.1 } });
      if (r.rating) stars.push(r.rating.stars);
      void matchFeatures;
    }
    stars.sort((x, y) => x - y);
    const at = (t: number) => stars.filter((s) => s >= t).length / stars.length;
    console.log(`median ${stars[Math.floor(stars.length / 2)]} · 4★+ ${(at(4) * 100).toFixed(1)}% · 4.5★+ ${(at(4.5) * 100).toFixed(2)}% · 5★ ${(at(5) * 100).toFixed(2)}%`);
    expect(stars[Math.floor(stars.length / 2)]).toBe(3);
    expect(at(4)).toBeGreaterThan(0.08);
    expect(at(4)).toBeLessThan(0.16);
    expect(at(4.5)).toBeGreaterThan(0.008);
    expect(at(4.5)).toBeLessThan(0.035);
    expect(at(5)).toBeLessThan(0.005);
  }, 900_000);
});
