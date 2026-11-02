// Reading the opponent (web addition, after Wrestling Spirit's "battle of wits"). Before a move's
// roll the defender commits to a read: block (strikes and weapon shots), duck (running, flying,
// springboard) or brace (grapples, holds, pins). Read it right and the defender gets a big bonus;
// win the roll as well and it's a counter: their own move lands and they steal the momentum. Read
// it right and still lose the roll and the move lands soft. Read it wrong and the attacker gets a
// small edge.
import type { Move } from '../data/rtr/types';
import { clamp, type Rng } from './rng';
import type { MatchState, Side, SideKey } from './types';

export type Read = 'block' | 'duck' | 'brace';
export const READS: readonly Read[] = ['block', 'duck', 'brace'];

export const READ_LABEL: Record<Read, string> = { block: 'Block', duck: 'Duck', brace: 'Brace' };
export const READ_HINT: Record<Read, string> = {
  block: 'Strikes and weapon shots',
  duck: 'Running, flying, off the ropes',
  brace: 'Grapples, holds and pins',
};

/** A correct read: +4 on defence; +2 when the move was telegraphed anyway (off the top, on the run). */
export const READ_BONUS = 4;
export const READ_BONUS_TELEGRAPHED = 2;
/** A wrong read: the defender committed the wrong way. */
export const WRONG_READ = -1;
/** A move landed through a correct read hits this hard. */
export const BLUNTED_DAMAGE = 0.6;

export function readFor(m: Move): Read {
  if (m.type === 'AERIAL' || m.type === 'SPRINGBOARD' || m.type === 'RUNNING') return 'duck';
  if (m.req.a.motion === 'RUNNING' || m.req.a.motion === 'ROPE_REBOUND') return 'duck';
  if (m.type === 'WEAPON' || m.type === 'STRIKE' || m.strike) return 'block';
  return 'brace';
}

/** Where the attacker is gives the game away: up top, on the apron, or running at you. */
export function telegraphed(A: Side): boolean {
  const a = A.state;
  return a.area === 'TOP_ROPE' || a.area === 'APRON' || a.area === 'LADDER' || a.motion === 'RUNNING' || a.motion === 'ROPE_REBOUND';
}

/** What the defender can see before reading: where the attacker is and what they've been doing. */
export function tells(S: MatchState, attacker: SideKey): string[] {
  const A = S[attacker], out: string[] = [];
  const a = A.state;
  if (a.area === 'TOP_ROPE' || a.area === 'LADDER') out.push('Up high');
  else if (a.area === 'APRON') out.push('On the apron');
  else if (a.motion === 'RUNNING' || a.motion === 'ROPE_REBOUND') out.push('Coming off the ropes');
  const recent = A.recentReads.slice(-4);
  if (recent.length) out.push(`Lately: ${recent.map((r) => READ_HINT_SHORT[r]).join(', ')}`);
  return out;
}

const READ_HINT_SHORT: Record<Read, string> = { block: 'strike', duck: 'flying', brace: 'grapple' };

/**
 * The AI's read on the attacker: their recent habits and where they're standing, sharpened by the
 * defender's skill. A wrestler who varies their offence is hard to read; one who spams isn't.
 */
export function aiRead(S: MatchState, defender: SideKey, attacker: SideKey, rnd: Rng): Read {
  const A = S[attacker], D = S[defender];
  const w: Record<Read, number> = { block: 1, duck: 1, brace: 1 };
  A.recentReads.slice(-6).forEach((r, i, arr) => {
    w[r] += 0.8 + (i === arr.length - 1 ? 0.6 : 0);
  });
  if (telegraphed(A)) w.duck += 5;
  // Sharper wrestlers back their best guess harder.
  const sharp = 1 + clamp((D.w.stats.skill - 60) / 30, 0, 1);
  const weights = READS.map((r) => w[r] ** sharp);
  let x = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < READS.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return READS[i]!;
  }
  return 'brace';
}
