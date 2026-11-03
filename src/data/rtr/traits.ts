// Personality traits: how a wrestler (or a booker) tends to behave. Attributes say what they can do;
// traits say how they go about it. Every wrestler has one to three, any mix of in-ring and backstage.
// What each trait does, in numbers, lives in career/tuning.ts (TRAIT_FX), so the engine and the career
// read the same values.
import { TRAIT_COUNTS_GENERATED, TRAIT_MAX } from '../../career/tuning';
import type { Wrestler } from './types';

export type TraitId =
  | 'risk_taker' | 'methodical' | 'showboat' | 'aggressive' | 'defensive' | 'resilient' | 'opportunist' | 'dirty_fighter'
  | 'big_match' | 'inconsistent' | 'submission_specialist' | 'crowd_pleaser'
  | 'loyal' | 'mercenary' | 'ambitious' | 'professional' | 'rebellious' | 'politician' | 'team_player' | 'egotistical'
  | 'mentor' | 'hot_headed' | 'reliable' | 'unpredictable';

export type TraitCat = 'ring' | 'backstage';

export interface TraitDef {
  id: TraitId;
  name: string;
  cat: TraitCat;
  /** What it means, in a line. */
  blurb: string;
  /** The stronger ones cost more in Training. */
  premium?: boolean;
}

export const TRAITS: TraitDef[] = [
  { id: 'risk_taker', name: 'Risk Taker', cat: 'ring', blurb: 'Goes to the top rope and the outside more, and the crowd loves it. Lands harder when it goes wrong.' },
  { id: 'methodical', name: 'Methodical', cat: 'ring', blurb: 'Picks a body part and works it. Sharper choices, and an edge once the target is worn down.' },
  { id: 'showboat', name: 'Showboat', cat: 'ring', blurb: 'Plays to the crowd: taunts more and gets more from them, but gets caught posing.' },
  { id: 'aggressive', name: 'Aggressive', cat: 'ring', blurb: 'Keeps the offence coming and rarely rests. Starts fast, tires faster.' },
  { id: 'defensive', name: 'Defensive', cat: 'ring', blurb: 'Waits for the counter and avoids damage. Builds momentum more slowly.' },
  { id: 'resilient', name: 'Resilient', cat: 'ring', blurb: 'Kicks out and escapes when others wouldn’t. Takes more punishment along the way.' },
  { id: 'opportunist', name: 'Opportunist', cat: 'ring', blurb: 'Spots the opening: quick covers, roll-ups and flash pins.' },
  { id: 'dirty_fighter', name: 'Dirty Fighter', cat: 'ring', blurb: 'Bends the rules, and the referee sees less of it.' },
  { id: 'big_match', name: 'Big-Match Performer', cat: 'ring', blurb: 'Rises to the occasion: better in title matches and on the big shows.', premium: true },
  { id: 'inconsistent', name: 'Inconsistent', cat: 'ring', blurb: 'Brilliant one night, flat the next. Each match is an on night or an off night.' },
  { id: 'submission_specialist', name: 'Submission Specialist', cat: 'ring', blurb: 'Goes for holds, applies them harder, and knows when they’ll make someone tap.' },
  { id: 'crowd_pleaser', name: 'Crowd Pleaser', cat: 'ring', blurb: 'Every big spot means more to the crowd, and popularity and merchandise follow.', premium: true },
  { id: 'loyal', name: 'Loyal', cat: 'backstage', blurb: 'Values a long relationship with a promotion: renews more, hard to poach.' },
  { id: 'mercenary', name: 'Mercenary', cat: 'backstage', blurb: 'Follows the money: tests the market and plays offers off each other.' },
  { id: 'ambitious', name: 'Ambitious', cat: 'backstage', blurb: 'Chases titles and the top of the card, and leaves if it isn’t coming.' },
  { id: 'professional', name: 'Professional', cat: 'backstage', blurb: 'Sticks to the plan and the agreed finish. Bookers notice.' },
  { id: 'rebellious', name: 'Rebellious', cat: 'backstage', blurb: 'Pushes back on authority and the script. Fans like it more than bookers do.' },
  { id: 'politician', name: 'Politician', cat: 'backstage', blurb: 'Works the office: favours count for more, and friends in high places help.' },
  { id: 'team_player', name: 'Team Player', cat: 'backstage', blurb: 'Will do the job for the show, and gets on with people.' },
  { id: 'egotistical', name: 'Egotistical', cat: 'backstage', blurb: 'Expects the spotlight, asks for it, and takes slights badly.' },
  { id: 'mentor', name: 'Mentor', cat: 'backstage', blurb: 'Brings the young ones along: protégés improve, and it earns respect.' },
  { id: 'hot_headed', name: 'Hot-Headed', cat: 'backstage', blurb: 'Quick to escalate. Arguments cost more, and the temper shows in the ring.' },
  { id: 'reliable', name: 'Reliable', cat: 'backstage', blurb: 'Turns up and honours commitments. New bookers start a step ahead with them.' },
  { id: 'unpredictable', name: 'Unpredictable', cat: 'backstage', blurb: 'Reacts differently every time. Answers, and choices, are harder to call.' },
];

