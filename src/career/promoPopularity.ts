// Promotion popularity (Lyra's call: it moves). Each month every promotion's 0–100 popularity moves at
// most a point towards what its roster and its matches deserve; indie brands the same on their own scale.
// No randomness: it's the same however the month is played.
import { PROMOTIONS, globalScore, rosterOf } from '../data/rtr';
import { activeWorld } from '../world/world';
import { setCareerHooks } from './career';
import { addDays } from './dates';
import {
  BRAND_POP_BASE, BRAND_POP_BOUNDS, BRAND_POP_PER_STAR, PROMO_POP_BOUNDS, PROMO_POP_PER_STAR, PROMO_POP_REF, PROMO_POP_STEP,
} from './tuning';
import type { Career } from './types';

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.max(lo, Math.min(hi, v));
const step = (now: number, target: number) => Math.round((now + Math.max(-PROMO_POP_STEP, Math.min(PROMO_POP_STEP, target - now))) * 10) / 10;

/** Average stars of each promotion's and each brand's matches in the last 90 days. */
function recentStars(day: string): { promo: Map<string, number>; brand: Map<string, number> } {
  const since = addDays(day, -90);
  const sum = { promo: new Map<string, [number, number]>(), brand: new Map<string, [number, number]>() };
  const add = (m: Map<string, [number, number]>, k: string, s: number) => { const v = m.get(k) ?? [0, 0]; v[0] += s; v[1]++; m.set(k, v); };
  const H = activeWorld().history.shows;
  for (let i = H.length - 1; i >= 0; i--) {
    const s = H[i]!;
    if (s.date < since) break;
    for (const b of s.bouts) {
      add(sum.promo, s.promo, b.stars);
      if (s.brand) add(sum.brand, s.brand, b.stars);
    }
  }
  const avg = (m: Map<string, [number, number]>) => new Map([...m].map(([k, [t, n]]) => [k, t / n]));
  return { promo: avg(sum.promo), brand: avg(sum.brand) };
}

/** Where a promotion is heading: its roster's average draw against TCG's at the start, and its matches. */
export function promoTarget(initials: string, stars: number | undefined): number {
  const roster = rosterOf(initials);
  const draw = roster.length ? roster.reduce((t, w) => t + globalScore(w), 0) / roster.length : PROMO_POP_REF;
  return clamp(10 + (70 * draw) / PROMO_POP_REF + ((stars ?? 3) - 3) * PROMO_POP_PER_STAR, PROMO_POP_BOUNDS);
}

function monthly(c: Career): void {
  const stars = recentStars(c.today);
  for (const p of PROMOTIONS) {
    if (p.indie || p.popularity === undefined) continue;
    p.popularity = step(p.popularity, promoTarget(p.initials, stars.promo.get(p.initials)));
  }
  for (const b of Object.values(activeWorld().people?.brands ?? {})) {
    if (b.closed || b.popularity === undefined) continue;
    const target = clamp(BRAND_POP_BASE + ((stars.brand.get(b.id) ?? 3) - 3) * BRAND_POP_PER_STAR, BRAND_POP_BOUNDS);
    b.popularity = step(b.popularity, target);
  }
}

setCareerHooks({ monthly });
