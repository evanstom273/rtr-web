/*
 * Headless AI-vs-AI matches. Both sides are picked by the AI; the player's timing interactions
 * are auto-resolved by a simple model of a human. No timers: delays are skipped.
 */
import { ROSTER } from '../../data/roster';
import * as ix from '../interactions';
import { MatchEngine } from '../match';
import { seededRng, type Rng } from '../rng';
import type { KickoutCount, KickoutSpec, MatchResult, Rating, SideKey, SubOutcome, SubSpec } from '../types';

/**
 * How the simulated player's timing is decided.
 * - fixed: every bar / kickout attempt hits with the same probability, ignoring gold size.
 * - skill: the player aims for the middle of the gold with Gaussian error (σ, in % of the track),
 *   so a wider gold zone is easier to hit, as it is for a real player.
 */
export type HitModel = { kind: 'fixed'; rate: number } | { kind: 'skill'; sigma: number };

export interface SimOptions {
  seed: number;
  you: string;
  them: string;
  stakes: 'exh' | 'title';
  model: HitModel;
  /** Mash taps per second in submissions (capped at the game's 9/s). */
  mashRate?: number;
  /** Safety valve: give up after this many engine steps. */
  maxSteps?: number;
}

export interface SimResult {
  ended: boolean;
  steps: number;
  result: MatchResult | null;
  rating: Rating | null;
  invalidChoices: { side: SideKey; detail: string }[];
  stuck: string | null;
}

/** Abramowitz & Stegun 7.1.26. */
function erf(x: number): number {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

export function hitChance(model: HitModel, width: number): number {
  if (model.kind === 'fixed') return model.rate;
  return erf(width / 2 / (model.sigma * Math.SQRT2));
}

/** Simulated kickout: repeated hold attempts, each aimed at the middle of the gold, until success or three. */
function simKickout(spec: KickoutSpec, model: HitModel, rnd: Rng): KickoutCount {
  const p = hitChance(model, spec.width);
  const reaction = 0.15; // seconds between a missed release and the next press
  let t = 0;
  for (;;) {
    t += (spec.lo + spec.width / 2) / ix.KICKOUT_FILL_PER_SEC;
    if (t >= ix.PIN_SECONDS) return 0;
    if (rnd() < p) return ix.kickoutCountAt(t);
    t += reaction;
  }
}

/** Simulated submission: the same physics as the UI, stepped at 60Hz. */
function simSub(e: MatchEngine, spec: SubSpec, mashRate: number, rnd: Rng): { res: SubOutcome; peak: number } {
  const dt = 1 / 60, tapEvery = 1 / Math.min(mashRate, ix.SUB_MAX_TAPS_PER_SEC);
  let pos = 50, peak = 50, t = 0, acc = 0, nextTap = tapEvery;
  for (;;) {
    t += dt;
    while (t >= nextTap) {
      pos += ix.subTapDelta(spec.role);
      nextTap += tapEvery;
    }
    pos += ix.subDrift(spec.role, spec.rate, dt, rnd());
    peak = Math.max(peak, pos);
    acc += dt;
    if (acc >= 1) {
      acc = 0;
      e.subSecond(pos);
    }
    const res = ix.subOutcome(pos, t);
    if (res) return { res, peak };
  }
}

export function runHeadless(o: SimOptions): SimResult {
  const invalidChoices: SimResult['invalidChoices'] = [];
  const e = new MatchEngine({
    you: o.you,
    them: o.them,
    stakes: o.stakes,
    seed: o.seed,
    hooks: {
      onAiChoice: (side, ch, valid) => {
        if (!valid) invalidChoices.push({ side, detail: JSON.stringify(ch && (ch.type === 'move' ? ch.m.name : ch.type === 'setup' ? ch.s : 'pin')) });
      },
    },
  });
  const rnd = seededRng(o.seed ^ 0x9e3779b9); // the simulated player's own dice
  const maxSteps = o.maxSteps ?? 20000;
  let steps = 0, stuck: string | null = null;
  while (e.pending.kind !== 'over' && steps < maxSteps) {
    steps++;
    const p = e.pending;
    let ok: boolean;
    switch (p.kind) {
      case 'continue':
      case 'aiThinking':
      case 'refCount':
        ok = e.advance();
        break;
      case 'awaitPlayer':
        ok = e.autoPlayer();
        break;
      case 'meter':
        ok = e.resolveMeter(rnd() < hitChance(o.model, p.meter.width));
        break;
      case 'kickout':
        ok = e.resolveKickout(simKickout(p.kickout, o.model, rnd));
        break;
      case 'sub': {
        const r = simSub(e, p.sub, o.mashRate ?? 6, rnd);
        ok = e.resolveSub(r.res, r.peak);
        break;
      }
      case 'idle':
        ok = false;
        break;
    }
    if (!ok) {
      stuck = `no progress from pending '${p.kind}' at step ${steps}`;
      break;
    }
  }
  const ended = e.pending.kind === 'over';
  if (!ended && !stuck) stuck = `hit ${maxSteps} steps`;
  return { ended, steps, result: e.state.result, rating: e.state.rating, invalidChoices, stuck };
}

/** All ordered pairs of different wrestlers. */
export function matchups(): [string, string][] {
  const out: [string, string][] = [];
  for (const a of ROSTER) for (const b of ROSTER) if (a.id !== b.id) out.push([a.id, b.id]);
  return out;
}

export interface BatchOptions {
  n: number;
  seed: number;
  model: HitModel;
}

export function runBatch({ n, seed, model }: BatchOptions): (SimResult & { you: string; them: string; stakes: 'exh' | 'title' })[] {
  const mu = matchups();
  const out = [];
  for (let i = 0; i < n; i++) {
    const [you, them] = mu[i % mu.length] as [string, string];
    const stakes = i % 2 ? 'title' : 'exh';
    out.push({ you, them, stakes, ...runHeadless({ seed: seed + i, you, them, stakes, model }) } as const);
  }
  return out;
}
