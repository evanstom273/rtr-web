// Fans (Lyra's call): each wrestler has real fan counts in the six regions, and worldwide is their sum.
// They replace the old 0–100 popularity scores. Converted wrestlers keep their regional order exactly:
// fans = 150 × 10^(old score ÷ 20) per region, five times the base curve.
import type { Fans, Popularity, Wrestler } from './types';

export const FAN_REGIONS = ['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'] as const;
export type FanRegion = (typeof FAN_REGIONS)[number];

/** Fans at an old score of 0; every 20 points is ten times as many. */
export const FAN_BASE = 150;

export const fansFromScore = (score: number): number => Math.round(FAN_BASE * 10 ** (score / 20));
const scoreOf = (fans: number): number => 20 * Math.log10(Math.max(1, fans) / FAN_BASE);

export const fansIn = (w: Pick<Wrestler, 'fans'>, r: FanRegion): number => w.fans?.[r] ?? 0;
export const fansTotal = (w: Pick<Wrestler, 'fans'>): number => FAN_REGIONS.reduce((t, r) => t + fansIn(w, r), 0);

/**
 * How much someone draws in a region, on the old 0–100 scale (to 0.1): exactly their old popularity
 * for a converted wrestler, never below 0 and with no ceiling. Formulas that were built on the old
 * scale (weights, odds, contender scores) read this, so nothing shifted when the counts arrived.
 */
export const fanScore = (w: Pick<Wrestler, 'fans'>, r: FanRegion): number => Math.max(0, Math.round(scoreOf(fansIn(w, r)) * 10) / 10);

/** The six regional scores averaged: the old "global" (which was the regions' mean). */
export const globalScore = (w: Pick<Wrestler, 'fans'>): number =>
  Math.round((FAN_REGIONS.reduce((t, r) => t + fanScore(w, r), 0) / FAN_REGIONS.length) * 10) / 10;

/** The fans a regional score corresponds to: for showing old-scale thresholds as people. */
export const fansForScore = fansFromScore;

/** Move someone's fans in a region by `delta` on the old scale (+1 ≈ +12%). Returns the change in people. */
export function shiftFans(w: Pick<Wrestler, 'fans'>, r: FanRegion, delta: number): number {
  const before = fansIn(w, r);
  const after = Math.max(0, Math.round(Math.max(1, before) * 10 ** (delta / 20)));
  w.fans[r] = after;
  return after - before;
}

/** An old 0–100 popularity record as fan counts (the migration). */
export function fansFromPopularity(p: Popularity): Fans {
  return Object.fromEntries(FAN_REGIONS.map((r) => [r, fansFromScore(p[r] ?? 0)])) as unknown as Fans;
}

/** 950 · 12.4k · 3.4M */
export function fmtFans(n: number): string {
  if (n >= 1e7) return `${Math.round(n / 1e6)}M`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}k`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}
