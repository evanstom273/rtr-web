// The career's saved state. Lives in the world save next to the database it changes.
import type { FinishType, StipulationId } from '../engine/types';
import type { Day } from './dates';

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

export type LetterKind = 'offer' | 'result' | 'news' | 'injury' | 'contract';
export type LetterAction =
  | { type: 'indie'; show: string; fee: number; travel: number; needsApproval?: boolean }
  | { type: 'negotiate'; offer: string }
  | { type: 'tryout'; show: string; promo: string };

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

export interface Entry { day: Day; text: string; amount: number; kind: 'fee' | 'travel' | 'training' | 'medical' | 'merch' | 'bonus' | 'buyout' | 'start' }

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
  planned?: 'kept' | 'off-script' | null;
  fee: number;
  indie: boolean;
  /** Totals from the engine's match stats. */
  stats?: { movesTried: number; movesLanded: number; finTried: number; finHit: number; sigTried: number; sigHit: number; reversalTries: number; reversalWins: number; kickouts: number; pinTries: number };
  move?: string;
}

export interface Career {
  v: 1;
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
  /** Caught approaching another promotion: your promotion holds it against you until this day. */
  heat?: { promo: string; until: Day };
  nextRookie: Day;
  seq: number;
  seed: number;
}

export type AskKind = 'title' | 'challenge' | 'indieChallenge' | 'show' | 'more' | 'approach' | 'tryout' | 'spot' | 'review' | 'rival' | 'release' | 'dayoff' | 'finish';
export type CounterKind = 'show' | 'opponent' | 'earn' | 'feud' | 'tryout';

/** Something a booker agreed to (Requests). */
export interface Pledge {
  id: string;
  /** The promotion whose booker made it ('TIS' for indie promoters). */
  promo: string;
  kind: 'title' | 'match' | 'show' | 'dates';
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
  /** The request it came from. */
  ask?: string;
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
