// Booker patience (Requests): one meter per promotion's booker and per indie promoter.
import { activeWorld } from '../world/world';
import { bookerOf, isPromotionKey } from '../world/people';
import { PATIENCE_PER_WEEK, PATIENCE_START } from './tuning';
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
/** Whoever books a show: its promotion, or the indie promoter running it. */
export const showBooker = (show: Pick<Show, 'promo' | 'name'>): string => (show.promo === 'TIS' ? indieKey(show.name) : show.promo);

export function patienceOf(c: Career, key: string): number {
  return c.patience?.[bookerKey(key)]?.v ?? PATIENCE_START;
}

/** A booker's patience log (newest first). */
export const patienceLog = (c: Career, key: string) => c.patience?.[bookerKey(key)]?.log ?? [];

export function movePatience(c: Career, key: string, d: number, why: string): void {
  if (!d) return;
  const p = ((c.patience ??= {})[bookerKey(key)] ??= { v: PATIENCE_START, log: [] });
  p.v = Math.max(0, Math.min(100, Math.round((p.v + d) * 10) / 10));
  p.log.unshift({ day: c.today, d, t: why });
  if (p.log.length > 6) p.log.length = 6;
}

/** Once a week: patience creeps back, but time alone never takes it above where it started. */
export function patienceWeek(c: Career): void {
  for (const p of Object.values(c.patience ?? {})) if (p.v < PATIENCE_START) p.v = Math.min(PATIENCE_START, p.v + PATIENCE_PER_WEEK);
}
