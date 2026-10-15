// Weapons, objects, stipulation objectives, arena travel and dirty tactics as actions. Godot's
// versions live in simple_match_ui.gd (_append_rule_actions, _append_active_environment_actions,
// _execute_environment_action, _execute_stipulation_action, _resolve_environment_after_move…).
import { getWeapon, type Weapon } from '../data/rtr';
import { LINES, SETUP_TEXT, setupLogLine } from '../data/commentary';
import { isOutsideArea, isSharedFlatArea } from './areaRules';
import { advanceClock } from './clock';
import type { Ctx } from './ctx';
import { flash, other, ring, say } from './commentary';
import { crowdObserve } from './crowd';
import {
  canRetrieve, consumeObject, createHeld, dropObject, findSetup, getWeaponMove, heldBy, holdObject, isLive, liveObjects,
  maybeBleed, objectsIn, retrievableWeapons, weaponOf,
} from './env';
import { staminaCostMultiplier, staminaPercent } from './exhaustion';
import { afterAction, endMatch, render, setControl } from './flow';
import { isHighRisk } from './interaction';
import { DIRTY, DISTRACTION_ACTIONS, refSees, SPOT_DETECTION, disqualify, warn } from './referee';
import { clamp, randInt } from './rng';
import { motionMatches } from './setupRules';
import { addFatigue, damagePart, spendStamina, totalHp } from './side';
import { stipulation } from './stipulations';
import type {
  ActionResult, Area, BodyPart, EnvObject, MatchState, Move, Position, SetupId, Side, SideKey, Snapshot,
} from './types';

/** Pulls at the ladder prize to win (Godot: 8 timed taps; here, contested pulls). */
export const LADDER_PULLS = 3;
/** Most pressure a refused "I quit" builds. */
export const MAX_QUIT_PRESSURE = 18;

const GROUNDED: readonly Position[] = ['GROUNDED', 'SEATED', 'KNEELING'];
const stationary = (s: Snapshot) => motionMatches('STATIONARY', s.motion);
const standingStill = (s: Snapshot) => s.position === 'STANDING' && stationary(s);
const flatOrRing = (area: Area) => area === 'IN_RING' || area === 'OUTSIDE';

/** The ladder someone is on, or that stands in an area. */
export const ladderUnder = (S: MatchState, k: SideKey): EnvObject | null =>
  liveObjects(S).find((o) => o.state === 'ladder' && o.climber === k) ?? null;
const ladderIn = (S: MatchState, area: Area): EnvObject | null => findSetup(S, 'LADDER', area, ['ladder']);

/** Where a wrestler really is for counts and the referee: on a ladder, it's where the ladder stands. */
export function groundArea(S: MatchState, k: SideKey): Area {
  const a = S[k].state.area;
  if (a === 'LADDER') return ladderUnder(S, k)?.area ?? 'IN_RING';
  if (a === 'CAGE') return 'IN_RING';
  return a;
}

/* ---------- contested ids ---------- */

const CONTESTED_EXTRA: ReadonlySet<SetupId> = new Set<SetupId>([
  'position_at_table', 'lay_on_table', 'position_at_corner_table', 'position_over_thumbtacks', 'climb_ladder',
  'climb_ladder_top', 'tip_ladder', 'reach_for_prize', 'climb_cage', 'reach_cage_top', 'escape_over_cage', 'enter_crowd',
  'leave_crowd', 'fight_backstage', 'eye_rake', 'hair_pull', 'closed_fist', 'illegal_choke', 'exposed_turnbuckle',
]);

export const EXTRA_SETUPS: ReadonlySet<SetupId> = new Set<SetupId>([
  ...CONTESTED_EXTRA, 'retrieve_weapon', 'pick_up_weapon', 'drop_weapon', 'set_table_flat', 'stack_table', 'set_table_corner',
  'clear_table', 'set_up_ladder', 'climb_down_ladder', 'spread_thumbtacks', 'clear_thumbtacks', 'climb_down_cage',
  'return_from_backstage', 'begin_standing_count', 'ask_to_quit', 'distract_referee', 'remove_turnbuckle_pad',
]);
export const isExtraSetup = (id: SetupId): boolean => EXTRA_SETUPS.has(id);
export const isExtraContested = (id: SetupId): boolean => CONTESTED_EXTRA.has(id);

/** Objective steps the finisher gate holds back. */
const GATED: Partial<Record<string, readonly SetupId[]>> = {
  ladder: ['climb_ladder', 'climb_ladder_top', 'reach_for_prize'],
  steel_cage: ['climb_cage', 'reach_cage_top', 'escape_over_cage'],
  tables: ['position_at_table', 'lay_on_table', 'position_at_corner_table'],
};
export const gateBlocks = (S: MatchState, id: SetupId): boolean => !S.obj.gateOpen && !!GATED[S.rules.stipulation]?.includes(id);

