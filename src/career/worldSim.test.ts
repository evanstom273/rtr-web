import { describe, expect, it } from 'vitest';
import { findWrestler, shippedWrestler, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld, freshWorld, setWorld } from '../world/world';
import { backdate, beginHistory, careerFrom, headline, historyOf, NOBODY, onesToWatch, runHistoryYear, simulateTo, startSpectator, summarise } from './index';
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

describe('backdated history (Lyra’s calls)', () => {
  it('rewinds everyone, holds back the too-young, crowns the best fits, and brings them in on their day', async () => {
    setWorld(freshWorld(12));
    const ages = new Map(WRESTLERS.map((w) => [w.id, w.age]));
    const { start, waiting } = backdate(10, '2026-11-04', 12);
    expect(start).toBe('2016-11-04');
    // About half the shipped roster is too young ten years back; only shipped wrestlers wait.
    expect(waiting.length).toBeGreaterThan(100);
    for (const x of waiting) expect(shippedWrestler(x.w.id)).toBeTruthy();
    for (const w of WRESTLERS.filter((x) => shippedWrestler(x.id))) expect(w.age).toBe(ages.get(w.id)! - 10);
    // A fresh indie scene for back then (Lyra's call): as big as a new world's, none of today's generated indies.
    const indies = WRESTLERS.filter((w) => w.promotion === 'TIS' && !shippedWrestler(w.id));
    expect(indies.length).toBeGreaterThanOrEqual(200);
    expect(indies.every((w) => w.id.startsWith('hist_'))).toBe(true);
    for (const x of waiting) expect(x.w.age).toBeGreaterThanOrEqual(19);
    // Every major title has a champion of the right gender from its own roster.
    for (const t of TITLES.filter((x) => !x.id.includes('INDEPENDENT') && !x.id.startsWith('ARISE') && !x.id.includes('OPEN_CHALLENGE') && !x.id.includes('GRAND_PRIX'))) {
      const h = t.holder ? findWrestler(t.holder) : undefined;
      if (h) expect(h.gender).toBe(t.gender);
    }
    const sim = startSpectator({ today: start, seed: 12 });
    sim.waiting = waiting;
    const total = waiting.length, due = waiting.filter((x) => x.on < addDays(start, 365)).length;
    await simulateTo(sim, addDays(start, 365), quick);
    expect(sim.waiting.length).toBe(total - due);
    // No collapse: the indie scene is still there a year in.
    expect(WRESTLERS.filter((w) => w.promotion === 'TIS' && !sim.people[w.id]?.retired && w.id !== NOBODY).length).toBeGreaterThanOrEqual(150);
    expect(activeWorld().history.events.filter((e) => e.kind === 'debut').length).toBeGreaterThanOrEqual(due);
  }, 300000);
});

describe('the history sim, year by year (Lyra’s calls)', () => {
  it('begins, runs a year at a time with a summary, and starts a career at the end', async () => {
    setWorld(freshWorld(21));
    beginHistory(2, '2026-11-04');
    const s = historyOf()!;
    expect(s.start).toBe('2024-11-04');
    const seen: string[] = [];
    let last = activeWorld().history.events.length;
    expect(await runHistoryYear(quick, () => { const ev = activeWorld().history.events; for (const e of ev.slice(last)) { const h = headline(e); if (h) seen.push(h); } last = ev.length; })).toBe(true);
    expect(s.reached).toBe(1);
    expect(seen.length).toBeGreaterThan(5);
    const y1 = summarise(s.start, s.career.today);
    expect(y1.champions.length).toBeGreaterThanOrEqual(10);
    expect(y1.best.length).toBeGreaterThan(0);
    expect(await runHistoryYear(quick)).toBe(true);
    expect(s.career.today).toBe('2026-11-04');
    expect(await runHistoryYear(quick)).toBe(false);
    expect(onesToWatch().length).toBeGreaterThan(0);
    const pick = WRESTLERS.find((w) => w.promotion === 'VWF' && w.id !== NOBODY)!;
    const c = careerFrom(s.career, pick.id);
    expect(c.today).toBe('2026-11-04');
    expect(findWrestler(NOBODY)).toBeUndefined();
  }, 600000);
});
