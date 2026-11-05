// More than two people in the match (match overhaul, stage 2): whose turn it is, who goes after whom,
// breaking up (and stealing) pins and holds, and eliminations. Nothing here runs in singles: every entry
// point checks isMulti first, so a two-person match draws exactly the same dice it always did.
import { LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { fighting, flash, foe, isPlayer, ring, say } from './commentary';
import { heat } from './crowd';
import { staminaPercent } from './exhaustion';
import { afterAction, endMatch, render, schedule, setControl } from './flow';
import * as ix from './interactions';
import { pinCondition } from './pin';
import { clamp } from './rng';
import { has } from './traits';
import { damagePart } from './side';
import { distance, settleSpots } from './zones';
import { replaceLegal } from './tag';
import type { Control, FinishType, MatchState, Move, SavePlan, SetupId, Side, SideKey, SubOutcome } from './types';

export const isMulti = (S: MatchState): boolean => S.order.length > 2;
export const sameTeam = (S: MatchState, a: SideKey, b: SideKey): boolean => S.sides[a]!.team === S.sides[b]!.team;
/** Still in the match (eliminated is the only way out; the apron and the pods still count). */
export const alive = (S: MatchState): SideKey[] => S.order.filter((k) => S.sides[k]!.out !== 'eliminated');
export const teamsAlive = (S: MatchState): number[] => [...new Set(alive(S).map((k) => S.sides[k]!.team))];
/** Opponents still fighting: anyone on another team who isn't out of it. */
export const opponents = (S: MatchState, k: SideKey): SideKey[] => fighting(S).filter((o) => !sameTeam(S, k, o));
export const teammates = (S: MatchState, k: SideKey): SideKey[] => S.order.filter((o) => o !== k && sameTeam(S, k, o));

const bond = (S: MatchState, a: SideKey, b: SideKey): number => S.rules.bonds?.[a]?.[b] ?? 0;
const heel = (s: Side): boolean => s.w.disposition === 'HEEL';
/** The heels' truce: both heels, on different teams, while it holds. */
export const allied = (S: MatchState, a: SideKey, b: SideKey): boolean =>
  S.alliance === 'on' && !sameTeam(S, a, b) && heel(S.sides[a]!) && heel(S.sides[b]!);

/* ---------- targets ---------- */

/** Who k could go after right now (the player picks from these). */
export const targetable = (S: MatchState, k: SideKey): SideKey[] => opponents(S, k);

/** Point k at t (the player's choice, or the AI's). Returns false if t isn't someone they can fight. */
export function setTarget(S: MatchState, k: SideKey, t: SideKey): boolean {
  if (!targetable(S, k).includes(t)) return false;
  S.sides[k]!.target = t;
  return true;
}

/** Anyone whose target has gone (eliminated, on the apron) turns to the nearest opponent. */
export function retargetAll(S: MatchState): void {
  for (const k of fighting(S)) {
    const s = S.sides[k]!;
    if (targetable(S, k).includes(s.target)) continue;
    const near = targetable(S, k).sort((a, b) => distance(S, k, a) - distance(S, k, b))[0];
    if (near) s.target = near;
  }
}

/** The player's turn: if who they're after is out of reach and someone else is close, turn to them. */
export function autoAim(S: MatchState, k: SideKey): void {
  const s = S.sides[k]!, list = targetable(S, k);
  if (list.includes(s.target) && distance(S, k, s.target) <= 1) return;
  const near = [...list].sort((a, b) => distance(S, k, a) - distance(S, k, b))[0];
  if (near && (!list.includes(s.target) || distance(S, k, near) < distance(S, k, s.target))) s.target = near;
}

/** How dangerous someone is: banked specials, momentum, and (in a title match) the belt. */
function threat(S: MatchState, o: Side): number {
  return o.momentum * 0.2 + o.finisherStock * 10 + (o.signatureReady ? 5 : 0) + (S.rules.champion === o.key ? 12 : 0);
}

/**
 * The AI picks who to go after, by personality and relationships:
 * - whoever's within reach, and whoever's ready to be pinned (opportunists most of all);
 * - the biggest threat (everyone gangs up on them);
 * - grudges: whoever hit them last (the aggressive and hot-headed hold them hardest);
 * - enemies first and friends last; heels leave each other alone while the truce holds;
 * - faces go after heels; and they stick with who they're on unless there's reason not to.
 */
export function aiPickTarget(ctx: Ctx, k: SideKey): SideKey {
  const S = ctx.S, A = S.sides[k]!;
  const list = targetable(S, k);
  if (!list.length) return A.target;
  let best = A.target, bestScore = -Infinity;
  const grudgeW = has(A, 'aggressive') || has(A, 'hot_headed') ? 25 : 14;
  const pinW = has(A, 'opportunist') ? 0.65 : 0.4;
  for (const o of list) {
    const O = S.sides[o]!, d = distance(S, k, o);
    let v = d === 0 ? 30 : d === 1 ? 15 : d === 2 ? 0 : -30;
    v += (100 - pinCondition(O)) * pinW;
    if (O.state.position === 'GROUNDED') v += 8;
    v += threat(S, O);
    if (A.lastHitBy === o) v += grudgeW;
    v -= bond(S, k, o) * 0.3;
    if (allied(S, k, o)) v -= 40;
    if (!heel(A) && heel(O)) v += 6;
    if (o === A.target) v += 15;
    v += ctx.rnd() * 20;
    if (v > bestScore) { bestScore = v; best = o; }
  }
  return best;
}

/** After an exchange: the one who got hit remembers who did it, and (with more people) turns on them. */
export function noteExchange(S: MatchState, a: SideKey, d: SideKey, landed: boolean, reversed: boolean): void {
  if (landed) S.sides[d]!.lastHitBy = a;
  if (reversed) S.sides[a]!.lastHitBy = d;
  if (!isMulti(S)) return;
  if (landed && targetable(S, d).includes(a)) S.sides[d]!.target = a;
  if (reversed) S.sides[d]!.target = a;
}

/* ---------- turns ---------- */

const DOWN = new Set(['GROUNDED']);
/** On their feet (or near enough), with someone to fight. */
function able(S: MatchState, k: SideKey): boolean {
  const s = S.sides[k]!;
  return !DOWN.has(s.state.position) && opponents(S, k).length > 0;
}
const nearest = (S: MatchState, k: SideKey): number => Math.min(...opponents(S, k).map((o) => distance(S, k, o)));

/**
 * Whose turn it is next (more than two people). The one who just won the exchange is favoured, but
 * anyone on their feet with someone to hit can jump in: quicker, fresher and hotter wrestlers more
 * often, and nobody keeps it for long. Anyone down sits it out and tries to get up instead.
 */
export function pickTurn(ctx: Ctx, favoured: Control | null): Control {
  const S = ctx.S;
  breakAlliance(ctx);
  settleSpots(S);
  const cands = fighting(S).filter((k) => able(S, k));
  if (!cands.length) {
    offTurnRecovery(ctx, null);
    return 'neutral';
  }
  let best: SideKey = cands[0]!, bestScore = -Infinity;
  for (const k of cands) {
    const s = S.sides[k]!;
    let v = s.momentum * 0.25 + staminaPercent(s) * 0.15 + s.w.stats.speed * 0.2 + ctx.rnd() * 35 - 8 * Math.max(0, nearest(S, k) - 1);
    if (k === favoured) v += 35;
    if (S.turn.k === k) v -= 12 * S.turn.n;
    if (v > bestScore) { bestScore = v; best = k; }
  }
  S.turn = S.turn.k === best ? { k: best, n: S.turn.n + 1 } : { k: best, n: 1 };
  // Whoever they're going after stays down for them; anyone else down gets a chance to get up.
  offTurnRecovery(ctx, S.sides[best]!.target);
  return best;
}

/** Whoever's down (and not being worked on) gets a chance to get back up between turns. */
function offTurnRecovery(ctx: Ctx, worked: SideKey | null): void {
  const S = ctx.S;
  for (const k of fighting(S)) {
    const s = S.sides[k]!;
    if (k === worked || !DOWN.has(s.state.position) || isHeld(S, k)) continue;
    const p = clamp(0.15 + staminaPercent(s) / 400 + s.momentum / 400 - s.fatigue / 300, 0.08, 0.5);
    if (ctx.rnd() < p) {
      s.state = { position: 'STANDING', orientation: 'FRONT', area: s.state.area, motion: 'STATIONARY' };
      say(ctx, LINES.multiUp, { a: k }, 'dim');
    }
  }
}

/** In the middle of a pin or a hold, so not getting up on their own. */
const isHeld = (S: MatchState, k: SideKey): boolean => !!S.txn && S.txn.kind === 'sub' && foe(S, S.txn.k) === k;

/** The heels' truce ends when there's no face left to beat on, or one of them sees a chance. */
function breakAlliance(ctx: Ctx): void {
  const S = ctx.S;
  if (S.alliance !== 'on') return;
  const left = fighting(S).map((k) => S.sides[k]!);
  const faces = left.filter((s) => !heel(s)).length;
  const late = S.t >= 360 && ctx.rnd() < 0.04;
  if (faces && !late) return;
  S.alliance = 'broken';
  const hs = left.filter(heel);
  if (hs.length >= 2) {
    say(ctx, LINES.multiBetrayal, { a: hs[0]!.key, d: hs[1]!.key }, 'hl');
    heat(ctx, 6);
  }
}

/* ---------- the AI's multi-person instincts ---------- */

const IN_RING = new Set(['IN_RING', 'CORNER', 'ROPES', 'TOP_ROPE']);
const BACK_IN: readonly SetupId[] = ['bring_match_back_to_ring', 'bring_opponent_into_ring', 'return_from_ramp', 'return_to_ring'];

/**
 * Before the AI's own choice: with more than two people you can only win in the ring, so a fight that's
 * been outside a while gets taken back in (in singles the count-out does that job).
 */
export function aiMultiInstinct(S: MatchState, k: SideKey, setups: readonly SetupId[]): SetupId | null {
  const s = S.sides[k]!;
  if (IN_RING.has(s.state.area)) { s.outsideTurns = 0; return null; }
  s.outsideTurns = (s.outsideTurns ?? 0) + 1;
  if (s.outsideTurns < 3 || S.rules.stipulation === 'falls_count_anywhere') return null;
  return BACK_IN.find((id) => setups.includes(id)) ?? null;
}

/* ---------- saves ---------- */

/** Chance (0–1) that c gets to the pin (or hold) on victim in time: how far, how upright, how fresh. */
export function reachChance(S: MatchState, c: SideKey, victim: SideKey): number {
  const s = S.sides[c]!, d = distance(S, c, victim);
  const far = d === 0 ? 0.9 : d === 1 ? 0.65 : d === 2 ? 0.3 : 0.05;
  const up = s.state.position === 'STANDING' ? 1 : s.state.position === 'GROUNDED' ? 0.3 : 0.6;
  return far * up * (0.6 + 0.4 * (staminaPercent(s) / 100));
}

/** How much c wants to stop attacker beating victim (0–1). */
function saveMotive(S: MatchState, c: SideKey, attacker: SideKey, victim: SideKey): number {
  if (sameTeam(S, c, attacker)) return 0;
  let m: number;
  if (S.rules.elimination) {
    // Someone else going out is good news, unless it's your partner (or you'd like the credit).
    m = sameTeam(S, c, victim) ? 1 : has(S.sides[c]!, 'opportunist') ? 0.35 : 0.1;
  } else m = 1; // one fall: if it counts, you've lost
  if (has(S.sides[c]!, 'team_player') && sameTeam(S, c, victim)) m += 0.2;
  m += Math.max(0, bond(S, c, victim)) / 200 + Math.max(0, -bond(S, c, attacker)) / 300;
  return clamp(m, 0, 1);
}

/** Whether c breaks it up and takes it for themselves. */
function stealChance(S: MatchState, c: SideKey, victim: SideKey): number {
  if (sameTeam(S, c, victim)) return 0;
  const s = S.sides[c]!;
  return has(s, 'opportunist') ? 0.6 : heel(s) ? 0.35 : 0.2;
}

/**
 * Does anyone (the AI's people; the player is asked) break up the pin or the hold? The earliest in wins.
 * Pins: at one or two. Holds: after a few seconds.
 */
export function planSave(ctx: Ctx, attacker: SideKey, victim: SideKey, kind: 'pin' | 'sub', player: SavePlan | null = null): SavePlan | null {
  const S = ctx.S;
  if (!isMulti(S)) return null;
  let best = player;
  // Tag matches: the victim's partners on the apron can come in to break it up too.
  const apron = S.rules.tag ? S.order.filter((o) => S.sides[o]!.out === 'apron' && !S.sides[o]!.away && sameTeam(S, o, victim)) : [];
  // ...and the pinner's partner on the apron is there to cut them off.
  const guarded = !!S.rules.tag && S.order.some((o) => S.sides[o]!.out === 'apron' && !S.sides[o]!.away && sameTeam(S, o, attacker));
  for (const c of [...fighting(S), ...apron]) {
    if (c === attacker || c === victim || isPlayer(S, c)) continue;
    const p = saveMotive(S, c, attacker, victim) * reachChance(S, c, victim) * (guarded ? 0.5 : 1);
    if (p <= 0 || ctx.rnd() >= p) continue;
    const d = distance(S, c, victim), near = d === 0;
    const at = kind === 'pin' ? (near && ctx.rnd() < 0.35 ? 1 : 2) : near ? 2 : d === 1 ? 3 : 4;
    const plan = { by: c, at, steal: ctx.rnd() < stealChance(S, c, victim) };
    if (!best || plan.at < best.at) best = plan;
  }
  return best;
}

/** What the player is offered when someone else's pin or hold could end it. */
export function saveOffer(S: MatchState, attacker: SideKey, victim: SideKey): { chance: number; mustSave: boolean } | null {
  const pk = S.player;
  if (!isMulti(S) || !pk || pk === attacker || pk === victim || !fighting(S).includes(pk) || sameTeam(S, pk, attacker)) return null;
  const chance = Math.round(reachChance(S, pk, victim) * 100);
  if (chance <= 0) return null;
  return { chance, mustSave: !S.rules.elimination || sameTeam(S, pk, victim) };
}

/** The player's answer: try to break it up (or steal it), or leave it. Rolls whether they get there. */
export function playerSave(ctx: Ctx, victim: SideKey, choice: 'save' | 'steal' | 'leave'): SavePlan | null {
  const S = ctx.S, pk = S.player!;
  if (choice === 'leave') return null;
  if (ctx.rnd() < reachChance(S, pk, victim)) return { by: pk, at: 2, steal: choice === 'steal' };
  say(ctx, LINES.multiTooLate, { a: pk }, 'dim');
  return null;
}

/**
 * The save lands: the pinner (or whoever had the hold) gets knocked off. A steal: the saver covers
 * the victim themselves, and the crowd knows it.
 */
export function resolveSave(ctx: Ctx, attacker: SideKey, victim: SideKey, plan: SavePlan, kind: 'pin' | 'sub'): void {
  const S = ctx.S, A = S.sides[attacker]!, C = S.sides[plan.by]!;
  S.pinContext = null;
  S.txn = null;
  const c = S.crowd;
  c.saves = (c.saves ?? 0) + 1;
  if (kind === 'pin' && plan.at >= 2) c.nf++;
  heat(ctx, plan.at >= 2 ? 9 : 5);
  damagePart(A, 'BODY', 3);
  A.state = { position: 'GROUNDED', orientation: 'FACE_DOWN', area: A.state.area, motion: 'STATIONARY' };
  A.lastHitBy = plan.by;
  if (plan.steal && kind === 'pin') {
    c.steals = (c.steals ?? 0) + 1;
    say(ctx, LINES.multiSteal, { a: plan.by, d: attacker, vars: { x: S.sides[victim]!.w.name } }, 'hl');
    flash(ctx, 'Stolen!', true);
    ring(ctx, 'pin', plan.by);
    C.target = victim;
    schedule(ctx, { to: 'startPin', k: plan.by, embedded: true, steal: true }, 350);
    return;
  }
  say(ctx, kind === 'pin' ? (plan.at >= 2 ? LINES.multiSaveTwo : LINES.multiSave) : LINES.multiSaveHold, { a: plan.by, d: attacker, vars: { x: S.sides[victim]!.w.name } }, 'hl');
  flash(ctx, 'Broken up!', true);
  ring(ctx, 'move_landed', plan.by, 'Save');
  if (C.out === 'apron') {
    // The partner off the apron: the referee sends them back, and it's anyone's.
    say(ctx, LINES.tagSaveBack, { a: plan.by }, 'dim');
    render(ctx);
    setControl(ctx, 'neutral');
    afterAction(ctx);
    return;
  }
  C.target = attacker;
  render(ctx);
  setControl(ctx, plan.by);
  afterAction(ctx);
}

/* ---------- holds nobody's playing ---------- */

/**
 * A hold between two AI wrestlers while the player watches: the same tug as the player's struggle, both
 * sides pulling as the AI does. Returns how it ended, ticking the hold second by second.
 */
export function simulateAiSub(ctx: Ctx, tick: (marker: number) => void): SubOutcome | 'SAVED' {
  const S = ctx.S, p = S.pending, txn = S.txn;
  if (p.kind !== 'sub' || !txn || txn.kind !== 'sub') return 'BOTCH_OR_SCRAMBLE';
  const spec = p.spec;
  // The "player" side of the tug is the defender (AI vs AI): it mashes as hard as it has fight left.
  const mash = clamp(3 + spec.playerScore / 25, 2, ix.TUG_MAX_TAPS_PER_SECOND);
  const dt = 1 / 30, tapEvery = 1 / mash;
  let marker = spec.start, t = 0, pulse = 0, second = 0, nextTap = tapEvery * (0.5 + ctx.rnd() * 0.5);
  for (;;) {
    t += dt;
    while (t >= nextTap) { marker += spec.playerDirection * ix.tugTapImpulse(spec.playerScore, spec.speedMultiplier); nextTap += tapEvery; }
    pulse += dt;
    while (pulse >= ix.TUG_AI_PULSE_SECONDS) { pulse -= ix.TUG_AI_PULSE_SECONDS; marker += ix.tugAiPulse(spec.playerDirection, spec.aiScore, spec.playerScore, spec.speedMultiplier); }
    marker = clamp(marker, 0, 100);
    second += dt;
    if (second >= 1) {
      second -= 1;
      tick(marker);
      // Broken up mid-hold: the save has already played out.
      if (S.txn !== txn) return 'SAVED';
    }
    const out = ix.tugOutcome(marker, spec.tapThreshold, spec.escapeThreshold);
    if (out) return out;
    if (t > 60) return 'BOTCH_OR_SCRAMBLE';
  }
}

/* ---------- eliminations and results ---------- */

const HOW: Partial<Record<FinishType, string>> = {
  PINFALL: 'pinned', SUBMISSION: 'made to tap', I_QUIT: 'made to quit', COUNT_OUT: 'counted out', DISQUALIFICATION: 'disqualified',
};

/**
 * Someone's out. With one team left, that's the match; otherwise everyone regroups (a neutral restart)
 * and anyone who was going after them finds someone else.
 */
export function eliminate(ctx: Ctx, k: SideKey, by: SideKey | null, finish: FinishType, move: Move | null): void {
  const S = ctx.S, s = S.sides[k]!;
  if (s.out === 'eliminated' || S.over) return;
  s.out = 'eliminated';
  S.elims.push({ k, by, finish, t: S.t, move: move?.name ?? null });
  if (by) S.sides[by]!.elimsBy = (S.sides[by]!.elimsBy ?? 0) + 1;
  S.crowd.elims = (S.crowd.elims ?? 0) + 1;
  S.pinContext = null;
  S.txn = null;
  heat(ctx, 8);
  const left = teamsAlive(S);
  say(ctx, by ? LINES.multiElim : LINES.multiElimNoOne, { a: by ?? undefined, d: k, vars: { x: HOW[finish] ?? 'out', n: alive(S).length } }, 'hl');
  flash(ctx, `${s.w.name.split(' ').pop()} eliminated`, true);
  if (left.length <= 1) {
    const winner = by && alive(S).includes(by) ? by : alive(S)[0] ?? null;
    return endMatch(ctx, winner, finish, move, k);
  }
  // Elimination tag: their partner comes in.
  const next = replaceLegal(S, k);
  if (next) say(ctx, LINES.tagIn, { a: next }, 'dim');
  retargetAll(S);
  ring(ctx, 'control', null);
  render(ctx);
  setControl(ctx, 'neutral');
}

/** Everyone on the winning team, and everyone who isn't. */
export function sidesOfResult(S: MatchState, winner: SideKey | null): { winners: SideKey[]; losers: SideKey[] } {
  if (!winner) return { winners: [], losers: [...S.order] };
  const team = S.sides[winner]!.team;
  return { winners: S.order.filter((k) => S.sides[k]!.team === team), losers: S.order.filter((k) => S.sides[k]!.team !== team) };
}

/**
 * Counted out with more than two people: in an elimination match everyone outside goes; otherwise the
 * first of them loses the match, to whoever they were fighting (or whoever's left standing in the ring).
 */
export function multiCountOut(ctx: Ctx, outside: SideKey[]): void {
  const S = ctx.S;
  if (S.rules.elimination) {
    const remaining = alive(S).filter((k) => !outside.includes(k));
    if (new Set(remaining.map((k) => S.sides[k]!.team)).size === 0) {
      say(ctx, LINES.doubleCountOut, {}, 'bad');
      return endMatch(ctx, null, 'DOUBLE_COUNT_OUT', null);
    }
    for (const k of outside) {
      if (S.over) return;
      say(ctx, LINES.countOut, { d: k, vars: { n: S.rules.countOutLimit } }, 'bad');
      eliminate(ctx, k, null, 'COUNT_OUT', null);
    }
    return;
  }
  const out = outside[0]!;
  const inRing = opponents(S, out).filter((o) => !outside.includes(o));
  const winner = inRing.includes(foe(S, out)) ? foe(S, out) : inRing[0] ?? null;
  say(ctx, LINES.countOut, { d: out, vars: { n: S.rules.countOutLimit } }, 'bad');
  endMatch(ctx, winner, 'COUNT_OUT', null, out);
}