/* ---------- tables & tacks: which moves can put someone through ---------- */

/** _qualifies_environment_followup: a big, grounding, non-submission move. */
export function qualifiesForSpot(A: Side, m: Move, o: EnvObject): boolean {
  if (m.submission || m.type === 'SUBMISSION' || m.type === 'WEAPON') return false;
  const fin = m.finisher || A.finishers.includes(m);
  if (!fin && !['GRAPPLE', 'RUNNING', 'AERIAL', 'SPRINGBOARD'].includes(m.type)) return false;
  if (m.res.t.position !== 'GROUNDED') return false;
  const need = o.state === 'stacked' && !fin ? 8 : 6;
  return m.impact >= need;
}

const hasQualifier = (A: Side, o: EnvObject) => A.all.some((m) => qualifiesForSpot(A, m, o));

/** The table or tacks the attacker has lined the opponent up for. */
export const armedSpot = (S: MatchState, k: SideKey): EnvObject | null =>
  liveObjects(S).find((o) => o.positionedBy === k && o.positioned === other(k)) ?? null;

/* ---------- what's on offer ---------- */

export function extraSetups(S: MatchState, k: SideKey): SetupId[] {
  const out: SetupId[] = [];
  const add = (id: SetupId) => {
    if (!gateBlocks(S, id) && !out.includes(id)) out.push(id);
  };
  const A = S[k], dk = other(k), D = S[dk], a = A.state, d = D.state, rules = S.rules, stip = rules.stipulation;
  const held = heldBy(S, k);
  const still = standingStill(a);

  // Weapons and objects.
  if (rules.weapons) {
    if (!held && still && a.area === 'OUTSIDE' && retrievableWeapons(S).length) add('retrieve_weapon');
    if (!held && still && objectsIn(S, a.area, ['dropped']).length) add('pick_up_weapon');
    if (held) add('drop_weapon');
    if (held && still) {
      const w = weaponOf(held);
      if (w.kind === 'TABLE' && flatOrRing(a.area)) {
        add('set_table_flat');
        if (w.canStack && findSetup(S, 'TABLE', a.area, ['flat'])) add('stack_table');
        if (a.area === 'IN_RING' && w.canSetCorner) add('set_table_corner');
      }
      if (w.kind === 'LADDER' && flatOrRing(a.area)) add('set_up_ladder');
      if (w.kind === 'THUMBTACKS' && flatOrRing(a.area)) add('spread_thumbtacks');
    }
    // Lining them up for a table or the tacks.
    if (still && !held) {
      for (const o of liveObjects(S)) {
        if (o.positioned) continue;
        const near = o.state === 'corner' ? a.area === 'IN_RING' && (d.area === 'IN_RING' || d.area === 'CORNER') : o.area === d.area && a.area === d.area;
        if (!near || !hasQualifier(A, o)) continue;
        if (o.state === 'corner') add('position_at_corner_table');
        else if (o.state === 'flat' || o.state === 'stacked') add(GROUNDED.includes(d.position) ? 'lay_on_table' : 'position_at_table');
        else if (o.state === 'spread') add('position_over_thumbtacks');
      }
    }
    for (const o of liveObjects(S)) {
      if (o.positioned !== k) continue;
      add(weaponOf(o).kind === 'THUMBTACKS' ? 'clear_thumbtacks' : 'clear_table');
    }
  }
  // Ladders (they can be in play in any match with weapons).
  const ladderHere = ladderIn(S, a.area);
  if (ladderHere && !ladderHere.climber && still && !held && (stip === 'ladder' || A.all.some((m) => m.type === 'AERIAL'))) add('climb_ladder');
  if (a.area === 'LADDER') {
    if (a.position === 'CLIMBING') add('climb_ladder_top');
    add('climb_down_ladder');
    const l = ladderUnder(S, k);
    if (stip === 'ladder' && a.position === 'PERCHED' && l && l.area === 'IN_RING' && l.climbStage >= 2) add('reach_for_prize');
  }
  if (d.area === 'LADDER' && still) {
    const l = ladderUnder(S, dk);
    if (l && a.area === l.area) add('tip_ladder');
  }
  // Steel cage.
  if (stip === 'steel_cage' && rules.cageEscape) {
    if (a.area === 'IN_RING' && still) add('climb_cage');
    if (a.area === 'CAGE') {
      add(a.position === 'PERCHED' ? 'escape_over_cage' : 'reach_cage_top');
      add('climb_down_cage');
    }
  }
  // Falls Count Anywhere: the whole building.
  if (stip === 'falls_count_anywhere' && still && a.area === d.area && standingStill(d)) {
    if (a.area === 'OUTSIDE') add('enter_crowd');
    if (a.area === 'CROWD') {
      add('leave_crowd');
      add('fight_backstage');
    }
    if (a.area === 'RAMP') add('fight_backstage');
  }
  if (stip === 'falls_count_anywhere' && a.area === 'BACKSTAGE' && still) add('return_from_backstage');
  // Last Man Standing and I Quit.
  if (stip === 'last_man_standing' && S.obj.lmsFor === dk && GROUNDED.includes(d.position)) add('begin_standing_count');
  if (stip === 'i_quit' && still && quitCredible(S, k) && sameSpot(S, k)) add('ask_to_quit');
  // Rule-breaking.
  if (still && !held) {
    const ring = a.area === 'IN_RING';
    if (a.area === d.area && isSharedFlatArea(a.area)) {
      if (d.position === 'STANDING') {
        add('eye_rake');
        add('closed_fist');
      }
      if (d.position === 'STANDING' || d.position === 'KNEELING' || d.position === 'SEATED') add('hair_pull');
      if (ring && d.position === 'GROUNDED') add('illegal_choke');
    }
    if (ring && d.area === 'ROPES') add('illegal_choke');
    if (S.ref.distracted === 0 && rules.stipulation !== 'no_dq' && rules.dq) add('distract_referee');
    if (ring && d.area === 'CORNER' && !S.env.padRemoved) add('remove_turnbuckle_pad');
    if (ring && S.env.padRemoved && d.position === 'STANDING' && (d.area === 'IN_RING' || d.area === 'CORNER')) add('exposed_turnbuckle');
  }
  return out;
}

