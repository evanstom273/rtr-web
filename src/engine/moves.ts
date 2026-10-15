// Moves: validity, execution, result application. Port of execute_move, apply_move_result,
// apply_damage, apply_stamina_fatigue_momentum, apply_positions and the body-story commentary.
import { LINES, PART_LABEL } from '../data/commentary';
import type { BodyPart } from '../data/rtr/types';
import { moveAttributeProfile } from './attributes';
import { advanceClock, observePhase, settleRefereeCount } from './clock';
import type { Ctx } from './ctx';
import { flash, other, ring, say } from './commentary';
import { crowdObserve, isOutsideSpot } from './crowd';
import { exhaustionBand, moveDemand, staminaCostMultiplier, staminaPercent } from './exhaustion';
import { afterAction, render, resolveControlAfterAction, schedule, setControl } from './flow';
import { conditionWord, pinOdds } from './pin';
import { isHighRisk } from './interaction';
import { resolvedAttackerArea, resolvedTargetArea } from './areaRules';
import { moveMatchesSnapshots } from './setupRules';
import {
  addFatigue, canUseMove, damagePart, grantFinisherStock, isFinisherMove, isSignatureMove,
  markCrossedThresholds, markRepeatedTargetMilestone, recordMoveUsed, recordTargetResolution, spendFinisher, spendStamina, totalHp, useSignature,
} from './side';
import { resolveTarget } from './targeting';
import { startContest } from './contest';
import { moveContest } from './dice';
import { gainMomentum } from './momentum';
import type { ActionResult, MatchState, Move, Side, SideKey, TargetResolution } from './types';

export const SUCCESSFUL_MOVE_MOMENTUM = 10;
export const REVERSAL_MOMENTUM = 5;

const isInRing = (s: Side) => s.state.area === 'IN_RING';

/** _move_is_valid (standard rules: submissions only with both wrestlers inside). */
export function moveIsValid(S: MatchState, k: SideKey, move: Move): boolean {
  const a = S[k], d = S[other(k)];
  if ((move.submission || move.type === 'SUBMISSION') && !(isInRing(a) && isInRing(d))) return false;
  if (!canUseMove(a, move)) return false;
  return moveMatchesSnapshots(move, a.state, d.state);
}

export function validMoves(S: MatchState, k: SideKey): Move[] {
  return S[k].all.filter((m) => moveIsValid(S, k, m));
}

export function staminaCost(move: Move): number {
  let cost = 4;
  if (move.impact >= 9) cost = 14;
  else if (move.impact >= 7) cost = 10;
  else if (move.impact >= 4) cost = 7;
  if (move.strike) cost -= 1;
  if (move.submission) cost += 2;
  if (move.finisher) cost += 4;
  if (isHighRisk(move)) cost += 4;
  return Math.max(0, cost);
}

export function majorKind(s: Side, move: Move): 'SIGNATURE' | 'FINISHER' | null {
  if (isFinisherMove(s, move)) return 'FINISHER';
  if (isSignatureMove(s, move)) return 'SIGNATURE';
  return null;
}

/** The player's call after a pin combo: cover now, or pass on it and keep the upper hand. */
export function resolvePinChoice(ctx: Ctx, move: Move, cover: boolean): void {
  if (cover) {
    schedule(ctx, { to: 'startPin', k: 'you', embedded: true }, 150);
    return;
  }
  say(ctx, LINES.coverPassed, { a: 'you', d: 'them', m: move.name }, 'dim');
  setControl(ctx, 'you');
  afterAction(ctx);
}

