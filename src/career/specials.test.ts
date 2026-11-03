// One-off shows and the living world (expansion stage 4): cups run a clean bracket, crossovers keep titles
// off and never pair the A.R.I.S.E. promotions, farewells book the retiring wrestler, champions don't retire,
// and the retired are never booked again.
import { describe, expect, it } from 'vitest';
import { PROMOTIONS, TITLES, WRESTLERS, findWrestler } from '../data/rtr';
import { activeWorld, freshWorld, setWorld } from '../world/world';
import { addDays } from './dates';
import { answerEvent, applyBout, arrangeFarewell, finishDay, makeSpecial, myBoutToday, startCareer, tourneyPairs } from './index';
import { seededRng } from '../engine/rng';
import type { SimJob, SimOut } from './sim';
import type { Career } from './types';

const quick = async (jobs: SimJob[]): Promise<SimOut[]> => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const pa = a.popularity.global / (a.popularity.global + b.popularity.global);
  return { key: j.key, winner: (j.seed % 1000) / 1000 < pa ? 'you' : 'them', finish: 'PINFALL', t: 600, stars: 3, stats: { you: {} as never, them: {} as never } };
});

function begin(player = 'bishop_blackridge', seed = 5): Career {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player, today: '2026-11-03', seed });
  w.career = c;
  return c;
}
async function days(c: Career, n: number, each?: () => void): Promise<void> {
  for (let i = 0; i < n; i++) {
    const mine = myBoutToday(c);
    if (mine) applyBout(c, mine.show, mine.index, (await quick([{ key: 'mine', seed: i, you: mine.bout.a, them: mine.bout.b, rules: {} }]))[0]!, true);
    each?.();
    await finishDay(c, quick);
  }
}

