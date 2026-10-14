import type { Ctx } from './ctx';
import { other } from './commentary';
import { tick } from './crowd';
import { neutral } from './flow';
import { aiMove, playerMove } from './moves';
import { ctxFor, pinPressure, startPin } from './pin';
import { pinOk, posOk, ready } from './positions';
import { runSetup, SETUPS, setupById, type SetupRule } from './setups';
import type { BodyPart, Choice, MatchState, Move, Side, SideKey } from './types';
import { PARTS } from './types';

/** Pick a body part to work over, weighted by class. Sticky unless a much better target appears. */
export function updateFocus(a: Side, d: Side): void {
  const adj = (p: BodyPart) =>
    d.hp[p] -
    (a.cls.includes('tech') && (p === 'arm' || p === 'leg') ? 8 : 0) -
    (a.cls.includes('power') && (p === 'head' || p === 'body') ? 6 : 0) -
    (a.cls.includes('striker') && p === 'head' ? 6 : 0);
  const best = [...PARTS].sort((x, y) => adj(x) - adj(y))[0] as BodyPart;
  if (!a.focus || adj(a.focus) - adj(best) > 15) a.focus = best;
}

export function scoreMove(ctx: Ctx, a: Side, d: Side, m: Move): number {
  const mins = ctx.S.t / 60;
  let s = 40 + m.imp * 4;
  if (m.cls && m.cls.some((c) => a.cls.includes(c))) s += 10;
  s += (100 - d.hp[m.part]) * 0.18;
  if (a.focus === m.part) s += 8;
  if (a.lastMove === m.name) s -= 30;
  s -= (a.used[m.name] || 0) * 7;
  if (m.risk === 2) {
    s += a.cls.includes('flyer') ? 8 : -6;
    if (a.stamina < 35) s -= 25;
  }
  if (m.sub) {
    s += d.hp[m.part] < 50 ? 18 : -12;
    if (a.cls.includes('tech')) s += 10;
    if (mins < 5) s -= 12;
  }
  if (m.rest) s += a.stamina < 45 ? 25 : -25;
  if (m.flash) s += mins > 12 ? 12 : -35;
  return s + ctx.rnd() * 6;
}

export function scoreSetup(ctx: Ctx, a: Side, d: Side, s: SetupRule): number {
  const run = a.setupRun || 0;
  let sc: number;
  switch (s.id) {
    case 'pickup': sc = 26; break;
    case 'whip': sc = 24 + (a.cls.includes('power') ? 8 : 0); break;
    case 'climb': {
      if (!a.moves.some((m) => m.self === 'top' && m.tgt === d.pos)) return -99;
      sc = 16 + (a.cls.includes('flyer') ? 16 : 0) - (a.stamina < 35 ? 25 : 0) - (d.pos === 'standing' ? 6 : 0);
      break;
    }
    case 'down': sc = a.moves.some((m) => m.self === 'top' && m.tgt === d.pos) ? -40 : 70; break;
    case 'floor': sc = 10 + (a.cls.some((c) => c === 'flyer' || c === 'hardcore') ? 12 : 0); break;
    case 'follow': sc = 24 + (a.cls.includes('hardcore') ? 16 : 0); break;
    case 'wait': sc = 20; break;
    case 'rollin': sc = 20 + ctx.S.outsideBeats * 18; break;
    case 'getin': sc = 90; break;
    case 'taunt': sc = 4 + (a.st.cha - 60) * 0.4 - (d.pos === 'standing' ? 22 : 0); break;
    case 'breath': sc = a.stamina < 25 ? 60 : a.stamina < 40 ? 22 : -99; break;
    case 'cheap': sc = 24; break;
    case 'fire': sc = 80; break;
    default: sc = -60;
  }
  if (!['getin', 'breath', 'fire', 'rollin', 'down'].includes(s.id)) sc -= run * 30;
  return sc + ctx.rnd() * 8;
}

/** One setup that would put both wrestlers in position for `m`, if any. */
export function plan(a: Side, d: Side, m: Move): SetupRule | null {
  for (const s of SETUPS) {
    if (s.run || !s.ok(a, d)) continue;
    const A = { ...a }, D = { ...d };
    s.apply?.(A, D);
    if (posOk(A, D, m)) return s;
  }
  return null;
}

/** Score every legal option and pick from the top four, weighted by score. */
export function aiChoose(ctx: Ctx, k: SideKey): Choice | null {
  const S = ctx.S, a = S[k], d = S[other(k)], c: Choice[] = [];
  updateFocus(a, d);
  for (const m of [a.fin, a.sig]) {
    if (!ready(a, m)) continue;
    if (posOk(a, d, m)) c.push({ type: 'move', m, score: m.fin ? 130 : 115 });
    else {
      const s = plan(a, d, m);
      if (s) c.push({ type: 'setup', s: s.id, score: 100 });
    }
  }
  for (const m of a.moves) if (posOk(a, d, m)) c.push({ type: 'move', m, score: scoreMove(ctx, a, d, m) });
  for (const s of SETUPS) {
    if (s.ok(a, d)) {
      const sc = scoreSetup(ctx, a, d, s);
      if (sc > -90) c.push({ type: 'setup', s: s.id, score: sc });
    }
  }
  if (pinOk(a, d)) {
    const pctx = ctxFor(ctx, k, S.beat), p = pinPressure(S.t, d, pctx);
    c.push({ type: 'pin', score: p * 0.9 - 30 + (pctx.finisher ? 40 : 0) - (S.t < 300 ? 40 : 0) });
  }
  if (!c.length) return null;
  c.sort((x, y) => y.score - x.score);
  const top = c.slice(0, 4), lo = (top[top.length - 1] as Choice).score;
  const ws = top.map((o) => Math.max(1, o.score - lo + 8));
  let r = ctx.rnd() * ws.reduce((x, y) => x + y, 0);
  for (let i = 0; i < top.length; i++) {
    r -= ws[i] as number;
    if (r <= 0) return top[i] as Choice;
  }
  return top[0] as Choice;
}

/** Is this a legal choice for side k right now? */
export function isValidChoice(S: MatchState, k: SideKey, ch: Choice): boolean {
  const a = S[k], d = S[other(k)];
  if (ch.type === 'move') {
    const owned = ch.m === a.sig || ch.m === a.fin || a.moves.includes(ch.m);
    return owned && ready(a, ch.m) && posOk(a, d, ch.m);
  }
  if (ch.type === 'setup') return setupById(ch.s).ok(a, d);
  return pinOk(a, d);
}

/**
 * The AI takes a turn for side k. For 'them' this is the original aiTurn().
 * For 'you' (headless sims only) the same decision is routed through the player's paths.
 */
export function aiTurn(ctx: Ctx, k: SideKey): void {
  const S = ctx.S;
  if (S.over) return;
  const ch = aiChoose(ctx, k);
  ctx.hooks.onAiChoice?.(k, ch, ch ? isValidChoice(S, k, ch) : true);
  if (!ch) return neutral(ctx, null);
  const a = S[k];
  if (ch.type === 'move') {
    a.setupRun = 0;
    if (k === 'them') aiMove(ctx, ch.m);
    else playerMove(ctx, ch.m);
  } else if (ch.type === 'setup') {
    a.setupRun++;
    runSetup(ctx, k, setupById(ch.s));
  } else {
    tick(ctx);
    startPin(ctx, k, ctxFor(ctx, k, S.beat - 1));
  }
}