export const TRAIT_IDS = TRAITS.map((t) => t.id);
const byId = new Map(TRAITS.map((t) => [t.id, t]));
export const traitDef = (id: TraitId): TraitDef => byId.get(id)!;
export const traitName = (id: TraitId): string => byId.get(id)?.name ?? id;
export const isTrait = (x: string): x is TraitId => byId.has(x as TraitId);

/**
 * The only pairs nobody holds together: each pushes the same decision the opposite way, so together
 * they'd be meaningless. Everything else can coexist, contradictions and all (an Aggressive, Defensive
 * counter-puncher; a Politician with a temper).
 */
export const CONFLICTS: [TraitId, TraitId][] = [
  ['loyal', 'mercenary'],
  ['professional', 'rebellious'],
  ['team_player', 'egotistical'],
];

export const conflictOf = (t: TraitId): TraitId | undefined => {
  for (const [a, b] of CONFLICTS) {
    if (a === t) return b;
    if (b === t) return a;
  }
  return undefined;
};

export type AddCheck = 'ok' | 'have' | 'full' | 'conflict';

/**
 * Can `t` join `list` (optionally in place of `replacing`)? Full means a slot has to be given up first;
 * conflict means it clashes with one that would stay.
 */
export function canAdd(list: readonly TraitId[], t: TraitId, replacing?: TraitId): AddCheck {
  const after = list.filter((x) => x !== replacing);
  if (after.includes(t)) return 'have';
  const clash = conflictOf(t);
  if (clash && after.includes(clash)) return 'conflict';
  if (after.length >= TRAIT_MAX) return 'full';
  return 'ok';
}

/** A valid trait list: at most three, no duplicates, no conflicting pair. */
export function validTraits(list: readonly TraitId[]): boolean {
  if (list.length > TRAIT_MAX || new Set(list).size !== list.length) return false;
  return list.every((t) => { const c = conflictOf(t); return !c || !list.includes(c); });
}

// ------------------------------------------------------------------ who tends to have what

/** How likely each trait is for this wrestler: their style, alignment, attributes, age and standing. */
export function traitWeights(w: Wrestler): Record<TraitId, number> {
  const k = Object.fromEntries(TRAIT_IDS.map((t) => [t, 1])) as Record<TraitId, number>;
  const add = (t: TraitId, v: number) => { k[t] += v; };
  for (const c of w.classes) {
    if (c === 'HIGH_FLYER') { add('risk_taker', 4); add('crowd_pleaser', 2); add('showboat', 1); }
    if (c === 'TECHNICIAN') { add('methodical', 3); add('submission_specialist', 3); add('defensive', 1); }
    if (c === 'STRIKER') { add('aggressive', 3); add('opportunist', 1); add('hot_headed', 1); }
    if (c === 'POWERHOUSE') { add('resilient', 2); add('aggressive', 1); add('methodical', 1); }
    if (c === 'HARDCORE') { add('dirty_fighter', 2); add('resilient', 2); add('risk_taker', 2); add('rebellious', 1); }
  }
  if (w.disposition === 'HEEL') { add('dirty_fighter', 2); add('egotistical', 2); add('politician', 1); add('opportunist', 1); add('showboat', 1); }
  else { add('crowd_pleaser', 2); add('team_player', 2); add('loyal', 1); add('reliable', 1); }
  const s = w.stats;
  if (s.charisma >= 85) { add('showboat', 2); add('crowd_pleaser', 1); add('big_match', 1); }
  if (s.skill >= 85) { add('methodical', 1); add('submission_specialist', 1); }
  if (s.stamina >= 85) add('resilient', 1);
  if (w.age >= 34) { add('mentor', 3); add('methodical', 1); add('loyal', 1); add('professional', 1); }
  if (w.age <= 24) { add('ambitious', 2); add('inconsistent', 2); add('risk_taker', 1); add('hot_headed', 1); }
  if (w.popularity.global >= 45) { add('big_match', 2); add('egotistical', 1); add('ambitious', 1); }
  if (w.popularity.global < 20) { add('ambitious', 1); add('team_player', 1); }
  return k;
}

/** How many traits to roll: weights for one, two and three. */
export function rollCount(rnd: () => number, weights: readonly number[] = TRAIT_COUNTS_GENERATED): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let i = 0; i < weights.length; i++) { x -= weights[i]!; if (x <= 0) return i + 1; }
  return 1;
}

/** Roll a wrestler's traits from their weights: `count` of them, no duplicates, no conflicting pair. */
export function rollTraits(w: Wrestler, rnd: () => number, count: number, scale?: Partial<Record<TraitId, number>>): TraitId[] {
  const weights = traitWeights(w);
  const out: TraitId[] = [];
  while (out.length < Math.min(count, TRAIT_MAX)) {
    const open = TRAIT_IDS.filter((t) => canAdd(out, t) === 'ok');
    const ws = open.map((t) => weights[t] * (scale?.[t] ?? 1));
    const total = ws.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let x = rnd() * total;
    let picked = open[open.length - 1]!;
    for (let i = 0; i < open.length; i++) { x -= ws[i]!; if (x <= 0) { picked = open[i]!; break; } }
    out.push(picked);
  }
  return out;
}

export const hasTrait = (w: Pick<Wrestler, 'traits'> | undefined | null, t: TraitId): boolean => !!w?.traits?.includes(t);
