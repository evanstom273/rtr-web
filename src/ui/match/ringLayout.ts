/*
 * Where each wrestler stands on the top-down ring, from their four-part state. Presentation only:
 * the engine has no coordinates. Inspired by Godot's RingVisualPlacementResolver, but resolved
 * for the pair together so attackers stand next to whoever they're working on.
 */
import type { Area, SideKey, Snapshot } from '../../engine';

export const VIEW = { w: 440, h: 300 };
export const APRON = { x: 150, y: 40, w: 220, h: 220 };
export const MAT = { x: 162, y: 52, w: 196, h: 196 };
export const BARRIER = { x: 120, y: 12, w: 280, h: 276 };
export const CENTRE = { x: MAT.x + MAT.w / 2, y: MAT.y + MAT.h / 2 };

export type Pt = { x: number; y: number };

/** Where an object lying or standing in an area is drawn. i spreads several apart. */
export function objectAnchor(area: Area, state: string, i: number): Pt {
  const cx = CENTRE.x, cy = CENTRE.y;
  switch (area) {
    case 'IN_RING':
      if (state === 'corner') return { x: POSTS.SE.x - 14, y: POSTS.SE.y - 14 };
      if (state === 'ladder') return { x: cx, y: cy };
      return { x: cx + (i % 2 ? 46 : -46), y: cy + 58 - Math.floor(i / 2) * 22 };
    case 'OUTSIDE': return { x: cx - 70 + (i % 5) * 34, y: BARRIER.y + BARRIER.h - 13 };
    case 'RAMP': return { x: 74, y: cy + 22 };
    case 'CROWD': return { x: 424, y: cy + 30 };
    case 'BACKSTAGE': return { x: 14, y: cy + 30 };
    default: return { x: cx, y: cy + 40 };
  }
}
type Vert = 'N' | 'S';

export const POSTS: Record<'NW' | 'NE' | 'SE' | 'SW', Pt> = {
  NW: { x: MAT.x, y: MAT.y },
  NE: { x: MAT.x + MAT.w, y: MAT.y },
  SE: { x: MAT.x + MAT.w, y: MAT.y + MAT.h },
  SW: { x: MAT.x, y: MAT.y + MAT.h },
};

/** Stable home side: the player works from the west, the AI from the east. */
const homeX = (k: SideKey): -1 | 1 => (k === 'you' ? -1 : 1);

const towards = (from: Pt, to: Pt, d: number): Pt => {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * d, y: from.y + (dy / len) * d };
};

export interface Memory {
  /** North/south preference per side, flipped each time they enter a corner/top rope. */
  vert: Record<SideKey, Vert>;
  lastArea: Record<SideKey, Area>;
}

export const newMemory = (): Memory => ({ vert: { you: 'S', them: 'N' }, lastArea: { you: 'IN_RING', them: 'IN_RING' } });

function cornerFor(k: SideKey, m: Memory): keyof typeof POSTS {
  const ew = homeX(k) < 0 ? 'W' : 'E';
  return (m.vert[k] + ew) as keyof typeof POSTS;
}

/** Anchor for a single wrestler ignoring the partner. */
function soloAnchor(k: SideKey, s: Snapshot, m: Memory): Pt {
  const hx = homeX(k), cx = CENTRE.x, cy = CENTRE.y;
  const vy = m.vert[k] === 'N' ? -1 : 1;
  switch (s.area) {
    case 'IN_RING': {
      if (s.motion === 'RUNNING') return { x: cx + hx * 62, y: cy + vy * 10 };
      if (s.motion === 'ROPE_REBOUND') return { x: cx + hx * 88, y: cy + vy * 6 };
      return { x: cx + hx * 30, y: cy };
    }
    case 'CORNER': return towards(POSTS[cornerFor(k, m)], CENTRE, 15);
    case 'TOP_ROPE': return towards(POSTS[cornerFor(k, m)], CENTRE, -3);
    case 'ROPES': return { x: cx + hx * (MAT.w / 2 - 8), y: cy + vy * 26 };
    case 'APRON': return { x: cx + hx * (APRON.w / 2 - 5), y: cy + vy * 30 };
    case 'OUTSIDE': return hx < 0 ? { x: BARRIER.x + 15, y: cy + vy * 52 } : { x: BARRIER.x + BARRIER.w - 15, y: cy + vy * 52 };
    case 'RAMP': return { x: 90, y: CENTRE.y + (k === 'you' ? 9 : -9) };
    case 'CROWD': return { x: 424, y: cy + vy * 60 };
    case 'BACKSTAGE': return { x: 12, y: cy };
    // On the ladder (drawn in the middle of the ring) or up the side of the cage.
    case 'LADDER': return { x: cx + hx * 6, y: cy - 10 };
    case 'CAGE': return { x: cx + hx * 40, y: APRON.y - 3 };
    default: return { x: cx + hx * 20, y: cy };
  }
}

const isFlat = (a: Area) => a === 'IN_RING';

/** Resolve both anchors together. */
export function placePair(you: Snapshot, them: Snapshot, m: Memory): Record<SideKey, Pt> {
  for (const [k, s] of [['you', you], ['them', them]] as const) {
    const entered = (s.area === 'CORNER' || s.area === 'TOP_ROPE' || s.area === 'ROPES' || s.area === 'APRON') && m.lastArea[k] !== s.area;
    if (entered) m.vert[k] = m.vert[k] === 'N' ? 'S' : 'N';
    m.lastArea[k] = s.area;
  }
  const out: Record<SideKey, Pt> = { you: soloAnchor('you', you, m), them: soloAnchor('them', them, m) };
  const snaps: Record<SideKey, Snapshot> = { you, them };

  // Someone in the ring working on someone at the edge: stand next to them, inside.
  for (const k of ['you', 'them'] as const) {
    const o: SideKey = k === 'you' ? 'them' : 'you';
    const me = snaps[k], op = snaps[o];
    if (isFlat(me.area) && me.motion === 'STATIONARY' && (op.area === 'CORNER' || op.area === 'ROPES' || op.area === 'TOP_ROPE' || op.area === 'APRON')) {
      out[k] = towards(out[o], CENTRE, op.area === 'TOP_ROPE' ? 26 : 24);
    }
  }
  // Both on the floor together: side by side.
  if (you.area === them.area && (you.area === 'OUTSIDE' || you.area === 'CROWD')) {
    out.them = { x: out.you.x, y: out.you.y + (out.you.y > CENTRE.y ? -24 : 24) };
  }
  // Both in the ring and close quarters (one grounded / seated / kneeling): tighten up.
  if (isFlat(you.area) && isFlat(them.area) && you.motion === 'STATIONARY' && them.motion === 'STATIONARY') {
    const close = you.position !== 'STANDING' || them.position !== 'STANDING';
    const d = close ? 17 : 34;
    out.you = { x: CENTRE.x - d, y: CENTRE.y };
    out.them = { x: CENTRE.x + d, y: CENTRE.y };
  }
  // Running at a stationary opponent: aim along the line.
  return out;
}

/** Angle (degrees) a wrestler faces: towards the opponent if FRONT, away if BACK. */
export function facing(me: Pt, op: Pt, s: Snapshot): number {
  const a = (Math.atan2(op.y - me.y, op.x - me.x) * 180) / Math.PI;
  return s.orientation === 'BACK' ? a + 180 : a;
}
