// Money: fees, travel and the training price curve.
import { fansIn, findWrestler, TITLES, type Wrestler, rosterOf, holds } from '../data/rtr';
import schedulesJson from '../data/rtr/schedules.json';
import { activeWorld } from '../world/world';
import { C, feeFloor } from './clauses';
import { isIndieTitle, promoRegion } from './booker';
import { regionOfCountry } from './places';
import {
  APPEARANCE_BONUS_T3, COST_INDEX, INDIE_FEE_BASE, INDIE_FEE_BRAND, INDIE_FEE_CHAMP, INDIE_FEE_EXP, INDIE_FEE_FANS_REF, INDIE_FEE_RANGE, INDIE_FEE_SPECIAL, LIVING_COST_EUROPE, LOSS_CUT_BY_TIER, MAJOR_FEE_FAN_CAP, MAJOR_FEE_FAN_EXP, SHOW_MULT, SHOW_MULT_WEEKLY_FLAGSHIP, TRAIN_DIVISOR, TRAIN_LEVEL_OFFSET, TRAVEL,
} from './tuning';
import type { Career, Contract, PopRegion, Show, ShowKind } from './types';

export const round5 = (v: number): number => Math.round(v / 5) * 5;

/**
 * A major promotion's weekly-show fee for a wrestler (Lyra's call: the bottom is about £2,500 and it's
 * dates that decide income): the promotion's floor × the wrestler's fans in its home region against its
 * roster's median, to the power 0.5, never below the floor and at most eight times it.
 */
export function contractFee(w: Wrestler, promo: string): number {
  const region = promoRegion(promo);
  const roster = rosterOf(promo).filter((x) => x.id !== w.id).map((x) => fansIn(x, region)).sort((a, b) => a - b);
  const median = roster.length ? roster[Math.floor(roster.length / 2)]! : 1;
  const factor = Math.min(MAJOR_FEE_FAN_CAP, Math.max(1, (fansIn(w, region) / Math.max(1, median)) ** MAJOR_FEE_FAN_EXP));
  return round5(feeFloor(promo) * factor);
}

/**
 * An indie fee (Lyra's call: below the majors, and not the same everywhere): your fans where the show
 * is, the brand putting it on, an indie belt, a special or cup night. At a region alone (an event's
 * paid appearance), an ordinary brand.
 */
export function indieFee(w: Wrestler, at: PopRegion | Show): number {
  const show = typeof at === 'string' ? undefined : at;
  const region = show ? show.region : (at as PopRegion);
  const pop = show?.brand ? activeWorld().people?.brands[show.brand]?.popularity : undefined;
  const [b0, b1] = INDIE_FEE_BRAND;
  const brand = pop === undefined ? 1 : b0 + ((Math.max(5, Math.min(30, pop)) - 5) / 25) * (b1 - b0);
  const champ = TITLES.some((t) => holds(t, w.id) && isIndieTitle(t.id)) ? INDIE_FEE_CHAMP : 1;
  const special = show && (show.special || show.kind === 'special') ? INDIE_FEE_SPECIAL : 1;
  const fee = INDIE_FEE_BASE * brand * (Math.max(1, fansIn(w, region)) / INDIE_FEE_FANS_REF) ** INDIE_FEE_EXP * champ * special;
  return Math.max(INDIE_FEE_RANGE[0], Math.min(INDIE_FEE_RANGE[1], round5(fee)));
}

/** SLN-style flagships that run every week (from the schedules): paid like a big weekly show. */
const WEEKLY_FLAGSHIP = new Set(Object.entries(schedulesJson as unknown as Record<string, { kind: string; when: { every?: string } }[]>)
  .flatMap(([promo, rules]) => rules.filter((r) => r.kind === 'flagship' && r.when.every).map((r) => `${promo}:${r.when.every}`)));
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const isWeeklyFlagship = (show: Pick<Show, 'kind' | 'promo' | 'date'>): boolean =>
  show.kind === 'flagship' && WEEKLY_FLAGSHIP.has(`${show.promo}:${DAY_NAMES[new Date(`${show.date}T12:00:00Z`).getUTCDay()]}`);

export function travelCost(home: string, showCountry: string): number {
  if (home === showCountry) return TRAVEL.country;
  return regionOfCountry(home) === regionOfCountry(showCountry) ? TRAVEL.region : TRAVEL.abroad;
}

/** What a contracted match pays after the result (Guaranteed Pay softens or removes the loss cut). */
export function matchPay(contract: Contract, kind: ShowKind, lost: boolean, weeklyFlagship = false): { pay: number; bonus: number } {
  const full = round5(contract.fee * (weeklyFlagship ? SHOW_MULT_WEEKLY_FLAGSHIP : SHOW_MULT[kind]));
  const tier = contract.clauses[C.guaranteed] ?? 0;
  const pay = lost ? round5(full * (1 - LOSS_CUT_BY_TIER[tier]!)) : full;
  const bonus = tier >= 3 ? round5(full * APPEARANCE_BONUS_T3) : 0;
  return { pay, bonus };
}

function eldenRingRunes(level: number): number {
  const x = Math.max(0, level + 81 - 92) * 0.02;
  return Math.floor((x + 0.1) * (level + 81) ** 2) + 1;
}

/** The price of the next +1 to any attribute, from the total of all six (Elden Ring's level curve). */
export function trainingPrice(total: number): number {
  return round5(eldenRingRunes(Math.max(1, total - TRAIN_LEVEL_OFFSET)) / TRAIN_DIVISOR);
}

export const attributeTotal = (w: Wrestler): number =>
  w.stats.strength + w.stats.speed + w.stats.stamina + w.stats.skill + w.stats.striking + w.stats.charisma;

/** The region you live in, which sets your living costs (your home country until you move). */
export const baseRegion = (c: Career): PopRegion => regionOfCountry(c.base ?? findWrestler(c.player)?.country ?? 'UK');

/** A week's living costs where you live (Lyra's call): Europe £220, by each region's cost index. */
export const livingCost = (region: PopRegion): number => round5(LIVING_COST_EUROPE * COST_INDEX[region]);