const sameSpot = (S: MatchState, k: SideKey) => groundArea(S, k) === groundArea(S, other(k));

/** _i_quit_demand_is_credible. */
export function quitCredible(S: MatchState, k: SideKey): boolean {
  const D = S[other(k)];
  return totalHp(D) / 6 <= 62 || D.fatigue >= 65 || D.bleeding >= 2 || S.obj.finisherLanded[k] || S.obj.quitPressure[other(k)] > 0;
}

/* ---------- doing them ---------- */

const say2 = (ctx: Ctx, id: SetupId, k: SideKey, w = '') => say(ctx, setupLogLine(id), { a: k, d: other(k), vars: { w } }, 'dim');

/** Uncontested object and objective actions. arg: the weapon to fetch / object to pick up. */
export function executeExtra(ctx: Ctx, k: SideKey, id: SetupId, arg?: string): boolean {
  const S = ctx.S, A = S[k], dk = other(k), D = S[dk];
  const cost = (n: number, demand: 'BASIC' | 'STANDARD' | 'EXPLOSIVE' = 'STANDARD') => spendStamina(A, n * staminaCostMultiplier(A, demand));
  switch (id) {
    case 'retrieve_weapon': {
      const w = arg ? getWeapon(arg) : chooseAiWeapon(S, k);
      if (!w || !canRetrieve(S, w)) return false;
      advanceClock(ctx);
      createHeld(ctx, k, w);
      cost(2, 'BASIC');
      say(ctx, LINES.retrieve, { a: k, vars: { w: w.name } }, 'warn');
      if (S.rules.dq && w.illegal) say(ctx, LINES.refWarnsWeapon, { a: k }, 'dim');
      crowdObserve(ctx, { type: 'spot', amount: 5 });
      break;
    }
    case 'pick_up_weapon': {
      const list = objectsIn(S, A.state.area, ['dropped']);
      const o = (arg ? list.find((x) => String(x.id) === arg) : null) ?? bestPickUp(S, list);
      if (!o) return false;
      advanceClock(ctx);
      holdObject(o, k, A.state.area);
      cost(1, 'BASIC');
      say(ctx, LINES.pickUp, { a: k, vars: { w: weaponOf(o).name } }, 'dim');
      break;
    }
    case 'drop_weapon': {
      const o = heldBy(S, k);
      if (!o) return false;
      advanceClock(ctx);
      dropObject(o, A.state.area);
      say2(ctx, id, k, weaponOf(o).name.toLowerCase());
      break;
    }
    case 'set_table_flat': case 'set_table_corner': case 'stack_table': case 'set_up_ladder': case 'spread_thumbtacks': {
      const o = heldBy(S, k);
      if (!o) return false;
      advanceClock(ctx);
      o.holder = null;
      o.area = A.state.area;
      if (id === 'stack_table') {
        const base = findSetup(S, 'TABLE', A.state.area, ['flat']);
        if (!base) return false;
        o.state = base.state = 'stacked';
        o.stackedWith = base.id;
        base.stackedWith = o.id;
        cost(7, 'EXPLOSIVE');
      } else {
        o.state = id === 'set_table_flat' ? 'flat' : id === 'set_table_corner' ? 'corner' : id === 'set_up_ladder' ? 'ladder' : 'spread';
        cost(id === 'spread_thumbtacks' ? 4 : 6);
      }
      say2(ctx, id, k);
      crowdObserve(ctx, { type: 'spot', amount: id === 'stack_table' || id === 'spread_thumbtacks' ? 8 : 4 });
      break;
    }
    case 'clear_table': case 'clear_thumbtacks': {
      advanceClock(ctx);
      for (const o of liveObjects(S)) if (o.positioned === k) {
        o.positioned = null;
        o.positionedBy = null;
      }
      cost(2, 'BASIC');
      say2(ctx, id, k);
      break;
    }
    case 'climb_down_ladder': {
      const l = ladderUnder(S, k);
      advanceClock(ctx);
      A.state = { position: 'STANDING', orientation: 'FRONT', area: l?.area ?? 'IN_RING', motion: 'STATIONARY' };
      if (l) {
        l.climber = null;
        l.climbStage = 0;
      }
      say2(ctx, id, k);
      break;
    }
    case 'climb_down_cage':
      advanceClock(ctx);
      A.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
      S.obj.cageStage[k] = 0;
      say2(ctx, id, k);
      break;
    case 'return_from_backstage':
      advanceClock(ctx);
      A.state = { position: 'STANDING', orientation: 'FRONT', area: 'RAMP', motion: 'STATIONARY' };
      say2(ctx, id, k);
      break;
    case 'distract_referee':
      advanceClock(ctx);
      S.ref.distracted = DISTRACTION_ACTIONS;
      S.ref.distractedBy = k;
      cost(2, 'BASIC');
      say2(ctx, id, k);
      S.crowd.dirty++;
      break;
    case 'remove_turnbuckle_pad':
      advanceClock(ctx);
      S.env.padRemoved = true;
      say2(ctx, id, k);
      S.crowd.dirty++;
      if (refSees(ctx, DIRTY.remove_turnbuckle_pad!.detection, A.state.area)) warn(ctx, k, 1, DIRTY.remove_turnbuckle_pad!.what);
      break;
    case 'begin_standing_count':
      return beginStandingCount(ctx, k);
    case 'ask_to_quit':
      return askToQuit(ctx, k);
    default:
      return false;
  }
  if (S.over) return true;
  A.lastActionResult = 'SETUP_SUCCESS';
  ctx.ai[k].noteSetupExecuted(id, A);
  ring(ctx, 'setup', k, SETUP_TEXT[id].title);
  void D;
  setControl(ctx, k);
  afterAction(ctx);
  return true;
}

