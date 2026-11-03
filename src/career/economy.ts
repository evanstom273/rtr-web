// Money: fees, travel and the training price curve.
import type { Wrestler } from '../data/rtr';
import { BUDGET, C } from './clauses';
import { promoRegion, regionalPop } from './booker';
import { regionOfCountry } from './places';
import {
  APPEARANCE_BONUS_T3, FEE_BASE, FEE_PER_POP, INDIE_BASE, INDIE_PER_POP, LOSS_CUT_BY_TIER, SHOW_MULT, TRAIN_DIVISOR,
  TRAIN_LEVEL_OFFSET, TRAVEL,
} from './tuning';
import type { Contract, PopRegion, ShowKind } from './types';

export const round5 = (v: number): number => Math.round(v / 5) * 5;

/** A promotion's weekly-show fee for a wrestler, from their popularity in its home region. */
export function contractFee(w: Wrestler, promo: string): number {
  return round5((FEE_BASE + FEE_PER_POP * regionalPop(w, promoRegion(promo))) * (BUDGET[promo] ?? 0.5));
}

export function indieFee(w: Wrestler, region: PopRegion): number {
  return round5(INDIE_BASE + INDIE_PER_POP * regionalPop(w, region));
}

export function travelCost(home: string, showCountry: string): number {
  if (home === showCountry) return TRAVEL.country;
  return regionOfCountry(home) === regionOfCountry(showCountry) ? TRAVEL.region : TRAVEL.abroad;
}

/** What a contracted match pays after the result (Guaranteed Pay softens or removes the loss cut). */
export function matchPay(contract: Contract, kind: ShowKind, lost: boolean): { pay: number; bonus: number } {
  const full = round5(contract.fee * SHOW_MULT[kind]);
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
