// Every number career mode runs on, in one place. These are the values proposed on the canvas
// "Career balance sheet" and are NOT approved yet: change them here and nowhere else.
import type { PopRegion, ShowKind } from './types';
import type { ClauseId } from './clauses';

// --- Money (£) ---------------------------------------------------------------------------------
/** A contracted match pays the weekly-show fee (section 16: MAJOR_FEE_*) × the size of the show. */
export const SHOW_MULT: Record<ShowKind, number> = { weekly: 1, tour: 0.8, special: 1.5, flagship: 2.5, indie: 1 };
/** Share of the fee lost for losing (Guaranteed Pay tiers below change it). */
export const LOSS_CUT = 0.25;
/** Travel to an indie show: same country, same region, different region. */
export const TRAVEL = { country: 0, region: 60, abroad: 250 };
/** A created wrestler's savings (someone you pick: START_MONEY_BASE in section 16). */
export const START_MONEY_CREATED = 500;

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

// --- Fans (section 16: FAN_*) and reputation ---------------------------------------------------
/** No match for this long and fans start drifting away (FAN_IDLE_LOSS a month). */
export const POP_IDLE_DAYS = 30;
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
/** No title is defended within this many days of its last defence (or the reign starting). */
export const DEFENCE_GAP_DAYS = 30;
/** Once a title's due, the chance it's defended on a given show (on top of title feuds paying off). */
export const DEFENCE_CHANCE: Record<ShowKind, number> = { weekly: 0.06, tour: 0.05, special: 0.3, flagship: 0.5, indie: 0.12 };
/** Title feuds are timed so the defence lands roughly this long after the last one (Lyra: about every two months). */
export const TITLE_DEFENCE_EVERY_DAYS = 60;
export const FEUD_WEEKS: [number, number] = [3, 6];
export const FEUDS_PER_PROMOTION = 2;
/** Planned finish: the champion is booked to retain this often. */
export const PLANNED_RETAIN = 0.75;
/** AI title matches: the planned winner's edge on contested rolls. */
export const PLANNED_NUDGE = 2;
/**
 * AI title matches that go against the plan are re-run up to this many times (each a fresh match),
 * so the plan usually holds (~90% at 2) but upsets still happen. The nudge alone only reached ~60%.
 */
export const PLANNED_RETRIES = 3;
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
/**
 * Rosters (Lyra's call): every major promotion aims for 38–40. Lose someone and they scout a
 * replacement, signed after this many days; below the floor they sign straight away. Nobody signs or
 * poaches past the target (your own signing can take a roster to 41).
 */
export const ROSTER_TARGET = 40;
export const ROSTER_FLOOR = 38;
export const ROSTER_SCOUT_DAYS: [number, number] = [7, 21];
/** On expiry and not renewed: chance another promotion signs them straight away. */
export const POACH_CHANCE = 0.5;
export const ROOKIE_EVERY_DAYS = 21;

// --- Clauses (the 25-clause overhaul: Lyra's design; these numbers are proposals, to approve) -----
/**
 * What each tier costs a promotion, as a share of the fee it would otherwise pay (scaled down from the
 * ten-clause days so a full package still leaves a fee). Exclusivity is priced the other way: EXCL_COST.
 */
export const CLAUSE_COST: Record<ClauseId, [number, number, number]> = {
  exclusivity: [0, 0, 0],
  creative: [0.025, 0.06, 0.125], booking: [0.015, 0.035, 0.06], title: [0.025, 0.06, 0.11], push: [0.015, 0.035, 0.06], touring: [0.005, 0.015, 0.03],
  guaranteed: [0.02, 0.05, 0.09], wage: [0.015, 0.04, 0.075], bonuses: [0.01, 0.025, 0.05], merch: [0.015, 0.04, 0.075], profit: [0.02, 0.04, 0.07], signing: [0.015, 0.03, 0.05], loyalty: [0.01, 0.02, 0.035],
  medical: [0.015, 0.035, 0.06], training: [0.01, 0.02, 0.035], conditions: [0.01, 0.02, 0.035], schedule: [0.015, 0.035, 0.06], travel: [0.01, 0.025, 0.045],
  image: [0.015, 0.035, 0.06], social: [0.005, 0.01, 0.02], conduct: [0.005, 0.015, 0.025], mentorship: [0.005, 0.01, 0.02],
  renewal: [0.01, 0.025, 0.045], exit: [0.02, 0.05, 0.1], retirement: [0.005, 0.015, 0.03],
};
export const ATTITUDE_MULT = { resist: 1.6, neutral: 1, flexible: 0.6 };
/**
 * Exclusivity (Lyra's call: tiers are them buying exclusivity, paid as a fee premium): what each tier costs
 * them against Major Exclusive (Tier 2), as a share of the fee. Non-exclusive costs them most, so it pays
 * least a date; Total Exclusivity pays you a premium. A possessive promotion (resists freedom) feels it more.
 */
export const EXCL_COST = [0.15, 0.08, 0, -0.12];
export const EXCL_ATTITUDE = { resist: 1.4, neutral: 1, flexible: 0.6 };
/** Working for several majors: at most this many at once; the dates a month split between them when you sign another, and the new deal's share by default. */
export const MAX_MAJORS = 3;
export const SPLIT_DATES_TOTAL = 12;
export const SPLIT_DEFAULT_NEW = 4;
/** An AI star on two majors: the dates a month the second promotion gets. */
export const AI_SECOND_DATES = 4;
/** First Refusal: the chance they block another major's deal (higher when it's a rival in their own region); blocking pays you this many weekly fees and their booker's patience moves your way. */
export const FIRST_REFUSAL_BLOCK = { base: 0.35, sameRegion: 0.3 };
export const FIRST_REFUSAL_COMP_FEES = 4;
export const FIRST_REFUSAL_PATIENCE = 10;
/** Major Exclusive (Tier 2): indie dates and outside work need approval, more likely the more patient their booker. */
export const EXCL_APPROVAL = { base: 0.3, perPatience: 0.006 };
/** AI: each month, the chance a promotion with room signs a non-exclusive star from another major as a second deal. */
export const AI_SECOND_DEAL_CHANCE = 0.12;
/** Agreed dates a month by package (part-timers, special attractions); a deal without them is the booker's call. Fewer dates lift the fee a date. */
export const DATES_FEE_LIFT = 0.05;
export const DATES_FULL = 10;
/** AI deals by package (Lyra's call): stars are the top 15% of a roster (a fifth of them special attractions), veterans 38+ in the top 60% go part-time, the young (23 and under) below halfway developmental. */
export const PACKAGE_RULES = { starTop: 0.15, attractionShare: 0.2, veteranAge: 38, veteranTop: 0.6, youngAge: 23, youngBelow: 0.5 };

// Creative Control (Lyra's call: ask, then about a veto a month, then everything; using it costs nothing).
export const CREATIVE = { askBase: 0.2, askPerPatience: 0.006, vetoDays: 30 };
export const CREATIVE_T1_CHANGE = 0.5;
export const CREATIVE_T2_COOLDOWN_DAYS = 30;
// Booking Commitments: dates a month guaranteed by tier; Tier 3 adds their big shows and a share of main events. Short months are paid anyway; this many breaches and you can walk.
export const COMMIT_DATES = [0, 2, 4, 6];
export const COMMIT_MAIN_SHARE = 0.33;
export const COMMIT_BREACH_WALK = 3;
// Championship Opportunities: a rematch within this many days of losing a title (Tier 1+); a new champion can't lose it for this long (by tier).
export const REMATCH_DAYS = 60;
export const REIGN_PROTECT_DAYS = [0, 0, 30, 60];
// Push & Marketing: fans won on their shows × this.
export const PUSH_MULT = [1, 1.15, 1.3, 1.5];
// International Touring: headlining a tour (Tier 3) wins this many times the fans.
export const TOUR_HEADLINE_FANS = 1.5;
// Guaranteed Pay: paid this share of the fee when pulled from a card; a month's minimum, in weekly fees.
export const MEDICAL_BILL_COVER = [0, 0.5, 1, 1];
export const MEDICAL_PAY_COVER = [0, 0, 0.5, 1];
export const LOSS_CUT_BY_TIER = [LOSS_CUT, 0.1, 0, 0];
export const APPEARANCE_BONUS_T3 = 0.1;
export const PULLED_PAY = [0, 0.5, 1, 1];
export const MONTHLY_MIN_FEES = [0, 0, 2, 4];
// Wage Matching: reviews, matching, a raise on each anniversary, a raise after a title win or a great year (Tier 2+), and parity with anyone below you (Tier 3).
export const WAGE_REVIEW_MONTHS = 6;
export const WAGE_REVIEW_POP_BAND = 5;
export const WAGE_MATCH_T2_MAX = 1.25;
export const YEARLY_RAISE = [0, 0.02, 0.04, 0.06];
export const PERF_RAISE = 0.05;
export const PERF_RAISE_STARS = 3.5;
// Performance Bonuses: each trigger pays this many weekly fees.
export const BONUS_FEES = { title: 5, defence: 1, great: 1, main: 0.5, big: 0.5, streak: 2 };
// Merchandise Rights: your share of their merch; a cut of their online store (fans × rate a month × share); your own table at their shows from Tier 2.
export const MERCH_SHARE = [0, 0.1, 0.25, 0.6];
export const MERCH_STORE_PER_FAN = 0.003;
export const STORE_CUT = [0, 0.1, 0.2, 0.35];
// Profit Share: a show's takings by kind, × (their popularity ÷ 50)², and your cut by tier.
export const TAKINGS = { weekly: 40000, tour: 25000, special: 150000, flagship: 400000, indie: 0 };
export const PROFIT_SHARE = [0, 0.004, 0.006, 0.008];
// Signing Bonus & Advances: weekly fees paid on signing; the most you can borrow (in weekly fees), the interest, the share of each fee that pays it back, and Tier 3's write-off when the deal ends.
export const SIGNING_BONUS_FEES = [0, 2, 5, 10];
export const ADVANCE_FEES = [0, 2, 4, 8];
export const ADVANCE_INTEREST = [0, 0.15, 0.08, 0];
export const ADVANCE_REPAY_SHARE = 0.5;
export const ADVANCE_WRITE_OFF_T3 = 0.25;
// Loyalty & Tenure: each anniversary pays this many weekly fees × years served (up to five); protected from release after three years (Tier 2+); a legend after five (Tier 3).
export const LOYALTY_FEES = [0, 0.5, 1, 1.5];
export const LOYALTY_PROTECT_YEARS = 3;
export const LEGEND_YEARS = 5;
export const LEGEND_REP = 10;
// Medical Pay: a long injury (this many days or more) pays out this many weekly fees.
export const LONG_INJURY_DAYS = 21;
export const LONG_INJURY_FEES = [0, 2, 4, 8];
// Training & Development: the price of training × this; extra from each session; Tier 3's faster recovery and rehab.
export const TRAIN_PRICE_MULT = [1, 0.75, 0, 0];
export const TRAIN_GAIN_BONUS = [0, 0, 0.15, 0.3];
export const CENTRE_RECOVERY = 1.25;
export const CENTRE_REHAB = 0.75;
// Match Conditions Tier 3: safer, shorter matches.
export const CONDITIONS_T3 = { injury: 0.5, fatigue: 0.75 };
// Schedule Flexibility: holiday weeks a year; part-time (Tier 2+) means this many dates a month.
export const DAY_OFF_T1_CHANCE = 0.7;
export const SCHEDULE_T2_MAX_PER_MONTH = 10;
export const HOLIDAY_WEEKS = [0, 1, 2, 4];
export const PARTTIME_DATES = 4;
// Travel & Accommodation (Lyra's call: long trips tire you): fatigue for a trip by distance, × this by tier; a per diem on away dates (Tier 2+); the share of a move they pay.
export const TRAVEL_FATIGUE = { country: 0, region: 4, abroad: 10 };
export const TRAVEL_FATIGUE_CUT = [1, 1, 0.6, 0.3];
export const PER_DIEM = [0, 0, 50, 75];
export const RELOCATION_PAID = [0, 0.75, 0.75, 1];
// Character & Image Rights (Lyra's call: leave without them and you rebrand): the share of fans who don't follow the new name, rising with years there; Tier 1 halves it.
export const REBRAND_LOSS = { base: 0.1, perYear: 0.03, max: 0.4 };
// Social Media Policy: a call-out or beef about their roster costs this many weekly fees (and patience at None); Tier 3's channels boost your reach.
export const SOCIAL_FINE_FEES = [1, 0.5, 0, 0];
export const SOCIAL_FINE_PATIENCE = -5;
export const SOCIAL_AMPLIFY = 1.5;
// Conduct & Discipline (Lyra's call: fines, not suspensions): fines in weekly fees, × this by tier; three no-shows in 90 days is a suspension whatever the tier.
export const CONDUCT_FINES = { noShow: 2, offScript: 1, beef: 0.5 };
export const CONDUCT_MULT = [1, 0.6, 0.3, 0];
export const SUSPENSION = { noShows: 3, windowDays: 90, days: 14 };
// Mentorship: extra from training (Tier 2+); a veteran's protégés (Tier 3) add reputation each month.
export const MENTOR_TRAIN_BONUS = [0, 0, 0.1, 0.1];
export const PROTEGE_AGE = 32;
export const PROTEGE_REP = 1;
export const PROTEGES_MAX = 2;
// Contract Renewal & Options: an option year; when renewal talks open (days before the end), the raise for re-signing (Tier 2+), and the chance they take up their option (None).
export const OPTION_MONTHS = 12;
export const RENEWAL_TALKS_DAYS = [90, 183, 183, 183];
export const RENEWAL_RAISE = [0, 0, 0.1, 0.15];
export const OPTION_TAKE_CHANCE = 0.5;
// Contract Exit: leaving early bars you from their region's other majors for this many days, by tier.
export const NONCOMPETE_DAYS = [180, 120, 60, 0];
export const RELEASE_GRANT_BELOW_MEDIAN = 0.7;
export const RELEASE_GRANT_ABOVE_MEDIAN = 0.25;
export const BUYOUT_SHARE = 0.5;
export const NOTICE_DAYS = 30;
// Retirement & Legacy: Tier 2's send-off show pays this many weekly fees; Tier 3 adds a pension pot of this many when you retire.
export const SENDOFF_FEES = 3;
export const PENSION_FEES = 26;
/** Announcing your retirement without the clause: your last day is this far off. */
export const RETIRE_NOTICE_DAYS = 30;
// Championship Opportunities (kept): the contender bonus and the title-shot clock.
export const CONTENDER_T1_BONUS = 10;
export const TITLE_SHOT_DAYS = [0, 0, 120, 60];
export const TITLE_SHOT_BREACH_FEES = [0, 0, 4, 8];

