// Battle royals, Rumbles and gauntlets (match overhaul, stage 4). Over the top rope with both feet on the
// floor is the only way out of a battle royal or a Rumble: a real contest of its own, where the loser can
// end up hanging on to the apron and skin the cat back in, or get knocked off. A big field splits into
// brawls of two or three. Rumble entrants come in on a clock in a numbered draw; a gauntlet sends the next
// one in whenever someone goes out, and whoever's left carries the damage into the next fight.
import { LINES } from '../data/commentary';
import { advanceClock } from './clock';
import type { Ctx } from './ctx';
import { fighting, ring, say } from './commentary';
import { startContest } from './contest';
import { heat } from './crowd';
import { ottContest, type ContestRoll } from './dice';
import { afterAction, render, setControl } from './flow';
import { eliminate, retargetAll, targetable } from './multi';
import { pinCondition } from './pin';
import { clamp, type Rng } from './rng';
import { has } from './traits';
import type { Area, MatchState, SetupId, SideKey } from './types';
import { BODY_PARTS } from './types';

export const isRoyal = (S: MatchState): boolean => S.type === 'battle_royal' || S.type === 'rumble';
/** Matches where people come in one at a time (on a clock, or when someone goes out). */
export const hasEntrants = (S: MatchState): boolean =>
  S.type === 'rumble' || S.type === 'gauntlet' || S.rules.stipulation === 'elimination_chamber' || S.rules.stipulation === 'wargames';
/** Entrants on a clock: the Rumble, the Chamber's pods, WarGames. */
export const timedEntries = (S: MatchState): boolean => S.type === 'rumble' || S.rules.stipulation === 'elimination_chamber' || S.rules.stipulation === 'wargames';
/** Seconds between entrants: the Rumble's 90, the Chamber's pods every four minutes, WarGames every two. */
export const entryInterval = (S: MatchState): number =>
  S.rules.entryEvery ?? (S.rules.stipulation === 'elimination_chamber' ? 240 : S.rules.stipulation === 'wargames' ? 120 : RUMBLE_INTERVAL);
/** Lyra's call: a new Rumble entrant every 90 seconds of match time. */
export const RUMBLE_INTERVAL = 90;

const RING: ReadonlySet<Area> = new Set<Area>(['IN_RING', 'ROPES', 'CORNER', 'TOP_ROPE']);
const FLOOR: ReadonlySet<Area> = new Set<Area>(['OUTSIDE', 'RAMP', 'CROWD', 'BACKSTAGE']);
/** No leaving through the ropes in a battle royal: going over the top is how you lose. */
export const ROYAL_BLOCKED: ReadonlySet<SetupId> = new Set<SetupId>(['send_opponent_outside', 'call_opponent_outside', 'exit_ring', 'take_fight_outside', 'fight_up_ramp']);

/**
 * At the bell. Battle royal: everyone's in. Rumble and gauntlet: the draw (booked, or drawn at random),
 * and the first two start; everyone else waits in the back.
 */
export function setupRoyal(S: MatchState, rnd: Rng): void {
  let draw = [...S.order];
  const booked = S.rules.draw;
  if (booked && booked.length === S.order.length && S.order.every((k) => booked.includes(k))) draw = [...booked];
  else if (S.rules.stipulation === 'wargames') {
    // One from each team starts; then they alternate, the team that won the advantage first.
    const teams = [...new Set(S.order.map((k) => S.sides[k]!.team))];
    const by = teams.map((t) => S.order.filter((k) => S.sides[k]!.team === t));
    const adv = rnd() < 0.5 ? 0 : 1, other = 1 - adv;
    draw = [by[0]![0]!, by[1]![0]!];
    for (let i = 1; i < Math.max(by[0]!.length, by[1]!.length); i++) {
      if (by[adv]![i]) draw.push(by[adv]![i]!);
      if (by[other]![i]) draw.push(by[other]![i]!);
    }
    for (const k of S.order) if (!draw.includes(k)) draw.push(k);
  } else if (S.type === 'rumble' || S.rules.stipulation === 'elimination_chamber') {
    for (let i = draw.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [draw[i], draw[j]] = [draw[j]!, draw[i]!];
    }
  }
  S.draw = draw;
  S.entries = {};
  draw.forEach((k, i) => {
    const s = S.sides[k]!;
    const starts = !hasEntrants(S) || i < 2;
    S.entries![k] = { n: i + 1, inAt: starts ? 0 : null, outAt: null, elims: 0 };
    s.spot = i % 4;
    if (!starts) {
      s.out = S.rules.stipulation === 'elimination_chamber' ? 'pod' : 'waiting';
      s.state = { position: 'STANDING', orientation: 'FRONT', area: 'BACKSTAGE', motion: 'STATIONARY' };
    }
  });
  if (timedEntries(S)) S.nextEntry = entryInterval(S);
  retargetAll(S);
  if (hasEntrants(S)) {
    const [a, b] = draw;
    S.sides[a!]!.target = b!;
    S.sides[b!]!.target = a!;
  }
}

