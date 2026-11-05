// Defending a move (replaces the blind reads). The defender sees what's coming and picks:
//   reverse — roll for it. Win and the move is reversed and the momentum is theirs; lose and it
//             lands harder, because they were caught going for it.
//   brace   — no roll. It lands, softened.
//   ride    — no roll. It lands in full, but they save their energy and feed off it.
// The player chooses on a card before any dice; the AI makes the same call from the odds, the
// size of the move and how desperate it is.
import { exhaustionBand, staminaPercent } from './exhaustion';
import { pinCondition } from './pin';
import { clamp, type Rng } from './rng';
import type { DefendSpec, MatchState, Side } from './types';

export type Defence = 'reverse' | 'brace' | 'ride';
export const DEFENCES: readonly Defence[] = ['reverse', 'brace', 'ride'];

export const DEFENCE_LABEL: Record<Defence, string> = { reverse: 'Go for the reversal', brace: 'Brace', ride: 'Ride it out' };
export const DEFENCE_SHORT: Record<Defence, string> = { reverse: 'Reverse', brace: 'Brace', ride: 'Ride it' };

/** A braced move hits this hard. */
export const BRACE_DAMAGE = 0.6;
/** Caught going for the reversal: the move lands harder. */
export const CAUGHT_DAMAGE = 1.25;
/** Riding it out: momentum from selling it and staying in the fight. */
export const RIDE_MOMENTUM = 6;
/** Riding it out costs nothing to defend: they get a little back instead. */
export const RIDE_STAMINA = 4;
/** Up top, on the apron or running at you: easier to see coming, easier to reverse. */
export const TELEGRAPH_BONUS = 2;

/** Where the attacker is gives the game away: up top, on the apron, or running at you. */
export function telegraphed(A: Side): boolean {
  const a = A.state;
  return a.area === 'TOP_ROPE' || a.area === 'APRON' || a.area === 'LADDER' || a.motion === 'RUNNING' || a.motion === 'ROPE_REBOUND';
}

/** The pieces of the AI's decision, so the player's card and the sim can show or reuse them. */
export function defenceValues(S: MatchState, spec: DefendSpec): Record<Defence, number> {
  const D = S.sides[spec.defender]!;
  const p = spec.reverseChance / 100;
  // Damage in impact points, worse for specials (a finisher is a pin threat, not just a hit).
  const dmg = spec.impact * (spec.major === 'FINISHER' ? 1.6 : spec.major === 'SIGNATURE' ? 1.2 : 1);
  // What winning a reversal is worth: control, momentum, the crowd.
  const control = 8;
  const values: Record<Defence, number> = {
    reverse: p * control - (1 - p) * dmg * CAUGHT_DAMAGE,
    brace: -dmg * BRACE_DAMAGE,
    ride: -dmg * 0.85 + 1.6 + (staminaPercent(D) < 35 ? 0.8 : 0),
  };
  // Nothing to lose: a beaten wrestler facing a finisher throws everything at the reversal.
  if (spec.major === 'FINISHER' && pinCondition(D) < 40) values.reverse += 2.5;
  if (exhaustionBand(D) === 'Spent') values.ride += 0.5;
  // Heels and high-flyers gamble more; technicians trust their counters.
  if (D.w.disposition === 'HEEL' || D.w.classes.includes('HIGH_FLYER')) values.reverse += 0.6;
  if (D.w.classes.includes('TECHNICIAN')) values.reverse += 0.4;
  return values;
}

export function aiDefence(S: MatchState, spec: DefendSpec, rnd: Rng): Defence {
  const v = defenceValues(S, spec);
  let best: Defence = 'brace', score = -Infinity;
  for (const d of DEFENCES) {
    const s = v[d] + (rnd() - 0.5) * 2.2;
    if (s > score) {
      score = s;
      best = d;
    }
  }
  return best;
}

/** How hard the move will land for each choice, as a share of normal (for the card). */
export function damageShare(d: Defence, reversed = false): number {
  if (d === 'brace') return BRACE_DAMAGE;
  if (d === 'reverse') return reversed ? 0 : CAUGHT_DAMAGE;
  return 1;
}

export const pct = (x: number): number => clamp(Math.round(x), 0, 100);
