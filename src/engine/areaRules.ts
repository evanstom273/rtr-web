// Port of MatchAreaRules + the area half of MoveResource.
import type { Area, AreaRequirementMode, Move } from '../data/rtr/types';

const SHARED_FLAT: readonly Area[] = ['IN_RING', 'OUTSIDE', 'RAMP', 'CROWD', 'BACKSTAGE'];

export const isSharedFlatArea = (area: Area): boolean => SHARED_FLAT.includes(area);

/** Directional attacker→target area pairs a move may span. The inverse is not implied. */
const DIRECTIONAL: readonly [Area, Area][] = [
  ['IN_RING', 'CORNER'],
  ['IN_RING', 'ROPES'],
  ['IN_RING', 'APRON'],
  ['APRON', 'IN_RING'],
  ['APRON', 'ROPES'],
  ['ROPES', 'OUTSIDE'],
  ['TOP_ROPE', 'IN_RING'],
  ['TOP_ROPE', 'OUTSIDE'],
  ['LADDER', 'IN_RING'],
  ['LADDER', 'OUTSIDE'],
];

export function isSupportedDirectionalPair(attacker: Area, target: Area): boolean {
  if (attacker === target) return true;
  return DIRECTIONAL.some(([a, t]) => a === attacker && t === target);
}

function requirementMatches(mode: AreaRequirementMode, specific: Area, actual: Area, other: Area): boolean {
  switch (mode) {
    case 'ANY':
      return true;
    case 'SAME_AS_OTHER':
      return actual === other;
    case 'SHARED_FLAT_AREA':
      return actual === other && isSharedFlatArea(actual);
    case 'SPECIFIC':
      // Crowd and backstage are Falls Count Anywhere aliases for in-ring offence.
      if (specific === 'IN_RING' && (actual === 'CROWD' || actual === 'BACKSTAGE') && actual === other) return true;
      return actual === specific;
  }
}

export function moveAreasMatch(move: Move, attackerArea: Area, targetArea: Area): boolean {
  const a = move.req.a, t = move.req.t;
  if (!requirementMatches(a.areaMode, a.area, attackerArea, targetArea)) return false;
  if (!requirementMatches(t.areaMode, t.area, targetArea, attackerArea)) return false;
  if (a.areaMode === 'SPECIFIC' && t.areaMode === 'SPECIFIC' && attackerArea !== targetArea) {
    return isSupportedDirectionalPair(attackerArea, targetArea);
  }
  return true;
}

export const resolvedAttackerArea = (move: Move, current: Area): Area => (move.res.a.areaMode === 'SPECIFIC' ? move.res.a.area : current);
export const resolvedTargetArea = (move: Move, current: Area): Area => (move.res.t.areaMode === 'SPECIFIC' ? move.res.t.area : current);

/** Areas where the referee counts (MatchRules.is_outside_area). */
export const isOutsideArea = (area: Area): boolean => area === 'OUTSIDE' || area === 'RAMP' || area === 'CROWD' || area === 'BACKSTAGE';
