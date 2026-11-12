// The twenty-five contract clauses (Lyra's design), each promotion's character across them, and the deal packages.
import { getPromotion, globalScore, type Wrestler } from '../data/rtr';
import type { Rng } from '../engine/rng';
import { MAJOR_FEE_FLOOR, MAJOR_FEE_FLOOR_AT, MAJOR_FEE_MIN, MAJOR_FEE_PER_POINT, CUT_CLAUSES, PACKAGE_RULES } from './tuning';

export type ClauseGroup = 'card' | 'money' | 'body' | 'image' | 'future';
export interface ClauseDef { id: ClauseId; name: string; group: ClauseGroup; tiers: [string, string, string]; none: string; short: [string, string, string] }

/** The sections the contract screen groups clauses into (Lyra's call: grouped, so 25 stay readable). */
export const GROUPS: { id: ClauseGroup; name: string }[] = [
  { id: 'card', name: 'Booking & the card' },
  { id: 'money', name: 'Money' },
  { id: 'body', name: 'Body & schedule' },
  { id: 'image', name: 'Image & conduct' },
  { id: 'future', name: 'The future & getting out' },
];

const def = (id: ClauseId, name: string, group: ClauseGroup, none: string, short: [string, string, string], tiers: [string, string, string]): ClauseDef => ({ id, name, group, none, short, tiers });

