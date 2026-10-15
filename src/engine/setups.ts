// Setup / showboat actions. Port of get_valid_setup_actions, execute_setup_action,
// _execute_contested_setup_action, _apply_reversed_setup_positions, taunts and Catch Breath.
import { LINES, SETUP_TEXT, setupLogLine, tauntTitle } from '../data/commentary';
import { tauntProfile } from './attributes';
import { advanceClock, sideIsOutside } from './clock';
import type { Ctx } from './ctx';
import { other, ring, say } from './commentary';
import { crowdObserve } from './crowd';
import {
  CATCH_BREATH_COOLDOWN_SECONDS, CATCH_BREATH_STAMINA_THRESHOLD, catchBreathRecovery, recoveryDelayChance,
  staminaCostMultiplier, staminaPercent, staminaRecoveryMultiplier,
} from './exhaustion';
import { afterAction, render, setControl, setResolvedControl } from './flow';
import { startContest } from './contest';
import { setupContest } from './dice';
import { exhaustionCommentary, SUCCESSFUL_MOVE_MOMENTUM, REVERSAL_MOMENTUM, validMoves } from './moves';
import { gainMomentum } from './momentum';
import { pick } from './rng';
import { candidateActions, findFollowupPaths, isContested, isRecovery, projectAction } from './setupRules';
import { addFatigue, canUseMove, noteSetupAction, recoverStamina, spendStamina } from './side';
import type { MatchState, SetupId, Side, SideKey } from './types';

export const TAUNT_COOLDOWN_SECONDS = 120;

/** get_valid_setup_actions: recoveries, taunt/breath when eligible, and first steps toward a real follow-up. */
export function validSetups(S: MatchState, k: SideKey): SetupId[] {
  const A = S[k], D = S[other(k)];
  const actions = candidateActions(A.state, D.state);
  const firstSteps = new Set<SetupId>();
  for (const path of findFollowupPaths(A.all, A.state, D.state, 2)) {
    if (path.actions.length && canUseMove(A, path.move)) firstSteps.add(path.actions[0]!);
  }
  const out: SetupId[] = [];
  for (const id of actions) {
    // The AI may only leave the ring alone as part of a weapon plan; there are no weapons yet.
    if (k === 'them' && id === 'exit_ring') continue;
    if (id === 'taunt' && S.t < A.tauntCooldownUntil) continue;
    if (id === 'catch_breath' && (staminaPercent(A) >= CATCH_BREATH_STAMINA_THRESHOLD || S.t < A.catchBreathCooldownUntil)) continue;
    if (isRecovery(id) || id === 'taunt' || id === 'catch_breath' || (k === 'you' && id === 'exit_ring') || firstSteps.has(id)) out.push(id);
  }
  if (S.rules.countOuts && !sideIsOutside(S, k) && sideIsOutside(S, other(k)) && !out.includes('wait_for_count')) {
    out.push('wait_for_count');
  }
  if (!out.length) out.push('reset_stance');
  return out;
}

export function setupTitle(s: Side, id: SetupId): string {
  return id === 'taunt' ? tauntTitle(s.state.area) : SETUP_TEXT[id].title;
}

const DELAYABLE: ReadonlySet<SetupId> = new Set<SetupId>(['stand_up', 'stop_running', 'regain_footing', 'regain_composure']);

