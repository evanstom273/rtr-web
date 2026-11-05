// Tag teams (match overhaul, stage 3): one legal man a team, partners waiting on the apron in their own
// corner. Tags happen in your corner, so the other team cuts you off and drags you back; the crawl for
// the tag is a dice contest, and a tag after a long beating is a hot tag. Heels distract the referee,
// the illegal man sneaks in, and double-teams in the corner are legal for a five-count.
import { getMove, type Move } from '../data/rtr';
import { LINES } from '../data/commentary';
import { advanceClock } from './clock';
import type { Ctx } from './ctx';
import { fighting, flash, ring, say } from './commentary';
import { startContest } from './contest';
import { heat } from './crowd';
import { tagContest } from './dice';
import { staminaPercent } from './exhaustion';
import { afterAction, render, schedule, setControl } from './flow';
import { gainMomentum } from './momentum';
import { pinCondition } from './pin';
import { refSees, warn } from './referee';
import { damagePart } from './side';
import { has } from './traits';
import { CORNERS, TEAM_CORNER } from './zones';
import type { Area, MatchState, SetupId, Side, SideKey } from './types';

/** Tag rules: more than two people, and the booker said tags. */
export const tagRules = (S: MatchState): boolean => !!S.rules.tag && S.order.length > 2;
const heel = (s: Side): boolean => s.w.disposition === 'HEEL';
const ownCorner = (S: MatchState, k: SideKey): number => CORNERS.indexOf(TEAM_CORNER[S.sides[k]!.team % TEAM_CORNER.length]!);
const IN_RING: ReadonlySet<Area> = new Set<Area>(['IN_RING', 'ROPES', 'CORNER', 'TOP_ROPE']);
const CORNERED: ReadonlySet<Area> = new Set<Area>(['CORNER', 'TOP_ROPE']);
/**
 * When the AI tags out, per turn it could. Beaten (this many actions on the wrong end) or running on empty:
 * reach for the corner. After a run of its own: tag a fresher partner in, keep a fresh man on them while on
 * top (heels with their man cornered or down most of all), and now and then otherwise.
 */
/**
 * A partner on the apron breaking up a pin or a hold: how often they get there, and with the other team's man there
 * to head them off. After a save, how often the two partners brawl to the floor, and for how many actions.
 */
export const TAG_SAVE = { reach: 0.85, guarded: 0.45, guardedHold: 0.9, brawl: 0.7, brawlFor: 5, sayCut: 0.3 };
export const TAG_AI = { beaten: 5, reach: 0.35, settled: 3, fresher: 0.15, quick: 0.05, heelQuick: 0.12, idle: 0.01, bigTeams: 0.5 };
const standing = (S: MatchState, k: SideKey): Side['state'] => ({ position: 'STANDING', orientation: 'FRONT', area: S.sides[k]!.state.area, motion: 'STATIONARY' });

/** The legal man for a team (or null). */
export const legalOf = (S: MatchState, team: number): SideKey | null => S.order.find((k) => S.sides[k]!.team === team && S.sides[k]!.legal) ?? null;

/** Bell: the first of each team starts; everyone else waits on the apron in their corner. */
export function setupTag(S: MatchState): void {
  const seen = new Set<number>();
  for (const k of S.order) {
    const s = S.sides[k]!;
    s.spot = ownCorner(S, k);
    if (!seen.has(s.team)) {
      seen.add(s.team);
      s.legal = true;
      continue;
    }
    s.legal = false;
    s.out = 'apron';
    s.state = { position: 'STANDING', orientation: 'FRONT', area: 'APRON', motion: 'STATIONARY' };
  }
  syncTargets(S);
}

/** Legal men go after each other; the men on the apron watch whoever's legal on the other side. */
export function syncTargets(S: MatchState): void {
  for (const k of S.order) {
    const s = S.sides[k]!;
    const opp = S.order.find((o) => S.sides[o]!.team !== s.team && S.sides[o]!.legal && S.sides[o]!.out !== 'eliminated');
    if (opp && (!s.legal || !S.sides[s.target]?.legal)) s.target = opp;
  }
}

