import { CHANTS } from '../data/commentary';
import type { Ctx } from './ctx';
import type { LogCls, MatchState, Seg, SideKey } from './types';

export type Vars = Readonly<Record<string, string | number>>;

export interface FillParams {
  a?: SideKey;
  d?: SideKey;
  /** Move name for {am}. */
  am?: string;
  vars?: Vars;
}

export const other = (k: SideKey): SideKey => (k === 'you' ? 'them' : 'you');

/** The original art(): "a"/"an" by first letter. */
export const article = (n: string): string => (/^[AEIOU]/i.test(n) ? 'an ' : 'a ');

/** Plain-text template substitution. Unknown keys are left as-is. */
export function format(tpl: string, vars: Vars = {}): string {
  return tpl.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? String(vars[key]) : all));
}

const TOKEN = /<(g|G)>([\s\S]*?)<\/\1>|\{(\w+)\}/g;

/** Turn a commentary template into structured segments the UI can render. */
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
      out.push({ k: 'name', side, v: S[side].name });
    } else if (key === 'am') {
      if (p.am !== undefined) {
        text(article(p.am));
        out.push({ k: 'move', v: p.am });
      }
    } else if (key in vars) {
      text(String(vars[key]));
    } else {
      text(m[0]);
    }
  }
  text(tpl.slice(last));
  return out;
}

export function log(ctx: Ctx, segs: Seg[], cls: LogCls = ''): void {
  const S = ctx.S;
  S.log.push({ id: ++S.seq, t: S.t, cls, segs });
}

/** Shorthand: fill + log. */
export function say(ctx: Ctx, tpl: string, p: FillParams = {}, cls: LogCls = ''): void {
  log(ctx, fill(ctx.S, tpl, p), cls);
}

export function chant(ctx: Ctx, text: string, tail = ''): void {
  const segs: Seg[] = [{ k: 'chant', v: `“${text}”` }];
  if (tail) segs.push({ k: 'text', v: ' ' + tail });
  log(ctx, segs, 'crowd');
}

export function chantOf(ctx: Ctx, c: { text: string; tail?: string }, vars: Vars = {}): void {
  chant(ctx, format(c.text, vars), c.tail ?? '');
}

export function flash(ctx: Ctx, text: string): void {
  ctx.S.events.push({ id: ++ctx.S.seq, type: 'flash', text });
}

export { CHANTS };

/** Clock formatting, as in the original fmt(). */
export function fmtClock(t: number): string {
  const s = Math.round(t);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
