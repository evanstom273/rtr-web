import { LINES } from '../data/commentary';
import { getWrestler, type Part } from '../data/rtr';
import { AiBrain, aiTurn } from './ai';
import { foe, isPlayer, say } from './commentary';
import type { Ctx, EngineHooks } from './ctx';
import { finalise, render, runNeutralRecovery, schedule, setControl } from './flow';
import { aiWantsPush, applyPending, resolveDefence, rollPending } from './contest';
import { aiWantsConvert, executeMove, isLadderDive, limbLock, moveIsValid, tierLock, resolvePinChoice, resolveSigConvert, submissionAreaOk, validMoves } from './moves';
import { canPin, completeKickout, countPin, pinOdds, pinThree, startPin, useResiliency } from './pin';
import { isMulti, playerSave, resolveSave, retargetAll, setTarget, targetable } from './multi';
import { distance } from './zones';
import { canDoubleTeam, canTag, doubleTeam, goForTag, setupTag, tagRules } from './tag';
import { canOverTop, entryInterval, hanging, hasEntrants, isRoyal, nextEntrant, overTheTop, setupRoyal, skinTheCat } from './royal';
import { setupStructures } from './structures';
import { doGimmick, GIMMICK_TITLE, gimmickActions, setupGimmicks } from './gimmicks';
import { mathRng, seededRng, type Rng } from './rng';
import { aiDefence, type Defence } from './defence';
import { executeSetup, validSetups } from './setups';
import { moveMatchesSnapshots } from './setupRules';
import { canUseMove, FINISHER_MOMENTUM, sideMove, SIGNATURE_MOMENTUM } from './side';
import { specialsFor, type SpecialInfo } from './specials';
import { getWeaponMove, objectsIn, retrievableWeapons, weaponMovesFor } from './env';
import { armedSpot, qualifiesForSpot, resolveTenCount } from './stip';
import type { Weapon } from '../data/rtr';
import { DEFAULT_STIPULATION_RULES, normaliseRules } from './stipulations';
import { createState } from './state';
import { aiGoesForTap, beginSubmission, openSub, resolveSubmission, runAiSub, startSubmission, submissionTick, workTheHold } from './submission';
import { resolveTarget } from './targeting';
import { endFall } from './flow';
import type { EnvObject, GimmickId, MatchType, Side, SideKey, Cont, KickoutCount, MatchRulesConfig, MatchState, Move, SetupId, SubOutcome, TargetResolution } from './types';

export interface MatchConfig {
  you: string;
  them: string;
  /** Match overhaul: everyone past the first two, and their team (singles: none). */
  extras?: { id: string; team: number }[];
  /** Which side the player controls (default 'you'; null: nobody, AI vs AI). */
  player?: SideKey | null;
  type?: MatchType;
  rules?: Partial<MatchRulesConfig>;
  seed?: number;
  rng?: Rng;
  hooks?: EngineHooks;
}

export const DEFAULT_RULES: MatchRulesConfig = { actionClock: 20, countOuts: true, countOutLimit: 10, title: false, ...DEFAULT_STIPULATION_RULES };

/**
 * One match. Holds state and exposes actions. The UI renders `state` and calls actions; whenever
 * `state.pending` asks for something (a pause, a reversal ring, a kickout…) the UI supplies it.
 */
