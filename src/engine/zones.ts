// Zones (match overhaul, stage 2): where everyone is, as places on a map rather than just "in the ring" or
// "outside". The ring's centre and its four corners; four aprons; the floor on each side; the ramp, the
// crowd and backstage. Structures (the cell roof, pods, the scaffold, cables, a pole) join in stage 6.
// You can reach anyone in your zone or the next one along; further than that, you have to go to them.
import type { Area, MatchState, Side, SideKey } from './types';

export type Compass = 'n' | 'e' | 's' | 'w';
export type CornerId = 'ne' | 'se' | 'sw' | 'nw';
export type ZoneId =
  | 'ring' | `corner_${CornerId}` | `apron_${Compass}` | `floor_${Compass}`
  | 'ramp' | 'crowd' | 'backstage';

export const COMPASS: readonly Compass[] = ['n', 'e', 's', 'w'];
export const CORNERS: readonly CornerId[] = ['ne', 'se', 'sw', 'nw'];
/** The entrance way is on the south side. */
export const RAMP_SIDE: Compass = 's';
/** Tag corners: team 0 in the north-east, team 1 in the south-west (more teams take the others). */
export const TEAM_CORNER: readonly CornerId[] = ['ne', 'sw', 'nw', 'se'];

const EDGES: [ZoneId, ZoneId][] = [];
for (const c of CORNERS) {
  EDGES.push(['ring', `corner_${c}`]);
  // A corner sits between two aprons.
  for (const side of c.split('') as Compass[]) EDGES.push([`corner_${c}`, `apron_${side}`]);
}
COMPASS.forEach((s, i) => {
  EDGES.push(['ring', `apron_${s}`], [`apron_${s}`, `floor_${s}`], [`floor_${s}`, 'crowd']);
  // Round the ring, side to side.
  EDGES.push([`floor_${s}`, `floor_${COMPASS[(i + 1) % 4]!}`]);
});
EDGES.push([`floor_${RAMP_SIDE}`, 'ramp'], ['ramp', 'backstage'], ['ramp', 'crowd']);

const ADJ = new Map<ZoneId, Set<ZoneId>>();
for (const [a, b] of EDGES) {
  if (!ADJ.has(a)) ADJ.set(a, new Set());
  if (!ADJ.has(b)) ADJ.set(b, new Set());
  ADJ.get(a)!.add(b);
  ADJ.get(b)!.add(a);
}
export const ZONES: readonly ZoneId[] = [...ADJ.keys()];

const DIST = new Map<string, number>();
for (const from of ZONES) {
  const seen = new Map<ZoneId, number>([[from, 0]]);
  const q: ZoneId[] = [from];
  while (q.length) {
    const z = q.shift()!;
    for (const n of ADJ.get(z) ?? []) if (!seen.has(n)) { seen.set(n, seen.get(z)! + 1); q.push(n); }
  }
  for (const [to, d] of seen) DIST.set(`${from}|${to}`, d);
}

/** Steps between two zones (9 if there's no way, which there always is). */
export const zoneDistance = (a: ZoneId, b: ZoneId): number => DIST.get(`${a}|${b}`) ?? 9;
export const adjacent = (a: ZoneId, b: ZoneId): boolean => ADJ.get(a)?.has(b) ?? false;

/** Which way someone is: their corner or side of the ring (kept from where they last went). */
const compassOf = (s: Side): Compass => COMPASS[(s.spot ?? 0) % 4]!;
const cornerOf = (s: Side): CornerId => CORNERS[(s.spot ?? 0) % 4]!;

/** The zone a wrestler is in, from where they are (their area) and which way (their spot). */
export function zoneOf(s: Side): ZoneId {
  return zoneOfArea(s.state.area, s);
}

export function zoneOfArea(area: Area, s: Side): ZoneId {
  switch (area) {
    case 'IN_RING': case 'ROPES': return 'ring';
    case 'CORNER': case 'TOP_ROPE': return `corner_${cornerOf(s)}`;
    case 'APRON': return `apron_${compassOf(s)}`;
    case 'OUTSIDE': case 'LADDER': return `floor_${compassOf(s)}`;
    case 'RAMP': return 'ramp';
    case 'CROWD': return 'crowd';
    case 'BACKSTAGE': return 'backstage';
    case 'CAGE': return 'ring';
  }
}

/** How far apart two wrestlers are, in zones. */
export const distance = (S: MatchState, a: SideKey, b: SideKey): number => zoneDistance(zoneOf(S.sides[a]!), zoneOf(S.sides[b]!));
/** Within reach: the same zone or the next one. */
export const inReach = (S: MatchState, a: SideKey, b: SideKey): boolean => distance(S, a, b) <= 1;

/**
 * Keep spots sensible as people move: whoever goes to the floor, an apron or a corner next to someone
 * they're fighting ends up on the same side (or corner) as them. Runs after every action in matches with
 * more than two people; singles never need it (and don't call it, so nothing changes there).
 */
export function settleSpots(S: MatchState): void {
  for (const k of S.order) {
    const s = S.sides[k]!, t = S.sides[s.target];
    if (!t || s.out) continue;
    const a = s.state.area, b = t.state.area;
    const outsideA = a === 'OUTSIDE' || a === 'APRON', outsideB = b === 'OUTSIDE' || b === 'APRON';
    if (outsideA && outsideB) s.spot = t.spot ?? s.spot;
    else if ((a === 'CORNER' || a === 'TOP_ROPE') && (b === 'CORNER' || b === 'TOP_ROPE')) s.spot = t.spot ?? s.spot;
  }
}