/** A partner on the apron who could take the tag (the freshest, if there's more than one). */
export function partnerFor(S: MatchState, k: SideKey): SideKey | null {
  const team = S.sides[k]!.team;
  const ready = S.order.filter((o) => o !== k && S.sides[o]!.team === team && S.sides[o]!.out === 'apron' && !S.sides[o]!.away);
  return ready.sort((a, b) => pinCondition(S.sides[b]!) - pinCondition(S.sides[a]!))[0] ?? null;
}

/** How far from your own corner: 0 in it, 1 elsewhere in the ring, 2 out of the ring. */
export function cornerDistance(S: MatchState, k: SideKey): number {
  const s = S.sides[k]!;
  if (CORNERED.has(s.state.area) && s.spot === ownCorner(S, k)) return 0;
  return IN_RING.has(s.state.area) ? 1 : 2;
}

/** Whether k (legal, with the turn) can go for a tag. */
export function canTag(S: MatchState, k: SideKey): boolean {
  const s = S.sides[k]!;
  // Just tagged in: not straight back out (it was a free loop: tag, tag back, tag, and the other side never moved).
  return tagRules(S) && !!s.legal && !S.over && !s.fresh && !!partnerFor(S, k) && cornerDistance(S, k) <= 1;
}

/** Whether k can bring their partner in for a double-team: the other man's in your corner. */
export function canDoubleTeam(S: MatchState, k: SideKey): boolean {
  const s = S.sides[k]!, d = S.sides[s.target];
  if (!tagRules(S) || !s.legal || !d?.legal || S.over || !partnerFor(S, k)) return false;
  return CORNERED.has(d.state.area) && d.spot === ownCorner(S, k) && d.state.position !== 'GROUNDED' && IN_RING.has(s.state.area);
}

/**
 * Going for the tag. In your corner, or with the other man down or out of the ring, you just make it.
 * Otherwise it's a crawl against the man trying to cut you off.
 */
export function goForTag(ctx: Ctx, k: SideKey): boolean {
  const S = ctx.S, A = S.sides[k]!, to = partnerFor(S, k);
  if (!to || !canTag(S, k)) return false;
  advanceClock(ctx);
  if (S.over) return true;
  const D = S.sides[A.target];
  const contested = cornerDistance(S, k) === 1 && !!D?.legal && fighting(S).includes(D.key) && D.state.position !== 'GROUNDED' && IN_RING.has(D.state.area);
  if (!contested) {
    makeTag(ctx, k, to);
    return true;
  }
  say(ctx, A.state.position === 'GROUNDED' ? LINES.tagCrawl : LINES.tagReach, { a: k, d: D.key, vars: { x: S.sides[to]!.w.name } }, 'warn');
  const { attack, defend } = tagContest(A, D, A.peakPeril ?? 0, pinCondition(S.sides[to]!) > 60);
  S.txn = { kind: 'tag', k, to, chance: 0 };
  startContest(ctx, { kind: 'tag', attacker: k, defender: D.key, title: (A.peakPeril ?? 0) >= 4 ? 'The hot tag' : 'Going for the tag', major: null, attack, defend });
  return true;
}

/** The crawl's been rolled for. Made it: tag. Didn't: cut off, dragged back, maybe your partner knocked off the apron. */
export function finishTagReach(ctx: Ctx, k: SideKey, to: SideKey, failed: boolean): void {
  if (!failed) return makeTag(ctx, k, to);
  const S = ctx.S, A = S.sides[k]!, d = A.target, D = S.sides[d]!, c = S.crowd;
  c.cutOffs = (c.cutOffs ?? 0) + 1;
  heat(ctx, 5);
  A.state = { position: 'GROUNDED', orientation: 'FACE_DOWN', area: 'IN_RING', motion: 'STATIONARY' };
  A.spot = ownCorner(S, d);
  say(ctx, LINES.tagCutOff, { a: d, d: k }, 'bad');
  if (heel(D) && ctx.rnd() < 0.3) {
    const P = S.sides[to]!;
    P.away = 2;
    P.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'OUTSIDE', motion: 'STATIONARY' };
    say(ctx, LINES.tagKnockedOff, { a: d, d: to }, 'bad');
  }
  ring(ctx, 'reversal', d);
  setControl(ctx, d);
  afterAction(ctx);
}

