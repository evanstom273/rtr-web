/*
 * Pure physics for the timing interactions that remain (cover ring, kickout hold, submission tug). No timers: callers
 * supply elapsed time. The UI drives these from requestAnimationFrame; the sim steps them.
 */
import { clamp, lerp } from './rng';

/* ---------- reversal ring (timing_circle_interaction.gd) ---------- */

/** Remaining ring size, 1 → 0 over the time limit. */
export const ringProgress = (elapsed: number, timeLimit: number): number => Math.max(0, 1 - elapsed / timeLimit);

/** Did a tap at this progress land in the band? window is % of the shrink range. */
export const ringHit = (progress: number, target: number, window: number): boolean => Math.abs(progress - target) <= window / 200;

/** Seconds into the shrink when the ring passes the target's centre. */
export const ringTargetTime = (target: number, timeLimit: number): number => (1 - target) * timeLimit;

/* ---------- kickout hold (hold_release_interaction.gd) ---------- */

/** The count shown at `elapsed` seconds into the cover: 0 until ONE. */
export const pinCountAt = (elapsed: number): 0 | 1 | 2 | 3 => Math.min(3, Math.floor(elapsed)) as 0 | 1 | 2 | 3;

export function kickoutReleaseHit(fill01: number, center: number, widthPct: number, forgivenessPct: number): boolean {
  return Math.abs(fill01 - center) <= widthPct / 200 + forgivenessPct / 100;
}

/* ---------- submission tug (submission_tug_interaction.gd) ---------- */

export const TUG_MAX_TAPS_PER_SECOND = 8;
export const TUG_MIN_IMPULSE = 0.65;
export const TUG_MAX_IMPULSE = 1.15;
export const TUG_AI_PULSE_SECONDS = 0.2;
const AI_FORCE_RATE_NORMALIZER = TUG_MAX_TAPS_PER_SECOND * TUG_AI_PULSE_SECONDS;
export const TUG_STALL_FAILSAFE_SECONDS = 30;
export const TUG_STALL_WINDOW_SECONDS = 10;
export const TUG_STALL_MOVEMENT = 3;

/** Marker movement from one accepted player tap. */
export const tugTapImpulse = (playerScore: number, speed: number): number => lerp(TUG_MIN_IMPULSE, TUG_MAX_IMPULSE, playerScore / 100) * speed;

/** Marker movement (signed, in the AI's direction) from one AI pulse. */
export function tugAiPulse(playerDirection: 1 | -1, aiScore: number, playerScore: number, speed: number): number {
  const advantage = aiScore - playerScore;
  let impulse = lerp(TUG_MIN_IMPULSE, TUG_MAX_IMPULSE, aiScore / 100);
  if (advantage > 5) impulse = clamp(impulse + advantage * 0.012, TUG_MIN_IMPULSE, 1.8);
  else if (advantage < -5) impulse = clamp(impulse - Math.abs(advantage) * 0.012, 0.15, 1.2);
  return -playerDirection * impulse * AI_FORCE_RATE_NORMALIZER * speed;
}

export function tugOutcome(marker: number, tap: number, escape: number): 'TAP_OUT' | 'SUBMISSION_ESCAPE' | null {
  if (marker >= tap) return 'TAP_OUT';
  if (marker <= escape) return 'SUBMISSION_ESCAPE';
  return null;
}
