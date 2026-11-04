import { describe, expect, it } from 'vitest';
import { findWrestler } from '../data/rtr';
import { setWorld, freshWorld } from '../world/world';
import { startCareer } from './index';

describe('your own deal at the start (Lyra’s call: no negotiating)', () => {
  it('any promotion, fee, length and clauses; they move there', () => {
    setWorld(freshWorld(3));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 3, deal: { promo: 'NWGP', fee: 99999, months: 60, clauses: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] } });
    const k = c.people.jamie_mercer!.contract!;
    expect(k).toMatchObject({ promo: 'NWGP', fee: 99999, start: '2026-11-03', end: '2031-11-03', clauses: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] });
    expect(findWrestler('jamie_mercer')!.promotion).toBe('NWGP');
  });
  it('null: a free agent on the indies', () => {
    setWorld(freshWorld(3));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 3, deal: null });
    expect(c.people.jamie_mercer!.contract).toBeNull();
    expect(findWrestler('jamie_mercer')!.promotion).toBe('TIS');
  });
});
