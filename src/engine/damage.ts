import { LINES, MILE } from '../data/commentary';
import { PL } from '../data/labels';
import type { Ctx } from './ctx';
import { fill, log, other, say } from './commentary';
import { heat } from './crowd';
import { clamp, pick } from './rng';
import type { BodyPart, Move, Seg, Side } from './types';

/** Damage one body part. Crossing 50 or 25 queues a milestone line. */
export function hit(ctx: Ctx, w: Side, part: BodyPart, dmg: number): void {
  const b = w.hp[part];
  w.hp[part] = clamp(b - dmg, 0, 100);
  for (const th of [50, 25] as const) {
    if (b > th && w.hp[part] <= th) {
      ctx.S.miles.push(fill(ctx.S, MILE[part][th], { d: w.key, a: other(w.key) }));
      heat(ctx, th === 25 ? 4 : 2);
    }
  }
}

export function flushMiles(ctx: Ctx): void {
  const miles = ctx.S.miles;
  let segs: Seg[] | undefined;
  while ((segs = miles.shift())) log(ctx, segs, 'dim');
}

export function checkSig(ctx: Ctx, w: Side): void {
  if (w.momentum >= 100 && !w.sigReady) {
    w.sigReady = true;
    w.momentum = 100;
    say(ctx, LINES.sigReady, { a: w.key }, 'dim');
  }
}

const STAT_FOR = { strike: 'strk', grapple: 'str', air: 'spd', hold: 'tec', brawl: 'str' } as const;

/** Raw damage roll, before it's applied. Exported for tests. */
export function damageFor(a: Side, d: Side, m: Move, roll: number): number {
  const stat = a.st[STAT_FOR[m.cat]];
  return (m.imp * (1 + (stat - 65) / 180) + (100 - d.hp[m.part]) * 0.06) * (0.9 + roll * 0.2);
}

export function applyDamage(ctx: Ctx, a: Side, d: Side, m: Move): void {
  const dmg = damageFor(a, d, m, ctx.rnd());
  hit(ctx, d, m.part, dmg);
  if (m.cat !== 'strike' && m.cat !== 'hold' && m.part !== 'body') hit(ctx, d, 'body', dmg * 0.3);
  d.stamina = clamp(d.stamina - m.imp * 0.5, 0, 100);
  d.partHits[m.part]++;
  a.recentParts.push(m.part);
}

/** Commentary noting repeated work on the same limb. Returns segments to append, or []. */
export function targetNote(ctx: Ctx, d: Side, m: Move): Seg[] {
  const n = d.partHits[m.part];
  if (m.part !== 'body' && (n === 3 || n === 5 || n === 7)) {
    return fill(ctx.S, LINES.targetNote, { vars: { x: pick(ctx.rnd, LINES.targetNotePrefixes), part: PL[m.part], n } });
  }
  return [];
}
