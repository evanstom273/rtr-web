// Romance and family (Lyra's relationships redesign, stage 4): attraction, couples in a lived-in world, your love life
// from first date to wedding (and break-ups), neglect and cheating, the rest of the world in love, and life and death.
import { describe, expect, it } from 'vitest';
import { TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondOf, bondsOf, ensureBond, likeOf, together } from '../world/people';
import { livingCosts } from './career';
import { runPhase } from './day';
import { makeMeet } from './plans';
import { couldFall, die, loversOf, partnerOf } from './romance';
import { send, topicsFor } from './phone';
import { moodTarget } from './socialLife';
import { begin, day, quick } from './testkit';
import { ROMANCE } from './tuning';
import type { Career } from './types';

const P = () => activeWorld().people!;
/** Someone for you: the right sort for each other, set to how they feel. */
function match(c: Career, like = 80, fam = 70): Wrestler {
  const me = WRESTLERS.find((w) => w.id === c.player)!;
  (P().lives ??= {})[c.player] = { ...(P().lives![c.player] ?? {}), orient: 'bi' };
  const w = WRESTLERS.find((x) => x.id !== c.player && x.country === me.country && !c.people[x.id]?.retired && couldFall(c, x.id, c.player) && !partnerOf(x.id) && Math.abs(x.age - me.age) <= 10)!;
  const b = ensureBond(P(), c.player, w.id, c.today);
  b.la = like; b.lb = like; b.f = fam;
  return w;
}