// --- Negotiation -------------------------------------------------------------------------------
export const NEGO_REP_SWING = 0.1;
export const NEGO_FORM_SWING = 0.1;
export const NEGO_RIVAL_LIFT = 1.05;
export const NEGO_ACCEPT = 1.15;
export const NEGO_COUNTER = 1.3;
/** Walking away from the table costs this much of their booker's patience, unless their offer's under one of your walk-away lines (Lyra's call). */
export const NEGO_WALK_PATIENCE = -5;

// --- Requests (balance sheet section 13, approved) ---------------------------------------------
/** Booker patience: 0–100, one meter per promotion's booker and per indie promoter. */
export const PATIENCE_START = 70;
export const PATIENCE_DECLINE_COUNTER = -10;
export const PATIENCE_NAG = -8;
export const REP_NAG = -1;
export const PATIENCE_OFF_SCRIPT = -15;
export const PATIENCE_NO_SHOW = -20;
export const PATIENCE_CAUGHT = -20;
/** Time: this much a week, but time alone never takes it above PATIENCE_START. */
export const PATIENCE_PER_WEEK = 2;
export const PATIENCE_GOOD_MATCH = 2;
export const PATIENCE_GOOD_MATCH_STARS = 4;
export const PATIENCE_FOLLOWED_PLAN = 3;
export const PATIENCE_TOOK_COUNTER = 5;
/** Below this they won't hear any request. */
export const PATIENCE_FLOOR = 25;
/** Every answer: roll under the yes chance → yes; in the next band → a counter; otherwise no. */
export const ASK_COUNTER_BAND = 25;
/** Shared factors, in points of yes chance: (rep − 50) ÷ 2, ±3 per win/loss in the last five, (patience − 70) ÷ 2. */
export const ASK_REP_DIVISOR = 2;
export const ASK_FORM_PER_RESULT = 3;
export const ASK_PATIENCE_DIVISOR = 2;
/** Cooldowns in days (soft: asking inside one is nagging). Be on a show and indie spots are once per show. */
export const COOLDOWN_TITLE = 30;
export const COOLDOWN_CHALLENGE = 14;
export const COOLDOWN_MORE = 30;
export const COOLDOWN_PROMOTION = 60;
/** Title shot: yes chance by contender rank (#1, #2, #3, #4, #5); #6 or lower is a no. */
export const TITLE_ASK_BY_RANK = [60, 40, 25, 10, 10];
/** Championship Opportunities tier: extra yes chance. */
export const TITLE_ASK_CLAUSE = [0, 10, 15, 20];
/** Challenges (your promotion). */
export const CHALLENGE_BASE = 50;
export const CHALLENGE_PER_POP_ABOVE = 2;
export const CHALLENGE_CHAMPION = -25;
export const CHALLENGE_IN_FEUD = -30;
/** Challenges on indie shows: the opponent's side. */
export const INDIE_CH_ALLOWED = 60;
export const INDIE_CH_PROMOTION = 25;
/** Be on a show: + the booker's usual chance; big shows are harder. */
export const SHOW_ASK_BONUS = 10;
export const SHOW_ASK_SPECIAL = -20;
export const SHOW_ASK_FLAGSHIP = -30;
/** More matches: a yes promises at least this many dates next month; each one short pays your weekly fee. */
export const MORE_BASE = 40;
export const MORE_MIN_DATES = 4;
/** Approaching another promotion while signed: chance your promotion hears (higher in its own region), and for how long it costs you. */
export const CAUGHT_CHANCE = 0.25;
export const CAUGHT_CHANCE_SAME_REGION = 0.4;
export const CAUGHT_DAYS = 30;
export const CAUGHT_BOOK_MULT = 0.5;

// --- Championship rhythm and stability (expansion, balance sheet section 14: PROPOSALS, live) -------
// Defence frequency and how often titles change hands are separate dials now. The old single rule
// (no defence within 30 days, a flat 75% planned retain) is kept above for reference.
export type TitleClass = 'world' | 'secondary' | 'indie' | 'regional' | 'alliance';
/** minGap: never defended sooner than this after the last defence or the reign starting. target: the usual gap. */
export const TITLE_RHYTHM: Record<TitleClass, { minGap: number; target: number }> = {
  world: { minGap: 21, target: 35 }, secondary: { minGap: 21, target: 35 }, indie: { minGap: 21, target: 35 }, regional: { minGap: 21, target: 42 }, alliance: { minGap: 30, target: 60 },
};
/** The chance the booker plans the champion to lose a given defence, by class... */
export const TITLE_PLANNED_CHANGE: Record<TitleClass, number> = { world: 0.08, secondary: 0.1, indie: 0.12, regional: 0.15, alliance: 0.15 };
/** ...rising this much per year of the reign (long reigns get likelier to end), up to TITLE_CHANGE_MAX. */
export const TITLE_CHANGE_PER_REIGN_YEAR = 0.08;
export const TITLE_CHANGE_MAX = 0.35;
/** Indie titles: once past the minimum gap, the chance an indie champion on a show defends there (overdue: higher). */
export const INDIE_DEFENCE_CHANCE = 0.2;
export const INDIE_DEFENCE_OVERDUE = 0.6;
/** Regional indie titles (section 15): defended on indie shows in their region, at these chances. */
export const REGIONAL_DEFENCE_CHANCE = 0.25;
export const REGIONAL_DEFENCE_OVERDUE = 0.9;
/** Who can challenge for a regional title: whoever's worked this many dates in the region lately (not where they were born). */
export const REGIONAL_ELIGIBLE_DATES = 3;
export const REGIONAL_WINDOW_DAYS = 120;
/** A contender's score: regional popularity, plus this for each recent date in the region. */
export const REGIONAL_CONTENDER_PER_DATE = 2;

// --- Relationships and promoter memory (expansion, balance sheet section 14: PROPOSALS, live) -------
export const REL_FRIEND_AT = 40;
export const REL_RIVAL_AT = -40;
export const REL_GREAT_MATCH = 5;
export const REL_OFF_SCRIPT_ON = -15;
export const REL_FEUD = -4;
/** Trust: 50 to start, then per thing remembered. */
export const TRUST_START = 50;
export const TRUST_KEPT = 4;
export const TRUST_GOOD = 3;
export const TRUST_FAVOUR = 4;
export const TRUST_OFF_SCRIPT = -15;
export const TRUST_NO_SHOW = -20;
export const TRUST_BOTCHED = -3;
export const TRUST_SNUB = -3;
/** Failing to deliver (losing when booked to win): a smaller knock than going off-script. */
export const PATIENCE_BOTCHED = -5;
/** Your title matches: a promoter who doesn't trust you (under 35) is likelier to plan the belt off you / not onto you. */
export const TRUST_LOW = 35;
export const TRUST_HIGH = 70;
export const TRUST_RETAIN_SWING_LOW = 0.15;
export const TRUST_RETAIN_SWING_HIGH = 0.05;
/** Indie promoters' bookings: trust under TRUST_LOW and they stop writing; over TRUST_HIGH they write more; a champion draws interest. */
export const INDIE_OFFER_TRUSTED = 1.5;
export const INDIE_OFFER_CHAMPION = 1.3;
/** Requests to indie promoters: (trust − 50) ÷ this, in points of yes chance. */
export const ASK_TRUST_DIVISOR = 5;

// --- Career events (expansion, balance sheet section 14: PROPOSALS, live) ----------------------------
/** The chance of a career event on a given day, before your situation shapes it (about one a week). */
export const EVENT_DAILY_BASE = 0.12;
/** Quiet spell (no match in 7 days): more; busy (4+ matches in 10 days): fewer. */
export const EVENT_QUIET_MULT = 1.5;
export const EVENT_BUSY_MULT = 0.6;
export const EVENT_FREE_AGENT_MULT = 1.15;
export const EVENT_CHAMP_MULT = 1.2;
/** Popular (60+ global): more; unknown (under 15): fewer. */
export const EVENT_STAR_MULT = 1.15;
export const EVENT_UNKNOWN_MULT = 0.7;
/** At least this many days between events, at most this many waiting on you, and days to answer. */
export const EVENT_MIN_GAP = 3;
export const EVENT_MAX_OPEN = 2;
export const EVENT_EXPIRES_DAYS = 5;
/** An event where your contract rules out every choice but saying no comes round this much as often. */
export const EVENT_BLOCKED_MULT = 0.25;

// --- One-off shows and the living world (expansion stage 4, balance sheet section 14: PROPOSALS, live) ------
/** Days between new one-offs anywhere, and how far ahead they're announced. */
export const SPECIAL_MIN_GAP = 7;
export const SPECIAL_LEAD: [number, number] = [21, 42];
/** Once its own gap has passed, the daily chance a kind of one-off is announced. */
export const SPECIAL_DAILY = 1 / 14;
/** Days between one-offs of the same kind (tributes and benefits are also once per person). */
export const SPECIAL_GAP = { charity: 30, benefit: 45, tribute: 30, crossover: 120, tournament: 75, farewell: 0 } as const;
/** A benefit night: for someone this popular, out at least this long. */
export const BENEFIT_MIN_INJURY_DAYS = 28;
export const BENEFIT_MIN_POP = 30;
/** A tribute: for someone this popular, 30–90 days after they retire. */
export const TRIBUTE_MIN_POP = 45;
/** Cups: a fortnight between rounds; the winner's prize is this many times your indie fee. */
export const CUP_ROUND_GAP = 14;
export const CUP_PRIZE_MULT = 5;
export const CUP_WIN_POP = 3;
export const CUP_WIN_REP = 2;
/** Wrestling on a charity or benefit night: reputation after the show (for free; for a fee). */
export const CHARITY_REP_FREE = 1.5;
export const CHARITY_REP_PAID = 0.5;
/** Retirement: from this age, a monthly chance that grows each year past it. Champions carry on. */
export const RETIRE_AGE_MIN = 38;
export const RETIRE_MONTHLY_BASE = 0.006;
export const RETIRE_MONTHLY_PER_YEAR = 0.003;
/** Comebacks: someone popular, retired at least this long, now and then comes back. */
export const RETURN_MIN_DAYS = 180;
export const RETURN_MIN_POP = 45;
export const RETURN_MONTHLY = 0.015;
/** A rookie whose popularity reaches this has broken through. */
export const BREAKTHROUGH_POP = 20;
/** Reign lengths and career match counts the world notices. */
export const REIGN_MILESTONES = [180, 365, 730];
export const CAREER_MILESTONES = [50, 100, 250, 500, 1000];
/** A champion out at least this long makes the news. */
export const CHAMP_INJURY_NEWS_DAYS = 30;
/** An indie promise that can't happen rolls on to the promoter's next show at most this many times (Lyra's call). */
export const INDIE_PROMISE_ROLLS = 3;
/** A cup winner's shot at the division's top indie title: it waits this long for a show (Lyra's call: a shot as the prize). */
export const CUP_SHOT_DAYS = 120;

