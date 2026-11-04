// The career's saved state. Lives in the world save next to the database it changes.
import type { FinishType, StipulationId } from '../engine/types';
import type { Day } from './dates';
import type { Gender } from '../data/rtr/types';
import type { TraitId } from '../data/rtr/traits';

export type ShowKind = 'weekly' | 'special' | 'flagship' | 'tour' | 'indie';
/** Popularity keys (Wrestler['popularity'] minus global). */
export type PopRegion = 'northAmerica' | 'southAmerica' | 'europe' | 'asia' | 'africa' | 'oceania';

export interface Show {
  id: string;
  /** Promotion initials ('TIS' for indie shows). Joint shows list every promotion in `promos`. */
  promo: string;
  promos?: string[];
  name: string;
  kind: ShowKind;
  date: Day;
  country: string;
  city: string;
  region: PopRegion;
  card: Bout[] | null;
  done: boolean;
  /** Numbered shows: the series and this show's number (so a kept world's numbering carries on). */
  series?: string;
  n?: number;
  /** Irregular schedules: the schedule this show came from. */
  irregular?: string;
  /** A one-off: charity, benefit, tribute, crossover, a cup night, a farewell (career expansion, stage 4). */
  special?: ShowSpecial;
  /** Indie shows: the brand putting it on (world people); its promoter books it. */
  brand?: string;
  /** An afternoon or morning show; most are in the evening (PM). */
  phase?: 'am' | 'pm';
}

export type SpecialKind = 'charity' | 'benefit' | 'tribute' | 'crossover' | 'tournament' | 'farewell';
export interface ShowSpecial {
  kind: SpecialKind;
  /** What the calendar and Records call it: "Charity show", "Farewell: Name". */
  tag: string;
  /** Who it's for or about (benefit, tribute, farewell). */
  for?: string;
  /** No titles on the line (crossover showcases, cup nights). */
  noTitles?: boolean;
  /** Cup nights: the tournament and which round (0 = quarter-finals). */
  tourney?: string;
  round?: number;
}

/** A one-night-a-fortnight cup: eight in, quarter-finals, semi-finals, final, each on its own show. */
export interface Tourney {
  id: string;
  name: string;
  /** The three shows, quarter-finals first. */
  shows: string[];
  /** Bracket order, set when the quarter-final card is drawn. */
  entrants: string[];
  /** Winners by round and slot (null: not decided yet). */
  won: (string | null)[][];
  winner?: string;
  /** You're entered (you took the invitation). */
  player?: boolean;
  /** Your fee each round, and the prize for winning it. */
  fee: number;
  prize: number;
  /** Rounds whose results are in. */
  settled?: number;
  /** One division per cup (yours, when you're invited). */
  gender?: Gender;
}

export interface Bout {
  a: string;
  b: string;
  title?: string;
  stip?: StipulationId;
  feud?: string;
  /** Title matches: the booker's planned winner. */
  planned?: string;
  tryout?: boolean;
  /** Requests ("earn it first"): win this and you've earned a shot at this title. */
  earn?: string;
  /** A cup match: which cup, round and bracket slot. */
  tourney?: { id: string; round: number; slot: number };
  /** Someone's last match before retiring. */
  farewell?: boolean;
  result?: BoutResult;
}

export interface BoutResult {
  winner: string | null;
  finish: FinishType;
  /** Match time in seconds. */
  t: number;
  stars: number;
  /** The finishing move's name, if any. */
  move?: string;
  /** The title changed hands. */
  newChamp?: boolean;
}

export interface Contract {
  promo: string;
  start: Day;
  end: Day;
  /** Weekly-show fee; specials and flagships multiply it. */
  fee: number;
  /** Tier 0–3 for each of the ten clauses, in CLAUSES order. */
  clauses: number[];
  /** Contract Exit Tier 2: notice given, leaving on this day. */
  leaving?: Day;
  /** Championship Opportunities Tier 2/3: a title match is owed by this day. */
  titleShotBy?: Day;
  lastReview?: Day;
}

