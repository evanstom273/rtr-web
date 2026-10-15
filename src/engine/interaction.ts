// Port of MatchInteractionModel (+ the request builders from simple_match_ui.gd): reversal chances,
// the sizes of the player-facing timing targets, pin and submission pressure.
import type { Area, Move } from '../data/rtr/types';
import { moveAttributeProfile, reversalModifier, submissionModifiers } from './attributes';
import {
  executionMultiplier, kickoutPenalty, moveDemand, reversalPenalty, submissionEscapePenalty,
} from './exhaustion';
import { clamp } from './rng';
import {
  isSignatureMove, lastAttemptedMoveMatches, recentMoveTypeCount, recentTargetPartCount, setupPatternRepeats,
} from './side';
import { isLimbFocus, resolveTarget, targetHp } from './targeting';
import type { SetupId, Side, TargetResolution } from './types';

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

function tauntInterruptionBase(attackerArea: Area, defenderPosition: string): number {
  const grounded = defenderPosition === 'GROUNDED';
  if (attackerArea === 'TOP_ROPE') return grounded ? 28 : 42;
  if (attackerArea === 'APRON') return grounded ? 23 : 35;
  return grounded ? 18 : 30;
}

function baseReversalChance(m: Move | null, setup: SetupId | null): number {
  if (setup) {
    if (setup === 'pick_opponent_up') return 30;
    if (setup === 'irish_whip' || setup === 'throw_into_corner' || setup === 'send_opponent_outside'
      || setup === 'call_opponent_outside' || setup === 'take_fight_outside') return 28;
    return 25;
  }
  if (!m) return 22;
  if (m.finisher) return 12;
  if (isHighRisk(m)) return 28;
  return isHeavyMove(m) ? 18 : 22;
}

/** The defender's chance (5–65%) to reverse a move or contested setup. */
export function reversalChance(
  attacker: Side, defender: Side, move: Move | null, setup: SetupId | null, target: TargetResolution | null,
): number {
  let c = setup === 'taunt' ? tauntInterruptionBase(attacker.state.area, defender.state.position) : baseReversalChance(move, setup);
  if (defender.momentum >= 70) c += 10;
  else if (defender.momentum >= 40) c += 5;
  else if (defender.momentum < 20) c -= 5;
  if (attacker.momentum >= 70) c -= 8;
  else if (attacker.momentum >= 40) c -= 4;
  else if (attacker.momentum < 20) c += 4;
  if (move) {
    if (move.impact <= 3) c += 4;
    else if (move.impact >= 9) c -= 8;
    else if (move.impact >= 7) c -= 4;
    if (move.finisher) c -= 10;
    if (isHighRisk(move)) c += 10;
    if (lastAttemptedMoveMatches(attacker, move)) c += 10;
    if (recentMoveTypeCount(attacker, move.type, 5) >= 3) c += 6;
    if (setupPatternRepeats(attacker, move)) c += 5;
    const t = target ?? resolveTarget(move, 'NONE', defender.hp);
    const hp = target ? targetHp(defender.hp, t) : averageHp(defender, move);
    if (target && isLimbFocus(t.storyPart)) {
      const recent = recentTargetPartCount(attacker, t.storyPart, 5);
      if (recent >= 4) c += 12;
      else if (recent >= 2) c += 7;
    }
    if (hp < 25) c -= 10;
    else if (hp < 50) c -= 5;
    if (classCompatible(attacker, move) || inferredClassCompatible(attacker, move)) c -= 5;
  }
  if (defender.w.classes.includes('TECHNICIAN')) c += 5;
  c += reversalModifier(attacker, defender, move, setup);
  const ds = defender.state;
  if (ds.position === 'GROUNDED' || ds.position === 'SEATED' || ds.position === 'KNEELING' || ds.area === 'CORNER' || ds.motion === 'ROPE_REBOUND') c -= 3;
  c *= 1 - reversalPenalty(defender) / 100;
  return clamp(c, 5, 65);
}

function averageHp(s: Side, m: Move): number {
  const parts = m.parts.filter((p) => p !== 'NONE');
  if (!parts.length) return s.hp.BODY;
  return parts.reduce((t, p) => t + s.hp[p as Exclude<typeof p, 'NONE'>], 0) / parts.length;
}

/** Time the defender has to react (Godot build_reversal_profile). */
export function reversalTimeLimit(m: Move | null): number {
  if (m?.finisher) return 1.6;
  if (isHighRisk(m)) return 1.75;
  if (isHeavyMove(m)) return 1.8;
  return 2.0;
}

/** Shrinking-ring success band: player defending. */
export const defendRingWindow = (chance: number): number => clamp(clamp(chance, 5, 65) * 0.5, 8, 26);
/** Shrinking-ring success band: player attacking, beating the AI's reversal. */
export const breakthroughRingWindow = (aiChance: number): number => clamp((100 - clamp(aiChance, 5, 65)) * 0.25, 10, 24);

/** Setup bar gold width (% of track) when the player defends: raw clamp(chance×0.78, 24, 65) at 1/8 scale. */
export const defendBarWidth = (chance: number): number => clamp(chance * 0.78, 24, 65) / 8;
/** Setup bar gold width when the player attacks: raw clamp((100−ai)×0.78, 24, 32) at 1/8 scale. */
export const breakthroughBarWidth = (aiChance: number): number => clamp((100 - clamp(aiChance, 5, 75)) * 0.78, 24, 32) / 8;
/** Setup bar crossing time: one-way travel at max(1, speed)/time_limit. */
export const DEFEND_BAR_CROSS = 2.0 / 1.25;
export const BREAKTHROUGH_BAR_CROSS = 2.0 / 1.6;

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
    attackerScore: clamp(attackerScore, 5, 100),
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