export const CLAUSES: ClauseDef[] = [
  // --- Booking & the card ---
  def('exclusivity', 'Exclusivity', 'card', 'Non-exclusive: you can sign with other majors too (dates split between them). Indie dates and outside work are yours to take.',
    ['First Refusal', 'Major Exclusive', 'Total Exclusivity'],
    ['First Refusal: they can block another major’s deal, but blocking costs them (you’re compensated). Indies and outside work are free. They pay a little more for it.',
      'Major Exclusive: no other majors. Indie dates and outside work need their approval. They pay more for it.',
      'Total Exclusivity: no other majors, no indie dates, no outside work. They pay the most for it.']),
  def('creative', 'Creative Control', 'card', 'Not in the contract: the booker decides everything.',
    ['Consultation', 'Protected Booking', 'Full Creative Control'],
    ['Consultation: ask about finishes, opponents, card position, feuds and turns (either way: you can ask to lose). The odds depend on the booker’s patience.',
      'Protected Booking: as Consultation, plus about one veto a month that they can’t refuse.',
      'Full Creative Control: veto anything, and pitch your own storylines.']),
  def('booking', 'Booking Commitments', 'card', 'Not in the contract: you work when the booker wants you.',
    ['Regular', 'Featured', 'Headliner'],
    ['Regular: a couple of dates a month guaranteed, and never the opener.',
      'Featured: more dates, weekly TV included, and the upper half of the card.',
      'Headliner: the most dates, their big shows included, and a share of main events.']),
  def('title', 'Championship Opportunities', 'card', 'Not in the contract: title shots are the booker’s call.',
    ['Consideration', 'Contender Protection', 'Title Shot Guarantee'],
    ['Consideration: priority for title shots, and a rematch if you lose a title.',
      'Contender Protection: a title match within an agreed period, a rematch, and you can’t lose a new title too soon.',
      'Title Shot Guarantee: a title match before a deadline, a rematch, and longer reign protection.']),
  def('push', 'Push & Marketing', 'card', 'Not in the contract: no special push.',
    ['Featured', 'Marketed', 'Face of the Company'],
    ['Featured: a little more of the fans you win on their shows.', 'Marketed: more of them.', 'Face of the Company: a lot more of them.']),
  def('touring', 'International Touring', 'card', 'Not in the contract: you go on the tours they book you on.',
    ['Opt Out', 'Pick Your Tours', 'Headline Tours'],
    ['Opt Out: you can skip their tours.', 'Pick Your Tours: you only tour when you opt in.', 'Headline Tours: you pick, and you headline the tours you join (more fans abroad).']),
  // --- Money ---
  def('guaranteed', 'Guaranteed Pay', 'money', 'Not in the contract: no dates guaranteed, nothing if you’re pulled or let go early.',
    ['Partial Guarantee', 'Standard Guarantee', 'Premium Guarantee'],
    ['Partial Guarantee: paid in full if you’re pulled from a card, one paid date a month guaranteed, and a quarter of what’s left if they let you go early.',
      'Standard Guarantee: paid if pulled, two paid dates a month guaranteed, and half of what’s left if they let you go early.',
      'Premium Guarantee: paid if pulled, four paid dates a month guaranteed, an appearance bonus, and the whole of what’s left if they let you go early.']),
  def('wage', 'Wage Matching', 'money', 'Not in the contract: your fee is fixed.',
    ['Internal Parity', 'External Matching', 'Automatic Matching'],
    ['Internal Parity: pay reviews against comparable wrestlers here, and a small yearly raise.',
      'External Matching: they can match a verified rival offer, a bigger yearly raise, and raises after a title or a great year.',
      'Automatic Matching: higher rival offers raise your pay automatically, the biggest yearly raise, and never paid less than anyone below you on the card.']),
  def('bonuses', 'Performance Bonuses', 'money', 'Not in the contract: no bonuses.',
    ['One Trigger', 'Two Triggers', 'Four Triggers'],
    ['One Trigger: a bonus for one achievement you choose.', 'Two Triggers: bonuses for two you choose.', 'Four Triggers: bonuses for four you choose.']),
  def('merch', 'Merchandise Rights', 'money', 'Not in the contract: no share of your merch.',
    ['Standard', 'Enhanced', 'Ownership'],
    ['Standard: a small share of your merch, and a cut of their online store.',
      'Enhanced: a bigger share, a bigger online cut, and your own merch table at their shows.',
      'Ownership: you keep the majority, the biggest online cut, and your table at their shows.']),
  def('profit', 'Profit Share', 'money', 'Not in the contract: no share of the takings.',
    ['Flagship Cut', 'Big Show Cut', 'Every Show'],
    ['Flagship Cut: a cut of their flagship takings.', 'Big Show Cut: their flagships and specials.', 'Every Show: plus every show you’re on. Bigger promotions, bigger takings.']),
  def('signing', 'Signing Bonus & Advances', 'money', 'Not in the contract: no signing money, no advances.',
    ['Signing Bonus', 'Big Bonus', 'Star Bonus'],
    ['Signing Bonus: a lump sum when you sign, and advances against your fees when you’re skint (with interest).',
      'Big Bonus: a bigger lump sum, bigger advances, lower interest.',
      'Star Bonus: the biggest lump sum, the biggest advances, interest-free, and part may be written off.']),
  def('loyalty', 'Loyalty & Tenure', 'money', 'Not in the contract: years served count for nothing.',
    ['Service Bonus', 'Protected Veteran', 'Legend'],
    ['Service Bonus: a bonus for each year you’ve been with them.', 'Protected Veteran: a bigger bonus, and they can’t release you after a few years.', 'Legend: the biggest bonus, protection, and legend status after long service.']),
  // --- Body & schedule ---
  def('medical', 'Medical Pay', 'body', 'Not in the contract: you pay your own medical bills.',
    ['Basic', 'Protected', 'Comprehensive'],
    ['Basic: part of your medical bills covered, and a payout for a long injury.',
      'Protected: all bills, part of your earnings while injured, a bigger payout, and your job’s safe while you’re hurt.',
      'Comprehensive: all bills and earnings, the biggest payout, your job’s safe, and your spot (and any title shot) held for your return.']),
  def('training', 'Training & Development', 'body', 'Not in the contract: you pay for your own training.',
    ['Cheaper Training', 'Coaching', 'Performance Centre'],
    ['Cheaper Training: training costs less.', 'Coaching: free training, and a little extra from each session.', 'Performance Centre: free, extra gains, faster recovery and faster rehab.']),
  def('conditions', 'Match Conditions', 'body', 'Not in the contract: you wrestle whatever they book.',
    ['No Hardcore', 'Approve Stipulations', 'Full Protection'],
    ['No Hardcore: no hardcore matches without your say.', 'Approve Stipulations: you can turn down any stipulation.', 'Full Protection: as Tier 2, plus shorter, safer matches (no dangerous spots: less fatigue, fewer injuries).']),
  def('schedule', 'Schedule Flexibility', 'body', 'Not in the contract: you work the dates you’re given.',
    ['Limited', 'Protected', 'Flexible'],
    ['Limited: ask for occasional days off, and a holiday week a year.',
      'Protected: agreed days off, a monthly cap, two holiday weeks, and you can go part-time.',
      'Flexible: refuse dates outside your agreed schedule, four holiday weeks, and part-time whenever you like.']),
  def('travel', 'Travel & Accommodation', 'body', 'Not in the contract: you pay your own way to their dates.',
    ['Economy', 'Hotels & Per Diems', 'First Class'],
    ['Economy: they pay your travel.', 'Hotels & Per Diems: travel, hotels and a per diem; long trips tire you less.', 'First Class: the best of everything, long trips barely tire you, and moving house fully paid.']),
  // --- Image & conduct ---
  def('image', 'Character & Image Rights', 'image', 'Not in the contract: they own your name and gimmick. Leave and you rebrand (and lose fans); selling your own gear needs their say.',
    ['Shared', 'Licensed', 'Fully Yours'],
    ['Shared: you can use your image for social media and conventions; leaving still means a rebrand, but you keep more fans.',
      'Licensed: sponsors and your own merch too, and you keep your name when you leave.',
      'Fully Yours: your character is yours, anywhere, for anything.']),
  def('social', 'Social Media Policy', 'image', 'Not in the contract: their rules. Call-outs and beefs about their roster bring fines or lost patience.',
    ['Some Freedom', 'Free Rein', 'Free Rein & Amplified'],
    ['Some Freedom: smaller fines, and only for going after their top names.', 'Free Rein: post what you like.', 'Free Rein & Amplified: post what you like, and their channels boost you.']),
  def('conduct', 'Conduct & Discipline', 'image', 'Not in the contract: full fines for no-shows, going off-script and online beefs.',
    ['Lenient', 'Very Lenient', 'Untouchable'],
    ['Lenient: smaller fines.', 'Very Lenient: much smaller fines.', 'Untouchable: no fines. (Suspensions stay for the worst offences.)']),
  def('mentorship', 'Mentorship', 'image', 'Not in the contract: you find your own way.',
    ['Assigned Mentor', 'Star Mentor', 'Your Choice'],
    ['Assigned Mentor: they pair you with a veteran.', 'Star Mentor: a bigger name, and a little extra from your training.', 'Your Choice: pick your mentor, or as a veteran take protégés who boost your reputation.']),
  // --- The future & getting out ---
  def('renewal', 'Contract Renewal & Options', 'future', 'Not in the contract: they hold the option and can extend you a year on the same terms.',
    ['Mutual Option', 'Your Option', 'Full Control'],
    ['Mutual Option: either side can extend, and renewal talks start early.',
      'Your Option: only you can extend, early talks, and a guaranteed raise if you re-sign.',
      'Full Control: extend, renegotiate or walk as you choose; it renews itself with a raise unless you walk.']),
  def('exit', 'Contract Exit', 'future', 'Not in the contract: you can only ask for your release, and leaving early bars you from their rivals for a while.',
    ['Buyout', 'Notice Period', 'Open Exit'],
    ['Buyout: leave by paying an agreed release fee (a shorter non-compete).', 'Notice Period: leave after giving notice (a short non-compete).', 'Open Exit: leave any time, no penalty, no non-compete.']),
  def('retirement', 'Retirement & Legacy', 'future', 'Not in the contract: no farewell guaranteed.',
    ['Farewell Match', 'Send-off Show', 'Pension'],
    ['Farewell Match: a guaranteed farewell match.', 'Send-off Show: plus a show in your honour.', 'Pension: plus a pension when you hang up the boots.']),
];

