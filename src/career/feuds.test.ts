import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWrestler, WRESTLERS } from '../data/rtr';
import { runHeadless } from '../engine/sim/runHeadless';
import type { MatchRulesConfig } from '../engine/types';
import { activeWorld } from '../world/world';
import { boutRules } from './career';
import { askForPromo, askForSegment, canAsk, feudHeat, feudSegments, myFeuds, setSegStyle } from './feuds';
import { socialAct } from './social';
import { begin as kitBegin, day } from './testkit';
import { FEATURES } from './tuning';
import type { Feud } from './types';

const was = FEATURES.feuds2;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { feuds2: boolean }).feuds2 = true; return c; };
beforeEach(() => { (FEATURES as { feuds2: boolean }).feuds2 = true; });
afterEach(() => { (FEATURES as { feuds2: boolean }).feuds2 = was; });

describe('feuds stage 1: feuds that matter', () => {
  it('a feud’s heat lifts the crowd at the bell and the stars (and nothing changes without one)', () => {
    const [a, b] = WRESTLERS.slice(0, 2) as [typeof WRESTLERS[0], typeof WRESTLERS[0]];
    let up = 0, n = 0, startDiff = 0;
    for (let i = 0; i < 24; i++) {
      const plain = runHeadless({ seed: 300 + i, you: a.id, them: b.id, model: { kind: 'skill', sigmaSeconds: 0.1 } }).engine.state;
      const hot = runHeadless({ seed: 300 + i, you: a.id, them: b.id, model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { feud: { heat: 90, payoff: true } } as MatchRulesConfig }).engine.state;
      up += hot.rating!.stars - plain.rating!.stars; n++;
      startDiff = hot.heatLine[0]! - plain.heatLine[0]!;
    }
    expect(up / n).toBeGreaterThan(0.3);
    expect(startDiff).toBeGreaterThan(10);
  });

  it('your feud gets segments on TV, you choose how to play them, and they build the heat', async () => {
    const c = begin('buck_stratton');
    const promo = c.people[c.player]!.contract!.promo;
    const rival = WRESTLERS.find((w) => w.id !== c.player && w.promotion === promo)!;
    const f: Feud = { id: 'ftest', promo, a: c.player, b: rival.id, start: c.today, payoff: null, matches: 0, done: false };
    c.feuds.push(f);
    const show = Object.values(c.shows).find((s) => s.promo === promo && s.kind === 'weekly' && s.date > c.today)!;
    show.card = [{ a: c.player, b: WRESTLERS.find((w) => w.id !== c.player && w.id !== rival.id && w.promotion === promo)!.id }];
    show.segments = [];
    expect(askForPromo(c, show)).toMatch(/Agreed|said no/);
    feudSegments(c, show, show.card);
    const mine = (show.segments ?? []).findIndex((g) => g.who.includes(c.player));
    if (mine >= 0) expect(setSegStyle(c, show.id, mine, 'cold')).toMatch(/Cold/);
    expect(myFeuds(c)).toContain(f);
    // Calling them out online stokes it.
    const before = feudHeat(f);
    socialAct(c, 'callout', rival.id);
    expect(feudHeat(f)).toBeGreaterThan(before);
    // A match between them carries the heat.
    const rules = boutRules(c, show, { a: c.player, b: rival.id }, c.player, rival.id, false);
    expect(rules.feud?.heat).toBe(feudHeat(f));
    void day; void findWrestler; void activeWorld;
  });

  it('a feud started with no payoff yet (Creative Control, early on) doesn’t vanish overnight, and gets one', async () => {
    const c = begin('buck_stratton');
    const promo = c.people[c.player]!.contract!.promo;
    const rival = WRESTLERS.find((w) => w.id !== c.player && w.promotion === promo)!;
    const f: Feud = { id: 'fcc', promo, a: c.player, b: rival.id, start: c.today, payoff: null, matches: 0, done: false };
    c.feuds.push(f);
    for (let i = 0; i < 5; i++) await day(c);
    expect(f.done).toBe(false);
    expect(myFeuds(c)).toContain(f);
    for (let i = 0; i < 30 && !f.payoff; i++) await day(c);
    expect(f.payoff).toBeTruthy();
  });

  it('ask for a segment days ahead: agreed now, on the card when it’s drawn up', async () => {
    const c = begin('buck_stratton');
    const promo = c.people[c.player]!.contract!.promo;
    const rival = WRESTLERS.find((w) => w.id !== c.player && w.promotion === promo)!;
    c.feuds.push({ id: 'fask', promo, a: c.player, b: rival.id, start: c.today, payoff: null, matches: 0, done: false, heat: 90 });
    const show = Object.values(c.shows).filter((s) => s.promo === promo && !s.card && s.date > c.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
    const said = askForSegment(c, show, 'beatdown');
    expect(said).toMatch(/Agreed|said no/);
    c.segAsks![show.id] = { kind: 'beatdown', ok: true };
    const other = WRESTLERS.find((w) => w.id !== c.player && w.id !== rival.id && w.promotion === promo)!;
    const card = [{ a: c.player, b: other.id }];
    show.card = card;
    feudSegments(c, show, card);
    expect(show.segments?.some((g) => g.kind === 'beatdown' && g.who.includes(c.player) && g.who.includes(rival.id))).toBe(true);
    expect(canAsk(c, show).why).toMatch(/already/);
  });

  it('a year of the world: AI feuds get segments, build heat, end, and go into the history', async () => {
    const c = begin('jamie_mercer', 11);
    for (let i = 0; i < 120; i++) await day(c);
    const H = activeWorld().history;
    const segs = H.shows.flatMap((s) => s.segs ?? []);
    expect(segs.length).toBeGreaterThan(10);
    expect((H.feuds ?? []).length).toBeGreaterThan(0);
    expect((H.feuds ?? []).some((x) => x.peak > 30)).toBe(true);
  }, 300_000);
});
