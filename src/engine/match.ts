import { wrestlerById } from '../data/roster';
import { LINES } from '../data/commentary';
import { aiTurn } from './ai';
import { say } from './commentary';
import type { Ctx, EngineHooks } from './ctx';
import { tick } from './crowd';
import { neutral, next, render, schedule, setCtrl } from './flow';
import { playerMove, resolveMove } from './moves';
import { ctxFor, pinResult, startPin } from './pin';
import { pinOk, posOk, ready } from './positions';
import { rate } from './rating';
import { mathRng, seededRng, type Rng } from './rng';
import { availableSetups, resolveSetup, runSetup, setupById } from './setups';
import { createState } from './state';
import { resolveSub, startSub, subTick } from './submission';
import type { Cont, KickoutCount, MatchState, Move, SetupId, Stakes, SubOutcome } from './types';

export interface MatchConfig {
  you: string;
  them: string;
  stakes: Stakes;
  /** Seed for a reproducible match. Ignored if `rng` is given. */
  seed?: number;
  rng?: Rng;
  hooks?: EngineHooks;
}

export type MoveRef = { special: 'sig' | 'fin' } | { index: number };

/**
 * A single match. Holds state, exposes actions. The UI renders `state` and calls actions;
 * whenever `state.pending` asks for something (a delay, a timing bar, a kickout…), the UI supplies it.
 */
export class MatchEngine {
  readonly state: MatchState;
  private readonly ctx: Ctx;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(cfg: MatchConfig) {
    const rnd = cfg.rng ?? (cfg.seed !== undefined ? seededRng(cfg.seed) : mathRng);
    const you = wrestlerById(cfg.you), them = wrestlerById(cfg.them);
    if (!you || !them) throw new Error(`Unknown wrestler: ${!you ? cfg.you : cfg.them}`);
    const S = createState(rnd, you, them, cfg.stakes);
    this.state = S;
    this.ctx = { S, rnd, hooks: cfg.hooks ?? {} };
    say(this.ctx, LINES.matchIntro + (S.title ? LINES.titleOnLine : ''), { vars: { event: S.event, venue: S.venue, title: S.titleName } }, 'dim');
    say(this.ctx, LINES.versus, { a: 'you', d: 'them' });
    render(this.ctx);
    schedule(this.ctx, { to: 'bell' }, 1100);
  }

  /* ---------- subscription (for React's useSyncExternalStore) ---------- */

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

  /* ---------- queries ---------- */

  get pending() {
    return this.state.pending;
  }

  /** Moves the player can pick right now (excluding signature/finisher). */
  playableMoves(): Move[] {
    const a = this.state.you, d = this.state.them;
    return a.moves.filter((m) => posOk(a, d, m));
  }

  canUseSpecial(which: 'sig' | 'fin'): boolean {
    const a = this.state.you, d = this.state.them, m = a[which];
    return ready(a, m) && posOk(a, d, m);
  }

  setups() {
    return availableSetups(this.state.you, this.state.them);
  }

  canPin(): boolean {
    return this.state.pending.kind === 'awaitPlayer' && pinOk(this.state.you, this.state.them);
  }

  /* ---------- flow ---------- */

  /** Resume after a `continue` delay, an `aiThinking` pause, or a finished `refCount` animation. */
  advance(): boolean {
    const p = this.state.pending;
    if (p.kind === 'continue' || p.kind === 'refCount') {
      return this.act(() => {
        this.state.pending = { kind: 'idle' };
        this.run(p.cont);
      });
    }
    if (p.kind === 'aiThinking') {
      return this.act(() => {
        this.state.pending = { kind: 'idle' };
        aiTurn(this.ctx, 'them');
      });
    }
    return false;
  }

  private run(c: Cont): void {
    const ctx = this.ctx, S = this.state;
    switch (c.to) {
      case 'bell': {
        say(ctx, LINES.bell);
        const f = ctx.rnd() < 0.5 ? 'you' : 'them';
        say(ctx, LINES.firstLockUp, { a: f });
        setCtrl(ctx, f);
        return next(ctx);
      }
      case 'next': return next(ctx);
      case 'neutral': return neutral(ctx, c.lastK);
      case 'startSub': return startSub(ctx, c.k, c.move);
      case 'startPin': return startPin(ctx, c.k, c.ctx);
      case 'pinResult': return pinResult(ctx, c.k, c.ctx, c.count);
      case 'final':
        S.rating = rate(S);
        S.pending = { kind: 'over' };
        return;
    }
  }

  /* ---------- player actions ---------- */

  private get playerTurn(): boolean {
    return this.state.pending.kind === 'awaitPlayer' && this.state.ctrl === 'you';
  }

  chooseMove(ref: MoveRef): boolean {
    if (!this.playerTurn) return false;
    const a = this.state.you, d = this.state.them;
    const m = 'special' in ref ? a[ref.special] : a.moves[ref.index];
    if (!m || !ready(a, m) || !posOk(a, d, m)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      playerMove(this.ctx, m);
    });
  }

  chooseSetup(id: SetupId): boolean {
    if (!this.playerTurn) return false;
    const s = setupById(id);
    if (!s.ok(this.state.you, this.state.them)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      runSetup(this.ctx, 'you', s);
    });
  }

  pin(): boolean {
    if (!this.playerTurn || !pinOk(this.state.you, this.state.them)) return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      tick(this.ctx);
      startPin(this.ctx, 'you', ctxFor(this.ctx, 'you', this.state.beat - 1));
    });
  }

  /* ---------- timing results from the UI ---------- */

  /** Did the player stop the bar in the gold? */
  resolveMeter(hitGold: boolean): boolean {
    const p = this.state.pending;
    if (p.kind !== 'meter') return false;
    const { mode, attacker, target } = p.meter;
    const ok = mode === 'off' ? hitGold : !hitGold;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      if (target.kind === 'move') resolveMove(this.ctx, attacker, target.move, ok);
      else resolveSetup(this.ctx, attacker, setupById(target.setup), ok);
    });
  }

  /** The player was pinned: 0 = pinned, otherwise the count they kicked out at. */
  resolveKickout(count: KickoutCount): boolean {
    const p = this.state.pending;
    if (p.kind !== 'kickout') return false;
    return this.act(() => {
      this.state.pending = { kind: 'idle' };
      pinResult(this.ctx, p.kickout.pinner, p.kickout.ctx, count);
    });
  }

  /** One second of a submission hold has passed with the bar at `pos`. */
  subSecond(pos: number): boolean {
    if (this.state.pending.kind !== 'sub') return false;
    return this.act(() => subTick(this.ctx, pos));
  }

  resolveSub(res: SubOutcome, peak: number): boolean {
    if (this.state.pending.kind !== 'sub') return false;
    return this.act(() => resolveSub(this.ctx, res, peak));
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