// ------------------------------------------------------------------ 15. Indie scene, traits and bookers (proposals)

/** Traits: a wrestler holds one to this many, any mix of in-ring and backstage. */
export const TRAIT_MAX = 3;
/** How many traits shipped and generated wrestlers start with: weights for one, two and three. */
export const TRAIT_COUNTS_SHIPPED = [0.3, 0.5, 0.2];
export const TRAIT_COUNTS_GENERATED = [0.45, 0.4, 0.15];
/** No single trait is held by more than this share of the shipped roster. */
export const TRAIT_PREVALENCE_CAP = 0.15;

/** The indie scene (Lyra's call): a straight 200 generated for every new world. */
export const INDIE_GENERATED = 200;
/** Kept at about 200: a kept world is topped up to it, and new faces debut when it's under; above the maximum, idle unknowns drift out of the business. */
export const INDIE_POOL_MIN = 200;
export const INDIE_POOL_MAX = 220;
/** Generated indies: who they are. Share of the scene, age range and popularity in their home region. */
export const INDIE_ARCHETYPES = {
  prospect: { share: 0.45, age: [19, 24], pop: [8, 18], stats: -2 },
  journeyman: { share: 0.4, age: [25, 33], pop: [14, 28], stats: 0 },
  veteran: { share: 0.15, age: [34, 42], pop: [20, 34], stats: 2 },
} as const;
export const INDIE_FEMALE_SHARE = 0.35;
/** Where the indie scene is: each region's share of generated wrestlers and of indie brands. */
export const INDIE_REGION_SHARES: Record<PopRegion, number> = { northAmerica: 0.26, europe: 0.22, asia: 0.16, southAmerica: 0.12, africa: 0.12, oceania: 0.12 };

/** Indie shows a week (Lyra's call): 6 to 10, never more than 10 in a calendar week, one-offs and cups included. */
export const INDIE_SHOWS_PER_WEEK: [number, number] = [6, 10];
export const INDIE_SHOWS_MAX_WEEK = 10;
/** The draw aims for this many indie dates a week per indie wrestler, from real slots: about 8 shows × 5 bouts × 2 shared by about 150. */
export const INDIE_DATES_PER_WEEK = 0.5;
export const INDIE_SLOTS_PER_SHOW = 10;
/** Indie brands: each runs a show about every 7–21 days, mostly at weekends (Monday first). */
export const INDIE_BRAND_EVERY: [number, number] = [7, 21];
export const INDIE_DOW = [0.04, 0.04, 0.07, 0.12, 0.25, 0.33, 0.15];
/** A region with no indie show for this long gets priority in the next week's draw (no weekly guarantee). */
export const INDIE_REGION_DROUGHT_DAYS = 21;
/** What the long-run tests expect at least, in every rolling 28 days, per region. */
export const INDIE_REGION_MIN_PER_28D = 2;
/** Who's around for an indie show: home region, a region they've worked lately, next door, anywhere else. */
export const INDIE_REGION_WEIGHT = { home: 1, circuit: 0.5, neighbour: 0.2, elsewhere: 0.05 };
/** Indie champions travel: this many times as likely to be around. */
export const INDIE_CHAMP_DRAW = 3;
/** Who gets the spot: popularity, then reputation (±this share at 0 or 100) and the promoter's feeling for them. */
export const INDIE_PICK_REP_WEIGHT = 0.4;
export const INDIE_PICK_BOND_WEIGHT = 0.5;
/** At most this many title matches on an indie card (one on a card of four or fewer). */
export const INDIE_TITLE_BOUTS_MAX = 2;
/** The last few places someone worked (for regional titles and who's around). */
export const CIRCUIT_KEEP = 12;
/** …counting only work this recent. */
export const CIRCUIT_DAYS = 120;
/** A generated indie idle this long, with popularity under this, may quietly leave the business when the scene is crowded. */
export const INDIE_IDLE_LEAVE_DAYS = 90;
export const INDIE_IDLE_LEAVE_POP = 10;
export const INDIE_IDLE_LEAVE_MONTHLY = 0.03;
/** Indie promoters' standing in the business when a world starts. */
export const PROMOTER_REP: [number, number] = [25, 55];

/**
 * What each trait does, in numbers (section 15f/g). In-ring: `ai*` shift the AI's choices (simulated
 * matches, and the AI side of yours); the rest apply to both sides, so they count in matches you play.
 */
export const TRAIT_FX = {
  risk_taker: { aiHighRisk: 12, aiClimb: 10, legPenaltyShare: 0.5, highRiskDice: -1, heat: 1.2 },
  methodical: { aiFocus: 10, aiBasic: 4, temperature: 0.5, wornDice: 1, wornBelow: 50 },
  showboat: { aiTaunt: 18, tauntHeat: 1.5, tauntDice: 1, interruptedHeat: 2 },
  aggressive: { aiStrike: 6, aiRest: -15, earlyDice: 1, earlyMoves: 8, stamina: 1.04 },
  defensive: { counterDice: 1, aiRest: 10, aiHighRisk: -6, momentum: 0.95 },
  resilient: { kickout: 6, window: 1.15, escape: 6, injury: 1.1 },
  opportunist: { aiCover: 0.15, flash: 5, aiPinAfterReversal: 10 },
  dirty_fighter: { aiDirty: 25, aiDistract: 20, seen: 0.8 },
  big_match: { dice: 2, stars: 0.1 },
  inconsistent: { form: [-2, -1, 0, 1, 2], weights: [0.15, 0.2, 0.3, 0.2, 0.15], temperature: 2.5 },
  submission_specialist: { aiHold: 10, pressure: 8, holdDamage: 1.2, tapHp: 50, tapCondition: 55 },
  crowd_pleaser: { heat: 1.15, fanMult: 1.15, merch: 1.1 },
  hot_headed: { aiStrike: 4, aiRest: -8, aiDirty: 8 },
  unpredictable: { temperature: 2.5 },
  reliable: { injury: 0.9 },
} as const;

/** Backstage traits (section 15g): contracts, plans, patience, relationships, mentorship. */
export const TRAIT_BACKSTAGE = {
  loyal: { renew: 0.15, poach: 0.5, ownRenewal: 1.05, caught: 1.5 },
  mercenary: { renew: -0.15, poach: 1.5, rivalLift: 1.1, trustGain: 0.8 },
  ambitious: { contender: 6, leave: 0.25, titleAsk: 5, refused: -3 },
  professional: { retries: 1, followedPlan: 1.5, keptTrust: 1 },
  rebellious: { retries: -2, offScriptPop: 1.5 },
  politician: { favourTrust: 2, patienceGain: 1.25 },
  team_player: { retriesLosing: 1, tookCounter: 2, relationGain: 1.25 },
  egotistical: { retriesLosing: -1, contender: 4, titleAsk: 5, relationGain: 0.75, patienceLoss: 1.2 },
  mentor: { minAge: 30, protegeMaxAge: 25, monthly: 0.3, gain: 1, max: 4, eventMult: 2 },
  hot_headed: { patienceLoss: 1.25, eventMult: 2 },
  reliable: { trustStart: 5, datesPerPatience: 5 },
  unpredictable: { askJitter: 8 },
} as const;

/** Getting traits (Lyra's calls: always confirmed, about 1–2 a year at most, a declined one doesn't come back for a year). */
export const TRAIT_PRICE = 12000;
export const TRAIT_PRICE_PREMIUM = 15000;
export const TRAIT_BUY_COOLDOWN = 90;
export const TRAIT_OFFER_AT = 100;
/** The bar rises with each trait you hold: 100, 150, 200, 250. */
export const TRAIT_OFFER_PER_HELD = 0.5;
export const TRAIT_LEAN_DECAY = 0.85;
export const TRAIT_LEAN_CAP = 300;
export const TRAIT_OFFER_GAP_DAYS = 180;
export const TRAIT_DECLINE_COOLDOWN = 365;
export const TRAIT_OFFER_EXPIRES = 10;
/** AI personalities change slowly, from what happens to them: about 1 in 6 checked a month, a change at most once a year. */
export const TRAIT_DRIFT_CHECK = 1 / 4;
export const TRAIT_DRIFT_MIN_DAYS = 365;
export const TRAIT_DRIFT = {
  ageMethodical: { age: 33, p: 0.25 },
  ageMentor: { age: 34, p: 0.15 },
  loyalRenewals: { n: 2, p: 0.2 },
  mercenaryMoves: { n: 2, days: 1095, p: 0.2 },
  egoReign: { days: 365, p: 0.15 },
  youngStar: { age: 24, days: 60, p: 0.15 },
};

/** Bookers and promoters as people (section 15h/i): how their traits shift their decisions. */
export const BOOKER_FX = {
  /** Personal feeling counts in requests, capped: a booker who likes you is a little more open (affinity ÷ this). */
  affinityDivisor: 5, affinityCap: 6,
  egotistical: { asks: -10, offScript: 1.25 },
  professional: { offScript: 1.25, kept: 1.25 },
  rebellious: { offScript: 0.75, change: 0.03 },
  unpredictable: { jitter: 10, change: 0.06, stips: 1.5 },
  hot_headed: { patienceLoss: 1.5, rounds: -1, fired: 1.5 },
  politician: { favouritism: 5, fired: 0.6 },
  mentor: { youth: 5, youthAge: 25 },
  loyal: { tenure: 3, quit: 0.5 },
  mercenary: { willingness: 0.95, quit: 1.5 },
  ambitious: { starPay: 1.05, quit: 1.5 },
  team_player: { gains: 1.1 },
  reliable: { promiseRolls: 1 },
};
/** Bookers' careers, a month at a time. */
export const BOOKER_FIRE_MONTHLY = 0.006;
export const BOOKER_FIRE_BAD = 0.01;
export const BOOKER_BAD_STARS = 0.3;
export const BOOKER_QUIT_MONTHLY = 0.004;
export const BOOKER_RETIRE_AGE = 62;
export const BOOKER_RETIRE_BASE = 0.01;
export const BOOKER_RETIRE_PER_YEAR = 0.005;
export const BOOKER_RETURN_DAYS = 180;
export const BOOKER_RETURN_MAX_AGE = 70;
export const PROMOTER_CLOSE_MONTHLY = 0.012;
export const PROMOTER_PROMOTE_MIN_REP = 55;
export const STAFF_REP_PER_YEAR = 2;
/** Succession (Lyra's call): the office's files, not feelings. A new booker's memory of your work starts at this share of the last one's. */
export const TRUST_INHERIT = 0.25;
/** A successor honours each open promise this often (Reliable or Professional more, Egotistical or Unpredictable less). */
export const PLEDGE_HONOUR_BASE = 0.7;
export const PLEDGE_HONOUR_SWING = 0.2;
export const PLEDGE_LOG_MAX = 50;

// ------------------------------------------------------------------ 16. Economy, daily life, travel and fans (proposals)

/**
 * Match ratings (Lyra's call: median about 3★, 4★+ about 12%, 4.5★+ about 2%, 5★ about 1 in 1,000, as
 * long-run targets). Five style-neutral scores, the best four count (weighted), then one fixed curve
 * from that composite to stars, fitted once on a 50,000-match corpus (scripts/rating-corpus.ts, fit in
 * docs). Refit if the engine's crowd changes.
 */