export class MatchEngine {
  readonly state: MatchState;
  private readonly ctx: Ctx;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(cfg: MatchConfig) {
    const rnd = cfg.rng ?? (cfg.seed !== undefined ? seededRng(cfg.seed) : mathRng);
    const merged = { ...DEFAULT_RULES, ...cfg.rules };
    // More than two people, one fall: no count-outs or DQs unless the booker says otherwise.
    if (cfg.extras?.length && !cfg.rules?.elimination && !cfg.rules?.tag) {
      if (cfg.rules?.countOuts === undefined) merged.countOuts = false;
      if (cfg.rules?.dq === undefined) merged.dq = false;
    }
    if (merged.titleId) merged.title = true;
    const rules = normaliseRules(merged);
    const extras = (cfg.extras ?? []).map((x) => ({ w: getWrestler(x.id), team: x.team }));
    const S = createState(rnd, getWrestler(cfg.you), getWrestler(cfg.them), rules, { extras, player: cfg.player, type: cfg.type });
    // Battle royals and Rumbles: over the top is the only way out. Gauntlets: elimination, one after another.
    if (isRoyal(S)) S.rules = { ...S.rules, pins: false, subs: false, countOuts: false, dq: false, elimination: true, tag: false };
    if (S.type === 'gauntlet') S.rules = { ...S.rules, elimination: true, tag: false };
    // The Chamber: elimination, nothing illegal. WarGames: no falls until everyone's in.
    if (S.rules.stipulation === 'elimination_chamber') S.rules = { ...S.rules, elimination: true, dq: false, countOuts: false, tag: false };
    if (S.rules.stipulation === 'wargames') S.rules = { ...S.rules, pins: false, subs: false, dq: false, countOuts: false, tag: false, elimination: false };
    setupStructures(S);
    if (isRoyal(S) || hasEntrants(S)) setupRoyal(S, rnd);
    // WarGames with nobody waiting to come in (one on one): the match beyond starts at the bell.
    if (S.rules.stipulation === 'wargames' && !nextEntrant(S)) S.rules = { ...S.rules, pins: true, subs: true };
    // Tag rules: one legal man a team, the rest on the apron.
    if (tagRules(S)) {
      setupTag(S);
      if (!cfg.type && S.type === 'tornado') S.type = 'tag';
    }
    this.state = S;
    const ctx: Ctx = { S, rnd, hooks: cfg.hooks ?? {}, ai: undefined as unknown as Ctx['ai'] };
    ctx.ai = Object.fromEntries(S.order.map((k) => [k, new AiBrain(ctx, k)]));
    this.ctx = ctx;
    // Stage 5 stipulations: whatever's tied on or hung up (nothing for the original eleven).
    setupGimmicks(ctx);
    say(ctx, LINES.intro + (rules.title && S.titleName ? LINES.titleOnLine : ''), { vars: { event: S.event, venue: S.venue, title: S.titleName } }, 'dim');
    // Life: an entrance worth the name (only when someone's paid for one: nothing changes otherwise).
    if (rules.entrance && S.sides[rules.entrance.side]) say(ctx, LINES.entrance, { a: rules.entrance.side, vars: { what: rules.entrance.what } }, 'hl');
    // A feud worth the name: the crowd knows (only when there is one).
    if (rules.feud && rules.feud.heat >= 40 && S.order.length === 2) say(ctx, rules.feud.payoff ? LINES.feudEnd : LINES.feud, { a: S.order[0]!, d: S.order[1]! }, 'hl');
    render(ctx);
    schedule(ctx, { to: 'bell' }, 900);
  }

  /* ---------- subscription (useSyncExternalStore) ---------- */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;
  private changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
  private act(fn: () => void): true {
    fn();
    this.changed();
    return true;
  }

  get pending() {
    return this.state.pending;
  }

  /* ---------- queries for the player's UI ---------- */

  /** The side the player controls (singles: 'you'). Headless AI-vs-AI runs have none, and this falls back to 'you'. */
  get pk(): SideKey {
    return this.state.player ?? 'you';
  }
  /** The player's side and whoever they're going after. */
  get me(): Side {
    return this.state.sides[this.pk]!;
  }
  get foe(): Side {
    return this.state.sides[foe(this.state, this.pk)]!;
  }
  /** Who the player's going after (singles: 'them'). */
  get opp(): SideKey {
    return foe(this.state, this.pk);
  }