export type ClauseId =
  | 'exclusivity' | 'creative' | 'booking' | 'title' | 'push' | 'touring'
  | 'guaranteed' | 'wage' | 'bonuses' | 'merch' | 'profit' | 'signing' | 'loyalty'
  | 'medical' | 'training' | 'conditions' | 'schedule' | 'travel'
  | 'image' | 'social' | 'conduct' | 'mentorship'
  | 'renewal' | 'exit' | 'retirement';

/** Each clause's place in a contract's `clauses` array. */
export const C = Object.fromEntries(CLAUSES.map((d, i) => [d.id, i])) as Record<ClauseId, number>;
export const NCLAUSES = CLAUSES.length;
export const NO_CLAUSES = (): number[] => CLAUSES.map(() => 0);

/** A clause's tier in a contract (0 when there's no contract). */
/** Whether a clause is in the game (Lyra's big cut hid some: CUT_CLAUSES). */
export const clauseOn = (id: string): boolean => !CUT_CLAUSES.includes(id);
/** A deal's tier of a clause (a cut clause is never in a contract). */
export const tierOf = (k: { clauses: number[] } | null | undefined, id: ClauseId): number => (clauseOn(id) ? k?.clauses[C[id]] ?? 0 : 0);

/** The ten clauses from before the overhaul, in their old order (for converting saves). */
export const OLD_CLAUSES = ['creative', 'indie', 'medical', 'guaranteed', 'wage', 'title', 'schedule', 'exit', 'merch', 'outside'] as const;

