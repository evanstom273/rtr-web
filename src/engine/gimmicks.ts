// Stipulations, part one (match overhaul, stage 5): street fights, no holds barred, Texas death, first
// blood and deathmatches; casket, ambulance and stretcher matches; strap, dog collar and bull rope; the
// lumberjacks; and the object on a pole. Each has its own rules and actions here; the hooks in flow,
// moves and setups call in. None of it runs for the eleven stipulations from before the overhaul.
import { getWeapon } from '../data/rtr';
import { LINES } from '../data/commentary';
import { advanceClock } from './clock';
import type { Ctx } from './ctx';
import { fighting, flash, foe, ring, say } from './commentary';
import { startContest } from './contest';
import { heat } from './crowd';
import { gimmickContest } from './dice';
import { staminaPercent } from './exhaustion';
import { createHeld } from './env';
import { afterAction, render, setControl } from './flow';
import { pinCondition } from './pin';
import { clamp } from './rng';
import { damagePart } from './side';
import { startTenCount } from './stip';
import { aiStructureInstinct, finishStructure, STRUCTURE_ACTIONS, STRUCTURE_TITLE, structureActions, structureContested, STRUCTURES } from './structures';
import type { ActionResult, Area, FinishType, GimmickId, MatchState, Move, SetupId, SideKey, StipulationId } from './types';

const RING: ReadonlySet<Area> = new Set<Area>(['IN_RING', 'ROPES', 'CORNER']);
const OUT: ReadonlySet<Area> = new Set<Area>(['OUTSIDE', 'RAMP', 'CROWD', 'BACKSTAGE']);
const DOWN = (S: MatchState, k: SideKey) => ['GROUNDED', 'SEATED', 'KNEELING'].includes(S.sides[k]!.state.position);
const stip = (S: MatchState): StipulationId => S.rules.stipulation;
const line = (key: string): string => (LINES as unknown as Record<string, string>)[key] ?? '';

/** The stipulations added by the overhaul (the original eleven never see any of this). */
export const NEW_STIPS: ReadonlySet<StipulationId> = new Set<StipulationId>([
  'street_fight', 'no_holds_barred', 'texas_death', 'first_blood', 'deathmatch', 'casket', 'ambulance', 'stretcher', 'strap', 'dog_collar', 'bull_rope', 'lumberjack', 'pole',
  'hell_in_a_cell', 'elimination_chamber', 'wargames', 'scaffold', 'ultimate_x', 'tlc', 'money_in_the_bank',
]);

/** Tied together: what ties them, and the weapon it makes. */
export const TETHER: Partial<Record<StipulationId, string>> = { strap: 'leather_strap', dog_collar: 'collar_chain', bull_rope: 'cowbell' };
/** Tied together, nobody leaves without the other, and their hands are full. */
export const TETHER_BLOCKED: ReadonlySet<SetupId> = new Set<SetupId>(['send_opponent_outside', 'call_opponent_outside', 'exit_ring', 'retrieve_weapon', 'pick_up_weapon', 'drop_weapon']);
/** The deathmatch kit (only under the ring in a deathmatch). */
export const DEATHMATCH_KIT: ReadonlySet<string> = new Set(['glass_pane', 'barbed_board', 'light_tube_bundle']);
/** Where a man ends up to be rolled in, or loaded in. */
const CONTAINER: Partial<Record<StipulationId, { load: GimmickId; finish: GimmickId; area: Area; stages: number; finishType: FinishType }>> = {
  casket: { load: 'load_casket', finish: 'close_casket', area: 'OUTSIDE', stages: 1, finishType: 'CASKET' },
  ambulance: { load: 'load_ambulance', finish: 'shut_ambulance', area: 'RAMP', stages: 1, finishType: 'AMBULANCE' },
  stretcher: { load: 'load_stretcher', finish: 'wheel_stretcher', area: 'RAMP', stages: 2, finishType: 'STRETCHER' },
};
const usesCorners = (S: MatchState): boolean => stip(S) === 'strap' || (stip(S) === 'bull_rope' && !!S.rules.corners);
const hardcore = (S: MatchState): boolean => ['street_fight', 'no_holds_barred', 'texas_death', 'first_blood', 'deathmatch'].includes(stip(S));

