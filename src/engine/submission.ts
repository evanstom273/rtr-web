// Submissions. Port of start_submission_sequence, the damage ticks and resolution.
import { LINES, PART_LABEL } from '../data/commentary';
import { observePhase } from './clock';
import type { Ctx } from './ctx';
import { other, ring, say } from './commentary';
import { crowdObserve } from './crowd';
import { afterAction, endMatch, render, setControl } from './flow';
import { submissionContext } from './interaction';
import { aiShouldUseResiliency, pinCondition, useResiliency } from './pin';
import { clamp } from './rng';
import { damagePart, markCrossedThresholds, totalHp } from './side';
import { targetHp } from './targeting';
import type { Move, Side, SideKey, SubOutcome, TargetResolution } from './types';

/** Both resolution forces are scaled by this (Godot submission_resolution_speed_multiplier). */
export const SUBMISSION_SPEED_MULTIPLIER = 1.5;

/**
 * Web addition, same idea as pin resistance: the struggle starts where the defender's condition
 * puts it. Fresh (~100) starts at 25, near the escape; worked over (~63) ≈ 44; wrecked (~23) ≈ 64.
 * (Godot's submission scores cap out for any healthy wrestler, so they can't carry this.)
 */
export const submissionStart = (D: Side): number => clamp(50 - (pinCondition(D) - 50) * 0.5, 25, 75);

function isTrueSquashContext(ctx: Ctx, k: SideKey): boolean {
  const A = ctx.S[k], D = ctx.S[other(k)];
  const dominant = A.momentum >= 80 && D.momentum <= 20;
  const littleDefence = D.movesLanded <= 1 && D.damageDealt < 20;
  const sustained = A.movesLanded >= 3;
  const meaningful = D.damageTaken >= 30 || totalHp(D) <= 450;
  return dominant && littleDefence && sustained && meaningful;
}

export function startSubmission(ctx: Ctx, k: SideKey, move: Move, target: TargetResolution): void {
  const S = ctx.S, dk = other(k), A = S[k], D = S[dk];
  if (A.state.area !== 'IN_RING' || D.state.area !== 'IN_RING') {
    setControl(ctx, k);
    afterAction(ctx);
    return;
  }
  const part = target.storyPart;
  say(ctx, LINES.subTrapped, { a: k, d: dk, m: move.name, vars: { part: PART_LABEL[part] } }, move.finisher ? 'hl' : '');
  crowdObserve(ctx, { type: 'submission_started', limbPayoff: (A.targetAttackCounts[part] ?? 0) >= 4 });
  ring(ctx, 'submission', k, move.name);
  const sc = submissionContext(A, D, move, S.t, target, isTrueSquashContext(ctx, k));
  const playerAttacking = k === 'you';
  S.txn = { kind: 'sub', k, move, target, nearTapSaid: false, nearEscapeSaid: false, lastMarker: submissionStart(D) };
  S.pending = {
    kind: 'sub',
    spec: {
      id: ++S.seq, attacker: k, defender: dk,
      playerDirection: playerAttacking ? 1 : -1,
      playerScore: playerAttacking ? sc.attackerScore : sc.defenderScore,
      aiScore: playerAttacking ? sc.defenderScore : sc.attackerScore,
      tapThreshold: sc.tapThreshold,
      escapeThreshold: sc.escapeThreshold,
      speedMultiplier: SUBMISSION_SPEED_MULTIPLIER,
      start: submissionStart(D),
      moveName: move.name,
      partLabel: PART_LABEL[part],
      finisher: move.finisher,
    },
  };
  render(ctx);
}

/** One second of the struggle has passed with the marker at `marker` (0–100, 100 = tap). */
export function submissionTick(ctx: Ctx, marker: number): void {
  const S = ctx.S, txn = S.txn, p = S.pending;
  if (!txn || txn.kind !== 'sub' || p.kind !== 'sub') return;
  const k = txn.k, dk = other(k), A = S[k], D = S[dk];
  const dmg = 0.5 + (Math.max(0, marker - 50) / 50) * 0.75;
  const before = totalHp(D);
  let giving = '';
  for (const part of txn.target.parts) {
    const hpBefore = D.hp[part];
    damagePart(D, part, dmg * (txn.target.weights[part] ?? 1));
    A.targetDamageDealt[part] = (A.targetDamageDealt[part] ?? 0) + Math.max(0, hpBefore - D.hp[part]);
    const crossed = markCrossedThresholds(D, part, hpBefore, D.hp[part]);
    if (!giving && (crossed.includes(20) || crossed.includes(0))) giving = PART_LABEL[part];
  }
  const applied = Math.max(0, before - totalHp(D));
  D.damageTaken += applied;
  A.damageDealt += applied;
  if (giving && S.t - D.lastBodyCommentaryTime >= 60) {
    D.lastBodyCommentaryTime = S.t;
    say(ctx, LINES.subGiving, { d: dk, vars: { part: giving } }, 'warn');
  }
  const spec = p.spec;
  if (marker >= spec.tapThreshold - 12 && !txn.nearTapSaid) {
    txn.nearTapSaid = true;
    say(ctx, LINES.subNearTap, { d: dk }, 'warn');
    crowdObserve(ctx, { type: 'near_tap' });
  } else if (marker <= spec.escapeThreshold + 12 && !txn.nearEscapeSaid) {
    txn.nearEscapeSaid = true;
    say(ctx, LINES.subNearEscape, { d: dk }, 'dim');
  } else if (marker - txn.lastMarker >= 6) say(ctx, LINES.subGaining, { a: k }, 'dim');
  else if (txn.lastMarker - marker >= 6) say(ctx, LINES.subFighting, { d: dk }, 'dim');
  txn.lastMarker = marker;
  render(ctx);
}

export function resolveSubmission(ctx: Ctx, outcome: SubOutcome): void {
  const S = ctx.S, txn = S.txn;
  if (!txn || txn.kind !== 'sub') return;
  const k = txn.k, dk = other(k), D = S[dk];
  S.txn = null;
  if (outcome === 'TAP_OUT') {
    if (D.resiliencyAvailable && !D.resiliencyUsed) {
      if (dk === 'you') {
        S.txn = txn;
        S.pending = { kind: 'resiliency', id: ++S.seq, threat: 'submission' };
        return;
      }
      if (aiShouldUseResiliency(S, dk, txn.move)) return useResiliency(ctx, dk, 'submission');
    }
    return endMatch(ctx, k, 'SUBMISSION', txn.move);
  }
  if (outcome === 'SUBMISSION_ESCAPE') {
    D.lastActionResult = 'SUBMISSION_ESCAPE';
    say(ctx, LINES.subEscape, { d: dk });
    crowdObserve(ctx, { type: 'submission_escape', k: dk });
    observePhase(ctx, 'submission_escape');
    ring(ctx, 'escape', dk);
    setControl(ctx, dk);
  } else {
    say(ctx, LINES.subScramble, {}, 'dim');
    setControl(ctx, 'neutral');
  }
  afterAction(ctx);
}

export { targetHp };
