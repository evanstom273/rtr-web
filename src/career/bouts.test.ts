// Match overhaul, stage 9: more than two people in the career — the real engine on tag matches and a Rumble, the
// booker's plan by team, booker mode's card with any kind of match, and a tag cup.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWrestler, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { activeTeams, ensureMatchWorld, teamOf } from '../world/matchWorld';
import { boutEngine, boutLabel, boutPeople, multiBout, plannedKey } from './bouts';
import { bookerPool, setCard } from './card';
import { applyBout, boutJob, boutRules, scripted } from './career';
import { foundPromotion } from './company';
import { simOne, type SimOut } from './sim';
import { begin } from './testkit';
import { FEATURES } from './tuning';
import type { Career, Show } from './types';

const flags = FEATURES as { matches: boolean; booker: boolean };
let was = { m: false, b: false };
beforeEach(() => { was = { m: flags.matches, b: flags.booker }; flags.matches = true; flags.booker = true; });
afterEach(() => { flags.matches = was.m; flags.booker = was.b; });

const nextShow = (c: Career, promo: string): Show => Object.values(c.shows).filter((s) => s.promo === promo && !s.done && s.date >= c.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
const men = (promo: string, n: number, not: string[] = []) => WRESTLERS.filter((w) => w.promotion === promo && w.gender === 'MALE' && !not.includes(w.id)).slice(0, n).map((w) => w.id);

describe('bouts with more than two people', () => {
  it('helpers: the player first on their side and always a lead; the engine shape; the planned side', () => {
    const b = multiBout([['x1', 'x2'], ['me', 'y2'], ['z1']], { type: 'tag' }, 'me');
    expect(b.a).toBe('me');
    expect(b.sides![0]).toEqual(['me', 'y2']);
    const e = boutEngine(b);
    expect(e.you).toBe('me');
    expect(e.them).toBe('x1');
    expect(e.extras).toEqual([{ id: 'y2', team: 0 }, { id: 'x2', team: 1 }, { id: 'z1', team: 2 }]);
    expect(plannedKey({ ...b, planned: 'z1' })).toBe('s4');
    expect(plannedKey({ ...b, planned: 'x1' })).toBe('them');
    expect(boutLabel(b, (id) => id)).toBe('me & y2 vs x1 & x2 vs z1');
  });

  it('a tag match and a 20-man Rumble run through the real engine and land in the career', () => {
    const c = begin('@indie', 31);
    const W = activeWorld();
    ensureMatchWorld(W);
    const show = nextShow(c, 'VWF');
    const [t1, t2] = activeTeams(W).filter((t) => t.promo === 'VWF' && !t.trios && findWrestler(t.members[0]!)!.gender === 'MALE' && !W.db.titles.some((x) => x.team === t.id));
    const tag = multiBout([t1!.members, t2!.members], { tag: true, type: 'tag', planned: t1!.members[0] });
    const field = men('VWF', 20, [...t1!.members, ...t2!.members]);
    const rumble = multiBout(field.map((id) => [id]), { type: 'rumble' });
    show.card = [tag, rumble];
    // The booker's nudge goes to the planned team.
    const rules = boutRules(c, show, tag, tag.a, tag.b, true);
    expect(rules.booked?.side).toBe('you');
    const t0 = Date.now();
    const outs = show.card.map((b, i) => simOne(boutJob(c, show, b, i)));
    expect(Date.now() - t0).toBeLessThan(60_000);
    outs.forEach((o, i) => applyBout(c, show, i, o.out, true, 'simmed'));
    // Tag: both partners win (or both lose), and the team's record moves.
    const r = tag.result!;
    expect(r.winners).toHaveLength(2);
    expect([t1!.members, t2!.members].some((m) => m.every((id) => r.winners!.includes(id)))).toBe(true);
    expect((t1!.wins ?? 0) + (t1!.losses ?? 0)).toBe(1);
    // Rumble: one winner, everyone else eliminated, everyone's had a match.
    const rr = rumble.result!;
    expect(rr.winners).toHaveLength(1);
    expect(rr.elims!.length).toBeGreaterThanOrEqual(15);
    for (const id of field) expect(c.people[id]?.last).toBe(show.date);
  }, 120_000);

  it('a booked DQ in a tag match gives it to the planned team', () => {
    const b = multiBout([['a1', 'a2'], ['b1', 'b2']], { tag: true, type: 'tag', planned: 'b1', finish: 'dq' });
    const o: SimOut = { key: 'x', winner: 'you', finish: 'PINFALL', t: 600, stars: 3, stats: { you: {} as never, them: {} as never }, multi: { winners: ['a1', 'a2'], losers: ['b1', 'b2'], elims: [], hp: {} } };
    const s = scripted(b, o, true);
    expect(s.winner).toBe('them');
    expect(s.multi!.winners).toEqual(['b1', 'b2']);
  });

  it('booker mode: tag matches, multi-mans and stakes on your card, with the rules a card needs', () => {
    const c = begin('@indie', 32);
    c.money = 20_000;
    foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 5000, night: { every: 'weekly', day: 'Saturday' } });
    const show = nextShow(c, 'NLW');
    const free = bookerPool(c, show);
    const pool = free.filter((w) => w.gender === 'MALE' && w.id !== c.player).slice(0, 30).map((w) => w.id);
    expect(pool.length).toBeGreaterThanOrEqual(10);
    const ok = (card: ReturnType<typeof multiBout>[]) => setCard(c, show.id, card, []);
    // Someone in two matches, or mixed divisions, or a winner who isn't in it: no.
    const four = multiBout([[pool[0]!], [pool[1]!], [pool[2]!], [pool[3]!]], { type: 'fourway', planned: pool[2] });
    expect(ok([four, multiBout([[pool[3]!, pool[4]!], [pool[5]!, pool[6]!]], { tag: true, type: 'tag' })])).toMatch(/twice/);
    expect(ok([multiBout([[pool[0]!], [pool[1]!]], { planned: pool[9] })])).toMatch(/winner/);
    const woman = free.find((w) => w.gender === 'FEMALE')!.id;
    expect(ok([multiBout([[pool[0]!], [pool[1]!], [woman]], { type: 'triple' })])).toMatch(/men against men/);
    // A good card keeps its sides, kind and stakes.
    const tag = multiBout([[pool[4]!, pool[5]!], [pool[6]!, pool[7]!]], { tag: true, type: 'tag', stakes: { kind: 'loser_leaves' } });
    const msg = ok([four, tag]);
    expect(msg).toMatch(/booked/);
    expect(show.card![1]!.sides).toEqual([[pool[4], pool[5]], [pool[6], pool[7]]]);
    expect(show.card![1]!.stakes?.kind).toBe('loser_leaves');
    expect(show.card![0]!.type).toBe('fourway');
    // With the flag off, singles only.
    flags.matches = false;
    expect(ok([four])).toMatch(/singles/i);
  });

  it('a tag title can only go on the line team against team, with the champions in it', () => {
    const c = begin('@indie', 33);
    const W = activeWorld();
    ensureMatchWorld(W);
    const t = TITLES.find((x) => x.id === 'VWF_TAG_TEAM_CHAMPIONSHIP')!;
    const champs = teamOf(W, t.holders![0]!)!;
    const rival = activeTeams(W).find((x) => x.promo === 'VWF' && x !== champs && !x.trios && findWrestler(x.members[0]!)!.gender === 'MALE')!;
    const show = nextShow(c, 'VWF');
    show.card = [multiBout([champs.members, rival.members], { title: t.id, tag: true, type: 'tag', planned: rival.members[0] })];
    const o = simOne(boutJob(c, show, show.card[0]!, 0)).out;
    // Force the challengers' win to check the change.
    const forced: SimOut = { ...o, winner: 'them', multi: { ...o.multi!, winners: [...rival.members], losers: [...champs.members] } };
    applyBout(c, show, 0, forced, true, 'simmed');
    expect(t.holders).toEqual(rival.members);
    expect(t.team).toBe(rival.id);
    expect(W.history.reigns[t.id]!.at(-1)!.name).toBe(rival.name);
    // Won from the team, not just its first man.
    expect(W.history.reigns[t.id]!.at(-1)!.won?.fromName).toBe(champs.name);
    expect(boutPeople(show.card[0]!)).toHaveLength(4);
  }, 60_000);

  it('a scratch pair can win the tag titles too, and the history names both of them', () => {
    const c = begin('@indie', 33);
    const W = activeWorld();
    ensureMatchWorld(W);
    const t = TITLES.find((x) => x.id === 'VWF_TAG_TEAM_CHAMPIONSHIP')!;
    const champs = teamOf(W, t.holders![0]!)!;
    const pair = WRESTLERS.filter((w) => w.promotion === 'VWF' && w.gender === 'MALE' && !teamOf(W, w.id) && !champs.members.includes(w.id)).slice(0, 2).map((w) => w.id);
    const show = nextShow(c, 'VWF');
    show.card = [multiBout([champs.members, pair], { title: t.id, tag: true, type: 'tag' })];
    const o = simOne(boutJob(c, show, show.card[0]!, 0)).out;
    applyBout(c, show, 0, { ...o, winner: 'them', multi: { ...o.multi!, winners: [...pair], losers: [...champs.members] } }, true, 'simmed');
    expect([...t.holders!].sort()).toEqual([...pair].sort());
    expect(t.team).toBeUndefined();
    const reign = W.history.reigns[t.id]!.at(-1)!;
    expect(reign.name).toBe(pair.map((id) => findWrestler(id)!.name).join(' & '));
    expect(reign.won?.fromName).toBe(champs.name);
  }, 60_000);
});