/** A contested extra has been rolled. Bookkeeping common to all setups is done by the caller. */
export function finishExtraContest(ctx: Ctx, k: SideKey, id: SetupId, reversed: boolean): void {
  const S = ctx.S, A = S[k], dk = other(k), D = S[dk];
  if (reversed) {
    switch (id) {
      case 'climb_ladder': case 'climb_ladder_top': {
        const l = ladderUnder(S, k) ?? ladderIn(S, A.state.area);
        const area = l?.area ?? 'IN_RING';
        A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area, motion: 'STATIONARY' };
        if (l) dropObject(l, area);
        say(ctx, LINES.climbStopped, { a: k, d: dk }, '');
        S.crowd.climbStops++;
        crowdObserve(ctx, { type: 'spot', amount: 8 });
        break;
      }
      case 'reach_for_prize': {
        const l = ladderUnder(S, k);
        A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: l?.area ?? 'IN_RING', motion: 'STATIONARY' };
        if (l) {
          l.climber = null;
          l.climbStage = 0;
        }
        say(ctx, LINES.prizeStopped, { a: k, d: dk }, 'warn');
        S.crowd.climbStops++;
        crowdObserve(ctx, { type: 'spot', amount: 12 });
        break;
      }
      case 'climb_cage': case 'reach_cage_top': case 'escape_over_cage':
        A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
        S.obj.cageStage[k] = 0;
        say(ctx, LINES.cageStopped, { a: k, d: dk }, 'warn');
        S.crowd.climbStops++;
        crowdObserve(ctx, { type: 'spot', amount: id === 'escape_over_cage' ? 14 : 8 });
        break;
      default:
        say(ctx, LINES.setupReversed, { a: k, d: dk });
    }
    return;
  }
  const cost = (n: number) => spendStamina(A, n * staminaCostMultiplier(A, 'EXPLOSIVE'));
  switch (id) {
    case 'position_at_table': case 'lay_on_table': case 'position_at_corner_table': case 'position_over_thumbtacks': {
      const o = liveObjects(S).find((x) => !x.positioned && (id === 'position_over_thumbtacks' ? x.state === 'spread' : id === 'position_at_corner_table' ? x.state === 'corner' : x.state === 'flat' || x.state === 'stacked')
        && (x.state === 'corner' || x.area === D.state.area));
      if (o) {
        o.positioned = dk;
        o.positionedBy = k;
      }
      if (id === 'lay_on_table') D.state = { ...D.state, position: 'GROUNDED', orientation: 'FACE_UP', motion: 'STATIONARY' };
      spendStamina(A, 3 * staminaCostMultiplier(A, 'STANDARD'));
      addFatigue(A, 1);
      say2(ctx, id, k);
      crowdObserve(ctx, { type: 'spot', amount: 6 });
      break;
    }
    case 'climb_ladder': case 'climb_ladder_top': {
      const l = id === 'climb_ladder' ? ladderIn(S, A.state.area) : ladderUnder(S, k);
      if (l) {
        l.climber = k;
        l.climbStage = id === 'climb_ladder' ? 1 : 2;
      }
      A.state = { position: id === 'climb_ladder' ? 'CLIMBING' : 'PERCHED', orientation: 'FRONT', area: 'LADDER', motion: 'STATIONARY' };
      cost(3);
      addFatigue(A, 1);
      say2(ctx, id, k);
      crowdObserve(ctx, { type: 'spot', amount: id === 'climb_ladder_top' ? 8 : 4 });
      break;
    }
    case 'tip_ladder': {
      const l = ladderUnder(S, dk);
      const area = l?.area ?? 'IN_RING';
      D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area, motion: 'STATIONARY' };
      damagePart(D, 'BODY', 4);
      if (l) dropObject(l, area);
      say2(ctx, id, k);
      S.crowd.climbStops++;
      crowdObserve(ctx, { type: 'spot', amount: 12 });
      break;
    }
    case 'reach_for_prize': {
      S.obj.ladderPulls++;
      S.crowd.ladderPulls++;
      cost(2);
      const prize = S.rules.ladderPrize === 'Championship' ? (S.titleName || 'championship') : 'briefcase';
      if (S.obj.ladderPulls >= LADDER_PULLS) {
        say(ctx, LINES.prizeWon, { a: k, vars: { w: prize } }, 'hl');
        S.obj.decision = { winner: k, finish: 'LADDER', move: null };
      } else {
        say(ctx, LINES.prizePull, { a: k, vars: { w: prize, n: S.obj.ladderPulls, max: LADDER_PULLS } }, 'warn');
        crowdObserve(ctx, { type: 'spot', amount: 10 });
      }
      break;
    }
    case 'climb_cage': case 'reach_cage_top':
      A.state = { position: id === 'climb_cage' ? 'CLIMBING' : 'PERCHED', orientation: 'FRONT', area: 'CAGE', motion: 'STATIONARY' };
      S.obj.cageStage[k] = id === 'climb_cage' ? 1 : 2;
      S.crowd.cageClimbs++;
      cost(3);
      say2(ctx, id, k);
      crowdObserve(ctx, { type: 'spot', amount: id === 'reach_cage_top' ? 10 : 5 });
      break;
    case 'escape_over_cage':
      S.obj.cageStage[k] = 3;
      A.state = { position: 'STANDING', orientation: 'FRONT', area: 'OUTSIDE', motion: 'STATIONARY' };
      say2(ctx, id, k);
      S.obj.decision = { winner: k, finish: 'CAGE_ESCAPE', move: null };
      break;
    case 'enter_crowd': case 'leave_crowd': case 'fight_backstage': {
      const area: Area = id === 'enter_crowd' ? 'CROWD' : id === 'leave_crowd' ? 'OUTSIDE' : 'BACKSTAGE';
      A.state = { position: 'STANDING', orientation: 'FRONT', area, motion: 'STATIONARY' };
      D.state = { position: 'STANDING', orientation: 'FRONT', area, motion: 'STATIONARY' };
      S.crowd.travel++;
      cost(2);
      say2(ctx, id, k);
      crowdObserve(ctx, { type: 'spot', amount: id === 'leave_crowd' ? 3 : 8 });
      break;
    }
    default: {
      const t = DIRTY[id];
      if (!t) break;
      damagePart(D, t.part, t.damage);
      D.damageTaken += t.damage;
      A.damageDealt += t.damage;
      if (id === 'hair_pull') D.state = { ...D.state, position: 'SEATED', orientation: 'FRONT', motion: 'STATIONARY' };
      if (id === 'exposed_turnbuckle') D.state = { position: 'STANDING', orientation: 'FRONT', area: 'CORNER', motion: 'STAGGERING' };
      if (id === 'eye_rake' || id === 'closed_fist') D.state = { ...D.state, motion: 'STAGGERING' };
      spendStamina(A, 2 * staminaCostMultiplier(A, 'BASIC'));
      say2(ctx, id, k);
      S.crowd.dirty++;
      if (refSees(ctx, t.detection, A.state.area)) warn(ctx, k, t.points, t.what);
    }
  }
}