export const GIMMICK_TITLE: Record<GimmickId, string> = {
  ...(STRUCTURE_TITLE as Record<GimmickId, string>),
  load_casket: 'Roll them into the casket', close_casket: 'Shut the lid', load_ambulance: 'Throw them in the ambulance',
  shut_ambulance: 'Shut the doors', load_stretcher: 'Strap them to the stretcher', wheel_stretcher: 'Wheel the stretcher',
  climb_out: 'Fight your way out', touch_corner: 'Touch the next corner', climb_pole: 'Climb for it',
};

/* ---------- at the bell ---------- */

/** Rules that come with the stipulation, and whatever's tied on or hung up. */
export function setupGimmicks(ctx: Ctx): void {
  const S = ctx.S, id = stip(S);
  if (id === 'deathmatch' && S.rules.barbedRopes === undefined) S.rules = { ...S.rules, barbedRopes: true };
  const tether = TETHER[id];
  if (tether) {
    for (const k of S.order) {
      const o = createHeld(ctx, k, getWeapon(tether));
      o.fixed = true;
      o.legal = true;
      o.durability = 999;
    }
  }
  if (usesCorners(S)) S.obj.corners = Object.fromEntries(S.order.map((k) => [k, 0]));
  if (id === 'pole') {
    const obj = S.rules.poleObject ?? 'brass_knuckles';
    S.obj.pole = { weaponId: obj, taken: false };
    if (obj === 'contract' && S.rules.poleWins === undefined) S.rules = { ...S.rules, poleWins: true };
  }
  if (CONTAINER[id]) S.obj.container = null;
}

/** The object on the pole, by name (a contract, a briefcase, brass knuckles…). */
export const poleName = (S: MatchState): string => {
  const id = S.obj.pole?.weaponId ?? 'brass_knuckles';
  return id === 'contract' ? 'the contract' : id === 'briefcase' ? 'the briefcase' : getWeapon(id).name.toLowerCase();
};

/* ---------- what's on offer ---------- */

/** The stipulation's own actions open to k right now. */
export function gimmickActions(S: MatchState, k: SideKey): GimmickId[] {
  if (S.over) return [];
  const A = S.sides[k]!, d = foe(S, k), D = S.sides[d];
  if (!D || !fighting(S).includes(d)) return [];
  const out: GimmickId[] = [];
  const up = A.state.position === 'STANDING';
  const c = CONTAINER[stip(S)];
  if (c) {
    const box = S.obj.container;
    if (box?.victim === k) out.push('climb_out');
    else if (box?.by === k && box.victim === d && up) out.push(c.finish);
    else if (!box && up && DOWN(S, d) && (pinCondition(D) < 62 || staminaPercent(D) < 35)) out.push(c.load);
  }
  if (usesCorners(S) && up && RING.has(A.state.area) && RING.has(D.state.area) && (DOWN(S, d) || pinCondition(D) < 55)) out.push('touch_corner');
  const pole = S.obj.pole;
  if (pole && !pole.taken && up && A.state.area === 'IN_RING' && A.state.motion === 'STATIONARY') out.push('climb_pole');
  if (STRUCTURES.has(stip(S))) out.push(...structureActions(S, k));
  return out;
}

/* ---------- doing them ---------- */

/** Does the other one get a say? Not if they're spent, down and out of it, or nowhere near. */
function contested(S: MatchState, k: SideKey, id: GimmickId): boolean {
  const D = S.sides[foe(S, k)]!;
  if (id === 'climb_pole') return D.state.position === 'STANDING' && RING.has(D.state.area);
  if (id === 'climb_out') return false;
  return staminaPercent(D) >= 12 || D.state.position !== 'GROUNDED';
}

