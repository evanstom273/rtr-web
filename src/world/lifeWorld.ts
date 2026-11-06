// Life, the world's side: each city's property market (and, as Life grows, funds, schools, businesses and
// everyone's money). Made the first time it's needed; moves once a month on its own seed.
import { seededRng, hashSeed } from '../engine/rng';
import { CITY_GEO } from '../career/places';
import { PRICE_BOOK as PB } from '../career/tuning';
import { activeWorld, type World } from './world';

export interface Market { i: number; trend: number; slump?: number }
export interface LifeWorld {
  v: 1;
  /** Each city's price index (1 when Life began there) and its own lean. */
  markets: Record<string, Market>;
  /** The month the markets last moved (YYYY-MM). */
  moved?: string;
  /** The month of the last crash (funds fall, for everyone). */
  crash?: string;
}

/** The world's Life, made the first time: every market at 1, each city with its own lean. */
export function lifeWorld(w: World = activeWorld()): LifeWorld {
  if (w.life) return w.life;
  const markets: Record<string, Market> = {};
  for (const city of Object.keys(CITY_GEO)) {
    const r = seededRng(hashSeed(w.seed, 'market', city));
    markets[city] = { i: 1, trend: PB.market.trend * (0.5 + r()) };
  }
  w.life = { v: 1, markets };
  return w.life;
}

/** Did the markets crash this month? */
export const crashedIn = (month: string): boolean => lifeWorld().crash === month;

/** A city's price index (1 for anywhere not on the map). */
export const marketIdx = (city: string): number => lifeWorld().markets[city]?.i ?? 1;

/** Once a month: every market moves (its lean, a wobble, now and then a slump lasting a year). */
export function moveMarkets(month: string, w: World = activeWorld()): string[] {
  const L = lifeWorld(w);
  if (L.moved === month) return [];
  L.moved = month;
  const slumped: string[] = [];
  // About once every eight years, the markets crash (funds, for everyone).
  if (seededRng(hashSeed(w.seed, 'crash', month))() < PB.crashYear / 12) L.crash = month;
  for (const [city, m] of Object.entries(L.markets)) {
    const r = seededRng(hashSeed(w.seed, 'market', city, month));
    if (m.slump && m.slump > 0) m.slump--;
    else if (r() < PB.market.slumpYear / 12) {
      const depth = PB.market.slump[0] + r() * (PB.market.slump[1] - PB.market.slump[0]);
      m.i *= 1 - depth / 2;
      m.slump = 11;
      slumped.push(city);
    }
    // A slump keeps sliding for a year (the other half of its depth), then the lean comes back.
    const lean = m.slump ? -(PB.market.slump[0] / 2) / 12 : m.trend / 12;
    const wobble = (r() + r() + r() - 1.5) * PB.market.wobble / Math.sqrt(12) * 1.15;
    m.i = Math.max(0.3, m.i * (1 + lean + wobble));
  }
  return slumped;
}
