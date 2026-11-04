// Bookers and promoters as people: how their personality (and how they feel about you) leans the
// decisions they already make. Personal feeling and professional trust stay separate: liking you is a
// small, capped nudge on requests; it never books you a title.
import { globalScore, hasTrait, PROMOTIONS, type Staffer, type TraitId, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondOf, bookerOf } from '../world/people';
import { bookerKey } from './patience';
import { BOOKER_FX as BF } from './tuning';
import type { Career } from './types';

/** The person behind a booker key (a promotion's initials, or a person id), if there is one. */
export function staffOf(key: string): Staffer | undefined {
  return activeWorld().people?.staff[bookerKey(key)];
}
const has = (s: Staffer | undefined, t: TraitId): boolean => !!s?.traits.includes(t);

/** How they feel about you, as request points: a small, capped nudge either way. */
export function affinityPoints(c: Career, key: string): number {
  const s = staffOf(key);
  const P = activeWorld().people;
  if (!s || !P) return 0;
  const v = bondOf(P, s.id, c.player)?.v ?? 0;
  return Math.max(-BF.affinityCap, Math.min(BF.affinityCap, Math.round(v / BF.affinityDivisor)));
}

/**
 * Their personality in your requests: the egotistical don't like being asked for the spotlight; the
 * unpredictable swing either way (seeded per ask, so asking again the same day gets the same answer).
 */
export function askLean(c: Career, key: string, kind: 'title' | 'challenge' | 'other', askKey = ''): number {
  const s = staffOf(key);
  let pts = affinityPoints(c, key);
  if (has(s, 'egotistical') && kind !== 'other') pts += BF.egotistical.asks;
  if (has(s, 'unpredictable')) pts += (seededRng(hashSeed(c.seed, 'booker-mood', key, askKey, c.today))() * 2 - 1) * BF.unpredictable.jitter;
  return Math.round(pts * 10) / 10;
}

/** A line for the request preview: whether they like you, separate from whether they trust your work. */
export function likesLine(c: Career, key: string): { t: string; s: number } | null {
  const pts = affinityPoints(c, key);
  if (!pts) return null;
  return pts > 0 ? { t: 'They like you', s: 1 } : { t: 'They don’t like you', s: -1 };
}

/** Patience: a hot-headed booker loses it faster. */
export const patienceLossMult = (key: string): number => (has(staffOf(key), 'hot_headed') ? BF.hot_headed.patienceLoss : 1);

/** Trust (their memory of your work), weighted by who they are: professionals care most about the plan. */
export function trustWeights(key: string): { offScript: number; kept: number; gains: number } {
  const s = staffOf(key);
  let offScript = 1, kept = 1, gains = 1;
  if (has(s, 'professional')) { offScript *= BF.professional.offScript; kept *= BF.professional.kept; }
  if (has(s, 'rebellious')) offScript *= BF.rebellious.offScript;
  if (has(s, 'egotistical')) offScript *= BF.egotistical.offScript;
  if (has(s, 'team_player')) gains *= BF.team_player.gains;
  return { offScript, kept, gains };
}

/** How much likelier a booker is to plan a title change: the rebellious and the unpredictable shake things up. */
export function changeLean(key: string): number {
  const s = staffOf(key);
  return (has(s, 'rebellious') ? BF.rebellious.change : 0) + (has(s, 'unpredictable') ? BF.unpredictable.change : 0);
}

/** Stipulations: an unpredictable booker reaches for them more. */
export const stipMult = (key: string): number => (has(staffOf(key), 'unpredictable') ? BF.unpredictable.stips : 1);

/** A promotion's booker, by a title it owns (indie titles have none: each promoter books their own show). */
export function titleBooker(titleId: string): Staffer | undefined {
  const p = PROMOTIONS.find((x) => !x.indie && x.titles.includes(titleId));
  const P = activeWorld().people;
  return p && P ? bookerOf(P, p.initials) : undefined;
}

/** A booker's thumb on the contender list: politicians favour their friends, mentors the young, the loyal those who stay. */
export function contenderBias(c: Career, booker: Staffer | undefined, w: Wrestler): number {
  if (!booker) return 0;
  let b = 0;
  if (has(booker, 'politician')) {
    const P = activeWorld().people;
    const v = P ? bondOf(P, booker.id, w.id)?.v ?? 0 : 0;
    b += Math.max(-BF.politician.favouritism, Math.min(BF.politician.favouritism, v / 5));
  }
  if (has(booker, 'mentor') && w.age <= BF.mentor.youthAge) b += BF.mentor.youth;
  if (has(booker, 'loyal') && (c.people[w.id]?.renewals ?? 0) >= 1) b += BF.loyal.tenure;
  return b;
}

/** Negotiations: a mercenary booker pays less; an ambitious one pays for stars. */
export function willingnessMult(promo: string, me: Wrestler, roster: readonly Wrestler[]): number {
  const s = staffOf(promo);
  let m = 1;
  if (has(s, 'mercenary')) m *= BF.mercenary.willingness;
  if (has(s, 'ambitious')) {
    const pops = roster.map((w) => globalScore(w)).sort((a, b) => b - a);
    if (globalScore(me) >= (pops[Math.floor(pops.length / 4)] ?? Infinity)) m *= BF.ambitious.starPay;
  }
  return m;
}

/** A hot-headed booker loses patience with haggling a round sooner. */
export const roundsAdjust = (promo: string): number => (has(staffOf(promo), 'hot_headed') ? BF.hot_headed.rounds : 0);

/** A reliable promoter gives a promise one more chance to happen. */
export const promiseRollsBonus = (key: string): number => (has(staffOf(key), 'reliable') ? BF.reliable.promiseRolls : 0);

/** Wrestler traits on a booker (the same catalogue). */
export const bookerHas = (key: string, t: TraitId): boolean => has(staffOf(key), t);
export { hasTrait };
