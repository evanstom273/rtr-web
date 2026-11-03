// How a personality leans the career's numbers. No career imports here, so anything can use it
// (the booker, contracts, patience) without import cycles. personality.ts does the rest.
import { WRESTLERS, findWrestler, hasTrait, type Wrestler } from '../data/rtr';
import { TRAIT_BACKSTAGE as BX, TRAIT_LEAN_CAP } from './tuning';
import type { Career } from './types';

/** AI renewals: Loyal stays more, Mercenary less. */
export const renewLean = (w: Wrestler): number => (hasTrait(w, 'loyal') ? BX.loyal.renew : 0) + (hasTrait(w, 'mercenary') ? BX.mercenary.renew : 0);
/** How easily another promotion takes them when their deal's up. */
export const poachMult = (w: Wrestler): number => (hasTrait(w, 'loyal') ? BX.loyal.poach : 1) * (hasTrait(w, 'mercenary') ? BX.mercenary.poach : 1);

/**
 * Simulated planned finishes are re-run when they go the wrong way: the would-be loser's personality
 * changes how many times. Professionals and team players do the job; the rebellious and egotistical push back.
 */
export function retryAdjust(loser: Wrestler | undefined): number {
  if (!loser) return 0;
  let n = 0;
  if (hasTrait(loser, 'professional')) n += BX.professional.retries;
  if (hasTrait(loser, 'rebellious')) n += BX.rebellious.retries;
  if (hasTrait(loser, 'team_player')) n += BX.team_player.retriesLosing;
  if (hasTrait(loser, 'egotistical')) n += BX.egotistical.retriesLosing;
  return n;
}

/** A contender's personality: the ambitious and the egotistical push themselves forward. */
export const contenderLean = (w: Wrestler): number => (hasTrait(w, 'ambitious') ? BX.ambitious.contender : 0) + (hasTrait(w, 'egotistical') ? BX.egotistical.contender : 0);

const player = (c: Career): Wrestler | undefined => findWrestler(c.player) ?? WRESTLERS.find((w) => w.id === c.player);

/** Your patience with bookers, through your personality: losses hurt the hot-headed and egotistical more; politicians win it back faster. */
export function patienceMult(c: Career, d: number): number {
  const w = player(c);
  if (!w) return 1;
  if (d < 0) return (hasTrait(w, 'hot_headed') ? BX.hot_headed.patienceLoss : 1) * (hasTrait(w, 'egotistical') ? BX.egotistical.patienceLoss : 1);
  return hasTrait(w, 'politician') ? BX.politician.patienceGain : 1;
}

/** How fast people warm to you: team players faster, the egotistical slower. */
export function relationMult(c: Career, d: number): number {
  const w = player(c);
  if (!w || d <= 0) return 1;
  return (hasTrait(w, 'team_player') ? BX.team_player.relationGain : 1) * (hasTrait(w, 'egotistical') ? BX.egotistical.relationGain : 1);
}

/** You, by trait (for the career's own checks). */
export const playerHas = (c: Career, t: Parameters<typeof hasTrait>[1]): boolean => hasTrait(player(c), t);

/**
 * Points towards a trait from something you did (Person.leanings): enough of them and a card offers
 * it (personality.ts). Here so contracts and requests can feed it without import cycles.
 */
export function leanTo(c: Career, t: Parameters<typeof hasTrait>[1], pts: number): void {
  const p = c.people[c.player];
  if (!p || player(c)?.traits?.includes(t)) return;
  const l = (p.leanings ??= {});
  l[t] = Math.max(0, Math.min(TRAIT_LEAN_CAP, (l[t] ?? 0) + pts));
}

/** What your contract and request choices say about you. */
export function leanFrom(c: Career, what: 'renewed' | 'moved_for_money' | 'title_ask' | 'approach' | 'took_counter' | 'declined_counter' | 'release'): void {
  if (what === 'renewed') leanTo(c, 'loyal', 60);
  if (what === 'moved_for_money') leanTo(c, 'mercenary', 50);
  if (what === 'title_ask' || what === 'approach') leanTo(c, 'ambitious', 10);
  if (what === 'took_counter') leanTo(c, 'team_player', 15);
  if (what === 'declined_counter') leanTo(c, 'egotistical', 10);
  if (what === 'release') leanTo(c, 'rebellious', 10);
}