/** Who's next in the draw, if anyone. */
export const nextEntrant = (S: MatchState): SideKey | null => S.draw?.find((k) => S.sides[k]!.out === 'waiting' || S.sides[k]!.out === 'pod') ?? null;

/** The next one through the curtain. */
export function enterNext(ctx: Ctx): SideKey | null {
  const S = ctx.S, k = nextEntrant(S);
  if (!k) {
    S.nextEntry = undefined;
    return null;
  }
  const s = S.sides[k]!, e = S.entries![k]!;
  s.out = undefined;
  s.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
  e.inAt = S.t;
  const surprise = !!S.rules.surprises?.includes(k);
  if (surprise) S.crowd.surprises = (S.crowd.surprises ?? 0) + 1;
  heat(ctx, surprise ? 12 : 4);
  const st = S.rules.stipulation;
  const line = S.type === 'gauntlet' ? LINES.gauntletNext : st === 'elimination_chamber' ? LINES.chamberPod : st === 'wargames' ? LINES.wargamesEntry
    : surprise ? LINES.rumbleSurprise : LINES.rumbleEntry;
  say(ctx, line, { a: k, vars: { n: e.n } }, 'hl');
  ring(ctx, 'control', k);
  S.clusterLeft = 0;
  retargetAll(S);
  if (timedEntries(S)) S.nextEntry = nextEntrant(S) ? (S.nextEntry ?? S.t) + entryInterval(S) : undefined;
  // WarGames: everyone's in, and the match beyond begins.
  if (st === 'wargames' && !nextEntrant(S)) {
    S.rules = { ...S.rules, pins: true, subs: true };
    heat(ctx, 12);
    say(ctx, LINES.wargamesBeyond, {}, 'hl');
  }
  render(ctx);
  return k;
}

/** The Rumble clock: whoever's number has come up comes in. */
export function rumbleClock(ctx: Ctx): void {
  const S = ctx.S;
  while (timedEntries(S) && !S.over && S.nextEntry !== undefined && S.t >= S.nextEntry) {
    if (!enterNext(ctx)) break;
  }
}

/* ---------- clusters ---------- */

/** A big field splits into brawls of two or three, regrouping every round. */
function regroup(ctx: Ctx): void {
  const S = ctx.S, list = fighting(S);
  if (list.length <= 4) {
    S.clusters = undefined;
    S.clusterLeft = list.length;
    return;
  }
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.rnd() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const groups: SideKey[][] = [];
  for (let i = 0; i < shuffled.length;) {
    const left = shuffled.length - i, size = left === 4 || left === 2 ? 2 : 3;
    groups.push(shuffled.slice(i, i + size));
    i += size;
  }
  S.clusters = groups;
  S.clusterLeft = list.length;
  for (const g of groups) {
    for (const k of g) {
      const s = S.sides[k]!, opts = g.filter((o) => o !== k && targetable(S, k).includes(o));
      if (opts.length && !opts.includes(s.target)) s.target = opts[Math.floor(ctx.rnd() * opts.length)]!;
    }
  }
}

/** The brawl someone's in (empty in a small field). */
export const clusterOf = (S: MatchState, k: SideKey): SideKey[] => S.clusters?.find((g) => g.includes(k)) ?? [];

/** A Rumble breather, each action someone's not in: a share of their stamina back, and some fatigue off. */
export const RUMBLE_BREATHER = { stamina: 0.01, fatigue: 0.4, hp: 0.3 };

/* ---------- over the top ---------- */

/** Whether k can try to throw their target over the top right now. */
export function canOverTop(S: MatchState, k: SideKey): boolean {
  if (!isRoyal(S) || S.over) return false;
  const A = S.sides[k]!, D = S.sides[A.target];
  if (!D || !fighting(S).includes(D.key) || !RING.has(A.state.area) || A.state.position === 'GROUNDED' || A.state.area === 'TOP_ROPE') return false;
  return RING.has(D.state.area) || D.state.area === 'APRON';
}

