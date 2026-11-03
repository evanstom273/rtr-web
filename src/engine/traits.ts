// Personality in the ring: how traits shift the AI's choices and, for both sides, the dice, pins,
// holds, crowd and referee. Every number lives in career/tuning.ts (TRAIT_FX).
import { TRAIT_FX as FX } from '../career/tuning';
import type { Move, TraitId } from '../data/rtr';
import type { Rng } from './rng';
import type { Side } from './types';

export const has = (s: Side | undefined, t: TraitId): boolean => !!s?.w.traits?.includes(t);

/** Inconsistent: tonight's form, rolled once a match (−2 to +2 on every roll). Nobody else rolls, so other matches don't shift. */
export function rollForm(s: Side, rnd: Rng): number {
  if (!has(s, 'inconsistent')) return 0;
  let r = rnd() * FX.inconsistent.weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < FX.inconsistent.form.length; i++) {
    r -= FX.inconsistent.weights[i]!;
    if (r <= 0) return FX.inconsistent.form[i]!;
  }
  return 0;
}

/** Dice modifiers a side brings to any roll: tonight's form, and rising to a big occasion. */
export function anyRollMods(s: Side): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  if (s.form) out.push({ label: s.form > 0 ? 'On form' : 'Off night', value: s.form });
  if (s.big && has(s, 'big_match')) out.push({ label: 'Big match', value: FX.big_match.dice });
  return out;
}

/** The AI's pick spread (weightedTop's offset): Methodical narrower, Inconsistent and Unpredictable wider. */
export function temperature(s: Side): number {
  let t = 1;
  if (has(s, 'methodical')) t *= FX.methodical.temperature;
  if (has(s, 'inconsistent')) t *= FX.inconsistent.temperature;
  if (has(s, 'unpredictable')) t *= FX.unpredictable.temperature;
  return t;
}

const isStrike = (m: Move) => m.type === 'STRIKE' || m.type === 'RUNNING';

/** AI move scoring: how each trait leans the choice. */
export function aiMoveLean(ai: Side, m: Move, high: boolean, focused: boolean, leg: number): number {
  let s = 0;
  if (high) {
    if (has(ai, 'risk_taker')) {
      s += FX.risk_taker.aiHighRisk;
      // Bad legs worry a risk taker half as much (the general penalty is −15 / −8).
      s += (leg < 40 ? 15 : leg < 60 ? 8 : 0) * FX.risk_taker.legPenaltyShare;
    }
    if (has(ai, 'defensive')) s += FX.defensive.aiHighRisk;
  }
  if (focused && has(ai, 'methodical')) s += FX.methodical.aiFocus;
  if (!high && m.impact <= 5 && has(ai, 'methodical')) s += FX.methodical.aiBasic;
  if (isStrike(m)) {
    if (has(ai, 'aggressive')) s += FX.aggressive.aiStrike;
    if (has(ai, 'hot_headed')) s += FX.hot_headed.aiStrike;
  }
  if (m.submission && has(ai, 'submission_specialist')) s += FX.submission_specialist.aiHold;
  return s;
}

/** AI set-up scoring: climbs, taunts and catching a breath. */
export function aiSetupLean(ai: Side, id: string): number {
  if (id === 'climb_top_rope' || id === 'prepare_springboard') return has(ai, 'risk_taker') ? FX.risk_taker.aiClimb : 0;
  if (id === 'taunt') return has(ai, 'showboat') ? FX.showboat.aiTaunt : 0;
  if (id === 'catch_breath') {
    return (has(ai, 'aggressive') ? FX.aggressive.aiRest : 0) + (has(ai, 'defensive') ? FX.defensive.aiRest : 0) + (has(ai, 'hot_headed') ? FX.hot_headed.aiRest : 0);
  }
  return 0;
}

/** AI dirty tactics and distracting the referee. */
export function aiDirtyLean(ai: Side, distraction: boolean): number {
  let s = 0;
  if (has(ai, 'dirty_fighter')) s += distraction ? FX.dirty_fighter.aiDistract : FX.dirty_fighter.aiDirty;
  if (!distraction && has(ai, 'hot_headed')) s += FX.hot_headed.aiDirty;
  return s;
}

/** Crowd heat from what a side does: risk takers' dives, showboats' taunts, crowd pleasers' everything. */
export function heatMult(s: Side | undefined, kind: 'move' | 'high' | 'taunt' | 'kickout'): number {
  let m = 1;
  if (kind === 'high' && has(s, 'risk_taker')) m *= FX.risk_taker.heat;
  if (kind === 'taunt' && has(s, 'showboat')) m *= FX.showboat.tauntHeat;
  if (kind !== 'taunt' && has(s, 'crowd_pleaser')) m *= FX.crowd_pleaser.heat;
  return m;
}
