// Control, neutral recovery, end of match. Port of _set_controller, _run_neutral_recovery,
// _resolve_control_after_action and end_match.
import { LINES } from '../data/commentary';
import { advanceClock, observePhase, settleRefereeCount } from './clock';
import type { Ctx } from './ctx';
import { fighting, flash, foe, isPlayer, ring, say } from './commentary';
import { crowdObserve } from './crowd';
import {
  combinedExhaustion, recoveryDelayChance, staminaPercent, staminaRecoveryMultiplier,
} from './exhaustion';
import { lateMatchProfile } from './interaction';
import { rate } from './rating';
import { randRange } from './rng';
import { snapshotView } from './state';
import { refereeAfterAction } from './referee';
import { autoRecovery } from './setups';
import { stipulation } from './stipulations';
import { autoAim, eliminate, isMulti, opponents, pickTurn, sidesOfResult } from './multi';
import { royalAfterAction } from './royal';
import { tagAfterAction } from './tag';
import type { ActionResult, Cont, Control, FinishType, Move, Side, SideKey, StipulationId } from './types';

const FINISH_FLASH: Partial<Record<FinishType, string>> = {
  COUNT_OUT: 'Count out', DISQUALIFICATION: 'Disqualified', TABLES: 'Through the table', LADDER: 'Got it!',
  CAGE_ESCAPE: 'Escaped!', TEN_COUNT: 'Ten!', I_QUIT: 'I quit!', TIME_DECISION: 'Time!',
};

export const AI_DELAY_MS = 600;
/** Pause before the player's automatic stand-up. */
export const AUTO_RECOVER_MS = 450;
export const RESULT_REVEAL_MS = 650;
/** Both on the mat after a move: the one who landed it gets up first this often (Godot: 0.8). */
export const GROUNDED_ATTACKER_RECOVERY_CHANCE = 0.9;

export function schedule(ctx: Ctx, cont: Cont, delay: number): void {
  ctx.S.pending = { kind: 'continue', delay, cont };
}

/** Refresh what the HUD and cards show. */
export function render(ctx: Ctx): void {
  ctx.S.view = snapshotView(ctx.S);
}

/** _set_controller: hand control over and queue whoever acts next. */
export function setControl(ctx: Ctx, value: Control): void {
  const S = ctx.S;
  // More than two people: whoever won the exchange is favoured, but anyone on their feet can jump in.
  // (With only two in the fight, a tag match's legal men or the last two in an elimination, it's singles.)
  if (isMulti(S) && value !== 'neutral' && !S.over && fighting(S).length > 2) value = pickTurn(ctx, value);
  // Nobody to fight (alone in a Rumble ring, waiting for the next one): the clock runs on.
  if (isMulti(S) && value !== 'neutral' && !S.over && !opponents(S, value).length) value = 'neutral';
  const previous = S.control;
  if (value !== 'neutral') S.neutralFavoured = null;
  S.control = value;
  if (previous !== value) {
    if (previous && previous !== 'neutral' && value !== 'neutral') observePhase(ctx, 'control_swing');
    ring(ctx, 'control', value === 'neutral' ? null : value);
  }
  render(ctx);
  if (S.over) return;
  if (value === 'neutral') schedule(ctx, { to: 'neutralRecovery' }, AI_DELAY_MS);
  else if (isPlayer(S, value)) {
    if (isMulti(S)) autoAim(S, value);
    // Down with nothing to do but get up: get up, rather than making the player tap for it.
    const id = autoRecovery(S, value);
    if (id) schedule(ctx, { to: 'autoRecover', k: value, id }, AUTO_RECOVER_MS);
    else S.pending = { kind: 'awaitPlayer' };
  }
  else S.pending = { kind: 'aiThinking', k: value };
}

export function setResolvedControl(ctx: Ctx, value: Control, a: SideKey, d: SideKey): void {
  const A = ctx.S.sides[a]!, D = ctx.S.sides[d]!;
  if (value === 'neutral') {
    A.consecutiveNeutralResets++;
    D.consecutiveNeutralResets++;
  } else {
    A.consecutiveNeutralResets = 0;
    D.consecutiveNeutralResets = 0;
  }
  setControl(ctx, value);
}

/** ensure_match_can_continue: settle the referee's count at the end of every action. */
export function afterAction(ctx: Ctx): void {
  const S = ctx.S;
  if (settleDecision(ctx)) return;
  observePhase(ctx, 'action');
  refereeAfterAction(ctx);
  if (!S.obj.gateOpen && S.order.some((k) => S.sides[k]!.finisherStock > 0)) openGate(ctx);
  settleRefereeCount(ctx);
  tagAfterAction(ctx);
  royalAfterAction(ctx);
}