export function doGimmick(ctx: Ctx, k: SideKey, id: GimmickId): boolean {
  const S = ctx.S;
  if (!gimmickActions(S, k).includes(id)) return false;
  advanceClock(ctx);
  if (S.over) return true;
  const d = foe(S, k);
  if (id === 'climb_out') return climbOut(ctx, k), true;
  const structure = STRUCTURE_ACTIONS.has(id);
  if (!structure) say(ctx, line(`gim_${id}`), { a: k, d, vars: { x: poleName(S), n: (S.obj.corners?.[k] ?? 0) + 1 } }, 'warn');
  if (!(structure ? structureContested(S, k, id) : contested(S, k, id))) return finishGimmick(ctx, k, d, id, false), true;
  const { attack, defend } = gimmickContest(S.sides[k]!, S.sides[d]!, id, offSpot(S, k, id));
  S.txn = { kind: 'gimmick', k, d, id, chance: 0 };
  startContest(ctx, { kind: 'gimmick', attacker: k, defender: d, title: GIMMICK_TITLE[id], major: null, attack, defend });
  return true;
}

/** Dragging them from the ring to the casket at ringside, or all the way up to the ambulance, is harder. */
function offSpot(S: MatchState, k: SideKey, id: GimmickId): number {
  const c = CONTAINER[stip(S)];
  if (!c || id !== c.load) return 0;
  const a = S.sides[k]!.state.area;
  if (c.area === 'OUTSIDE') return RING.has(a) ? 2 : 0;
  if (c.area === 'RAMP') return RING.has(a) ? 4 : a === 'OUTSIDE' ? 2 : 0;
  return 0;
}

/** The roll's in (or there wasn't one). */
export function finishGimmick(ctx: Ctx, k: SideKey, d: SideKey, id: GimmickId, failed: boolean): void {
  if (STRUCTURE_ACTIONS.has(id)) return finishStructure(ctx, k, d, id, failed);
  const S = ctx.S, A = S.sides[k]!, D = S.sides[d]!, c = S.crowd;
  const box = CONTAINER[stip(S)];
  if (box && id === box.load) {
    if (failed) return fightOff(ctx, k, d, LINES.gimFoughtOff);
    S.obj.container = { victim: d, by: k, stage: 0 };
    D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: box.area, motion: 'STATIONARY' };
    A.state = { ...A.state, area: box.area };
    c.gimmicks = (c.gimmicks ?? 0) + 1;
    heat(ctx, 8);
    say(ctx, line(`gim_${id}_done`), { a: k, d }, 'hl');
    ring(ctx, 'move_landed', k, GIMMICK_TITLE[id]);
    setControl(ctx, k);
    return afterAction(ctx);
  }
  if (box && id === box.finish) {
    const cont = S.obj.container!;
    if (failed) {
      // They fight their way out.
      S.obj.container = null;
      D.state = { position: 'STANDING', orientation: 'FRONT', area: D.state.area, motion: 'STATIONARY' };
      c.gimmicks = (c.gimmicks ?? 0) + 1;
      return fightOff(ctx, k, d, LINES.gimEscapes);
    }
    cont.stage++;
    if (cont.stage < box.stages) {
      heat(ctx, 6);
      say(ctx, LINES.gim_wheel_stretcher_done, { a: k, d }, 'warn');
      A.state = { ...A.state, area: 'RAMP' };
      D.state = { ...D.state, area: 'RAMP' };
      setControl(ctx, k);
      return afterAction(ctx);
    }
    say(ctx, line(`gim_${id}_done`), { a: k, d }, 'hl');
    flash(ctx, GIMMICK_TITLE[id], true);
    S.obj.decision = { winner: k, loser: d, finish: box.finishType, move: null };
    return afterAction(ctx);
  }
  if (id === 'touch_corner') {
    const corners = S.obj.corners!;
    if (failed) {
      corners[k] = 0;
      return fightOff(ctx, k, d, LINES.gimCornersReset);
    }
    corners[k] = (corners[k] ?? 0) + 1;
    c.gimmicks = (c.gimmicks ?? 0) + 1;
    heat(ctx, 3 + corners[k]! * 3);
    D.state = { position: 'GROUNDED', orientation: 'FACE_DOWN', area: 'IN_RING', motion: 'STATIONARY' };
    say(ctx, corners[k]! >= 4 ? LINES.gimFourCorners : LINES.gimCorner, { a: k, d, vars: { n: corners[k]! } }, corners[k]! >= 3 ? 'hl' : 'warn');
    if (corners[k]! >= 4) {
      flash(ctx, 'All four corners!', true);
      S.obj.decision = { winner: k, loser: d, finish: 'CORNERS', move: null };
      return afterAction(ctx);
    }
    setControl(ctx, k);
    return afterAction(ctx);
  }
  if (id === 'climb_pole') {
    const pole = S.obj.pole!;
    if (failed) {
      A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
      return fightOff(ctx, k, d, LINES.gimPulledDown);
    }
    pole.taken = true;
    c.gimmicks = (c.gimmicks ?? 0) + 1;
    heat(ctx, 10);
    say(ctx, LINES.gimPoleGot, { a: k, vars: { x: poleName(S) } }, 'hl');
    flash(ctx, `Got ${poleName(S)}!`, true);
    if (S.rules.poleWins) {
      S.obj.decision = { winner: k, loser: d, finish: 'POLE', move: null };
      return afterAction(ctx);
    }
    const o = createHeld(ctx, k, getWeapon(pole.weaponId));
    o.legal = true;
    setControl(ctx, k);
    return afterAction(ctx);
  }
  setControl(ctx, k);
  afterAction(ctx);
}

