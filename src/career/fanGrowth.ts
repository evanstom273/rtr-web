// Fan growth (Lyra's brief): wrestlers win fans from the people a show reaches, mostly where it happens.
// Big promotions reach far more people; a good match converts more of them; your following in a
// region saturates against the audience you're working in front of; exceptional matches spill a little
// further. No randomness: the same match always does the same.
import { FAN_REGIONS, fansIn, getPromotion, type Wrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { promoRegion } from './booker';
import { isWeeklyFlagship } from './economy';
import { NEIGHBOURS } from './places';
import {
  FAN_AUD_INDIE, FAN_AUD_INDIE_SLOPE, FAN_AUD_INDIE_SPECIAL, FAN_AUD_KIND, FAN_AUD_MAJOR, FAN_AUD_MAJOR_AT, FAN_AUD_MAJOR_SLOPE,
  FAN_AUD_WEEKLY_FLAGSHIP, FAN_BAD_LOSS, FAN_BAD_STARS, FAN_CONV, FAN_CONV_EXP, FAN_EVENT_FLOOR, FAN_EVENT_PER_POINT, FAN_LOSS,
  FAN_REACH, FAN_SATURATION, FAN_SPILL, FAN_SPILL_TOP, FAN_TITLE_WIN, FAN_WIN, TRAIT_FX,
} from './tuning';
import type { PopRegion, Show } from './types';
import { hasTrait } from '../data/rtr';

/** How many people a show reaches in its own region. */
export function audience(show: Pick<Show, 'promo' | 'promos' | 'kind' | 'region' | 'brand' | 'special' | 'date'>): number {
  if (show.promo === 'TIS' || show.kind === 'indie') {
    const pop = (show.brand ? activeWorld().people?.brands[show.brand]?.popularity : undefined) ?? 10;
    return FAN_AUD_INDIE * 10 ** ((pop - 5) / FAN_AUD_INDIE_SLOPE) * (show.special ? FAN_AUD_INDIE_SPECIAL : 1);
  }
  const promos = show.promos?.length ? show.promos : [show.promo];
  let best = 0;
  for (const p of promos) {
    const pop = getPromotion(p)?.popularity ?? 50;
    const home = promoRegion(p);
    const reach = home === show.region ? FAN_REACH.home : NEIGHBOURS[home].includes(show.region) ? FAN_REACH.neighbour : FAN_REACH.elsewhere;
    best = Math.max(best, FAN_AUD_MAJOR * 10 ** ((pop - FAN_AUD_MAJOR_AT) / FAN_AUD_MAJOR_SLOPE) * reach);
  }
  return best * (isWeeklyFlagship(show) ? FAN_AUD_WEEKLY_FLAGSHIP : FAN_AUD_KIND[show.kind]);
}

/** The share of an audience a 3★ match converts: 1.5% of a thousand, less of a bigger crowd. */
export const conversion = (aud: number): number => FAN_CONV * Math.max(0.05, aud / 1000) ** FAN_CONV_EXP;

/**
 * A match's fans for one wrestler: most in the show's region (saturating against its audience), and a
 * little spillover for a 4★+ match. Returns the change in the show's region, in people.
 */
export function matchFans(w: Wrestler, show: Show, stars: number, won: boolean, lost: boolean, titleWon: boolean, boost = 1): number {
  const r = show.region;
  const have = fansIn(w, r);
  if (stars < FAN_BAD_STARS) {
    const lose = Math.round(have * FAN_BAD_LOSS);
    w.fans[r] = have - lose;
    return -lose;
  }
  const aud = audience(show);
  const quality = 2 ** (stars - 3) * (won ? FAN_WIN : lost ? FAN_LOSS : 1) * (titleWon ? FAN_TITLE_WIN : 1)
    * (hasTrait(w, 'crowd_pleaser') ? TRAIT_FX.crowd_pleaser.fanMult : 1) * boost;
  const room = Math.max(0, 1 - have / (FAN_SATURATION * aud));
  const gain = Math.round(aud * conversion(aud) * quality * room);
  w.fans[r] = have + gain;
  // Exceptional matches reach people who don't usually watch: mostly your strongest other region.
  const spill = FAN_SPILL.filter(([s]) => stars >= s).at(-1)?.[1] ?? 0;
  if (spill && gain > 0) {
    const extra = gain * spill;
    const others = FAN_REGIONS.filter((x) => x !== r);
    const top = [...others].sort((a, b) => fansIn(w, b) - fansIn(w, a))[0]!;
    w.fans[top] += Math.round(extra * FAN_SPILL_TOP);
    const rest = others.filter((x) => x !== top);
    for (const x of rest) w.fans[x] += Math.round((extra * (1 - FAN_SPILL_TOP)) / rest.length);
  }
  return gain;
}

/** Events and cups: each old popularity "point" is 1.5% of your fans there, at least 15 people. */
export function eventFans(w: Wrestler, r: PopRegion, points: number): number {
  const have = fansIn(w, r);
  const change = Math.round(Math.sign(points) * Math.max(FAN_EVENT_FLOOR * Math.abs(points), have * FAN_EVENT_PER_POINT * Math.abs(points)));
  w.fans[r] = Math.max(0, have + change);
  return w.fans[r] - have;
}