/** Try to throw them over. Someone hanging on the apron just needs knocking off (a big edge). */
export function overTheTop(ctx: Ctx, k: SideKey): boolean {
  const S = ctx.S;
  if (!canOverTop(S, k)) return false;
  advanceClock(ctx);
  if (S.over) return true;
  const A = S.sides[k]!, d = A.target, D = S.sides[d]!, hanging = D.state.area === 'APRON';
  S.crowd.ottTries = (S.crowd.ottTries ?? 0) + 1;
  say(ctx, hanging ? LINES.royalGoesForKnockOff : LINES.royalTries, { a: k, d }, 'warn');
  const inAt = S.entries?.[d]?.inAt;
  const ringWise = S.type === 'rumble' && inAt != null ? Math.min(4, Math.floor((S.t - inAt) / 480)) : 0;
  const { attack, defend } = ottContest(A, D, hanging, ringWise);
  S.txn = { kind: 'ott', k, d, hanging, chance: 0 };
  startContest(ctx, { kind: 'ott', attacker: k, defender: d, title: hanging ? 'Knock them off' : 'Over the top', major: null, attack, defend });
  return true;
}

/**
 * The heave's been rolled for. Won well (or they had nothing left, or were already hanging on): over and
 * out. Won narrowly: over, but hanging on to the apron. Lost: fought off, and on a defender's natural it
 * goes the other way.
 */
export function finishOverTop(ctx: Ctx, k: SideKey, d: SideKey, hanging: boolean, roll: ContestRoll): void {
  const S = ctx.S, A = S.sides[k]!, D = S.sides[d]!, c = S.crowd;
  const margin = roll.attackerTotal - roll.defenderTotal;
  if (roll.landed) {
    // Battered enough, there's nothing left to hang on with (a Rumble's long haul: only when really spent).
    if (hanging || margin >= 5 || pinCondition(D) < (S.type === 'rumble' ? 15 : 30)) {
      say(ctx, hanging ? LINES.royalKnockedOff : LINES.royalOver, { a: k, d }, 'hl');
      D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'OUTSIDE', motion: 'STATIONARY' };
      D.lastHitBy = k;
      ring(ctx, 'move_landed', k, 'Over the top');
      return eliminate(ctx, d, k, 'OVER_THE_TOP', null);
    }
    D.state = { position: 'STANDING', orientation: 'FRONT', area: 'APRON', motion: 'STATIONARY' };
    D.lastHitBy = k;
    c.hangs = (c.hangs ?? 0) + 1;
    heat(ctx, 6);
    say(ctx, LINES.royalHangsOn, { a: k, d }, 'warn');
    ring(ctx, 'move_landed', k, 'Over the top');
    setControl(ctx, k);
    return afterAction(ctx);
  }
  if (roll.crit === 'defenderTop' && !hanging) {
    A.lastHitBy = d;
    if (ctx.rnd() < 0.5) {
      A.state = { position: 'STANDING', orientation: 'FRONT', area: 'APRON', motion: 'STATIONARY' };
      c.hangs = (c.hangs ?? 0) + 1;
      heat(ctx, 6);
      say(ctx, LINES.royalBackfireHang, { a: d, d: k }, 'warn');
      ring(ctx, 'reversal', d);
      setControl(ctx, d);
      return afterAction(ctx);
    }
    say(ctx, LINES.royalBackfire, { a: d, d: k }, 'hl');
    A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'OUTSIDE', motion: 'STATIONARY' };
    ring(ctx, 'reversal', d);
    return eliminate(ctx, k, d, 'OVER_THE_TOP', null);
  }
  say(ctx, LINES.royalFightsOff, { a: d, d: k }, 'dim');
  ring(ctx, 'reversal', d);
  setControl(ctx, d);
  afterAction(ctx);
}

/** Hanging on to the apron: skin the cat back in (or climb back through), or fall to the floor. */
export const hanging = (S: MatchState, k: SideKey): boolean => isRoyal(S) && S.sides[k]!.state.area === 'APRON' && !S.sides[k]!.out;

export function skinTheCat(ctx: Ctx, k: SideKey): boolean {
  const S = ctx.S, s = S.sides[k]!;
  if (!hanging(S, k)) return false;
  advanceClock(ctx);
  if (S.over) return true;
  const p = clamp(0.62 + (s.w.stats.speed - 70) / 100 + s.momentum / 500 - s.fatigue / 300, 0.25, 0.92);
  if (ctx.rnd() < p) {
    const athletic = s.w.stats.speed >= 75;
    s.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
    if (athletic) {
      S.crowd.skins = (S.crowd.skins ?? 0) + 1;
      heat(ctx, 7);
    }
    say(ctx, athletic ? LINES.royalSkinTheCat : LINES.royalClimbsIn, { a: k }, athletic ? 'hl' : 'dim');
    setControl(ctx, k);
    return afterAction(ctx), true;
  }
  say(ctx, LINES.royalFalls, { a: k }, 'bad');
  s.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'OUTSIDE', motion: 'STATIONARY' };
  eliminate(ctx, k, s.lastHitBy && fighting(S).includes(s.lastHitBy) ? s.lastHitBy : null, 'OVER_THE_TOP', null);
  return true;
}

