// Stipulations, part two (match overhaul, stage 6): the structures. Hell in a Cell (the walls, and someone
// always ends up on the roof), the Elimination Chamber (pods let out on a timer, chain walls, diving off
// the pods), WarGames (two teams coming in one at a time, then the first fall wins), the scaffold (knock
// them off it) and Ultimate X (up to the cables and out along them to the X). TLC and Money in the Bank
// are the ladder match's rules (stip.ts) with tables, chairs and more ladders, and more people.
// Actions here go through the same stipulation-action surface as stage 5 (gimmicks.ts).
import { LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { fighting, flash, foe, ring, say } from './commentary';
import { heat } from './crowd';
import { staminaPercent } from './exhaustion';
import { afterAction, render, setControl } from './flow';
import { pinCondition } from './pin';
import { clamp } from './rng';
import { damagePart } from './side';
import type { Area, GimmickId, MatchState, SetupId, SideKey, StipulationId } from './types';

const stip = (S: MatchState): StipulationId => S.rules.stipulation;
/** Hand over hand to the X: on the cable, then three more pulls. */
export const X_AT = 4;
const opponentsDown = (S: MatchState, k: SideKey): boolean =>
  fighting(S).filter((o) => S.sides[o]!.team !== S.sides[k]!.team).every((o) => ['GROUNDED', 'SEATED', 'KNEELING'].includes(S.sides[o]!.state.position));
const line = (key: string): string => (LINES as unknown as Record<string, string>)[key] ?? '';
const IN_RING: ReadonlySet<Area> = new Set<Area>(['IN_RING', 'ROPES', 'CORNER']);
const DOWN = (S: MatchState, k: SideKey) => ['GROUNDED', 'SEATED', 'KNEELING'].includes(S.sides[k]!.state.position);

/** The stage 6 stipulations. */
export const STRUCTURES: ReadonlySet<StipulationId> = new Set<StipulationId>(['hell_in_a_cell', 'elimination_chamber', 'wargames', 'scaffold', 'ultimate_x', 'tlc', 'money_in_the_bank']);
export const STRUCTURE_ACTIONS: ReadonlySet<GimmickId> = new Set<GimmickId>([
  'climb_cell', 'climb_down_cell', 'throw_off_cell', 'ram_into_cell', 'ram_into_chamber', 'pod_dive', 'knock_off_scaffold', 'climb_to_cables', 'crawl_cables', 'grab_x', 'pull_off_cables',
]);
/** On the scaffold there's nowhere to go but down. */
export const SCAFFOLD_BLOCKED: ReadonlySet<SetupId> = new Set<SetupId>(['send_opponent_outside', 'call_opponent_outside', 'exit_ring', 'take_fight_outside', 'fight_up_ramp', 'climb_top_rope', 'retrieve_weapon']);

export const STRUCTURE_TITLE: Partial<Record<GimmickId, string>> = {
  climb_cell: 'Climb the cell', climb_down_cell: 'Climb back down', throw_off_cell: 'Throw them off the cell', ram_into_cell: 'Ram them into the cell',
  ram_into_chamber: 'Into the chain wall', pod_dive: 'Dive off a pod', knock_off_scaffold: 'Knock them off the scaffold',
  climb_to_cables: 'Climb to the cables', crawl_cables: 'Crawl along the cable', grab_x: 'Pull down the X', pull_off_cables: 'Pull them off the cables',
};

/** Contested on the dice, or not (the stage 5 surface asks this). */
export function structureContested(S: MatchState, k: SideKey, id: GimmickId): boolean {
  const D = S.sides[foe(S, k)]!;
  switch (id) {
    case 'climb_down_cell': case 'crawl_cables': case 'pod_dive': return false;
    case 'climb_cell': case 'climb_to_cables': return D.state.position === 'STANDING' && D.state.area === S.sides[k]!.state.area && !D.perch;
    case 'grab_x': return fighting(S).some((o) => o !== k && (S.obj.cables?.[o] ?? 0) >= X_AT - 1);
    default: return staminaPercent(D) >= 10 || D.state.position !== 'GROUNDED';
  }
}

/** At the bell: up on the scaffold, or the X hung over the ring. */
export function setupStructures(S: MatchState): void {
  if (stip(S) === 'scaffold') for (const k of S.order) S.sides[k]!.perch = 'scaffold';
  if (stip(S) === 'ultimate_x') S.obj.cables = Object.fromEntries(S.order.map((k) => [k, 0]));
}

/** The structure's actions open to k right now. */
export function structureActions(S: MatchState, k: SideKey): GimmickId[] {
  const A = S.sides[k]!, d = foe(S, k), D = S.sides[d];
  const out: GimmickId[] = [];
  const up = A.state.position === 'STANDING';
  const st = stip(S);
  if (st === 'hell_in_a_cell') {
    if (A.perch === 'roof') {
      out.push('climb_down_cell');
      if (up && D?.perch === 'roof' && (DOWN(S, d) || pinCondition(D) < 70)) out.push('throw_off_cell');
    } else if (up && A.state.area === 'OUTSIDE') {
      out.push('climb_cell');
      if (D && D.state.area === 'OUTSIDE' && !D.perch && D.state.position !== 'GROUNDED') out.push('ram_into_cell');
    }
  }
  if (st === 'elimination_chamber' && up && A.state.area === 'OUTSIDE' && D && D.state.area === 'OUTSIDE') {
    if (D.state.position !== 'GROUNDED') out.push('ram_into_chamber');
    else out.push('pod_dive');
  }
  // The scaffold: they have to be properly worn before they'll go over.
  if (st === 'scaffold' && D && pinCondition(D) < 50 && (DOWN(S, d) || staminaPercent(D) < 40) && A.state.position !== 'GROUNDED') out.push('knock_off_scaffold');
  if (st === 'ultimate_x') {
    const at = S.obj.cables?.[k] ?? 0;
    // Up to the cables once the fight's gone a while, or with everyone else down.
    const clear = S.t >= 420 || opponentsDown(S, k);
    if (at === 0 && up && IN_RING.has(A.state.area) && clear) out.push('climb_to_cables');
    if (at >= 1 && at < X_AT) out.push('crawl_cables');
    if (at >= X_AT) out.push('grab_x');
    if (at === 0 && up && D && (S.obj.cables?.[d] ?? 0) >= 1) out.push('pull_off_cables');
  }
  return out;
}

/** The roll's in (or there wasn't one). */
export function finishStructure(ctx: Ctx, k: SideKey, d: SideKey, id: GimmickId, failed: boolean): void {
  const S = ctx.S, A = S.sides[k]!, D = S.sides[d]!, c = S.crowd;
  const spot = (n: number) => { c.gimmicks = (c.gimmicks ?? 0) + 1; c.spots += n; };
  const done = (ctl: SideKey) => { render(ctx); setControl(ctx, ctl); afterAction(ctx); };
  const say2 = (key: string, cls: 'hl' | 'warn' | 'dim' | 'bad' = 'hl') => say(ctx, line(key), { a: k, d }, cls);
  if (failed) {
    say(ctx, line('strFoughtOff'), { a: d, d: k, vars: { x: STRUCTURE_TITLE[id]!.toLowerCase() } }, 'warn');
    if (id === 'climb_to_cables' || id === 'climb_cell') A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: A.state.area, motion: 'STATIONARY' };
    ring(ctx, 'reversal', d);
    return done(d);
  }
  switch (id) {
    case 'climb_cell': {
      A.perch = 'roof';
      A.perchTurns = 0;
      spot(0);
      heat(ctx, 10);
      say2(D.perch === 'roof' ? 'strCellFollow' : 'strCellClimb');
      return done(k);
    }
    case 'climb_down_cell': {
      A.perch = undefined;
      say2('strCellDown', 'dim');
      return done(k);
    }
    case 'throw_off_cell': {
      // Off the top: through the roof into the ring now and then, otherwise all the way to the floor.
      const through = ctx.rnd() < 0.3;
      D.perch = undefined;
      D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: through ? 'IN_RING' : 'OUTSIDE', motion: 'STATIONARY' };
      damagePart(D, 'HEAD', 15);
      damagePart(D, 'BODY', 22);
      D.damageTaken += 37;
      A.damageDealt += 37;
      D.lastHitBy = k;
      spot(3);
      heat(ctx, 25);
      say2(through ? 'strThroughRoof' : 'strOffTheCell');
      flash(ctx, through ? 'Through the roof!' : 'Off the top!', true);
      ring(ctx, 'crash', d);
      // They follow them down.
      A.perch = undefined;
      A.state = { position: 'STANDING', orientation: 'FRONT', area: D.state.area, motion: 'STATIONARY' };
      return done(k);
    }
    case 'ram_into_cell': case 'ram_into_chamber': {
      damagePart(D, 'BODY', 6);
      damagePart(D, 'HEAD', 4);
      D.damageTaken += 10;
      D.state = { position: 'GROUNDED', orientation: 'FACE_DOWN', area: D.state.area, motion: 'STATIONARY' };
      D.lastHitBy = k;
      if (!D.bleeding && ctx.rnd() < 0.25) { D.bleeding = 1; c.bleeds++; }
      spot(1);
      heat(ctx, 6);
      say2(id === 'ram_into_cell' ? 'strRamCell' : 'strRamChamber');
      ring(ctx, 'move_landed', k, STRUCTURE_TITLE[id]);
      return done(k);
    }
    case 'pod_dive': {
      const hit = ctx.rnd() < clamp(0.55 + (A.w.stats.speed - 70) / 150, 0.3, 0.85);
      heat(ctx, 18);
      spot(2);
      if (hit) {
        damagePart(D, 'BODY', 14);
        damagePart(D, 'HEAD', 6);
        D.damageTaken += 20;
        D.lastHitBy = k;
        say2('strPodDive');
        flash(ctx, 'Off the pod!', true);
        ring(ctx, 'move_landed', k, 'Pod dive');
        return done(k);
      }
      damagePart(A, 'BODY', 12);
      A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'OUTSIDE', motion: 'STATIONARY' };
      say2('strPodMiss', 'bad');
      ring(ctx, 'crash', k);
      return done(d);
    }
    case 'knock_off_scaffold': {
      D.perch = undefined;
      D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
      damagePart(D, 'BODY', 25);
      damagePart(D, 'HEAD', 12);
      spot(3);
      heat(ctx, 25);
      say2('strOffScaffold');
      flash(ctx, 'Off the scaffold!', true);
      S.obj.decision = { winner: k, loser: d, finish: 'SCAFFOLD', move: null };
      return afterAction(ctx);
    }
    case 'climb_to_cables': case 'crawl_cables': {
      const cables = S.obj.cables!;
      // Hand over hand, and tiring: a slip drops you to the mat.
      if (id === 'crawl_cables' && ctx.rnd() > clamp(0.72 - A.fatigue / 300, 0.4, 0.8)) {
        cables[k] = 0;
        A.perch = undefined;
        A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
        damagePart(A, 'BODY', 6);
        heat(ctx, 8);
        say2('strCableSlip', 'bad');
        return done(d);
      }
      cables[k] = (cables[k] ?? 0) + 1;
      A.perch = 'cables';
      A.state = { position: 'CLIMBING', orientation: 'FRONT', area: 'TOP_ROPE', motion: 'STATIONARY' };
      spot(id === 'climb_to_cables' ? 1 : 0);
      heat(ctx, 6 + cables[k]! * 3);
      say(ctx, line(cables[k]! >= X_AT ? 'strCableX' : id === 'climb_to_cables' ? 'strCableUp' : 'strCableCrawl'), { a: k }, cables[k]! >= X_AT ? 'hl' : 'warn');
      return done(k);
    }
    case 'grab_x': {
      say2('strGrabX');
      flash(ctx, 'Ultimate X!', true);
      S.obj.decision = { winner: k, finish: 'ULTIMATE_X', move: null, ...(S.order.length > 2 ? { loser: null } : {}) };
      return afterAction(ctx);
    }
    case 'pull_off_cables': {
      const cables = S.obj.cables!;
      cables[d] = 0;
      D.perch = undefined;
      D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
      damagePart(D, 'BODY', 10);
      D.lastHitBy = k;
      spot(2);
      heat(ctx, 12);
      say2('strPullOff');
      ring(ctx, 'move_landed', k, 'Off the cables');
      return done(k);
    }
    default:
      return done(k);
  }
}

