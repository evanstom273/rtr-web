// Relationships and social life, stage 1 (Lyra's redesign): two dials each way, reading people, a lived-in world,
// your circle, backstage encounters, feuds spilling over, drift and pruning, wellbeing and its effects, goals, and
// older saves brought to life.
import { describe, expect, it } from 'vitest';
import { findWrestler, WRESTLERS, type Wrestler } from '../data/rtr';
import { activeWorld, freshWorld, setWorld, WORLD_REV } from '../world/world';
import { bondOf, bondsOf, ensureBond, kindOf, likeOf, pairKey, type Bond } from '../world/people';
import { schoolOf } from '../world/social';
import { applyBout, boutRules, moveRelation, relationOf, relationsList, relLabel, startCareer } from './index';
import { encounter, moodOf, moodTarget, updateMood } from './socialLife';
import type { SimOut } from './sim';
import { begin, day, quick } from './testkit';
import { BOND_KIND, MOOD_FX, SOCIAL_PRUNE, SOCIAL_READ, SOCIAL_TOUCH } from './tuning';
import type { Career, Show } from './types';
import { seededRng } from '../engine/rng';

const P = () => activeWorld().people!;
const theirs = (b: Bond, id: string) => (b.a === id ? b.lb : b.la);
const out = (winner: 'you' | 'them', stars = 3): SimOut => ({ key: 'x', winner, finish: 'PINFALL', t: 600, stars, stats: { you: {} as never, them: {} as never } });

