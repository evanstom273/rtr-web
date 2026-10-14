import { CHANTS, FLASH, LINES, SETUP_TEXT } from '../data/commentary';
import type { Ctx } from './ctx';
import { chantOf, flash, other, say } from './commentary';
import { heat, landedBy, tick } from './crowd';
import { checkSig, flushMiles, hit } from './damage';
import { neutral, schedule, setCtrl } from './flow';
import { defWidth, offWidth, openMeter, revChance } from './moves';
import { avgHP, costMult } from './positions';
import { clamp, pick } from './rng';
import type { Position, Side, SetupId, SideKey } from './types';

type P = Pick<Side, 'pos'>;

export interface SetupRule {
  id: SetupId;
  ok: (a: Side, d: Side) => boolean;
  /** Reversal contest. 0 = uncontested. */
  contest?: number | ((a: P, d: P) => number);
  apply?: (a: { pos: Position }, d: { pos: Position }) => void;
  rev?: (a: { pos: Position }, d: { pos: Position }) => void;
  run?: (ctx: Ctx, k: SideKey) => void;
}

/** Order matters: the AI's plan() walks this list in order. */
export const SETUPS: readonly SetupRule[] = [
  { id: 'pickup', ok: (a, d) => a.pos === 'standing' && d.pos === 'grounded', contest: 28, apply: (_a, d) => { d.pos = 'standing'; }, rev: (a) => { a.pos = 'grounded'; } },
  { id: 'whip', ok: (a, d) => a.pos === 'standing' && d.pos === 'standing', contest: 27, apply: (_a, d) => { d.pos = 'corner'; }, rev: (a) => { a.pos = 'corner'; } },
  { id: 'climb', ok: (a, d) => a.pos === 'standing' && (d.pos === 'grounded' || d.pos === 'standing'), contest: (_a, d) => (d.pos === 'standing' ? 32 : 0), apply: (a) => { a.pos = 'top'; }, rev: (a) => { a.pos = 'grounded'; } },
  { id: 'down', ok: (a) => a.pos === 'top', contest: 0, apply: (a) => { a.pos = 'standing'; } },
  { id: 'floor', ok: (a, d) => a.pos === 'standing' && (d.pos === 'standing' || d.pos === 'grounded'), contest: 25, apply: (_a, d) => { d.pos = 'outside'; } },
  { id: 'follow', ok: (a, d) => a.pos === 'standing' && d.pos === 'outside', contest: 0, apply: (a) => { a.pos = 'outside'; } },
  { id: 'wait', ok: (a, d) => a.pos === 'standing' && d.pos === 'outside', contest: 0, apply: (_a, d) => { d.pos = 'standing'; } },
  { id: 'rollin', ok: (a, d) => a.pos === 'outside' && d.pos === 'outside', contest: 0, apply: (a, d) => { a.pos = 'standing'; d.pos = 'grounded'; } },
  { id: 'getin', ok: (a, d) => a.pos === 'outside' && d.pos !== 'outside', contest: 0, apply: (a) => { a.pos = 'standing'; } },
  { id: 'taunt', ok: (a, d) => (a.pos === 'standing' || a.pos === 'top') && d.pos !== 'outside' && a.tauntCd === 0, run: runTaunt },
  { id: 'breath', ok: (a) => a.stamina < 65 && a.pos !== 'top', run: runBreath },
  { id: 'cheap', ok: (a, d) => a.align === 'heel' && a.pos === 'standing' && d.pos !== 'outside' && a.cheapCd === 0, run: runCheap },
  { id: 'fire', ok: (a) => a.align === 'face' && !a.firedUp && avgHP(a) < 62 && a.momentum < 60, run: runFire },
  { id: 'reset', ok: () => true, run: (ctx, k) => { say(ctx, LINES.reset, { a: k }, 'dim'); neutral(ctx, null); } },
];

