// Port of MatchSetupStateRules: which setup actions exist from a state pair, what they do, and
// the bounded follow-up path search.
import type { Area, Motion, Move, Orientation, Position } from '../data/rtr/types';
import { isSharedFlatArea, moveAreasMatch } from './areaRules';
import type { SetupId, Snapshot } from './types';

const GROUNDED_POSTURES: readonly Position[] = ['GROUNDED', 'SEATED', 'KNEELING'];
const TRANSIENT_MOTIONS: readonly Motion[] = ['RISING'];

/** STAGGERING satisfies an ordinary STATIONARY requirement. */
export function motionMatches(required: Motion, actual: Motion): boolean {
  return required === actual || (required === 'STATIONARY' && actual === 'STAGGERING');
}

export const positionMatches = (required: Position, actual: Position): boolean => required === 'NONE' || required === actual;
export const orientationMatches = (required: Orientation, actual: Orientation): boolean => required === 'NONE' || required === actual;

export function moveMatchesSnapshots(move: Move, a: Snapshot, t: Snapshot): boolean {
  return (
    positionMatches(move.req.a.position, a.position)
    && (positionMatches(move.req.t.position, t.position) || move.extraTargetPositions.includes(t.position))
    && orientationMatches(move.req.a.orientation, a.orientation)
    && orientationMatches(move.req.t.orientation, t.orientation)
    && moveAreasMatch(move, a.area, t.area)
    && motionMatches(move.req.a.motion, a.motion)
    && motionMatches(move.req.t.motion, t.motion)
  );
}

function tauntPositionallyValid(a: Snapshot, t: Snapshot): boolean {
  return (
    (a.position === 'STANDING' || a.position === 'PERCHED')
    && (['IN_RING', 'APRON', 'TOP_ROPE', 'OUTSIDE', 'RAMP'] as Area[]).includes(a.area)
    && motionMatches('STATIONARY', a.motion)
    && (['STANDING', 'GROUNDED', 'SEATED', 'KNEELING'] as Position[]).includes(t.position)
  );
}

function needsRingRecovery(actorArea: Area, targetArea: Area): boolean {
  if (actorArea === targetArea && (actorArea === 'OUTSIDE' || actorArea === 'RAMP')) return true;
  if (actorArea === 'IN_RING' && (['APRON', 'OUTSIDE', 'RAMP', 'TOP_ROPE'] as Area[]).includes(targetArea)) return true;
  return (actorArea === 'OUTSIDE' || actorArea === 'RAMP') && (['IN_RING', 'APRON', 'ROPES', 'TOP_ROPE'] as Area[]).includes(targetArea);
}

