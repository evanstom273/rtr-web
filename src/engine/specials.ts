// What each wrestler's signatures and finishers need, whether they're ready, and how to get there.
import { AREA_LABEL, MOTION_LABEL, ORIENTATION_LABEL, POSITION_LABEL } from '../data/commentary';
import type { StateRequirement } from '../data/rtr/types';
import { other } from './commentary';
import { moveIsValid } from './moves';
import { candidateActions, findFollowupPaths, isRecovery, moveMatchesSnapshots, projectAction } from './setupRules';
import { canUseMove, FINISHER_MOMENTUM, REARM_MARGIN, SIGNATURE_MOMENTUM } from './side';
import type { MatchState, Move, SetupId, Side, SideKey, Snapshot } from './types';

export interface SpecialInfo {
  move: Move;
  kind: 'SIGNATURE' | 'FINISHER';
  /** Signature ready / finisher stock banked. */
  ready: boolean;
  /** What's missing before it can be used at all, if anything. */
  needs: string | null;
  /** Requirements for the user and their opponent, as short labels. */
  userNeeds: string[];
  opponentNeeds: string[];
  /** Both wrestlers are in the right spots right now. */
  fits: boolean;
  /** Can be used this turn (ready, fits, and any submission rule satisfied). */
  usable: boolean;
  /** Shortest setup route from here (up to three steps), [] if it already fits, null if none found. */
  route: SetupId[] | null;
  /** When there's no setup route: what has to happen instead, if we can tell. */
  hint: string | null;
}

function describe(r: StateRequirement, mode: 'attacker' | 'target'): string[] {
  const out: string[] = [];
  if (r.position !== 'NONE') out.push(POSITION_LABEL[r.position]);
  if (r.orientation !== 'NONE') out.push(ORIENTATION_LABEL[r.orientation]);
  if (r.areaMode === 'SPECIFIC') out.push(AREA_LABEL[r.area]);
  else if (r.areaMode === 'SHARED_FLAT_AREA') out.push('Same spot');
  else if (r.areaMode === 'SAME_AS_OTHER' && mode === 'target') out.push('Same area');
  if (r.motion !== 'STATIONARY') out.push(MOTION_LABEL[r.motion]);
  return out.length ? out : ['Anywhere'];
}

function needsFor(s: Side, m: Move, kind: SpecialInfo['kind']): string | null {
  if (canUseMove(s, m)) return null;
  if (kind === 'FINISHER') return `Needs a banked finisher (${FINISHER_MOMENTUM} momentum)`;
  return s.signatureArmed
    ? `Needs ${SIGNATURE_MOMENTUM} momentum (${Math.round(s.momentum)}/${SIGNATURE_MOMENTUM})`
    : `Used. Momentum has to drop under ${SIGNATURE_MOMENTUM - REARM_MARGIN} to earn it again`;
}

const shortest = (paths: { actions: SetupId[] }[]): SetupId[] | null =>
  paths.length ? paths.reduce((best, p) => (p.actions.length < best.actions.length ? p : best)).actions : null;

/**
 * Shortest route of up to three setups. The planner skips recoveries, so if the user has to pick
 * themselves up first (stand up, leave the corner, get back in...) try that as the first step.
 */
function routeTo(move: Move, a: Snapshot, t: Snapshot): SetupId[] | null {
  const direct = shortest(findFollowupPaths([move], a, t, 3));
  if (direct) return direct;
  let best: SetupId[] | null = null;
  for (const id of candidateActions(a, t)) {
    if (!isRecovery(id)) continue;
    const p = projectAction(id, a, t);
    if (!p.valid) continue;
    const rest = shortest(findFollowupPaths([move], p.attacker, p.target, 2));
    if (rest && (!best || rest.length + 1 < best.length)) best = [id, ...rest];
  }
  return best;
}

const DOWN = new Set(['GROUNDED', 'SEATED', 'KNEELING']);

function hintFor(move: Move, D: Side): string | null {
  const want = move.req.t.position;
  if (DOWN.has(want) && !DOWN.has(D.state.position)) return 'Put them down with a move first';
  if (want === 'STANDING' && D.state.position !== 'STANDING') return 'Get them back on their feet first';
  return null;
}

/** Signatures and finishers for one side, from that side's point of view. */
export function specialsFor(S: MatchState, k: SideKey): SpecialInfo[] {
  const A = S[k], D = S[other(k)];
  const list: [Move, SpecialInfo['kind']][] = [
    ...A.signatures.map((m) => [m, 'SIGNATURE'] as [Move, SpecialInfo['kind']]),
    ...A.finishers.filter((m) => !A.signatures.includes(m)).map((m) => [m, 'FINISHER'] as [Move, SpecialInfo['kind']]),
  ];
  return list.map(([move, kind]) => {
    const fits = moveMatchesSnapshots(move, A.state, D.state);
    const route: SetupId[] | null = fits ? [] : routeTo(move, A.state, D.state);
    return {
      move, kind,
      ready: canUseMove(A, move),
      needs: needsFor(A, move, kind),
      userNeeds: describe(move.req.a, 'attacker'),
      opponentNeeds: describe(move.req.t, 'target'),
      fits,
      usable: moveIsValid(S, k, move),
      route,
      hint: route ? null : hintFor(move, D),
    };
  });
}
