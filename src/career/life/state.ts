// Life (Lyra's call: things to buy, own, run and lose): what you own and owe, where you live, and the switches.
// Everything hangs off c.life, made the first time it's needed. With Life off, nothing here is read.
import { findWrestler } from '../../data/rtr';
import { homeOf } from '../../world/social';
import type { Day } from '../dates';
import { CITIES, cityFor, regionOfCountry } from '../places';
import { COST_INDEX, CITY_PRICE, FEATURES, LIFE_PARTS, PRICE_BOOK as PB } from '../tuning';
import type { Career, PopRegion } from '../types';

export type LifePart = keyof typeof LIFE_PARTS;
/** Is this part of Life on (the master switch and the part's own)? */
export const on = (part: LifePart): boolean => FEATURES.life && LIFE_PARTS[part];

export type RentTier = keyof typeof PB.rent;
export type BuyTier = keyof typeof PB.buy;
export type VehicleTier = keyof typeof PB.vehicles;
export type FlyClass = keyof typeof PB.fly;
export type AgentTier = keyof typeof PB.agents;
export type LoanKind = keyof typeof PB.loans;
export type StaffRole = keyof typeof PB.staff;

export interface Home {
  id: string;
  city: string;
  country: string;
  /** Renting: the rent tier. Owning: the buy tier. */
  tier: RentTier | BuyTier;
  own: boolean;
  /** Owned: what you paid, and the city's market index when you bought it (its value follows the market). */
  paid?: number;
  idx?: number;
  use: 'live' | 'let' | 'empty';
  letAgent?: boolean;
  /** A home gym or your own ring (owned homes). */
  gym?: 'gym' | 'ring';
  since: Day;
  /** Up for sale: sells on this day. */
  selling?: Day;
}

export interface Vehicle { id: string; tier: VehicleTier; paid: number; since: Day }

export interface Loan {
  id: string;
  kind: LoanKind;
  /** What it's for (a home or vehicle id). */
  on: string;
  what: string;
  left: number;
  monthly: number;
  rate: number;
  /** Missed payments in a row. */
  missed: number;
  since: Day;
}

export interface AgentState { tier: AgentTier; name: string; mode: 'advise' | 'handle'; since: Day; prio: ('money' | 'dates' | 'creative' | 'titles')[] }

export interface LifeState {
  v: 1;
  /** The city you live in (your base): c.base is kept as its country. */
  city: string;
  homes: Home[];
  cars: Vehicle[];
  loans: Loan[];
  credit: number;
  /** How you fly abroad by default, and per-show upgrades. */
  fly: FlyClass;
  trips?: Record<string, FlyClass>;
  /** Tax this calendar year: what you've earned (taxable) and paid. */
  tax: { year: string; earned: number; paid: number };
  /** Taxable earnings by month (the last twelve), for what you can borrow. */
  months?: Record<string, number>;
  agent?: AgentState;
  /** When each month's bills last went out (YYYY-MM). */
  billed?: string;
  /** Bankrupt: no borrowing until this day. */
  bust?: Day;
  /** Take mates along in the van or on the bus (they chip in; bonds grow on the road). */
  crewOn?: boolean;
  /** Personal staff on the payroll. */
  staff?: { role: StaffRole; name: string; since: Day }[];
  /** The recovery kit at home (cryo, hyperbaric). */
  kit?: boolean;
  /** What the PA's handled since their last note. */
  paLog?: string[];
  /** Entrance: the kit you own, and whether you use pyro and sets where they're allowed. */
  gear?: { theme?: boolean; video?: boolean; gear?: 0 | 1 | 2 | 3; pyro?: boolean; set?: boolean };
  seq: number;
}

/** Every city's country. */
export const COUNTRY_OF: Record<string, string> = Object.fromEntries(Object.entries(CITIES).flatMap(([country, cs]) => cs.map((x) => [x, country])));
export const countryOfCity = (city: string): string => COUNTRY_OF[city] ?? 'UK';
export const regionOfCity = (city: string): PopRegion => regionOfCountry(countryOfCity(city));

/** What a city costs to live in, against an average European city (region's cost index × the city's price). */
export const cityPrice = (city: string): number => COST_INDEX[regionOfCity(city)] * (CITY_PRICE[city] ?? 1);

const me = (c: Career) => findWrestler(c.player);
const homeCountry = (c: Career): string => c.base ?? me(c)?.country ?? 'UK';

/** Where you start: your wrestler's home city (or the city of the country you've moved to). */
function startCity(c: Career): string {
  const country = homeCountry(c);
  const own = me(c);
  const h = own && own.country === country ? homeOf(c.seed, own.id, country) : undefined;
  return h && CITIES[country]?.includes(h) ? h : cityFor(country);
}

/**
 * Your Life, made the first time: you rent where you live now, at about what living costs today (a shared room
 * on the indies; a flat once you're signed).
 */
export function life(c: Career): LifeState {
  if (c.life) return c.life;
  const city = startCity(c);
  const signed = !!c.people[c.player]?.contract;
  const L: LifeState = {
    v: 1, city, homes: [], cars: [], loans: [], credit: PB.credit.start, fly: 'economy',
    tax: { year: c.today.slice(0, 4), earned: 0, paid: 0 }, seq: 0,
  };
  L.homes.push({ id: `h${++L.seq}`, city, country: countryOfCity(city), tier: signed ? 'flat' : 'room', own: false, use: 'live', since: c.today });
  c.life = L;
  c.base = countryOfCity(city);
  return L;
}

/** The home you live in. */
export const liveHome = (c: Career): Home => {
  const L = life(c);
  return L.homes.find((h) => h.use === 'live') ?? L.homes[0]!;
};

/** The city you live in: your Life's, or (Life off) your country's first city. */
export const homeCity = (c: Career): string => (on('homes') ? life(c).city : cityFor(homeCountry(c)));

export const newId = (c: Career, p: string): string => `${p}${++life(c).seq}`;
