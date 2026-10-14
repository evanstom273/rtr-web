// Core engine types. No DOM, no React.

export type SideKey = 'you' | 'them';
export type Position = 'standing' | 'grounded' | 'corner' | 'top' | 'outside';
export type BodyPart = 'head' | 'body' | 'arm' | 'leg';
export type MoveCat = 'strike' | 'grapple' | 'air' | 'brawl' | 'hold';
export type WrestlerClass = 'flyer' | 'power' | 'tech' | 'striker' | 'hardcore';
export type Alignment = 'face' | 'heel';
export type Stakes = 'exh' | 'title';
export type PromoId = 'VWF' | 'ENDEAVOUR' | 'SLN' | 'TCG' | 'NWGP' | 'IVW';

export const PARTS: readonly BodyPart[] = ['head', 'body', 'arm', 'leg'];
export const SIDES: readonly SideKey[] = ['you', 'them'];

export interface Move {
  name: string;
  cat: MoveCat;
  /** Where the attacker must be. */
  self: Position;
  /** Where the defender must be. */
  tgt: Position;
  part: BodyPart;
  /** Impact. */
  imp: number;
  risk: 0 | 1 | 2;
  /** Defender's position after the move lands. */
  res: Position;
  /** Classes that get this move. null = everyone. */
  cls: WrestlerClass[] | null;
  /** Attacker's position after the move lands. */
  selfRes?: Position;
  flash?: boolean;
  rest?: boolean;
  sub?: boolean;
  spot?: boolean;
  sig?: boolean;
  fin?: boolean;
}

export interface Stats {
  str: number;
  spd: number;
  tec: number;
  strk: number;
  cha: number;
  sta: number;
}

export interface Wrestler {
  id: string;
  name: string;
  nick: string;
  promo: PromoId;
  from: string;
  align: Alignment;
  cls: WrestlerClass[];
  st: Stats;
  sig: Move;
  fin: Move;
  bio: string;
}

export interface Promotion {
  event: string;
  cities: string[];
  title: string;
}

export type HP = Record<BodyPart, number>;

export interface Side {
  key: SideKey;
  w: Wrestler;
  name: string;
  cls: WrestlerClass[];
  st: Stats;
  align: Alignment;
  sig: Move;
  fin: Move;
  hp: HP;
  stamina: number;
  momentum: number;
  sigReady: boolean;
  finStock: number;
  pos: Position;
  used: Record<string, number>;
  lastMove: string | null;
  recentParts: BodyPart[];
  partHits: Record<BodyPart, number>;
  fkAbsorbed: number;
  firedUp: boolean;
  comeback: number;
  cheapCd: number;
  tauntCd: number;
  setupRun: number;
  landed: number;
  focus: BodyPart | null;
  moves: Move[];
}

export interface MatchStats {
  heatSum: number;
  heatN: number;
  heatPeak: number;
  reversals: number;
  finRev: number;
  nf: number;
  fk: number;
  crashes: number;
  high: number;
  spots: number;
  rest: number;
  repeats: number;
  maxStreak: Record<SideKey, number>;
  heatSeg: SideKey | null;
  comeback: SideKey | null;
  fireUp: SideKey | null;
  pins: number;
  earlyPins: number;
  subs: number;
  limbPayoff: boolean;
  finAttemptsSeen: boolean;
}

export interface PinCtx {
  imp?: number;
  signature?: boolean;
  finisher?: boolean;
  flash?: boolean;
  move: Move | null;
}

/** 0 = pinned. 1, 2, 2.9 = kicked out at that count. */
export type KickoutCount = 0 | 1 | 2 | 2.9;

export type SetupId =
  | 'pickup' | 'whip' | 'climb' | 'down' | 'floor' | 'follow' | 'wait'
  | 'rollin' | 'getin' | 'taunt' | 'breath' | 'cheap' | 'fire' | 'reset';

/* ---------- log ---------- */

export type Seg =
  | { k: 'text'; v: string }
  | { k: 'name'; side: SideKey; v: string }
  | { k: 'move'; v: string }
  | { k: 'gold'; v: string; big: boolean }
  | { k: 'chant'; v: string };

export type LogCls = '' | 'dim' | 'hl' | 'crowd';

export interface LogEntry {
  id: number;
  t: number;
  cls: LogCls;
  segs: Seg[];
}

