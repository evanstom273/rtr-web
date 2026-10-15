// Port of MatchInteractionModel: move risk classification, late-match escalation, pin and
// submission pressure. (Reversals are contested rolls now: see dice.ts.)
import type { Move } from '../data/rtr/types';
import { moveAttributeProfile, submissionModifiers } from './attributes';
import { executionMultiplier, kickoutPenalty, moveDemand, submissionEscapePenalty } from './exhaustion';
import { clamp } from './rng';
import { isSignatureMove } from './side';
import { pinCondition } from './pin';
import { targetHp } from './targeting';
import type { Side, TargetResolution } from './types';

const AERIAL_TERMS = [
  'aerial', 'dive', 'diving', 'springboard', 'moonsault', 'shooting star', 'crossbody', 'senton', 'splash', 'hurricanrana',
  'rana', 'plancha', 'corkscrew', 'elbow drop', 'leg drop', 'knee drop', 'headbutt drop', 'double stomp', 'meteora',
];

export function isHighRisk(m: Move | null): boolean {
  if (!m) return false;
  if (m.type === 'AERIAL' || m.type === 'SPRINGBOARD') return true;
  if (m.req.a.areaMode === 'SPECIFIC' && (m.req.a.area === 'TOP_ROPE' || m.req.a.area === 'APRON')) return true;
  if (m.type !== 'RUNNING' && m.req.a.motion !== 'RUNNING' && m.req.a.motion !== 'ROPE_REBOUND') return false;
  const name = m.name.toLowerCase();
  return AERIAL_TERMS.some((t) => name.includes(t));
}

export const isHeavyMove = (m: Move | null): boolean => !!m && (m.impact >= 7 || (m.strike && m.strikeWeight === 'HEAVY'));

export const classCompatible = (s: Side, m: Move): boolean => s.w.classes.some((c) => m.classPref.includes(c));

export function inferredClassCompatible(s: Side, m: Move): boolean {
  const c = s.w.classes;
  if (c.includes('STRIKER') && m.strike) return true;
  if (c.includes('TECHNICIAN') && (m.submission || m.type === 'SUBMISSION' || m.type === 'GRAPPLE')) return true;
  if (c.includes('HIGH_FLYER') && isHighRisk(m)) return true;
  return c.includes('POWERHOUSE') && !m.strike && !m.submission && m.impact >= 5;
}

function compatibilityBonus(s: Side, m: Move): number {
  if (classCompatible(s, m)) return 8;
  return inferredClassCompatible(s, m) ? 5 : 0;
}

/* ---------- late match ---------- */

export interface LateProfile {
  finishPressure: number;
  recoveryPenalty: number;
  controlThreshold: number;
  aiFinishBonus: number;
  movementSetupPenalty: number;
}

export function lateMatchProfile(t: number): LateProfile {
  if (t >= 2100) return { finishPressure: 45, recoveryPenalty: 25, controlThreshold: 4, aiFinishBonus: 35, movementSetupPenalty: 50 };
  if (t >= 1500) return { finishPressure: 30, recoveryPenalty: 15, controlThreshold: 8, aiFinishBonus: 20, movementSetupPenalty: 20 };
  if (t >= 900) return { finishPressure: 15, recoveryPenalty: 8, controlThreshold: 12, aiFinishBonus: 8, movementSetupPenalty: 0 };
  return { finishPressure: 0, recoveryPenalty: 0, controlThreshold: 15, aiFinishBonus: 0, movementSetupPenalty: 0 };
}

/* ---------- pins ---------- */

export interface PinProfile {
  /** Player-facing gold width, % of the fill track. */
  window: number;
  /** AI kickout chance, %. */
  aiChance: number;
}

export function pinProfile(baseWindow: number, pressure: number, resistance: number, count: number, defender: Side): PinProfile {
  const diff = resistance - pressure;
  const calculated = clamp(baseWindow + clamp(diff * 0.3, -10, 46), 6, 80);
  const divisor = count === 1 ? 4 : count === 2 ? 5 : count === 3 ? 6 : 1;
  const penalty = kickoutPenalty(defender);
  let window = Math.max(0.75, calculated / divisor);
  window = Math.max(0.75, window * (1 - penalty / 100));
  const aiCalculated = clamp(baseWindow + diff * 0.55, 6, 80);
  const aiChance = clamp(aiCalculated * (1 - penalty / 100), 1, 80);
  return { window, aiChance };
}

/* ---------- submissions ---------- */

export interface SubmissionContext {
  attackerScore: number;
  defenderScore: number;
  tapThreshold: number;
  escapeThreshold: number;
  targetHp: number;
}

