import { describe, expect, it } from 'vitest';
import { runBatch, type HitModel } from './runHeadless';

const MODELS: [string, HitModel][] = [
  ['fixed 60%', { kind: 'fixed', rate: 0.6 }],
  ['skill σ=6', { kind: 'skill', sigma: 6 }],
];

describe.each(MODELS)('headless simulation (%s)', (_name, model) => {
  const results = runBatch({ n: 300, seed: 1000, model });

  it('every match ends', () => {
    const unfinished = results.filter((r) => !r.ended);
    expect(unfinished.map((r) => `${r.you} v ${r.them}: ${r.stuck}`)).toEqual([]);
  });

  it('never gets stuck or loops', () => {
    expect(results.filter((r) => r.stuck)).toEqual([]);
    // A match is ~a few hundred engine steps; anything near the cap means a loop.
    expect(Math.max(...results.map((r) => r.steps))).toBeLessThan(5000);
  });

  it('the AI never picks an invalid move, setup or pin, for either side', () => {
    expect(results.flatMap((r) => r.invalidChoices)).toEqual([]);
  });

  it('every finished match has a result and a rating in range', () => {
    for (const r of results) {
      expect(r.result).not.toBeNull();
      expect(r.rating!.stars).toBeGreaterThanOrEqual(0.25);
      expect(r.rating!.stars).toBeLessThanOrEqual(5);
      expect(['pin', 'sub']).toContain(r.result!.how);
    }
  });

  it('is deterministic', () => {
    const again = runBatch({ n: 20, seed: 1000, model });
    expect(again.map((r) => [r.result?.t, r.rating?.raw])).toEqual(results.slice(0, 20).map((r) => [r.result?.t, r.rating?.raw]));
  });
});