/**
 * The tag. The one coming in takes over (and the player takes them over, if it's their team). After a
 * long beating it's a hot tag: the crowd erupts and they come in with the momentum. With the referee
 * looking the other way, a babyface's tag doesn't count.
 */
export function makeTag(ctx: Ctx, from: SideKey, to: SideKey): void {
  const S = ctx.S, F = S.sides[from]!, T = S.sides[to]!, c = S.crowd;
  if (S.ref.distracted > 0 && !heel(F)) {
    say(ctx, LINES.tagNotSeen, { a: from, d: to }, 'bad');
    heat(ctx, 6);
    const opp = F.target;
    render(ctx);
    setControl(ctx, opp);
    afterAction(ctx);
    return;
  }
  // A hot tag needs a proper beating: a long spell on the wrong end, and hurt with it.
  const hot = (F.peakPeril ?? 0) >= 5 && pinCondition(F) < 65;
  const opp = F.target;
  F.out = 'apron';
  F.legal = false;
  F.state = { position: 'STANDING', orientation: 'FRONT', area: 'APRON', motion: 'STATIONARY' };
  F.spot = ownCorner(S, from);
  F.peril = F.peakPeril = F.legalTurns = 0;
  T.out = undefined;
  T.legal = true;
  T.away = 0;
  T.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
  T.peril = T.peakPeril = T.legalTurns = 0;
  // Fresh: this tag's own turn ends, then one more action has to happen before they can tag out.
  T.fresh = 2;
  T.target = opp;
  if (S.sides[opp]) S.sides[opp]!.target = to;
  syncTargets(S);
  // You play whoever's legal on your team.
  if (S.player === from) {
    S.player = to;
    F.controller = 'ai';
    T.controller = 'player';
  }
  c.tags = (c.tags ?? 0) + 1;
  if (hot) {
    c.hotTags = (c.hotTags ?? 0) + 1;
    // The hot tag is a tag match's comeback.
    c.comeback ??= to;
    heat(ctx, 15);
    gainMomentum(ctx, to, 25);
    say(ctx, LINES.tagHot, { a: to, d: from }, 'hl');
    flash(ctx, 'Hot tag!', true);
  } else {
    heat(ctx, 2);
    say(ctx, LINES.tagMade, { a: from, d: to }, 'dim');
  }
  ring(ctx, 'control', to);
  render(ctx);
  setControl(ctx, to);
  afterAction(ctx);
}

/* ---------- double-teams ---------- */

const DOUBLE_TEAMS = ['double suplex', 'double back elbow', 'assisted powerbomb', 'double-team neckbreaker', 'double hip toss', 'elevated legdrop', 'double chokeslam', 'flapjack into a cutter'];

/** A team move, as a move the pin rules understand (for the cover after a team finisher). */
function teamMove(name: string, impact: number, finisher: boolean): Move {
  return { ...getMove('deadlift_powerbomb'), id: `team_${name.toLowerCase().replace(/\W+/g, '_')}`, name, impact, finisher };
}

/**
 * The partner comes in for a double-team in your corner: legal for a five-count. An established team
 * with a finisher banked hits their team finisher and covers. Heels and dirty fighters linger past five.
 */