export function candidateActions(actor: Snapshot, target: Snapshot): SetupId[] {
  const out: SetupId[] = [];
  const add = (id: SetupId) => {
    if (!out.includes(id)) out.push(id);
  };
  const { position: ap, orientation: ao, area: aa, motion: am } = actor;
  const { position: tp, area: ta, motion: tm } = target;

  if (GROUNDED_POSTURES.includes(ap)) add('stand_up');
  if (am === 'RUNNING') add('stop_running');
  if (am === 'ROPE_REBOUND') add('regain_footing');
  if (TRANSIENT_MOTIONS.includes(am)) add('regain_composure');
  if (tm === 'RISING') add('press_advantage');
  if (aa === 'CORNER') add('leave_corner');
  if (aa === 'TOP_ROPE') add('climb_down');
  if (aa === 'APRON' || aa === 'OUTSIDE') add('return_to_ring');
  if (aa === 'RAMP' && ta !== 'RAMP') add('return_to_ring');
  if (aa === 'ROPES') add('leave_ropes');

  const actorFlatReady = ap === 'STANDING' && ao === 'FRONT' && motionMatches('STATIONARY', am) && isSharedFlatArea(aa);
  const sameFlatReady = actorFlatReady && motionMatches('STATIONARY', tm) && aa === ta && isSharedFlatArea(ta);
  if (actorFlatReady) add('start_running');
  if (actorFlatReady && aa === 'IN_RING') {
    add('climb_top_rope');
    add('prepare_springboard');
    add('step_to_ropes');
    add('exit_ring');
  }
  if (sameFlatReady && GROUNDED_POSTURES.includes(tp)) add('pick_opponent_up');
  if (sameFlatReady && tp === 'STANDING') {
    add('get_behind_opponent');
    add('irish_whip');
  }
  if (sameFlatReady && tp === 'GROUNDED') add(target.orientation === 'FACE_UP' ? 'turn_opponent_face_down' : 'turn_opponent_face_up');
  if (sameFlatReady && (tp === 'STANDING' || tp === 'GROUNDED')) {
    add('sit_opponent_up_front');
    add('sit_opponent_up_back');
    add('pull_opponent_to_knees_front');
    add('pull_opponent_to_knees_back');
  }
  const bothInRingStanding = actorFlatReady && aa === 'IN_RING' && ta === 'IN_RING' && tp === 'STANDING' && tm === 'STATIONARY';
  if (bothInRingStanding) {
    (['throw_into_corner', 'lean_opponent_on_ropes_front', 'lean_opponent_on_ropes_back', 'drape_opponent_on_ropes_front',
      'drape_opponent_on_ropes_back', 'place_opponent_on_apron_front', 'place_opponent_on_apron_back',
      'set_opponent_on_top_rope_front', 'set_opponent_on_top_rope_back', 'send_opponent_outside', 'take_fight_outside'] as SetupId[]).forEach(add);
  }
  if (aa === 'IN_RING' && ta === 'CORNER' && actorFlatReady) {
    add('pull_opponent_from_corner');
    if (tp === 'STANDING') {
      add('turn_opponent_in_corner');
      add('seat_opponent_in_corner');
    }
  }
  if (aa === 'IN_RING' && ta === 'ROPES' && actorFlatReady) add('pull_opponent_from_ropes');
  if (aa === 'IN_RING' && (ta === 'APRON' || ta === 'TOP_ROPE') && actorFlatReady) add('bring_opponent_into_ring');
  if (actorFlatReady && aa === ta && isSharedFlatArea(ta) && tp === 'STANDING' && (tm === 'RUNNING' || tm === 'ROPE_REBOUND')) add('catch_opponent_running');
  if (aa === 'TOP_ROPE' && GROUNDED_POSTURES.includes(tp)) add('wake_opponent');
  if (aa === 'TOP_ROPE' && ap === 'PERCHED' && ta === 'IN_RING' && tp === 'STANDING' && tm === 'STATIONARY') add('call_opponent_running');
  if (sameFlatReady && aa === 'OUTSIDE' && tp === 'STANDING') add('fight_up_ramp');
  if (actorFlatReady && aa === 'OUTSIDE' && ta === 'IN_RING' && tp === 'STANDING' && tm === 'STATIONARY') add('call_opponent_outside');
  if (aa === 'RAMP' && ta === 'RAMP') add('return_from_ramp');
  if (needsRingRecovery(aa, ta) && !out.includes('bring_opponent_into_ring')) add('bring_match_back_to_ring');
  if (tauntPositionallyValid(actor, target)) add('taunt');
  if (actorFlatReady && (aa === 'IN_RING' || aa === 'OUTSIDE' || aa === 'RAMP')) add('catch_breath');
  return out;
}

const set = (s: Snapshot, position: Position, orientation: Orientation, area: Area, motion: Motion): void => {
  s.position = position;
  s.orientation = orientation;
  s.area = area;
  s.motion = motion;
};
const setNeutralFlat = (s: Snapshot, area: Area) => set(s, 'STANDING', 'FRONT', area, 'STATIONARY');

export interface Projection {
  valid: boolean;
  attacker: Snapshot;
  target: Snapshot;
}

