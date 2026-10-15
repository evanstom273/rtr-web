import { describe, expect, it } from 'vitest';
import { MOVES, PROMOTIONS, TITLES, WRESTLERS, getMove } from './index';

describe('imported RtR content', () => {
  it('has the full catalogue', () => {
    expect(MOVES).toHaveLength(656);
    expect(WRESTLERS).toHaveLength(400);
    expect(PROMOTIONS).toHaveLength(11);
    expect(TITLES).toHaveLength(33);
  });

  it('every wrestler has a complete 40/2/3 moveset of real moves', () => {
    for (const w of WRESTLERS) {
      expect(w.moves, w.name).toHaveLength(40);
      expect(w.signatures, w.name).toHaveLength(2);
      expect(w.finishers, w.name).toHaveLength(3);
      for (const id of [...w.moves, ...w.signatures, ...w.finishers]) expect(() => getMove(id)).not.toThrow();
    }
  });

  it('every wrestler belongs to a promotion', () => {
    const initials = new Set(PROMOTIONS.map((p) => p.initials));
    for (const w of WRESTLERS) expect(initials.has(w.promotion), w.name).toBe(true);
  });

  it('move impacts are 1–10 and every move targets something', () => {
    for (const m of MOVES) {
      expect(m.impact).toBeGreaterThanOrEqual(1);
      expect(m.impact).toBeLessThanOrEqual(10);
      expect(m.parts.length, m.name).toBeGreaterThan(0);
    }
  });

  it('no encoding damage survived the import', () => {
    const text = JSON.stringify([WRESTLERS, MOVES, PROMOTIONS, TITLES]);
    expect(text).not.toMatch(/Ã|Â/);
  });

  it('matches the doc content counts', () => {
    const byType = (t: string) => MOVES.filter((m) => m.type === t).length;
    expect(byType('STRIKE')).toBe(60);
    expect(byType('GRAPPLE')).toBe(246);
    expect(byType('SUBMISSION')).toBe(80);
    expect(byType('AERIAL')).toBe(62);
    expect(byType('SPRINGBOARD')).toBe(55);
    expect(byType('RUNNING')).toBe(113);
    expect(byType('PINNING_MOVE')).toBe(40);
    expect(MOVES.filter((m) => m.finisher)).toHaveLength(59);
    expect(MOVES.filter((m) => m.flashPin)).toHaveLength(40);
  });
});
