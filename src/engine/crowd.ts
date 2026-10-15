// Match of the Night's crowd: heat, heat segments, comebacks, chants and the stats the star rating
// reads. The RtR engine reports what happened (story events); this layer decides how loud it was.
import { CHANTS, LINES } from '../data/commentary';
import { chant, say } from './commentary';
import type { Ctx } from './ctx';
import { clamp } from './rng';
import type { Move, SideKey } from './types';

export function heat(ctx: Ctx, d: number): void {
  const S = ctx.S;
  S.heat = clamp(S.heat + d, 0, 100);
  S.crowd.heatPeak = Math.max(S.crowd.heatPeak, S.heat);
  if (d >= 8) S.events.push({ id: ++S.seq, type: 'heatSpike', amount: d });
}

/** Every clock step: the crowd cools a little unless something happens. */
export function crowdTick(ctx: Ctx): void {
  const S = ctx.S;
  heat(ctx, S.t / 60 > 15 ? -3 : -2);
  S.crowd.heatSum += S.heat;
  S.crowd.heatN++;
}

/** Who is landing offence: drives heat segments and comebacks. */
export function landedBy(ctx: Ctx, k: SideKey): void {
  const S = ctx.S, s = S.streak, c = S.crowd;
  if (s.who === k) s.n++;
  else {
    s.who = k;
    s.n = 1;
  }
  if (s.n >= 4 && !c.heatSeg) c.heatSeg = k;
  if (c.heatSeg && c.heatSeg !== k && s.n >= 3 && !c.comeback) {
    c.comeback = k;
    say(ctx, '{a} is mounting a comeback!', { a: k }, 'hl');
    heat(ctx, 8);
  }
}

const OUTSIDE_SPOT = new Set(['OUTSIDE', 'RAMP', 'APRON', 'CROWD', 'BACKSTAGE']);

export type CrowdEvent =
  | { type: 'move_landed'; k: SideKey; move: Move; highRisk: boolean; signature: boolean; finisher: boolean; outside: boolean }
  | { type: 'move_attempt'; k: SideKey; move: Move; signatureOrFinisher: boolean; uses: number }
  | { type: 'reversal'; k: SideKey; finisher: boolean; crash: boolean }
  | { type: 'setup_reversed'; k: SideKey }
  | { type: 'taunt'; k: SideKey; charisma: number }
  | { type: 'taunt_interrupted'; k: SideKey }
  | { type: 'threshold'; critical: boolean }
  | { type: 'kickout'; k: SideKey; count: number; afterFinisher: boolean; afterSignature: boolean }
  | { type: 'submission_started'; limbPayoff: boolean }
  | { type: 'submission_escape'; k: SideKey }
  | { type: 'near_tap' }
  | { type: 'catch_breath' }
  | { type: 'match_end' };

export function crowdObserve(ctx: Ctx, e: CrowdEvent): void {
  const S = ctx.S, c = S.crowd;
  switch (e.type) {
    case 'move_attempt': {
      if (e.move.finisher) c.finAttemptsSeen = true;
      const uses = e.uses;
      if (uses >= 3 && !e.signatureOrFinisher) {
        c.repeats++;
        heat(ctx, -3 * (uses - 2));
        if (uses === 4) say(ctx, `The crowd groans. That's the fourth ${e.move.name.toLowerCase()}.`, {}, 'dim');
      }
      break;
    }
    case 'move_landed': {
      landedBy(ctx, e.k);
      let h = e.move.impact * 0.6;
      if (e.highRisk) {
        h += 6;
        c.high++;
      }
      if (e.outside) {
        h += 4;
        c.spots++;
      }
      heat(ctx, h);
      if (e.finisher) heat(ctx, 18);
      else if (e.signature) heat(ctx, 12);
      if (e.highRisk && S.heat > 68 && ctx.rnd() < 0.45) chant(ctx, CHANTS.holyShit);
      break;
    }
    case 'reversal':
      landedBy(ctx, e.k);
      c.reversals++;
      if (e.crash) {
        c.crashes++;
        heat(ctx, 6);
      } else heat(ctx, 5);
      if (e.finisher) {
        c.finRev++;
        heat(ctx, 12);
      }
      break;
    case 'setup_reversed':
      landedBy(ctx, e.k);
      c.reversals++;
      heat(ctx, 3);
      break;
    case 'taunt':
      heat(ctx, 6 + (e.charisma - 50) * 0.25);
      break;
    case 'taunt_interrupted':
      landedBy(ctx, e.k);
      heat(ctx, 4);
      break;
    case 'threshold':
      heat(ctx, e.critical ? 4 : 2);
      break;
    case 'kickout':
      if (e.count <= 1) heat(ctx, 1);
      else if (e.count === 2) {
        heat(ctx, 8);
        c.nf++;
      } else {
        heat(ctx, 14);
        c.nf++;
      }
      if (e.count >= 2) {
        if (e.afterFinisher) {
          c.fk++;
          c.fkAbsorbed[e.k]++;
          heat(ctx, 20);
          chant(ctx, CHANTS.fightForever);
        } else if (e.afterSignature) heat(ctx, 4);
        if (!e.afterFinisher && e.count >= 3 && S.heat > 70 && ctx.rnd() < 0.6) chant(ctx, CHANTS.awesome);
      }
      break;
    case 'submission_started':
      if (e.limbPayoff) c.limbPayoff = true;
      break;
    case 'submission_escape':
      landedBy(ctx, e.k);
      heat(ctx, 8);
      break;
    case 'near_tap':
      c.nf++;
      heat(ctx, 8);
      break;
    case 'catch_breath':
      c.rest++;
      heat(ctx, -3);
      break;
    case 'match_end':
      heat(ctx, 15);
      break;
  }
}

export const isOutsideSpot = (area: string): boolean => OUTSIDE_SPOT.has(area);
export { LINES };