/** It didn't come off: the other one fights back and takes over. */
function fightOff(ctx: Ctx, k: SideKey, d: SideKey, line: string): void {
  say(ctx, line, { a: d, d: k, vars: { x: poleName(ctx.S) } }, 'warn');
  ring(ctx, 'reversal', d);
  render(ctx);
  setControl(ctx, d);
  afterAction(ctx);
}

/** In the casket, the ambulance or on the stretcher, with a turn: get out. */
function climbOut(ctx: Ctx, k: SideKey): void {
  const S = ctx.S, s = S.sides[k]!;
  const p = clamp(0.45 + staminaPercent(s) / 200 + s.momentum / 400 - s.fatigue / 300, 0.15, 0.9);
  if (ctx.rnd() < p) {
    S.obj.container = null;
    s.state = { position: 'STANDING', orientation: 'FRONT', area: s.state.area, motion: 'STATIONARY' };
    S.crowd.gimmicks = (S.crowd.gimmicks ?? 0) + 1;
    heat(ctx, 6);
    say(ctx, LINES.gimClimbsOut, { a: k }, 'hl');
    setControl(ctx, k);
    return afterAction(ctx);
  }
  say(ctx, LINES.gimStuck, { a: k }, 'dim');
  setControl(ctx, foe(S, k));
  afterAction(ctx);
}

/* ---------- the AI ---------- */

/** Before the AI's own choice: the stipulation's actions when they're on. */
export function aiGimmickInstinct(ctx: Ctx, k: SideKey): GimmickId | null {
  const S = ctx.S, list = gimmickActions(S, k);
  if (!list.length) return null;
  if (STRUCTURES.has(stip(S))) return aiStructureInstinct(ctx, k, list);
  const D = S.sides[foe(S, k)]!, r = ctx.rnd();
  if (list.includes('climb_out')) return 'climb_out';
  const box = CONTAINER[stip(S)];
  if (box && list.includes(box.finish)) return r < 0.9 ? box.finish : null;
  if (box && list.includes(box.load)) return r < (pinCondition(D) < 40 ? 0.75 : 0.45) ? box.load : null;
  if (list.includes('touch_corner')) return r < (DOWN(S, D.key) ? 0.65 : 0.3) ? 'touch_corner' : null;
  if (list.includes('climb_pole')) return r < (S.rules.poleWins ? (DOWN(S, D.key) ? 0.8 : 0.35) : DOWN(S, D.key) ? 0.6 : 0.15) ? 'climb_pole' : null;
  return null;
}

/* ---------- hooks ---------- */

