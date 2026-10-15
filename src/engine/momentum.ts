// Momentum changes that can unlock specials, with the commentary for what they unlock.
import { LINES } from '../data/commentary';
import { flash, say } from './commentary';
import type { Ctx } from './ctx';
import { addMomentum } from './side';
import type { SideKey } from './types';

export function gainMomentum(ctx: Ctx, k: SideKey, amount: number): void {
  for (const u of addMomentum(ctx.S[k], amount)) {
    if (u === 'signature') say(ctx, LINES.signatureReady, { a: k }, 'dim');
    else {
      say(ctx, LINES.finisherUnlocked, { a: k, vars: { n: ctx.S[k].finisherStock } }, 'hl');
      flash(ctx, 'Finisher ready');
    }
  }
}