export function executeSetup(ctx: Ctx, k: SideKey, id: SetupId): boolean {
  const S = ctx.S, A = S[k], dk = other(k), D = S[dk];
  if (!validSetups(S, k).includes(id)) return false;
  D.setUp = false;
  if (id === 'wait_for_count') {
    advanceClock(ctx);
    spendStamina(A, staminaCostMultiplier(A, 'BASIC'));
    say(ctx, LINES.waitForCount, { a: k }, 'warn');
    ring(ctx, 'setup', k, 'Wait');
    // A pass: the wrestler on the floor gets the next turn.
    setControl(ctx, dk);
    afterAction(ctx);
    return true;
  }
  if (!projectAction(id, A.state, D.state).valid) return false;
  S.recentReversalSide = null;
  advanceClock(ctx);
  if (S.over) return true;
  // Exhaustion can keep a wrestler down for an extra beat.
  if (DELAYABLE.has(id)) {
    if (A.recoveryDelayProtected) A.recoveryDelayProtected = false;
    else if (ctx.rnd() * 100 < recoveryDelayChance(A, A.lastActionResult === 'HIGH_RISK_CRASH')) {
      A.recoveryDelayProtected = true;
      spendStamina(A, staminaCostMultiplier(A, 'BASIC'));
      addFatigue(A, 0.5);
      say(ctx, LINES.recoveryDelayed, { a: k }, 'warn');
      setResolvedControl(ctx, 'neutral', k, dk);
      afterAction(ctx);
      return true;
    }
  }
  if (id === 'catch_breath') {
    A.catchBreathCooldownUntil = S.t + CATCH_BREATH_COOLDOWN_SECONDS;
    const recovered = recoverStamina(A, catchBreathRecovery(A));
    say(ctx, LINES.catchBreath, { a: k, vars: { n: recovered.toFixed(1) } }, 'good');
    crowdObserve(ctx, { type: 'catch_breath' });
    ctx.ai[k].noteSetupExecuted('catch_breath', A);
    A.lastActionResult = 'SETUP_SUCCESS';
    // Surrender initiative: the opponent gets the favoured neutral roll.
    S.neutralFavoured = dk;
    setResolvedControl(ctx, 'neutral', k, dk);
    S.neutralFavoured = dk;
    afterAction(ctx);
    return true;
  }
  if (id === 'taunt') A.tauntCooldownUntil = S.t + TAUNT_COOLDOWN_SECONDS;
  if (isContested(id)) {
    const { attack, defend } = setupContest(A, D, id);
    A.recentSetups.push(id);
    if (A.recentSetups.length > 5) A.recentSetups.shift();
    S.txn = { kind: 'setup', k, action: id, chance: 0 };
    startContest(ctx, { kind: 'setup', attacker: k, defender: dk, title: setupTitle(A, id), major: null, attack, defend });
    return true;
  }
  // Uncontested: apply directly.
  const p = projectAction(id, A.state, D.state);
  A.state = p.attacker;
  D.state = p.target;
  const recovery = isRecovery(id);
  spendStamina(A, (recovery ? 1 : 3) * staminaCostMultiplier(A, recovery ? 'BASIC' : 'STANDARD'));
  addFatigue(A, recovery ? 0.5 : 1);
  exhaustionCommentary(ctx, k);
  ctx.ai[k].noteSetupExecuted(id, A);
  A.lastActionResult = 'SETUP_SUCCESS';
  say(ctx, setupLogLine(id), { a: k, d: dk }, 'dim');
  ring(ctx, 'setup', k, setupTitle(A, id));
  setControl(ctx, k);
  afterAction(ctx);
  return true;
}