/** Before the AI's own choice: the structure's spots when they're on. */
export function aiStructureInstinct(ctx: Ctx, k: SideKey, list: GimmickId[]): GimmickId | null {
  const S = ctx.S, A = S.sides[k]!, D = S.sides[foe(S, k)]!, r = ctx.rnd();
  if (list.includes('grab_x')) return 'grab_x';
  if (list.includes('crawl_cables')) return 'crawl_cables';
  if (list.includes('pull_off_cables')) return r < 0.85 ? 'pull_off_cables' : null;
  if (list.includes('climb_to_cables')) return r < (DOWN(S, D.key) ? 0.6 : 0.2) ? 'climb_to_cables' : null;
  if (list.includes('knock_off_scaffold')) return r < (DOWN(S, D.key) ? 0.6 : 0.3) ? 'knock_off_scaffold' : null;
  if (list.includes('throw_off_cell')) return r < 0.55 ? 'throw_off_cell' : null;
  if (A.perch === 'roof' && D.perch !== 'roof') {
    A.perchTurns = (A.perchTurns ?? 0) + 1;
    if (A.perchTurns >= 2 && list.includes('climb_down_cell')) return 'climb_down_cell';
    return null;
  }
  // Follow them up; or take them up there once they're worn down.
  if (list.includes('climb_cell') && (D.perch === 'roof' ? r < 0.85 : r < (pinCondition(D) < 60 ? 0.35 : 0.08))) return 'climb_cell';
  if (list.includes('ram_into_cell') && r < 0.25) return 'ram_into_cell';
  if (list.includes('ram_into_chamber') && r < 0.25) return 'ram_into_chamber';
  if (list.includes('pod_dive') && r < 0.2) return 'pod_dive';
  return null;
}

/** Hell in a Cell: falls count anywhere inside it — the ring and the floor — but not up on the roof. */
export const cellPinLegal = (S: MatchState, k: SideKey): boolean => {
  const A = S.sides[k]!, D = S.sides[foe(S, k)]!;
  return !A.perch && !D.perch && A.state.area === D.state.area && (A.state.area === 'IN_RING' || A.state.area === 'OUTSIDE');
};
