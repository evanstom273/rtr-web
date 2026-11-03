import { describe, expect, it } from 'vitest';
import { trainingPrice } from '../../career/economy';
import { costOf } from './Training';

describe('training prices', () => {
  it('lining up points costs each point at the running total, whichever attribute', () => {
    expect(costOf(405, 0)).toBe(0);
    expect(costOf(405, 1)).toBe(trainingPrice(405));
    expect(costOf(405, 3)).toBe(trainingPrice(405) + trainingPrice(406) + trainingPrice(407));
    // Prices only climb.
    for (let t = 320; t < 520; t++) expect(trainingPrice(t + 1)).toBeGreaterThanOrEqual(trainingPrice(t));
  });
});
