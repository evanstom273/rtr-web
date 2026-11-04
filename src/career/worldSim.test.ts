import { describe, expect, it } from 'vitest';
import { findWrestler, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld, freshWorld, setWorld } from '../world/world';
import { careerFrom, NOBODY, simulateTo, startSpectator } from './index';
import { addDays } from './dates';
import { quick } from './testkit';

describe('the world with nobody playing (Lyra’s history sim)', () => {
  it('runs with every system, never books or writes to Nobody, and hands everything over to your career', async () => {
    setWorld(freshWorld(9));
    const sim = startSpectator({ today: '2026-01-05', seed: 9 });
    await simulateTo(sim, addDays(sim.today, 120), quick);
    expect(sim.letters).toEqual([]);
    const H = activeWorld().history;
    expect(H.shows.length).toBeGreaterThan(100);
    expect(H.shows.some((s) => s.bouts.some((b) => b.a === NOBODY || b.b === NOBODY))).toBe(false);
    // Contracts, title clocks and everyone's state carry over (not regenerated).
    const someone = WRESTLERS.find((w) => w.id !== NOBODY && sim.people[w.id]?.contract && !TITLES.some((t) => t.holder === w.id))!;
    const contracts = Object.fromEntries(Object.entries(sim.people).filter(([id]) => id !== NOBODY).map(([id, p]) => [id, p.contract]));
    const clocks = structuredClone(sim.titles);
    const c = careerFrom(sim, someone.id);
    expect(findWrestler(NOBODY)).toBeUndefined();
    expect(c.people[NOBODY]).toBeUndefined();
    expect(c.today).toBe(sim.today);
    for (const [id, k] of Object.entries(contracts)) if (id !== someone.id) expect(c.people[id]?.contract ?? null).toEqual(k ?? null);
    expect(c.people[someone.id]!.contract).toEqual(contracts[someone.id]);
    expect(c.titles).toEqual(clocks);
    expect(c.spectator).toBeUndefined();
    expect(c.letters.length).toBeGreaterThan(0);
  }, 300000);
});
