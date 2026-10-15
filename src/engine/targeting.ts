// Port of MoveTargetResolver: which body parts a move hits, with what weight, and its story part.
import type { BodyPart, Move, Part, TargetingMode } from '../data/rtr/types';
import type { HP, TargetResolution } from './types';

export const ARM_PARTS: readonly BodyPart[] = ['LEFT_ARM', 'RIGHT_ARM'];
export const LEG_PARTS: readonly BodyPart[] = ['LEFT_LEG', 'RIGHT_LEG'];

export const isLimbFocus = (p: Part): boolean => ARM_PARTS.includes(p as BodyPart) || LEG_PARTS.includes(p as BodyPart);
export const isTargetFocus = (p: Part): p is BodyPart => p !== 'NONE';

const LABEL: Record<Part, string> = {
  NONE: 'Auto', HEAD: 'Head', BODY: 'Body', LEFT_ARM: 'Left Arm', RIGHT_ARM: 'Right Arm', LEFT_LEG: 'Left Leg', RIGHT_LEG: 'Right Leg',
};
export const partLabel = (p: Part): string => LABEL[p];

const COMPACT: Record<BodyPart, string> = { HEAD: 'H', BODY: 'B', LEFT_ARM: 'LA', RIGHT_ARM: 'RA', LEFT_LEG: 'LL', RIGHT_LEG: 'RL' };

function listedParts(move: Move): BodyPart[] {
  const parts: BodyPart[] = [];
  for (const p of move.parts) if (p !== 'NONE' && !parts.includes(p)) parts.push(p);
  if (!parts.length) parts.push('BODY');
  return parts;
}

function chooseSide(move: Move, focus: Part, hp: HP | null, sides: readonly BodyPart[]): BodyPart {
  const [first, second] = sides as [BodyPart, BodyPart];
  if (focus === first || focus === second) return focus;
  if (hp) {
    const a = hp[first], b = hp[second];
    if (Math.abs(a - b) > 1e-6) return a < b ? first : second;
  }
  return move.defaultSide === first || move.defaultSide === second ? move.defaultSide : first;
}

function weakest(hp: HP | null, parts: readonly BodyPart[]): BodyPart {
  let best = parts[0] ?? 'BODY';
  if (!hp) return best;
  for (const p of parts) if (hp[p] < hp[best]) best = p;
  return best;
}

function fullTag(mode: TargetingMode, parts: BodyPart[]): string {
  if (mode === 'BOTH_ARMS') return 'BOTH ARMS';
  if (mode === 'BOTH_LEGS') return 'BOTH LEGS';
  if (parts.length === 1) return partLabel(parts[0]!).toUpperCase();
  if (parts.length === 2) return `${partLabel(parts[0]!).toUpperCase()}/${partLabel(parts[1]!).toUpperCase()}`;
  return 'MULTI';
}

function compactTag(mode: TargetingMode, parts: BodyPart[]): string {
  if (mode === 'BOTH_ARMS') return 'BA';
  if (mode === 'BOTH_LEGS') return 'BL';
  return parts.length === 1 ? COMPACT[parts[0]!] : 'MULTI';
}

/** Resolve a move's targets against the defender's current HP and a requested focus. */
export function resolveTarget(move: Move, focus: Part, defenderHp: HP | null): TargetResolution {
  const mode = move.targeting;
  const listed = listedParts(move);
  let parts: BodyPart[] = [];
  let pressure: BodyPart[] = [];
  const weights: Partial<Record<BodyPart, number>> = {};
  let story: BodyPart = 'BODY';
  let bilateral = false;
  const standard = (ps: BodyPart[]) => {
    const w = ps.length > 1 ? 0.7 : 1.0;
    for (const p of ps) weights[p] = w;
  };
  const replacePair = (pair: readonly BodyPart[], chosen: BodyPart) => {
    const out = listed.filter((p) => !pair.includes(p));
    if (!out.includes(chosen)) out.push(chosen);
    return out;
  };
  switch (mode) {
    case 'CHOOSE_ARM':
      story = chooseSide(move, focus, defenderHp, ARM_PARTS);
      parts = replacePair(ARM_PARTS, story);
      pressure = [story];
      standard(parts);
      break;
    case 'CHOOSE_LEG':
      story = chooseSide(move, focus, defenderHp, LEG_PARTS);
      parts = replacePair(LEG_PARTS, story);
      pressure = [story];
      standard(parts);
      break;
    case 'BOTH_ARMS':
    case 'BOTH_LEGS': {
      const pair = mode === 'BOTH_ARMS' ? ARM_PARTS : LEG_PARTS;
      bilateral = true;
      parts = listed;
      pressure = [...pair];
      story = weakest(defenderHp, pressure);
      for (const p of parts) weights[p] = pair.includes(p) ? 0.5 : 0.7;
      break;
    }
    default:
      parts = listed;
      pressure = [...parts];
      story = focus !== 'NONE' && parts.includes(focus) ? focus : weakest(defenderHp, parts);
      standard(parts);
  }
  if (!parts.length) {
    parts = ['BODY'];
    pressure = ['BODY'];
    weights.BODY = 1;
    story = 'BODY';
  }
  return {
    parts,
    storyPart: story,
    weights,
    pressureParts: pressure,
    pressureUsesAverage: bilateral,
    isBilateral: bilateral,
    focusApplied: mode === 'CHOOSE_ARM' || mode === 'CHOOSE_LEG',
    fullTag: fullTag(mode, parts),
    compactTag: compactTag(mode, parts),
  };
}

/** HP the resolution "presses on": lowest pressure part, or the average for bilateral moves. */
export function targetHp(hp: HP, r: TargetResolution): number {
  const parts = r.pressureParts;
  if (!parts.length) return hp.BODY;
  if (r.pressureUsesAverage) return parts.reduce((s, p) => s + hp[p], 0) / parts.length;
  return parts.reduce((low, p) => Math.min(low, hp[p]), 100);
}

export function focusAppliesToMove(move: Move, part: BodyPart): boolean {
  if (move.targeting === 'CHOOSE_ARM') return ARM_PARTS.includes(part);
  if (move.targeting === 'CHOOSE_LEG') return LEG_PARTS.includes(part);
  return move.parts.includes(part);
}
