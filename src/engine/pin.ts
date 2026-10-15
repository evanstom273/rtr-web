// Pinfalls. Port of start_pin_sequence, _build_pin_context, _pin_pressure_and_resistance,
// resolve_pin_count, the player's hold-release kickout and Resiliency.
import { COUNT_PHRASE, LINES } from '../data/commentary';
import { observePhase, advanceClock } from './clock';
import type { Ctx } from './ctx';
import { flash, other, ring, say } from './commentary';
import { crowdObserve } from './crowd';
import { endMatch, render, setControl, afterAction } from './flow';
import { lateMatchProfile, pinProfile } from './interaction';
import { randRange } from './rng';
import { isFinisherMove, isSignatureMove, totalHp } from './side';
import { staminaPercent } from './exhaustion';
import type { KickoutCount, MatchState, Move, PinContext, Side, SideKey } from './types';

const inRing = (s: Side) => s.state.area === 'IN_RING';

export function canPin(S: MatchState, k: SideKey): boolean {
  const A = S[k], D = S[other(k)];
  return A.state.position === 'STANDING' && D.state.position === 'GROUNDED' && inRing(A) && inRing(D) && A.state.motion === 'STATIONARY';
}

const FLASH_TERMS = ['roll-up', 'roll up', 'schoolboy', 'backslide', "o'connor", 'oconnor', 'small package', 'cradle', 'victory roll', 'sunset flip', 'rolling crucifix', 'surprise pin'];

export function isFlashPinMove(m: Move | null): boolean {
  if (!m) return false;
  if (m.flashPin) return true;
  const name = m.name.toLowerCase().replace('’', "'");
  if (name.includes('bomb') || name.includes('piledriver')) return false;
  return FLASH_TERMS.some((t) => name.includes(t));
}

export function flashFinishChance(t: number): number {
  if (t >= 900) return 20;
  if (t >= 600) return 15;
  if (t >= 300) return 10;
  return 5;
}

export function isSquashFinish(A: Side, D: Side, last: Move | null): boolean {
  if (!last) return false;
  if (last.finisher) return true;
  const dominant = A.momentum >= 80 && D.momentum <= 20;
  const littleDefence = D.movesLanded <= 1 && D.damageDealt < 20;
  const sustained = A.movesLanded >= 3;
  const worn = D.fatigue >= 55 || D.fatigue - A.fatigue >= 20 || staminaPercent(D) <= 30;
  return dominant && littleDefence && sustained && worn && last.impact >= 8;
}

/** The pin context before the flash roll (shared by the real cover and the odds shown to the player). */
function pinContextBase(S: MatchState, k: SideKey, embedded: boolean): PinContext {
  const A = S[k], D = S[other(k)];
  const last = A.lastActionResult === 'CLEAN_SUCCESS' ? A.lastMoveLanded : null;
  const impact = last?.impact ?? 0;
  const lastFin = !!last?.finisher;
  const flashQualified = (!!last && isFlashPinMove(last)) || S.recentReversalSide === k || (!!last && impact <= 4 && D.momentum >= 75);
  const squash = isSquashFinish(A, D, last);
  // Godot's under-5 / under-10 minute pin protection is deliberately removed in the web version.
  return { embedded, lastMove: last, lastMoveWasFinisher: lastFin, flashQualified, flashSuccess: false, squashQualified: squash };
}

function buildPinContext(ctx: Ctx, k: SideKey, embedded: boolean): PinContext {
  const pc = pinContextBase(ctx.S, k, embedded);
  pc.flashSuccess = pc.flashQualified && ctx.rnd() * 100 < flashFinishChance(ctx.S.t);
  return pc;
}

const AI_KICKOUT_BASES = [28, 18, 9];

