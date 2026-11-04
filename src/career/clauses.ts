// The ten contract clauses (Lyra's wording) and each promotion's attitude to them.
import { getPromotion } from '../data/rtr';
export interface ClauseDef { id: string; name: string; tiers: [string, string, string]; none: string; short: [string, string, string] }

export const CLAUSES: ClauseDef[] = [
  { id: 'creative', name: 'Creative Control', none: 'Not in the contract: the booker decides everything.',
    short: ['Consultation', 'Protected Booking', 'Full Creative Control'],
    tiers: ['Consultation: management considers your preferences but keeps final say.', 'Protected Booking: you can reject major gimmick changes or particularly damaging booking.', 'Full Creative Control: you can veto storylines, gimmick changes and match outcomes.'] },
  { id: 'indie', name: 'Indie Bookings', none: 'Not in the contract: no indie dates while signed.',
    short: ['Restricted', 'Open', 'Unrestricted'],
    tiers: ['Restricted: occasional indie dates, each needs approval.', 'Open: indie dates allowed when they don’t clash with promotion dates.', 'Unrestricted: indie dates allowed even when they clash; missed dates still have consequences.'] },
  { id: 'medical', name: 'Medical Pay', none: 'Not in the contract: you pay your own medical bills.',
    short: ['Basic', 'Protected', 'Comprehensive'],
    tiers: ['Basic: part of your medical bills covered.', 'Protected: all medical bills plus part of your usual earnings while injured.', 'Comprehensive: all medical bills and all your usual earnings while injured.'] },
  { id: 'guaranteed', name: 'Guaranteed Pay', none: 'Not in the contract: losing cuts your fee.',
    short: ['Partial Guarantee', 'Standard Guarantee', 'Premium Guarantee'],
    tiers: ['Partial Guarantee: losing still cuts your fee, but by less.', 'Standard Guarantee: full fee win or lose.', 'Premium Guarantee: full fee win or lose, plus an appearance bonus.'] },
  { id: 'wage', name: 'Wage Matching', none: 'Not in the contract: your fee is fixed.',
    short: ['Internal Parity', 'External Matching', 'Automatic Matching'],
    tiers: ['Internal Parity: request pay reviews against comparable wrestlers here.', 'External Matching: they can match a verified rival offer.', 'Automatic Matching: qualifying higher offers raise your pay automatically.'] },
  { id: 'title', name: 'Championship Opportunities', none: 'Not in the contract: title shots are the booker’s call.',
    short: ['Consideration', 'Contender Protection', 'Title Shot Guarantee'],
    tiers: ['Consideration: priority consideration for title shots.', 'Contender Protection: a title match guaranteed within an agreed period.', 'Title Shot Guarantee: a title match must be booked before a deadline.'] },
  { id: 'schedule', name: 'Schedule Flexibility', none: 'Not in the contract: you work the dates you’re given.',
    short: ['Limited', 'Protected', 'Flexible'],
    tiers: ['Limited: you can request occasional days off.', 'Protected: agreed days off and a monthly appearance cap.', 'Flexible: refuse dates outside your agreed schedule, no penalty.'] },
  { id: 'exit', name: 'Contract Exit', none: 'Not in the contract: you can only ask for your release.',
    short: ['Buyout', 'Notice Period', 'Open Exit'],
    tiers: ['Buyout: leave by paying an agreed release fee.', 'Notice Period: leave after giving notice.', 'Open Exit: leave any time, no penalty.'] },
  { id: 'merch', name: 'Merchandise Rights', none: 'Not in the contract: no share of your merch.',
    short: ['Standard', 'Enhanced', 'Ownership'],
    tiers: ['Standard: a small share of your merch income.', 'Enhanced: a bigger share.', 'Ownership: you keep the majority of your merch income.'] },
  { id: 'outside', name: 'Outside Appearances', none: 'Not in the contract: no outside work. (No effect until outside appearances exist.)',
    short: ['Approval Required', 'Limited Freedom', 'Full Freedom'],
    tiers: ['Approval Required: media and promo work needs management approval.', 'Limited Freedom: allowed unless it clashes with obligations.', 'Full Freedom: you control your outside work.'] },
];

export const C = { creative: 0, indie: 1, medical: 2, guaranteed: 3, wage: 4, title: 5, schedule: 6, exit: 7, merch: 8, outside: 9 } as const;
export const NO_CLAUSES = (): number[] => [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

export type Attitude = 'resist' | 'neutral' | 'flexible';

/**
 * The old budget factors (average roster popularity ÷ TCG's). Promotions now carry a 0–100 popularity
 * that starts at 10 + 70 × this and moves; `budgetOf` reads that. Kept for converting older saves.
 */
export const BUDGET: Record<string, number> = {
  TCG: 1, VWF: 0.87, NWGP: 0.87, ZWA: 0.83, SLN: 0.78, IVW: 0.68, SSWC: 0.67, AAWA: 0.6, END: 0.6, UFC: 0.52, TIS: 0.4,
};

/** How much a promotion can spend, from its popularity: TCG at 80 is 1, UFC at 46 about 0.52. */
export function budgetOf(promo: string): number {
  const pop = getPromotion(promo)?.popularity;
  return pop === undefined ? BUDGET[promo] ?? 0.5 : (pop - 10) / 70;
}

const R: Attitude = 'resist', F: Attitude = 'flexible';
const ATT: Record<string, Partial<Record<keyof typeof C, Attitude>>> = {
  TCG: { creative: R, indie: R, wage: F },
  VWF: { creative: R, exit: R, merch: R, medical: F, guaranteed: F },
  NWGP: { indie: R, schedule: R, medical: F, title: F },
  ZWA: { merch: R, outside: R, schedule: F },
  SLN: { exit: R, indie: F, creative: F },
  IVW: { medical: R, creative: F, schedule: F },
  SSWC: { wage: R, indie: F, outside: F },
  AAWA: { exit: R, creative: F, merch: F },
  END: { guaranteed: R, creative: F, indie: F },
  UFC: { guaranteed: R, medical: R, creative: F, indie: F, schedule: F },
};

export function attitude(promo: string, clause: number): Attitude {
  const key = (Object.keys(C) as (keyof typeof C)[]).find((k) => C[k] === clause)!;
  return ATT[promo]?.[key] ?? 'neutral';
}

/** Rounds they'll negotiate before walking: richer promotions are less patient. */
export const patience = (promo: string): number => (budgetOf(promo) >= 0.8 ? 3 : budgetOf(promo) >= 0.65 ? 4 : 5);