/** Before the AI's own choice in a battle royal: get back in if you're hanging on; heave someone over when it's on. */
export function aiRoyalInstinct(ctx: Ctx, k: SideKey): 'ott' | 'skin' | null {
  const S = ctx.S, A = S.sides[k]!;
  if (!isRoyal(S)) return null;
  if (hanging(S, k)) return 'skin';
  if (!canOverTop(S, k)) return null;
  const D = S.sides[A.target]!;
  if (D.state.area === 'APRON') return ctx.rnd() < 0.85 ? 'ott' : null;
  const n = fighting(S).length;
  let p = 0.08 + (100 - pinCondition(D)) / (S.type === 'rumble' ? 600 : 300) + (D.state.area === 'ROPES' || D.state.area === 'CORNER' ? 0.12 : 0) + (n > 6 ? 0.06 : 0);
  if (n === 2) p += 0.1;
  if (has(A, 'aggressive')) p += 0.05;
  // A Rumble still filling up: they brawl, and the heaving starts in earnest once the ring's full.
  if (S.type === 'rumble' && nextEntrant(S)) p *= clamp(n / 8, 0.35, 1);
  return ctx.rnd() < clamp(p, 0.05, 0.6) ? 'ott' : null;
}

/** After every action: anyone whose feet have touched the floor is out, and the brawls regroup each round. */
export function royalAfterAction(ctx: Ctx): void {
  const S = ctx.S;
  if (!isRoyal(S) || S.over) return;
  // A Rumble's long haul: anyone not in this exchange lays low and gets a breather. Without it the early numbers
  // were worn to nothing by the end and the last few in won nearly every time (Lyra: 54 of 60 from #21–30).
  if (S.type === 'rumble') {
    const ctl = S.control && S.sides[S.control] ? S.control : null, busy = new Set([ctl, ctl ? S.sides[ctl]!.target : null]);
    for (const k of fighting(S)) {
      if (busy.has(k)) continue;
      const s = S.sides[k]!;
      s.stamina = Math.min(s.maxStamina, s.stamina + s.maxStamina * RUMBLE_BREATHER.stamina);
      s.fatigue = Math.max(0, s.fatigue - RUMBLE_BREATHER.fatigue);
      for (const part of BODY_PARTS) s.hp[part] = Math.min(100, s.hp[part] + RUMBLE_BREATHER.hp);
    }
  }
  for (const k of fighting(S)) {
    const s = S.sides[k]!;
    if (!FLOOR.has(s.state.area)) continue;
    say(ctx, LINES.royalToTheFloor, { a: k }, 'hl');
    eliminate(ctx, k, s.lastHitBy && fighting(S).includes(s.lastHitBy) ? s.lastHitBy : null, 'OVER_THE_TOP', null);
    if (S.over) return;
  }
  S.clusterLeft = (S.clusterLeft ?? 0) - 1;
  if (S.clusterLeft <= 0) regroup(ctx);
}

/** Someone's out: note it on the entry card, and (a gauntlet) send the next one in. */
export function royalOnElimination(ctx: Ctx, k: SideKey, by: SideKey | null): void {
  const S = ctx.S;
  if (!S.entries) return;
  const e = S.entries[k];
  if (e) e.outAt = S.t;
  if (by && S.entries[by]) S.entries[by]!.elims++;
  S.clusterLeft = 0;
  if (S.type === 'gauntlet' && !S.over) {
    const next = enterNext(ctx);
    // Whoever's left gets a breather while the next one comes down.
    if (next) for (const o of fighting(S)) if (o !== next) S.sides[o]!.stamina = Math.min(S.sides[o]!.maxStamina, S.sides[o]!.stamina + S.sides[o]!.maxStamina * 0.06);
  }
}

/** Iron man records: longest time in the match, and most eliminations. */
export function ironMen(S: MatchState): { longest: SideKey | null; secs: number; most: SideKey | null; elims: number } {
  let longest: SideKey | null = null, secs = 0, most: SideKey | null = null, elims = 0;
  for (const [k, e] of Object.entries(S.entries ?? {})) {
    if (e.inAt === null) continue;
    const t = (e.outAt ?? S.t) - e.inAt;
    if (t > secs) { secs = t; longest = k; }
    if (e.elims > elims) { elims = e.elims; most = k; }
  }
  return { longest, secs, most, elims };
}
