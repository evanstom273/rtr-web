/*
 * Pure physics for the three timing interactions. No timers: the caller supplies elapsed time.
 * The UI drives these from requestAnimationFrame; the headless sim drives them in fixed steps.
 * Every constant here is copied from the original runMeter / runKickout / runSub.
 */
import { clamp } from './rng';
import type { KickoutCount, SubOutcome } from './types';

/* ---------- reversal / land-it bar ---------- */

/** Taps in the first 150ms after the bar appears are ignored. */
export const METER_GRACE_MS = 150;

/** Marker position (%) at fraction f (0–1) of the bar's duration. */
export const meterPos = (dir: 1 | -1, f: number): number => (dir > 0 ? f * 100 : 100 - f * 100);

export const inGold = (pos: number, left: number, width: number): boolean => pos >= left && pos <= left + width;

/* ---------- kickout hold ---------- */

/** Fill rises at 100% per 0.95s while held. Reaching 100% locks it until released. */
export const KICKOUT_FILL_PER_SEC = 100 / 0.95;
export const PIN_SECONDS = 3;

/** Releasing in the gold at `e` seconds kicks out at this count. */
export const kickoutCountAt = (e: number): KickoutCount => (e < 1 ? 1 : e < 2 ? 2 : 2.9);

/* ---------- submission mash ---------- */

export const SUB_TAP_STEP = 2.6;
export const SUB_MAX_TAPS_PER_SEC = 9;
export const SUB_ROPE_SECONDS = 8.5;

/** Bar drift for dt seconds. `jitter` is a uniform [0,1) draw. 100 = tap, 0 = escape. */
export function subDrift(role: 'attack' | 'defend', rate: number, dt: number, jitter: number): number {
  return (role === 'attack' ? -1 : 1) * rate * dt * (0.85 + jitter * 0.3);
}

export const subTapDelta = (role: 'attack' | 'defend'): number => (role === 'attack' ? 1 : -1) * SUB_TAP_STEP;

export function subOutcome(pos: number, elapsed: number): SubOutcome | null {
  if (pos >= 100) return 'tap';
  if (pos <= 0) return 'escape';
  if (elapsed >= SUB_ROPE_SECONDS) return 'rope';
  return null;
}

export const subMarker = (pos: number): number => clamp(pos, 0, 100);