/** A DQ, objective win or time-out reached during the action: act on it now. */
export function settleDecision(ctx: Ctx): boolean {
  const S = ctx.S, d = S.obj.decision;
  if (!d || S.over) return false;
  S.obj.decision = null;
  S.pinContext = null;
  S.txn = null;
  if (d.final) endMatch(ctx, d.winner, d.finish, d.move, d.loser);
  else endFall(ctx, d.winner, d.finish, d.move, d.loser);
  return true;
}

/** Ladder grabs, cage escapes and table wins unlock once someone has banked a finisher. */
function openGate(ctx: Ctx): void {
  const S = ctx.S;
  S.obj.gateOpen = true;
  const line = GATE_LINES[S.rules.stipulation];
  if (line && (S.rules.stipulation !== 'steel_cage' || S.rules.cageEscape)) say(ctx, line, {}, 'hl');
}

const GATE_LINES: Partial<Record<StipulationId, string>> = {
  ladder: LINES.gateLadder,
  tables: LINES.gateTables,
  steel_cage: LINES.gateCage,
};

/**
 * A fall. In Iron Man and two out of three it's scored and the match goes on (both reset to a
 * neutral standing start, damage stays); otherwise it ends the match.
 */
export function endFall(ctx: Ctx, winner: SideKey | null, finish: FinishType, move: Move | null, lost?: SideKey | null): void {
  const S = ctx.S, o = S.obj, id = S.rules.stipulation;
  if (S.over) return;
  // More than two people, elimination rules: the loser's out and it goes on.
  const out = lost ?? (winner ? foe(S, winner) : null);
  if (isMulti(S) && S.rules.elimination && out) return eliminate(ctx, out, winner, finish, move);
  if (!stipulation(id).multiFall || !winner) return endMatch(ctx, winner, finish, move, lost);
  o.score[winner] = (o.score[winner] ?? 0) + 1;
  o.falls.push({ k: winner, finish, t: S.t });
  S.crowd.falls++;
  const decided = (id === 'two_out_of_three' && (o.score[winner] ?? 0) >= 2) || (id === 'iron_man' && o.overtime);
  if (decided) return endMatch(ctx, winner, finish, move);
  const loser = foe(S, winner);
  say(ctx, LINES.fallScored, { a: winner, d: loser, vars: { x: FALL_WORD[finish] ?? 'a fall', s: `${o.score.you}–${o.score.them}` } }, 'hl');
  flash(ctx, `${S.sides[winner]!.w.name.split(' ').pop()} scores a fall`, true);
  crowdObserve(ctx, { type: 'match_end' });
  resetBetweenFalls(ctx);
  schedule(ctx, { to: 'nextFall' }, RESULT_REVEAL_MS * 2);
}

const FALL_WORD: Partial<Record<FinishType, string>> = {
  PINFALL: 'a pinfall', SUBMISSION: 'a submission', COUNT_OUT: 'a count-out', DISQUALIFICATION: 'a disqualification',
};

/** _reset_between_falls: a breather and a neutral restart. Damage, cuts, objects and warnings stay. */
function resetBetweenFalls(ctx: Ctx): void {
  const S = ctx.S;
  for (const k of S.order) {
    const s = S.sides[k]!;
    s.stamina = Math.min(s.maxStamina, s.stamina + s.maxStamina * 0.1);
    s.fatigue = Math.max(0, s.fatigue - 5);
    s.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
    s.setUp = false;
    s.lastMoveWasFinisher = false;
  }
  S.obj.lmsFor = null;
  S.pinContext = null;
  S.txn = null;
  S.control = null;
  S.neutralFavoured = ctx.rnd() < 0.5 ? S.order[0]! : S.order[1]!;
  const r = S.referee;
  r.active = false;
  r.value = 0;
  r.elapsed = 0;
  r.pendingResolution = false;
  render(ctx);
}

export function neutralRecoveryScore(ctx: Ctx, s: Side): number {
  let score = staminaPercent(s) + s.momentum - s.fatigue;
  const x = combinedExhaustion(s);
  score -= lateMatchProfile(ctx.S.t).recoveryPenalty * x;
  score -= x * 25;
  score += (staminaRecoveryMultiplier(s) - 1) * 12;
  if (s.momentum >= 90) score += 15;
  return score;
}