/* ---------- after a move: table and tack spots, Last Man Standing, ladder dives ---------- */

/** _resolve_environment_after_move. Call after the move's damage and positions are applied. */
export function environmentAfterMove(ctx: Ctx, k: SideKey, move: Move, result: ActionResult): void {
  const S = ctx.S, dk = other(k), A = S[k];
  const o = armedSpot(S, k);
  if (!o || !qualifiesForSpot(A, move, o)) return;
  // They have to still be by it.
  const dArea = S[dk].state.area;
  if (o.state === 'corner' ? dArea !== 'IN_RING' && dArea !== 'CORNER' : dArea !== o.area) return;
  const w = weaponOf(o);
  let victim: SideKey, credit: SideKey | null;
  if (result === 'CLEAN_SUCCESS') [victim, credit] = [dk, k];
  else if (result === 'REVERSAL') [victim, credit] = [k, dk];
  else if (result === 'HIGH_RISK_CRASH' && isHighRisk(move)) [victim, credit] = [k, null];
  else return;
  const V = S[victim];
  V.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: V.state.area === 'LADDER' ? o.area : V.state.area, motion: 'STATIONARY' };
  if (w.kind === 'THUMBTACKS') {
    const part: BodyPart = victim === dk ? (move.parts.find((p) => p !== 'NONE') as BodyPart | undefined) ?? 'BODY' : 'BODY';
    damagePart(V, part, 4);
    consumeObject(S, o, false);
    say(ctx, LINES.tackSpot, { a: victim, vars: { m: move.name } }, 'hl');
    crowdObserve(ctx, { type: 'spot', amount: 18 });
    maybeBleed(ctx, victim, w, w.impact, part, result === 'CLEAN_SUCCESS');
  } else {
    const bonus = o.state === 'stacked' ? 8 : o.state === 'corner' ? 5 : 4;
    damagePart(V, 'BODY', bonus);
    const stacked = o.state === 'stacked';
    consumeObject(S, o, true);
    S.crowd.tableBreaks++;
    say(ctx, credit === null ? LINES.tableCrash : stacked ? LINES.tableStacked : LINES.tableSpot, { a: credit ?? k, d: victim, m: move.name }, 'hl');
    flash(ctx, 'Through the table!', true);
    crowdObserve(ctx, { type: 'spot', amount: stacked ? 26 : 18 });
    if (S.rules.stipulation === 'tables' && credit && S.obj.gateOpen) {
      S.obj.decision = { winner: credit, finish: 'TABLES', move: credit === k ? move : null };
      return;
    }
  }
  if (S.rules.dq && result === 'CLEAN_SUCCESS' && refSees(ctx, SPOT_DETECTION, A.state.area)) disqualify(ctx, k, LINES.whatSpot);
}

