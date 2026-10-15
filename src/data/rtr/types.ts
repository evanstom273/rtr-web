// Types for content imported from the Godot project (scripts/import-godot.mjs).
// Enum string values mirror the GDScript enum names exactly.

export type Position = 'NONE' | 'STANDING' | 'GROUNDED' | 'SEATED' | 'KNEELING' | 'PERCHED' | 'CLIMBING';
export type Orientation = 'NONE' | 'FRONT' | 'BACK' | 'FACE_UP' | 'FACE_DOWN';
export type Area = 'IN_RING' | 'CORNER' | 'ROPES' | 'APRON' | 'OUTSIDE' | 'RAMP' | 'TOP_ROPE' | 'LADDER' | 'CROWD' | 'BACKSTAGE' | 'CAGE';
export type Motion = 'STATIONARY' | 'RUNNING' | 'ROPE_REBOUND' | 'RISING' | 'STAGGERING';
export type MoveType =
  | 'NONE' | 'STRIKE' | 'GRAPPLE' | 'SUBMISSION' | 'AERIAL' | 'SPRINGBOARD' | 'RUNNING'
  | 'REVERSAL' | 'PINNING_MOVE' | 'WEAPON' | 'ENVIRONMENTAL';
export type Part = 'NONE' | 'HEAD' | 'BODY' | 'LEFT_ARM' | 'RIGHT_ARM' | 'LEFT_LEG' | 'RIGHT_LEG';
export type BodyPart = Exclude<Part, 'NONE'>;
export type TargetingMode = 'FIXED_PARTS' | 'CHOOSE_ARM' | 'CHOOSE_LEG' | 'BOTH_ARMS' | 'BOTH_LEGS';
export type StrikeWeight = 'WEAK' | 'MEDIUM' | 'HEAVY';
export type InteractionOverride = 'AUTO' | 'TIMING_STRIKE' | 'TIMING_AERIAL' | 'HOLD_POWER' | 'SUBMISSION_LOCK_IN';
export type AreaRequirementMode = 'SPECIFIC' | 'ANY' | 'SAME_AS_OTHER' | 'SHARED_FLAT_AREA';
export type AreaResultMode = 'UNCHANGED' | 'SPECIFIC';
export type WrestlerClass = 'HIGH_FLYER' | 'POWERHOUSE' | 'TECHNICIAN' | 'STRIKER' | 'HARDCORE';
export type Disposition = 'NONE' | 'FACE' | 'HEEL';
export type Gender = 'NONE' | 'MALE' | 'FEMALE';

export interface StateRequirement {
  position: Position;
  orientation: Orientation;
  areaMode: AreaRequirementMode;
  area: Area;
  motion: Motion;
}

export interface StateResult {
  position: Position;
  orientation: Orientation;
  areaMode: AreaResultMode;
  area: Area;
  motion: Motion;
}

export interface Move {
  id: string;
  name: string;
  type: MoveType;
  classPref: WrestlerClass[];
  parts: Part[];
  targeting: TargetingMode;
  defaultSide: Part;
  /** a = attacker, t = target */
  req: { a: StateRequirement; t: StateRequirement };
  res: { a: StateResult; t: StateResult };
  finisher: boolean;
  submission: boolean;
  flashPin: boolean;
  pinningCombo: boolean;
  interaction: InteractionOverride;
  strike: boolean;
  strikeWeight: StrikeWeight;
  /** 1–10 */
  impact: number;
  extraTargetPositions: Position[];
  description?: string;
}

export interface Attributes {
  strength: number;
  speed: number;
  stamina: number;
  skill: number;
  striking: number;
  charisma: number;
}

export interface Popularity {
  global: number;
  northAmerica: number;
  southAmerica: number;
  europe: number;
  asia: number;
  africa: number;
  oceania: number;
}

export interface Wrestler {
  id: string;
  wrestlerId: number;
  name: string;
  gimmick: string;
  gimmickDescription: string;
  classes: WrestlerClass[];
  gender: Gender;
  disposition: Disposition;
  age: number;
  height: string;
  weight: number;
  region: string;
  regionLabel: string;
  country: string;
  /** Promotion initials, e.g. "NWGP". */
  promotion: string;
  division: 'MENS' | 'WOMENS' | '';
  stats: Attributes;
  popularity: Popularity;
  /** Move ids. 40 regular, 2 signatures, 3 finishers. */
  moves: string[];
  signatures: string[];
  finishers: string[];
}

export interface Promotion {
  id: number;
  name: string;
  initials: string;
  indie: boolean;
  region: string;
  titles: string[];
}

export interface Title {
  id: string;
  name: string;
  promotionId: number;
  gender: 'MALE' | 'FEMALE';
  /** Promotion-local wrestler id; 0 = vacant. */
  holderId: number;
  weeksHeld: number;
}

export type WeaponKind = 'HANDHELD' | 'TABLE' | 'LADDER' | 'THUMBTACKS';

export interface WeaponAttack {
  id: string;
  name: string;
  /** Who it's aimed at: a standing opponent, or one on the mat (seated and kneeling count). */
  posture: 'STANDING' | 'GROUNDED';
  impactMod: number;
  staminaMod: number;
  strike: boolean;
  resultPosition: Position;
  resultOrientation: Orientation;
}

export interface Weapon {
  id: string;
  name: string;
  description: string;
  kind: WeaponKind;
  /** 1–10 */
  impact: number;
  staminaCost: number;
  targetPart: Part;
  /** Disqualifies in a match with DQs. */
  illegal: boolean;
  retrievable: boolean;
  aiWeight: number;
  minDurability: number;
  maxDurability: number;
  /** 0–100: how likely it is to open a cut. */
  bleed: number;
  /** Can cut anywhere, not only the head. */
  bleedAnyTarget: boolean;
  canSetFlat: boolean;
  canSetCorner: boolean;
  canStack: boolean;
  canClimb: boolean;
  canSpread: boolean;
  /** How many can be in play at once. */
  maxLive: number;
  attacks: WeaponAttack[];
}