function submissionPressureScore(state: Side, opponent: Side, move: Move, attacking: boolean, target: TargetResolution): number {
  const hp = targetHp(opponent.hp, target);
  if (attacking) {
    let s = 20 + state.w.stats.skill * 0.35 + state.momentum * 0.2 + (100 - hp) * 0.25 + move.impact * 2 + (move.finisher ? 15 : 0);
    s *= executionMultiplier(state, move.finisher ? 'EXPLOSIVE' : 'STANDARD');
    return clamp(s, 5, 100);
  }
  // Defender score: note the opponent here is the defender themselves in Godot (target HP of self).
  let d = 20 + state.w.stats.skill * 0.3 + state.momentum * 0.2 + hp * 0.15;
  d *= 1 - submissionEscapePenalty(state) / 100;
  return clamp(d, 5, 100);
}

/**
 * Web addition, the submission twin of pin resistance: a fresh defender takes the edge off the
 * hold, a wrecked one doesn't. Scales the attacker's score (Godot's scores cap at 100 for any
 * healthy wrestler, so adding to the defender's does nothing). Fresh ×0.75, worked over ×0.94,
 * wrecked ×1.14.
 */
export const submissionGrip = (D: Side): number => 1 - (pinCondition(D) - 50) / 200;

export function submissionContext(
  attacker: Side, defender: Side, move: Move, t: number, target: TargetResolution, squash: boolean,
): SubmissionContext {
  const hp = targetHp(defender.hp, target);
  // Godot's early-match time resistance (+35 under 5:00, +18 under 10:00, tap thresholds 96/93) is
  // deliberately removed in the web version. Late-match escalation is kept.
  let pressureBonus = 0, tap = 90;
  if (t >= 900) {
    if (t >= 2100) {
      pressureBonus = lateMatchProfile(t).finishPressure;
      tap = 82;
    } else if (t >= 1500) {
      pressureBonus = lateMatchProfile(t).finishPressure;
      tap = 85;
    } else {
      pressureBonus = 10;
      tap = 89;
    }
  }
  let bodyResistance = 0;
  if (hp >= 80) {
    bodyResistance = 30;
    if (!move.finisher) {
      bodyResistance = 35;
      tap = Math.min(98, tap + 2);
    }
  } else if (hp >= 60) bodyResistance = 15;
  else if (hp >= 40 && !move.finisher) bodyResistance = 10;
  else if (hp < 20) pressureBonus += 30;
  else if (hp < 40) pressureBonus += 15;
  const attacks = attacker.targetAttackCounts[target.storyPart] ?? 0;
  if (attacks >= 5) pressureBonus += 8;
  else if (attacks >= 3) pressureBonus += 4;
  if (attacker.w.classes.includes('TECHNICIAN')) pressureBonus += 4;
  if (attacker.momentum >= 65) pressureBonus += 4;
  if (move.finisher) tap = Math.min(tap, 92);
  void squash;
  const resistance = bodyResistance;
  const attr = submissionModifiers(attacker, defender);
  const attackerScore = submissionPressureScore(attacker, defender, move, true, target) + pressureBonus + attr.attack;
  const defenderScore = submissionPressureScore(defender, defender, move, false, target) + resistance + attr.defence;
  return {
    attackerScore: clamp(attackerScore * submissionGrip(defender), 5, 100),
    defenderScore: clamp(defenderScore, 5, 100),
    tapThreshold: clamp(tap, 80, 98),
    escapeThreshold: 10,
    targetHp: hp,
  };
}

/* ---------- AI execution estimate ---------- */

/** Godot execution_success_chance: used only to score AI options. */
export function executionChance(state: Side, move: Move): number {
  const control = move.interaction === 'HOLD_POWER' || move.interaction === 'SUBMISSION_LOCK_IN'
    || (move.interaction === 'AUTO' && (move.submission || (!move.strike && move.type !== 'STRIKE' && move.type !== 'AERIAL' && move.type !== 'SPRINGBOARD')));
  let c = (control ? 70 : 72) + (state.momentum - 50) * 0.12 - Math.max(0, move.impact - 5) * 1.5;
  c += moveAttributeProfile(state, move).windowModifier;
  if (move.finisher) c -= 8;
  if (isHighRisk(move)) c -= 6;
  c += compatibilityBonus(state, move);
  c *= executionMultiplier(state, moveDemand(move, isSignatureMove(state, move)));
  return clamp(clamp(c, 18, 92), 6, 70);
}
