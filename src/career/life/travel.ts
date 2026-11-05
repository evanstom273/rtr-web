// Life: getting to the shows. With cities, a trip is a distance; what you travel in decides the cost, the fatigue
// and how much of your week it takes. With Life off it's today's rules (by country), from where you live.
import { findWrestler } from '../../data/rtr';
import { addDays, type Day } from '../dates';
import { travelCost } from '../economy';
import { cityFor, cityKm, regionOfCountry } from '../places';
import { PRICE_BOOK as PB, TRAVEL_FATIGUE } from '../tuning';
import type { Career } from '../types';
import { homeCity, life, on, type FlyClass, type Vehicle, type VehicleTier } from './state';

export interface Place { country: string; city?: string }
export type Band = 'local' | 'short' | 'long' | 'abroad';

/** The country you live in: where you've moved to, else your wrestler's. (Not where they were born, once you've moved.) */
export const homeCountry = (c: Career): string => c.base ?? findWrestler(c.player)?.country ?? 'UK';
const cityOf = (p: Place): string => p.city ?? cityFor(p.country);

/** How far a trip is: another region is abroad; otherwise by distance. */
export function band(from: Place, to: Place): Band {
  if (regionOfCountry(from.country) !== regionOfCountry(to.country)) return 'abroad';
  const km = cityKm(cityOf(from), cityOf(to));
  return km < PB.trip.local.km ? 'local' : km < PB.trip.short.km ? 'short' : 'long';
}

const ROAD_ORDER: VehicleTier[] = ['tour_bus', 'luxury_car', 'car', 'van', 'used_car'];
/** Your best way by road (the bus, then the comfiest car), and in the air (your jet, then a share). */
export const roadVehicle = (c: Career): Vehicle | undefined => {
  if (!on('homes') || !c.life) return undefined;
  const cars = c.life.cars;
  for (const t of ROAD_ORDER) { const v = cars.find((x) => x.tier === t); if (v) return v; }
  return undefined;
};
export const jetOf = (c: Career): Vehicle | undefined => (on('homes') && c.life ? c.life.cars.find((x) => x.tier === 'jet') ?? c.life.cars.find((x) => x.tier === 'jet_share') : undefined);
/** How you'd fly to this show: its upgrade, or your default. */
export const flyClass = (c: Career, showId?: string): FlyClass => (showId && c.life?.trips?.[showId]) || c.life?.fly || 'economy';

/** Mates riding along chip in (the van and the bus). */
const chipIn = (c: Career, v: Vehicle | undefined): number => (v && PB.vehicles[v.tier].seats > 4 ? Math.min(c.life?.crew?.length ?? 0, PB.vehicles[v.tier].seats - 1) * PB.chipIn : 0);

const homePlace = (c: Career): Place => ({ country: homeCountry(c), city: homeCity(c) });

/** What a show costs you to get to and back (Life off: today's £0 / £60 / £250 by country). */
export function tripCost(c: Career, to: Place & { id?: string }): number {
  if (!on('homes')) return travelCost(homeCountry(c), to.country);
  const b = band(homePlace(c), to);
  if (b === 'local') return 0;
  if (b === 'abroad') {
    if (jetOf(c)) return 0;
    return PB.fly[flyClass(c, to.id)].cost;
  }
  const v = roadVehicle(c);
  const t = PB.trip[b];
  return v ? Math.max(0, t.road - chipIn(c, v)) : t.cost;
}

/** A promotion pays your way (economy): what you pay on top for the class you chose abroad (Life). */
export function upgradeCost(c: Career, to: Place & { id?: string }): number {
  if (!on('homes') || band(homePlace(c), to) !== 'abroad' || jetOf(c)) return 0;
  return Math.max(0, PB.fly[flyClass(c, to.id)].cost - PB.fly.economy.cost);
}

/** What a show's trip takes out of you (before a travel clause's comfort cut). */
export function tripFatigue(c: Career, to: Place & { id?: string }): number {
  if (!on('homes')) {
    const home = homeCountry(c);
    return home === to.country ? TRAVEL_FATIGUE.country : regionOfCountry(home) === regionOfCountry(to.country) ? TRAVEL_FATIGUE.region : TRAVEL_FATIGUE.abroad;
  }
  const b = band(homePlace(c), to);
  if (b === 'local') return 0;
  if (b === 'abroad') {
    const j = jetOf(c);
    if (j) return PB.jetFatigue[j.tier as 'jet' | 'jet_share'];
    return PB.fly[flyClass(c, to.id)].fatigue;
  }
  const v = roadVehicle(c);
  return Math.max(0, PB.trip[b].fatigue + (v ? PB.vehicles[v.tier].fatigue : 0));
}

/** A jet (or a chartered one) gets you there in half a day each way. */
export const fastAbroad = (c: Career, showId?: string): boolean => !!jetOf(c) || PB.fly[flyClass(c, showId)].fast;

/**
 * The half-days a leg takes (Life on), as [day, 'am' | 'pm'] keys. Going out: a short or long trip takes the
 * morning of the show; abroad the whole day before (half a day by jet). Coming home: a long trip the next morning;
 * abroad the whole next day (the next morning by jet).
 */
export function legHalves(c: Career, from: Place, to: Place, day: Day, after: boolean, showId?: string): [Day, 'am' | 'pm'][] {
  const b = band(from, to);
  if (b === 'local') return [];
  if (b === 'short') return after ? [] : [[day, 'am']];
  if (b === 'long' || (b === 'abroad' && fastAbroad(c, showId))) return [[after ? addDays(day, 1) : day, 'am']];
  const d = after ? addDays(day, 1) : addDays(day, -1);
  return [[d, 'am'], [d, 'pm']];
}

/** On the bus (or driven), a road trip's half-days count as rest. */
export const restOnTheRoad = (c: Career): boolean => roadVehicle(c)?.tier === 'tour_bus';

export { life };
