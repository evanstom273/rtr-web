/*
 * Headless matches. The opponent is the normal AI; the player's side is chosen by the same AI and
 * its timing interactions are resolved by a simple model of a human player.
 */
import { WRESTLERS } from '../../data/rtr';
import { MatchEngine, type MatchConfig } from '../match';
import * as ix from '../interactions';
import { seededRng, type Rng } from '../rng';
import type { KickoutCount, MatchResult, Rating, SideKey, SubOutcome, SubSpec } from '../types';

/**
 * How the simulated player's timing is decided.
 * - fixed: every timing interaction succeeds with the same probability.
 * - skill: the player aims for the middle of the target with Gaussian timing error (σ in seconds),
 *   so narrower/faster targets are genuinely harder.
 */
export type HitModel = { kind: 'fixed'; rate: number } | { kind: 'skill'; sigmaSeconds: number };

function erf(x: number): number {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}
/** Probability that a timing error ~N(0, σ) lands within ±halfWindow seconds. */
const withinWindow = (halfWindowSeconds: number, sigma: number) => erf(halfWindowSeconds / (sigma * Math.SQRT2));

export interface SimOptions {
  seed: number;
  you: string;
  them: string;
  model: HitModel;
  /** Player mash rate in submissions (taps/s, capped at 8 by the game). */
  mashRate?: number;
  maxSteps?: number;
}

export interface SimResult {
  ended: boolean;
  steps: number;
  result: MatchResult | null;
  rating: Rating | null;
  invalid: { side: SideKey; detail: string }[];
  stuck: string | null;
  engine: MatchEngine;
}

function simSub(e: MatchEngine, spec: SubSpec, rnd: Rng, mashRate: number): SubOutcome {
  const dt = 1 / 60, tapEvery = 1 / Math.min(mashRate, ix.TUG_MAX_TAPS_PER_SECOND);
  let marker = spec.start, t = 0, pulse = 0, second = 0, nextTap = tapEvery * (0.5 + rnd() * 0.5);
  let windowMin = marker, windowMax = marker, windowStart = 0;
  for (;;) {
    t += dt;
    while (t >= nextTap) {
      marker += spec.playerDirection * ix.tugTapImpulse(spec.playerScore, spec.speedMultiplier);
      nextTap += tapEvery;
    }
    pulse += dt;
    while (pulse >= ix.TUG_AI_PULSE_SECONDS) {
      pulse -= ix.TUG_AI_PULSE_SECONDS;
      marker += ix.tugAiPulse(spec.playerDirection, spec.aiScore, spec.playerScore, spec.speedMultiplier);
    }
    marker = Math.max(0, Math.min(100, marker));
    second += dt;
    if (second >= 1) {
      second -= 1;
      e.subSecond(marker);
    }
    const out = ix.tugOutcome(marker, spec.tapThreshold, spec.escapeThreshold);
    if (out) return out;
    windowMin = Math.min(windowMin, marker);
    windowMax = Math.max(windowMax, marker);
    if (t - windowStart >= ix.TUG_STALL_WINDOW_SECONDS) {
      if (t >= ix.TUG_STALL_FAILSAFE_SECONDS && windowMax - windowMin < ix.TUG_STALL_MOVEMENT && mashRate <= 0) return 'BOTCH_OR_SCRAMBLE';
      windowStart = t;
      windowMin = windowMax = marker;
    }
    if (t > 600) return 'BOTCH_OR_SCRAMBLE';
  }
}

export function runHeadless(o: SimOptions): SimResult {
  const invalid: SimResult['invalid'] = [];
  const cfg: MatchConfig = {
    you: o.you, them: o.them, seed: o.seed,
    hooks: { onAiChoice: (side, c, valid) => { if (!valid) invalid.push({ side, detail: JSON.stringify(c && (c.kind === 'move' ? c.move.name : c.kind === 'setup' ? c.action : 'pin')) }); } },
  };
  const e = new MatchEngine(cfg);
  const rnd = seededRng(o.seed ^ 0x9e3779b9);
  const hit = (halfWindowSeconds: number) => (o.model.kind === 'fixed' ? rnd() < o.model.rate : rnd() < withinWindow(halfWindowSeconds, o.model.sigmaSeconds));
  const maxSteps = o.maxSteps ?? 20000;
  let steps = 0, stuck: string | null = null;
  while (e.pending.kind !== 'over' && steps < maxSteps) {
    steps++;
    const p = e.pending;
    let ok = false;
    switch (p.kind) {
      case 'continue': case 'aiThinking': case 'refCount':
        ok = e.advance();
        break;
      case 'awaitPlayer':
        ok = e.autoPlayer();
        break;
      case 'contest':
        ok = e.rollContest(e.autoPush());
        break;
      case 'contestRoll':
        ok = e.applyContest();
        break;
      case 'kickout': {
        // Repeated holds aimed at the gold centre until success or three.
        const s = p.spec;
        let t = 0, success = false, count: KickoutCount = 0;
        for (;;) {
          t += s.center * s.fillDuration;
          if (t >= s.timeLimit) break;
          if (hit((s.width / 200 + s.forgiveness / 100) * s.fillDuration)) {
            success = true;
            count = ix.pinCountAt(t) as KickoutCount;
            break;
          }
          t += 0.15;
        }
        ok = e.resolveKickout(success, count);
        break;
      }
      case 'sub':
        ok = e.resolveSub(simSub(e, p.spec, rnd, o.mashRate ?? 6));
        break;
      case 'subChoice':
        ok = e.resolveSubChoice(e.autoSubChoice());
        break;
      case 'cover':
        ok = e.resolveCover(hit((p.spec.window / 200) * p.spec.timeLimit));
        break;
      case 'resiliency':
        ok = e.resolveResiliency(true);
        break;
      default:
        ok = false;
    }
    if (!ok) {
      stuck = `no progress from '${p.kind}' at step ${steps}`;
      break;
    }
  }
  const ended = e.pending.kind === 'over';
  if (!ended && !stuck) stuck = `hit ${maxSteps} steps`;
  return { ended, steps, result: e.state.result, rating: e.state.rating, invalid, stuck, engine: e };
}

/** Deterministic pairings across the roster. */
export function pairings(n: number, seed: number): [string, string][] {
  const rnd = seededRng(seed);
  const out: [string, string][] = [];
  for (let i = 0; i < n; i++) {
    const a = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!;
    let b = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!;
    while (b.id === a.id) b = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!;
    out.push([a.id, b.id]);
  }
  return out;
}

export function runBatch(n: number, seed: number, model: HitModel) {
  return pairings(n, seed).map(([you, them], i) => ({ you, them, ...runHeadless({ seed: seed + i, you, them, model }) }));
}