describe('relationships and social life', () => {
  it('a fresh world is lived-in: friends, best friends, grudges, rivals at the top, veterans with protégés, bookers with favourites', () => {
    const c = begin('jamie_mercer', 7);
    const bonds = Object.values(P().bonds);
    const kinds = bonds.map((b) => kindOf(b, c.today));
    expect(bonds.length).toBeGreaterThan(WRESTLERS.length * 3);
    expect(kinds.filter((k) => k === 'friend').length).toBeGreaterThan(100);
    expect(kinds.filter((k) => k === 'best_friend').length).toBeGreaterThan(10);
    expect(kinds.filter((k) => k === 'enemy').length).toBeGreaterThan(10);
    expect(kinds.filter((k) => k === 'rival').length).toBeGreaterThan(0);
    expect(bonds.some((b) => b.mentor)).toBe(true);
    expect(bonds.some((b) => P().staff[b.a] || P().staff[b.b])).toBe(true);
    // Feelings are one-sided: plenty of pairs where one likes the other far more.
    expect(bonds.filter((b) => Math.abs(b.la - b.lb) >= 30).length).toBeGreaterThan(50);
    expect(P().lived).toBe(c.today);
  });

  it('you start with a small circle: your trainer, a school mate or two, and family', () => {
    const c = begin('jamie_mercer', 7);
    const folk = P().folk ?? {};
    const mine = relationsList(c);
    const trainer = mine.find((x) => folk[x.id]?.kind === 'trainer');
    const family = mine.filter((x) => folk[x.id]?.kind === 'family');
    expect(trainer).toBeTruthy();
    expect(family.length).toBeGreaterThanOrEqual(1);
    expect(family.length).toBeLessThanOrEqual(3);
    for (const f of family) expect(f.r.like).toBeGreaterThanOrEqual(60);
    const me = findWrestler(c.player)!;
    const school = schoolOf(activeWorld().seed, me.id, me.country);
    expect(folk[trainer!.id]!.school).toBe(school.id);
    // School mates are friends.
    const mates = mine.filter((x) => findWrestler(x.id) && (x.r.log ?? []).some((l) => l.t.startsWith('Came up together')));
    expect(mates.length).toBeGreaterThanOrEqual(1);
    for (const m of mates) expect(['Friend', 'Best friend', 'Friendly rival', 'Rival', 'Mentor', 'Protégé']).toContain(relLabel(c, m.id));
  });

  it('two dials each way: what you do moves how they feel about you, and you take to them a share of it', () => {
    const c = begin('jamie_mercer', 7);
    const id = WRESTLERS.find((w) => w.id !== c.player && !bondOf(P(), c.player, w.id))!.id;
    const r = moveRelation(c, id, 20, 'helped them')!;
    expect(r.like).toBe(20);
    expect(r.mine!.like).toBe(Math.round(20 * SOCIAL_TOUCH.reciprocal));
    expect(r.fam).toBe(SOCIAL_TOUCH.fam);
    expect(likeOf(P(), id, c.player)).toBe(20);
  });

  it('you read people better the closer you are: an enemy you barely know can hide it', () => {
    const c = begin('jamie_mercer', 7);
    const id = WRESTLERS.find((w) => w.id !== c.player && !bondOf(P(), c.player, w.id))!.id;
    const b = ensureBond(P(), c.player, id, c.today);
    if (b.a === id) b.la = -80; else b.lb = -80;
    b.f = SOCIAL_READ.rough - 5;
    expect(kindOf(b)).toBe('enemy');
    expect(relLabel(c, id)).toBe('Acquaintance');
    b.f = SOCIAL_READ.clear;
    expect(relLabel(c, id)).toBe('Enemy');
  });

  it('backstage: people on the same card get talking, and get to know each other', async () => {
    const c = begin('jamie_mercer', 7);
    const before = Object.values(P().bonds).reduce((t, b) => t + b.f, 0);
    for (let i = 0; i < 10; i++) await day(c, quick, 'simmed');
    const after = Object.values(P().bonds).reduce((t, b) => t + b.f, 0);
    expect(after).toBeGreaterThan(before);
    // A chat between two strangers makes a bond, with first impressions of each other's work.
    const [x, y] = WRESTLERS.filter((w) => !bondsOf(P(), w.id).length).slice(0, 2) as [Wrestler, Wrestler];
    if (x && y) {
      const b = encounter(c, x.id, y.id, 'Test Night', seededRng(1))!;
      expect(b.f).toBeGreaterThan(0);
      expect(b.ra !== 0 || b.rb !== 0).toBe(true);
    }
  });

  it('a feud spills over by personality: hot-heads take it personally, professionals respect the work; and they are rivals', () => {
    const c = begin('jamie_mercer', 7);
    const [a, b, d, e] = WRESTLERS.filter((w) => w.id !== c.player && w.promotion === 'TIS').slice(0, 4) as [Wrestler, Wrestler, Wrestler, Wrestler];
    a.traits = ['hot_headed']; b.traits = ['egotistical']; d.traits = ['professional']; e.traits = ['team_player'];
    const la = likeOf(P(), a.id, b.id), ld = likeOf(P(), d.id, e.id);
    for (let i = 0; i < 12; i++) {
      const show: Show = { id: `feud${i}`, promo: 'TIS', name: `Grudge ${i}`, kind: 'indie', date: c.today, country: 'UK', city: 'Leeds', region: 'europe', done: false,
        card: [{ a: a.id, b: b.id, feud: 'f1' }, { a: d.id, b: e.id, feud: 'f2' }] };
      c.shows[show.id] = show;
      applyBout(c, show, 0, out('you'), true, 'simmed');
      applyBout(c, show, 1, out('you'), true, 'simmed');
    }
    expect(likeOf(P(), a.id, b.id)).toBeLessThan(la);
    expect(likeOf(P(), d.id, e.id)).toBeGreaterThan(ld);
    expect(bondOf(P(), a.id, b.id)!.riv).toBe(c.today);
  });

  it('wellbeing: friends lift it, being injured and alone drags it; at the extremes it’s on every roll', () => {
    const c = begin('jamie_mercer', 7);
    const lonely = WRESTLERS.find((w) => w.id !== c.player && !bondsOf(P(), w.id).some((b) => { const k = kindOf(b.bond, c.today); return k === 'friend' || k === 'best_friend'; }))!;
    c.people[lonely.id]!.injury = { until: '2027-06-01', what: 'serious' };
    c.people[lonely.id]!.recent = [0, 0, 0, 0, 0];
    const t = moodTarget(c, lonely.id);
    expect(t.v).toBeLessThan(40);
    expect(t.why).toEqual(expect.arrayContaining(['-injured']));
    for (let i = 0; i < 8; i++) updateMood(c, lonely.id, 0.35);
    expect(moodOf(lonely.id)).toBeLessThanOrEqual(MOOD_FX.low);
    const show = Object.values(c.shows)[0]!;
    const rules = boutRules(c, show, { a: lonely.id, b: c.player }, lonely.id, c.player, false);
    expect(rules.mood?.you).toBe(-MOOD_FX.dice);
  });

  it('out of touch, people drift apart; the weakest, stalest bonds go, and nobody keeps too many', async () => {
    const c = begin('jamie_mercer', 7);
    const [x, y] = WRESTLERS.filter((w) => w.id !== c.player && w.promotion === 'TIS').slice(-2) as [Wrestler, Wrestler];
    const b = ensureBond(P(), x.id, y.id, '2026-01-01');
    b.la = 5; b.lb = -5; b.f = 5; b.last = '2026-01-01';
    for (let i = 0; i < 35; i++) await day(c, quick, 'simmed');
    expect(P().bonds[pairKey(x.id, y.id)]).toBeUndefined();
    const counts = new Map<string, number>();
    for (const z of Object.values(P().bonds)) { counts.set(z.a, (counts.get(z.a) ?? 0) + 1); counts.set(z.b, (counts.get(z.b) ?? 0) + 1); }
    for (const [id, n] of counts) if (id !== c.player && !P().folk?.[id]) expect(n, id).toBeLessThanOrEqual(SOCIAL_PRUNE.max + 12);
  });

  it('everyone else has a goal, from who they are and where they stand', async () => {
    const c = begin('jamie_mercer', 7);
    for (let i = 0; i < 30; i++) await day(c, quick, 'simmed');
    const L = P().lives!;
    const indie = WRESTLERS.find((w) => w.promotion === 'TIS' && w.age <= 30 && w.id !== c.player && !c.people[w.id]?.retired)!;
    expect(L[indie.id]?.goal?.kind).toBe('signed');
    const old = WRESTLERS.find((w) => w.age >= 37 && !c.people[w.id]?.retired && w.id !== c.player)!;
    expect(L[old.id]?.goal?.kind).toBe('wind_down');
    expect(L[c.player]?.goal).toBeUndefined();
  });

  it('the same seed tells the same story', async () => {
    const run = async () => {
      const c = begin('jamie_mercer', 11);
      for (let i = 0; i < 40; i++) await day(c, quick, 'simmed');
      return JSON.stringify([P().bonds, P().lives]);
    };
    expect(await run()).toBe(await run());
  });

  it('an older save: one-number bonds become two-way, the world is brought to life around them, you get your circle, once', () => {
    const w = freshWorld(5);
    setWorld(w);
    const c: Career = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 5 });
    w.career = c;
    // How a rev-9 save looked: one feeling per pair, explicit kinds, nothing lived-in.
    const old = structuredClone(w);
    old.rev = 9;
    old.people!.bonds = {
      [pairKey('jamie_mercer', 'ray_hollis')]: { a: 'jamie_mercer', b: 'ray_hollis', v: 30, kind: 'mentor', mentor: 'ray_hollis', met: c.today, last: c.today, log: [{ day: c.today, d: 30, t: 'old' }] },
      [pairKey('jamie_mercer', 'diane_calder')]: { a: 'diane_calder', b: 'jamie_mercer', v: -50, kind: 'rival', met: c.today, last: c.today, log: [] },
    } as never;
    delete old.people!.lived; delete old.people!.lives; delete old.people!.folk;
    setWorld(old);
    const Q = old.people!;
    expect(old.rev).toBe(WORLD_REV);
    const m = bondOf(Q, 'jamie_mercer', 'ray_hollis')!;
    expect(m.mentor).toBe('ray_hollis');
    expect(m.la).toBe(30); expect(m.lb).toBe(30);
    expect(relationOf(old.career!, 'ray_hollis')!.kind).toBe('mentor');
    const r = bondOf(Q, 'jamie_mercer', 'diane_calder')!;
    expect(theirs(r, 'jamie_mercer')).toBe(-50);
    expect(r.riv).toBe(c.today);
    expect(Q.lived).toBeTruthy();
    expect(Object.keys(Q.bonds).length).toBeGreaterThan(1000);
    expect(Object.values(Q.folk ?? {}).some((f) => f.kind === 'family' && f.of === 'jamie_mercer')).toBe(true);
    const once = JSON.stringify(old);
    setWorld(old);
    expect(JSON.stringify(activeWorld())).toBe(once);
    expect(BOND_KIND.enemy).toBeLessThan(0);
  });
});
