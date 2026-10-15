/*
 * Contested rolls: the web version's replacement for the reversal ring and the setup bar.
 * The attacker rolls a d20 and the defender a d16, and moves add +2 initiative on top,
 * each adding modifiers built from the things the match already tracks
 * (attributes, momentum, exhaustion, the six body parts, position, repetition). Highest total
 * wins; the attacker wins ties. Naturals (a top roll or a 1) trump totals. Advantage = roll two, keep the
 * higher; disadvantage = keep the lower. Either side can spend momentum to push for advantage.
 */
import type { BodyPart, Move, MoveType } from '../data/rtr/types';
import { exhaustionBand, moveDemand, staminaPercent, type ExhaustionBand } from './exhaustion';
import { classCompatible, inferredClassCompatible, isHighRisk } from './interaction';
import type { Rng } from './rng';
import { isFinisherMove, isSignatureMove, lastAttemptedMoveMatches, recentMoveTypeCount, setupPatternRepeats } from './side';
import { groundArea } from './stip';
import { targetHp } from './targeting';
import type { MatchState, SetupId, Side, SideKey, TargetResolution } from './types';

export interface Mod {
  label: string;
  value: number;
}

export interface ContestSide {
  key: SideKey;
  mods: Mod[];
  /** Sum of mods. */
  bonus: number;
  /** Reasons for advantage (+) and disadvantage (−), shown as chips. */
  edges: { label: string; dir: 1 | -1 }[];
  pushed: boolean;
}

export type Crit = 'attackerTop' | 'attacker1' | 'defenderTop' | 'defender1' | null;

/** Die sizes: the attacker's d20 against the defender's d16. */
export const ATTACK_DIE = 20;
export const DEFEND_DIE = 16;

export interface ContestRoll {
  /** Dice actually thrown (two with advantage or disadvantage). */
  attackerDice: number[];
  defenderDice: number[];
  attackerKept: number;
  defenderKept: number;
  attackerTotal: number;
  defenderTotal: number;
  landed: boolean;
  crit: Crit;
}

export const PUSH_COST = 20;

/** Dice modifier from a 0–100 attribute: 70 is average (+0), 98 ≈ +4, 35 ≈ −4. */
export const statMod = (v: number): number => Math.round((v - 70) / 7);

const BAND_PENALTY: Record<ExhaustionBand, number> = { Fresh: 0, Winded: -1, Tired: -2, Exhausted: -3, Spent: -5 };

const ATTACK_STAT: Record<MoveType, keyof Side['w']['stats']> = {
  NONE: 'skill', STRIKE: 'striking', GRAPPLE: 'strength', SUBMISSION: 'skill', AERIAL: 'speed', SPRINGBOARD: 'speed',
  RUNNING: 'speed', REVERSAL: 'skill', PINNING_MOVE: 'skill', WEAPON: 'strength', ENVIRONMENTAL: 'strength',
};
const STAT_LABEL: Record<keyof Side['w']['stats'], string> = {
  strength: 'Strength', speed: 'Speed', stamina: 'Stamina', skill: 'Skill', striking: 'Striking', charisma: 'Charisma',
};

const SKILL_SETUPS: ReadonlySet<SetupId> = new Set<SetupId>([
  'get_behind_opponent', 'turn_opponent_face_up', 'turn_opponent_face_down', 'sit_opponent_up_front', 'sit_opponent_up_back',
  'pull_opponent_to_knees_front', 'pull_opponent_to_knees_back', 'grapple_opponent', 'catch_opponent_running', 'turn_opponent_in_corner',
]);

/** Stats for the stipulation, object and dirty-tactic actions. */
const EXTRA_STAT: Partial<Record<SetupId, keyof Side['w']['stats']>> = {
  climb_ladder: 'speed', climb_ladder_top: 'speed', climb_cage: 'speed', reach_cage_top: 'speed', escape_over_cage: 'speed',
  eye_rake: 'skill', closed_fist: 'striking',
};
const CLIMBS: ReadonlySet<SetupId> = new Set<SetupId>(['climb_ladder', 'climb_ladder_top', 'climb_cage', 'reach_cage_top', 'escape_over_cage']);

/** Which of the attacker's own limbs a move relies on. */
function limbsUsed(m: Move): BodyPart[] {
  if (m.type === 'AERIAL' || m.type === 'SPRINGBOARD' || m.type === 'RUNNING') return ['LEFT_LEG', 'RIGHT_LEG'];
  if ((m.type === 'GRAPPLE' || m.type === 'SUBMISSION') && m.impact >= 6) return ['LEFT_ARM', 'RIGHT_ARM'];
  return [];
}

const push = (mods: Mod[], label: string, value: number) => {
  if (value) mods.push({ label, value });
};

function exhaustion(mods: Mod[], s: Side, explosive: boolean) {
  const band = exhaustionBand(s);
  push(mods, band, BAND_PENALTY[band] - (explosive && BAND_PENALTY[band] <= -2 ? 1 : 0));
}

