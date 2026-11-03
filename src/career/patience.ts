// Booker patience (Requests): one meter per promotion's booker and per indie promoter.
import { patienceMult } from './leans';
import { activeWorld } from '../world/world';
import { bookerOf, isPromotionKey } from '../world/people';
import { BOOKER_FX, PATIENCE_PER_WEEK, PATIENCE_START } from './tuning';
import type { Career, Show } from './types';

/**
 * Who a booker key means now: a promotion's initials mean whoever books it today (so patience and
 * memory belong to the person, and go with them if they move on). Person ids and indie keys stand as they are.
 */
export function bookerKey(key: string): string {
  if (!isPromotionKey(key)) return key;
  const P = activeWorld().people;
  return (P && bookerOf(P, key)?.id) || key;
}

/** The promotion a booker key books for now, if any (a promotion's initials, or its booker's id). */
export function promoOfBooker(key: string): string | null {
  if (isPromotionKey(key)) return key;
  const s = activeWorld().people?.staff[key];
  return s?.job?.kind === 'booker' ? s.job.promo : null;
}

/** An indie promoter is known by their show's name. */
export const indieKey = (showName: string): string => `TIS:${showName}`;
/** Whoever books a show: its promotion (its booker, see bookerKey), or the promoter running its indie brand. */
export function showBooker(show: Pick<Show, 'promo' | 'name' | 'brand'>): string {
  if (show.promo !== 'TIS') return show.promo;
  const p = show.brand ? activeWorld().people?.brands[show.brand]?.promoter : null;
  return p ?? indieKey(show.name);
}

/** An indie promoter's key (a promoter, or an old show-name key) rather than a promotion's booker. */
export function isIndieBooker(key: string): boolean {
  if (key.startsWith('TIS:')) return true;
  const s = activeWorld().people?.staff[key];
  return !!s && (s.job ? s.job.kind === 'promoter' : s.spells.at(-1)?.job.kind === 'promoter');
}

export function patienceOf(c: Career, key: string): number {
  return c.patience?.[bookerKey(key)]?.v ?? PATIENCE_START;
}

/** A hot-headed booker loses patience faster (their own traits; see bookerLeans for the rest). */
function bookerLossMult(key: string): number {
  const s = activeWorld().people?.staff[bookerKey(key)];
  return s?.traits.includes('hot_headed') ? BOOKER_FX.hot_headed.patienceLoss : 1;
}

/** A booker's patience log (newest first). */
export const patienceLog = (c: Career, key: string) => c.patience?.[bookerKey(key)]?.log ?? [];

export function movePatience(c: Career, key: string, d: number, why: string): void {
  if (!d) return;
  d = Math.round(d * patienceMult(c, d) * (d < 0 ? bookerLossMult(key) : 1) * 10) / 10;
  const p = ((c.patience ??= {})[bookerKey(key)] ??= { v: PATIENCE_START, log: [] });
  p.v = Math.max(0, Math.min(100, Math.round((p.v + d) * 10) / 10));
  p.log.unshift({ day: c.today, d, t: why });
  if (p.log.length > 6) p.log.length = 6;
}

/** Once a week: patience creeps back, but time alone never takes it above where it started. */
export function patienceWeek(c: Career): void {
  for (const p of Object.values(c.patience ?? {})) if (p.v < PATIENCE_START) p.v = Math.min(PATIENCE_START, p.v + PATIENCE_PER_WEEK);
}