/** Chance (0–100) the AI stays down for three when k covers it now, before any Resiliency. */
export function pinOdds(S: MatchState, k: SideKey, embedded: boolean): number {
  const base = pinContextBase(S, k, embedded), D = S[other(k)];
  const stays = (pc: PinContext) => AI_KICKOUT_BASES.reduce((p, b, i) => {
    const { pressure, resistance } = pinPressureAndResistance(S, k, pc, i + 1);
    return p * (1 - pinProfile(b, pressure, resistance, i + 1, D).aiChance / 100);
  }, 1);
  if (!base.flashQualified) return stays(base) * 100;
  const f = flashFinishChance(S.t) / 100;
  return (f * stays({ ...base, flashSuccess: true }) + (1 - f) * stays(base)) * 100;
}

/**
 * How much fight a wrestler has left, 0–100: mostly body-part health, then stamina, then fatigue.
 * A fresh wrestler is ~100; a properly worn-down one is in the 20s–30s.
 */
export function pinCondition(D: Side): number {
  const avgHp = totalHp(D) / 6;
  const core = Math.min(D.hp.HEAD, D.hp.BODY);
  return 0.35 * avgHp + 0.2 * core + 0.3 * staminaPercent(D) + 0.15 * (100 - D.fatigue);
}

/** One word for how much fight is left (shown on the hold and cover choices). */
export function conditionWord(D: Side): string {
  const c = pinCondition(D);
  return c >= 85 ? 'fresh' : c >= 65 ? 'holding up' : c >= 45 ? 'worn' : 'wrecked';
}

/**
 * Web-version replacement for Godot's early-match pin protection: resistance comes from damage,
 * not the clock. Fresh ≈ +120, worked over ≈ +45, wrecked ≈ −35.
 */
export const PIN_CONDITION_PIVOT = 40;
export const PIN_CONDITION_SCALE = 2.0;
export const conditionResistance = (D: Side): number => (pinCondition(D) - PIN_CONDITION_PIVOT) * PIN_CONDITION_SCALE;

export function pinPressureAndResistance(S: MatchState, k: SideKey, pc: PinContext, count: number): { pressure: number; resistance: number } {
  const A = S[k], D = S[other(k)];
  const impact = pc.lastMove?.impact ?? 1;
  let pressure = A.momentum + impact * 4 + lateMatchProfile(S.t).finishPressure;
  if (pc.lastMoveWasFinisher) pressure += 35;
  if (pc.flashSuccess) pressure += 65;
  if (pc.squashQualified) pressure += 45;
  if (D.hp.HEAD < 40) pressure += 10;
  if (D.hp.BODY < 40) pressure += 10;
  let resistance = D.momentum - lateMatchProfile(S.t).recoveryPenalty + conditionResistance(D);
  if (pc.flashSuccess) resistance -= 35;
  if (pc.squashQualified) resistance -= 25;
  if (count === 1) resistance += 30;
  else if (count === 2) resistance += 5;
  else if (count === 3) resistance -= 20;
  return { pressure, resistance };
}

export function startPin(ctx: Ctx, k: SideKey, embedded: boolean): boolean {
  const S = ctx.S, dk = other(k), A = S[k];
  if (embedded) {
    if (!inRing(A) || !inRing(S[dk])) {
      setControl(ctx, k);
      afterAction(ctx);
      return false;
    }
  } else {
    if (!canPin(S, k)) return false;
    advanceClock(ctx);
    if (S.over) return true;
  }
  A.pinAttempts++;
  const pc = buildPinContext(ctx, k, embedded);
  S.pinContext = pc;
  S.recentReversalSide = null;
  ctx.ai[k].notePinAttempt(A, pc.lastMove);
  say(ctx, LINES.pinHook, { a: k }, 'warn');
  if (pc.flashQualified) say(ctx, LINES.pinSurprise, { a: k, d: dk }, 'warn');
  ring(ctx, 'pin', k);
  render(ctx);
  if (dk === 'you') {
    const { pressure, resistance } = pinPressureAndResistance(S, k, pc, 2);
    const profile = pinProfile(18, pressure, resistance, 2, S[dk]);
    const half = profile.window / 200;
    S.pending = {
      kind: 'kickout',
      spec: {
        id: ++S.seq, pinner: k, width: profile.window,
        center: randRange(ctx.rnd, 0.06 + half, 0.94 - half),
        fillDuration: 2.7, timeLimit: 3, forgiveness: 1,
      },
    };
  } else {
    let kickoutAt: 1 | 2 | 3 | null = null;
    for (let count = 1; count <= 3; count++) {
      const { pressure, resistance } = pinPressureAndResistance(S, k, pc, count);
      const profile = pinProfile(AI_KICKOUT_BASES[count - 1]!, pressure, resistance, count, S[dk]);
      if (ctx.rnd() * 100 < profile.aiChance) {
        kickoutAt = count as 1 | 2 | 3;
        break;
      }
    }
    S.pending = { kind: 'refCount', id: ++S.seq, pinner: k, kickoutAt };
  }
  return true;
}

