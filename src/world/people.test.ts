import { describe, expect, it } from 'vitest';
import { PATIENCE_START } from '../career/tuning';
import { startCareer } from '../career/index';
import { bookerKey, movePatience, patienceOf } from '../career/patience';
import { memoryOf, moveRelation, relLabel, relationOf, relationsList, remember, trust } from '../career/relations';
import { WORLD_REV, activeWorld, freshWorld, setWorld } from './world';
import { WRESTLERS } from '../data/rtr';
import { bondOf, bookerOf, moveBond, pairKey, takeJob, leaveJob, type People } from './people';

function begin(seed = 7) {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed });
  w.career = c;
  return { w, c, P: w.people! };
}

describe('people', () => {
  it('a bond is one record whichever way round you ask', () => {
    const P: People = { staff: {}, brands: {}, bonds: {} };
    expect(pairKey('a', 'b')).toBe(pairKey('b', 'a'));
    moveBond(P, 'b', 'a', 10, 'hello', '2026-01-01');
    moveBond(P, 'a', 'b', 5, 'again', '2026-01-02');
    expect(Object.keys(P.bonds)).toHaveLength(1);
    expect(bondOf(P, 'a', 'b')!.v).toBe(15);
    moveBond(P, 'a', 'b', -40, 'fell out', '2026-01-03', 'friend');
    expect(bondOf(P, 'b', 'a')!.kind).toBeUndefined();
  });

  it('a promotion’s patience and memory belong to whoever books it', () => {
    const { c, P } = begin();
    const vwf = bookerOf(P, 'VWF')!;
    expect(vwf.name).toBe('Dale Whitcombe');
    expect(bookerKey('VWF')).toBe(vwf.id);
    movePatience(c, 'VWF', -10, 'test');
    remember(c, 'VWF', 'kept', 3);
    expect(c.patience![vwf.id]!.v).toBe(PATIENCE_START - 10);
    expect(c.bookers![vwf.id]!.kept).toBe(3);
    expect(c.patience!.VWF).toBeUndefined();
  });

  it('when a booker changes job, their patience, memory and bonds go with them; the newcomer starts fresh', () => {
    const { c, P } = begin();
    const dale = bookerOf(P, 'VWF')!;
    movePatience(c, 'VWF', -20, 'test');
    remember(c, 'VWF', 'offScript', 2);
    moveBond(P, dale.id, c.player, 30, 'old friends', c.today, 'friend');
    const before = trust(c, 'VWF');
    // Dale leaves VWF for TCG; TCG's booker steps aside; someone new takes VWF.
    const colette = bookerOf(P, 'TCG')!;
    leaveJob(colette, c.today, 'quit');
    takeJob(P, dale, { kind: 'booker', promo: 'TCG' }, c.today, 'poached');
    const fresh = { ...structuredClone(colette), id: 'st_newcomer', name: 'New Person', spells: [], job: null };
    P.staff[fresh.id] = fresh;
    takeJob(P, fresh, { kind: 'booker', promo: 'VWF' }, c.today, 'hired');
    expect(patienceOf(c, 'VWF')).toBe(PATIENCE_START);
    expect(memoryOf(c, 'VWF').offScript).toBe(0);
    expect(patienceOf(c, 'TCG')).toBe(PATIENCE_START - 20);
    expect(trust(c, 'TCG')).toBe(before);
    expect(bondOf(P, dale.id, c.player)!.v).toBe(30);
    expect(dale.spells.map((s) => `${s.job.kind === 'booker' ? s.job.promo : ''}:${s.to ?? 'now'}`)).toEqual(['SSWC:2014-08-30', 'VWF:2026-11-03', 'TCG:now']);
  });

  it('your relationships are bonds in the world, mentors and protégés the right way round', () => {
    const { c, P } = begin();
    moveRelation(c, 'ray_hollis', 25, 'taught you', 'mentor');
    moveRelation(c, 'diane_calder', 10, 'you taught her', 'protege');
    expect(relationOf(c, 'ray_hollis')!.kind).toBe('mentor');
    expect(relationOf(c, 'diane_calder')!.kind).toBe('protege');
    expect(bondOf(P, 'ray_hollis', c.player)!.mentor).toBe('ray_hollis');
    expect(bondOf(P, 'diane_calder', c.player)!.mentor).toBe(c.player);
    expect(relLabel(c, 'ray_hollis')).toBe('Mentor');
    expect(relationsList(c).map((x) => x.id)).toEqual(['ray_hollis', 'diane_calder']);
  });

  it('an older save: promotion keys move to their bookers, relationships become bonds, and it happens once', () => {
    const w = freshWorld(3);
    setWorld(w);
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 3 });
    w.career = c;
    // How a rev-2 save looked.
    w.rev = 2;
    delete w.people;
    c.patience = { VWF: { v: 40, log: [{ day: c.today, d: -30, t: 'old' }] }, 'TIS:Pack the House': { v: 55, log: [] } };
    c.bookers = { VWF: { matches: 4, kept: 2, offScript: 1, botched: 0, noShows: 0, good: 1, favours: 0, snubs: 0 } };
    c.relations = { ray_hollis: { v: 20, kind: 'mentor', met: c.today, last: c.today, log: [] } };
    const saved = structuredClone(w);
    setWorld(saved);
    const P = saved.people!;
    const dale = bookerOf(P, 'VWF')!;
    const sc = saved.career!;
    expect(saved.rev).toBe(WORLD_REV);
    expect(sc.patience![dale.id]!.v).toBe(40);
    expect(sc.patience!.VWF).toBeUndefined();
    expect(sc.patience!['TIS:Pack the House']!.v).toBe(55);
    expect(sc.bookers![dale.id]!.offScript).toBe(1);
    expect(sc.relations).toBeUndefined();
    expect(bondOf(P, 'ray_hollis', 'jamie_mercer')!.mentor).toBe('ray_hollis');
    const once = JSON.stringify(saved);
    setWorld(saved);
    expect(JSON.stringify(activeWorld())).toBe(once);
  });

  it('an older save: a smaller indie scene grows to 200, with brands enough to book them, and only once', () => {
    const w = freshWorld(4);
    setWorld(w);
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 4 });
    w.career = c;
    // How a rev-5 save with a scene of 120 looked.
    const old = structuredClone(w);
    old.rev = 5;
    const keep = new Set(old.db.wrestlers.filter((x) => x.promotion === 'TIS').slice(0, 120).map((x) => x.id));
    old.db.wrestlers = old.db.wrestlers.filter((x) => x.promotion !== 'TIS' || keep.has(x.id) || old.db.titles.some((t) => t.holder === x.id));
    const before = old.db.wrestlers.filter((x) => x.promotion === 'TIS').length;
    for (const id of Object.keys(old.people!.brands).slice(8)) delete old.people!.brands[id];
    setWorld(old);
    expect(before).toBeLessThan(200);
    expect(old.rev).toBe(WORLD_REV);
    expect(WRESTLERS.filter((x) => x.promotion === 'TIS')).toHaveLength(200);
    expect(new Set(WRESTLERS.map((x) => x.name)).size).toBe(WRESTLERS.length);
    const brands = Object.values(old.people!.brands);
    expect(brands.length).toBeGreaterThan(8);
    for (const b of brands) expect(b.promoter, b.name).toBeTruthy();
    const once = JSON.stringify(old);
    setWorld(old);
    expect(JSON.stringify(activeWorld())).toBe(once);
  });
});