  private get playerTurn(): boolean {
    return this.state.pending.kind === 'awaitPlayer' && this.state.control === this.pk;
  }
  playerMoves(): Move[] {
    return validMoves(this.state, this.pk);
  }
  moveAvailable(move: Move): boolean {
    return moveIsValid(this.state, this.pk, move);
  }
  playerSetups(): SetupId[] {
    return validSetups(this.state, this.pk);
  }
  /** The move's positions fit right now (it may still be locked, e.g. a finisher with no stock). */
  movePositionsFit(move: Move): boolean {
    return moveMatchesSnapshots(move, this.me.state, this.foe.state) || isLadderDive(this.state, this.pk, move);
  }
  /** Attacks with whatever the player is holding. */
  weaponMoves(): Move[] {
    return weaponMovesFor(this.state, this.pk);
  }
  /** Would this move put them through the table (or into the tacks) they're lined up for? */
  usesSpot(move: Move): boolean {
    const o = armedSpot(this.state, this.pk);
    return !!o && qualifiesForSpot(this.me, move, o);
  }
  /** Why a positionally valid move can't be used, or null if it can. */
  lockedReason(move: Move): string | null {
    const S = this.state;
    if (!submissionAreaOk(S, this.pk, move)) return 'Submissions need both of you in the ring';
    if (!canUseMove(this.me, move)) {
      if (move.finisher || this.me.finishers.includes(move)) return `Bank a finisher first (${FINISHER_MOMENTUM} momentum)`;
      return this.me.signatureArmed ? `Bank your signature first (${SIGNATURE_MOMENTUM} momentum)` : 'Signature used';
    }
    return tierLock(S, this.pk, move) ?? limbLock(this.me, move);
  }
  /** Signatures and finishers for either side: readiness, positions and the route there. */
  specials(k: SideKey): SpecialInfo[] {
    return specialsFor(this.state, k);
  }
  canPin(): boolean {
    return this.playerTurn && canPin(this.state, this.pk);
  }
  /** How a move would resolve against the opponent with the current focus. */
  previewTarget(move: Move): TargetResolution {
    return resolveTarget(move, this.me.targetFocus, this.foe.hp);
  }
  /** Player's body-part focus. Selecting the current focus again returns to Auto. */
  setFocus(part: Part): void {
    this.act(() => {
      const s = this.me;
      s.targetFocus = s.targetFocus === part ? 'NONE' : part;
      render(this.ctx);
    });
  }

  /* ---------- flow ---------- */

  /** Resume after a pause, the AI's thinking time, or a finished referee count. */
  advance(): boolean {
    const p = this.state.pending;
    if (p.kind === 'continue') return this.act(() => {
      this.state.pending = { kind: 'idle' };
      this.run(p.cont);
    });
    if (p.kind === 'aiThinking') return this.act(() => {
      this.state.pending = { kind: 'idle' };
      aiTurn(this.ctx, p.k);
    });
    if (p.kind === 'refTen') return this.act(() => {
      this.state.pending = { kind: 'idle' };
      resolveTenCount(this.ctx, p.counted, p.beatenAt);
    });
    if (p.kind === 'refCount') return this.act(() => {
      this.state.pending = { kind: 'idle' };
      if (p.save) resolveSave(this.ctx, p.pinner, foe(this.state, p.pinner), p.save, 'pin');
      else if (p.kickoutAt === null) pinThree(this.ctx, p.pinner);
      else completeKickout(this.ctx, p.pinner, p.kickoutAt);
    });
    return false;
  }

