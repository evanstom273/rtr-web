import { CHANTS } from '../data/commentary';
import type { Ctx } from './ctx';
import type { LogCls, MatchState, RingBeat, Seg, SideKey } from './types';

export type Vars = Readonly<Record<string, string | number>>;

export interface FillParams {
  a?: SideKey;
  d?: SideKey;
  /** Move name for {m}. */
  m?: string;
  vars?: Vars;
}

export const other = (k: SideKey): SideKey => (k === 'you' ? 'them' : 'you');

export function format(tpl: string, vars: Vars = {}): string {
  return tpl.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? String(vars[key]) : all));
}

const TOKEN = /<(g|G)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;

/** Turn a commentary template into structured segments. */
export function fill(S: MatchState, tpl: string, p: FillParams = {}): Seg[] {
  const out: Seg[] = [];
  const vars = p.vars ?? {};
  const text = (v: string) => {
    if (!v) return;
    const prev = out[out.length - 1];
    if (prev && prev.k === 'text') prev.v += v;
    else out.push({ k: 'text', v });
  };
  let last = 0;
  for (const m of tpl.matchAll(TOKEN)) {
    text(tpl.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    if (m[1]) {
      out.push({ k: 'gold', v: format(m[2] ?? '', vars), big: m[1] === 'G' });
      continue;
    }
    const key = m[3] ?? '';
    if (key === 'a' || key === 'd') {
      const side = p[key];
      if (!side) throw new Error(`Template needs {${key}}: ${tpl}`);
      out.push({ k: 'name', side, v: S[side].w.name });
    } else if (key === 'm') {
      if (p.m !== undefined) out.push({ k: 'move', v: p.m });
    } else if (key in vars) text(String(vars[key]));
    else text(m[0]);
  }
  text(tpl.slice(last));
  return out;
}

export function log(ctx: Ctx, segs: Seg[], cls: LogCls = ''): void {
  const S = ctx.S;
  S.log.push({ id: ++S.seq, t: S.t, cls, segs });
}

export function say(ctx: Ctx, tpl: string, p: FillParams = {}, cls: LogCls = ''): void {
  log(ctx, fill(ctx.S, tpl, p), cls);
}

export function chant(ctx: Ctx, c: { text: string; tail?: string }, vars: Vars = {}): void {
  const segs: Seg[] = [{ k: 'chant', v: `“${format(c.text, vars)}”` }];
  if (c.tail) segs.push({ k: 'text', v: ' ' + c.tail });
  log(ctx, segs, 'crowd');
}

export function flash(ctx: Ctx, text: string, strong = false): void {
  ctx.S.events.push({ id: ++ctx.S.seq, type: 'flash', text, strong });
}

export function ring(ctx: Ctx, beat: RingBeat, actor: SideKey | null, label?: string): void {
  ctx.S.events.push({ id: ++ctx.S.seq, type: 'ring', beat, actor, ...(label ? { label } : {}) });
}

export { CHANTS };

export function fmtClock(t: number): string {
  const s = Math.round(t);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
