import { LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { other, say } from './commentary';
import { heat, landedBy } from './crowd';
import { flushMiles, hit } from './damage';
import { endMatch, schedule, setCtrl } from './flow';
import { pick } from './rng';
import type { Move, Side, SideKey, SubOutcome } from './types';

/** Attacker's share of the submission struggle, 0–1. Higher = closer to a tap. */
export function subRatio(t: number, a: Side, d: Side, m: Move): number {
  const part = m.part, mins = t / 60;
  const A = 20 + a.st.tec * 0.3 + (100 - d.hp[part]) * 0.55 + a.momentum * 0.15 + (m.fin ? 25 : 0) + Math.min(20, mins) * 0.8 + (d.partHits[part] >= 4 ? 10 : 0);
  const D = 20 + d.st.tec * 0.25 + d.stamina * 0.3 + d.hp[part] * 0.25 + (mins < 5 ? 30 : mins < 10 ? 15 : 0) - d.fkAbsorbed * 5;
  return A / (A + D);
}

export function startSub(ctx: Ctx, k: SideKey, m: Move): void {
  const S = ctx.S, a = S[k], dk = other(k), d = S[dk];
  if (d.partHits[m.part] >= 4) S.stats.limbPayoff = true;
  S.stats.subs++;
  const ratio = subRatio(S.t, a, d, m);
  say(ctx, LINES.trapped, { a: k, d: dk, am: m.name });
  S.pending = {
    kind: 'sub',
    sub: {
      attacker: k,
      defender: dk,
      role: k === 'you' ? 'attack' : 'defend',
      rate: 32 * (k === 'you' ? 1 - ratio : ratio),
      move: m,
      part: m.part,
    },
  };
}

/** Once per second of hold time: the defender's limb takes damage scaled by how close they are to tapping. */
export function subTick(ctx: Ctx, pos: number): void {
  const p = ctx.S.pending;
  if (p.kind !== 'sub') return;
  hit(ctx, ctx.S[p.sub.defender], p.sub.part, 1 + Math.max(0, pos - 50) / 50 * 1.5);
}

export function resolveSub(ctx: Ctx, res: SubOutcome, peak: number): void {
  const p = ctx.S.pending;
  if (p.kind !== 'sub') return;
  const { attacker: k, defender: dk, move: m } = p.sub;
  flushMiles(ctx);
  if (res === 'tap') return endMatch(ctx, k, 'sub', m);
  if (peak >= 80) {
    ctx.S.stats.nf++;
    heat(ctx, 8);
    say(ctx, LINES.nearTap, { a: k, d: dk }, 'dim');
  }
  if (res === 'escape') {
    say(ctx, pick(ctx.rnd, LINES.escape), { a: k, d: dk });
    heat(ctx, 8);
    landedBy(ctx, dk);
    setCtrl(ctx, dk);
    return schedule(ctx, { to: 'next' }, 450);
  }
  say(ctx, LINES.rope, { a: k, d: dk });
  heat(ctx, 6);
  schedule(ctx, { to: 'neutral', lastK: k }, 450);
}
