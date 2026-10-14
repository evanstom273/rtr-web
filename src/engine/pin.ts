import { CHANTS, FLASH, LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { chantOf, flash, other, say } from './commentary';
import { heat } from './crowd';
import { endMatch, schedule } from './flow';
import { avgHP } from './positions';
import { clamp, pick, type Rng } from './rng';
import type { KickoutCount, PinCtx, Side, SideKey } from './types';

/** How hard a cover is to kick out of, 0–135. `t` is match time in seconds. */
export function pinPressure(t: number, d: Side, ctx: PinCtx): number {
  const mins = t / 60;
  let p = (ctx.imp || 2) * 2.5;
  if (ctx.finisher) p += 32;
  else if (ctx.signature) p += 16;
  p += (100 - avgHP(d)) * 0.55 + (100 - d.stamina) * 0.2 + Math.min(20, mins) + d.fkAbsorbed * 12;
  if (mins < 5) p -= ctx.finisher ? 20 : ctx.flash ? 35 : 55;
  else if (mins < 10) p -= ctx.finisher ? 5 : ctx.flash ? 10 : 20;
  if (d.hp.head < 35) p += 8;
  if (d.hp.body < 35) p += 8;
  if (ctx.flash) p += 35;
  p -= (d.momentum - 50) * 0.1;
  return clamp(p, 0, 135);
}

/** A pin straight after landing something gets that move's weight. Otherwise it's a plain cover. */
export function ctxFor(ctx: Ctx, k: SideKey, beat: number): PinCtx {
  const L = ctx.S.lastLanded;
  if (L && L.key === k && L.beat === beat) return { imp: L.m.imp, signature: !!L.m.sig, finisher: !!L.m.fin, move: L.m };
  return { imp: 2, move: null };
}

/** Kickout gold zone on the hold-fill track for when the player is pinned. */
export function kickoutZone(rnd: Rng, p: number): { lo: number; width: number } {
  const width = clamp(36 - p * 0.26, 5, 36);
  const lo = clamp(46 + rnd() * (92 - 46 - width), 40, 95 - width);
  return { lo, width };
}

/** Chance the AI survives a cover. */
export const refSurviveChance = (p: number): number => clamp(1 - (p / 125) ** 2, 0.03, 0.98);

/** When the AI is pinned the referee's count is decided here, then animated by the UI. */
export function refCountOutcome(rnd: Rng, p: number): KickoutCount {
  const surv = rnd() < refSurviveChance(p);
  return surv ? (p < 25 ? 1 : p < 70 ? (rnd() < 0.75 ? 2 : 2.9) : 2.9) : 0;
}

export function startPin(ctx: Ctx, k: SideKey, pctx: PinCtx): void {
  const S = ctx.S, dk = other(k), d = S[dk], mins = S.t / 60;
  const p = pinPressure(S.t, d, pctx);
  S.stats.pins++;
  if (pctx.flash) say(ctx, LINES.rollUp, { a: k, d: dk });
  else say(ctx, pick(ctx.rnd, LINES.cover), { a: k });
  if (mins < 5 && !pctx.finisher && !pctx.flash) {
    heat(ctx, -4);
    S.stats.earlyPins++;
    if (k === 'you') say(ctx, LINES.earlyPin, {}, 'dim');
  }
  if (dk === 'you') {
    const z = kickoutZone(ctx.rnd, p);
    S.pending = { kind: 'kickout', kickout: { id: ++S.seq, pinner: k, pressure: p, lo: z.lo, width: z.width, ctx: pctx } };
  } else {
    const count = refCountOutcome(ctx.rnd, p);
    S.pending = { kind: 'refCount', id: ++S.seq, pinner: k, count, cont: { to: 'pinResult', k, ctx: pctx, count } };
  }
}

export function pinResult(ctx: Ctx, k: SideKey, pctx: PinCtx, cnt: KickoutCount): void {
  const S = ctx.S, dk = other(k), d = S[dk], st = S.stats;
  if (!cnt) return endMatch(ctx, k, 'pin', pctx.move);
  if (cnt === 1) {
    say(ctx, LINES.kickoutOne, { a: k, d: dk }, 'dim');
    heat(ctx, 1);
  } else if (cnt === 2) {
    say(ctx, LINES.kickoutTwo, { a: k, d: dk });
    heat(ctx, 8);
    st.nf++;
  } else {
    say(ctx, LINES.kickoutNear, { a: k, d: dk }, 'hl');
    heat(ctx, 14);
    st.nf++;
    flash(ctx, FLASH.kickout);
  }
  if (cnt >= 2) {
    if (pctx.finisher) {
      st.fk++;
      d.fkAbsorbed++;
      heat(ctx, 20);
      chantOf(ctx, CHANTS.fightForever);
    } else if (pctx.signature) heat(ctx, 4);
    if (!pctx.finisher && cnt > 2 && S.heat > 70 && ctx.rnd() < 0.6) chantOf(ctx, CHANTS.awesome);
  }
  d.momentum = clamp(d.momentum + 5, 0, 100);
  schedule(ctx, { to: 'neutral', lastK: k }, 600);
}
