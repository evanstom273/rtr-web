// Match clock, referee count-outs and the AI's match-phase tracker.
import { COUNT_WORDS, LINES } from '../data/commentary';
import { isOutsideArea } from './areaRules';
import type { Ctx } from './ctx';
import { other, ring, say } from './commentary';
import { crowdTick } from './crowd';
import { endMatch } from './flow';
import { staminaPercent } from './exhaustion';
import { clamp } from './rng';
import { totalHp } from './side';
import type { MatchState, SideKey } from './types';
import { SIDES } from './types';

export const COUNT_OUT_INTERVAL_SECONDS = 30;

export const sideIsOutside = (S: MatchState, k: SideKey): boolean => isOutsideArea(S[k].state.area);
const outsideSides = (ctx: Ctx): SideKey[] => SIDES.filter((k) => sideIsOutside(ctx.S, k));

/** Advance the clock by one action step. */
export function advanceClock(ctx: Ctx): void {
  const S = ctx.S;
  const step = S.rules.actionClock;
  S.t += step;
  accumulateRefereeCount(ctx, step);
  crowdTick(ctx);
}

function startCount(ctx: Ctx): void {
  const r = ctx.S.referee;
  if (!ctx.S.rules.countOuts) return;
  r.active = true;
  r.value = 0;
  r.elapsed = 0;
  r.pendingResolution = false;
  for (const k of SIDES) r.outside[k] = sideIsOutside(ctx.S, k);
  say(ctx, LINES.countStart, {}, 'warn');
  ring(ctx, 'count', null);
}

function accumulateRefereeCount(ctx: Ctx, seconds: number): void {
  const S = ctx.S, r = S.referee;
  if (S.over || !S.rules.countOuts) return;
  if (!outsideSides(ctx).length) return;
  if (!r.active) startCount(ctx);
  r.elapsed += seconds;
  while (r.elapsed >= COUNT_OUT_INTERVAL_SECONDS && r.value < S.rules.countOutLimit) {
    r.elapsed -= COUNT_OUT_INTERVAL_SECONDS;
    r.value++;
    say(ctx, COUNT_WORDS[r.value] ?? `${r.value}!`, {}, 'warn');
    if (r.value === S.rules.countOutLimit - 1) say(ctx, LINES.countOneAway, {}, 'bad');
    ring(ctx, 'count', null);
  }
  if (r.value >= S.rules.countOutLimit) r.pendingResolution = true;
}

/** Called after every action: notice returns, start/stop the count, resolve count-outs. */
export function settleRefereeCount(ctx: Ctx): void {
  const S = ctx.S, r = S.referee;
  if (S.over) return;
  if (!S.rules.countOuts) {
    r.active = false;
    return;
  }
  const outside = outsideSides(ctx);
  for (const k of SIDES) {
    const was = r.outside[k], is = outside.includes(k);
    if (was && !is && r.active) {
      if (r.value >= Math.max(1, S.rules.countOutLimit - 2)) say(ctx, LINES.countLate, { a: k, vars: { n: r.value } }, 'warn');
      else say(ctx, LINES.countBack, { a: k });
    }
    r.outside[k] = is;
  }
  if (!outside.length) {
    if (r.active) {
      say(ctx, LINES.countReset);
      r.active = false;
      r.value = 0;
      r.elapsed = 0;
      r.pendingResolution = false;
      ring(ctx, 'count', null);
    }
    return;
  }
  if (!r.active) startCount(ctx);
  if (!r.pendingResolution) return;
  r.pendingResolution = false;
  if (outside.length >= 2) {
    say(ctx, LINES.doubleCountOut, {}, 'bad');
    endMatch(ctx, null, 'DOUBLE_COUNT_OUT', null);
    return;
  }
  const out = outside[0] as SideKey;
  say(ctx, LINES.countOut, { d: out, vars: { n: S.rules.countOutLimit } }, 'bad');
  endMatch(ctx, other(out), 'COUNT_OUT', null);
}

/* ---------- AI match phase (MatchDecisionFramework._update_phase, simplified) ---------- */

export type PhaseEvent = 'reversal' | 'control_swing' | 'kickout' | 'late_kickout' | 'submission_escape' | 'high_risk_crash' | 'signature_landed' | 'finisher_landed' | 'action';

function finishPressure(ctx: Ctx): number {
  let p = 0;
  for (const k of SIDES) {
    const s = ctx.S[k];
    if (s.signatureReady) p += 0.3;
    if (s.finisherStock > 0) p += 0.2 + (s.finisherStock - 1) * 0.05;
    if (s.lastMoveWasFinisher) p += 0.18;
  }
  return clamp(p, 0, 1);
}

function conditionPressure(ctx: Ctx): number {
  let high = 0;
  for (const k of SIDES) {
    const s = ctx.S[k];
    const damage = clamp((600 - totalHp(s)) / 360, 0, 1);
    const exhaustion = clamp((100 - staminaPercent(s) + s.fatigue) / 160, 0, 1);
    high = Math.max(high, damage * 0.65 + exhaustion * 0.35);
  }
  return high;
}

export function observePhase(ctx: Ctx, e: PhaseEvent): void {
  const ph = ctx.S.phase;
  switch (e) {
    case 'reversal': case 'control_swing':
      ph.controlSwings++;
      ph.drama = Math.min(1, ph.drama + 0.15);
      break;
    case 'kickout': case 'submission_escape':
      ph.drama = Math.min(1, ph.drama + 0.14);
      break;
    case 'late_kickout':
      ph.drama = Math.min(1, ph.drama + 0.24);
      break;
    case 'high_risk_crash': case 'signature_landed': case 'finisher_landed':
      ph.drama = Math.min(1, ph.drama + 0.18);
      break;
    case 'action':
      ph.drama *= 0.94;
      ph.actionsSinceChange++;
      break;
  }
  // The weights used to top out at 0.85, so 'closing' (0.68) was all but unreachable. Time is in
  // there now too: a match that's gone 20 minutes is heading for the finish whatever else is true.
  const pressure = clamp(
    finishPressure(ctx) * 0.25 + conditionPressure(ctx) * 0.3 + ph.drama * 0.15 + clamp(ph.controlSwings / 8, 0, 1) * 0.1
      + clamp(ctx.S.t / (20 * 60), 0, 1) * 0.2,
    0, 1,
  );
  const desired = pressure >= 0.68 ? 'closing' : pressure >= 0.3 ? 'middle' : 'opening';
  if (desired === ph.name) return;
  const lowering = (ph.name === 'closing' && desired !== 'closing') || (ph.name === 'middle' && desired === 'opening');
  if (lowering) {
    const boundary = ph.name === 'closing' ? 0.6 : 0.22;
    if (pressure > boundary || ph.actionsSinceChange < 3) return;
  }
  ph.name = desired;
  ph.actionsSinceChange = 0;
}