export type Attitude = 'resist' | 'neutral' | 'flexible';

/**
 * The old budget factors (average roster popularity ÷ TCG's). Promotions now carry a 0–100 popularity
 * that starts at 10 + 70 × this and moves; `budgetOf` reads that. Kept for converting older saves.
 */
export const BUDGET: Record<string, number> = {
  TCG: 1, VWF: 0.87, NWGP: 0.87, ZWA: 0.83, SLN: 0.78, IVW: 0.68, SSWC: 0.67, AAWA: 0.6, END: 0.6, UFC: 0.52, TIS: 0.4,
};

/** A major promotion's lowest weekly-show fee (Lyra's call: about £2,500 at the bottom), from its popularity. */
export const feeFloor = (promo: string): number => floorFor(getPromotion(promo)?.popularity);
export const floorFor = (popularity = MAJOR_FEE_FLOOR_AT): number =>
  Math.round(Math.max(MAJOR_FEE_MIN, MAJOR_FEE_FLOOR + (popularity - MAJOR_FEE_FLOOR_AT) * MAJOR_FEE_PER_POINT) / 5) * 5;

/** How much a promotion can spend, from its popularity: TCG at 80 is 1, UFC at 46 about 0.52. */
export function budgetOf(promo: string): number {
  const pop = getPromotion(promo)?.popularity;
  return pop === undefined ? BUDGET[promo] ?? 0.5 : (pop - 10) / 70;
}

/**
 * Each promotion's character across all 25 clauses (Lyra's call): what it gives easily and what it fights.
 * Exclusivity reads the other way round: a promotion that "resists" freedom is possessive, so it pays more
 * to own you and leans its deals that way; a "flexible" one is relaxed about sharing you.
 */