/** The contested setup's bar has resolved. */
export function finishContestedSetup(ctx: Ctx, k: SideKey, id: SetupId, reversed: boolean): void {
  const S = ctx.S, A = S[k], dk = other(k), D = S[dk];
  const isTaunt = id === 'taunt';
  const originalArea = A.state.area;
  if (reversed) {
    ctx.ai[k].noteSetupExecuted(null, A);
    applyReversedSetupPositions(id, A, D);
    spendStamina(A, 3 * staminaCostMultiplier(A, 'STANDARD'));
    addFatigue(A, 2);
    gainMomentum(ctx, dk, REVERSAL_MOMENTUM);
    D.reversals++;
    S.recentReversalSide = dk;
    A.lastActionResult = 'REVERSAL';
    if (isTaunt) {
      const line = originalArea === 'TOP_ROPE' ? LINES.tauntInterruptedTop : originalArea === 'APRON' ? LINES.tauntInterruptedApron : pick(ctx.rnd, LINES.tauntInterrupted);
      say(ctx, line, { a: k, d: dk });
      crowdObserve(ctx, { type: 'taunt_interrupted', k: dk });
    } else {
      say(ctx, reversedSetupLine(id), { a: k, d: dk });
      crowdObserve(ctx, { type: 'setup_reversed', k: dk });
    }
    ring(ctx, 'reversal', dk, setupTitle(A, id));
  } else {
    const p = projectAction(id, A.state, D.state);
    A.state = p.attacker;
    D.state = p.target;
    if (isTaunt) {
      applySuccessfulTaunt(ctx, A);
      say(ctx, tauntLine(ctx, A, D), { a: k }, 'good');
      crowdObserve(ctx, { type: 'taunt', k, charisma: A.w.stats.charisma });
    } else {
      noteSetupAction(A, id);
      A.setUp = true;
      spendStamina(A, 3 * staminaCostMultiplier(A, 'STANDARD'));
      addFatigue(A, 1);
      say(ctx, setupLogLine(id), { a: k, d: dk }, 'dim');
    }
    A.lastActionResult = 'SETUP_SUCCESS';
    ctx.ai[k].noteSetupExecuted(id, A);
    ring(ctx, 'setup', k, setupTitle(A, id));
  }
  exhaustionCommentary(ctx, k);
  render(ctx);
  let control: SideKey = reversed ? dk : k;
  // Sending the opponent outside with nothing to follow it up hands them the next turn.
  if (!reversed && id === 'send_opponent_outside' && !hasImmediateOutsideFollowup(S, k)) control = dk;
  setResolvedControl(ctx, control, k, dk);
  afterAction(ctx);
}

function hasImmediateOutsideFollowup(S: MatchState, k: SideKey): boolean {
  if (validMoves(S, k).length) return true;
  const A = S[k], D = S[other(k)];
  return findFollowupPaths(A.all, A.state, D.state, 1).some((p) => canUseMove(A, p.move));
}

function applyReversedSetupPositions(id: SetupId, A: Side, D: Side): void {
  switch (id) {
    case 'irish_whip': {
      D.state.motion = 'STATIONARY';
      const area = ['IN_RING', 'OUTSIDE', 'RAMP', 'CROWD', 'BACKSTAGE'].includes(A.state.area) ? A.state.area : 'IN_RING';
      A.state = { position: 'STANDING', orientation: 'FRONT', area, motion: 'ROPE_REBOUND' };
      break;
    }
    case 'throw_into_corner':
      D.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
      A.state = { position: 'STANDING', orientation: 'FRONT', area: 'CORNER', motion: 'STATIONARY' };
      break;
    case 'pick_opponent_up':
      A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: A.state.area, motion: 'STATIONARY' };
      D.state.motion = 'STATIONARY';
      break;
    case 'taunt':
      if (A.state.area === 'TOP_ROPE') A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
      else if (A.state.area === 'APRON') A.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
      else A.state.motion = 'STATIONARY';
      break;
  }
}

function applySuccessfulTaunt(ctx: Ctx, A: Side): void {
  const profile = tauntProfile(A);
  let reward = A.state.area === 'APRON' ? 3 : A.state.area === 'TOP_ROPE' ? 2 : 4;
  reward *= staminaRecoveryMultiplier(A) * profile.staminaMultiplier;
  recoverStamina(A, reward);
  gainMomentum(ctx, A.key, Math.max(1, SUCCESSFUL_MOVE_MOMENTUM + profile.momentumBonus));
}

function tauntLine(ctx: Ctx, A: Side, D: Side): string {
  if (A.state.area === 'TOP_ROPE') return pick(ctx.rnd, LINES.tauntTop);
  if (A.state.area === 'APRON') return pick(ctx.rnd, LINES.tauntApron);
  if (staminaPercent(A) < 30 || A.fatigue >= 70) return LINES.tauntTired;
  if (D.state.position === 'GROUNDED') return LINES.tauntStalk;
  if (A.momentum >= 75) return LINES.tauntFired;
  return pick(ctx.rnd, LINES.tauntStanding);
}

function reversedSetupLine(id: SetupId): string {
  if (id === 'irish_whip') return LINES.setupReversedWhip;
  if (id === 'throw_into_corner') return LINES.setupReversedCorner;
  if (id === 'pick_opponent_up') return LINES.setupReversedPickup;
  return LINES.setupReversed;
}