export const RATING_WEIGHTS = { crowd: 1.2, story: 1.0, drama: 1.1, craft: 0.9, spectacle: 0.8 } as const;
/**
 * Match overhaul: each match type is judged on its own terms, with the same spread as singles (median
 * about 3★, Lyra's call). More people means more heat, more near falls and more drama by default, so each
 * type is taken down this much after the curve. First fit from the stage 2 probe (40 matches a type);
 * refitted by the MATCHES harness in stage 10.
 */
export const RATING_TYPE: Record<string, { fall: number; elim: number }> = {
  triple: { fall: -0.25, elim: -0.6 },
  fourway: { fall: -0.75, elim: -1.0 },
  multi: { fall: -0.9, elim: -1.3 },
  handicap: { fall: -0.25, elim: -0.8 },
  tornado: { fall: -0.6, elim: -0.8 },
};

export const RATING_CURVE = {
  at: [0, 0.0268, 0.2212, 0.3841, 0.6008, 0.705, 0.7896, 0.8362, 0.8994, 0.9428, 0.9742],
  stars: [0.25, 0.5, 1.25, 2.0, 2.5, 3.0, 3.5, 3.875, 4.375, 4.875, 5.25],
};
/** A title on the line adds a touch (the Big-Match trait's own bonus is TRAIT_FX.big_match.stars). */
export const RATING_TITLE_BONUS = 0.05;

/**
 * Starting fans for someone new (Lyra's call; converted wrestlers keep theirs exactly). Most at home, a
 * few next door, hardly any elsewhere. Generated indies' home fans are their archetype's old home
 * popularity through the curve (INDIE_ARCHETYPES.pop); rookies start like prospects.
 */
export const NEWCOMER_NEIGHBOUR_SHARE: [number, number] = [0.05, 0.15];
export const NEWCOMER_ELSEWHERE_SHARE: [number, number] = [0, 0.03];
export const ROOKIE_HOME_SCORE: [number, number] = [8, 18];
export const CREATED_FANS = { home: 500, neighbour: 25, elsewhere: 5 };

/**
 * Promotion popularity (Lyra's call: it moves). Starts at 10 + 70 × the old budget factor; each month it
 * moves at most a point towards 10 + 70 × (roster's average score ÷ PROMO_POP_REF) + (90-day average
 * stars − 3) × PROMO_POP_PER_STAR. PROMO_POP_REF is TCG's shipped roster average, the old budget's base.
 */
export const PROMO_POP_BOUNDS: [number, number] = [10, 95];
export const PROMO_POP_STEP = 1;
export const PROMO_POP_REF = 43.5;
export const PROMO_POP_PER_STAR = 8;
/** Indie brands: 5–30, moving a point a month towards 15 + (90-day average stars − 3) × 10. */
export const BRAND_POP_BOUNDS: [number, number] = [5, 30];
export const BRAND_POP_BASE = 15;
export const BRAND_POP_PER_STAR = 10;

/**
 * Switches for player-facing rules that wait on their screens (Lyra's approval). Off: the game plays
 * as before. Each UI stage turns its own on.
 */
/** Days on: a regional indie champion this many days without a defence isn't booked on indie shows outside their region. */
export const REGIONAL_HOME_DAYS = 45;
/**
 * Mail (Lyra's calls): results with the full report card, the booker's verdict, what it did and the reaction online;
 * wrestlers writing in character; a booker check-in and a digest of everything everywhere every Monday; the press;
 * replies on anything (relationships, personality, fans and reputation, bookings); ignoring sometimes matters;
 * every letter can stop a skip; a year of mail kept.
 */
export const MAIL_KEEP_DAYS = 365;
export const MAIL_MAX = 1500;
/** Posts in a result letter's reaction: 2 for a quiet match, up to 5 for a great one. */
export const MAIL_POSTS = [2, 5] as const;
/** After a match, the chance your opponent writes; a friend writes after a title or a match this good. */
export const MAIL_OPP_CHANCE = 0.45;
export const MAIL_FRIEND_STARS = 4;
export const MAIL_FRIEND_BOND = 30;
/** Days to answer before ignoring counts: a rival's call-out, a friend's note, the press. */
export const MAIL_IGNORE_DAYS = { rival: 5, friend: 7, press: 5 } as const;
/** Ignoring a rival: reputation and a share of your reach in fans; ignoring a friend: their bond. */
export const MAIL_IGNORE_RIVAL_REP = -1;
export const MAIL_IGNORE_RIVAL_FANS = 0.02;
export const MAIL_IGNORE_FRIEND = -3;
/** The press: once you've this many fans, a chance a week of an interview request (at most one in three weeks). */
export const MAIL_PRESS_FANS = 2000;
export const MAIL_PRESS_CHANCE = 0.4;
export const MAIL_PRESS_GAP = 21;
/** Replies: relationship moves by tone, booker patience, and public replies' fans (share of reach) and backfire odds. */
export const MAIL_REL = { warm: 4, respect: 2, cold: -2, cocky: -3, hot: -6 } as const;
export const MAIL_PATIENCE = { thanks: 1, push: -2, complain: -5, deny: 2, confirm: -4 } as const;
export const MAIL_PUBLIC = { humble: 0.01, cocky: 0.03, hot: 0.05 } as const;
export const MAIL_BACKFIRE = { humble: 0, cocky: 0.2, hot: 0.35 } as const;
export const MAIL_BACKFIRE_LOSS = 0.02;
/** Lines per digest section before "and N more". */
export const DIGEST_LINES = 8;
/**
 * Side earners (Lyra's calls): a merch table, conventions, coaching, working shows, content and subscriptions,
 * sponsors, crowdfunding when hurt, and your own show. They take half-days (content, sponsors and crowdfunding
 * tick along in the background), signed wrestlers need Outside Appearances, injured wrestlers can do the quiet
 * ones, and together they're a real second income: a hard-working mid-level indie can earn what wrestling pays.
 */
export const MERCH_TABLE = { cost: 8, price: 20, batches: [10, 25, 50], base: 2, perLog: 3, stars: [[4, 1.4], [3, 1], [0, 0.6]] as [number, number][], kind: { indie: 1, weekly: 1.2, special: 1.6, flagship: 2 } as Record<string, number> };
/** Names (25k+ fans) get a guarantee: £60 × (fans in thousands)^0.6, at most £6,000 (about £400 at 25k, £950 at 100k, £3,800 at 1M). */
export const CONVENTION = { table: 40, photo: 15, photoPerDecade: 5, perFan: 0.9, exp: 0.35, guaranteeFans: 25000, guaranteeK: 60, guaranteeExp: 0.6, guaranteeMax: 6000, weeksAhead: 4, swing: 0.3, fatigue: 2 };
/** A class pays on reputation and skill, and more as you get experienced: up to ×2.5 after about 90 classes. */
export const COACHING = { base: 25, perRep: 0.4, perSkill: 0.5, skillFrom: 60, fatigue: 1, maxSlots: 8, expPer: 60, expMax: 1.5 };
export const SHOW_WORK = { ref: 45, crew: 35, commentary: 50, patience: 1, fatigue: { ref: 3, crew: 4, commentary: 0 } } as const;
/** Subscribers head for 2.5% of fans^0.95 (slower past 100k fans), £3 a month each: ~£245 a month at 5k fans, ~£26k at 4M. */
/** Content sessions (half-days) raise where subscribers are heading: ×(1 + 0.4 per session in the last 14 days), up to ×3. Weeks vary ±30%. */
export const CONTENT = { share: 0.025, exp: 0.95, bigFrom: 100000, bigExp: 0.5, price: 3, grow: 0.15, decay: 0.03, idleDays: 14, perSession: 0.4, maxSessions: 5, swing: 0.3 };
/** Merch sold online each week from your stock: per subscriber and per √fan, ±30%. */
export const MERCH_ONLINE = { perSub: 0.03, perRootFan: 0.02, swing: 0.3 };
/** Sponsors once a region has 5k of your fans; they renew at +25% only if you've kept posting. */
export const SPONSOR = { minFans: 5000, perFan: 0.02, months: [3, 6] as [number, number], chance: 0.35, max: 3, renew: 1.25, postedDays: 30 };
export const FUND = { base: 500, k: 2, exp: 0.7, minDays: 14, overDays: 14, againDays: 365, againMult: 0.5 };
export const OWN_SHOW = {
  venues: [{ id: 'hall', name: 'Community hall', cap: 150, cost: 300 }, { id: 'club', name: 'Nightclub', cap: 400, cost: 900 }, { id: 'arena', name: 'Small arena', cap: 1200, cost: 3000 }],
  production: 550, ticket: 12, prices: [10, 15, 20], priceExp: 0.8, merchPerHead: 1.5, drawBase: 10, drawK: 0.6, feeMult: 1.2, minLead: 14, maxLead: 60, hires: 4, swing: 0.15,
  /** Your shows build a following: hype multiplies the draw (×1 to ×3); a full house with a good match builds it, an empty one costs it. */
  hypeUp: 0.2, hypeDown: 0.15, hypeMax: 2, hypeFade: 0.03,
};
/**
 * Development and decline (Lyra's calls): every AI wrestler has a hidden potential (an attribute total) and a
 * hidden peak age. Before the peak they close 1.2% of the gap a month (×1.3 working 3+ dates a month, ×1.2 with a
 * mentor); after 34 they lose 2–4 points a year, 5–8 from 38, speed and stamina first. A rookie's room is 20–120
 * (most 40–70), shrinking from 25 and gone by 30. Your own wrestler only changes through training.
 */
export const DEV = {
  room: [20, 120] as [number, number], roomShrinkFrom: 24, roomGoneAt: 30, peak: [27, 33] as [number, number], cap: 98,
  grow: 0.012, working: 1.3, workingDates: 3, mentor: 1.2,
  declineFrom: 34, declineSteep: 38, decline: [2, 4] as [number, number], declineSteepRate: [5, 8] as [number, number],
  declineWeights: { speed: 3, stamina: 3, strength: 2, striking: 1.5, skill: 1, charisma: 0.5 },
};
/**
 * Backdated history (Lyra's calls): everyone is rewound N years. Anyone younger than their debut age (19–22) then
 * debuts on the indies when they reach it. A shipped wrestler's potential is their shipped total ±25; they start where
 * the development curve puts them at the younger age, and their fans scale with the years they'd been in the business
 * ((years then + 1) ÷ (years now + 1))^1.5, never below a newcomer's.
 */
export const BACKDATE = { debut: [19, 22] as [number, number], potentialSpread: 25, avgWork: 1.15, fanExp: 1.5, maxYears: 10 };
/** Shipped wrestlers retire as if this many years younger (Lyra's call: the names you know stay a bit longer). */
export const SHIPPED_RETIRE_YOUNGER = 3;
/** Match overhaul (tag teams, multi-mans, battle royals, Rumbles, the new stipulations): off until Lyra approves. */
export const FEATURES = { livingCosts: true, social: true, days: true, jobs: true, skip: true, mail: true, hustles: true, history: true, phone: true, booker: true, matches: false };

/**
 * Pay (Lyra's call: how many dates you get decides your income). A major promotion's weekly-show fee:
 * its floor (£2,500 at popularity 46, about £3,500 at 80) × your fans in its home region against its
 * roster's median, to the power 0.5, capped at ×8. Opening offers start at the floor at least.
 */
export const MAJOR_FEE_FLOOR = 2500;
export const MAJOR_FEE_FLOOR_AT = 46;
export const MAJOR_FEE_PER_POINT = 29.4;
export const MAJOR_FEE_MIN = 2000;
export const MAJOR_FEE_FAN_EXP = 0.5;
export const MAJOR_FEE_FAN_CAP = 8;
/** SLN-style weekly flagships pay like a big weekly show, not a pay-per-view. */
export const SHOW_MULT_WEEKLY_FLAGSHIP = 1.25;
/**
 * An indie fee: £50 × brand (0.8 at popularity 5 to 1.3 at 30) × (your fans in that region ÷ 500)^0.48,
 * × 1.5 as an indie champion, × 1.3 on a special or cup night; £30–£1,500. 500 fans £50 · 5k £150 ·
 * 50k £455 · 500k £1,375.
 */
