import { describe, expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { createSide, sideMove } from '../side';

describe('your own names for your finishers (Lyra’s call)', () => {
  it('a side uses your names for your finishers and signatures, and the same move is the same object everywhere', () => {
    const w = structuredClone(WRESTLERS[0]!);
    const fin = w.finishers[0]!;
    w.moveNames = { [fin]: 'The Big Finish' };
    const s = createSide(w, 'you');
    expect(s.finishers[0]!.name).toBe('The Big Finish');
    expect(sideMove(s, fin)).toBe(s.finishers[0]);
    expect(s.all.filter((m) => m.id === fin)).toHaveLength(1);
    // Nobody else's change.
    const plain = createSide(structuredClone(WRESTLERS[1]!), 'them');
    expect(plain.finishers[0]!.name).not.toBe('The Big Finish');
  });
});