export function doubleTeam(ctx: Ctx, k: SideKey): boolean {
  const S = ctx.S, A = S.sides[k]!, d = A.target, D = S.sides[d]!, p = partnerFor(S, k);
  if (!p || !canDoubleTeam(S, k)) return false;
  advanceClock(ctx);
  if (S.over) return true;
  const P = S.sides[p]!, c = S.crowd;
  const finisherName = S.rules.teamFinishers?.[A.team];
  const finisher = !!finisherName && A.finisherStock > 0;
  const chance = 0.72 + (A.momentum - D.momentum) / 400 + (finisher ? 0.08 : 0) - (D.momentum >= 80 ? 0.15 : 0);
  if (ctx.rnd() >= chance) {
    say(ctx, LINES.doubleFail, { a: d, d: k, vars: { x: P.w.name } }, 'warn');
    A.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
    D.state = standing(S, d);
    D.state.area = 'IN_RING';
    ring(ctx, 'reversal', d);
    setControl(ctx, d);
    afterAction(ctx);
    return true;
  }
  const name = finisher ? finisherName! : DOUBLE_TEAMS[Math.floor(ctx.rnd() * DOUBLE_TEAMS.length)]!;
  const impact = finisher ? 12 : 8;
  damagePart(D, 'BODY', impact * 0.9);
  damagePart(D, 'HEAD', impact * 0.5);
  D.damageTaken += impact * 1.4;
  A.damageDealt += impact * 1.4;
  D.lastHitBy = k;
  D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
  c.doubleTeams = (c.doubleTeams ?? 0) + 1;
  c.spots++;
  heat(ctx, finisher ? 14 : 6);
  gainMomentum(ctx, k, finisher ? -A.momentum : 8);
  if (finisher) A.finisherStock--;
  say(ctx, finisher ? LINES.teamFinisher : LINES.doubleTeam, { a: k, d, vars: { x: P.w.name, m: name.toUpperCase() } }, finisher ? 'hl' : '');
  if (finisher) flash(ctx, name, true);
  // The referee's five-count: most are out by four.
  if ((heel(P) || has(P, 'dirty_fighter')) && ctx.rnd() < 0.25) warn(ctx, p, 1, 'staying in past five');
  else say(ctx, LINES.fiveCount, { a: p }, 'dim');
  ring(ctx, 'move_landed', k, name);
  A.lastActionResult = 'CLEAN_SUCCESS';
  A.lastMoveLanded = teamMove(name, impact, finisher);
  A.lastMoveWasFinisher = finisher;
  if (S.obj.decision) return afterAction(ctx), true;
  if (finisher) {
    schedule(ctx, { to: 'startPin', k, embedded: true }, 450);
    return true;
  }
  render(ctx);
  setControl(ctx, k);
  afterAction(ctx);
  return true;
}

/* ---------- between actions ---------- */

/** A cheap shot from the illegal man. */
function cheapShot(ctx: Ctx, by: SideKey, victim: SideKey): void {
  const S = ctx.S, V = S.sides[victim]!;
  damagePart(V, 'BODY', 5);
  damagePart(V, 'HEAD', 2);
  V.damageTaken += 7;
  V.lastHitBy = by;
  V.state = { position: 'GROUNDED', orientation: 'FACE_DOWN', area: V.state.area, motion: 'STATIONARY' };
  gainMomentum(ctx, victim, -5);
  S.crowd.dirty++;
  heat(ctx, 3);
  say(ctx, LINES.illegalMan, { a: by, d: victim }, 'bad');
  ring(ctx, 'move_landed', by, 'Cheap shot');
}

/**
 * After every action in a tag match: keep track of who's in peril, put people in the right corner, let
 * the men on the apron get up to their tricks, and get anyone knocked off the apron back up there.
 */
export function tagAfterAction(ctx: Ctx): void {
  const S = ctx.S;
  if (!tagRules(S) || S.over) return;
  const ctl = S.control && S.sides[S.control] ? S.control : null;
  for (const k of S.order) {
    const s = S.sides[k]!;
    if (s.out === 'eliminated') continue;
    if (s.fresh) s.fresh--;
    if (s.away && --s.away === 0) {
      s.state = { position: 'STANDING', orientation: 'FRONT', area: 'APRON', motion: 'STATIONARY' };
      say(ctx, LINES.tagBackOnApron, { a: k }, 'dim');
    }
    if (!s.legal) {
      // Getting some breath back on the apron.
      if (s.out === 'apron') {
        s.stamina = Math.min(s.maxStamina, s.stamina + s.maxStamina * 0.015);
        s.fatigue = Math.max(0, s.fatigue - 0.5);
      }
      continue;
    }
    // Thrown into a corner by the other team: it's theirs. Went there yourself: it's yours.
    if (CORNERED.has(s.state.area) && !CORNERED.has(s.wasArea ?? 'IN_RING')) s.spot = ctl && ctl !== k && S.sides[ctl]!.team !== s.team ? ownCorner(S, ctl) : ownCorner(S, k);
    s.wasArea = s.state.area;
    if (ctl === k) {
      s.peril = 0;
      s.legalTurns = (s.legalTurns ?? 0) + 1;
    } else if (ctl && S.sides[ctl]!.team !== s.team) {
      s.peril = (s.peril ?? 0) + 1;
      s.peakPeril = Math.max(s.peakPeril ?? 0, s.peril);
    }
  }
  // The man on the apron for the team in control: distract the referee, or sneak in behind his back.
  if (!ctl || !S.sides[ctl]!.legal) return;
  const apron = partnerFor(S, ctl);
  if (!apron) return;
  const P = S.sides[apron]!, victim = S.sides[ctl]!.target;
  if (!(heel(P) || has(P, 'dirty_fighter')) || !S.sides[victim]?.legal) return;
  if (S.ref.distracted === 0 && ctx.rnd() < 0.05) {
    S.ref.distracted = 2;
    S.ref.distractedBy = apron;
    say(ctx, LINES.tagDistract, { a: apron }, 'warn');
  } else if (S.ref.distracted > 0 && S.ref.distractedBy !== ctl && ctx.rnd() < 0.35) {
    cheapShot(ctx, apron, victim);
  } else if (S.ref.distracted === 0 && ctx.rnd() < 0.03) {
    if (S.rules.dq && refSees(ctx, 0.6, 'IN_RING', apron)) warn(ctx, apron, 1, 'coming in illegally');
    else cheapShot(ctx, apron, victim);
  }
}

