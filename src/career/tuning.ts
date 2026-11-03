// Every number career mode runs on, in one place. These are the values proposed on the canvas
// "Career balance sheet" and are NOT approved yet: change them here and nowhere else.
import type { ShowKind } from './types';

// --- Money (£) ---------------------------------------------------------------------------------
/** Contracted fee = (base + perPop × regional popularity) × promotion budget × show type. */
export const FEE_BASE = 100;
export const FEE_PER_POP = 30;
export const SHOW_MULT: Record<ShowKind, number> = { weekly: 1, tour: 0.8, special: 1.5, flagship: 2.5, indie: 1 };
/** Indie fee = base + perPop × popularity in the show's region. */
export const INDIE_BASE = 30;
export const INDIE_PER_POP = 8;
/** Share of the fee lost for losing (Guaranteed Pay tiers below change it). */
export const LOSS_CUT = 0.25;
/** Travel to an indie show: same country, same region, different region. */
export const TRAVEL = { country: 0, region: 60, abroad: 250 };
/** Picked wrestler's savings = this × global popularity. Created wrestlers start with START_MONEY_CREATED. */
export const START_MONEY_PER_POP = 100;
export const START_MONEY_CREATED = 500;
/** Monthly merch gross: popularity² × this (signed) or × the indie rate (free agents keep all of it). */
export const MERCH_SIGNED = 2;
export const MERCH_INDIE = 0.6;

// --- Training (Elden Ring curve) ----------------------------------------------------------------
/** Level = attribute total − offset; price = Elden Ring's rune cost for that level ÷ divisor. */
export const TRAIN_LEVEL_OFFSET = 300;
export const TRAIN_DIVISOR = 100;
export const ATTRIBUTE_CAP = 100;

// --- Fatigue and injuries ----------------------------------------------------------------------
export const FATIGUE_PER_MATCH = 15;
export const FATIGUE_HARDCORE_EXTRA = 5;
export const FATIGUE_RECOVERY_PER_DAY = 12;
/** Start stamina × (1 − fatigue ÷ this). */
export const FATIGUE_STAMINA_DIVISOR = 250;
/** Injury chance per match = base + fatigue ÷ perFatigue (as %), × hardcore multiplier. */
export const INJURY_BASE_PCT = 2;
export const INJURY_PER_FATIGUE = 25;
export const INJURY_HARDCORE_MULT = 1.5;
export const INJURY_SEVERITY: { share: number; days: [number, number]; label: string }[] = [
  { share: 0.6, days: [3, 7], label: 'minor' },
  { share: 0.3, days: [8, 21], label: 'moderate' },
  { share: 0.1, days: [22, 60], label: 'serious' },
];
export const MEDICAL_PER_DAY = 100;

// --- Popularity and reputation -----------------------------------------------------------------
export const POP_PER_STAR = 1.2;
export const POP_STAR_PIVOT = 2.5;
export const POP_WIN = 0.8;
export const POP_LOSS = -0.3;
/** Gains shrink near the top: × (1 − popularity ÷ this). */
export const POP_CEILING = 120;
export const POP_TITLE_WIN = 3;
export const POP_GLOBAL_SHARE = 0.25;
export const POP_IDLE_DAYS = 30;
export const POP_IDLE_DECAY = 1;
export const REP_START = 50;
export const REP_FOUR_STAR = 1;
export const REP_PER_DATE = 0.25;
export const REP_OFF_SCRIPT = -8;
export const REP_NO_SHOW = -10;
export const REP_ASK_RELEASE = -3;
export const REP_RELEASED = -5;

// --- Indie bookings and getting signed ----------------------------------------------------------
export const INDIE_OFFERS_BASE = 1;
export const INDIE_OFFERS_PER_POP = 15;
export const INDIE_OFFER_WINDOW_DAYS = 14;
export const ASK_SPOT_BASE_PCT = 40;
export const ASK_SPOT_MAX_PCT = 95;
export const NOTICE_CHANCE = 0.3;
export const TRYOUT_MIN_STARS = 3;