export interface Person {
  rep: number;
  fatigue: number;
  injury: { until: Day; what: string } | null;
  contract: Contract | null;
  /** 'MM-DD': the day their age ticks over. */
  birthday: string;
  last: Day | null;
  /** Off-script: no title matches until this day. */
  titleBanUntil?: Day;
  /** Last five results, newest last: 1 win, 0 otherwise. */
  recent?: number[];
  /** Days off agreed (Schedule Flexibility). */
  daysOff?: Day[];
  /** A contract signed to start when the current one ends. */
  next?: Contract;
  /** Retired: no longer wrestles (their history stays). */
  retired?: boolean;
  retiredOn?: Day;
  /** Retirement announced: the farewell is on or before this day. */
  retiring?: Day;
  /** Where they've worked lately (newest first): regional titles and who's around for indie shows. */
  circuit?: { r: PopRegion; d: Day }[];
  /** Personality: the last time their traits changed; renewals in a row at one promotion; the days they changed promotion; a breakthrough or first title. */
  traitAt?: Day;
  renewals?: number;
  moves?: Day[];
  breakthrough?: Day;
  /** You: points towards traits from how you've played, traits you've turned down (and when), the last offer, and the last one you bought. */
  leanings?: Partial<Record<TraitId, number>>;
  declined?: Partial<Record<TraitId, Day>>;
  lastOfferAt?: Day;
  boughtAt?: Day;
  /** Creative Control: the last time Protected Booking was used, and shows you've already asked about. */
  creativeUsed?: Day;
  creativeAsked?: string[];
}

/** The booker's view of a title: when it was won, how often defended, when last. Reigns live in the world history. */
export interface TitleState { since: Day; defences: number; last: Day | null }

export interface Feud {
  id: string;
  promo: string;
  a: string;
  b: string;
  start: Day;
  /** The show it pays off on. */
  payoff: string | null;
  title?: string;
  matches: number;
  done: boolean;
}

export type LetterKind = 'offer' | 'result' | 'news' | 'injury' | 'contract' | 'event' | 'person' | 'booker' | 'digest' | 'press';
export type LetterAction =
  | { type: 'indie'; show: string; fee: number; travel: number; needsApproval?: boolean }
  | { type: 'negotiate'; offer: string }
  | { type: 'tryout'; show: string; promo: string }
  /** A career event: its choices, and the day it lapses if you don't answer. */
  | { type: 'event'; event: string; options: EventChoice[]; expires: Day };

export interface Letter {
  id: string;
  day: Day;
  kind: LetterKind;
  from: string;
  subject: string;
  body: string[];
  terms?: [string, string][];
  note?: string;
  read: boolean;
  action?: LetterAction;
  /** Set once acted on (accepted, declined, expired). */
  done?: 'accepted' | 'declined' | 'expired';
  /** Career events: what you picked and what came of it. */
  picked?: string;
  outcome?: string;
  /** Mail: who wrote it (a wrestler or staff id), for voices and replies. */
  fromId?: string;
  /** A match result's report card, the booker's verdict, what it did and the reaction online. */
  report?: MatchReport;
  /** The weekly digest's sections. */
  sections?: { h: string; lines: string[] }[];
  /** Ways to answer, what you said, and what came of it. */
  replies?: MailReply[];
  replied?: string;
  /** Leaving it unanswered past this day has a consequence (a rival's call-out, a friend's note). */
  ignore?: { by: Day; kind: 'rival' | 'friend' | 'press' };
  /** What a reply works on: the opponent, the booker key, the show. */
  ctx?: Record<string, string>;
}

export interface MailReply { id: string; label: string; detail?: string }
export interface MatchReport {
  stars: number;
  label: string;
  verdict: string;
  recap: string;
  /** Crowd, Story, Drama, Craft, Action: 0–1 and a note. */
  grades: { l: string; v: number; n: string }[];
  /** Your booker or promoter on the night, in their own words. */
  booker?: { who: string; lines: string[] };
  effects: [string, string][];
  posts: { who: string; text: string; id?: string }[];
}

export interface Offer {
  id: string;
  promo: string;
  day: Day;
  fee: number;
  months: number;
  clauses: number[];
  /** Starts when the current deal ends, or now for a free agent. */
  start: Day;
  rounds: number;
  said: string;
  status: 'open' | 'signed' | 'walked' | 'declined';
  /** A rival offer this one is matching. */
  rival?: number;
}

export interface Entry { day: Day; text: string; amount: number; kind: 'fee' | 'travel' | 'training' | 'medical' | 'merch' | 'bonus' | 'buyout' | 'start' | 'living' | 'wage' | 'relocation' | 'event' }

export interface PlayerMatch {
  day: Day;
  show: string;
  showName: string;
  promo: string;
  kind: ShowKind;
  opp: string;
  oppName: string;
  result: 'win' | 'loss' | 'draw';
  finish: FinishType;
  t: number;
  stars: number;
  title?: string;
  wonTitle?: boolean;
  /** Against the booker's plan: off-script (you won when booked to lose, playing it), botched (you lost when booked
   * to win), upset (a simmed match went the other way). */
  planned?: 'kept' | 'off-script' | 'botched' | 'upset' | null;
  fee: number;
  indie: boolean;
  /** You played it (rather than letting the game sim it): only these say anything about your in-ring personality. */
  played?: boolean;
  /** Totals from the engine's match stats. */
  stats?: { movesTried: number; movesLanded: number; finTried: number; finHit: number; sigTried: number; sigHit: number; reversalTries: number; reversalWins: number; kickouts: number; pinTries: number;
    /** For personality: high-risk tries, taunts, dirty tactics, rests, kickouts after a finisher, holds. */
    highTried?: number; taunts?: number; dirty?: number; rests?: number; fk?: number; holds?: number };
  move?: string;
  /** Your report card (0–1 each: crowd, story, drama, craft, action), when the engine gave one. */
  grades?: number[];
}

