import { CHANTS, FLASH, LINES, T } from '../data/commentary';
import type { Ctx } from './ctx';
import { chantOf, fill, flash, log, other, say } from './commentary';
import { heat, landedBy, tick } from './crowd';
import { applyDamage, checkSig, flushMiles, hit, targetNote } from './damage';
import { schedule, setCtrl } from './flow';
import { costMult } from './positions';
import { clamp, pick } from './rng';
import type { MeterSpec, MeterTarget, Move, Side, SideKey } from './types';

export type RevInput = { kind: 'move'; m: Move } | { kind: 'setup'; contest: number };

/** Chance (%) that the defender reverses. Drives the width of the gold zone. */
export function revChance(a: Side, d: Side, input: RevInput): number {
  const m = input.kind === 'move' ? input.m : null;
  let c = input.kind === 'setup' ? input.contest || 25 : m!.fin ? 14 : m!.risk === 2 ? 28 : m!.risk === 1 ? 19 : 22;
  if (d.stamina > 70) c += 6;
  if (d.stamina < 30) c -= 10;
  if (d.momentum > 70) c += 8;
  if (a.momentum > 70) c -= 6;
  if (a.stamina < 25) c += 10;
  if (m) {
    const u = a.used[m.name] || 0;
    if (a.lastMove === m.name) c += 12;
    else if (u >= 2) c += 6;
    if (m.part && d.hp[m.part] < 40) c -= 6;
    if (m.part) {
      const r = a.recentParts.slice(-5).filter((p) => p === m.part).length;
      if (r >= 4) c += 6;
    }
  }
  if (d.st.tec > 85) c += 4;
  return clamp(c, 5, 60);
}

export const meterDur = (m: Move): number => (m.fin ? 1550 : m.risk === 2 ? 1700 : m.risk === 1 ? 1780 : 1900);

/** Gold width when the player is attacking (bigger = easier to land). */
export const offWidth = (rc: number): number => clamp(46 - rc * 0.6, 14, 44);
/** Gold width when the player is defending (bigger = easier to reverse). */
export const defWidth = (rc: number): number => clamp(rc * 0.6, 6, 32);

/** Ask the UI to run a timing bar. Placement alternates direction each time, as in the original. */
export function openMeter(
  ctx: Ctx,
  o: { mode: 'off' | 'def'; attacker: SideKey; title: string; width: number; dur: number; target: MeterTarget },
): void {
  const S = ctx.S;
  const dir = S.meterDir;
  S.meterDir = dir > 0 ? -1 : 1;
  const w = o.width;
  const left = clamp(dir > 0 ? 28 + ctx.rnd() * (100 - 28 - w) : ctx.rnd() * (72 - w), 0, 100 - w);
  const meter: MeterSpec = { ...o, left, dir, width: w };
  S.pending = { kind: 'meter', meter };
}

