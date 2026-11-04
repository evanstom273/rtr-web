// Engine types. No DOM, no React.
import type { ContestRoll, ContestSide } from './dice';
import type { LiveRating } from './rating';
import type {
  Area, BodyPart, Motion, Move, MoveType, Orientation, Part, Position, Wrestler,
} from '../data/rtr/types';

export type { Area, BodyPart, Motion, Move, MoveType, Orientation, Part, Position, Wrestler };

export type SideKey = 'you' | 'them';
export const SIDES: readonly SideKey[] = ['you', 'them'];
export const BODY_PARTS: readonly BodyPart[] = ['HEAD', 'BODY', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG'];

/** The four-part match state of one wrestler. */
export interface Snapshot {
  position: Position;
  orientation: Orientation;
  area: Area;
  motion: Motion;
}

export type SetupId =
  | 'stand_up' | 'prepare_springboard' | 'start_running' | 'climb_top_rope' | 'pick_opponent_up'
  | 'irish_whip' | 'grapple_opponent' | 'throw_into_corner' | 'wake_opponent' | 'stop_running'
  | 'leave_corner' | 'regain_footing' | 'climb_down' | 'return_to_ring' | 'reset_stance' | 'taunt'
  | 'catch_breath' | 'step_to_ropes' | 'leave_ropes' | 'get_behind_opponent' | 'turn_opponent_face_up'
  | 'turn_opponent_face_down' | 'sit_opponent_up_front' | 'sit_opponent_up_back'
  | 'pull_opponent_to_knees_front' | 'pull_opponent_to_knees_back' | 'turn_opponent_in_corner'
  | 'seat_opponent_in_corner' | 'lean_opponent_on_ropes_front' | 'lean_opponent_on_ropes_back'
  | 'drape_opponent_on_ropes_front' | 'drape_opponent_on_ropes_back' | 'place_opponent_on_apron_front'
  | 'place_opponent_on_apron_back' | 'set_opponent_on_top_rope_front' | 'set_opponent_on_top_rope_back'
  | 'send_opponent_outside' | 'call_opponent_outside' | 'exit_ring' | 'take_fight_outside' | 'fight_up_ramp'
  | 'return_from_ramp' | 'bring_match_back_to_ring' | 'pull_opponent_from_corner' | 'pull_opponent_from_ropes'
  | 'bring_opponent_into_ring' | 'catch_opponent_running' | 'call_opponent_running' | 'regain_composure' | 'turn_around'
  | 'press_advantage' | 'wait_for_count'
  // Weapons and objects
  | 'retrieve_weapon' | 'pick_up_weapon' | 'drop_weapon'
  | 'set_table_flat' | 'stack_table' | 'set_table_corner' | 'position_at_table' | 'lay_on_table' | 'position_at_corner_table'
  | 'clear_table' | 'set_up_ladder' | 'climb_ladder' | 'climb_ladder_top' | 'climb_down_ladder' | 'tip_ladder'
  | 'spread_thumbtacks' | 'position_over_thumbtacks' | 'clear_thumbtacks'
  // Stipulation objectives and arena travel
  | 'reach_for_prize' | 'climb_cage' | 'reach_cage_top' | 'escape_over_cage' | 'climb_down_cage'
  | 'enter_crowd' | 'leave_crowd' | 'fight_backstage' | 'return_from_backstage' | 'begin_standing_count' | 'ask_to_quit'
  // Rule-breaking
  | 'eye_rake' | 'hair_pull' | 'closed_fist' | 'illegal_choke' | 'distract_referee' | 'remove_turnbuckle_pad' | 'exposed_turnbuckle';

export type StipulationId =
  | 'standard' | 'no_dq' | 'tables' | 'ladder' | 'submission' | 'steel_cage' | 'falls_count_anywhere' | 'iron_man'
  | 'two_out_of_three' | 'last_man_standing' | 'i_quit';

/** Where an object is and what it's doing. */
export type ObjectState = 'held' | 'dropped' | 'flat' | 'corner' | 'stacked' | 'spread' | 'ladder' | 'broken' | 'consumed';

/** A weapon or object in play (MatchWeaponInstance). */
export interface EnvObject {
  id: number;
  weaponId: string;
  durability: number;
  state: ObjectState;
  area: Area;
  holder: SideKey | null;
  /** Table or tacks: who's been laid on / lined up over it, and by whom. */
  positioned: SideKey | null;
  positionedBy: SideKey | null;
  /** Ladder: who's on it and how high (1 climbing, 2 at the top). */
  climber: SideKey | null;
  climbStage: number;
  /** Stacked table: its partner. */
  stackedWith: number | null;
}

/** Stipulation progress (MatchObjectiveState). */
export interface Objective {
  /** Ladder grabs, cage escapes and table wins open once anyone has banked a finisher. */
  gateOpen: boolean;
  /** Pulls at the prize so far (shared, as in Godot: whoever completes it wins). */
  ladderPulls: number;
  cageStage: Record<SideKey, number>;
  score: Record<SideKey, number>;
  falls: { k: SideKey; finish: FinishType; t: number }[];
  overtime: boolean;
  /** Last Man Standing: who can be counted right now, and how hard the blow was. */
  lmsFor: SideKey | null;
  lmsImpact: number;
  quitPressure: Record<SideKey, number>;
  /** Has each side landed a finisher yet (I Quit credibility). */
  finisherLanded: Record<SideKey, boolean>;
  /** A result reached mid-action (a DQ, a table break, time running out), settled when the action ends. */
  decision: Decision | null;
}

export interface Decision {
  winner: SideKey | null;
  finish: FinishType;
  move: Move | null;
  /** End the whole match even in a multi-fall match (time running out). */
  final?: boolean;
}

/** The referee's attention and the rulebook (MatchRefereeState). */
export interface RefereeWatch {
  /** Actions left distracted, and by whom. */
  distracted: number;
  distractedBy: SideKey | null;
  /** Actions left catching up after the fight changed area. */
  moving: number;
  area: Area;
  warnings: Record<SideKey, number>;
}

export type ActionResult = 'CLEAN_SUCCESS' | 'REVERSAL' | 'HIGH_RISK_CRASH' | 'SETUP_SUCCESS' | 'KICKOUT' | 'SUBMISSION_ESCAPE' | 'TAP_OUT' | 'BOTCH_OR_SCRAMBLE' | 'NONE';

export type Control = SideKey | 'neutral';

export type FinishType =
  | 'PINFALL' | 'SUBMISSION' | 'COUNT_OUT' | 'DOUBLE_COUNT_OUT' | 'DISQUALIFICATION' | 'TABLES' | 'LADDER'
  | 'CAGE_ESCAPE' | 'TEN_COUNT' | 'I_QUIT' | 'TIME_DECISION';

/** Body-target resolution, as produced by MoveTargetResolver. */
export interface TargetResolution {
  parts: BodyPart[];
  storyPart: BodyPart;
  weights: Partial<Record<BodyPart, number>>;
  pressureParts: BodyPart[];
  pressureUsesAverage: boolean;
  isBilateral: boolean;
  focusApplied: boolean;
  fullTag: string;
  compactTag: string;
}

export type HP = Record<BodyPart, number>;

/** Mutable per-side match state (MatchSideState). */
export interface Side {
  key: SideKey;
  w: Wrestler;
  /** Career: the booker's thumb on the scale (0 almost always). */
  booked: number;
  /** A big match (title, special, flagship, cup final, farewell): Big-Match Performers rise to it. */
  big: boolean;
  /** Inconsistent: tonight's form, −2 to +2 on every roll (0 for everyone else). */
  form: number;
  /** Wellbeing: in a good place (+) or not right (−), on every roll. */
  mood?: number;
  regular: Move[];
  signatures: Move[];
  finishers: Move[];
  /** Regular + signatures + finishers, de-duplicated. */
  all: Move[];
  state: Snapshot;
  hp: HP;
  stamina: number;
  maxStamina: number;
  fatigue: number;
  momentum: number;
  /** A signature is banked (reached SIGNATURE_MOMENTUM); one use. */
  signatureReady: boolean;
  finisherStock: number;
  /** Momentum has dropped far enough below the threshold to earn that unlock again. */
  signatureArmed: boolean;
  finisherArmed: boolean;
  resiliencyEarned: boolean;
  resiliencyAvailable: boolean;
  resiliencyUsed: boolean;
  /** Body part the player/AI is focusing; NONE = auto. */
  targetFocus: Part;

  recentMoves: string[];
  recentMoveTypes: MoveType[];
  /** What kind of move each recent attempt was, for reads (most recent last). */
  recentSetupPatterns: string[];
  pendingSetupAction: SetupId | null;
  recentTargetParts: BodyPart[];
  targetAttackCounts: Partial<Record<BodyPart, number>>;
  targetDamageDealt: Partial<Record<BodyPart, number>>;
  thresholdsCrossed: Partial<Record<BodyPart, number[]>>;
  repeatedMilestones: Partial<Record<BodyPart, number[]>>;
  lastBodyCommentaryTime: number;
  moveUseCounts: Record<string, number>;

  lastActionResult: ActionResult;
  lastMoveLanded: Move | null;
  lastMoveWasFinisher: boolean;
  tauntCooldownUntil: number;
  catchBreathCooldownUntil: number;
  consecutiveNeutralResets: number;
  consecutiveSetupActions: number;
  recoveryDelayProtected: boolean;
  /** Just won position with a setup: +2 on the next contested roll. */
  setUp: boolean;
  /** Contested setups attempted, most recent last (for "same trick again"). */
  recentSetups: SetupId[];
  announcedLowStamina: boolean;
  announcedHighFatigue: boolean;
  announcedSpent: boolean;
  announcedHeroic: boolean;

  /** 0 none, 1 minor, 2 moderate, 3 heavy. */
  bleeding: number;
  /** AI trips under the ring for a weapon, and when the next is allowed (match seconds). */
  weaponTrips: number;
  nextWeaponTripAt: number;

  movesLanded: number;
  damageDealt: number;
  damageTaken: number;
  reversals: number;
  kickouts: number;
  pinAttempts: number;
  /** The match record's numbers (the archive and the downloads). */
  stats: SideStats;
}

export interface SideStats {
  /** Moves rolled for, and how they went. */
  movesTried: number;
  movesLanded: number;
  /** Their own moves the opponent stopped. */
  reversed: number;
  /** Defending moves: reversals gone for and won, moves braced, moves ridden out. */
  reversalTries: number;
  reversalWins: number;
  braced: number;
  rode: number;
  sigTried: number;
  sigHit: number;
  finTried: number;
  finHit: number;
  /** Pins they kicked out of (Resiliency included). */
  kickouts: number;
  /** Covers they went for, and holds they locked in. */
  pinTries: number;
  holds: number;
  /** Clock steps they ended in control of. */
  controlSteps: number;
  /** For personality (traits): high-risk moves tried, taunts, dirty tactics, rests, and kickouts after a finisher. */
  highTried: number;
  taunts: number;
  dirty: number;
  rests: number;
  fk: number;
}

/* ---------- log & events ---------- */

export type Seg =
  | { k: 'text'; v: string }
  | { k: 'name'; side: SideKey; v: string }
  | { k: 'move'; v: string }
  | { k: 'gold'; v: string; big: boolean }
  | { k: 'chant'; v: string };

export type LogCls = '' | 'dim' | 'hl' | 'crowd' | 'warn' | 'bad' | 'good';

export interface LogEntry {
  id: number;
  t: number;
  cls: LogCls;
  segs: Seg[];
}

/** Presentation events: flashes, crowd pulses and ring-view beats. */
export type EngineEvent =
  | { id: number; type: 'flash'; text: string; strong?: boolean }
  | { id: number; type: 'heatSpike'; amount: number }
  | { id: number; type: 'ring'; beat: RingBeat; actor: SideKey | null; label?: string };

export type RingBeat = 'move_started' | 'move_landed' | 'reversal' | 'crash' | 'setup' | 'pin' | 'kickout' | 'submission' | 'escape' | 'count' | 'control';

/* ---------- interactions the engine asks the UI for ---------- */

/** A contested roll: a move attempt or a contested setup. See dice.ts. */
export interface ContestSpec {
  id: number;
  kind: 'move' | 'setup';
  attacker: SideKey;
  defender: SideKey;
  /** Move name or setup title. */
  title: string;
  major: 'SIGNATURE' | 'FINISHER' | null;
  attack: ContestSide;
  defend: ContestSide;
  /** Attacker's chance to win (0–100), with any pushes already declared. */
  chance: number;
  /** Can the player push on this roll (enough momentum, no signature banked)? */
  playerCanPush: boolean;
  /** Moves only: the defender went for the reversal (the only time a move is rolled for). */
  defence: 'reverse' | null;
}

/** The defender's choice before a move: reverse (roll), brace or ride it out. */
export interface DefendSpec {
  id: number;
  attacker: SideKey;
  defender: SideKey;
  moveName: string;
  /** "Grapple", "Strike"… */
  moveType: string;
  impact: number;
  major: 'SIGNATURE' | 'FINISHER' | null;
  /** Where it'll hit: "head", "left leg"… */
  aimed: string;
  /** The defender's chance to reverse it if they go for it (0–100). */
  reverseChance: number;
  telegraphed: boolean;
  /** The contest that's rolled if they go for the reversal. */
  attack: ContestSide;
  defend: ContestSide;
}

/** The player is pinned: hold, release in the gold before three. */
export interface KickoutSpec {
  id: number;
  pinner: SideKey;
  /** Gold zone width as % of the fill track. */
  width: number;
  /** Gold centre, 0–1. */
  center: number;
  fillDuration: number;
  timeLimit: number;
  /** Forgiveness either side of the zone, in % of the track (Godot: 4px touch on a ~400px track). */
  forgiveness: number;
}

/** Player landed a pin combo / flash pin: cover now, or keep the upper hand (web addition). */
export interface PinChoiceSpec {
  id: number;
  moveId: string;
  moveName: string;
  /** Chance (0–100) they stay down for three, before any Resiliency. */
  odds: number;
  /** One word for the opponent's condition: fresh / holding up / worn / wrecked. */
  condition: string;
  /** The opponent still has their one-use Resiliency. */
  resiliency: boolean;
}

/** A signature has landed for the player: cash in 50 momentum for a finisher, or keep it (web addition). */
export interface SigConvertSpec {
  id: number;
  moveId: string;
  moveName: string;
  momentum: number;
  /** Finishers already banked. */
  stock: number;
  target: TargetResolution;
}

/** A hold has landed for the player: go for the tap (the tug) or work the hold (web addition). */
export interface SubChoiceSpec {
  id: number;
  moveId: string;
  moveName: string;
  target: TargetResolution;
  partLabel: string;
  /** The targeted part's HP now. */
  partHp: number;
  /** One word for the defender's condition: fresh / holding up / worn / wrecked. */
  condition: string;
  /** Damage working the hold would do (total across parts). */
  workDamage: number;
  finisher: boolean;
}

/** Submission tug-of-war. 100 = tap. */
export interface SubSpec {
  id: number;
  attacker: SideKey;
  defender: SideKey;
  /** Player's direction: +1 attacking (push right), -1 defending (push left). */
  playerDirection: 1 | -1;
  playerScore: number;
  aiScore: number;
  tapThreshold: number;
  escapeThreshold: number;
  speedMultiplier: number;
  /** Where the marker starts (0–100): set by the defender's condition (web addition). */
  start: number;
  moveName: string;
  partLabel: string;
  finisher: boolean;
}

export type SubOutcome = 'TAP_OUT' | 'SUBMISSION_ESCAPE' | 'BOTCH_OR_SCRAMBLE';

/** Count at which the player released successfully: 0 = before one, 1, 2. 3 never (that's a pin). */
export type KickoutCount = 0 | 1 | 2 | 3;

export type Cont =
  | { to: 'next' }
  | { to: 'bell' }
  | { to: 'neutralRecovery' }
  | { to: 'startSub'; k: SideKey; moveId: string; target: TargetResolution }
  | { to: 'startPin'; k: SideKey; embedded: boolean }
  | { to: 'nextFall' }
  | { to: 'autoRecover'; id: SetupId }
  | { to: 'pinNeutral' }
  | { to: 'final' };

export type Pending =
  | { kind: 'idle' }
  | { kind: 'continue'; delay: number; cont: Cont }
  | { kind: 'awaitPlayer' }
  | { kind: 'aiThinking' }
  /** Waiting for the player to roll (and decide whether to push). */
  | { kind: 'defend'; spec: DefendSpec }
  | { kind: 'contest'; spec: ContestSpec }
  /** Rolled: the UI animates the dice, then calls applyContest(). */
  | { kind: 'contestRoll'; spec: ContestSpec; roll: ContestRoll }
  | { kind: 'kickout'; spec: KickoutSpec }
  /** AI pinned: the count is pre-rolled; the UI counts it out. kickoutAt null = pinned. */
  | { kind: 'refCount'; id: number; pinner: SideKey; kickoutAt: 1 | 2 | 3 | null }
  | { kind: 'sub'; spec: SubSpec }
  | { kind: 'resiliency'; id: number; threat: 'pinfall' | 'submission' }
  | { kind: 'pinChoice'; spec: PinChoiceSpec }
  | { kind: 'sigConvert'; spec: SigConvertSpec }
  | { kind: 'subChoice'; spec: SubChoiceSpec }
  /** Last Man Standing: the player is being counted and has to get up (hands-on, like a kickout). */
  | { kind: 'tenCount'; spec: TenCountSpec }
  /** Last Man Standing: the AI is being counted; pre-rolled, the UI counts it out. beatenAt null = stays down. */
  | { kind: 'refTen'; id: number; counted: SideKey; beatenAt: number | null }
  | { kind: 'over' };

/** The player's ten count: hold and release in the gold, like the kickout, but slower and out of ten. */
export interface TenCountSpec {
  id: number;
  /** Gold zone width as % of the track. */
  width: number;
  /** Gold centre, 0–1. */
  center: number;
  /** Seconds for the bar to fill. */
  fillDuration: number;
  /** Seconds before ten. */
  timeLimit: number;
  forgiveness: number;
}

/* ---------- result & rating ---------- */

export interface MatchResult {
  winner: SideKey | null;
  loser: SideKey | null;
  finish: FinishType;
  move: Move | null;
  t: number;
  byFin: boolean;
  byFlash: boolean;
  afterFk: boolean;
  /** Multi-fall matches: the final score. */
  score?: Record<SideKey, number>;
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

/** Crowd/rating bookkeeping from Match of the Night, layered on the RtR engine. */
export interface CrowdStats {
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
  heatSeg: SideKey | null;
  comeback: SideKey | null;
  limbPayoff: boolean;
  finAttemptsSeen: boolean;
  /** Finishers each side has kicked out of. */
  fkAbsorbed: Record<SideKey, number>;
  /** Stipulation and hardcore evidence for the rating. */
  tableBreaks: number;
  weaponHits: number;
  bleeds: number;
  ladderPulls: number;
  climbStops: number;
  cageClimbs: number;
  travel: number;
  falls: number;
  tenCounts: number;
  nearQuits: number;
  dirty: number;
  /** Holds that nearly made someone tap. */
  nearTaps?: number;
  /** Escapes from a hold that had them nearly tapping: the rope-break moment. */
  ropeBreaks?: number;
  /** Big hard-hitting moves landed (impact 9+, not counted as high-risk): powerhouses' and strikers' spectacle. */
  bigHits?: number;
  /** A reversal straight back from a reversal: counter for counter. */
  counters?: number;
  /** Who reversed last, and when (for counters). */
  lastRev?: SideKey | null;
  lastRevT?: number;
}

/* ---------- view ---------- */

export interface SideView {
  key: SideKey;
  hp: HP;
  stamina: number;
  maxStamina: number;
  fatigue: number;
  momentum: number;
  signatureReady: boolean;
  finisherStock: number;
  state: Snapshot;
  exhaustion: string;
  targetFocus: Part;
  resiliencyAvailable: boolean;
  /** Name of what they're holding, if anything. */
  held: string | null;
  bleeding: number;
  /** Referee warning points (four is a DQ where there are DQs). */
  warnings: number;
}

export interface MatchView {
  t: number;
  heat: number;
  control: Control | null;
  over: boolean;
  phase: string;
  count: number | null;
  sides: Record<SideKey, SideView>;
  /** Star rating so far (the in-match tracker). */
  live: LiveRating;
}

export interface MatchRulesConfig {
  /** Seconds the clock advances per action: 10, 15, 20, 25 or 30. */
  actionClock: number;
  countOuts: boolean;
  countOutLimit: number;
  title: boolean;
  /**
   * The presenting promotion's initials, '' for an independent show, or undefined to pick
   * automatically from the wrestlers (their shared promotion, else a dream match).
   */
  eventPromotion?: string;
  /** A specific title on the line (implies title: true). */
  titleId?: string;
  stipulation: StipulationId;
  dq: boolean;
  weapons: boolean;
  /** Set from the stipulation (and the cage toggles). */
  pins: boolean;
  subs: boolean;
  ironManMinutes: number;
  ladderPrize: 'Championship' | 'Briefcase';
  cageEscape: boolean;
  cagePins: boolean;
  cageSubs: boolean;
  /** Career shows: the real show name and venue instead of a generated one. */
  eventName?: string;
  venueName?: string;
  /** Career: the booker's planned winner gets this much on their rolls (AI title matches only). */
  booked?: { side: SideKey; bonus: number };
  /** Career: a big match (special, flagship, cup final, farewell); title matches count anyway. */
  big?: boolean;
  /** Career: fatigue carried in, as the share of stamina each side starts with (1 = fresh). */
  freshness?: Partial<Record<SideKey, number>>;
  /** Wellbeing: a bonus (or penalty) on every roll for each side. */
  mood?: Partial<Record<SideKey, number>>;
  /** Chemistry between the two: added to the stars. */
  chemistry?: number;
}

export interface MatchState {
  id: number;
  /** Crowd heat at every clock step: the record's crowd graph. */
  heatLine: number[];
  rules: MatchRulesConfig;
  you: Side;
  them: Side;
  t: number;
  control: Control | null;
  over: boolean;
  /** Favoured side for the next neutral recovery (80/20), if any. */
  neutralFavoured: SideKey | null;
  /** Side that just reversed: its next landed pin counts as a flash catch. */
  recentReversalSide: SideKey | null;

  referee: { active: boolean; value: number; elapsed: number; pendingResolution: boolean; outside: Record<SideKey, boolean> };
  ref: RefereeWatch;
  env: { objects: EnvObject[]; nextId: number; padRemoved: boolean };
  obj: Objective;
  phase: { name: 'opening' | 'middle' | 'closing'; drama: number; controlSwings: number; actionsSinceChange: number };

  heat: number;
  crowd: CrowdStats;
  streak: { who: SideKey | null; n: number };

  event: string;
  venue: string;
  titleName: string;

  pinContext: PinContext | null;
  /** The move or setup currently waiting on a timing interaction. */
  txn: Txn | null;
  result: MatchResult | null;
  rating: Rating | null;
  pending: Pending;
  log: LogEntry[];
  events: EngineEvent[];
  view: MatchView;
  seq: number;
}

export type Txn =
  | { kind: 'move'; k: SideKey; move: Move; target: TargetResolution; chance: number }
  | { kind: 'setup'; k: SideKey; action: SetupId; chance: number }
  | { kind: 'sub'; k: SideKey; move: Move; target: TargetResolution; nearTapSaid: boolean; nearEscapeSaid: boolean; lastMarker: number; quit?: boolean };

export interface PinContext {
  embedded: boolean;
  lastMove: Move | null;
  lastMoveWasFinisher: boolean;
  flashQualified: boolean;
  flashSuccess: boolean;
  squashQualified: boolean;
}

/** An AI (or auto-player) decision. */
export type Choice =
  | { kind: 'move'; move: Move; score: number; target: TargetResolution }
  | { kind: 'setup'; action: SetupId; score: number; path?: SetupId[]; plannedMove?: Move | null }
  | { kind: 'pin'; score: number };