export interface Character { style: string; blurb: string; resist: ClauseId[]; flexible: ClauseId[] }
export const CHARACTER: Record<string, Character> = {
  TCG: { style: 'The big spender', blurb: 'Money’s no object. Control is.',
    resist: ['creative', 'image', 'exclusivity', 'exit'], flexible: ['wage', 'signing', 'travel', 'bonuses', 'push', 'profit'] },
  VWF: { style: 'Television first', blurb: 'The show is the star. They’ll pay to keep you healthy, not to let you run it.',
    resist: ['creative', 'exit', 'merch', 'image', 'conduct'], flexible: ['medical', 'guaranteed', 'push', 'social', 'travel'] },
  SLN: { style: 'The family company', blurb: 'Looks after its own for life, but the masks belong to the company.',
    resist: ['exit', 'image', 'profit'], flexible: ['exclusivity', 'creative', 'loyalty', 'mentorship', 'retirement', 'medical'] },
  END: { style: 'The upstart', blurb: 'Cash-poor and freedom-rich.',
    resist: ['guaranteed', 'signing', 'profit', 'travel'], flexible: ['creative', 'exclusivity', 'social', 'image', 'schedule'] },
  IVW: { style: 'The purists', blurb: 'Workrate above all. Wrestle how you like; don’t expect to be cosseted.',
    resist: ['medical', 'social', 'merch', 'push'], flexible: ['creative', 'schedule', 'conditions', 'training'] },
  NWGP: { style: 'Tradition and hierarchy', blurb: 'Earn your place, and they’ll look after you for life. Don’t expect to work anywhere else.',
    resist: ['exclusivity', 'schedule', 'creative', 'social', 'conduct'], flexible: ['medical', 'title', 'training', 'mentorship', 'loyalty', 'retirement'] },
  ZWA: { style: 'Corporate and image-conscious', blurb: 'Generous with the schedule, strict with the brand.',
    resist: ['merch', 'image', 'social', 'conduct'], flexible: ['schedule', 'touring', 'push', 'travel'] },
  UFC: { style: 'Small and scrappy', blurb: 'Can’t pay much, won’t tie you down.',
    resist: ['guaranteed', 'medical', 'signing', 'travel'], flexible: ['creative', 'exclusivity', 'schedule', 'image', 'touring'] },
  SSWC: { style: 'The party promotion', blurb: 'The crowd decides. Big bonuses, no pay rises.',
    resist: ['wage', 'exit', 'conduct'], flexible: ['social', 'exclusivity', 'merch', 'bonuses', 'push'] },
  AAWA: { style: 'The artists’ collective', blurb: 'Your character is yours. Your contract is theirs.',
    resist: ['exit', 'profit', 'signing'], flexible: ['creative', 'merch', 'image', 'mentorship'] },
};

export function attitude(promo: string, clause: number | ClauseId): Attitude {
  const id = typeof clause === 'number' ? CLAUSES[clause]?.id : clause;
  const ch = CHARACTER[promo];
  if (!ch || !id) return 'neutral';
  return ch.resist.includes(id) ? 'resist' : ch.flexible.includes(id) ? 'flexible' : 'neutral';
}

/** Rounds they'll negotiate before walking: richer promotions are less patient. */
export const patience = (promo: string): number => (budgetOf(promo) >= 0.8 ? 3 : budgetOf(promo) >= 0.65 ? 4 : 5);

// --- Packages ------------------------------------------------------------------------------------

/** The deals promotions open with (Lyra's call), plus the plain one the AI's mid-card gets. */
export type PackageId = 'star' | 'developmental' | 'parttime' | 'attraction' | 'standard';
export interface PackageDef { id: PackageId; name: string; blurb: string; tiers: Partial<Record<ClauseId, number>>; months: number; dates?: number }
export const PACKAGES: Record<PackageId, PackageDef> = {
  star: { id: 'star', name: 'Star deal', blurb: 'Big money, exclusive, Creative Control, a push and bonuses. They ask a lot back.', months: 24,
    tiers: { exclusivity: 3, creative: 2, booking: 2, title: 1, push: 2, guaranteed: 2, wage: 1, bonuses: 2, merch: 2, signing: 2, medical: 2, travel: 2, image: 1, social: 1, conduct: 1, renewal: 1, retirement: 1 } },
  developmental: { id: 'developmental', name: 'Developmental deal', blurb: 'Low money, coaching and a mentor, and a long option for them.', months: 24,
    tiers: { exclusivity: 3, training: 2, mentorship: 2, medical: 1, travel: 1, guaranteed: 1 } },
  parttime: { id: 'parttime', name: 'Part-timer / legend', blurb: 'A few dates a month at a high fee, with the schedule and your body protected.', months: 12, dates: 4,
    tiers: { exclusivity: 1, schedule: 3, conditions: 2, guaranteed: 2, medical: 2, travel: 2, creative: 1, booking: 1, touring: 2, retirement: 2, image: 2 } },
  attraction: { id: 'attraction', name: 'Special attraction', blurb: 'Non-exclusive: a few agreed dates, big-show appearances, top billing.', months: 12, dates: 4,
    tiers: { exclusivity: 0, booking: 3, push: 1, guaranteed: 2, travel: 2, image: 2, creative: 1, touring: 1, profit: 1 } },
  standard: { id: 'standard', name: 'Standard deal', blurb: 'The usual: exclusive to them, travel paid, not much else.', months: 12,
    tiers: { exclusivity: 2, travel: 1 } },
};
export const PLAYER_PACKAGES: PackageId[] = ['star', 'developmental', 'parttime', 'attraction'];

