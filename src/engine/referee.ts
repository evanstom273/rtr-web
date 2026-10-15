// The referee's eyes (MatchRefereeState), disqualifications and the rule-breaking catalogue
// (MatchRulebreakingCatalogue). In a match with DQs a spotted weapon shot is an instant DQ; dirty
// tactics earn warning points and four points is a DQ. Without DQs the referee only admonishes.
import { LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { flash, other, say } from './commentary';
import { clamp } from './rng';
import type { Area, BodyPart, SetupId, SideKey } from './types';

/** How sharp the referee is at the best of times. */
export const REF_AWARENESS = 0.78;
/** Warning points that disqualify. */
export const WARNING_LIMIT = 4;
/** Base detection for a landed weapon attack, and for a table or tack spot. */
export const WEAPON_DETECTION = 0.95;
export const SPOT_DETECTION = 0.9;
/** Actions the referee stays distracted, and needs to catch up after the fight moves. */
export const DISTRACTION_ACTIONS = 2;
export const CATCH_UP_ACTIONS = 2;

/** Where the referee can be: the ring and everything on it, ringside, the crowd, backstage. */
export function refZone(area: Area): Area {
  switch (area) {
    case 'OUTSIDE': case 'RAMP': return 'OUTSIDE';
    case 'CROWD': return 'CROWD';
    case 'BACKSTAGE': return 'BACKSTAGE';
    default: return 'IN_RING';
  }
}

/** Chance (0–1) the referee sees something illegal happen in `area`. */
export function detectionChance(ctx: Ctx, base: number, area: Area): number {
  const r = ctx.S.ref;
  let quality = 1, attention = 1;
  if (r.distracted > 0) {
    quality = 0.35;
    attention = 0.2;
  } else if (r.moving > 0) {
    quality = 0.55;
    attention = 0.6;
  }
  const zone = refZone(area) === r.area ? 1 : 0.7;
  return clamp(base * REF_AWARENESS * quality * attention * zone, 0.05, 0.98);
}

export const refSees = (ctx: Ctx, base: number, area: Area): boolean => ctx.rnd() < detectionChance(ctx, base, area);

/** After every action: the referee follows the fight and gets their attention back. */
export function refereeAfterAction(ctx: Ctx): void {
  const S = ctx.S, r = S.ref;
  if (r.distracted > 0 && --r.distracted === 0) {
    r.distractedBy = null;
    say(ctx, LINES.refBack, {}, 'dim');
  }
  if (r.moving > 0) r.moving--;
  const zone = refZone(S.you.state.area);
  if (zone === refZone(S.them.state.area) && zone !== r.area) {
    r.area = zone;
    r.moving = CATCH_UP_ACTIONS;
  }
}

/** The referee calls for the bell. Ends the match (or the fall). */
export function disqualify(ctx: Ctx, offender: SideKey, why: string): void {
  say(ctx, LINES.dq, { a: offender, vars: { x: why } }, 'bad');
  flash(ctx, 'Disqualified', true);
  ctx.S.obj.decision ??= { winner: other(offender), finish: 'DISQUALIFICATION', move: null };
}

/** A spotted infraction worth `points`. Four is a DQ where there are DQs. */
export function warn(ctx: Ctx, k: SideKey, points: number, what: string): void {
  const S = ctx.S;
  if (!S.rules.dq) {
    say(ctx, LINES.refAdmonish, { a: k, vars: { x: what } }, 'dim');
    return;
  }
  if (points <= 0) return;
  S.ref.warnings[k] += points;
  if (S.ref.warnings[k] >= WARNING_LIMIT) return disqualify(ctx, k, what);
  say(ctx, LINES.refWarning, { a: k, vars: { x: what, n: S.ref.warnings[k], max: WARNING_LIMIT } }, 'warn');
}

/* ---------- rule-breaking catalogue ---------- */

export interface DirtyTactic {
  /** Base detection, 0–1. */
  detection: number;
  /** Warning points if seen. */
  points: number;
  damage: number;
  part: BodyPart;
  /** Rolled against the opponent like a setup. */
  contested: boolean;
  /** What the referee calls it. */
  what: string;
}

export const DIRTY: Partial<Record<SetupId, DirtyTactic>> = {
  eye_rake: { detection: 0.7, points: 1, damage: 2, part: 'HEAD', contested: true, what: 'the eye rake' },
  hair_pull: { detection: 0.7, points: 1, damage: 1, part: 'HEAD', contested: true, what: 'the hair pull' },
  closed_fist: { detection: 0.7, points: 1, damage: 4, part: 'HEAD', contested: true, what: 'the closed fist' },
  illegal_choke: { detection: 0.9, points: 1, damage: 4, part: 'HEAD', contested: true, what: 'the choke' },
  distract_referee: { detection: 1, points: 0, damage: 0, part: 'HEAD', contested: false, what: '' },
  remove_turnbuckle_pad: { detection: 0.55, points: 1, damage: 0, part: 'BODY', contested: false, what: 'removing the turnbuckle pad' },
  exposed_turnbuckle: { detection: 0.8, points: 2, damage: 7, part: 'BODY', contested: true, what: 'using the exposed turnbuckle' },
};

export const isDirty = (id: SetupId): boolean => id in DIRTY;