export function projectAction(id: SetupId, attacker: Snapshot, target: Snapshot): Projection {
  const a = { ...attacker }, t = { ...target };
  const valid = candidateActions(a, t).includes(id) || id === 'reset_stance' || id === 'grapple_opponent';
  if (!valid) return { valid: false, attacker: a, target: t };
  switch (id) {
    case 'stand_up': set(a, 'STANDING', 'FRONT', a.area, 'STATIONARY'); break;
    case 'stop_running': case 'regain_footing': case 'regain_composure': a.motion = 'STATIONARY'; break;
    case 'press_advantage': t.motion = 'STATIONARY'; break;
    case 'leave_corner': case 'climb_down': case 'return_to_ring': case 'leave_ropes': set(a, 'STANDING', 'FRONT', 'IN_RING', 'STATIONARY'); break;
    case 'start_running': set(a, 'STANDING', 'FRONT', a.area, 'RUNNING'); break;
    case 'climb_top_rope': set(a, 'PERCHED', 'FRONT', 'TOP_ROPE', 'STATIONARY'); break;
    case 'prepare_springboard': set(a, 'STANDING', 'FRONT', 'APRON', 'STATIONARY'); break;
    case 'step_to_ropes': set(a, 'STANDING', 'FRONT', 'ROPES', 'STATIONARY'); break;
    case 'pick_opponent_up': case 'wake_opponent': set(t, 'STANDING', 'FRONT', t.area, 'STATIONARY'); break;
    case 'get_behind_opponent': set(t, 'STANDING', 'BACK', t.area, 'STATIONARY'); break;
    case 'irish_whip': set(t, 'STANDING', 'FRONT', a.area, 'ROPE_REBOUND'); break;
    case 'turn_opponent_face_up': set(t, 'GROUNDED', 'FACE_UP', t.area, 'STATIONARY'); break;
    case 'turn_opponent_face_down': set(t, 'GROUNDED', 'FACE_DOWN', t.area, 'STATIONARY'); break;
    case 'sit_opponent_up_front': set(t, 'SEATED', 'FRONT', t.area, 'STATIONARY'); break;
    case 'sit_opponent_up_back': set(t, 'SEATED', 'BACK', t.area, 'STATIONARY'); break;
    case 'pull_opponent_to_knees_front': set(t, 'KNEELING', 'FRONT', t.area, 'STATIONARY'); break;
    case 'pull_opponent_to_knees_back': set(t, 'KNEELING', 'BACK', t.area, 'STATIONARY'); break;
    case 'throw_into_corner': set(t, 'STANDING', 'FRONT', 'CORNER', 'STATIONARY'); break;
    case 'turn_opponent_in_corner': set(t, 'STANDING', 'BACK', 'CORNER', 'STATIONARY'); break;
    case 'seat_opponent_in_corner': set(t, 'SEATED', 'FRONT', 'CORNER', 'STATIONARY'); break;
    case 'lean_opponent_on_ropes_front': set(t, 'STANDING', 'FRONT', 'ROPES', 'STATIONARY'); break;
    case 'lean_opponent_on_ropes_back': set(t, 'STANDING', 'BACK', 'ROPES', 'STATIONARY'); break;
    case 'drape_opponent_on_ropes_front': set(t, 'KNEELING', 'FRONT', 'ROPES', 'STATIONARY'); break;
    case 'drape_opponent_on_ropes_back': set(t, 'KNEELING', 'BACK', 'ROPES', 'STATIONARY'); break;
    case 'place_opponent_on_apron_front': set(t, 'STANDING', 'FRONT', 'APRON', 'STATIONARY'); break;
    case 'place_opponent_on_apron_back': set(t, 'STANDING', 'BACK', 'APRON', 'STATIONARY'); break;
    case 'set_opponent_on_top_rope_front':
    case 'set_opponent_on_top_rope_back':
      set(a, 'PERCHED', 'FRONT', 'TOP_ROPE', 'STATIONARY');
      set(t, 'PERCHED', id === 'set_opponent_on_top_rope_front' ? 'FRONT' : 'BACK', 'TOP_ROPE', 'STATIONARY');
      break;
    case 'send_opponent_outside': case 'call_opponent_outside': set(t, 'STANDING', 'FRONT', 'OUTSIDE', 'STATIONARY'); break;
    case 'exit_ring': set(a, 'STANDING', 'FRONT', 'OUTSIDE', 'STATIONARY'); break;
    case 'take_fight_outside': setNeutralFlat(a, 'OUTSIDE'); setNeutralFlat(t, 'OUTSIDE'); break;
    case 'fight_up_ramp': setNeutralFlat(a, 'RAMP'); setNeutralFlat(t, 'RAMP'); break;
    case 'return_from_ramp': setNeutralFlat(a, 'OUTSIDE'); setNeutralFlat(t, 'OUTSIDE'); break;
    case 'pull_opponent_from_corner': case 'pull_opponent_from_ropes': case 'bring_opponent_into_ring': setNeutralFlat(t, 'IN_RING'); break;
    case 'catch_opponent_running': t.motion = 'STATIONARY'; break;
    case 'bring_match_back_to_ring': case 'reset_stance': case 'grapple_opponent': setNeutralFlat(a, 'IN_RING'); setNeutralFlat(t, 'IN_RING'); break;
    case 'call_opponent_running': set(t, 'STANDING', 'FRONT', 'IN_RING', 'RUNNING'); break;
    case 'taunt': case 'catch_breath': case 'wait_for_count': break;
  }
  return { valid: true, attacker: a, target: t };
}