export const INDIE_FEE_BASE = 50;
export const INDIE_FEE_FANS_REF = 500;
export const INDIE_FEE_EXP = 0.48;
export const INDIE_FEE_BRAND: [number, number] = [0.8, 1.3];
export const INDIE_FEE_CHAMP = 1.5;
export const INDIE_FEE_SPECIAL = 1.3;
export const INDIE_FEE_RANGE: [number, number] = [30, 1500];
/** Merch a month: worldwide fans × this (× your Merchandise Rights share when signed). */
export const MERCH_PER_FAN_SIGNED = 0.006;
export const MERCH_PER_FAN_FREE = 0.002;
/** Starting money for someone you pick: £1,000 + £2,000 × log10(worldwide fans ÷ 1,000). Created: START_MONEY_CREATED. */
export const START_MONEY_BASE = 1000;
export const START_MONEY_PER_DECADE = 2000;
/**
 * Living costs a week (Lyra's call), taken on Mondays where you're based: Europe £220, scaled by each
 * region's cost index (wages from day jobs scale the same way). An existing career gets four weeks'
 * notice before the first one.
 */
export const LIVING_COST_EUROPE = 220;
export const COST_INDEX: Record<PopRegion, number> = { northAmerica: 1.15, oceania: 1.1, europe: 1, asia: 0.8, southAmerica: 0.6, africa: 0.5 };
export const LIVING_GRACE_DAYS = 28;

/**
 * Fan growth (replaces the old popularity rules). A show reaches an audience: a major promotion's
 * weekly TV about 1M at popularity 80 (×10 every 40 points), an indie brand about 300 at popularity 5
 * to 15k at 30, live and streaming; full at the promotion's home, 35% next door, 15% elsewhere; by the
 * size of the show. A match converts some of it (1.5% of a thousand-strong crowd, less of a bigger
 * one), doubled per star above 3, more for a win or a title, and none once your fans in that region
 * pass 20 × the audience. 4★+ matches spill a little to other regions. Idle: −0.5% a month.
 */
export const FAN_AUD_MAJOR = 1_000_000;
export const FAN_AUD_MAJOR_AT = 80;
export const FAN_AUD_MAJOR_SLOPE = 40;
export const FAN_AUD_INDIE = 300;
export const FAN_AUD_INDIE_SLOPE = 14.7;
export const FAN_AUD_KIND: Record<ShowKind, number> = { weekly: 1, tour: 0.6, special: 2, flagship: 3, indie: 1 };
export const FAN_AUD_WEEKLY_FLAGSHIP = 1.3;
export const FAN_AUD_INDIE_SPECIAL = 1.5;
export const FAN_REACH = { home: 1, neighbour: 0.35, elsewhere: 0.15 };
export const FAN_CONV = 0.015;
export const FAN_CONV_EXP = -0.23;
export const FAN_WIN = 1.3;
export const FAN_LOSS = 0.8;
export const FAN_TITLE_WIN = 1.5;
export const FAN_SATURATION = 20;
/** A 4★+ match reaches people who don't usually watch: this share of the gain, 60% to your strongest other region. */
export const FAN_SPILL: [number, number][] = [[4, 0.05], [4.5, 0.1], [5, 0.15]];
export const FAN_SPILL_TOP = 0.6;
/** A real stinker (under 1.5★) costs a few: this share of your fans there. */
export const FAN_BAD_STARS = 1.5;
export const FAN_BAD_LOSS = 0.003;
export const FAN_IDLE_LOSS = 0.005;
/** Events and cups: each old "popularity point" is this share of your fans there, at least the floor. */
export const FAN_EVENT_PER_POINT = 0.015;
export const FAN_EVENT_FLOOR = 15;

/**
 * Social media (Lyra's brief: optional, light, never better than wrestling). An action reaches
 * 40 + 2.5 × (worldwide fans)^0.6 people and converts a share of them; the same kind again within a
 * week is half as good each time; one action a day; a weekly cap of 3 + 0.03% of your fans (so posting
 * on top of wrestling adds at most about a third). Promoting a match lifts that show's fans by 15%;
 * calling someone out makes a match with them easier to ask for. Call-outs and beefs can backfire.
 */
export const SOCIAL_REACH_BASE = 40;
export const SOCIAL_REACH_MULT = 2.5;
export const SOCIAL_REACH_EXP = 0.6;
export const SOCIAL_CONV = { post: 0.03, promote: 0.02, reply: 0.02, callout: 0.04, beef: 0.05 };
export const SOCIAL_BACKLASH = { post: 0, promote: 0, reply: 0, callout: 0.15, beef: 0.25 };
export const SOCIAL_BACKLASH_LOSS = 0.01;
export const SOCIAL_REPEAT_DAYS = 7;
export const SOCIAL_REPEAT_MULT = 0.5;
export const SOCIAL_BUZZ_MATCH = 1.5;
export const SOCIAL_BUZZ_GREAT = 1.3;
export const SOCIAL_WEEK_CAP_BASE = 3;
export const SOCIAL_WEEK_CAP_SHARE = 0.0003;
export const SOCIAL_PROMOTE_BOOST = 0.15;
export const SOCIAL_CALLOUT_CHALLENGE = 8;
export const SOCIAL_CALLOUT_DAYS = 30;
export const SOCIAL_REL = { reply: 2, callout: -3, beef: -8 };
export const SOCIAL_AI_POSTS: [number, number] = [2, 5];
export const SOCIAL_FEED_MAX = 30;

/**
 * Days (Lyra's calls): an AM and a PM. A free phase is rest; a training session buys up to two points
 * at today's prices, with fatigue and (only when already tired) a small injury risk. Sleep takes −10
 * (−4 after a match). Travel: same country no time; same region the AM of the show day; another
 * continent the whole day before. Back-to-back dates in a region within TOUR_DAYS keep you out on tour.
 */
export const REST_RECOVERY = 4;
export const SLEEP_RECOVERY = 10;
export const SLEEP_RECOVERY_AFTER_MATCH = 4;
export const TRAIN_SESSION_POINTS = 2;
export const TRAIN_SESSION_FATIGUE = 6;
/** Injury chance in a session by fatigue before it: [from fatigue, chance]. */
export const TRAIN_INJURY: [number, number][] = [[40, 0.0025], [60, 0.0075], [80, 0.02]];
export const TOUR_DAYS = 4;
/** Moving (Lyra's call): within your region, abroad; days it takes; a promotion abroad pays this share. */
export const RELOCATE_COST = { region: 300, abroad: 1500 };
export const RELOCATE_DAYS = 3;
export const RELOCATE_SUBSIDY = 0.75;

/**
 * Day jobs (Lyra's call: optional, light). Europe wages a week, scaled by the region's cost index;
 * shifts by weekday (0 = Sunday) and phase. Gig work is any phases you pick, £45 a shift, no penalties,
 * always on the board. Time off: 20 paid phases a year; 7+ days' notice unpaid and no strike; short
 * notice or a no-show is a strike; three in 90 days and you're sacked. Money trouble at −£1,500.
 */
export const JOBS = {
  office: { name: 'Office', weekly: 420, shifts: [[1, 'am'], [2, 'am'], [3, 'am'], [4, 'am'], [5, 'am']], fatigue: 2 },
  warehouse: { name: 'Warehouse', weekly: 450, shifts: [[1, 'am'], [2, 'am'], [3, 'am'], [4, 'am'], [5, 'am']], fatigue: 5 },
  retail: { name: 'Retail', weekly: 250, shifts: [[1, 'am'], [3, 'am'], [5, 'am']], fatigue: 2 },
  hospitality: { name: 'Hospitality', weekly: 250, shifts: [[4, 'pm'], [5, 'pm'], [6, 'pm']], fatigue: 3 },
  gig: { name: 'Gig work', weekly: 0, shifts: [], fatigue: 3 },
} as const;
export const GIG_SHIFT_PAY = 45;
export const GIG_DEFAULT_SHIFTS: [number, 'am' | 'pm'][] = [[1, 'am'], [2, 'am'], [3, 'am'], [4, 'am'], [5, 'am'], [6, 'am']];
export const JOB_HOLIDAY = 20;
export const JOB_NOTICE_DAYS = 7;
export const JOB_STRIKES = 3;
export const JOB_STRIKE_DAYS = 90;
export const MONEY_TROUBLE_AT = -1500;
export const MONEY_TROUBLE_EVERY = 28;
export const FRIEND_LOAN = 1000;
export const FRIEND_LOAN_BOND = 40;
export const FRIEND_LOAN_REPAY = 0.2;

// --- Scouting: how majors judge wrestlers (Lyra's redesign; these numbers are proposals, to approve) ----------
/**
 * A promotion's grade of you: twelve factors, each scored 0–100 as where you'd rank on their roster (a
 * percentile), weighted. These are the base weights; each promotion's taste multiplies them (SCOUT_STYLE), and
 * its booker's personality shifts them again (SCOUT_BOOKER).
 */
export const SCOUT_WEIGHTS = { fans: 5, online: 1.5, rep: 0.75, attributes: 3, results: 2, performance: 2, titles: 2, experience: 1.5, relations: 1.5, pro: 1.5, youth: 1.5, traits: 1 };
/**
 * Factors scored on their own scale (0–100) rather than as a rank on the roster, because most rosters are flat at
 * them (few champions, few people with a record either way): championships (points ÷ this × 100), professionalism
 * (as it stands), personality (50 ± this per point).
 */
export const SCOUT_ABSOLUTE = { titlesFull: 150, traitStep: 12.5 };
export type ScoutFactor = keyof typeof SCOUT_WEIGHTS;
/** Each promotion's taste: weight multipliers, and the attribute it counts twice. */
export const SCOUT_STYLE: Record<string, { w: Partial<Record<ScoutFactor, number>>; focus?: 'strength' | 'speed' | 'stamina' | 'skill' | 'striking' | 'charisma' }> = {
  TCG: { w: { fans: 1.5, rep: 1.2, pro: 1.3, attributes: 0.8 } },
  VWF: { w: { fans: 1.5, online: 2, performance: 0.8, traits: 1.3, attributes: 0.6 }, focus: 'charisma' },
  SLN: { w: { relations: 2, pro: 1.3, youth: 1.3, fans: 0.7 }, focus: 'speed' },
  END: { w: { youth: 1.5, performance: 1.5, attributes: 1.2, fans: 0.6, online: 1.5 } },
  IVW: { w: { attributes: 1.7, performance: 1.8, results: 1.2, fans: 0.5, online: 0.5 }, focus: 'skill' },
  NWGP: { w: { experience: 1.8, results: 1.5, youth: 1.5, pro: 1.3, online: 0.4 }, focus: 'striking' },
  ZWA: { w: { fans: 1.3, online: 1.5, pro: 1.6, traits: 1.5, rep: 1.2 } },
  UFC: { w: { performance: 1.3, attributes: 1.2, fans: 0.8, relations: 1.2 }, focus: 'strength' },
  SSWC: { w: { fans: 1.3, performance: 1.4, online: 1.3, pro: 0.7 }, focus: 'charisma' },
  AAWA: { w: { performance: 1.5, attributes: 1.2, traits: 1.2, titles: 0.8 }, focus: 'skill' },
};
/** The booker's personality on top: what each kind of booker leans on. */
export const SCOUT_BOOKER: Partial<Record<string, Partial<Record<ScoutFactor, number>>>> = {
  politician: { relations: 1.6 }, mentor: { youth: 1.5 }, mercenary: { fans: 1.4 }, professional: { pro: 1.4 }, reliable: { pro: 1.2 },
  showboat: { online: 1.4 }, crowd_pleaser: { performance: 1.2, fans: 1.1 }, ambitious: { titles: 1.3 }, loyal: { experience: 1.2, relations: 1.2 },
  rebellious: { pro: 0.7 }, egotistical: { rep: 1.3 }, big_match: { titles: 1.2, performance: 1.1 },
};
/** Fans: their region counts this much, the rest of the world the remainder (in log terms). */
export const SCOUT_FANS_HOME = 0.7;
/** Championships by prestige: points for a reign, current or past (past ones count this share), plus defences and years. */
export const SCOUT_TITLES = { world: 100, secondary: 60, indieWorld: 40, indie: 30, regional: 20, past: 0.4, perDefence: 2, perYear: 10 };
/**
 * Results: what a result is worth by how established the opponent is (their standing, 0–100): a win is worth
 * win + standing ÷ winPer, a loss standing ÷ lossPer, a draw half of each. Beating nobodies counts for little;
 * losing to stars isn't a disaster. Recent form is a running average.
 */