export type EngineEvent =
  | { id: number; type: 'flash'; text: string }
  /** Heat jumped by >= 8 in one go. The UI uses this to pulse the crowd waveform. */
  | { id: number; type: 'heatSpike'; amount: number };

/* ---------- continuations ---------- */

/** Deferred work. The original used setTimeout(fn, ms); here the UI waits `delay` then calls advance(). */
export type Cont =
  | { to: 'bell' }
  | { to: 'next' }
  | { to: 'neutral'; lastK: SideKey | null }
  | { to: 'startSub'; k: SideKey; move: Move }
  | { to: 'startPin'; k: SideKey; ctx: PinCtx }
  | { to: 'pinResult'; k: SideKey; ctx: PinCtx; count: KickoutCount }
  | { to: 'final' };

export type MeterTarget =
  | { kind: 'move'; move: Move }
  | { kind: 'setup'; setup: SetupId };

export interface MeterSpec {
  /** Unique per interaction. */
  id: number;
  /** 'off' = the player is attacking (hit = lands). 'def' = the player is defending (hit = reversed). */
  mode: 'off' | 'def';
  /** The side performing the move or setup. */
  attacker: SideKey;
  title: string;
  /** Gold zone, as % of the track. */
  left: number;
  width: number;
  /** 1 = marker runs left→right, -1 = right→left. */
  dir: 1 | -1;
  /** Milliseconds for the marker to cross the track. */
  dur: number;
  target: MeterTarget;
}

export interface KickoutSpec {
  id: number;
  pinner: SideKey;
  pressure: number;
  /** Gold zone on the hold-fill track, % */
  lo: number;
  width: number;
  ctx: PinCtx;
}

export interface SubSpec {
  id: number;
  attacker: SideKey;
  defender: SideKey;
  /** From the player's point of view. */
  role: 'attack' | 'defend';
  /** Bar drift per second. */
  rate: number;
  move: Move;
  part: BodyPart;
}

export type SubOutcome = 'tap' | 'escape' | 'rope';

export type Pending =
  | { kind: 'idle' }
  | { kind: 'continue'; delay: number; cont: Cont }
  | { kind: 'awaitPlayer' }
  | { kind: 'aiThinking' }
  | { kind: 'meter'; meter: MeterSpec }
  | { kind: 'kickout'; kickout: KickoutSpec }
  | { kind: 'refCount'; id: number; pinner: SideKey; count: KickoutCount; cont: Cont }
  | { kind: 'sub'; sub: SubSpec }
  | { kind: 'over' };

/* ---------- result & rating ---------- */

export interface MatchResult {
  winner: SideKey;
  loser: SideKey;
  how: 'pin' | 'sub';
  move: Move | null;
  t: number;
  byFin: boolean;
  byFlash: boolean;
  afterFk: boolean;
}

export interface RatingPart {
  l: string;
  v: number;
  n: string;
}

export interface Rating {
  raw: number;
  stars: number;
  parts: RatingPart[];
  label: string;
  verdict: string;
  recap: string;
}

/* ---------- view snapshot ---------- */

export interface SideView {
  key: SideKey;
  name: string;
  cls: WrestlerClass[];
  align: Alignment;
  hp: HP;
  stamina: number;
  momentum: number;
  sigReady: boolean;
  finStock: number;
  pos: Position;
}

/**
 * What the HUD and wrestler cards show. The original only repainted these at specific
 * moments (render()), so the engine takes a snapshot at exactly those points.
 */
export interface MatchView {
  t: number;
  heat: number;
  ctrl: SideKey | null;
  over: boolean;
  phase: string;
  sides: Record<SideKey, SideView>;
}

/* ---------- match state ---------- */

export interface MatchState {
  id: number;
  you: Side;
  them: Side;
  t: number;
  beat: number;
  ctrl: SideKey | null;
  over: boolean;
  heat: number;
  stats: MatchStats;
  streak: { who: SideKey | null; n: number };
  event: string;
  venue: string;
  title: boolean;
  titleName: string;
  meterDir: 1 | -1;
  lastLanded: { key: SideKey; m: Move; beat: number } | null;
  outsideBeats: number;
  miles: Seg[][];
  result: MatchResult | null;
  rating: Rating | null;
  pending: Pending;
  log: LogEntry[];
  events: EngineEvent[];
  view: MatchView;
  seq: number;
}

/* ---------- AI ---------- */

export type Choice =
  | { type: 'move'; m: Move; score: number }
  | { type: 'setup'; s: SetupId; score: number }
  | { type: 'pin'; score: number };
