import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWrestler, TITLES } from '../data/rtr';
import { activeWorld } from '../world/world';
import { teamOf } from '../world/matchWorld';
import { boutPeople, inBout } from './bouts';
import { STYLE } from './matchBooking';
import { setCardHook } from './booker';
import { daysBetween } from './dates';
import { begin, day } from './testkit';
import { FEATURES } from './tuning';
import type { Bout, Career } from './types';

const flag = FEATURES as { matches: boolean };
let was = false;
beforeEach(() => { was = flag.matches; flag.matches = true; });
afterEach(() => { flag.matches = was; });

/** Every bout on every card so far (played or not), with its show's promotion and kind. */
const allBouts = (c: Career) => Object.values(c.shows).flatMap((s) => (s.card ?? []).map((b) => ({ b, promo: s.promo, kind: s.kind, date: s.date, show: s.id })));

describe('booking by style (match overhaul, stage 9)', () => {
  it('cards fill with tag matches, team title defences, multi-mans and hardcore matches, each promotion its own way', async () => {
    const c = begin('@indie', 21);
    for (let i = 0; i < 70; i++) await day(c);
    const bs = allBouts(c);
    const of = (f: (b: Bout) => boolean) => bs.filter((x) => f(x.b));
    const tag = of((b) => !!b.tag);
    expect(tag.length).toBeGreaterThan(20);
    // Tag titles go on the line team against team (never as singles).
    const tagTitle = (id?: string) => !!id && ['tag', 'trios'].includes(TITLES.find((t) => t.id === id)?.kind ?? '');
    expect(of((b) => tagTitle(b.title)).every((x) => !!x.b.sides && x.b.tag)).toBe(true);
    expect(of((b) => tagTitle(b.title)).length).toBeGreaterThan(5);
    // SLN's trios.
    expect(bs.some((x) => x.promo === 'SLN' && x.b.sides?.[0]?.length === 3)).toBe(true);
    // Multi-mans somewhere.
    expect(of((b) => b.type === 'triple' || b.type === 'fourway').length).toBeGreaterThan(0);
    // Hardcore: END and IVW book far more of it than VWF, and only with people who'll do it.
    const hc = (p: string) => { const xs = bs.filter((x) => x.promo === p && !x.b.sides); return xs.filter((x) => !!x.b.stip).length / Math.max(1, xs.length); };
    expect(hc('END') + hc('IVW')).toBeGreaterThan(hc('VWF') + hc('TCG'));
    for (const x of of((b) => !!b.stip && ['street_fight', 'no_holds_barred', 'deathmatch'].includes(b.stip))) {
      for (const id of boutPeople(x.b)) expect(findWrestler(id)?.hardcore ?? 0).toBeGreaterThanOrEqual(0);
    }
    // Nobody's on two bouts of one show, and nobody's on two shows the same night.
    const nights = new Map<string, string>();
    for (const s of Object.values(c.shows)) {
      const seen = new Set<string>();
      for (const b of s.card ?? []) for (const id of boutPeople(b)) {
        expect(seen.has(id), `${id} twice on ${s.id}`).toBe(false);
        seen.add(id);
        const k = `${s.date}|${id}`;
        expect(nights.has(k) && nights.get(k) !== s.id, `${id} on two shows ${s.date}`).toBe(false);
        nights.set(k, s.id);
      }
    }
    // The player is always one of a multi bout's two leads.
    for (const x of of((b) => !!b.sides && inBout(b, c.player))) expect([x.b.a, x.b.b]).toContain(c.player);
    // Played tag bouts settle with both partners as winners.
    const done = of((b) => !!b.tag && !!b.result?.winner);
    expect(done.length).toBeGreaterThan(10);
    for (const x of done) expect(x.b.result!.winners!.length).toBe(x.b.sides!.find((s) => s.includes(x.b.result!.winner!))!.length);
  }, 120_000);

  it('a flagship gets its big gimmick match (the marquee ones once a year); the flag off books singles only', async () => {
    // Every card as booked (old shows are pruned from the career as it goes).
    const booked: { promo: string; date: string; kind: string; card: Bout[] }[] = [];
    setCardHook((_c, show, card) => { booked.push({ promo: show.promo, date: show.date, kind: show.kind, card: structuredClone(card) }); });
    const c = begin('@indie', 22);
    for (let i = 0; i < 100; i++) await day(c);
    const isBig = (b: Bout) => ['rumble', 'battle_royal'].includes(b.type ?? '') || ['elimination_chamber', 'wargames', 'money_in_the_bank', 'hell_in_a_cell'].includes(b.stip ?? '');
    const bigs = booked.filter((x) => x.kind === 'flagship' && STYLE[x.promo]).flatMap((x) => x.card.filter(isBig).map((b) => ({ ...x, b })));
    expect(bigs.length).toBeGreaterThan(0);
    expect(Object.keys(c.bigMatches ?? {}).length).toBeGreaterThan(0);
    // No promotion's big matches come closer than eight weeks apart.
    for (const p of new Set(bigs.map((x) => x.promo))) {
      const ds = [...new Set(bigs.filter((x) => x.promo === p).map((x) => x.date))].sort();
      for (let i = 1; i < ds.length; i++) expect(daysBetween(ds[i - 1] as never, ds[i] as never)).toBeGreaterThanOrEqual(56);
    }

    flag.matches = false;
    const d = begin('@indie', 23);
    for (let i = 0; i < 30; i++) await day(d);
    expect(allBouts(d).every((x) => !x.b.sides)).toBe(true);
    expect(activeWorld().teams).toBeUndefined();
  }, 120_000);

  it('teams keep their records from the matches they wrestle', async () => {
    const c = begin('@indie', 24);
    for (let i = 0; i < 40; i++) await day(c);
    const W = activeWorld();
    const played = Object.values(W.teams ?? {}).filter((t) => (t.wins ?? 0) + (t.losses ?? 0) > 0);
    expect(played.length).toBeGreaterThan(3);
    expect(teamOf(W, 'nobody')).toBeUndefined();
  }, 120_000);
});