/**
 * A package's clauses at a promotion: its character trims what it fights (a tier down) and sweetens what
 * it gives easily (a tier up, where the package has it). Exclusivity goes the other way: a possessive
 * promotion pushes it up; a relaxed one lets it down (but never off a non-exclusive deal's 0).
 */
export function packageClauses(promo: string, pkg: PackageId): number[] {
  const out = NO_CLAUSES();
  for (const [id, t] of Object.entries(PACKAGES[pkg].tiers) as [ClauseId, number][]) {
    const a = attitude(promo, id);
    let tier = t;
    if (id === 'exclusivity') tier = pkg === 'attraction' ? 0 : a === 'resist' ? Math.min(3, t + 1) : a === 'flexible' ? Math.max(1, t - 1) : t;
    else tier = a === 'resist' ? t - 1 : a === 'flexible' ? Math.min(3, t + 1) : t;
    out[C[id]] = Math.max(0, Math.min(3, tier));
  }
  return out;
}

/**
 * Which package an AI wrestler gets (Lyra's call: by package, then tweaked): the top of the roster gets star
 * deals (a few of them special-attraction, non-exclusive ones), the young and unproven developmental ones,
 * veterans part-timer deals, everyone else the standard deal.
 */
export function aiPackage(rnd: Rng, w: Wrestler, rank: number): PackageId {
  const R = PACKAGE_RULES;
  if (w.age >= R.veteranAge && rank < R.veteranTop) return 'parttime';
  if (rank < R.starTop) return rnd() < R.attractionShare ? 'attraction' : 'star';
  if (w.age <= R.youngAge && rank >= R.youngBelow) return 'developmental';
  return 'standard';
}

/** Where someone ranks on a roster, 0 the biggest name, near 1 the smallest. */
export const rosterRank = (w: Wrestler, roster: readonly Wrestler[]): number =>
  roster.filter((x) => x.id !== w.id && globalScore(x) > globalScore(w)).length / Math.max(1, roster.length);

/** An AI wrestler's clauses: their package at this promotion, then a tweak or two. */
export function aiClauses(rnd: Rng, promo: string, pkg: PackageId): number[] {
  const out = packageClauses(promo, pkg);
  // A tweak: one clause up or down a tier (never touching exclusivity, which the package settles).
  const i = Math.floor(rnd() * out.length);
  if (i !== C.exclusivity) out[i] = Math.max(0, Math.min(3, out[i]! + (rnd() < 0.5 ? -1 : 1)));
  return out;
}

/** Performance Bonuses: the achievements a deal can pay for (you pick; the tier sets how many). */
export type BonusTrigger = 'title' | 'defence' | 'great' | 'main' | 'big' | 'streak' | 'win' | 'draw';
export const BONUS_TRIGGERS: { id: BonusTrigger; name: string; text: string }[] = [
  { id: 'title', name: 'Winning a title', text: 'Win any of their titles.' },
  { id: 'defence', name: 'Title defences', text: 'Retain one of their titles.' },
  { id: 'great', name: 'Great matches', text: 'A 4★ match or better on their show (5★ pays two and a half times).' },
  { id: 'main', name: 'Main events', text: 'Close one of their shows.' },
  { id: 'big', name: 'Big shows', text: 'Wrestle on one of their specials or flagships.' },
  { id: 'streak', name: 'Win streaks', text: 'Five wins in a row on their shows.' },
  { id: 'win', name: 'Winning', text: 'Any win on their shows (this is where a loss costs you).' },
  { id: 'draw', name: 'Drawing a crowd', text: 'Headline one of their shows that does well over its usual takings.' },
];
export const triggerSlots = (tier: number): number => [0, 1, 2, 4][Math.max(0, Math.min(3, tier))]!;