function momentum(mods: Mod[], s: Side) {
  push(mods, `Momentum ${Math.round(s.momentum)}`, Math.floor(s.momentum / 25));
}

const isDown = (s: Side) =>
  s.state.position === 'GROUNDED' || s.state.position === 'SEATED' || s.state.position === 'KNEELING' || s.state.area === 'CORNER';

interface Counter {
  mods: Mod[];
  /** The defender's own disadvantages. */
  own: ContestSide['edges'];
  /** Openings the defender is giving the attacker (a flat bonus, never a second die). */
  openings: Mod[];
}

/** Set up, off the ropes, staggering, still rising. */
const OPENING_BONUS = 2;

function counterSide(D: Side): Counter {
  const mods: Mod[] = [], own: ContestSide['edges'] = [], openings: Mod[] = [];
  const counter = (D.w.stats.skill + D.w.stats.speed) / 2;
  push(mods, `Skill/Speed ${Math.round(counter)}`, statMod(counter));
  momentum(mods, D);
  push(mods, 'Technician', D.w.classes.includes('TECHNICIAN') ? 1 : 0);
  exhaustion(mods, D, false);
  if (D.hp.HEAD < 40) push(mods, 'Rattled (head)', D.hp.HEAD < 25 ? -3 : -2);
  push(mods, 'Bleeding', -D.bleeding);
  if (exhaustionBand(D) === 'Spent') own.push({ label: 'Spent', dir: -1 });
  const m = D.state.motion;
  if (m === 'ROPE_REBOUND') push(openings, 'Off the ropes', OPENING_BONUS);
  else if (m === 'STAGGERING') push(openings, 'Staggering', OPENING_BONUS);
  else if (m === 'RISING') push(openings, 'Still rising', OPENING_BONUS);
  return { mods, own, openings };
}

const sum = (mods: Mod[]) => mods.reduce((t, m) => t + m.value, 0);

function side(key: SideKey, mods: Mod[], edges: ContestSide['edges']): ContestSide {
  return { key, mods, bonus: sum(mods), edges, pushed: false };
}

/** Attacker vs defender for a move attempt. */
export function moveContest(A: Side, D: Side, move: Move, target: TargetResolution): { attack: ContestSide; defend: ContestSide } {
  const aMods: Mod[] = [], aEdges: ContestSide['edges'] = [];
  const stat = ATTACK_STAT[move.type];
  push(aMods, `${STAT_LABEL[stat]} ${A.w.stats[stat]}`, statMod(A.w.stats[stat]));
  push(aMods, 'Initiative', 2);
  momentum(aMods, A);
  push(aMods, 'Their style', classCompatible(A, move) || inferredClassCompatible(A, move) ? 1 : 0);
  if (isFinisherMove(A, move)) push(aMods, 'Finisher', 2);
  else if (isSignatureMove(A, move)) push(aMods, 'Signature', 1);
  if (isHighRisk(move)) push(aMods, 'High risk', -2);
  else if (move.impact >= 9) push(aMods, 'Big move', -1);
  else if (move.impact <= 3) push(aMods, 'Quick', 1);
  const hp = targetHp(D.hp, target);
  push(aMods, `${target.fullTag.toLowerCase()} worn (${Math.round(hp)})`, hp < 25 ? 3 : hp < 50 ? 2 : hp < 75 ? 1 : 0);
  push(aMods, 'Opponent down', isDown(D) ? 2 : 0);
  exhaustion(aMods, A, moveDemand(move, isSignatureMove(A, move)) === 'EXPLOSIVE');
  const limbs = limbsUsed(move);
  if (limbs.length) {
    const worst = Math.min(...limbs.map((p) => A.hp[p]));
    const which = limbs[0]!.endsWith('LEG') ? 'leg' : 'arm';
    if (worst < 25) aEdges.push({ label: `Bad ${which}`, dir: -1 });
    else push(aMods, `Sore ${which} (${Math.round(worst)})`, worst < 50 ? -2 : 0);
  }
  if (exhaustionBand(A) === 'Spent') aEdges.push({ label: 'Spent', dir: -1 });
  // Set-ups and openings are flat bonuses: the attacker's d20 is already their edge, so the only
  // way they get a second die is paying for it with a push.
  if (A.setUp) push(aMods, 'Set up', OPENING_BONUS);

  const { mods: dMods, own: dEdges, openings } = counterSide(D);
  aMods.push(...openings);
  if (lastAttemptedMoveMatches(A, move)) dEdges.push({ label: 'Saw it coming', dir: 1 });
  else if (recentMoveTypeCount(A, move.type, 5) >= 3) push(dMods, 'Reading the offence', 2);
  if (setupPatternRepeats(A, move)) push(dMods, 'Same set-up again', 1);
  return { attack: side(A.key, aMods, aEdges), defend: side(D.key, dMods, dEdges) };
}

