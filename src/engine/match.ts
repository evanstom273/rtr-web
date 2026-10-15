import { LINES } from '../data/commentary';
import { getMove, getWrestler, type Part } from '../data/rtr';
import { AiBrain, aiTurn } from './ai';
import { say } from './commentary';
import type { Ctx, EngineHooks } from './ctx';
import { finalise, render, runNeutralRecovery, schedule, setControl } from './flow';
import { aiWantsPush, applyPending, rollPending } from './contest';
import { executeMove, moveIsValid, resolveCover, validMoves } from './moves';
import { canPin, completeKickout, pinThree, startPin, useResiliency } from './pin';
import { mathRng, seededRng, type Rng } from './rng';
import { executeSetup, validSetups } from './setups';
import { moveMatchesSnapshots } from './setupRules';
import { canUseMove } from './side';
import { specialsFor, type SpecialInfo } from './specials';
import { createState } from './state';
import { aiGoesForTap, beginSubmission, resolveSubmission, startSubmission, submissionTick, workTheHold } from './submission';
import { resolveTarget } from './targeting';
import { endMatch } from './flow';
import type { SideKey, Cont, KickoutCount, MatchRulesConfig, MatchState, Move, SetupId, SubOutcome, TargetResolution } from './types';

export interface MatchConfig {
  you: string;
  them: string;
  rules?: Partial<MatchRulesConfig>;
  seed?: number;
  rng?: Rng;
  hooks?: EngineHooks;
}