describe('one-off shows', () => {
  it('a cup runs a clean bracket over three shows: winners go through, one champion, in the records', async () => {
    const c = begin();
    makeSpecial(c, 'tournament');
    const t = c.tourneys![0]!;
    expect(t.shows).toHaveLength(3);
    const final = c.shows[t.shows[2]!]!;
    await days(c, Object.keys(c.shows).length && Math.ceil((Date.parse(final.date) - Date.parse(c.today)) / 864e5) + 2);
    expect(t.entrants.filter(Boolean)).toHaveLength(8);
    expect(new Set(t.entrants).size).toBe(8);
    for (let r = 1; r < 3; r++) for (const [x, y] of tourneyPairs(t, r)) expect([...t.won[r - 1]!]).toEqual(expect.arrayContaining([x, y].filter(Boolean)));
    expect(t.winner).toBeTruthy();
    expect(t.won[2]![0]).toBe(t.winner);
    expect(activeWorld().history.events.some((e) => e.kind === 'tournament' && e.who === t.winner && e.what === t.name)).toBe(true);
  }, 60000);

  it('entering the cup books you round by round while you keep winning', async () => {
    const c = begin('ama_quaye', 19);
    makeSpecial(c, 'tournament');
    const t = c.tourneys![0]!;
    const inv = c.letters.find((l) => l.action?.type === 'event' && l.action.event === 'invite_cup');
    if (!inv) throw new Error('no cup invite');
    answerEvent(c, inv.id, 'yes');
    expect(t.player).toBe(true);
    expect(c.indie[t.shows[0]!]).toBeTruthy();
    const qf = c.shows[t.shows[0]!]!;
    await days(c, Math.ceil((Date.parse(qf.date) - Date.parse(c.today)) / 864e5) + 2);
    const mine = tourneyPairs(t, 0).findIndex(([x, y]) => x === c.player || y === c.player);
    expect(mine).toBeGreaterThanOrEqual(0);
    if (t.won[0]![mine] === c.player) expect(c.indie[t.shows[1]!]).toBeTruthy();
    else expect(c.letters.some((l) => l.subject.startsWith('Out in the'))).toBe(true);
  }, 60000);

  it('a crossover never puts titles on the line, never pairs ZWA with NWGP, and mostly matches the rosters against each other', async () => {
    const c = begin();
    let made = 0;
    for (let i = 0; i < 6; i++) if (makeSpecial(c, 'crossover', String(i))) made++;
    const xs = Object.values(c.shows).filter((s) => s.special?.kind === 'crossover');
    expect(xs.length).toBe(made);
    for (const s of xs) expect(s.promos!.every((p) => ['ZWA', 'NWGP'].includes(p))).toBe(false);
    const last = xs.map((s) => s.date).sort().pop()!;
    let bouts = 0, cross = 0;
    await days(c, Math.ceil((Date.parse(last) - Date.parse(c.today)) / 864e5) + 1, () => {
      for (const s of xs) if (s.date === c.today && s.card) for (const b of s.card) {
        expect(b.title).toBeUndefined();
        bouts++;
        if (findWrestler(b.a)?.promotion !== findWrestler(b.b)?.promotion) cross++;
      }
    });
    expect(bouts).toBeGreaterThan(0);
    expect(cross / bouts).toBeGreaterThan(0.6);
  }, 120000);

  it('a farewell books the retiring wrestler on their night, then they retire and are never booked again', async () => {
    const c = begin();
    const promo = PROMOTIONS.find((p) => !p.indie && p.initials !== findWrestler(c.player)!.promotion)!.initials;
    const w = WRESTLERS.find((x) => x.promotion === promo && !TITLES.some((t) => t.holder === x.id) && !c.feuds.some((f) => f.a === x.id || f.b === x.id))!;
    const day = arrangeFarewell(c, w, seededRng(1));
    c.people[w.id]!.retiring = day;
    const show = Object.values(c.shows).find((s) => s.special?.kind === 'farewell' && s.special.for === w.id)!;
    expect(show.date).toBe(day);
    await days(c, Math.ceil((Date.parse(day) - Date.parse(c.today)) / 864e5) + 2);
    expect(show.card?.some((b) => b.farewell && (b.a === w.id || b.b === w.id))).toBe(true);
    expect(c.people[w.id]!.retired).toBe(true);
    expect(activeWorld().history.events.some((e) => e.kind === 'retired' && e.who === w.id)).toBe(true);
    await days(c, 30, () => {
      for (const s of Object.values(c.shows)) if (s.card && s.date > day) for (const b of s.card) expect([b.a, b.b]).not.toContain(w.id);
    });
  }, 120000);

  it('a champion on farewell night carries on instead of retiring with the belt', async () => {
    const c = begin();
    const t = TITLES.find((x) => x.holder && x.holder !== c.player)!;
    const p = c.people[t.holder!]!;
    p.retiring = addDays(c.today, -1);
    await days(c, 1);
    expect(p.retired).toBeFalsy();
    expect(p.retiring).toBeUndefined();
    expect(t.holder).toBeTruthy();
  });

  it('a benefit night goes on for someone out long-term', () => {
    const c = begin();
    const w = WRESTLERS.filter((x) => x.id !== c.player).sort((a, b) => b.popularity.global - a.popularity.global)[3]!;
    c.people[w.id]!.injury = { until: addDays(c.today, 50), what: 'knee' } as never;
    expect(makeSpecial(c, 'benefit')).toBe(true);
    const s = Object.values(c.shows).find((x) => x.special?.kind === 'benefit')!;
    expect(s.special!.for).toBe(w.id);
    expect(makeSpecial(c, 'benefit', 'again')).toBe(false); // once per injury
  });

  it('a save from before the expansion (no events, cups or world state) carries on', async () => {
    const c = begin();
    const old = c as unknown as Record<string, unknown>;
    for (const k of ['events', 'world', 'tourneys', 'relations', 'bookers']) delete old[k];
    for (const s of Object.values(c.shows)) delete s.special;
    await days(c, 60);
    expect(c.events).toBeTruthy();
    expect(c.world).toBeTruthy();
  }, 60000);

  it('two years of the living world: nobody retired is ever booked, no title on a no-titles show, no retired champion', async () => {
    const c = begin('jamie_mercer', 3);
    await days(c, 730, () => {
      for (const s of Object.values(c.shows)) if (s.date === c.today && s.card) for (const b of s.card) {
        if (s.special?.noTitles) expect(b.title).toBeUndefined();
        for (const id of [b.a, b.b]) expect(c.people[id]?.retired, `${id} on ${s.name}`).toBeFalsy();
      }
    });
    expect(TITLES.filter((t) => t.holder && c.people[t.holder]?.retired)).toHaveLength(0);
    const ev = activeWorld().history.events;
    expect(ev.some((e) => e.kind === 'retired')).toBe(true);
    expect(ev.some((e) => e.kind === 'tournament')).toBe(true);
  }, 300000);
});