/** After a clean move in Last Man Standing: a big enough blow lets the attacker make the referee count. */
export function lmsAfterMove(S: MatchState, k: SideKey, move: Move, result: ActionResult): void {
  if (S.rules.stipulation !== 'last_man_standing') return;
  const dk = other(k), D = S[dk], A = S[k];
  if (result !== 'CLEAN_SUCCESS' || D.state.position !== 'GROUNDED') return;
  const fin = move.finisher || A.finishers.includes(move);
  if (fin || A.signatures.includes(move) || move.impact >= 8 || totalHp(D) / 6 <= 35) {
    S.obj.lmsFor = dk;
    S.obj.lmsImpact = move.impact + (fin ? 2 : 0);
  }
}

/** _resolve_standing_ten_count: how likely the counted wrestler is to beat it (8–78). */
export function standingRecovery(S: MatchState, k: SideKey): number {
  const s = S[k];
  return clamp(
    32 + s.w.stats.skill * 0.28 + staminaPercent(s) * 0.3 - s.fatigue * 0.22 - (100 - totalHp(s) / 6) * 0.2 - S.obj.lmsImpact * 1.5 - s.bleeding * 2,
    8, 78,
  );
}

function beginStandingCount(ctx: Ctx, k: SideKey): boolean {
  const S = ctx.S, dk = other(k);
  advanceClock(ctx);
  if (S.over) return true;
  S.obj.lmsFor = null;
  S.crowd.tenCounts++;
  say(ctx, LINES.tenCountStart, { a: k, d: dk }, 'warn');
  ring(ctx, 'count', null);
  const score = standingRecovery(S, dk);
  if (dk === 'you') {
    // Hold and release in the gold, like a kickout but out of ten.
    const width = clamp(score * 0.35, 5, 28);
    const half = width / 200;
    S.pending = {
      kind: 'tenCount',
      spec: { id: ++S.seq, width, center: 0.12 + half + ctx.rnd() * (0.8 - width / 100), fillDuration: 5, timeLimit: 5.5, forgiveness: 1 },
    };
  } else {
    const beaten = ctx.rnd() * 100 < score;
    S.pending = { kind: 'refTen', id: ++S.seq, counted: dk, beatenAt: beaten ? randInt(ctx.rnd, 5, 9) : null };
  }
  render(ctx);
  return true;
}