const CONTESTED: ReadonlySet<SetupId> = new Set<SetupId>([
  'pick_opponent_up', 'irish_whip', 'get_behind_opponent', 'turn_opponent_face_up', 'turn_opponent_face_down',
  'sit_opponent_up_front', 'sit_opponent_up_back', 'pull_opponent_to_knees_front', 'pull_opponent_to_knees_back',
  'throw_into_corner', 'turn_opponent_in_corner', 'seat_opponent_in_corner', 'lean_opponent_on_ropes_front',
  'lean_opponent_on_ropes_back', 'drape_opponent_on_ropes_front', 'drape_opponent_on_ropes_back',
  'place_opponent_on_apron_front', 'place_opponent_on_apron_back', 'set_opponent_on_top_rope_front',
  'set_opponent_on_top_rope_back', 'send_opponent_outside', 'call_opponent_outside', 'take_fight_outside',
  'fight_up_ramp', 'return_from_ramp', 'bring_match_back_to_ring', 'pull_opponent_from_corner',
  'pull_opponent_from_ropes', 'bring_opponent_into_ring', 'catch_opponent_running', 'call_opponent_running', 'taunt',
]);

const RECOVERY: ReadonlySet<SetupId> = new Set<SetupId>([
  'stand_up', 'stop_running', 'regain_footing', 'regain_composure', 'press_advantage', 'leave_corner', 'climb_down',
  'return_to_ring', 'leave_ropes', 'return_from_ramp', 'bring_match_back_to_ring', 'pull_opponent_from_corner',
  'pull_opponent_from_ropes', 'bring_opponent_into_ring', 'catch_opponent_running', 'reset_stance',
]);

export const isContested = (id: SetupId): boolean => CONTESTED.has(id);
export const isRecovery = (id: SetupId): boolean => RECOVERY.has(id);
const isPlanningAction = (id: SetupId): boolean => !isRecovery(id) && id !== 'taunt' && id !== 'catch_breath';

export interface FollowupPath {
  actions: SetupId[];
  move: Move;
  attacker: Snapshot;
  target: Snapshot;
}

const pairKey = (a: Snapshot, t: Snapshot) => `${a.position}:${a.orientation}:${a.area}:${a.motion}|${t.position}:${t.orientation}:${t.area}:${t.motion}`;

/** Breadth-first search for moves reachable within maxSteps planning actions. */
export function findFollowupPaths(moves: readonly Move[], attacker: Snapshot, target: Snapshot, maxSteps = 2): FollowupPath[] {
  const results: FollowupPath[] = [];
  let frontier: { a: Snapshot; t: Snapshot; actions: SetupId[] }[] = [{ a: { ...attacker }, t: { ...target }, actions: [] }];
  const visited = new Map<string, number>([[pairKey(attacker, target), 0]]);
  for (let depth = 0; depth <= Math.max(0, maxSteps); depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const move of moves) {
        if (moveMatchesSnapshots(move, node.a, node.t)) results.push({ actions: [...node.actions], move, attacker: node.a, target: node.t });
      }
      if (depth >= maxSteps) continue;
      for (const id of candidateActions(node.a, node.t)) {
        if (!isPlanningAction(id) || node.actions.includes(id)) continue;
        const p = projectAction(id, node.a, node.t);
        if (!p.valid) continue;
        const path = [...node.actions, id];
        const key = pairKey(p.attacker, p.target);
        if ((visited.get(key) ?? 999) <= path.length) continue;
        visited.set(key, path.length);
        next.push({ a: p.attacker, t: p.target, actions: path });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return results;
}