/** Start a move. The UI then runs the reversal ring and calls back with the result. */
export function executeMove(ctx: Ctx, k: SideKey, move: Move, target?: TargetResolution): boolean {
  const S = ctx.S, A = S[k], dk = other(k), D = S[dk];
  if (!moveIsValid(S, k, move)) return false;
  D.setUp = false;
  const tgt = target ?? resolveTarget(move, A.targetFocus, D.hp);
  if (isFinisherMove(A, move) && !spendFinisher(A)) return false;
  crowdObserve(ctx, { type: 'move_attempt', k, move, signatureOrFinisher: isSignatureMove(A, move) || isFinisherMove(A, move), uses: (A.moveUseCounts[move.id] ?? 0) + 1 });
  advanceClock(ctx);
  ring(ctx, 'move_started', k, move.name);
  const major = majorKind(A, move);
  if (major) flash(ctx, move.name, major === 'FINISHER');
  const { attack, defend } = moveContest(A, D, move, tgt);
  A.setUp = false;
  S.txn = { kind: 'move', k, move, target: tgt, chance: 0 };
  startContest(ctx, { kind: 'move', attacker: k, defender: dk, title: move.name, major, attack, defend });
  return true;
}

/** The defender's response is in: apply the move and decide what happens next. */
export function finishMove(ctx: Ctx, k: SideKey, move: Move, reversed: boolean, target: TargetResolution, crit = false): void {
  const S = ctx.S, A = S[k], dk = other(k);
  const startedAtZero = A.stamina <= 0;
  const result: ActionResult = reversed ? (isHighRisk(move) ? 'HIGH_RISK_CRASH' : 'REVERSAL') : 'CLEAN_SUCCESS';
  applyMoveResult(ctx, k, dk, move, result, target, crit);
  const embedded = shouldStartEmbeddedPin(S, k, dk, move, result);
  settleRefereeCount(ctx);
  if (S.over) return;
  if (startedAtZero && result === 'CLEAN_SUCCESS' && !A.announcedHeroic) {
    A.announcedHeroic = true;
    say(ctx, LINES.heroic, { a: k }, 'good');
  }
  exhaustionCommentary(ctx, k);
  render(ctx);
  if (move.submission && result === 'CLEAN_SUCCESS') return schedule(ctx, { to: 'startSub', k, moveId: move.id, target }, 450);
  if (embedded && k === 'you' && (move.pinningCombo || move.flashPin)) {
    // Web addition: the player decides whether to cover, with the real odds in front of them.
    const D = S[dk];
    S.pending = {
      kind: 'pinChoice',
      spec: {
        id: ++S.seq, moveId: move.id, moveName: move.name, odds: pinOdds(S, k, true), condition: conditionWord(D),
        resiliency: D.resiliencyAvailable && !D.resiliencyUsed,
      },
    };
    return;
  }
  if (embedded) return schedule(ctx, { to: 'startPin', k, embedded: true }, 450);
  resolveControlAfterAction(ctx, k, dk, move, result);
  afterAction(ctx);
}

export function shouldStartEmbeddedPin(S: MatchState, k: SideKey, dk: SideKey, move: Move, result: ActionResult): boolean {
  if (move.submission || result !== 'CLEAN_SUCCESS') return false;
  if (!isInRing(S[k]) || !isInRing(S[dk])) return false;
  if (move.flashPin || move.pinningCombo) return true;
  if (!move.finisher) return false;
  return S[k].state.position === 'GROUNDED' && S[dk].state.position === 'GROUNDED';
}

