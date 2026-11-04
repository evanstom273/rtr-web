// Development and decline (Lyra's calls). Every AI wrestler has a hidden potential and peak age. Before the
// peak they grow towards their potential (faster if they're working regularly or have a mentor); from 34
// they decline, speed and stamina first. It all happens on the first of the month. Your own wrestler only
// changes through training. Potentials are rolled from the world's seed the first time they're needed, so
// shipped wrestlers, rookies, generated indies and old saves all get one, the same every time.
import { WRESTLERS, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { setCareerHooks } from './career';
import { daysBetween } from './dates';
import { attributeTotal } from './economy';
import { DEV } from './tuning';
import type { Career } from './types';

type Stat = keyof Wrestler['stats'];
const STATS: Stat[] = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'];

/** A rookie's room to grow: 20–120, most 40–70 (an average of three rolls, leaning low). */
export function rollRoom(rnd: () => number): number {
  const u = (rnd() + rnd() + rnd()) / 3;
  return Math.round(DEV.room[0] + (DEV.room[1] - DEV.room[0]) * u ** 1.15);
}

/** Their hidden potential and peak: rolled once, from the world seed, by their age now. */
export function ensurePotential(w: Wrestler, seed = activeWorld().seed): void {
  if (w.potential !== undefined && w.peak !== undefined) return;
  const rnd = seededRng(hashSeed(seed, 'potential', w.id));
  const room = rollRoom(rnd);
  const left = w.age <= DEV.roomShrinkFrom ? 1 : Math.max(0, 1 - (w.age - DEV.roomShrinkFrom) / (DEV.roomGoneAt - DEV.roomShrinkFrom));
  w.potential ??= Math.min(DEV.cap * 6, attributeTotal(w) + Math.round(room * left));
  w.peak ??= DEV.peak[0] + Math.floor(rnd() * (DEV.peak[1] - DEV.peak[0] + 1));
}

/** One point on (weighted towards what they're already good at) or off (speed and stamina first). */
function shift(w: Wrestler, up: boolean, rnd: Rng): void {
  const weights = STATS.map((k) => (up ? (w.stats[k] < DEV.cap ? w.stats[k] : 0) : w.stats[k] > 25 ? DEV.declineWeights[k] : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) return;
  let r = rnd() * total;
  for (let i = 0; i < STATS.length; i++) { r -= weights[i]!; if (r <= 0) { w.stats[STATS[i]!] += up ? 1 : -1; return; } }
}

/** A month of development for one wrestler. */
export function developMonth(w: Wrestler, working: boolean, mentored: boolean, rnd: Rng): void {
  ensurePotential(w);
  let d = w.dev ?? 0;
  if (w.age < w.peak!) {
    d += Math.max(0, w.potential! - attributeTotal(w)) * DEV.grow * (working ? DEV.working : 1) * (mentored ? DEV.mentor : 1);
  } else if (w.age >= DEV.declineFrom) {
    const [lo, hi] = w.age >= DEV.declineSteep ? DEV.declineSteepRate : DEV.decline;
    d -= (lo + rnd() * (hi - lo)) / 12;
  }
  while (d >= 1) { shift(w, true, rnd); d -= 1; }
  while (d <= -1) { shift(w, false, rnd); d += 1; }
  w.dev = Math.round(d * 1000) / 1000;
}

/** The first of the month: everyone but you. */
function monthly(c: Career, _rnd: Rng): void {
  const P = activeWorld().people;
  const mentored = new Set<string>();
  for (const b of Object.values(P?.bonds ?? {})) if (b.mentor) mentored.add(b.mentor === b.a ? b.b : b.a);
  const rnd = seededRng(hashSeed(c.seed, 'develop', c.today));
  for (const w of WRESTLERS) {
    const p = c.people[w.id];
    if (w.id === c.player || p?.retired) continue;
    const working = (p?.circuit ?? []).filter((x) => daysBetween(x.d, c.today) <= 31).length >= DEV.workingDates;
    developMonth(w, working, mentored.has(w.id), rnd);
  }
}

setCareerHooks({ monthly });
