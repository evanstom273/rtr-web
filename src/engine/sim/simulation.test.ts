import { describe, expect, it } from 'vitest';
import { STIPULATIONS } from '../stipulations';
import { pairings, runBatch, runHeadless } from './runHeadless';

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

  it('holds are sometimes worked rather than cranked for the tap', () => {
    const worked = batch.reduce((n, r) => n + r.engine.state.log.filter((l) => l.segs.some((sg) => sg.k === 'text' && /let(s|ting) go/.test(sg.v))).length, 0);
    expect(worked).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const a = runHeadless({ seed: 7, you: batch[0]!.you, them: batch[0]!.them, model: { kind: 'fixed', rate: 0.6 } });
    const b = runHeadless({ seed: 7, you: batch[0]!.you, them: batch[0]!.them, model: { kind: 'fixed', rate: 0.6 } });
    expect(a.steps).toBe(b.steps);
    expect(a.result).toEqual(b.result);
    expect(a.engine.state.log.length).toBe(b.engine.state.log.length);
  });

  it('every stipulation finishes without getting stuck, by its own kind of finish', () => {
    for (const st of STIPULATIONS) {
      pairings(6, 900).forEach(([you, them], i) => {
        const r = runHeadless({ seed: 900 + i, you, them, model: { kind: 'skill', sigmaSeconds: 0.09 }, rules: { stipulation: st.id } });
        expect(r.stuck, `${st.id}: ${you} v ${them}`).toBeNull();
        expect(r.invalid, st.id).toEqual([]);
        if (st.id === 'tables') expect(r.result!.finish).toBe('TABLES');
        if (st.id === 'ladder') expect(r.result!.finish).toBe('LADDER');
        if (st.id === 'last_man_standing') expect(r.result!.finish).toBe('TEN_COUNT');
        if (st.id === 'i_quit') expect(r.result!.finish).toBe('I_QUIT');
        if (st.id === 'submission') expect(r.result!.finish).toBe('SUBMISSION');
      });
    }
  }, 120_000);
});