export interface Career {
  v: 1;
  /** A world running with nobody playing (history being simulated): no letters, no offers, nothing for 'you'. */
  spectator?: boolean;
  player: string;
  startedOn: Day;
  today: Day;
  /** The calendar is drawn up to (and including) this day. */
  drawnTo: Day;
  /** Numbered show series ({n}) and irregular schedules. */
  counters: Record<string, number>;
  nextIrregular: Record<string, Day>;
  shows: Record<string, Show>;
  people: Record<string, Person>;
  titles: Record<string, TitleState>;
  feuds: Feud[];
  letters: Letter[];
  offers: Offer[];
  money: number;
  ledger: Entry[];
  /** Every pound by kind since the career began (the ledger keeps only the last 400 entries). */
  totals?: Partial<Record<Entry['kind'], { amount: number; n: number }>>;
  /** Mail: the week's world news waiting for Monday's digest, and when the last digest and check-in went out. */
  mailBox?: { day: Day; subject: string; body: string; kind?: 'news' | 'injury' }[];
  digestAt?: Day;
  checkinAt?: Day;
  pressAt?: Day;
  /** Social media: your recent posts, the weekly cap, who you've called out, and the feed. */
  social?: import('./social').SocialState;
  /** AM or PM of `today` (days on). Missing: the AM. */
  phase?: 'am' | 'pm';
  /** The first day days were on: bookings before it are honoured whatever their travel. */
  daysFrom?: Day;
  /** Your week: what each free phase is for (0 = Sunday), and how a clash with a shift is handled. */
  routine?: Routine;
  /** One-off plans for a phase (`2026-11-03|am`): train, rest, or a gig shift. */
  plans?: Record<string, 'train' | 'rest' | 'work' | 'trained'>;
  /** Side earners: merch stock, coaching, one-off gigs, subscribers, sponsors, a fundraiser, your own shows. */
  hustle?: import('./hustle').HustleState;
  /** Your day job. */
  job?: DayJob | null;
  /** A move in progress. */
  moving?: { to: string; until: Day };
  /** Money owed to a friend, repaid from fees. */
  loan?: { from: string; left: number };
  moneyTroubleAt?: Day;
  /** The country you live in (your home country until you move). */
  base?: string;
  /** Living costs (Lyra's call): the first Monday they're due, and the last Monday paid. */
  livingFrom?: Day;
  livingPaidThrough?: Day;
  history: PlayerMatch[];
  /** Indie shows you've agreed to work: show id → fee and travel. */
  indie: Record<string, { fee: number; travel: number }>;
  /** Tryout matches you've accepted: show id → promotion. */
  tryouts: Record<string, string>;
  /** Indie shows you've asked to be on (each promoter only answers once). */
  asked?: Record<string, boolean>;
  /** Requests: everything you've asked for, newest first. */
  asks?: Ask[];
  /** Booker patience: a promotion's initials, or 'TIS:' + an indie promoter's show name. */
  patience?: Record<string, { v: number; log: PatienceLog[] }>;
  /** What bookers have agreed to; honoured when they draw the cards. */
  pledges?: Pledge[];
  /** Promises settled, newest first: kept, lapsed, or refused by a new booker (Lyra's call: kept on record). */
  pledgeLog?: Pledge[];
  /** Caught approaching another promotion: your promotion holds it against you until this day. */
  heat?: { promo: string; until: Day };
  /** Relationships: how wrestlers you've dealt with feel about you. */
  relations?: Record<string, Relation>;
  /** Promoter memory: what each booker (promotion, or indie promoter by show name) remembers of you. */
  bookers?: Record<string, BookerMemory>;
  /** Career events: when each last happened, what you chose, follow-ups still to land, and ones waiting on you. */
  /** Cups (tournaments) running or finished recently. */
  tourneys?: Tourney[];
  /** Cup winners owed a shot at an indie title (you get a pledge instead). */
  cupShots?: { title: string; who: string; until: Day }[];
  /** The living world: when each kind of one-off last went on, and what's already been noticed (milestones, retirements). */
  world?: { last: Partial<Record<SpecialKind, Day>>; seen: Record<string, Day> };
  events?: {
    seen: Record<string, Day>;
    lastAt?: Day;
    log: { id: string; day: Day; pick: string | null }[];
    open: Record<string, { id: string; d: Record<string, string | number> }>;
    follow?: { day: Day; id: string; d: Record<string, string | number> }[];
    tally?: Record<string, number>;
  };
  nextRookie: Day;
  /** A promotion short of its roster target, and the day its scouted replacement signs. */
  scouting?: Record<string, Day>;
  seq: number;
  seed: number;
  /** The indie calendar: each brand's last show, and each region's (so quiet regions get a show). */
  brandLast?: Record<string, Day>;
  regionLast?: Partial<Record<PopRegion, Day>>;
}

