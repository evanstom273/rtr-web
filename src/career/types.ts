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
}

export interface Reign { holder: string; from: Day; to: Day | null; defences: number }
export interface TitleState { since: Day; defences: number; last: Day | null; reigns: Reign[] }

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
  nextRookie: Day;
  seq: number;
  seed: number;
}