export const SCOUT_RESULT = { win: 0.4, winPer: 100, lossPer: 250, alpha: 0.12 };
/** Experience: points for each year in the business (from 19), each match, each big night. */
export const SCOUT_EXPERIENCE = { perYear: 10, perMatch: 0.1, perBig: 0.5 };
/** Professionalism: a base, and what each thing costs or earns. */
export const SCOUT_PRO = { base: 60, noShow: -15, fine: -5, offScript: -8, botched: -4, injury: -3, dayOff: -1, patience: 0.5, trait: 10 };
/** Age and potential: full marks at 22 and under, nothing at 35; each attribute point gained in the last year adds this. */
export const SCOUT_YOUTH = { young: 22, old: 35, perGrowth: 4 };
/** Personality traits as a signing risk or a plus. */
export const SCOUT_TRAITS: Partial<Record<string, number>> = { professional: 2, reliable: 2, team_player: 1, crowd_pleaser: 1, loyal: 1, mentor: 1, hot_headed: -2, egotistical: -1, rebellious: -1, mercenary: -1, unpredictable: -1 };
/** Relationships: their booker's view of you, friends and enemies on their roster, and an introduction. */
export const SCOUT_RELATIONS = { perFriend: 10, perEnemy: -10, intro: 30 };
/** The ladder: within this many grade points under their tryout bar, you're on their radar; a standout (their top 10% at something) lifts you a step. */
export const SCOUT_RADAR_MARGIN = 4;
export const SCOUT_STANDOUT = 95;
/** ...and only at something they really value (its weight with them at least this). */
export const SCOUT_STANDOUT_WEIGHT = 2.5;
/** On their radar: they watch this many of your matches; this average and this many wins earns the tryout. */
export const SCOUT_RADAR_MATCHES = 3;
export const SCOUT_RADAR_STARS = 3.25;
export const SCOUT_RADAR_WINS = 2;
/** Memory (Lyra's call): after a pass or a failed tryout, they look again once your grade's up this much. */
export const SCOUT_MEMORY_JUMP = 5;
/** The tryout's scout report: what it weighs, the bar to pass and to be given another look, and how far it moves your grade with them. */
export const SCOUT_REPORT = { stars: 0.4, execution: 0.25, crowd: 0.2, plan: 0.15, pass: 60, again: 45, gradeShift: 0.3 };
/** Being seen: a scout's chance of being at your indie match (their region; elsewhere; a big night adds), and what impresses them. */
export const SCOUT_SEEN = { home: 0.15, away: 0.03, bigNight: 0.15, impress: 3.5 };
/** News (an indie title, a cup, a 4-star match) reaches each major with this chance: their region, elsewhere. */
export const SCOUT_NEWS = { home: 0.5, away: 0.15 };
/** Word of mouth: a friend or mentor on their roster mentions you, each month. */
export const SCOUT_WORD = 0.4;

// --- Relationships and social life (Lyra's redesign, stage 1: PROPOSALS) ------------------------------
/** Kinds: enemies when either can't stand the other; best friends and friends when both like each other this much and know each other this well; a rivalry lasts this long after it was last stoked. */
export const BOND_KIND = { enemy: -60, friend: 40, friendFam: 30, best: 75, bestFam: 60, rivalDays: 365 };
/** An event that makes you friends brings you both up to this, and you know each other at least this well; a mentorship, this well. */
export const BOND_MARK = { friendLike: 40, friendFam: 35, mentorFam: 40 };
/** Reasons a bond keeps: the player's own, everyone else's. */
export const BOND_LOG = { mine: 5, theirs: 0 };
/** Anything you do with or to someone (an event, a letter, a post): you get to know each other this much; and you take to them this share of how they take to you. */
export const SOCIAL_TOUCH = { fam: 3, reciprocal: 0.5 };
/** How well you can read someone (Lyra's call: clearer the closer): a rough word from this familiarity, a clear read from this. */
export const SOCIAL_READ = { rough: 20, clear: 50 };
/**
 * Backstage at a show: each wrestler on the card gets talking to someone else there this often, and to a second
 * person this often; the booker does the rounds this many times. Each chat: familiarity; warmth (time together
 * warms people) plus like per point of chemistry, and random swing (sd); a chance of respect. A move shrinks as
 * feelings get stronger (by this much at 100), so friendships and grudges settle rather than run away.
 */
export const SOCIAL_ENCOUNTER = { chance: 0.7, second: 0.35, booker: 2, fam: 3, warmth: 3, like: 3, noise: 4, respect: 0.5, settle: 0.6 };
/** Who people seek out: their friends (per point of like over this), people they know (per point of familiarity); people they dislike, rarely. */
export const SOCIAL_SEEK = { likeOver: 0, perLike: 0.08, perFam: 0.04, avoid: -30, avoidMult: 0.3 };
/** In the ring together: familiarity; respect each way per star over or under 3; a poor one (under this) costs a little. */
export const SOCIAL_MATCH = { fam: 4, respectPerStar: 3, poor: 2.25, poorRespect: -2 };
/** A feud spilling over (Lyra's call: by personality): this often per feud match, hot-heads and egotists take it personally (like), professionals and team players respect the work. */
export const SOCIAL_SPILL = { chance: 0.5, personal: -3, work: 2 };
/**
 * Chemistry: how someone with the first trait takes to someone with the second ('*': anyone), plus where they're
 * from, where they trained, and their ages. A seeded "click" between each pair adds up to ± this.
 */
export const CHEMISTRY = {
  pairs: [
    ['hot_headed', 'hot_headed', -1.5], ['hot_headed', 'egotistical', -1], ['egotistical', 'egotistical', -1.5], ['egotistical', 'showboat', -0.5],
    ['professional', 'professional', 1], ['professional', 'reliable', 1], ['professional', 'rebellious', -1], ['professional', 'unpredictable', -0.5],
    ['rebellious', 'rebellious', 1], ['rebellious', 'professional', -0.5], ['loyal', 'loyal', 0.5], ['loyal', 'mercenary', -1],
    ['showboat', 'showboat', -0.5], ['crowd_pleaser', 'crowd_pleaser', 0.5], ['politician', 'politician', -0.5], ['ambitious', 'ambitious', -0.5],
    ['team_player', '*', 0.75], ['*', 'team_player', 0.5], ['*', 'reliable', 0.25], ['*', 'hot_headed', -0.25], ['*', 'egotistical', -0.5],
  ] as [string, string, number][],
  sameCountry: 0.75, sameSchool: 1, ageGap: { over: 15, by: -0.5 }, mentorYoung: { age: 25, by: 1 }, click: 1.5,
};
/** First impressions of a worker (respect): this to start, per point of ability over or under your own, and random swing (sd). */
export const SOCIAL_RESPECT = { start: 10, perAbility: 0.25, noise: 12, min: -40, max: 70 };
/** Out of touch: after this many days apart, each month like and respect drift this share towards nothing (a grudge, this share of that), and familiarity fades this much. */
export const SOCIAL_DRIFT = { after: 90, like: 0.05, grudge: 0.4, respect: 0.03, fam: 2 };
/** Keeping the save lean: bonds this weak, this little known and this stale go; nobody keeps more than this many (the closest stay). */
export const SOCIAL_PRUNE = { like: 15, fam: 20, days: 90, max: 20 };
/**
 * A lived-in world (Lyra's call): each wrestler starts knowing this many people, from their roster (or region on
 * the indies), their school, or their country; how well; how they feel (mean, sd, and how much of it the two share);
 * top-of-the-card rivalries per division; veteran mentors with a protégé; bookers' favourites and doghouse.
 */
export const SOCIAL_SEED = {
  per: [4, 7], roster: 0.6, school: 0.25, fam: [15, 70], rosterFam: 10, likeMean: 18, likeSd: 30, shared: 0.6, chem: 8,
  bestPer: 10, best: [75, 95], bestFam: [65, 90], grudgePer: 8, grudge: [-85, -60],
  rivalsPerDivision: 1, rivalChance: 0.7, protege: 0.5, bookerPer: 6, bookerLikeSd: 25,
};
/** Your circle (Lyra's call: a small one): your trainer, school mates, family. */
export const CIRCLE = { mates: [1, 2], family: [1, 3], trainerLike: [50, 70], mateLike: [45, 70], mateFam: [50, 70], familyLike: [60, 90] };
/** Wrestling schools in each country. */
export const SCHOOLS_PER_COUNTRY = [2, 4];
/** Orientation (Lyra's call: everyone has their own, learned by knowing them): shares of the world. */
export const ORIENTATION = { straight: 0.82, gay: 0.07, bi: 0.09, ace: 0.02 };
/**
 * Wellbeing (0–100): where it sits, what lifts and drags it, how far it moves towards that each week (your circle)
 * or month (everyone else). Form: points either side of a .500 record. Goals: met lately, or stuck this long.
 */
export const MOOD = {
  base: 55, friend: 4, friendMax: 16, best: 6, bestMax: 12, enemy: -5, enemyMax: -15, alone: -10, mentor: 3, family: 3,
  form: 16, great: 4, champ: 6, goalMet: 8, goalStuck: -8, stuckDays: 240, injured: -12, idle: -8, idleDays: 35,
  tired: -6, tiredAt: 70, broke: -8, released: -10, releasedDays: 60, step: 0.35, stepMonthly: 0.6,
};
/** Wellbeing's effects (Lyra's call: it matters): on every roll in the ring, on training and recovery, and on retiring. */
export const MOOD_FX = { low: 30, high: 85, dice: 1, trainLow: 0.85, trainHigh: 1.1, recoverLow: 0.9, recoverHigh: 1.1, retireLow: 2 };
/** Goals: an unhappy signed wrestler wants out below this wellbeing (or their booker's like); the old wind down from this age; mentors teach from this. */
export const GOALS = { moveMood: 35, moveBooker: -30, windDown: 37, teach: 33, young: 25, evenChance: 0.5 };
/** Backstage news (Lyra's call: news and profiles): at most this many lines a month about other people's friendships and fall-outs. */
export const SOCIAL_NEWS_MAX = 3;

// --- The phone (Lyra's relationships redesign, stage 2: PROPOSALS) ------------------------------------
/**
 * Messages you send: whom you can message (you know them this well); how much each topic moves how they feel about
 * you (like, respect), with a random swing (sd); how a second and third message to the same person in a day wear
 * thin; asking for the same favour again waits this long. A reply reads as good from +3, bad from −2.
 */
export const PHONE = {
  knowAt: 10, noise: 1.5, again: 0.4, pester: 3, pesterLike: -2, favourDays: 60, good: 3, bad: -2,
  topic: {
    catchup: { like: 3, respect: 0 }, congrats: { like: 5, respect: 1 }, console: { like: 6, respect: 0 }, advice: { like: 2, respect: 1 },
    gossip: { like: 1, respect: 0 }, word: { like: -2, respect: 0 }, sorry: { like: 5, respect: 0 }, goat: { like: -8, respect: -2 },
  },
  /** An apology makes up this share of how far below nothing they are. */
  sorryShare: 0.3,
  /** Putting a word in: the chance from how they feel (like plus half their respect, over this), between these. */
  word: { per: 80, min: 0.05, max: 0.9 },
};
/** How a tone lands with someone: by their voice (and family), and a cheeky one with friends or someone who dislikes you. */
export const TONE_FIT = {
  warm: { warm: 0.6, fam: 0.6, plain: 0.2, pro: 0, hot: -0.1, cocky: -0.2, sly: -0.2 },
  plain: { pro: 0.4, hot: 0.2, plain: 0.1, warm: 0, fam: 0, cocky: 0, sly: 0 },
  cocky: { cocky: 0.3, fam: 0.2, sly: 0.1, plain: 0, warm: -0.1, pro: -0.4, hot: -0.6, friends: 0.5, dislikes: -0.8 },
  blunt: { hot: 0.3, pro: 0.2, plain: 0, sly: -0.1, cocky: -0.1, warm: -0.5, fam: -0.3, dislikes: -0.4 },
} as const;
/** Having a go hits harder or softer by tone. */
export const GOAT_TONE = { warm: 0.5, plain: 1, cocky: 1.2, blunt: 1.5 };
/**
 * What people send you: a chance each day (and more with each close friend, up to so many), at most so many a week;
 * who counts as close; who'll have a dig (how much they dislike you); who asks your advice (how young, how much they rate you).
 */
