// Every number career mode runs on, in one place. These are the values proposed on the canvas
// "Career balance sheet" and are NOT approved yet: change them here and nowhere else.
import type { PopRegion, ShowKind } from './types';

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
/** Outside Appearances Tier 1: management approves this often. */
export const OUTSIDE_T1_APPROVAL = 0.6;

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
/** Popularity away from home, as a share of home popularity: worldwide, next-door regions, everywhere else. */
export const INDIE_GLOBAL_SHARE = 0.5;
export const INDIE_NEIGHBOUR_SHARE = 0.3;
export const INDIE_ELSEWHERE_SHARE = 0.15;

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
  crowd_pleaser: { heat: 1.15, popPerMatch: 0.2, merch: 1.1 },
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
export const RATING_CURVE = {
  at: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  stars: [0.25, 0.5, 1.25, 2.0, 2.5, 3.0, 3.5, 3.875, 4.375, 4.875, 5.25],
};
/** A title on the line adds a touch (the Big-Match trait's own bonus is TRAIT_FX.big_match.stars). */
export const RATING_TITLE_BONUS = 0.05;