/** After a landed move: busted open (first blood and the hardcore stipulations), and barbed-wire ropes. */
export function gimmickAfterMove(ctx: Ctx, k: SideKey, move: Move, result: ActionResult): void {
  const S = ctx.S;
  if (!hardcore(S) || result !== 'CLEAN_SUCCESS') return;
  const d = foe(S, k), D = S.sides[d]!;
  if (!D.bleeding && move.parts.includes('HEAD') && move.impact >= 6) {
    const p = (move.impact - 4) * (stip(S) === 'first_blood' ? 0.04 : 0.025) + (D.hp.HEAD < 50 ? 0.05 : 0);
    if (ctx.rnd() < p) {
      D.bleeding = 1;
      S.crowd.bleeds++;
      heat(ctx, 6);
      say(ctx, LINES.gimBustedOpen, { a: k, d }, 'bad');
    }
  }
  if (S.rules.barbedRopes && D.state.area === 'ROPES') {
    damagePart(D, 'BODY', 3);
    say(ctx, LINES.gimBarbedRopes, { d }, 'bad');
    heat(ctx, 4);
    if (!D.bleeding && ctx.rnd() < 0.3) {
      D.bleeding = 1;
      S.crowd.bleeds++;
    }
  }
}

/** Before the decision's settled: the first one bleeding loses. */
export function gimmickBeforeSettle(ctx: Ctx): void {
  const S = ctx.S;
  if (stip(S) !== 'first_blood' || S.over || S.obj.decision) return;
  const bleeder = S.order.find((k) => S.sides[k]!.bleeding > 0 && !S.sides[k]!.out);
  if (!bleeder) return;
  say(ctx, LINES.gimFirstBlood, { d: bleeder }, 'hl');
  flash(ctx, 'First blood!', true);
  S.obj.decision = { winner: foe(S, bleeder), loser: bleeder, finish: 'FIRST_BLOOD', move: null };
}

/** After every action: the lumberjacks throw people back in, and the strap's run of corners is broken. */
export function gimmickAfterAction(ctx: Ctx): void {
  const S = ctx.S;
  if (S.over) return;
  if (stip(S) === 'lumberjack') {
    for (const k of fighting(S)) {
      const s = S.sides[k]!;
      if (!OUT.has(s.state.area)) continue;
      // The other side's friends get their shots in on the way back.
      const beating = 3 + Math.floor(ctx.rnd() * 4);
      damagePart(s, 'BODY', beating);
      s.state = { position: 'GROUNDED', orientation: 'FACE_DOWN', area: 'IN_RING', motion: 'STATIONARY' };
      S.crowd.gimmicks = (S.crowd.gimmicks ?? 0) + 1;
      heat(ctx, 5);
      say(ctx, LINES.gimLumberjacks, { a: k }, 'warn');
      if (S.t >= 480 && ctx.rnd() < 0.08) {
        heat(ctx, 10);
        S.crowd.spots++;
        say(ctx, LINES.gimLumberjackBrawl, {}, 'hl');
      }
    }
  }
  // Came down off the cell roof (or the cables) some other way: they're not up there any more.
  for (const k of S.order) {
    const s = S.sides[k]!;
    if (s.perch === 'roof' && s.state.area !== 'OUTSIDE') s.perch = undefined;
    if (s.perch === 'cables' && s.state.area !== 'TOP_ROPE') {
      s.perch = undefined;
      if (S.obj.cables) S.obj.cables[k] = 0;
    }
  }
  const corners = S.obj.corners;
  if (corners && S.control && S.sides[S.control]) {
    for (const k of S.order) {
      if (k === S.control || !corners[k]) continue;
      say(ctx, LINES.gimCornersReset, { a: S.control, d: k }, 'dim');
      corners[k] = 0;
    }
  }
}

/** Texas death: a pin or a submission doesn't win it, it starts a ten count. */
export function texasDeath(ctx: Ctx, winner: SideKey, finish: FinishType): boolean {
  const S = ctx.S;
  if (stip(S) !== 'texas_death' || (finish !== 'PINFALL' && finish !== 'SUBMISSION')) return false;
  say(ctx, LINES.gimTexasCount, { a: winner, d: foe(S, winner) }, 'warn');
  startTenCount(ctx, winner, finish === 'SUBMISSION' ? 7 : 6);
  return true;
}

/** Street fights: falls count in the ring and at ringside, together. */
export const streetPinLegal = (S: MatchState, k: SideKey): boolean => {
  const a = S.sides[k]!.state.area, d = S.sides[foe(S, k)]!.state.area;
  return a === d && (a === 'IN_RING' || a === 'OUTSIDE');
};