export const PHONE_IN = { daily: 0.25, perFriend: 0.04, friendsMax: 10, weekCap: 6, closeLike: 25, closeFam: 30, digLike: -50, askAge: 25, askRespect: 20 };
/** Replies to what people send you: how far each moves how they feel about you. */
export const PHONE_REPLY = { chat: 4, brief: 1, tease: 3, teaseCold: -2, happy: 5, jealous: -4, there: 6, help: 8, tip: 3, brush: -6, rise: 0, fireBack: -8, laughOff: -3 };

// --- Plans and activities (Lyra's relationships redesign, stage 3: PROPOSALS) ---------------------------
/**
 * What you can do together: which half of the day, what it costs (before where you live), and what it does: like
 * (both ways), familiarity, respect, a lift to wellbeing (both of you), and fatigue (yours). The gym and running
 * spots are a training session too.
 */
export const MEETS = {
  drinks: { ph: ['pm'], cost: 25, like: 6, fam: 6, respect: 0, mood: 2, fatigue: 3 },
  meal: { ph: ['am', 'pm'], cost: 35, like: 7, fam: 6, respect: 0, mood: 2, fatigue: 0 },
  night: { ph: ['pm'], cost: 60, like: 9, fam: 8, respect: 0, mood: 4, fatigue: 12 },
  gym: { ph: ['am', 'pm'], cost: 0, like: 4, fam: 5, respect: 2, mood: 1, fatigue: 0 },
  spots: { ph: ['am', 'pm'], cost: 0, like: 5, fam: 5, respect: 3, mood: 1, fatigue: 0 },
  visit: { ph: ['am', 'pm'], cost: 0, like: 8, fam: 8, respect: 0, mood: 3, fatigue: -2 },
  /** Romance (stage 4): a date; someone's wedding (the cost is your present). */
  date: { ph: ['pm'], cost: 50, like: 10, fam: 8, respect: 0, mood: 4, fatigue: 2 },
  wedding: { ph: ['pm'], cost: 100, like: 8, fam: 4, respect: 0, mood: 3, fatigue: 4 },
} as const;
/**
 * Making plans: up to this many days ahead. Whether they say yes: from how they like you (a base plus per point,
 * between these), family nearly always; low wellbeing puts people off a night out; asked again within a week of a no,
 * half as likely. On the day some flake (by personality). Standing someone up, or cancelling (late, under a day's
 * notice), costs you. Paying for it costs double and they like that.
 */
export const MEET_RULES = {
  ahead: 7, accept: { base: 0.15, perLike: 0.009, min: 0.05, max: 0.95, family: 0.85, lowMood: 0.7, declinedDays: 7, declined: 0.5, tone: 0.1 },
  flake: { base: 0.07, unpredictable: 0.1, rebellious: 0.05, hot_headed: 0.05, reliable: -0.05, professional: -0.03 },
  flakeLike: -4, flakeMood: -2, missed: -6, cancel: -2, cancelLate: -4, payLike: 3, hurt: 4,
};
/** On the road: sharing the drive to an indie show halves your travel, and you get closer. A friend this close offers, this often. */
export const SHARE = { cut: 0.5, like: 5, fam: 6, offerLike: 25, offerFam: 20, offer: 0.6 };
/** Gifts: what you can spend, what each does; a second within a month counts for half; on their birthday, half again more. */
export const GIFTS = { amounts: [20, 50, 150], like: [5, 9, 14], againDays: 30, again: 0.5, birthday: 1.5 };
/** Borrowing: what you can ask for, from someone who likes you this much and knows you this well; the chance from how they like you. */
export const BORROW = { amounts: [250, 500, 1000], minLike: 40, minFam: 30, base: 0.2, perLike: 0.01, family: 0.9 };
/**
 * Lending: friends in trouble ask (this often, for one of these), paid back in this many weeks; whether they ever do
 * (by personality); what saying yes or no does; chasing money that's late.
 */
export const LEND = { ask: 0.25, amounts: [200, 400, 800], weeks: [4, 8], repay: 0.8, reliable: 0.95, mercenary: 0.6, yesLike: 8, noLike: -3, late: 14, chaseYes: 0.5, chaseLike: -2 };
/** What people invite you to (part of the phone's weekly cap): a chance each day; an introduction to another major's booker no more than every so often. */
export const PLANS_IN = { daily: 0.12, introDays: 120 };

// --- Romance and family (Lyra's relationships redesign, stage 4: PROPOSALS) -----------------------------
/**
 * Attraction: orientation and gender have to fit; then the spark between two people (seeded, 0–1), at least this
 * much, and an age gap no bigger than this. Flirting: how far it moves them (they're into you, or not, or they're with
 * someone). Asking out, making it official, moving in, proposing: how long you've been at the stage before, and how
 * much they need to like you. The wedding: this long after the proposal, at this cost (the ring before it). Ending it:
 * what it does to both of you, and moving out. A partner you neglect (no plans or messages) cools; below this they
 * end it. Two at once: each month a partner finds out with this chance. Wellbeing: a partner by stage; apart a lot.
 */
export const ROMANCE = {
  spark: 0.45, ageGap: 15,
  flirt: { yes: 4, no: -1, taken: -3 },
  date: { minLike: 30, minFam: 20 },
  commit: { days: 30, like: 55 }, movein: { days: 90, like: 60 }, propose: { days: 180, like: 70 },
  wedding: { days: [90, 180], cost: 3000 }, ring: 1500,
  split: { like: -30, moveOut: 400 },
  neglect: { days: 21, like: -3 }, dumpAt: 25, cheatFound: 0.35,
  mood: { dating: 5, partner: 8, living: 10, engaged: 10, married: 10, apart: -4 },
  livingSplit: 0.4, meetSomeone: 0.15,
  /** The rest of the world, each month: a couple forming; moving on to the next stage (after so many days, with this chance); splitting (more if it's gone cold); straying. */
  ai: { start: 0.15, minLike: 40, minFam: 35, spark: 0.35, partner: [90, 0.25], living: [180, 0.1], engaged: [365, 0.05], married: [120, 0.2], split: { dating: 0.03, partner: 0.02, living: 0.012, engaged: 0.008, married: 0.005 }, splitCold: 0.25, cheat: 0.003 },
  /** A lived-in world: pairs who click become couples (this often), and some of the rest have a partner from outside the business. */
  seed: { couple: 0.5, outsider: 0.3, outsiderAge: 24, married: 0.45 },
};
/**
 * Life events, each month for each person: a baby (couples), illness in the family, a death in the family, moving
 * house; and, rarely, anyone's own death (a base chance, more each year past this age). What each does to wellbeing,
 * and for how long.
 */
export const LIFE = {
  baby: 0.008, ill: 0.004, died: 0.0012, move: 0.004,
  death: { base: 0.00003, perYear: 0.00002, from: 40 },
  shock: { grief: [-15, 90], ill: [-8, 60], baby: [10, 120], heartbreak: [-12, 60], wedding: [10, 90], death: [-20, 120] },
};

// --- Politics (Lyra's relationships redesign, stage 5: PROPOSALS) ---------------------------------------
/**
 * In the ring: chemistry adds to (or takes off) a match's stars: per point of mutual respect, friends (both like this
 * much), running spots together lately; enemies working stiff take some off, and the hated one's injury risk goes up.
 * Someone booked to lose to a person they can't stand puts up a fight about it (fewer re-runs, a weaker nudge).
 */
export const CHEM = { perRespect: 0.0025, friends: 0.1, friendLike: 40, spots: 0.15, spotsDays: 14, stiff: -0.25, max: 0.35, min: -0.3, stiffInjury: 1.6, refuseNudge: 0.5 };
/** Bookers pairing people: rivals (heat sells), friends who lobby to work together, enemies who refuse to. */
export const PAIRING = { rival: 1.4, friends: 1.1, enemies: 0.5 };
/**
 * Your standing in each major's locker room, 0–100 (50 to start): putting someone over, keeping to the plan, a great
 * match, going off-script, failing to deliver; each month it moves this share towards what its leaders think of you,
 * with friends and enemies on the roster; a new face takes to you by it (per point over or under 50). Leaders: the most
 * respected this many.
 */
export const ROOM = { start: 50, putOver: 2, kept: 1, great: 1, offScript: -8, botched: -1, toLeaders: 0.2, friend: 1, friendMax: 4, enemy: -2, enemyMax: -6, firstImpression: 0.2, leaders: 2, high: 70, low: 30, moodHigh: 4, moodLow: -6, minAge: 30 };
/**
 * Cliques: up to so many per major, of 3 to 5 who like each other this much (the founder's friends at this, everyone
 * else at that). Members get a push when the booker likes their leader; whoever crosses a member is frozen out (like
 * from the rest, each month); you're asked in if you're close to this many of them.
 */
export const CLIQUE = { perPromo: 2, size: [3, 5], friendLike: 45, mutual: 25, dissolve: 20, lobby: 3, leaderLike: 20, freeze: -4, inviteFriends: 2, joinLike: 5, joinRoom: 3, frozenRoom: -3 };
/** Enemies all the way: badmouthing you to a booker who likes them (each month), and backstage fights (a hot-head and someone they can't stand on the same card). */
export const ENEMY = { badmouth: -2, badmouthLike: 20, fight: 0.15, fightLike: -5, fightRep: -1, fightRoom: -4, fineWeeks: 0.5, provoke: 0.3 };
/** Contracts and moves: a signing leans towards friends on the roster (each), a partner on it, and away from enemies there. */
export const PULL = { friend: 1.5, friendMax: 6, partner: 8, enemy: -3 };
/** Bookers personally (every one, not just politicians): a push for people they like (points per 100 like), second chances, softer fines. */
export const BOOKER_LIKE = { push: 3, patience: 250, fines: 300 };

// --- Gossip and angles (Lyra's relationships redesign, stage 6: PROPOSALS) ------------------------------
/**
 * The rumour mill (Lyra's call: true or false, started on purpose by anyone): at most so many going at once, for so
 * long. Each week, each holder tells each friend (liking them this much, knowing them this well) with this chance
 * (gossips more, the discreet less), up to so many hearing each. They believe a friend more. New true ones arise
 * from what's happening (a chance a week each), and liars start false ones about people they can't stand. What
 * believing each does; what you can do about one about you (denying works more often when it isn't true), and
 * starting one yourself (the chance each week it's traced back to you, and what that costs).
 */
export const RUMOURS = {
  keep: 40, days: 120, spread: 0.25, gossip: 1.6, discreet: 0.5, tellLike: 30, tellFam: 30, maxHeard: 30,
  believe: { friend: 0.75, other: 0.4, friendLike: 20 },
  arise: 0.5, liars: 0.2, liarHate: -40,
  effect: { badmouth: -8, cheating: -15, cheatingOthers: -2, leaving: -3, favourite: -2, faking: -3, drunk: -2, dating: 0 },
  you: { tellChance: 0.6, perWeek: 1, denyFalse: 0.7, denyTrue: 0.25, denyRoom: 1, denyBackfire: -2, confront: -5, confrontRoom: -3, traced: 0.2, tracedLike: -25, tracedRoom: -4, spreadLean: 4 },
};
/** Angles from real life: how often a booker uses real heat for a new feud; best friends kept apart (on-screen allies). */
export const ANGLES = { chance: 0.5, bestFriends: 0.6 };

// ------------------------------------------------------------------ booker mode (Lyra's design, stage 1)

/**
 * Companies: every promotion but The Indie Scene is one, with an owner, a booker, a tier and a bank.
 * Tiers come from popularity at first (global 70+, national 45+, regional 25+, else local); stage 4 moves
 * them with money and fans. Starting banks are rough until the books arrive (stage 4).
 */
export const COMPANY = {
  tierFrom: { global: 70, national: 45, regional: 25 } as Record<'global' | 'national' | 'regional', number>,
  startBank: { local: 25_000, regional: 250_000, national: 2_500_000, global: 8_000_000 } as Record<'local' | 'regional' | 'national' | 'global', number>,
  /** Roster sizes each tier keeps (the majors stay at 38–40). */
  roster: { local: 12, regional: 24, national: 40, global: 40 } as Record<'local' | 'regional' | 'national' | 'global', number>,
  /** Office half-days a week each tier takes (Lyra's call: booking takes time in your week). */
  officeDays: { local: 1, regional: 2, national: 3, global: 4 } as Record<'local' | 'regional' | 'national' | 'global', number>,
  /** Shows a week each tier can run at most. */
  showsPerWeek: { local: 1, regional: 2, national: 3, global: 4 } as Record<'local' | 'regional' | 'national' | 'global', number>,
};