export type AskKind = 'title' | 'challenge' | 'indieChallenge' | 'show' | 'more' | 'approach' | 'tryout' | 'spot' | 'review' | 'rival' | 'release' | 'dayoff' | 'finish';
export type CounterKind = 'show' | 'opponent' | 'earn' | 'feud' | 'tryout';

/** Something a booker agreed to (Requests). */
export interface Pledge {
  id: string;
  /** The promotion whose booker made it ('TIS' for indie promoters). */
  promo: string;
  /** defence: you, as champion, defend `title` on `show` (a promoter wanted the champion), against `opp` if named. */
  kind: 'title' | 'match' | 'show' | 'dates' | 'defence';
  title?: string;
  opp?: string;
  /** A particular show, or else the first suitable show from `from`. */
  show?: string;
  from?: Day;
  /** dates: the month ('YYYY-MM') and how many dates at least. */
  month?: string;
  min?: number;
  /** match: winning it earns a shot at this title. */
  earn?: string;
  /** Indie promises roll on to the promoter's next show when they can't happen: how many times so far. */
  rolls?: number;
  /** The request it came from. */
  ask?: string;
  /** Who made the promise (a booker's or promoter's person id). */
  by?: string;
  /** How it ended (the promise log keeps it): kept, lapsed, or refused by a successor. */
  status?: 'open' | 'kept' | 'lapsed' | 'refused';
  /** Settled on this day, by whom, and what happened. */
  settled?: Day;
  settledBy?: string;
  then?: string;
}

/** A request and its answer. */
export interface Ask {
  id: string;
  day: Day;
  kind: AskKind;
  /** Who answered: a promotion's initials or an indie promoter ('TIS:' + show name). */
  to: string;
  toName: string;
  /** What you asked, in a line. */
  what: string;
  /** For cooldowns: the kind, or the kind and its target. */
  key: string;
  answer: 'yes' | 'no' | 'counter';
  /** Their words. */
  said: string;
  /** What came of it. */
  then?: string;
  counter?: { kind: CounterKind; pledge?: Omit<Pledge, 'id' | 'ask'>; tryout?: { show: string; promo: string } };
  /** A counter waiting on you is open. */
  status: 'open' | 'closed';
}

export interface PatienceLog { day: Day; d: number; t: string }

export type RelKind = 'friend' | 'rival' | 'mentor' | 'protege';
export interface Relation {
  /** −100 (can't stand you) to +100. */
  v: number;
  kind?: RelKind;
  met: Day;
  last: Day;
  log: PatienceLog[];
}

export interface BookerMemory {
  matches: number;
  kept: number;
  offScript: number;
  botched: number;
  noShows: number;
  good: number;
  favours: number;
  snubs: number;
  last?: Day;
}

/** One choice in a career event letter. */
export interface EventChoice { id: string; label: string; detail?: string; blocked?: string }

export type PhaseName = 'am' | 'pm';
export interface Routine {
  /** For each weekday (0 = Sunday): what a free AM and PM are for. */
  week: { am: 'train' | 'rest' | 'content'; pm: 'train' | 'rest' | 'content' }[];
  /** Which attribute training sessions build first, and the most a session may spend. */
  focus?: string;
  spendCap?: number;
  /** A booking against a shift: ask, take the booking (time off), or keep the shift. */
  clash: 'ask' | 'take' | 'keep';
  /** Train on a day you're wrestling? */
  trainMatchDays: boolean;
  /** Don't train above this fatigue. */
  maxTrainFatigue: number;
  /** Sim your own matches during a skip instead of stopping. */
  simMine: boolean;
  /** Which mail stops a skip (Lyra's call: all of it, unless you say otherwise). */
  stopFor?: { decisions: boolean; people: boolean; checkins: boolean; news: boolean };
}
export interface DayJob {
  id: 'office' | 'warehouse' | 'retail' | 'hospitality' | 'gig';
  from: Day;
  /** Gig work: the phases you've picked. */
  gig?: [number, PhaseName][];
  holiday: number;
  /** Days off arranged (paid or unpaid). */
  off: Day[];
  strikes: Day[];
  /** Shifts worked this week, paid on Friday night. */
  worked: number;
  paidWeek?: Day;
}
