import { describe, expect, it } from 'vitest';
import { runBatch, runHeadless } from './runHeadless';

describe('headless simulation', () => {
  const batch = runBatch(60, 4242, { kind: 'skill', sigmaSeconds: 0.09 });

  it('every match ends without getting stuck', () => {
    for (const r of batch) {
      expect(r.stuck, `${r.you} v ${r.them}`).toBeNull();
      expect(r.ended).toBe(true);
      expect(r.result).not.toBeNull();
      expect(r.rating).not.toBeNull();
    }
  });

  it('the AI never makes an invalid choice', () => {
    expect(batch.flatMap((r) => r.invalid)).toEqual([]);
  });

  it('produces a spread of finishes', () => {
    const kinds = new Set(batch.map((r) => r.result!.finish));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('the player has to hit the cover after pin combos', () => {
    const covers = batch.reduce((n, r) => n + r.engine.state.log.filter((l) => l.segs.some((sg) => sg.k === 'text' && sg.v.includes("can't hold the cover"))).length, 0);
    // With σ = 90ms some covers are missed somewhere in 60 matches.
    expect(covers).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const a = runHeadless({ seed: 7, you: batch[0]!.you, them: batch[0]!.them, model: { kind: 'fixed', rate: 0.6 } });
    const b = runHeadless({ seed: 7, you: batch[0]!.you, them: batch[0]!.them, model: { kind: 'fixed', rate: 0.6 } });
    expect(a.steps).toBe(b.steps);
    expect(a.result).toEqual(b.result);
    expect(a.engine.state.log.length).toBe(b.engine.state.log.length);
  });
});
