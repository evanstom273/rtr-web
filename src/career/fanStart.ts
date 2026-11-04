// Starting fans for someone new (Lyra's call): most at home, a few next door, hardly any elsewhere.
// Converted wrestlers keep their own (the curve); this is only for wrestlers made from now on.
import { FAN_REGIONS } from '../data/rtr/fans';
import type { Fans } from '../data/rtr/types';
import type { Rng } from '../engine/rng';
import { NEIGHBOURS } from './places';
import { CREATED_FANS, NEWCOMER_ELSEWHERE_SHARE, NEWCOMER_NEIGHBOUR_SHARE } from './tuning';
import type { PopRegion } from './types';

const span = (rnd: Rng, [lo, hi]: readonly [number, number]) => lo + rnd() * (hi - lo);

/** A generated indie or rookie: `homeFans` at home, 5–15% of that next door, 0–3% elsewhere. */
export function newcomerFans(rnd: Rng, home: PopRegion, homeFans: number): Fans {
  return Object.fromEntries(FAN_REGIONS.map((r) => [r,
    r === home ? Math.round(homeFans)
    : NEIGHBOURS[home].includes(r) ? Math.round(homeFans * span(rnd, NEWCOMER_NEIGHBOUR_SHARE))
    : Math.round(homeFans * span(rnd, NEWCOMER_ELSEWHERE_SHARE)),
  ])) as unknown as Fans;
}

/** A wrestler you create: 500 at home, 25 in each neighbouring region, 5 elsewhere. */
export function createdFans(home: PopRegion): Fans {
  return Object.fromEntries(FAN_REGIONS.map((r) => [r,
    r === home ? CREATED_FANS.home : NEIGHBOURS[home].includes(r) ? CREATED_FANS.neighbour : CREATED_FANS.elsewhere,
  ])) as unknown as Fans;
}