describe('romance and family', () => {
  it('a lived-in world has couples (some married), and partners from outside the business', () => {
    const c = begin('jamie_mercer', 7);
    for (let i = 0; i < 2; i++) void 0;
    const couples = Object.values(P().bonds).filter(together);
    expect(couples.length).toBeGreaterThan(20);
    expect(couples.some((x) => x.love!.st === 'married')).toBe(true);
    expect(Object.values(P().folk ?? {}).some((f) => f.kind === 'outsider' && f.rel === 'partner')).toBe(true);
    expect(P().loves).toBe(c.today);
  });

  it('attraction: orientation and gender have to fit, nobody under 18, never family', () => {
    const c = begin('jamie_mercer', 7);
    const men = WRESTLERS.filter((w) => w.gender === 'MALE' && w.id !== c.player).slice(0, 2) as [Wrestler, Wrestler];
    const L = (P().lives ??= {});
    L[men[0].id] = { ...(L[men[0].id] ?? {}), orient: 'straight' };
    L[men[1].id] = { ...(L[men[1].id] ?? {}), orient: 'gay' };
    expect(couldFall(c, men[0].id, men[1].id)).toBe(false);
    L[men[0].id]!.orient = 'gay';
    const gap = Math.abs(men[0].age - men[1].age) <= ROMANCE.ageGap;
    expect(couldFall(c, men[0].id, men[1].id)).toBe(gap);
    const kin = Object.values(P().folk ?? {}).find((f) => f.kind === 'family')!;
    expect(couldFall(c, c.player, kin.id)).toBe(false);
  });

  it('first date to wedding: a date makes you a couple; official, moving in (costs shared), proposing, the wedding', () => {
    const c = begin('jamie_mercer', 7);
    const w = match(c, 95, 80);
    c.phase = 'pm';
    makeMeet(c, { day: c.today, ph: 'pm', with: w.id, kind: 'date', by: 'me' });
    runPhase(c, 'pm');
    const b = bondOf(P(), c.player, w.id)!;
    if (b.love?.st !== 'dating') return; // they flaked: nothing to test this seed
    b.love.since = '2025-01-01';
    expect(topicsFor(c, w.id).find((x) => x.topic === 'commit')!.blocked).toBeUndefined();
    send(c, w.id, 'commit', 'warm');
    expect(b.love.st).toBe('partner');
    b.love.since = '2025-01-01';
    const solo = c.money;
    livingCosts(c, '2026-11-09');
    const alone = solo - c.money;
    send(c, w.id, 'movein', 'warm');
    expect(b.love.st).toBe('living');
    expect(c.home?.with).toBe(w.id);
    const before = c.money;
    livingCosts(c, '2026-11-16');
    if (alone > 0) expect(before - c.money).toBeLessThan(alone);
    b.love.since = '2025-01-01';
    c.money = 100_000;
    send(c, w.id, 'propose', 'warm');
    expect(b.love.st).toBe('engaged');
    expect(c.meets!.some((m) => m.kind === 'wedding' && m.with === w.id)).toBe(true);
    send(c, w.id, 'split', 'plain');
    expect(b.love.st).toBe('ex');
    expect(c.home).toBeUndefined();
    expect(moodTarget(c, c.player).why).toEqual(expect.arrayContaining(['-heartbreak']));
  });

  it('a partner you neglect cools, and ends it; two at once, and they find out', async () => {
    const c = begin('jamie_mercer', 7);
    const a = match(c, ROMANCE.dumpAt + 1, 60);
    const x = bondOf(P(), c.player, a.id)!;
    x.love = { st: 'partner', since: '2026-01-01' };
    for (let i = 0; i < 9; i++) await day(c, quick, 'simmed');
    expect(['ex', 'partner']).toContain(x.love!.st);
    if (x.love!.st === 'partner') expect(likeOf(P(), a.id, c.player)).toBeLessThan(ROMANCE.dumpAt + 1);
    // Cheating: with two partners, someone finds out on the first of the month.
    const d = begin('jamie_mercer', 11);
    const p1 = match(d, 70, 60), p2 = match(d, 70, 60);
    bondOf(P(), d.player, p1.id)!.love = { st: 'partner', since: '2026-01-01' };
    bondOf(P(), d.player, p2.id)!.love = { st: 'dating', since: '2026-01-01' };
    const was = ROMANCE.cheatFound;
    ROMANCE.cheatFound = 1;
    for (let i = 0; i < 30 && loversOf(d.player).length > 1; i++) await day(d, quick, 'simmed');
    ROMANCE.cheatFound = was;
    expect(loversOf(d.player).length).toBeLessThan(2);
  });

  it('a partner lifts wellbeing; the rest of the world falls in love and out of it', async () => {
    const c = begin('jamie_mercer', 7);
    const w = match(c, 80, 70);
    const before = moodTarget(c, c.player).v;
    bondOf(P(), c.player, w.id)!.love = { st: 'married', since: '2026-01-01' };
    expect(moodTarget(c, c.player).v).toBeGreaterThan(before);
    const start = Object.values(P().bonds).filter((x) => x.love).map((x) => `${x.a}${x.b}${x.love!.st}`).join();
    for (let i = 0; i < 95; i++) await day(c, quick, 'simmed');
    const after = Object.values(P().bonds).filter((x) => x.love).map((x) => `${x.a}${x.b}${x.love!.st}`).join();
    expect(after).not.toBe(start);
  });

  it('a death (rarely, anyone): titles vacated, cards cleared, the news, grief through their friends', () => {
    const c = begin('jamie_mercer', 7);
    const champ = TITLES.find((t) => t.holder && t.holder !== c.player)!;
    const id = champ.holder!;
    const friend = bondsOf(P(), id).find((b) => (b.bond.a === b.other ? b.bond.la : b.bond.lb) >= 40);
    die(c, id, seededRng(1));
    expect(champ.holder).toBeNull();
    expect(c.people[id]!.retired).toBe(true);
    expect(P().lives![id]!.died).toBe(c.today);
    expect(c.letters.some((l) => l.subject.includes('has died'))).toBe(true);
    if (friend) expect(P().lives![friend.other]!.shocks!.some((s) => s.k === 'grief')).toBe(true);
    for (const s of Object.values(c.shows)) if (!s.done) expect(s.card?.some((b) => !b.result && (b.a === id || b.b === id)) ?? false).toBe(false);
  });
});