export function setupById(id: SetupId): SetupRule {
  const s = SETUPS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown setup ${id}`);
  return s;
}

export function availableSetups(a: Side, d: Side): SetupRule[] {
  return SETUPS.filter((s) => s.ok(a, d));
}

export function runSetup(ctx: Ctx, k: SideKey, s: SetupRule): void {
  tick(ctx);
  const S = ctx.S, a = S[k], d = S[other(k)];
  if (s.run) return s.run(ctx, k);
  const con = typeof s.contest === 'function' ? s.contest(a, d) : (s.contest ?? 0);
  if (!con) return resolveSetup(ctx, k, s, true);
  const rc = revChance(a, d, { kind: 'setup', contest: con });
  const title = SETUP_TEXT[s.id].name, target = { kind: 'setup', setup: s.id } as const;
  if (k === 'you') openMeter(ctx, { mode: 'off', attacker: k, title, width: offWidth(rc), dur: 2000, target });
  else openMeter(ctx, { mode: 'def', attacker: k, title, width: defWidth(rc), dur: 1950, target });
}

export function resolveSetup(ctx: Ctx, k: SideKey, s: SetupRule, ok: boolean): void {
  const S = ctx.S, a = S[k], dk = other(k), d = S[dk], txt = SETUP_TEXT[s.id];
  a.stamina = clamp(a.stamina - 3 * costMult(a), 0, 100);
  if (ok) {
    s.apply?.(a, d);
    say(ctx, txt.line ?? '', { a: k, d: dk });
    return schedule(ctx, { to: 'next' }, 420);
  }
  s.rev?.(a, d);
  say(ctx, txt.revLine ?? '', { a: k, d: dk });
  d.momentum = clamp(d.momentum + 5, 0, 100);
  checkSig(ctx, d);
  heat(ctx, 3);
  S.stats.reversals++;
  landedBy(ctx, dk);
  setCtrl(ctx, dk);
  schedule(ctx, { to: 'next' }, 480);
}

function runTaunt(ctx: Ctx, k: SideKey): void {
  const S = ctx.S, a = S[k], dk = other(k), d = S[dk];
  a.tauntCd = 5;
  const ic = clamp((d.pos === 'standing' ? 28 : 14) + (a.pos === 'top' ? 10 : 0) - (a.st.cha - 60) * 0.3, 5, 45);
  if (ctx.rnd() * 100 < ic) {
    say(ctx, LINES.tauntPunished, { a: k, d: dk });
    heat(ctx, 4);
    if (a.pos === 'top') a.pos = 'grounded';
    landedBy(ctx, dk);
    setCtrl(ctx, dk);
    return schedule(ctx, { to: 'next' }, 500);
  }
  heat(ctx, 6 + (a.st.cha - 50) * 0.25);
  a.momentum = clamp(a.momentum + 12, 0, 100);
  a.stamina = clamp(a.stamina + 3, 0, 100);
  checkSig(ctx, a);
  say(ctx, pick(ctx.rnd, a.align === 'heel' ? LINES.tauntHeel : LINES.tauntFace), { a: k });
  schedule(ctx, { to: 'next' }, 450);
}

function runBreath(ctx: Ctx, k: SideKey): void {
  const a = ctx.S[k];
  a.stamina = clamp(a.stamina + 18 * (1.2 - (100 - avgHP(a)) / 250), 0, 100);
  ctx.S.stats.rest++;
  heat(ctx, -3);
  say(ctx, LINES.breath, { a: k }, 'dim');
  schedule(ctx, { to: 'neutral', lastK: null }, 400);
}

function runCheap(ctx: Ctx, k: SideKey): void {
  const a = ctx.S[k], d = ctx.S[other(k)];
  hit(ctx, d, 'head', 3 + ctx.rnd() * 2);
  a.momentum = clamp(a.momentum + 15, 0, 100);
  checkSig(ctx, a);
  heat(ctx, 6);
  a.cheapCd = 4;
  say(ctx, pick(ctx.rnd, LINES.cheap), { a: k });
  if (ctx.rnd() < 0.35) chantOf(ctx, CHANTS.sucks, { x: (a.name.split(' ')[0] ?? '').toUpperCase() });
  flushMiles(ctx);
  landedBy(ctx, k);
  schedule(ctx, { to: 'next' }, 450);
}

function runFire(ctx: Ctx, k: SideKey): void {
  const a = ctx.S[k];
  a.firedUp = true;
  a.comeback = 3;
  a.momentum = clamp(a.momentum + 35, 0, 100);
  a.stamina = clamp(a.stamina + 20, 0, 100);
  checkSig(ctx, a);
  heat(ctx, 15);
  ctx.S.stats.fireUp = k;
  flash(ctx, FLASH.firedUp);
  say(ctx, LINES.fireUp, { a: k }, 'hl');
  landedBy(ctx, k);
  schedule(ctx, { to: 'next' }, 600);
}