/** Founding your own promotion: the least you can put in, its starting popularity, and what a name may be. */
export const FOUND = { minCapital: 2_000, startPop: 6, initials: [2, 5] as [number, number], nameMax: 40 };

/**
 * Booker mode, stage 2: the card. Segments are scored 0–5 from who's in them (charisma), heat (a feud, or real
 * heat between them), the crowd (fans where the show is) and what kind of segment it is, ± a little luck.
 */
export const SEGMENT = {
  base: 1.6, perCharisma: 0.03, heat: 0.7, crowdPerDecade: 0.25, crowdFrom: 1000, crowdMax: 0.6, luck: 0.4,
  kind: { promo: 0, interview: -0.2, runin: 0.3, beatdown: 0.2, signing: 0.1, debut: 0.4, celebration: 0.3, betrayal: 0.6 } as Record<string, number>,
  /** Fans for who's in it: × (1 + (score − 2.5) × this) in the show's region. */
  fans: 0.004,
};
/** The whole show (Lyra's call): matches weighted by slot, segments, flow, payoffs, star power and running to time. */
export const SHOW_RATE = {
  mainWeight: 2, openerWeight: 1.2, segWeight: 0.5,
  mainNotBest: 0.75, mainNotBestCost: 0.2, flatOpener: 2.5, flatOpenerCost: 0.1, longMatch: 900, backToBackCost: 0.1,
  segsInARow: 3, segsInARowCost: 0.15, screwyMax: 1 / 3, screwyCost: 0.2, payoff: 0.15, payoffMax: 0.3,
  starFrom: 10_000, starPerDecade: 0.1, starMax: 0.3,
  /** Minutes a show should run, by kind; a segment's about six minutes. */
  slot: { weekly: 120, special: 180, flagship: 210, tour: 120, indie: 150 } as Record<string, number>,
  segMinutes: 6, over: 1.25, under: 0.5, timeCost: 0.2,
};
/** Booking yourself (Lyra's call: allowed, with consequences): the locker room and your opponent notice. */
export const SELF_BOOK = { winRoom: -2, titleRoom: -4, loseRoom: 1.5, oppLike: -4, oppPutOver: [3, 2] as [number, number], gloryWins: 3, gloryDays: 45 };

/**
 * Booker mode, stage 3: storylines (Lyra's call: you write them, the game keeps score). Heat 0–100 starts from how
 * the two get on and what's at stake; segments and matches between them build it (by how good they were), the same
 * match over and over wears it, and a week with nothing cools it. Face against face (or heel against heel) makes less
 * sense, so it builds slower. A blow-off pays out by the heat. Turns land if they're shown; flip-flopping doesn't.
 */
export const STORY = {
  start: 20, grudge: 20, title: 10, segHeat: 7, matchHeat: 5, repeatFrom: 2, repeat: 6, cold: 6, sameSide: 0.6, missedPayoff: 20,
  blowoffFans: 0.05, payoffRate: 0.45, betrayalHeat: 55, keepBeats: 8,
  turnLanded: [1.01, 1.03] as [number, number], turnHot: 50, turnHotHeat: 15, turnUnseen: 0.98, flipFlop: 0.97, flipFlopDays: 120, aiTurn: 0.12,
  allySeg: 0.3,
};
/** Titles you can have by tier, the cruiserweight limit (lbs), and how long an injured champion's out before you're asked. */
export const BELTS = { max: { local: 2, regional: 4, national: 6, global: 8 } as Record<string, number>, cruiserLbs: 205, injuredDays: 28 };

/**
 * Booker mode, stage 4: the books (Lyra's call: full books, every company). A show's draw is the tier's base plus
 * everyone on the card's fans where it is (square-rooted, so a big name helps but not linearly), × how big the
 * promotion is, the kind of show, its recent shows' reputation and the ticket price. It goes in the smallest of the
 * tier's venues that holds it. Money in: tickets, merch, TV (a weekly show), pay-per-view (specials, national and up),
 * sponsors. Money out: wages (contracted, per date), fees (free agents, per night), venue, production, travel away from
 * home, insurance, staff. Run out past the overdraft for long enough and it's over.
 */
export const BIZ = {
  ticket: { local: 12, regional: 20, national: 30, global: 40 } as Record<string, number>,
  merchPerHead: { local: 1.5, regional: 3, national: 4, global: 6 } as Record<string, number>,
  drawBase: { local: 10, regional: 150, national: 800, global: 2000 } as Record<string, number>,
  drawK: { local: 0.6, regional: 0.45, national: 0.3, global: 0.3 } as Record<string, number>,
  kind: { weekly: 1, tour: 0.8, special: 1.4, flagship: 2, indie: 1 } as Record<string, number>,
  /** Ticket price levels (cheap, normal, dear), and how much dearer tickets put people off. */
  price: [0.75, 1, 1.4], priceExp: 0.8,
  venues: {
    local: [{ name: 'Community hall', cap: 150, cost: 300 }, { name: 'Nightclub', cap: 400, cost: 900 }, { name: 'Small arena', cap: 1200, cost: 3000 }],
    regional: [{ name: 'Nightclub', cap: 400, cost: 900 }, { name: 'Theatre', cap: 2000, cost: 7000 }, { name: 'Arena', cap: 5000, cost: 20000 }],
    national: [{ name: 'Arena', cap: 5000, cost: 20000 }, { name: 'Big arena', cap: 12000, cost: 55000 }, { name: 'Stadium', cap: 30000, cost: 150000 }],
    global: [{ name: 'Big arena', cap: 12000, cost: 55000 }, { name: 'Stadium', cap: 30000, cost: 150000 }, { name: 'Mega-stadium', cap: 60000, cost: 320000 }],
  } as Record<string, { name: string; cap: number; cost: number }[]>,
  production: { local: 550, regional: 6000, national: 40000, global: 150000 } as Record<string, number>,
  /** Production by kind of show: a house show on tour is cheap, a flagship isn't. */
  productionKind: { weekly: 1, tour: 0.35, special: 1.2, flagship: 1.6, indie: 1 } as Record<string, number>,
  /** Away from home: travel on top, as a share of production (another region costs double). */
  away: 0.25,
  /** TV per weekly show (× popularity ÷ 50), and pay-per-view buys per head in the building (× rating ÷ 3) at £15. */
  tv: { local: 0, regional: 4000, national: 45000, global: 70000 } as Record<string, number>,
  ppv: { local: 0, regional: 0, national: 1.2, global: 2 } as Record<string, number>, ppvPrice: 15,
  /** Pay-per-view is for big nights: more than this many in a month and each one sells less. */
  ppvPerMonth: 2,
  sponsors: { local: 0, regional: 2500, national: 30000, global: 120000 } as Record<string, number>,
  /** Insurance a month per contracted wrestler. */
  insurance: { local: 15, regional: 40, national: 120, global: 250 } as Record<string, number>,
  overdraft: { local: 5000, regional: 50000, national: 1_000_000, global: 4_000_000 } as Record<string, number>,
  redMonths: { player: 3, ai: 6 },
  loan: { rate: 0.08, months: 24, max: { local: 20000, regional: 250000, national: 5_000_000, global: 20_000_000 } as Record<string, number> },
  /** A hired booker's salary a month, and the owner's budget for free agents' fees a show. */
  salary: { local: 600, regional: 2500, national: 9000, global: 25000 } as Record<string, number>,
  budget: { local: 1500, regional: 15000, national: 120000, global: 300000 } as Record<string, number>,
  swing: 0.12, repWeight: 0.25,
  /** Moving up a tier: popularity, money in the bank, a roster; down when popularity drops this far below the line. */
  up: { regional: { pop: 28, bank: 30000, roster: 8 }, national: { pop: 48, bank: 800000, roster: 24 }, global: { pop: 73, bank: 4000000, roster: 34 } } as Record<string, { pop: number; bank: number; roster: number }>,
  downBy: 6,
  /** TV and sponsor offers to your promotion: from regional, once its shows average this. */
  offerFrom: 2.8, tvYears: 1,
};

/**
 * Booker mode, stage 5: signing from the other side. Someone's worth a date to you: the tier's floor × (their fans
 * where you are ÷ the tier's reference)^0.5, kept between ×0.5 and ×8; more to step down from a bigger promotion, for
 * a mercenary, for someone loyal to where they are; less if they like you. They haggle three rounds; offer under 60%
 * of what they want and they walk (under 40% and they're insulted). Buying someone out: their fee, four dates a month,
 * for what's left of their deal, ×1.5. Releasing someone: what's left, up to three months.
 */
export const SIGN = {
  floor: { local: 60, regional: 250, national: 1500, global: 2500 } as Record<string, number>,
  ref: { local: 2000, regional: 20000, national: 100000, global: 300000 } as Record<string, number>,
  minFactor: 0.5, maxFactor: 8, minFee: 30,
  stepDown: 1.3, mercenary: 1.2, loyal: 1.15, likeEffect: 0.003,
  rounds: 3, walkBelow: 0.6, insult: 0.4, insultLike: -6, counterGap: 0.25, longerPerMonth: 0.01, shortDeal: 1.1,
  rivalFrom: 60, rivalChance: 0.35, rivalLift: 1.15, buyout: 1.5, releaseMonths: 3,
  signedLike: 5, releasedLike: -12, renewNotice: 30, renewLift: 1.1, walkLike: -30,
};
/** Your roster's feelings about you as booker (Lyra's call: through relationships). */
export const MORALE = {
  win: 1, titleWin: 6, mainEvent: 1, idleDays: 21, idle: -2, underpaid: 0.7, underpaidLike: -2,
  promised: 2, promiseDays: 60, pushWins: 3, kept: 8, broken: -12,
  unhappy: -30, wantsOut: -50, speakUp: 0.25, letGo: 10, brushOff: -3,
  conduct: 0.02, fined: -3, suspended: -6, ignoredRespect: -1,
};
/** Staff you hire: candidates a month, wages by tier (× 0.5 + quality), and what the best do. */
export const STAFF = {
  pool: 4, wage: { local: 300, regional: 1500, national: 9000, global: 20000 } as Record<string, number>,
  agentStars: 0.25, producerSeg: 0.5, producerTv: 0.15, doctorCut: 0.3, writerSegs: 3,
};

/**
 * Booker mode, stage 6: owners (Lyra's call: goals, meddling and the sack). Patience starts at 60 (40 on probation);
 * each quarter's goals met +15, missed −20; a show under 2.5★ −2; a show way over budget −3; a month in the red −10;
 * crossing their champion −15; agreeing with them +5, defying them −10. At 0 you're out. Buying: the bank, a year's
 * takings × 0.8, popularity and roster by tier, 40% off in the red, up to 20% off if the owner likes you; selling gets
 * 90%. Being hired: your standing (rep × 0.6 + (rating − 2) × 20) against the tier's bar.
 */
export const OWNER = {
  start: 60, probation: 40, quarter: 91, goals: 2, ratingGoal: 3, crowdShare: 0.6, pushWins: 3,
  goalMet: 15, goalMissed: -20, badShow: 2.5, badShowCost: -2, overBudget: -3, redMonth: -10, vetoed: -15, agree: 5, defy: -10,
  meddle: 0.25, oldAge: 78, handOn: 0.03, closeLike: 50, desperateRed: 2, desperate: 0.25,
  yearsTakings: 0.8, perPop: { local: 300, regional: 5000, national: 100000, global: 300000 } as Record<string, number>,
  perHead: { local: 500, regional: 5000, national: 50000, global: 150000 } as Record<string, number>,
  troubled: 0.6, friendDiscount: 0.002, counterFrom: 0.8, sellFor: 0.9,
  applyNeed: { local: 20, regional: 35, national: 55, global: 70 } as Record<string, number>, applyGap: 90, offerChance: 0.08,
};
/** The war: poaching (a month, ×3 unhappy, ×1.5 to a bigger promotion, more if their booker hates you), a shared night, TV, startups, merges. */
export const WAR = {
  poach: 0.02, unhappy: 3, bigger: 1.5, match: 1.25, counter: 0.12, tvOutbid: 0.3,
  startup: 0.015, startupPop: 22, startupRep: 40, startupBank: 20000, mergeRed: 2, merge: 0.3,
};
