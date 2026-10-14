import { LINES } from '../data/commentary';
import type { Ctx } from './ctx';
import { say } from './commentary';
import { clamp } from './rng';
import type { SideKey } from './types';
import { SIDES } from './types';

/** Change crowd heat. Big jumps pulse the waveform. */
export function heat(ctx: Ctx, d: number): void {
  const S = ctx.S;
  S.heat = clamp(S.heat + d, 0, 100);
  S.stats.heatPeak = Math.max(S.stats.heatPeak, S.heat);
  if (d >= 8) S.events.push({ id: ++S.seq, type: 'heatSpike', amount: d });
}

/** One beat of match time: 20 seconds on the clock. */
export function tick(ctx: Ctx): void {
  const S = ctx.S;
  S.t += 20;
  S.beat++;
  const mins = S.t / 60;
  heat(ctx, mins > 15 ? -3 : -2);
  for (const k of SIDES) {
    const w = S[k];
    w.stamina = clamp(w.stamina + 1, 0, 100);
    if (w.cheapCd > 0) w.cheapCd--;
    if (w.tauntCd > 0) w.tauntCd--;
  }
  S.stats.heatSum += S.heat;
  S.stats.heatN++;
  if (S.you.pos === 'outside' && S.them.pos === 'outside') {
    S.outsideBeats++;
    if (S.outsideBeats >= 4) {
      S.you.pos = 'standing';
      S.them.pos = 'standing';
      S.outsideBeats = 0;
      say(ctx, LINES.bothBackIn, {}, 'dim');
    } else if (S.outsideBeats >= 2) say(ctx, LINES.refCountOutside, { vars: { n: S.outsideBeats * 3 } }, 'dim');
  } else S.outsideBeats = 0;
}

/** Track who is landing offence: drives heat segments and comebacks. */
export function landedBy(ctx: Ctx, k: SideKey): void {
  const S = ctx.S, s = S.streak;
  if (s.who === k) s.n++;
  else {
    s.who = k;
    s.n = 1;
  }
  S.stats.maxStreak[k] = Math.max(S.stats.maxStreak[k], s.n);
  if (s.n >= 4 && !S.stats.heatSeg) S.stats.heatSeg = k;
  if (S.stats.heatSeg && S.stats.heatSeg !== k && s.n >= 3 && !S.stats.comeback) {
    S.stats.comeback = k;
    say(ctx, LINES.comeback, { a: k }, 'hl');
    heat(ctx, 8);
  }
}
