import { describe, expect, it } from 'vitest';
import { findWrestler, PROMOTIONS, TITLES } from '../data/rtr';
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
  it('moving strips the belt (Lyra’s call); staying keeps it', () => {
    setWorld(freshWorld(3));
    const champ = TITLES.find((t) => t.holder && findWrestler(t.holder)?.promotion === 'VWF' && PROMOTIONS.find((p) => p.initials === 'VWF')!.titles.includes(t.id))!;
    const who = champ.holder!;
    const c = startCareer({ player: who, today: '2026-11-03', seed: 3, deal: { promo: 'TCG', fee: 5000, months: 12, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
    expect(champ.holder).toBeNull();
    expect(c.letters.some((l) => /stripped/.test(l.subject))).toBe(true);
    setWorld(freshWorld(3));
    const again = TITLES.find((t) => t.id === champ.id)!;
    startCareer({ player: again.holder!, today: '2026-11-03', seed: 3, deal: { promo: 'VWF', fee: 5000, months: 12, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
    expect(again.holder).toBe(who);
  });
  it('null: a free agent on the indies', () => {
    setWorld(freshWorld(3));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 3, deal: null });
    expect(c.people.jamie_mercer!.contract).toBeNull();
    expect(findWrestler('jamie_mercer')!.promotion).toBe('TIS');
  });
});