export const DEFAULT_RULES: MatchRulesConfig = { actionClock: 20, countOuts: true, countOutLimit: 10, title: false };

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
    const rules = { ...DEFAULT_RULES, ...cfg.rules };
    const S = createState(rnd, getWrestler(cfg.you), getWrestler(cfg.them), rules);
    this.state = S;
    const ctx: Ctx = { S, rnd, hooks: cfg.hooks ?? {}, ai: undefined as unknown as Ctx['ai'] };
    ctx.ai = { you: new AiBrain(ctx, 'you'), them: new AiBrain(ctx, 'them') };
    this.ctx = ctx;
    say(ctx, LINES.intro + (rules.title && S.titleName ? LINES.titleOnLine : ''), { vars: { event: S.event, venue: S.venue, title: S.titleName } }, 'dim');
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

  private get playerTurn(): boolean {
    return this.state.pending.kind === 'awaitPlayer' && this.state.control === 'you';
  }
  playerMoves(): Move[] {
    return validMoves(this.state, 'you');
  }
  moveAvailable(move: Move): boolean {
    return moveIsValid(this.state, 'you', move);
  }
  playerSetups(): SetupId[] {
    return validSetups(this.state, 'you');
  }
  /** The move's positions fit right now (it may still be locked, e.g. a finisher with no stock). */
  movePositionsFit(move: Move): boolean {
    return moveMatchesSnapshots(move, this.state.you.state, this.state.them.state);
  }
  /** Why a positionally valid move can't be used, or null if it can. */
  lockedReason(move: Move): string | null {
    const S = this.state;
    if ((move.submission || move.type === 'SUBMISSION') && (S.you.state.area !== 'IN_RING' || S.them.state.area !== 'IN_RING')) return 'Submissions need both of you in the ring';
    if (!canUseMove(S.you, move)) return move.finisher || S.you.finishers.includes(move) ? 'Land a signature to bank a finisher' : 'Fill your momentum first';
    return null;
  }
  /** Signatures and finishers for either side: readiness, positions and the route there. */
  specials(k: SideKey): SpecialInfo[] {
    return specialsFor(this.state, k);
  }
  canPin(): boolean {
    return this.playerTurn && canPin(this.state, 'you');
  }
  /** How a move would resolve against the opponent with the current focus. */
  previewTarget(move: Move): TargetResolution {
    return resolveTarget(move, this.state.you.targetFocus, this.state.them.hp);
  }
  /** Player's body-part focus. Selecting the current focus again returns to Auto. */
  setFocus(part: Part): void {
    this.act(() => {
      const s = this.state.you;
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
      aiTurn(this.ctx, 'them');
    });
    if (p.kind === 'refCount') return this.act(() => {
      this.state.pending = { kind: 'idle' };
      if (p.kickoutAt === null) pinThree(this.ctx, p.pinner);
      else completeKickout(this.ctx, p.pinner, p.kickoutAt);
    });
    return false;
  }

  private run(c: Cont): void {
    const ctx = this.ctx;
    switch (c.to) {
      case 'bell': {
        say(ctx, LINES.bell, { a: 'you', d: 'them' });
        setControl(ctx, ctx.rnd() < 0.5 ? 'you' : 'them');
        return;
      }
      case 'next': return;
      case 'neutralRecovery': return runNeutralRecovery(ctx);
      case 'startSub': return beginSubmission(ctx, c.k, getMove(c.moveId), c.target);
      case 'startPin': {
        startPin(ctx, c.k, c.embedded);
        return;
      }
      case 'pinNeutral': return setControl(ctx, 'neutral');
      case 'final': return finalise(ctx);
    }
  }

  /* ---------- player actions ---------- */

  chooseMove(moveId: string): boolean {
    if (!this.playerTurn) return false;
    const move = this.state.you.all.find((m) => m.id === moveId);
    if (!move || !moveIsValid(this.state, 'you', move)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      executeMove(this.ctx, 'you', move);
    });
  }

  chooseSetup(id: SetupId): boolean {
    if (!this.playerTurn || !validSetups(this.state, 'you').includes(id)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      executeSetup(this.ctx, 'you', id);
    });
  }

  pin(): boolean {
    if (!this.canPin()) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      startPin(this.ctx, 'you', false);
    });
  }

  /* ---------- results from the UI's timing interactions ---------- */

  /** Roll the pending contest. push: spend momentum for advantage (if allowed). */
  rollContest(push = false): boolean {
    if (this.state.pending.kind !== 'contest') return false;
    return this.act(() => rollPending(this.ctx, push));
  }

  /** What the AI would do in the player's shoes (headless play). */
  autoPush(): boolean {
    const p = this.state.pending;
    return p.kind === 'contest' && aiWantsPush(this.state, 'you', p.spec);
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
      if (success) completeKickout(this.ctx, p.spec.pinner, Math.min(2, count) as KickoutCount);
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

  /** Pin-combo cover press: did the player hit the ring? */
  resolveCover(hit: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'cover') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      resolveCover(this.ctx, getMove(p.spec.moveId), hit);
    });
  }

  /** A hold has landed: go for the tap, or work the hold and keep control. */
  resolveSubChoice(goForTap: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'subChoice') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      const move = getMove(p.spec.moveId);
      if (goForTap) startSubmission(this.ctx, 'you', move, p.spec.target);
      else workTheHold(this.ctx, 'you', move, p.spec.target);
    });
  }

  /** What the AI would choose in the player's shoes (headless play). */
  autoSubChoice(): boolean {
    const p = this.state.pending;
    return p.kind === 'subChoice' && aiGoesForTap(this.state, 'you', getMove(p.spec.moveId), p.spec.target);
  }

  /** Answer the "use Resiliency?" prompt. */
  resolveResiliency(use: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'resiliency') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      const S = this.state;
      if (use) return useResiliency(this.ctx, 'you', p.threat);
      if (p.threat === 'pinfall') {
        const move = S.pinContext?.lastMove ?? null;
        S.pinContext = null;
        endMatch(this.ctx, 'them', 'PINFALL', move);
      } else {
        const txn = S.txn;
        S.txn = null;
        endMatch(this.ctx, 'them', 'SUBMISSION', txn && txn.kind === 'sub' ? txn.move : null);
      }
    });
  }

  /* ---------- headless ---------- */

  /** Let the AI take the player's turn (simulation only). */
  autoPlayer(): boolean {
    if (!this.playerTurn) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      aiTurn(this.ctx, 'you');
    });
  }
}