/** A legal man's out (elimination tag): the next partner comes in, and the player goes with them. */
export function replaceLegal(S: MatchState, k: SideKey): SideKey | null {
  if (!tagRules(S)) return null;
  const s = S.sides[k]!;
  if (!s.legal) return null;
  s.legal = false;
  const next = S.order.find((o) => o !== k && S.sides[o]!.team === s.team && S.sides[o]!.out === 'apron');
  if (!next) return null;
  const N = S.sides[next]!;
  N.out = undefined;
  N.away = 0;
  N.legal = true;
  N.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
  N.peril = N.peakPeril = N.legalTurns = 0;
  if (S.player === k) {
    S.player = next;
    s.controller = 'ai';
    N.controller = 'player';
  }
  syncTargets(S);
  return next;
}

/** Before the AI's own choice in a tag match: cut off the man reaching for his corner, double-team, or tag out. */
export function aiTagInstinct(ctx: Ctx, k: SideKey, setups: readonly SetupId[]): 'tag' | 'double' | SetupId | null {
  const S = ctx.S, A = S.sides[k]!;
  if (!tagRules(S) || !A.legal) return null;
  const D = S.sides[A.target];
  if (D?.legal && cornerDistance(S, D.key) === 0 && partnerFor(S, D.key) && setups.includes('pull_opponent_from_corner')) return 'pull_opponent_from_corner';
  if (canDoubleTeam(S, k) && ctx.rnd() < (heel(A) ? 0.45 : 0.3)) return 'double';
  if (!canTag(S, k)) return null;
  const partner = S.sides[partnerFor(S, k)!]!, cond = pinCondition(A);
  // A proper beating (or running on empty): reach for the corner, whether or not you've had a turn on top.
  // (It used to wait for four turns in control, so the man in peril almost never went for the hot tag.)
  const beaten = (A.peakPeril ?? 0) >= TAG_AI.beaten, desperate = cond < 45 || staminaPercent(A) < 30;
  if (beaten || desperate) return ctx.rnd() < TAG_AI.reach ? 'tag' : null;
  // Otherwise, only once you've had a run of your own.
  if ((A.legalTurns ?? 0) < TAG_AI.settled) return null;
  const fresher = pinCondition(partner) - cond > 30;
  // In control, a team keeps a fresh man on them: quick tags (heels most of all, with their man cornered or down).
  const onTop = S.control === k, pinned = !!D && (D.state.position !== 'STANDING' || (CORNERED.has(D.state.area) && D.spot === ownCorner(S, k)));
  // Three or more a side: fewer quick tags (or the work never adds up on anyone).
  const big = S.order.filter((o) => S.sides[o]!.team === A.team).length > 2 ? TAG_AI.bigTeams : 1;
  const p = fresher ? TAG_AI.fresher : onTop ? (heel(A) && pinned ? TAG_AI.heelQuick : TAG_AI.quick) * big : TAG_AI.idle;
  return ctx.rnd() < p ? 'tag' : null;
}