function applyMoveResult(ctx: Ctx, k: SideKey, dk: SideKey, move: Move, result: ActionResult, target: TargetResolution, crit: boolean): void {
  const S = ctx.S, A = S[k], D = S[dk];
  A.lastActionResult = result;
  D.lastActionResult = result;
  const landed = result === 'CLEAN_SUCCESS';
  const outside = isOutsideSpot(A.state.area) || isOutsideSpot(D.state.area);
  recordMoveUsed(A, move, landed);
  const reversalLanded = result === 'REVERSAL' || result === 'HIGH_RISK_CRASH';
  if (reversalLanded) S.recentReversalSide = dk;
  else if (k === S.recentReversalSide) {
    if (!landed || !move.flashPin) S.recentReversalSide = null;
  } else S.recentReversalSide = null;
  let stockReward = 0;
  if (reversalLanded) {
    D.reversals++;
    if (isFinisherMove(A, move)) stockReward = grantFinisherStock(D);
    ctx.ai[dk].noteReversalControl();
    observePhase(ctx, result === 'HIGH_RISK_CRASH' ? 'high_risk_crash' : 'reversal');
  }
  if (!landed) A.lastMoveWasFinisher = false;
  applyDamage(ctx, k, dk, move, result, target, crit);
  applyStaminaFatigueMomentum(ctx, k, dk, move, result);
  applyPositions(A, D, move, result);
  if (landed && isSignatureMove(A, move)) useSignature(A);
  ctx.ai[k].noteMoveResult(move, landed, D, A, target);
  if (result === 'HIGH_RISK_CRASH') ctx.ai[dk].notePlayerHighRiskCrash();

  if (landed) {
    const major = majorKind(A, move);
    if (major === 'FINISHER') say(ctx, LINES.finisherHit, { a: k, vars: { x: move.name.toUpperCase() } }, 'hl');
    else if (major === 'SIGNATURE') say(ctx, LINES.signatureHit, { a: k, vars: { x: move.name.toUpperCase() } }, 'hl');
    else if (!move.submission) {
      const limb = target.storyPart !== 'HEAD' && target.storyPart !== 'BODY';
      say(ctx, limb ? LINES.cleanLimb : LINES.clean, { a: k, d: dk, m: move.name, vars: { part: PART_LABEL[target.storyPart] } });
    }
    ring(ctx, 'move_landed', k, move.name);
    crowdObserve(ctx, { type: 'move_landed', k, move, highRisk: isHighRisk(move), signature: major === 'SIGNATURE', finisher: major === 'FINISHER', outside });
    if (major === 'SIGNATURE') observePhase(ctx, 'signature_landed');
    if (major === 'FINISHER') observePhase(ctx, 'finisher_landed');
  } else if (result === 'REVERSAL') {
    say(ctx, LINES.reversal, { a: k, d: dk, m: move.name });
    ring(ctx, 'reversal', dk, move.name);
    crowdObserve(ctx, { type: 'reversal', k: dk, finisher: isFinisherMove(A, move), crash: false });
  } else {
    say(ctx, LINES.crash, { a: k, d: dk, m: move.name });
    ring(ctx, 'crash', k, move.name);
    crowdObserve(ctx, { type: 'reversal', k: dk, finisher: isFinisherMove(A, move), crash: true });
  }
  if (stockReward > 0) {
    say(ctx, LINES.finisherStock, { a: dk, vars: { n: D.finisherStock } }, 'hl');
    flash(ctx, 'Reversed', true);
  }
}

/** A natural 20 on offence hits half as hard again. */
export const CRIT_DAMAGE = 1.5;

function applyDamage(ctx: Ctx, k: SideKey, dk: SideKey, move: Move, result: ActionResult, target: TargetResolution, crit: boolean): void {
  const A = ctx.S[k], D = ctx.S[dk];
  const aBefore = totalHp(A), dBefore = totalHp(D);
  const before: Partial<Record<BodyPart, number>> = {};
  for (const p of target.parts) before[p] = D.hp[p];
  if (result === 'HIGH_RISK_CRASH') damagePart(A, 'BODY', move.impact * 0.75);
  else if (result === 'CLEAN_SUCCESS') {
    const mult = moveAttributeProfile(A, move).damageMultiplier * (crit ? CRIT_DAMAGE : 1);
    for (const p of target.parts) {
      const dmg = move.impact + (100 - D.hp[p]) * 0.08;
      damagePart(D, p, dmg * (target.weights[p] ?? 1) * mult);
    }
  }
  const aDmg = Math.max(0, aBefore - totalHp(A)), dDmg = Math.max(0, dBefore - totalHp(D));
  A.damageTaken += aDmg;
  D.damageTaken += dDmg;
  A.damageDealt += dDmg;
  const landed = result === 'CLEAN_SUCCESS';
  for (const p of target.parts) recordTargetResolution(A, p, Math.max(0, (before[p] ?? D.hp[p]) - D.hp[p]), landed);
  if (landed) bodyStory(ctx, k, dk, move, target, before);
}

