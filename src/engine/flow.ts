import { FLASH, LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { flash, other, say } from './commentary';
import { heat } from './crowd';
import { avgHP } from './positions';
import { pick } from './rng';
import { snapshot } from './state';
import type { Cont, Move, SideKey } from './types';
import { SIDES } from './types';

/** The original after(fn, ms): park a continuation for the UI to resume after `delay`. */
export function schedule(ctx: Ctx, cont: Cont, delay: number): void {
  ctx.S.pending = { kind: 'continue', delay, cont };
}

/** The original render(): refresh what the HUD and cards show. */
export function render(ctx: Ctx): void {
  ctx.S.view = snapshot(ctx.S);
}

export function setCtrl(ctx: Ctx, k: SideKey): void {
  const S = ctx.S;
  S.ctrl = k;
  const a = S[k], d = S[other(k)];
  if (a.pos === 'grounded' || a.pos === 'corner') a.pos = 'standing';
  if (d.pos === 'top') d.pos = 'standing';
}

/** Hand control to whoever has it and wait for them. */
export function next(ctx: Ctx): void {
  const S = ctx.S;
  if (S.over) return;
  render(ctx);
  S.pending = S.ctrl === 'them' ? { kind: 'aiThinking' } : { kind: 'awaitPlayer' };
}

/** Both wrestlers reset; a weighted scramble decides who gets control. */
export function neutral(ctx: Ctx, lastK: SideKey | null): void {
  const S = ctx.S;
  for (const k of SIDES) {
    const w = S[k];
    if (w.pos === 'grounded' || w.pos === 'corner' || w.pos === 'top') w.pos = 'standing';
  }
  const sc = (k: SideKey) => {
    const w = S[k];
    return w.stamina * 0.5 + w.momentum * 0.4 + avgHP(w) * 0.3 + (k === lastK ? 12 : 0) + ctx.rnd() * 28;
  };
  const win: SideKey = sc('you') >= sc('them') ? 'you' : 'them';
  say(ctx, pick(ctx.rnd, LINES.neutralOpeners) + LINES.neutralWinner, { a: win }, 'dim');
  setCtrl(ctx, win);
  next(ctx);
}

export function endMatch(ctx: Ctx, wk: SideKey, how: 'pin' | 'sub', m: Move | null): void {
  const S = ctx.S;
  S.over = true;
  const lk = other(wk);
  S.result = { winner: wk, loser: lk, how, move: m, t: S.t, byFin: !!m?.fin, byFlash: !!m?.flash, afterFk: S[lk].fkAbsorbed > 0 };
  if (how === 'pin') {
    if (m) say(ctx, LINES.pinWinMove, { a: wk, am: m.name }, 'hl');
    else say(ctx, LINES.pinWin, { a: wk }, 'hl');
    flash(ctx, FLASH.three);
  } else {
    say(ctx, LINES.subWin, { a: wk, am: m?.name ?? '', vars: { x: S[lk].name.toUpperCase() } }, 'hl');
    flash(ctx, FLASH.tapOut);
  }
  heat(ctx, 15);
  render(ctx);
  schedule(ctx, { to: 'final' }, 2000);
}