  private run(c: Cont): void {
    const ctx = this.ctx;
    switch (c.to) {
      case 'bell': {
        if (hasEntrants(this.state)) {
          const S = this.state, [a, b] = S.draw!;
          const st = S.rules.stipulation;
          const bell = st === 'elimination_chamber' ? LINES.chamberBell : st === 'wargames' ? LINES.wargamesBell : S.type === 'rumble' ? LINES.rumbleBell : LINES.gauntletBell;
          say(ctx, bell, { a: a!, d: b!, vars: { s: entryInterval(S), m: Math.round(entryInterval(S) / 60) } });
          setControl(ctx, ctx.rnd() < 0.5 ? a! : b!);
          return;
        }
        if (isRoyal(this.state)) {
          const S = this.state;
          say(ctx, LINES.royalBell, { vars: { n: S.order.length } });
          setControl(ctx, S.order[Math.floor(ctx.rnd() * S.order.length)]!);
          return;
        }
        if (tagRules(this.state)) {
          const S = this.state, legal = S.order.filter((k) => S.sides[k]!.legal);
          say(ctx, LINES.tagBell, { a: legal[0]!, d: legal[1]! });
          if (legal.length === 2) {
            setControl(ctx, ctx.rnd() < 0.5 ? legal[0]! : legal[1]!);
            return;
          }
          setControl(ctx, legal[Math.floor(ctx.rnd() * legal.length)]!);
          return;
        }
        if (isMulti(this.state)) {
          const S = this.state, names = S.order.map((k) => S.sides[k]!.w.name);
          say(ctx, S.rules.elimination ? LINES.multiBellElim : LINES.multiBell, { vars: { x: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`, n: names.length } });
          retargetAll(S);
          setControl(ctx, S.order[Math.floor(ctx.rnd() * S.order.length)]!);
          return;
        }
        say(ctx, LINES.bell, { a: 'you', d: 'them' });
        // Singles: a coin toss for who gets going first (more sides: the turn queue, from stage 2).
        setControl(ctx, ctx.rnd() < 0.5 ? 'you' : 'them');
        return;
      }
      case 'next': return;
      case 'neutralRecovery': return runNeutralRecovery(ctx);
      case 'startSub': return beginSubmission(ctx, c.k, sideMove(ctx.S.sides[c.k], c.moveId), c.target);
      case 'startPin': {
        startPin(ctx, c.k, c.embedded, c.steal);
        return;
      }
      case 'aiSub': return runAiSub(ctx);
      case 'pinNeutral': return setControl(ctx, 'neutral');
      case 'autoRecover': {
        if (!executeSetup(ctx, c.k, c.id)) this.state.pending = { kind: 'awaitPlayer' };
        return;
      }
      case 'nextFall': {
        say(ctx, LINES.nextFall, {}, 'dim');
        return setControl(ctx, 'neutral');
      }
      case 'final': return finalise(ctx);
    }
  }

  /* ---------- player actions ---------- */

  chooseMove(moveId: string): boolean {
    if (!this.playerTurn) return false;
    const move = this.me.all.find((m) => m.id === moveId) ?? getWeaponMove(moveId);
    if (!move || !moveIsValid(this.state, this.pk, move)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      executeMove(this.ctx, this.pk, move);
    });
  }

  /** arg: the weapon to fetch (retrieve_weapon) or object id to pick up (pick_up_weapon). */
  chooseSetup(id: SetupId, arg?: string): boolean {
    if (!this.playerTurn || !validSetups(this.state, this.pk).includes(id)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      if (!executeSetup(this.ctx, this.pk, id, arg)) this.state.pending = { kind: 'awaitPlayer' };
    });
  }

  /** Weapons the player could pull from under the ring right now. */
  retrievable(): Weapon[] {
    return retrievableWeapons(this.state);
  }

  /** Dropped objects the player could pick up where they stand. */
  pickUps(): EnvObject[] {
    return objectsIn(this.state, this.me.state.area, ['dropped']);
  }

  /** Last Man Standing: the player's ten count. success = up in time; count = where they beat it. */
  resolveTenCount(success: boolean, count: number): boolean {
    const p = this.state.pending;
    if (p.kind !== 'tenCount') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      resolveTenCount(this.ctx, this.pk, success ? Math.max(1, Math.min(9, Math.round(count))) : null);
    });
  }

  pin(): boolean {
    if (!this.canPin()) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      startPin(this.ctx, this.pk, false);
    });
  }

  /* ---------- results from the UI's timing interactions ---------- */

  /** The player's call on an incoming move: go for the reversal, brace, or ride it out. */
  defend(choice: Defence): boolean {
    const p = this.state.pending;
    if (p.kind !== 'defend') return false;
    return this.act(() => resolveDefence(this.ctx, p.spec, choice));
  }

  /** What the AI would do defending in the player's shoes (headless play). */
  autoDefence(): Defence {
    const p = this.state.pending;
    return p.kind === 'defend' ? aiDefence(this.state, p.spec, this.ctx.rnd) : 'brace';
  }

  /** Roll the pending contest. push: spend momentum for advantage (if allowed). */
  rollContest(push = false): boolean {
    if (this.state.pending.kind !== 'contest') return false;
    return this.act(() => rollPending(this.ctx, push));
  }

  /** What the AI would do in the player's shoes (headless play). */
  autoPush(): boolean {
    const p = this.state.pending;
    return p.kind === 'contest' && aiWantsPush(this.state, this.pk, p.spec);
  }

  /** The dice have finished animating: play out the result. */
  applyContest(): boolean {
    if (this.state.pending.kind !== 'contestRoll') return false;
    return this.act(() => applyPending(this.ctx));
  }

  /** Player was pinned. success = released in the gold before three; count = count shown at release. */
  resolveKickout(success: boolean, count: KickoutCount): boolean {
    const p = this.state.pending;
    if (p.kind !== 'kickout') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      const save = p.spec.save;
      // Someone was on their way: they get there first unless you're out before they arrive.
      if (save && (!success || count > save.at)) resolveSave(this.ctx, p.spec.pinner, this.pk, save, 'pin');
      else if (success) completeKickout(this.ctx, p.spec.pinner, Math.min(2, count) as KickoutCount);
      else pinThree(this.ctx, p.spec.pinner);
    });
  }

  /** One second of the submission struggle has passed. */
  subSecond(marker: number): boolean {
    if (this.state.pending.kind !== 'sub') return false;
    return this.act(() => submissionTick(this.ctx, marker));
  }

  resolveSub(outcome: SubOutcome): boolean {
    if (this.state.pending.kind !== 'sub') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      resolveSubmission(this.ctx, outcome);
    });
  }

  /** Pin combo landed: cover now, or keep the upper hand. */
  resolvePinChoice(cover: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'pinChoice') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      resolvePinChoice(this.ctx, this.pk, sideMove(this.state.sides[this.pk], p.spec.moveId), cover);
    });
  }

  /** A signature has landed: cash in the rest of the momentum for a finisher, or keep it. */
  resolveSigConvert(convert: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'sigConvert') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      resolveSigConvert(this.ctx, this.pk, sideMove(this.state.sides[this.pk], p.spec.moveId), p.spec.target, convert);
    });
  }

  /** What the AI would do in the player's shoes (headless play). */
  autoSigConvert(): boolean {
    return aiWantsConvert(this.me);
  }

  /** What the AI would do in the player's shoes (headless play): cover when it's a real chance. */
  autoPinChoice(): boolean {
    const p = this.state.pending;
    return p.kind === 'pinChoice' && p.spec.odds >= 20;
  }

  /** The player's chance (0–100) to get the three with a cover right now, or null if they can't pin. */
  pinOdds(): number | null {
    return this.canPin() ? pinOdds(this.state, this.pk, false) : null;
  }

  /** A hold has landed: go for the tap, or work the hold and keep control. */
  resolveSubChoice(goForTap: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'subChoice') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      const move = sideMove(this.state.sides[this.pk], p.spec.moveId);
      if (goForTap) startSubmission(this.ctx, this.pk, move, p.spec.target);
      else workTheHold(this.ctx, this.pk, move, p.spec.target);
    });
  }

  /** What the AI would choose in the player's shoes (headless play). */
  autoSubChoice(): boolean {
    const p = this.state.pending;
    return p.kind === 'subChoice' && aiGoesForTap(this.state, this.pk, sideMove(this.state.sides[this.pk], p.spec.moveId), p.spec.target);
  }

  /** Answer the "use Resiliency?" prompt. */
  resolveResiliency(use: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'resiliency') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      const S = this.state;
      if (use) return useResiliency(this.ctx, p.k, p.threat);
      if (p.threat === 'pinfall') {
        const move = S.pinContext?.lastMove ?? null;
        S.pinContext = null;
        endFall(this.ctx, p.by, 'PINFALL', move);
      } else {
        const txn = S.txn;
        S.txn = null;
        endFall(this.ctx, p.by, txn && txn.kind === 'sub' && txn.quit ? 'I_QUIT' : 'SUBMISSION', txn && txn.kind === 'sub' ? txn.move : null);
      }
    });
  }

  /* ---------- more than two people ---------- */

  /** Who the player could go after, nearest first (with how far, in zones). */
  targets(): { k: SideKey; name: string; distance: number; current: boolean }[] {
    const S = this.state, pk = this.pk;
    return targetable(S, pk).map((k) => ({ k, name: S.sides[k]!.w.name, distance: distance(S, pk, k), current: S.sides[pk]!.target === k }))
      .sort((a, b) => a.distance - b.distance);
  }

  /** Go after someone else (free: it doesn't use the turn). */
  setTarget(k: SideKey): boolean {
    if (!setTarget(this.state, this.pk, k)) return false;
    return this.act(() => render(this.ctx));
  }

  /** The stipulation's own actions open to the player right now (the casket, the corners, the pole…). */
  gimmicks(): { id: GimmickId; title: string }[] {
    if (!this.playerTurn) return [];
    return gimmickActions(this.state, this.pk).map((id) => ({ id, title: GIMMICK_TITLE[id] }));
  }
  doGimmick(id: GimmickId): boolean {
    if (!this.playerTurn || !gimmickActions(this.state, this.pk).includes(id)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      doGimmick(this.ctx, this.pk, id);
    });
  }

  /** Battle royals: can the player try to throw their target over the top (or are they hanging on themselves)? */
  canOverTop(): boolean {
    return this.playerTurn && canOverTop(this.state, this.pk);
  }
  isHanging(): boolean {
    return hanging(this.state, this.pk);
  }
  overTheTop(): boolean {
    if (!this.canOverTop()) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      overTheTop(this.ctx, this.pk);
    });
  }
  /** Hanging on to the apron: skin the cat back in (a speed roll), or fall. */
  skinTheCat(): boolean {
    if (!this.playerTurn || !this.isHanging()) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      skinTheCat(this.ctx, this.pk);
    });
  }

  /**
   * Run the match on its own until `stop` says so, or something needs the player (skip to your Rumble
   * entry; once you're out, the rest as a feed). Returns how many steps it took.
   */
  fastForward(stop: (S: MatchState) => boolean, max = 20000): number {
    let n = 0;
    while (n < max && !stop(this.state)) {
      const p = this.state.pending;
      let ok = false;
      if (p.kind === 'continue' || p.kind === 'aiThinking' || p.kind === 'refCount' || p.kind === 'refTen') ok = this.advance();
      else if (p.kind === 'contestRoll') ok = this.applyContest();
      else if (p.kind === 'contest' && !this.state.order.some((k) => isPlayer(this.state, k) && (k === p.spec.attacker || k === p.spec.defender))) ok = this.rollContest(false);
      if (!ok) break;
      n++;
    }
    return n;
  }

  /** Tag matches: can the player go for the tag (or bring their partner in for a double-team) right now? */
  canTag(): boolean {
    return this.playerTurn && canTag(this.state, this.pk);
  }
  canDoubleTeam(): boolean {
    return this.playerTurn && canDoubleTeam(this.state, this.pk);
  }
  /** Go for the tag: made in your corner, a crawl against the cut-off from anywhere else in the ring. */
  tag(): boolean {
    if (!this.canTag()) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      goForTag(this.ctx, this.pk);
    });
  }
  doubleTeam(): boolean {
    if (!this.canDoubleTeam()) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      doubleTeam(this.ctx, this.pk);
    });
  }

  /** Someone else's pin or hold: try to break it up, steal it, or leave it. */
  resolveSavePrompt(choice: 'save' | 'steal' | 'leave'): boolean {
    const p = this.state.pending;
    if (p.kind !== 'save') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      const plan = playerSave(this.ctx, p.spec.victim, p.spec.kind === 'sub' && choice === 'steal' ? 'save' : choice);
      if (p.spec.kind === 'pin') countPin(this.ctx, p.spec.attacker, plan);
      else openSub(this.ctx, plan);
    });
  }

  /** What the AI would do in the player's shoes (headless play): save it when losing's on the line. */
  autoSave(): 'save' | 'steal' | 'leave' {
    const p = this.state.pending;
    if (p.kind !== 'save') return 'leave';
    return p.spec.mustSave ? (p.spec.kind === 'pin' && this.ctx.rnd() < 0.3 ? 'steal' : 'save') : 'leave';
  }

  /* ---------- headless ---------- */

  /** Let the AI take the player's turn (simulation only). */
  autoPlayer(): boolean {
    if (!this.playerTurn) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      aiTurn(this.ctx, this.pk);
    });
  }
}
