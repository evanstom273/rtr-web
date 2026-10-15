// Port of MatchExhaustionModel: stamina depletion + fatigue → demand-scaled consequences.
import type { Move } from '../data/rtr/types';
import { clamp, inverseLerp, lerp } from './rng';
import type { Side } from './types';

export type Demand = 'BASIC' | 'STANDARD' | 'EXPLOSIVE';
export type ExhaustionBand = 'Fresh' | 'Winded' | 'Tired' | 'Exhausted' | 'Spent';
const BAND_ORDER: readonly ExhaustionBand[] = ['Fresh', 'Winded', 'Tired', 'Exhausted', 'Spent'];
export const bandRank = (b: ExhaustionBand): number => BAND_ORDER.indexOf(b);

export const CATCH_BREATH_STAMINA_THRESHOLD = 60;
export const CATCH_BREATH_BASE_RECOVERY = 18;
export const CATCH_BREATH_COOLDOWN_SECONDS = 90;

type S = Pick<Side, 'stamina' | 'maxStamina' | 'fatigue' | 'momentum'>;

export const staminaRatio = (s: S): number => (s.maxStamina <= 0 ? 0 : clamp(s.stamina / s.maxStamina, 0, 1));
export const staminaPercent = (s: S): number => staminaRatio(s) * 100;
const fatigueRatio = (s: S): number => clamp(s.fatigue / 100, 0, 1);

export function combinedExhaustion(s: S): number {
  const depletion = 1 - staminaRatio(s), wear = fatigueRatio(s);
  return clamp(0.65 * depletion + 0.35 * wear + 0.25 * depletion * wear, 0, 1);
}

export function exhaustionBand(s: S): ExhaustionBand {
  const x = combinedExhaustion(s);
  if (x < 0.2) return 'Fresh';
  if (x < 0.45) return 'Winded';
  if (x < 0.7) return 'Tired';
  if (x < 0.9) return 'Exhausted';
  return 'Spent';
}

/** Piecewise-linear sample over ascending points. */
function sampleAsc(v: number, pts: number[], vals: number[]): number {
  if (v <= pts[0]!) return vals[0]!;
  for (let i = 1; i < pts.length; i++) {
    if (v <= pts[i]!) return lerp(vals[i - 1]!, vals[i]!, inverseLerp(pts[i - 1]!, pts[i]!, v));
  }
  return vals[vals.length - 1]!;
}
/** Piecewise-linear sample over descending points. */
function sampleDesc(v: number, pts: number[], vals: number[]): number {
  if (v >= pts[0]!) return vals[0]!;
  for (let i = 1; i < pts.length; i++) {
    if (v >= pts[i]!) return lerp(vals[i - 1]!, vals[i]!, inverseLerp(pts[i - 1]!, pts[i]!, v));
  }
  return vals[vals.length - 1]!;
}

export function moveDemand(move: Move | null, isSignature = false, ladder = false): Demand {
  if (!move) return 'BASIC';
  if (
    isSignature || ladder || move.finisher
    || move.type === 'AERIAL' || move.type === 'SPRINGBOARD' || move.type === 'RUNNING'
    || move.req.a.motion === 'RUNNING' || move.req.a.motion === 'ROPE_REBOUND'
    || move.req.t.motion === 'ROPE_REBOUND'
    || move.req.a.position === 'PERCHED' || move.req.a.position === 'CLIMBING'
    || move.req.a.area === 'TOP_ROPE' || move.req.a.area === 'LADDER'
    || (move.type === 'GRAPPLE' && move.impact >= 8)
    || (move.type === 'WEAPON' && move.impact >= 7)
  ) return 'EXPLOSIVE';
  if (move.impact <= 3 && (move.type === 'STRIKE' || move.type === 'GRAPPLE')) return 'BASIC';
  return 'STANDARD';
}

export function fatigueAmplification(s: S): number {
  return sampleAsc(s.fatigue, [0, 50, 75, 90, 100], [1, 1.1, 1.35, 1.6, 1.7]);
}

export function executionPenalty(s: S, demand: Demand): number {
  let base = [0, 5, 10, 15], cap = 22;
  if (demand === 'BASIC') {
    base = [0, 3, 6, 10];
    cap = 15;
  } else if (demand === 'EXPLOSIVE') {
    base = [0, 7, 15, 25];
    cap = 35;
  }
  return clamp(sampleDesc(staminaPercent(s), [100, 50, 25, 0], base) * fatigueAmplification(s), 0, cap);
}

export const executionMultiplier = (s: S, demand: Demand): number => clamp(1 - executionPenalty(s, demand) / 100, 0.01, 1);

export function staminaCostMultiplier(s: S, demand: Demand = 'STANDARD'): number {
  const fatigueCost = sampleAsc(s.fatigue, [0, 50, 75, 90, 100], [1, 1.1, 1.25, 1.4, 1.5]);
  const surcharge = demand === 'STANDARD' ? 0.05 * combinedExhaustion(s) : demand === 'EXPLOSIVE' ? 0.15 * combinedExhaustion(s) : 0;
  return clamp(fatigueCost * (1 + surcharge), 1, 1.75);
}

export function staminaRecoveryMultiplier(s: S): number {
  return sampleAsc(s.fatigue, [0, 50, 75, 90, 100], [1, 0.75, 0.5, 0.25, 0.1]);
}

export function catchBreathRecovery(s: S): number {
  return (s.maxStamina * CATCH_BREATH_BASE_RECOVERY) / 100 * staminaRecoveryMultiplier(s);
}

export function reversalPenalty(s: S): number {
  const st = sampleDesc(staminaPercent(s), [100, 50, 25, 0], [0, 5, 9, 12]);
  const fa = sampleAsc(s.fatigue, [0, 50, 75, 100], [0, 0, 2, 5]);
  return clamp(st * fatigueAmplification(s) + fa, 0, 20);
}

function finishDefencePenalty(s: S, submission: boolean): number {
  const st = sampleDesc(staminaPercent(s), [100, 50, 25, 0], [0, 6, 12, 20]);
  const fa = sampleAsc(s.fatigue, [0, 50, 75, 100], [0, 0, 8, submission ? 15 : 12]);
  return clamp(st + fa, 0, submission ? 35 : 32);
}
export const kickoutPenalty = (s: S): number => finishDefencePenalty(s, false);
export const submissionEscapePenalty = (s: S): number => finishDefencePenalty(s, true);

export function controlRetentionChance(s: S, demand: Demand): number {
  if (demand === 'BASIC') return 100;
  const x = combinedExhaustion(s);
  if (demand === 'EXPLOSIVE') return clamp(100 - 40 * x + s.momentum * 0.1, 60, 100);
  return clamp(100 - 18 * x, 82, 100);
}

export function recoveryDelayChance(s: S, afterCrash = false): number {
  const x = combinedExhaustion(s);
  let c = 25 * clamp(inverseLerp(0.45, 1, x), 0, 1);
  if (afterCrash) c += 10;
  return clamp(c, 0, 35);
}