export function runNeutralRecovery(ctx: Ctx): void {
  const S = ctx.S;
  advanceClock(ctx);
  if (S.over) return;
  if (isMulti(S) && new Set(fighting(S).map((k) => S.sides[k]!.team)).size < 2) {
    // One left in the ring and more to come: wait for them.
    const alone = fighting(S)[0];
    if (alone && S.turn.k !== alone) {
      say(ctx, LINES.royalWait, { a: alone }, 'dim');
      S.turn = { k: alone, n: 0 };
    }
    render(ctx);
    schedule(ctx, { to: 'neutralRecovery' }, AI_DELAY_MS);
    return;
  }
  const favoured = S.neutralFavoured;
  S.neutralFavoured = null;
  let side: SideKey;
  if (favoured) side = ctx.rnd() < GROUNDED_ATTACKER_RECOVERY_CHANCE ? favoured : foe(S, favoured);
  else {
    // Whoever's freshest (with a little luck) gets going first; ties go to whoever came in first.
    let best = -Infinity;
    side = S.order[0]!;
    for (const k of fighting(S)) {
      const v = neutralRecoveryScore(ctx, S.sides[k]!) + randRange(ctx.rnd, -10, 10);
      if (v > best) { best = v; side = k; }
    }
  }
  const st = S.sides[side]!;
  if (st.recoveryDelayProtected) st.recoveryDelayProtected = false;
  else if (ctx.rnd() * 100 < recoveryDelayChance(st, st.lastActionResult === 'HIGH_RISK_CRASH')) {
    st.recoveryDelayProtected = true;
    say(ctx, LINES.neutralDelayed, { a: side }, 'warn');
    setControl(ctx, 'neutral');
    afterAction(ctx);
    return;
  }
  const stood = st.state.position === 'GROUNDED';
  if (stood) st.state = { position: 'STANDING', orientation: 'FRONT', area: st.state.area, motion: 'STATIONARY' };
  say(ctx, stood ? LINES.neutralStood : LINES.neutralInitiative, { a: side });
  setControl(ctx, side);
  afterAction(ctx);
}

function advantagedSide(ctx: Ctx, a: SideKey, d: SideKey): SideKey | null {
  const A = ctx.S.sides[a]!, D = ctx.S.sides[d]!;
  const diff = neutralRecoveryScore(ctx, A) - neutralRecoveryScore(ctx, D);
  let threshold = lateMatchProfile(ctx.S.t).controlThreshold;
  if (A.consecutiveNeutralResets >= 2 || D.consecutiveNeutralResets >= 2) threshold = 0.01;
  if (diff >= threshold) return a;
  if (diff <= -threshold) return d;
  return null;
}

/** _resolve_control_after_action. */
export function resolveControlAfterAction(ctx: Ctx, a: SideKey, d: SideKey, move: Move, result: ActionResult): void {
  const S = ctx.S, A = S.sides[a]!, D = S.sides[d]!;
  if (result === 'REVERSAL' || result === 'HIGH_RISK_CRASH') return setResolvedControl(ctx, d, a, d);
  if (result === 'CLEAN_SUCCESS' && move.finisher) return setResolvedControl(ctx, a, a, d);
  // Godot also rolled here for a tired attacker to lose control after a landed move (up to 40%),
  // handing the defender a free shot at taking over. Removed (Lyra's call): if you land it, you
  // keep it. Exhaustion still bites through the dice.
  if (A.state.position === 'GROUNDED' && D.state.position === 'GROUNDED') {
    S.neutralFavoured = result === 'CLEAN_SUCCESS' ? a : null;
    return setResolvedControl(ctx, 'neutral', a, d);
  }
  if (result === 'CLEAN_SUCCESS') return setResolvedControl(ctx, a, a, d);
  const adv = advantagedSide(ctx, a, d);
  setResolvedControl(ctx, adv ?? 'neutral', a, d);
}

export function endMatch(ctx: Ctx, winner: SideKey | null, finish: FinishType, move: Move | null, lost?: SideKey | null): void {
  const S = ctx.S;
  if (S.over) return;
  S.over = true;
  S.control = null;
  const loser = lost !== undefined ? lost : winner ? foe(S, winner) : null;
  S.result = {
    winner, loser, finish, move, t: S.t,
    byFin: !!move?.finisher,
    byFlash: !!move?.flashPin,
    afterFk: loser ? (S.crowd.fkAbsorbed[loser] ?? 0) > 0 : false,
    ...(stipulation(S.rules.stipulation).multiFall ? { score: { ...S.obj.score } } : {}),
    ...(isMulti(S) ? { ...sidesOfResult(S, winner), elims: [...S.elims] } : {}),
    ...(S.entries ? { entries: structuredClone(S.entries) } : {}),
  };
  if (winner) {
    if (finish === 'PINFALL') {
      say(ctx, LINES.pinWin, { a: winner, vars: { x: move ? ` with ${move.name}` : '' } }, 'hl');
      flash(ctx, 'Three!', true);
    } else if (finish === 'SUBMISSION') {
      say(ctx, LINES.subWin, { a: winner, m: move?.name ?? '', vars: { x: S.sides[loser!]!.w.name.toUpperCase() } }, 'hl');
      flash(ctx, 'Tap out', true);
    } else flash(ctx, FINISH_FLASH[finish] ?? 'Winner', true);
  } else flash(ctx, 'No contest', true);
  crowdObserve(ctx, { type: 'match_end' });
  render(ctx);
  schedule(ctx, { to: 'final' }, RESULT_REVEAL_MS);
}

export function finalise(ctx: Ctx): void {
  ctx.S.rating = rate(ctx.S);
  ctx.S.pending = { kind: 'over' };
}
