// Port of MatchAttributeModel: attributes nudge damage, windows, reversals and setups around a 70 baseline.
import type { Move } from '../data/rtr/types';
import { clamp } from './rng';
import type { SetupId, Side } from './types';

export const attributeDelta = (v: number): number => clamp((v - 70) / 30, -1, 1);

export function isSpeedMove(m: Move | null): boolean {
  if (!m) return false;
  return (
    m.type === 'AERIAL' || m.type === 'SPRINGBOARD' || m.type === 'RUNNING'
    || m.req.a.motion === 'RUNNING' || m.req.a.motion === 'ROPE_REBOUND'
    || m.req.t.motion === 'ROPE_REBOUND'
    || m.req.a.area === 'TOP_ROPE' || m.req.a.area === 'APRON' || m.req.a.area === 'LADDER'
  );
}

export interface MoveAttributeProfile {
  damageMultiplier: number;
  windowModifier: number;
  speedMultiplier: number;
  controlModifier: number;
}

export function moveAttributeProfile(attacker: Side, move: Move | null): MoveAttributeProfile {
  const st = attacker.w.stats;
  const str = attributeDelta(st.strength), spd = attributeDelta(st.speed), skl = attributeDelta(st.skill), stk = attributeDelta(st.striking);
  let dmg = 1, win = 0, speed = 1, ctrl = 0;
  if (move) {
    if (move.strike || move.type === 'STRIKE') {
      dmg *= 1 + stk * 0.1;
      win += stk * 4;
    } else if (move.type === 'GRAPPLE') {
      dmg *= 1 + str * 0.08;
      win += str * 2 + skl * 2;
      ctrl += skl * 4;
    }
    if (isSpeedMove(move)) {
      dmg *= 1 + spd * 0.07;
      win += spd * 5;
      speed *= 1 - spd * 0.05;
    }
    if (move.submission || move.type === 'SUBMISSION') {
      win += skl * 4;
      ctrl += skl * 4;
    }
  }
  return {
    damageMultiplier: clamp(dmg, 0.85, 1.15),
    windowModifier: clamp(win, -8, 8),
    speedMultiplier: clamp(speed, 0.9, 1.1),
    controlModifier: clamp(ctrl, -4, 4),
  };
}

export function submissionModifiers(attacker: Side, defender: Side): { attack: number; defence: number } {
  return { attack: attributeDelta(attacker.w.stats.skill) * 8, defence: attributeDelta(defender.w.stats.skill) * 8 };
}

const MOVEMENT: ReadonlySet<SetupId> = new Set<SetupId>([
  'start_running', 'stop_running', 'regain_footing', 'climb_top_rope', 'climb_down', 'prepare_springboard', 'return_to_ring',
  'step_to_ropes', 'leave_ropes', 'exit_ring', 'bring_match_back_to_ring', 'bring_opponent_into_ring', 'return_from_ramp', 'fight_up_ramp',
]);
const HEAVY_POSITIONING: ReadonlySet<SetupId> = new Set<SetupId>([
  'pick_opponent_up', 'irish_whip', 'throw_into_corner', 'send_opponent_outside', 'call_opponent_outside', 'take_fight_outside',
]);
const TECHNICAL: ReadonlySet<SetupId> = new Set<SetupId>([
  'get_behind_opponent', 'turn_opponent_face_up', 'turn_opponent_face_down', 'sit_opponent_up_front', 'sit_opponent_up_back',
  'pull_opponent_to_knees_front', 'pull_opponent_to_knees_back', 'turn_opponent_in_corner', 'seat_opponent_in_corner',
  'lean_opponent_on_ropes_front', 'lean_opponent_on_ropes_back', 'drape_opponent_on_ropes_front', 'drape_opponent_on_ropes_back',
  'place_opponent_on_apron_front', 'place_opponent_on_apron_back', 'set_opponent_on_top_rope_front', 'set_opponent_on_top_rope_back',
]);

export function setupScoringModifier(actor: Side, id: SetupId): number {
  const st = actor.w.stats;
  if (MOVEMENT.has(id)) return clamp(attributeDelta(st.speed) * 8, -10, 10);
  if (HEAVY_POSITIONING.has(id)) return clamp(attributeDelta(st.strength) * 8, -10, 10);
  if (TECHNICAL.has(id)) return clamp(attributeDelta(st.skill) * 8, -10, 10);
  return 0;
}

export function tauntProfile(actor: Side): { staminaMultiplier: number; momentumBonus: number; aiScoreModifier: number } {
  const c = attributeDelta(actor.w.stats.charisma);
  return {
    staminaMultiplier: clamp(1 + c * 0.1, 0.9, 1.1),
    momentumBonus: clamp(Math.round(c * 2), -2, 2),
    aiScoreModifier: c * 10,
  };
}