// --- Booking -----------------------------------------------------------------------------------
export const CARD_SIZE: Record<ShowKind, [number, number]> = { indie: [4, 6], weekly: [5, 6], tour: [5, 5], special: [7, 7], flagship: [8, 10] };
export const STIP_CHANCE: Record<ShowKind, number> = { indie: 0.12, weekly: 0.08, tour: 0.08, special: 0.2, flagship: 0.35 };
export const INTERGENDER_CHANCE = 0.05;
export const INTERGENDER_CHANCE_INDIE = 0.1;
export const DEFENCE_GAP_DAYS = 14;
export const DEFENCE_CHANCE: Record<ShowKind, number> = { weekly: 0.25, tour: 0.2, special: 0.7, flagship: 1, indie: 0.3 };
export const FEUD_WEEKS: [number, number] = [3, 6];
export const FEUDS_PER_PROMOTION = 2;
/** Planned finish: the champion is booked to retain this often. */
export const PLANNED_RETAIN = 0.65;
/** AI title matches: the planned winner's edge on contested rolls. */
export const PLANNED_NUDGE = 2;
/**
 * AI title matches that go against the plan are re-run up to this many times (each a fresh match),
 * so the plan usually holds (~90% at 2) but upsets still happen. The nudge alone only reached ~60%.
 */
export const PLANNED_RETRIES = 2;
export const OFF_SCRIPT_TITLE_BAN_DAYS = 60;
/** Cards are drawn up this many days ahead so you can see them on the calendar. */
export const BOOK_AHEAD_DAYS = 7;
/** When a special lands on a weekly show's day, the special replaces it (one show that night). */
export const SPECIAL_REPLACES_WEEKLY = true;

// --- Contracts and the AI world ----------------------------------------------------------------
export const CONTRACT_MONTHS = [6, 12, 18, 24];
export const START_CONTRACT_MONTHS_LEFT: [number, number] = [3, 18];
export const RENEW_CHANCE_TOP = 0.7;
export const RENEW_CHANCE_REST = 0.4;
export const RELEASE_MONTHLY_BOTTOM = 0.01;
export const ROSTER_MIN = 32;
export const ROSTER_MAX = 40;
export const ROSTER_SIGN_BELOW = 34;
/** On expiry and not renewed: chance another promotion signs them straight away. */
export const POACH_CHANCE = 0.5;
export const ROOKIE_EVERY_DAYS = 21;

// --- Clauses -----------------------------------------------------------------------------------
/** Cost of each tier to the promotion, as a share of the fee. Order matches CLAUSES. */
export const CLAUSE_COST: [number, number, number][] = [
  [0.05, 0.12, 0.25], [0.02, 0.05, 0.1], [0.03, 0.07, 0.12], [0.04, 0.1, 0.18], [0.03, 0.08, 0.15],
  [0.05, 0.12, 0.22], [0.03, 0.07, 0.12], [0.04, 0.1, 0.2], [0.03, 0.08, 0.15], [0.01, 0.03, 0.06],
];
export const ATTITUDE_MULT = { resist: 1.6, neutral: 1, flexible: 0.6 };
export const CREATIVE_T1_CHANGE = 0.5;
export const CREATIVE_T2_COOLDOWN_DAYS = 90;
export const INDIE_T1_APPROVAL = 0.6;
export const MEDICAL_BILL_COVER = [0, 0.5, 1, 1];
export const MEDICAL_PAY_COVER = [0, 0, 0.5, 1];
export const LOSS_CUT_BY_TIER = [LOSS_CUT, 0.1, 0, 0];
export const APPEARANCE_BONUS_T3 = 0.1;
export const WAGE_REVIEW_MONTHS = 6;
export const WAGE_REVIEW_POP_BAND = 5;
export const WAGE_MATCH_T2_MAX = 1.25;
export const CONTENDER_T1_BONUS = 10;
export const TITLE_SHOT_DAYS = [0, 0, 120, 60];
export const TITLE_SHOT_BREACH_FEES = [0, 0, 4, 8];
export const DAY_OFF_T1_CHANCE = 0.7;
export const SCHEDULE_T2_MAX_PER_MONTH = 10;
export const RELEASE_GRANT_BELOW_MEDIAN = 0.7;
export const RELEASE_GRANT_ABOVE_MEDIAN = 0.25;
export const BUYOUT_SHARE = 0.5;
export const NOTICE_DAYS = 30;
export const MERCH_SHARE = [0, 0.1, 0.25, 0.6];

// --- Negotiation -------------------------------------------------------------------------------
export const NEGO_REGION_WEIGHT = 0.7;
export const NEGO_REP_SWING = 0.1;
export const NEGO_FORM_SWING = 0.1;
export const NEGO_RIVAL_LIFT = 1.05;
export const NEGO_ACCEPT = 1.15;
export const NEGO_COUNTER = 1.3;
export const NEGO_GATE_REP_T3 = 60;
export const NEGO_GATE_POP_RESIST_T2 = 35;
export const NEGO_GATE_POP_RESIST_T3 = 50;
