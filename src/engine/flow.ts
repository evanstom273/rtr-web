// Control, neutral recovery, end of match. Port of _set_controller, _run_neutral_recovery,
// _resolve_control_after_action and end_match.
import { LINES } from '../data/commentary';
import { advanceClock, observePhase, settleRefereeCount } from './clock';
import type { Ctx } from './ctx';
import { flash, other, ring, say } from './commentary';
import { crowdObserve } from './crowd';
import {
  combinedExhaustion, recoveryDelayChance, staminaPercent, staminaRecoveryMultiplier,
} from './exhaustion';
import { lateMatchProfile } from './interaction';
import { rate } from './rating';
import { randRange } from './rng';
import { snapshotView } from './state';
import { refereeAfterAction } from './referee';
import { stipulation } from './stipulations';
import type { ActionResult, Cont, Control, FinishType, Move, Side, SideKey, StipulationId } from './types';

const FINISH_FLASH: Partial<Record<FinishType, string>> = {
  COUNT_OUT: 'Count out', DISQUALIFICATION: 'Disqualified', TABLES: 'Through the table', LADDER: 'Got it!',
  CAGE_ESCAPE: 'Escaped!', TEN_COUNT: 'Ten!', I_QUIT: 'I quit!', TIME_DECISION: 'Time!',
};

export const AI_DELAY_MS = 600;
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
  const previous = S.control;
  if (value !== 'neutral') S.neutralFavoured = null;
  S.control = value;
  if (previous !== value) {
    if ((previous === 'you' || previous === 'them') && (value === 'you' || value === 'them')) observePhase(ctx, 'control_swing');
    ring(ctx, 'control', value === 'neutral' ? null : value);
  }
  render(ctx);
  if (S.over) return;
  if (value === 'you') S.pending = { kind: 'awaitPlayer' };
  else if (value === 'them') S.pending = { kind: 'aiThinking' };
  else schedule(ctx, { to: 'neutralRecovery' }, AI_DELAY_MS);
}

export function setResolvedControl(ctx: Ctx, value: Control, a: SideKey, d: SideKey): void {
  const A = ctx.S[a], D = ctx.S[d];
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
  if (!S.obj.gateOpen && (S.you.finisherStock > 0 || S.them.finisherStock > 0)) openGate(ctx);
  settleRefereeCount(ctx);
}

/** A DQ, objective win or time-out reached during the action: act on it now. */
export function settleDecision(ctx: Ctx): boolean {
  const S = ctx.S, d = S.obj.decision;
  if (!d || S.over) return false;
  S.obj.decision = null;
  S.pinContext = null;
  S.txn = null;
  if (d.final) endMatch(ctx, d.winner, d.finish, d.move);
  else endFall(ctx, d.winner, d.finish, d.move);
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
export function endFall(ctx: Ctx, winner: SideKey | null, finish: FinishType, move: Move | null): void {
  const S = ctx.S, o = S.obj, id = S.rules.stipulation;
  if (S.over) return;
  if (!stipulation(id).multiFall || !winner) return endMatch(ctx, winner, finish, move);
  o.score[winner]++;
  o.falls.push({ k: winner, finish, t: S.t });
  S.crowd.falls++;
  const decided = (id === 'two_out_of_three' && o.score[winner] >= 2) || (id === 'iron_man' && o.overtime);
  if (decided) return endMatch(ctx, winner, finish, move);
  const loser = other(winner);
  say(ctx, LINES.fallScored, { a: winner, d: loser, vars: { x: FALL_WORD[finish] ?? 'a fall', s: `${o.score.you}–${o.score.them}` } }, 'hl');
  flash(ctx, `${S[winner].w.name.split(' ').pop()} scores a fall`, true);
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
  for (const k of ['you', 'them'] as SideKey[]) {
    const s = S[k];
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
  S.neutralFavoured = ctx.rnd() < 0.5 ? 'you' : 'them';
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
  const favoured = S.neutralFavoured;
  S.neutralFavoured = null;
  let side: SideKey;
  if (favoured) side = ctx.rnd() < GROUNDED_ATTACKER_RECOVERY_CHANCE ? favoured : other(favoured);
  else {
    const you = neutralRecoveryScore(ctx, S.you) + randRange(ctx.rnd, -10, 10);
    const them = neutralRecoveryScore(ctx, S.them) + randRange(ctx.rnd, -10, 10);
    side = you >= them ? 'you' : 'them';
  }
  const st = S[side];
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
  const A = ctx.S[a], D = ctx.S[d];
  const diff = neutralRecoveryScore(ctx, A) - neutralRecoveryScore(ctx, D);
  let threshold = lateMatchProfile(ctx.S.t).controlThreshold;
  if (A.consecutiveNeutralResets >= 2 || D.consecutiveNeutralResets >= 2) threshold = 0.01;
  if (diff >= threshold) return a;
  if (diff <= -threshold) return d;
  return null;
}

/** _resolve_control_after_action. */
export function resolveControlAfterAction(ctx: Ctx, a: SideKey, d: SideKey, move: Move, result: ActionResult): void {
  const S = ctx.S, A = S[a], D = S[d];
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

export function endMatch(ctx: Ctx, winner: SideKey | null, finish: FinishType, move: Move | null): void {
  const S = ctx.S;
  if (S.over) return;
  S.over = true;
  S.control = null;
  const loser = winner ? other(winner) : null;
  S.result = {
    winner, loser, finish, move, t: S.t,
    byFin: !!move?.finisher,
    byFlash: !!move?.flashPin,
    afterFk: loser ? S.crowd.fkAbsorbed[loser] > 0 : false,
    ...(stipulation(S.rules.stipulation).multiFall ? { score: { ...S.obj.score } } : {}),
  };
  if (winner) {
    if (finish === 'PINFALL') {
      say(ctx, LINES.pinWin, { a: winner, vars: { x: move ? ` with ${move.name}` : '' } }, 'hl');
      flash(ctx, 'Three!', true);
    } else if (finish === 'SUBMISSION') {
      say(ctx, LINES.subWin, { a: winner, m: move?.name ?? '', vars: { x: S[loser!].w.name.toUpperCase() } }, 'hl');
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