/** The ten count is over: up in time, or that's the match. */
export function resolveTenCount(ctx: Ctx, counted: SideKey, beatenAt: number | null): void {
  const S = ctx.S, s = S[counted];
  if (beatenAt === null) {
    say(ctx, LINES.tenCountLost, { d: counted }, 'bad');
    endMatch(ctx, other(counted), 'TEN_COUNT', null);
    return;
  }
  s.state = { position: 'STANDING', orientation: 'FRONT', area: s.state.area === 'LADDER' ? groundArea(S, counted) : s.state.area, motion: 'STATIONARY' };
  s.kickouts++;
  say(ctx, LINES.tenCountBeaten, { d: counted, vars: { n: beatenAt } }, beatenAt >= 8 ? 'hl' : 'good');
  crowdObserve(ctx, { type: 'kickout', k: counted, count: beatenAt >= 8 ? 3 : 2, afterFinisher: false, afterSignature: false });
  setControl(ctx, 'neutral');
  afterAction(ctx);
}

/* ---------- I Quit ---------- */

/** The synthetic "hold" an I Quit demand runs through. */
export const QUIT_MOVE: Move = {
  id: 'i_quit_demand', name: 'I Quit?', type: 'SUBMISSION', classPref: [], parts: ['HEAD'], targeting: 'FIXED_PARTS', defaultSide: 'NONE',
  req: {
    a: { position: 'NONE', orientation: 'NONE', areaMode: 'ANY', area: 'IN_RING', motion: 'STATIONARY' },
    t: { position: 'NONE', orientation: 'NONE', areaMode: 'ANY', area: 'IN_RING', motion: 'STATIONARY' },
  },
  res: {
    a: { position: 'STANDING', orientation: 'FRONT', areaMode: 'UNCHANGED', area: 'IN_RING', motion: 'STATIONARY' },
    t: { position: 'GROUNDED', orientation: 'FACE_UP', areaMode: 'UNCHANGED', area: 'IN_RING', motion: 'STATIONARY' },
  },
  finisher: false, submission: true, flashPin: false, pinningCombo: false, interaction: 'AUTO', strike: false, strikeWeight: 'MEDIUM',
  impact: 1, extraTargetPositions: [],
};

export function quitScores(S: MatchState, k: SideKey): { attack: number; defend: number } {
  const A = S[k], D = S[other(k)];
  const attack = clamp(28 + (100 - totalHp(D) / 6) * 0.36 + D.fatigue * 0.16 + A.momentum * 0.1 + S.obj.quitPressure[other(k)], 20, 90);
  const defend = clamp(42 + D.w.stats.skill * 0.3 + staminaPercent(D) * 0.24 - D.bleeding * 2, 20, 90);
  return { attack, defend };
}

function askToQuit(ctx: Ctx, k: SideKey): boolean {
  const S = ctx.S, dk = other(k);
  advanceClock(ctx);
  if (S.over) return true;
  const { attack, defend } = quitScores(S, k);
  say(ctx, LINES.quitAsk, { a: k, d: dk }, 'warn');
  ring(ctx, 'submission', k, 'I Quit?');
  const playerAttacking = k === 'you';
  S.txn = {
    kind: 'sub', k, move: QUIT_MOVE, nearTapSaid: false, nearEscapeSaid: false, lastMarker: 50, quit: true,
    target: { parts: ['HEAD'], storyPart: 'HEAD', weights: { HEAD: 1 }, pressureParts: ['HEAD'], pressureUsesAverage: false, isBilateral: false, focusApplied: false, fullTag: 'HEAD', compactTag: 'HEAD' },
  };
  S.pending = {
    kind: 'sub',
    spec: {
      id: ++S.seq, attacker: k, defender: dk, playerDirection: playerAttacking ? 1 : -1,
      playerScore: playerAttacking ? attack : defend, aiScore: playerAttacking ? defend : attack,
      tapThreshold: 94, escapeThreshold: 6, speedMultiplier: 1, start: 50, moveName: 'I Quit?', partLabel: 'will', finisher: false,
    },
  };
  render(ctx);
  return true;
}

