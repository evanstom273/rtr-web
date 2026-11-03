// Booker patience (Requests): one meter per promotion's booker and per indie promoter.
import { PATIENCE_PER_WEEK, PATIENCE_START } from './tuning';
import type { Career, Show } from './types';

/** An indie promoter is known by their show's name. */
export const indieKey = (showName: string): string => `TIS:${showName}`;
/** Whoever books a show: its promotion, or the indie promoter running it. */
export const showBooker = (show: Pick<Show, 'promo' | 'name'>): string => (show.promo === 'TIS' ? indieKey(show.name) : show.promo);

export function patienceOf(c: Career, key: string): number {
  return c.patience?.[key]?.v ?? PATIENCE_START;
}

export function movePatience(c: Career, key: string, d: number, why: string): void {
  if (!d) return;
  const p = ((c.patience ??= {})[key] ??= { v: PATIENCE_START, log: [] });
  p.v = Math.max(0, Math.min(100, Math.round((p.v + d) * 10) / 10));
  p.log.unshift({ day: c.today, d, t: why });
  if (p.log.length > 6) p.log.length = 6;
}

/** Once a week: patience creeps back, but time alone never takes it above where it started. */
export function patienceWeek(c: Career): void {
  for (const p of Object.values(c.patience ?? {})) if (p.v < PATIENCE_START) p.v = Math.min(PATIENCE_START, p.v + PATIENCE_PER_WEEK);
}
