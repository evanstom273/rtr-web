import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { begin as kitBegin, day } from './testkit';
import { findWrestler, PROMOTIONS, TITLES, WRESTLERS } from '../data/rtr';
import { runHeadless } from '../engine/sim/runHeadless';
import type { MatchRulesConfig } from '../engine/types';
import { activeWorld } from '../world/world';
import { boutRules } from './career';
import { bookShow } from './booker';
import { bookFeudBout, callBlowoff, feudHeat, feudBeat, moment, myFeud, rivalsFor, segmentToday, stageOf, startFeud, titleAtStake } from './feuds';
import { deliver, exchange, finishSegment, newBrawl, newPromo, planFor, promoOptions } from './segments';
import { replyTo } from './mail';
import { C } from './clauses';
import { FEATURES } from './tuning';
import type { Career, Show } from './types';

const was = FEATURES.feuds2;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { feuds2: boolean }).feuds2 = true; return c; };
beforeEach(() => { (FEATURES as { feuds2: boolean }).feuds2 = true; });
afterEach(() => { (FEATURES as { feuds2: boolean }).feuds2 = was; });

/** A feud of yours, started and given a show tonight with you on it. */
function setup(seed = 7): { c: Career; rival: string; show: Show } {
  const c = begin('buck_stratton', seed);
  const promo = c.people[c.player]!.contract!.promo;
  const rival = rivalsFor(c)[0]!.id;
  expect(startFeud(c, rival, 'callout')).toMatch(/It’s on/);
  const show = Object.values(c.shows).filter((s) => s.promo === promo && s.date >= c.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
  return { c, rival, show };
}

describe('feuds, rebuilt', () => {
  it('a feud’s heat lifts the crowd at the bell and the stars', () => {
    const [a, b] = WRESTLERS.slice(0, 2) as [typeof WRESTLERS[0], typeof WRESTLERS[0]];
    let up = 0;
    for (let i = 0; i < 16; i++) {
      const plain = runHeadless({ seed: 300 + i, you: a.id, them: b.id, model: { kind: 'skill', sigmaSeconds: 0.1 } }).engine.state;
      const hot = runHeadless({ seed: 300 + i, you: a.id, them: b.id, model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { feud: { heat: 90, payoff: true } } as MatchRulesConfig }).engine.state;
      up += hot.rating!.stars - plain.rating!.stars;
    }
    expect(up / 16).toBeGreaterThan(0.3);
  });

  it('you start one (one at a time); it moves through its stages and gets its blow-off when it turns personal', async () => {
    const { c, rival } = setup();
    const f = myFeud(c)!;
    expect(f.how).toBe('player');
    expect(startFeud(c, rivalsFor(c)[0]!.id, 'promo')).toMatch(/one at a time/);
    expect(stageOf(f)).toBe('spark');
    for (let i = 0; i < 3; i++) await day(c);
    expect(f.done).toBe(false);
    expect(stageOf(f)).toBe('building');
    expect(f.payoff).toBeFalsy();
    feudBeat(c, f, 'test', 50);
    await day(c);
    expect(stageOf(f)).toBe('escalation');
    expect(f.payoff).toBeTruthy();
    expect(c.letters.some((l) => /personal now/.test(l.subject))).toBe(true);
    void rival;
  });

  it('the matches tell a story: none in the spark, the heel first by cheating, nastier each time, the face at the blow-off', () => {
    const { c, rival, show } = setup();
    const f = myFeud(c)!;
    const free = () => true;
    expect(bookFeudBout(c, f, { ...show, kind: 'flagship' }, free)).toBeNull();
    f.stage = 'building';
    const me = findWrestler(c.player)!, them = findWrestler(rival)!;
    me.disposition = 'FACE'; them.disposition = 'HEEL';
    let first: ReturnType<typeof bookFeudBout> = null;
    for (let i = 0; i < 12 && !first; i++) first = bookFeudBout(c, f, { ...show, id: `${show.id}x${i}`, kind: 'flagship' }, free);
    expect(first?.planned).toBe(rival);
    expect(first?.finish).toBe('cheat');
    f.wins = { [rival]: 1 }; f.matches = 2; f.stage = 'escalation';
    let second: ReturnType<typeof bookFeudBout> = null;
    for (let i = 0; i < 12 && (!second || second.sides); i++) second = bookFeudBout(c, f, { ...show, id: `${show.id}y${i}`, kind: 'flagship' }, () => false);
    expect(second?.planned).toBe(c.player);
    expect(second?.stip).toBeTruthy();
    f.payoff = show.id;
    f.called = { stip: 'steel_cage', stakes: 'loser_leaves' };
    const blow = bookFeudBout(c, f, show, () => false)!;
    expect(blow.planned).toBe(c.player);
    expect(blow.stip).toBe('steel_cage');
    expect(blow.stakes?.kind).toBe('loser_leaves');
    const rules = boutRules(c, show, blow, c.player, rival, false);
    expect(rules.feud?.payoff).toBe(true);
  });

  it('you can call the blow-off once it’s going, with a stipulation and stakes', () => {
    const { c } = setup();
    const f = myFeud(c)!;
    expect(callBlowoff(c, 'loser_leaves', 'last_man_standing')).toMatch(/hasn’t got going/);
    f.stage = 'building';
    // Match Conditions (no hardcore) in a contract rules it out.
    const mine = c.people[c.player]!.contract!.clauses;
    mine[C.conditions] = 1;
    expect(callBlowoff(c, 'loser_leaves', 'last_man_standing')).toMatch(/contract rules out/);
    mine[C.conditions] = 0;
    const theirs = c.people[f.a === c.player ? f.b : f.a]?.contract?.clauses;
    if (theirs) theirs[C.conditions] = 0;
    expect(callBlowoff(c, 'loser_leaves', 'last_man_standing')).toMatch(/Done/);
    expect(f.called?.stip).toBe('last_man_standing');
    expect(stageOf(f)).toBe('escalation');
  });

  it('a promo, played: beats from four kinds of material, the meter moves, a botch turns the crowd', () => {
    const { c, rival, show } = setup();
    show.card = [{ a: c.player, b: WRESTLERS.find((w) => w.id !== c.player && w.id !== rival)!.id }];
    show.segments = [{ kind: 'promo', who: [c.player, rival], after: -1, feud: myFeud(c)!.id }];
    const g = show.segments[0]!;
    expect(planFor(c, g).beats).toEqual(['open', 'dig', 'hook', 'closer']);
    const opts = promoOptions(c, show, g, 'dig', []);
    expect(opts.map((o) => o.angle).sort()).toEqual(['crowd', 'real', 'self', 'them']);
    // Fluff every beat: botched.
    const st = newPromo();
    for (const beat of planFor(c, g).beats) deliver(c, show, g, st, beat, promoOptions(c, show, g, beat, [])[0]!, 0);
    const rep = c.people[c.player]!.rep;
    const out = finishSegment(c, show, 0, { promo: st });
    expect(out.score).toBeLessThan(2);
    expect(myFeud(c)!.edge).toBe(rival);
    expect(c.people[c.player]!.rep).toBeLessThan(rep);
    expect(segmentToday(c)).toBeUndefined();
  });

  it('a nailed promo wins the crowd; a brawl is a mini match that leaves someone laying', () => {
    const { c, rival, show } = setup();
    show.segments = [{ kind: 'promo', who: [c.player, rival], after: -1, feud: myFeud(c)!.id }, { kind: 'beatdown', who: [c.player, rival], after: 0, feud: myFeud(c)!.id }];
    const st = newPromo();
    for (const beat of planFor(c, show.segments[0]!).beats) deliver(c, show, show.segments[0]!, st, beat, promoOptions(c, show, show.segments[0]!, beat, []).sort((a, b) => b.value - a.value)[0]!, 1);
    const good = finishSegment(c, show, 0, { promo: st });
    expect(good.score).toBeGreaterThan(3);
    const b = newBrawl(planFor(c, show.segments[1]!).start);
    while (!b.over) exchange(c, show, show.segments[1]!, b, 'strike');
    expect(b.rounds.length).toBeGreaterThan(0);
    const out = finishSegment(c, show, 1, { brawl: b });
    expect(out.score).toBeGreaterThan(0);
    expect(myFeud(c)!.moments).toContain('attack');
  });

  it('a rival can come for you: bite, and it’s on', () => {
    const c = begin('buck_stratton', 11);
    const w = rivalsFor(c)[0]!;
    c.letters.push({ id: 'Ltest', day: c.today, read: false, kind: 'news', from: w.name, subject: 'You and me', body: [''], replies: [{ id: 'feud_bite', label: 'Bite' }, { id: 'feud_ignore', label: 'Ignore' }], ctx: { who: w.id, promo: c.people[c.player]!.contract!.promo } } as never);
    expect(replyTo(c, 'Ltest', 'feud_bite')).toMatch(/It’s on/);
    expect(myFeud(c)?.how).toBe('rival');
  });

  it('a long skip with “Sim them” on carries on through your segments and the feud’s letters, and answers a call-out for you', async () => {
    const { skip } = await import('./skip');
    const { routineOf } = await import('./day');
    const { c, rival, show } = setup();
    const f = myFeud(c)!;
    f.stage = 'building';
    show.segments = [{ kind: 'promo', who: [c.player, rival], after: -1, feud: f.id }];
    show.card = [{ a: c.player, b: WRESTLERS.find((w) => w.id !== c.player && w.id !== rival)!.id }];
    const quick: Parameters<typeof skip>[2] = async (jobs) => jobs.map((j) => ({ key: j.key, winner: 'you', finish: 'PINFALL', t: 600, stars: 3, stats: { you: {} as never, them: {} as never } }) as never);
    const mine = async (x: Career) => { const { myBoutToday, applyBout } = await import('./career'); const m = myBoutToday(x)!; const [o] = await quick([{ key: 'mine', seed: 1, you: m.bout.a, them: m.bout.b, rules: {} }]); applyBout(x, m.show, m.index, o!, true, 'simmed'); return true; };
    // Off: it stops for the promo.
    routineOf(c).simMine = false;
    routineOf(c).stopFor = { decisions: false, people: false, checkins: false, news: false };
    const stop = await skip(c, { days: 3 }, quick, { mine });
    if (show.date === c.today) expect(stop.stopped ?? '').toMatch(/promo is up/);
    // On: a call-out arrives mid-skip and the promo comes round; neither stops it.
    routineOf(c).simMine = true;
    routineOf(c).stopFor = { decisions: true, people: true, checkins: true, news: true };
    const other = rivalsFor(c).find((w) => w.id !== rival)!;
    c.letters.push({ id: 'Lcall', day: c.today, read: false, kind: 'news', story: true, from: other.name, subject: 'You and me', body: [''], replies: [{ id: 'feud_bite', label: 'Bite' }, { id: 'feud_ignore', label: 'Ignore' }], ctx: { who: other.id, promo: c.people[c.player]!.contract!.promo } } as never);
    const r = await skip(c, { days: 20 }, quick, { mine });
    expect(r.stopped === null || !/promo is up|segment|You and me/i.test(r.stopped)).toBe(true);
    expect(c.letters.find((l) => l.id === 'Lcall')!.replied).toBeTruthy();
    expect(r.handled.some((h) => /call-out/.test(h))).toBe(true);
    expect(show.segments![0]!.score).toBeDefined();
  }, 120000);

  it('it can go wrong: a cold feud gets pulled', async () => {
    const { c } = setup();
    const f = myFeud(c)!;
    f.heat = 2; f.start = '2026-09-01';
    await day(c);
    expect(f.done).toBe(true);
    expect(f.ended).toBe('cold');
  });

  it('a feud with a champion is for the title: not the matches building to it, the blow-off', async () => {
    const c = begin('buck_stratton', 7);
    const promo = c.people[c.player]!.contract!.promo;
    const t = TITLES.find((x) => x.id === PROMOTIONS.find((p) => p.initials === promo)!.titles[0])!;
    const champ = t.holder!;
    for (const f of c.feuds) if (!f.done && (f.a === champ || f.b === champ || f.a === c.player || f.b === c.player)) f.done = true;
    expect(startFeud(c, champ, 'callout')).toMatch(new RegExp(`${t.name} is on the line`));
    const f = myFeud(c)!;
    expect(f.title).toBe(t.id);
    // The build-up: non-title.
    f.stage = 'building';
    const shows = Object.values(c.shows).filter((s) => s.promo === promo && s.date > c.today && !s.done).sort((a, b) => (a.date < b.date ? -1 : 1));
    let bout: ReturnType<typeof bookFeudBout> = null;
    for (let i = 0; i < 12 && !bout; i++) bout = bookFeudBout(c, f, { ...shows[0]!, id: `${shows[0]!.id}t${i}`, kind: 'flagship' }, () => false);
    expect(bout?.title).toBeUndefined();
    // The blow-off: the booker's title match, with the feud on it and the stipulation you called.
    f.stage = 'escalation'; f.called = { stip: 'iron_man' };
    let found: NonNullable<Show['card']>[number] | undefined;
    for (const s of shows.slice(0, 8)) {
      for (const x of Object.values(c.shows)) if (x.card) x.card = x.card.filter((b) => b.title !== t.id || !!b.result);
      f.payoff = s.id;
      found = bookShow(c, s, WRESTLERS).find((b) => b.title === t.id && b.feud === f.id);
      if (found) break;
    }
    expect(found).toBeTruthy();
    expect(found!.stip).toBe('iron_man');
    expect([champ, c.player]).toContain(found!.planned);
    // The champion drops the belt somewhere else: it's just personal now.
    t.holder = WRESTLERS.find((w) => w.id !== champ && w.id !== c.player && w.gender === t.gender)!.id;
    await day(c);
    expect(f.title).not.toBe(t.id);
    expect(c.letters.some((l) => /title’s off the table/.test(l.subject))).toBe(true);
  });

  it('you as champion: a feud with you is a defence at the blow-off', () => {
    const c = begin('buck_stratton', 9);
    const promo = c.people[c.player]!.contract!.promo;
    const t = TITLES.find((x) => x.id === PROMOTIONS.find((p) => p.initials === promo)!.titles[0])!;
    for (const f of c.feuds) if (!f.done && f.title === t.id) f.done = true;
    t.holder = c.player;
    const rival = rivalsFor(c).find((w) => w.gender === t.gender)!;
    expect(titleAtStake(c, { id: '', a: c.player, b: rival.id, promo })).toBe(t.id);
    startFeud(c, rival.id, 'promo');
    expect(myFeud(c)!.title).toBe(t.id);
  });

  it('a few months of the world: feuds run through their stages, wrestle more than once, end, and are remembered', async () => {
    const c = begin('jamie_mercer', 11);
    for (let i = 0; i < 150; i++) await day(c);
    const H = activeWorld().history;
    const log = H.feuds ?? [];
    expect(log.length).toBeGreaterThan(0);
    expect(log.some((x) => x.matches >= 2)).toBe(true);
    expect(H.shows.flatMap((s) => s.segs ?? []).length).toBeGreaterThan(10);
    // Title feuds get the full feud too: matches building to the title match.
    expect(log.some((x) => x.title && x.matches >= 2)).toBe(true);
    void moment; void feudHeat;
  }, 300_000);
});