/** Both kickout paths end here. count: 0 (before one), 1, 2 or 3 (THREE—NO!). */
export function completeKickout(ctx: Ctx, k: SideKey, count: KickoutCount): void {
  const S = ctx.S, dk = other(k), D = S[dk], pc = S.pinContext;
  D.kickouts++;
  D.lastActionResult = 'KICKOUT';
  if (count >= 3) {
    say(ctx, LINES.kickoutLate, { a: k, d: dk }, 'hl');
    flash(ctx, 'Kickout', true);
    observePhase(ctx, 'late_kickout');
  } else if (count <= 0) say(ctx, LINES.kickoutBeforeOne, { d: dk });
  else {
    say(ctx, LINES.kickoutAt, { d: dk, vars: { x: COUNT_PHRASE[count] ?? 'two' } });
    if (count === 2) say(ctx, LINES.nearlyHadIt, { a: k }, 'dim');
    observePhase(ctx, 'kickout');
  }
  crowdObserve(ctx, {
    type: 'kickout', k: dk, count,
    afterFinisher: !!pc?.lastMoveWasFinisher,
    afterSignature: !!pc?.lastMove && isSignatureMove(S[k], pc.lastMove),
  });
  ring(ctx, 'kickout', dk);
  S.pinContext = null;
  setControl(ctx, 'neutral');
  afterAction(ctx);
}

/** The cover has reached three: Resiliency may still save the defender. */
export function pinThree(ctx: Ctx, k: SideKey): void {
  const S = ctx.S, dk = other(k), D = S[dk];
  if (D.resiliencyAvailable && !D.resiliencyUsed) {
    if (dk === 'you') {
      S.pending = { kind: 'resiliency', id: ++S.seq, threat: 'pinfall' };
      return;
    }
    if (aiShouldUseResiliency(S, dk, S.pinContext?.lastMove ?? null)) return useResiliency(ctx, dk, 'pinfall');
  }
  const move = S.pinContext?.lastMove ?? null;
  S.pinContext = null;
  endMatch(ctx, k, 'PINFALL', move);
}

export function aiShouldUseResiliency(S: MatchState, dk: SideKey, move: Move | null): boolean {
  const D = S[dk], A = S[other(dk)];
  if (move && isFinisherMove(A, move)) return true;
  const avg = totalHp(D) / 6;
  if (S.t >= 900) return true;
  if (S.t >= 600 && (avg <= 75 || D.fatigue >= 45)) return true;
  return S.t >= 300 && avg <= 50;
}

export function useResiliency(ctx: Ctx, dk: SideKey, threat: 'pinfall' | 'submission'): void {
  const S = ctx.S, D = S[dk];
  D.resiliencyAvailable = false;
  D.resiliencyUsed = true;
  D.kickouts++;
  say(ctx, LINES.resiliency, { d: dk, vars: { x: threat === 'submission' ? 'hold' : 'three-count' } }, 'good');
  flash(ctx, 'Resiliency!', true);
  crowdObserve(ctx, { type: 'kickout', k: dk, count: 3, afterFinisher: !!S.pinContext?.lastMoveWasFinisher, afterSignature: false });
  S.pinContext = null;
  S.txn = null;
  setControl(ctx, 'neutral');
  afterAction(ctx);
}