/** _record_body_target_story: at most one body line per move, prioritised. */
function bodyStory(ctx: Ctx, k: SideKey, dk: SideKey, move: Move, target: TargetResolution, before: Partial<Record<BodyPart, number>>): void {
  const S = ctx.S, A = S[k], D = S[dk];
  let critical = '', threshold = '';
  let criticalPart: BodyPart = target.storyPart, thresholdPart: BodyPart = target.storyPart;
  for (const p of target.parts) {
    const crossed = markCrossedThresholds(D, p, before[p] ?? D.hp[p], D.hp[p]);
    for (const th of [0, 20, 40, 60, 80]) {
      if (!crossed.includes(th)) continue;
      crowdObserve(ctx, { type: 'threshold', critical: th <= 20 });
      if (th <= 20 && !critical) {
        critical = LINES.critical;
        criticalPart = p;
      } else if (!threshold) {
        threshold = LINES.threshold;
        thresholdPart = p;
      }
    }
  }
  const story = target.storyPart;
  const repeated = markRepeatedTargetMilestone(A, story, A.targetAttackCounts[story] ?? 0) ? LINES.repeated : '';
  const subDanger = move.submission && D.hp[story] < 40 ? LINES.subDanger : '';
  let line = critical, part = criticalPart, cls: '' | 'bad' | 'dim' = 'bad';
  if (!line) [line, part, cls] = [subDanger, story, 'dim'];
  if (!line) [line, part, cls] = [threshold, thresholdPart, 'dim'];
  if (!line) [line, part, cls] = [repeated, story, 'dim'];
  if (!line) return;
  const isCritical = line === critical && !!critical;
  if (!isCritical && S.t - D.lastBodyCommentaryTime < 60) return;
  D.lastBodyCommentaryTime = S.t;
  say(ctx, line, { a: k, d: dk, vars: { part: PART_LABEL[part] } }, cls);
}

function applyStaminaFatigueMomentum(ctx: Ctx, k: SideKey, dk: SideKey, move: Move, result: ActionResult): void {
  const A = ctx.S[k], D = ctx.S[dk];
  const demand = moveDemand(move, isSignatureMove(A, move));
  const cost = staminaCost(move) * staminaCostMultiplier(A, demand);
  const fatigue = 2 + (isHighRisk(move) ? 4 : 0) + (move.finisher ? 4 : 0);
  spendStamina(A, cost);
  addFatigue(A, fatigue);
  if (result === 'CLEAN_SUCCESS') {
    addFatigue(D, 2 + (move.finisher ? 4 : 0));
    gainMomentum(ctx, k, SUCCESSFUL_MOVE_MOMENTUM);
  } else {
    gainMomentum(ctx, k, -REVERSAL_MOMENTUM);
    gainMomentum(ctx, dk, REVERSAL_MOMENTUM);
  }
}

function applyPositions(A: Side, D: Side, move: Move, result: ActionResult): void {
  if (result === 'CLEAN_SUCCESS') {
    A.state = { position: move.res.a.position, orientation: move.res.a.orientation, area: resolvedAttackerArea(move, A.state.area), motion: move.res.a.motion };
    D.state = { position: move.res.t.position, orientation: move.res.t.orientation, area: resolvedTargetArea(move, D.state.area), motion: move.res.t.motion };
  } else if (result === 'HIGH_RISK_CRASH') {
    A.state = { position: 'GROUNDED', orientation: 'FACE_DOWN', area: resolvedAttackerArea(move, A.state.area), motion: 'STATIONARY' };
  }
}

export function exhaustionCommentary(ctx: Ctx, k: SideKey): void {
  for (const key of [k, other(k)] as SideKey[]) {
    const s = ctx.S[key];
    if (staminaPercent(s) < 50 && !s.announcedLowStamina) {
      s.announcedLowStamina = true;
      say(ctx, LINES.lowStamina, { a: key }, 'warn');
    }
    if (s.fatigue > 75 && !s.announcedHighFatigue) {
      s.announcedHighFatigue = true;
      say(ctx, LINES.highFatigue, { a: key }, 'warn');
    }
    if (exhaustionBand(s) === 'Spent' && !s.announcedSpent) {
      s.announcedSpent = true;
      say(ctx, LINES.spent, { a: key }, 'bad');
    }
  }
}