/** They refused: it gets harder to keep refusing. */
export function quitRefused(ctx: Ctx, k: SideKey, near: boolean): void {
  const S = ctx.S, dk = other(k);
  S.obj.quitPressure[dk] = Math.min(MAX_QUIT_PRESSURE, S.obj.quitPressure[dk] + 3);
  if (near) S.crowd.nearQuits++;
  say(ctx, near ? LINES.quitRefusedNear : LINES.quitRefused, { a: k, d: dk }, near ? 'hl' : '');
}

/* ---------- Iron Man ---------- */

/** Called as the clock moves: time's up in an Iron Man match. */
export function ironManClock(ctx: Ctx): void {
  const S = ctx.S, o = S.obj;
  if (S.rules.stipulation !== 'iron_man' || o.overtime || S.over || o.decision) return;
  if (S.t < S.rules.ironManMinutes * 60) return;
  if (o.score.you !== o.score.them) {
    const leader: SideKey = o.score.you > o.score.them ? 'you' : 'them';
    say(ctx, LINES.ironManTime, { a: leader, vars: { s: `${o.score.you}–${o.score.them}` } }, 'hl');
    o.decision = { winner: leader, finish: 'TIME_DECISION', move: null, final: true };
  } else {
    o.overtime = true;
    say(ctx, LINES.ironManOvertime, { vars: { s: `${o.score.you}–${o.score.them}` } }, 'hl');
    flash(ctx, 'Sudden death', true);
  }
}

/* ---------- legality used across the engine ---------- */

/** Pins: allowed by the stipulation, both in the ring (anywhere flat and together in Falls Count Anywhere). */
export function pinAreaLegal(S: MatchState, k: SideKey): boolean {
  if (!S.rules.pins) return false;
  const a = S[k].state.area, d = S[other(k)].state.area;
  if (S.rules.stipulation === 'falls_count_anywhere') return a === d && isSharedFlatArea(a);
  return a === 'IN_RING' && d === 'IN_RING';
}

/** Falls Count Anywhere also lets holds go on anywhere flat. */
export const fcaHoldLegal = (S: MatchState, k: SideKey): boolean =>
  S.rules.stipulation === 'falls_count_anywhere' && S[k].state.area === S[other(k)].state.area && isSharedFlatArea(S[k].state.area);

/** Count-outs: where the referee counts, with ladders counted where they stand. */
export const countsAsOutside = (S: MatchState, k: SideKey): boolean => isOutsideArea(groundArea(S, k));

/** Cage: no leaving through the ropes. */
export const CAGE_BLOCKED: ReadonlySet<SetupId> = new Set<SetupId>(['send_opponent_outside', 'call_opponent_outside', 'exit_ring', 'take_fight_outside', 'fight_up_ramp']);

/* ---------- the AI's weapon choice ---------- */

/** What to pick up off the floor: the match's object first, then the hardest-hitting. */
export function bestPickUp(S: MatchState, list: EnvObject[]): EnvObject | undefined {
  const stip = S.rules.stipulation;
  const want = stip === 'ladder' ? 'LADDER' : stip === 'tables' ? 'TABLE' : null;
  return [...list].sort((a, b) => {
    const wa = weaponOf(a), wb = weaponOf(b);
    return (wb.kind === want ? 100 : 0) + wb.impact - ((wa.kind === want ? 100 : 0) + wa.impact);
  })[0];
}

/** _choose_ai_weapon: no randomness, the best fit for the match and the wrestler. */
export function chooseAiWeapon(S: MatchState, k: SideKey): Weapon | null {
  const A = S[k], D = S[other(k)], stip = S.rules.stipulation;
  let best: Weapon | null = null, bestScore = -Infinity;
  for (const w of retrievableWeapons(S)) {
    let s = w.aiWeight * 10 + w.impact * 2 + w.bleed * 0.08;
    if (stip === 'ladder') s += w.kind === 'LADDER' ? 140 : -80;
    if (stip === 'tables') s += w.kind === 'TABLE' ? 120 : -55;
    if (A.w.classes.includes('HARDCORE')) s += 12;
    if (w.kind === 'LADDER' && A.all.some((m) => m.type === 'AERIAL')) s += 8;
    if (GROUNDED.includes(D.state.position)) s += 4;
    if (w.kind === 'THUMBTACKS' && !A.all.some((m) => m.impact >= 6 && m.res.t.position === 'GROUNDED')) s -= 40;
    if (s > bestScore) [best, bestScore] = [w, s];
  }
  return best;
}

/* ---------- small helpers for the rest of the engine ---------- */

export const stipName = (S: MatchState): string => stipulation(S.rules.stipulation).name;
export const objectLive = isLive;
export { getWeaponMove };