export function resolveMove(ctx: Ctx, k: SideKey, m: Move, landed: boolean): void {
  const S = ctx.S, a = S[k], dk = other(k), d = S[dk], st = S.stats;
  a.stamina = clamp(a.stamina - (2 + m.imp * 0.7 + (m.risk === 2 ? 4 : 0)) * costMult(a), 0, 100);
  const uses = (a.used[m.name] = (a.used[m.name] || 0) + 1);
  if (uses >= 3 && !m.sig && !m.fin) {
    st.repeats++;
    heat(ctx, -3 * (uses - 2));
    if (uses === 4) say(ctx, LINES.crowdGroans, { vars: { x: m.name.toLowerCase() } }, 'dim');
  }
  a.lastMove = m.name;
  a.setupRun = 0;

  if (!landed) {
    if (m.risk === 2) {
      hit(ctx, a, 'body', m.imp * 0.55);
      a.pos = m.tgt === 'outside' ? 'outside' : 'grounded';
      say(ctx, pick(ctx.rnd, T.crash), { a: k, d: dk, am: m.name });
      st.crashes++;
      heat(ctx, 6);
    } else {
      say(ctx, pick(ctx.rnd, T.rev), { a: k, d: dk, am: m.name });
      heat(ctx, 5);
    }
    st.reversals++;
    d.momentum = clamp(d.momentum + 8, 0, 100);
    a.momentum = clamp(a.momentum - 5, 0, 100);
    checkSig(ctx, d);
    if (m.fin) {
      d.finStock = Math.min(3, d.finStock + 1);
      st.finRev++;
      heat(ctx, 12);
      flash(ctx, FLASH.reversed);
      say(ctx, LINES.finCountered, { a: k, d: dk }, 'hl');
    }
    flushMiles(ctx);
    landedBy(ctx, dk);
    setCtrl(ctx, dk);
    return schedule(ctx, { to: 'next' }, 550);
  }

  applyDamage(ctx, a, d, m);
  a.landed++;
  d.pos = m.res;
  if (m.selfRes) a.pos = m.selfRes;
  else if (m.self === 'top') a.pos = 'standing';
  if (!m.sig) {
    a.momentum = clamp(a.momentum + 8 + m.imp * 0.5, 0, 100);
    checkSig(ctx, a);
  }
  landedBy(ctx, k);
  S.lastLanded = { key: k, m, beat: S.beat };
  let h = m.imp * 0.6;
  if (m.risk === 2) {
    h += 6;
    st.high++;
  }
  if (m.spot) {
    h += 4;
    st.spots++;
  }
  if (m.rest) {
    h = -5;
    st.rest++;
  }
  heat(ctx, h);
  if (m.fin) {
    say(ctx, LINES.finHit, { a: k, vars: { x: m.name.toUpperCase() } }, 'hl');
    flash(ctx, m.name);
    heat(ctx, 18);
  } else if (m.sig) {
    a.sigReady = false;
    a.momentum = 0;
    a.finStock = Math.min(3, a.finStock + 1);
    say(ctx, LINES.sigHit, { a: k, vars: { x: m.name.toUpperCase() } }, 'hl');
    heat(ctx, 12);
  } else {
    const segs = fill(S, pick(ctx.rnd, T[m.cat]), { a: k, d: dk, am: m.name });
    log(ctx, [...segs, ...targetNote(ctx, d, m)]);
  }
  flushMiles(ctx);
  if (m.rest) a.stamina = clamp(a.stamina + 8, 0, 100);
  if (m.risk === 2 && S.heat > 68 && ctx.rnd() < 0.45) chantOf(ctx, CHANTS.holyShit);
  if (m.sub) return schedule(ctx, { to: 'startSub', k, move: m }, 550);
  if (m.flash) return schedule(ctx, { to: 'startPin', k, ctx: { imp: m.imp, flash: true, move: m } }, 350);
  if (m.fin && d.pos === 'grounded' && a.pos === 'standing') {
    return schedule(ctx, { to: 'startPin', k, ctx: { imp: m.imp, finisher: true, move: m } }, 700);
  }
  const n = S.streak.who === k ? S.streak.n : 0;
  let p = 0.9 - 0.07 * n - (a.stamina < 30 ? 0.2 : 0) - (m.risk === 2 ? 0.12 : 0);
  if (m.sig) p = 1;
  if (ctx.rnd() < p) return schedule(ctx, { to: 'next' }, 450);
  schedule(ctx, { to: 'neutral', lastK: k }, 550);
}

/** The player (you) attempts a move: the bar is in "land it" mode. */
export function playerMove(ctx: Ctx, m: Move): void {
  const S = ctx.S;
  tick(ctx);
  const a = S.you, d = S.them;
  if (m.fin) {
    a.finStock--;
    S.stats.finAttemptsSeen = true;
  }
  const rc = revChance(a, d, { kind: 'move', m });
  let w = offWidth(rc);
  if (d.comeback > 0) {
    w *= 0.75;
    d.comeback--;
  }
  openMeter(ctx, { mode: 'off', attacker: 'you', title: m.name, width: w, dur: meterDur(m), target: { kind: 'move', move: m } });
}

/** The AI (them) attempts a move: the bar is in "reverse it" mode for the player. */
export function aiMove(ctx: Ctx, m: Move): void {
  const S = ctx.S;
  tick(ctx);
  const a = S.them, d = S.you;
  if (m.fin) {
    a.finStock--;
    S.stats.finAttemptsSeen = true;
    say(ctx, LINES.aiFinSetup, { a: 'them', vars: { x: m.name } }, 'dim');
  }
  const rc = revChance(a, d, { kind: 'move', m });
  let w = defWidth(rc);
  if (d.comeback > 0) {
    w *= 1.6;
    d.comeback--;
  }
  openMeter(ctx, { mode: 'def', attacker: 'them', title: m.name, width: w, dur: meterDur(m), target: { kind: 'move', move: m } });
}
