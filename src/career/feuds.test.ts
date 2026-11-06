import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { begin as kitBegin, day } from './testkit';
import { findWrestler, WRESTLERS } from '../data/rtr';
import { runHeadless } from '../engine/sim/runHeadless';
import type { MatchRulesConfig } from '../engine/types';
import { activeWorld } from '../world/world';
import { boutRules } from './career';
import { bookFeudBout, callBlowoff, feudHeat, feudBeat, moment, myFeud, rivalsFor, segmentToday, stageOf, startFeud } from './feuds';
import { deliver, exchange, finishSegment, newBrawl, newPromo, planFor, promoOptions } from './segments';
import { replyTo } from './mail';
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

  it('it can go wrong: a cold feud gets pulled', async () => {
    const { c } = setup();
    const f = myFeud(c)!;
    f.heat = 2; f.start = '2026-09-01';
    await day(c);
    expect(f.done).toBe(true);
    expect(f.ended).toBe('cold');
  });

  it('a few months of the world: feuds run through their stages, wrestle more than once, end, and are remembered', async () => {
    const c = begin('jamie_mercer', 11);
    for (let i = 0; i < 150; i++) await day(c);
    const H = activeWorld().history;
    const log = H.feuds ?? [];
    expect(log.length).toBeGreaterThan(0);
    expect(log.some((x) => x.matches >= 2)).toBe(true);
    expect(H.shows.flatMap((s) => s.segs ?? []).length).toBeGreaterThan(10);
    void moment; void feudHeat;
  }, 300_000);
});