/** Attacker vs defender for a contested setup (whips, corners, apron, taunts…). */
export function setupContest(A: Side, D: Side, id: SetupId, S?: MatchState): { attack: ContestSide; defend: ContestSide } {
  const aMods: Mod[] = [], aEdges: ContestSide['edges'] = [];
  const stat = id === 'taunt' ? 'charisma' : EXTRA_STAT[id] ?? (SKILL_SETUPS.has(id) ? 'skill' : 'strength');
  push(aMods, `${STAT_LABEL[stat]} ${A.w.stats[stat]}`, statMod(A.w.stats[stat]));
  momentum(aMods, A);
  const climb = CLIMBS.has(id);
  push(aMods, 'Opponent down', isDown(D) ? (climb ? 4 : 2) : 0);
  if (climb && S) {
    // Godot: a defender who isn't there, is down, or is spent can hardly stop a climb.
    const where = id === 'climb_ladder' || id === 'climb_ladder_top' ? groundArea(S, A.key) : 'IN_RING';
    push(aMods, 'Out of reach', groundArea(S, D.key) !== where ? 4 : 0);
    push(aMods, 'Too tired to stop it', D.fatigue >= 70 || staminaPercent(D) <= 25 ? 2 : 0);
  }
  // Getting over the top of a cage is the hard part.
  if (id === 'escape_over_cage') push(aMods, 'Over the top', -3);
  else if (id === 'climb_cage' || id === 'reach_cage_top') push(aMods, 'Climbing steel', -1);
  exhaustion(aMods, A, false);
  if (exhaustionBand(A) === 'Spent') aEdges.push({ label: 'Spent', dir: -1 });
  const { mods: dMods, own: dEdges, openings } = counterSide(D);
  aMods.push(...openings);
  if (A.recentSetups.slice(-3).filter((p) => p === id).length >= 2) push(dMods, 'Same trick again', 2);
  return { attack: side(A.key, aMods, aEdges), defend: side(D.key, dMods, dEdges) };
}

/** Net edge: +1 advantage, −1 disadvantage, 0 straight roll. A push adds one advantage. */
export function edgeOf(s: ContestSide): -1 | 0 | 1 {
  const n = s.edges.reduce((t, e) => t + e.dir, 0) + (s.pushed ? 1 : 0);
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Probability the kept die (n faces) shows k. */
const keptP = (k: number, n: number, edge: -1 | 0 | 1): number =>
  edge === 0 ? 1 / n : edge > 0 ? (2 * k - 1) / (n * n) : (2 * n + 1 - 2 * k) / (n * n);

/** Who wins a pair of kept dice. */
export function judge(a: number, d: number, aBonus: number, dBonus: number): { landed: boolean; crit: Crit } {
  if (a === 1) return { landed: false, crit: 'attacker1' };
  if (d === DEFEND_DIE) return { landed: false, crit: 'defenderTop' };
  if (a === ATTACK_DIE) return { landed: true, crit: 'attackerTop' };
  if (d === 1) return { landed: true, crit: 'defender1' };
  return { landed: a + aBonus >= d + dBonus, crit: null };
}

/** Exact chance (0–100) the attacker wins. */
export function landChance(attack: ContestSide, defend: ContestSide): number {
  const ea = edgeOf(attack), ed = edgeOf(defend);
  let p = 0;
  for (let a = 1; a <= ATTACK_DIE; a++) {
    for (let d = 1; d <= DEFEND_DIE; d++) {
      if (judge(a, d, attack.bonus, defend.bonus).landed) p += keptP(a, ATTACK_DIE, ea) * keptP(d, DEFEND_DIE, ed);
    }
  }
  return p * 100;
}

/** The attacker's chance to land a move, before anyone pushes (AI planning). */
export function moveLandChance(A: Side, D: Side, move: Move, target: TargetResolution): number {
  const { attack, defend } = moveContest(A, D, move, target);
  return landChance(attack, defend);
}

export function setupLandChance(A: Side, D: Side, id: SetupId): number {
  const { attack, defend } = setupContest(A, D, id);
  return landChance(attack, defend);
}

function throwDice(rnd: Rng, faces: number, edge: -1 | 0 | 1): { dice: number[]; kept: number } {
  const roll = () => 1 + Math.floor(rnd() * faces);
  if (edge === 0) {
    const v = roll();
    return { dice: [v], kept: v };
  }
  const dice = [roll(), roll()];
  return { dice, kept: edge > 0 ? Math.max(...dice) : Math.min(...dice) };
}

export function rollContest(rnd: Rng, attack: ContestSide, defend: ContestSide): ContestRoll {
  const a = throwDice(rnd, ATTACK_DIE, edgeOf(attack)), d = throwDice(rnd, DEFEND_DIE, edgeOf(defend));
  const { landed, crit } = judge(a.kept, d.kept, attack.bonus, defend.bonus);
  return {
    attackerDice: a.dice, defenderDice: d.dice, attackerKept: a.kept, defenderKept: d.kept,
    attackerTotal: a.kept + attack.bonus, defenderTotal: d.kept + defend.bonus, landed, crit,
  };
}

/** Pushing costs momentum, and you can't push while sitting on a ready signature. */
export const canPush = (s: Side): boolean => s.momentum >= PUSH_COST && !s.signatureReady;
