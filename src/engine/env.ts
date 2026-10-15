// Weapons and objects in play (MatchEnvironmentState + MatchWeaponInstance), the runtime weapon
// attacks (_build_runtime_weapon_moves) and bleeding (_maybe_advance_bleeding).
import { WEAPONS, getWeapon, type Weapon, type WeaponAttack } from '../data/rtr';
import { LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { say } from './commentary';
import { clamp, randInt } from './rng';
import type { Area, BodyPart, EnvObject, MatchState, Move, ObjectState, Side, SideKey } from './types';

export const MAX_LIVE_OBJECTS = 6;

export const isLive = (o: EnvObject): boolean => o.state !== 'broken' && o.state !== 'consumed';
export const liveObjects = (S: MatchState): EnvObject[] => S.env.objects.filter(isLive);
export const weaponOf = (o: EnvObject): Weapon => getWeapon(o.weaponId);

export const heldBy = (S: MatchState, k: SideKey): EnvObject | null =>
  S.env.objects.find((o) => isLive(o) && o.state === 'held' && o.holder === k) ?? null;

export const objectsIn = (S: MatchState, area: Area, states?: ObjectState[]): EnvObject[] =>
  liveObjects(S).filter((o) => o.area === area && (!states || states.includes(o.state)));

export const findSetup = (S: MatchState, kind: Weapon['kind'], area: Area, states: ObjectState[]): EnvObject | null =>
  objectsIn(S, area, states).find((o) => weaponOf(o).kind === kind) ?? null;

export function canRetrieve(S: MatchState, w: Weapon): boolean {
  if (!w.retrievable) return false;
  const live = liveObjects(S);
  if (live.length >= MAX_LIVE_OBJECTS) return false;
  return live.filter((o) => o.weaponId === w.id).length < w.maxLive;
}

export const retrievableWeapons = (S: MatchState): Weapon[] => WEAPONS.filter((w) => canRetrieve(S, w));

export function createHeld(ctx: Ctx, k: SideKey, w: Weapon): EnvObject {
  const S = ctx.S;
  const o: EnvObject = {
    id: S.env.nextId++, weaponId: w.id, durability: clamp(randInt(ctx.rnd, w.minDurability, w.maxDurability), 1, 4),
    state: 'held', area: S[k].state.area, holder: k, positioned: null, positionedBy: null, climber: null, climbStage: 0,
    stackedWith: null,
  };
  S.env.objects.push(o);
  return o;
}

export function dropObject(o: EnvObject, area: Area): void {
  o.state = 'dropped';
  o.area = area;
  o.holder = null;
  o.climber = null;
  o.climbStage = 0;
  o.positioned = null;
  o.positionedBy = null;
}

export function holdObject(o: EnvObject, k: SideKey, area: Area): void {
  o.state = 'held';
  o.holder = k;
  o.area = area;
  o.climber = null;
  o.climbStage = 0;
  o.positioned = null;
  o.positionedBy = null;
}

export function consumeObject(S: MatchState, o: EnvObject, broken: boolean): void {
  o.state = broken ? 'broken' : 'consumed';
  o.holder = null;
  o.climber = null;
  o.positioned = null;
  o.positionedBy = null;
  if (o.stackedWith) {
    const partner = S.env.objects.find((p) => p.id === o.stackedWith);
    o.stackedWith = null;
    if (partner && isLive(partner)) consumeObject(S, partner, broken);
  }
}

/** A wrestler leaving an area lets go of whatever was set up around them. */
export function releasePositioning(S: MatchState, k: SideKey): void {
  for (const o of liveObjects(S)) {
    if (o.positioned === k) {
      o.positioned = null;
      o.positionedBy = null;
    }
  }
}

/* ---------- weapon attacks as moves ---------- */

interface WeaponMoveInfo {
  weapon: Weapon;
  attack: WeaponAttack;
}

const weaponMoveInfo = new Map<string, WeaponMoveInfo>();

function buildWeaponMove(w: Weapon, a: WeaponAttack): Move {
  const grounded = a.posture === 'GROUNDED';
  return {
    id: `weapon:${a.id}`,
    name: a.name,
    type: 'WEAPON',
    classPref: ['HARDCORE'],
    parts: [w.targetPart],
    targeting: 'FIXED_PARTS',
    defaultSide: 'NONE',
    req: {
      a: { position: 'STANDING', orientation: 'NONE', areaMode: 'ANY', area: 'IN_RING', motion: 'STATIONARY' },
      t: { position: grounded ? 'GROUNDED' : 'STANDING', orientation: 'NONE', areaMode: 'SAME_AS_OTHER', area: 'IN_RING', motion: 'STATIONARY' },
    },
    res: {
      a: { position: 'STANDING', orientation: 'FRONT', areaMode: 'UNCHANGED', area: 'IN_RING', motion: 'STATIONARY' },
      t: { position: a.resultPosition, orientation: a.resultOrientation, areaMode: 'UNCHANGED', area: 'IN_RING', motion: 'STATIONARY' },
    },
    finisher: false,
    submission: false,
    flashPin: false,
    pinningCombo: false,
    interaction: 'AUTO',
    strike: a.strike,
    strikeWeight: 'HEAVY',
    impact: clamp(w.impact + a.impactMod, 1, 10),
    extraTargetPositions: grounded ? ['SEATED', 'KNEELING'] : [],
    description: w.description,
  };
}

/** Every weapon's attacks, built once (thumbtacks have none). */
export const WEAPON_MOVES: Move[] = WEAPONS.flatMap((w) =>
  w.attacks.map((a) => {
    const m = buildWeaponMove(w, a);
    weaponMoveInfo.set(m.id, { weapon: w, attack: a });
    return m;
  }),
);

export const isWeaponMove = (m: Move): boolean => weaponMoveInfo.has(m.id);
export const weaponForMove = (m: Move): Weapon | null => weaponMoveInfo.get(m.id)?.weapon ?? null;
export const weaponMoveStamina = (m: Move): number => {
  const info = weaponMoveInfo.get(m.id);
  return info ? Math.max(0, info.weapon.staminaCost + info.attack.staminaMod) : 0;
};
export const getWeaponMove = (id: string): Move | undefined => WEAPON_MOVES.find((m) => m.id === id);

/** The attacks the side's held weapon gives them (positions not checked). */
export function weaponMovesFor(S: MatchState, k: SideKey): Move[] {
  if (!S.rules.weapons) return [];
  const held = heldBy(S, k);
  if (!held) return [];
  return WEAPON_MOVES.filter((m) => weaponMoveInfo.get(m.id)!.weapon.id === held.weaponId);
}

/** Weapon damage: impact × 1.75 on the one part, nudged by strength and striking. */
export const WEAPON_DAMAGE_PER_IMPACT = 1.75;

/* ---------- bleeding ---------- */

export const BLEED_WORDS = ['', 'minor', 'moderate', 'heavy'];
/** Fatigue per match-clock step while bleeding. */
export const BLEED_FATIGUE = [0, 0.25, 0.5, 1];
/** Taken off reversal, kickout and submission resistance. */
export const BLEED_PENALTY = [0, 1, 3, 6];

/** Roll for a cut (or a worse one) after a weapon or tack spot. */
export function maybeBleed(ctx: Ctx, victim: SideKey, w: Weapon, impact: number, part: BodyPart, clean = true): void {
  const D = ctx.S[victim];
  if (w.bleed <= 0) return;
  if (!w.bleedAnyTarget && part !== 'HEAD') return;
  if (D.bleeding >= 3) return;
  let chance = w.bleed + Math.max(0, impact - 5) * 3 + (100 - D.hp[part]) * 0.18 + D.bleeding * 4;
  if (!clean) chance *= 0.65;
  if (ctx.rnd() * 100 >= clamp(chance, 0, 95)) return;
  D.bleeding++;
  ctx.S.crowd.bleeds++;
  say(ctx, D.bleeding === 1 ? LINES.bleedStart : LINES.bleedWorse, { d: victim, vars: { x: BLEED_WORDS[D.bleeding]! } }, 'bad');
}

/** Bleeding wears a wrestler down a little every step of the clock. */
export function bleedTick(S: MatchState): void {
  for (const k of ['you', 'them'] as SideKey[]) {
    const s: Side = S[k];
    if (s.bleeding) s.fatigue = clamp(s.fatigue + BLEED_FATIGUE[s.bleeding]!, 0, 100);
  }
}

export const bleedPenalty = (s: Side): number => BLEED_PENALTY[s.bleeding] ?? 0;
