// Match of the Night's star rating, fed by the RtR engine's crowd stats.
import { TRAIT_FX as FX } from '../career/tuning';
import { has } from './traits';
import { PART_LABEL, RATING } from '../data/commentary';
import { fmtClock, format, other } from './commentary';
import { clamp } from './rng';
import type { BodyPart, MatchState, Rating, Side } from './types';
import { BODY_PARTS } from './types';

export function topPart(w: Side): { part: BodyPart; n: number } {
  let best: BodyPart = 'LEFT_LEG', n = 0;
  for (const p of BODY_PARTS) {
    const c = w.targetAttackCounts[p] ?? 0;
    if (c > n) {
      n = c;
      best = p;
    }
  }
  return { part: best, n };
}

const s = (n: number) => (n === 1 ? '' : 's');

/** Hits *received* on a part = the opponent's attack count on it. */
const workedOn = (S: MatchState, victim: Side) => topPart(S[other(victim.key)]);

/** Everything but the finish and the length: the parts that build up during the match. */
function components(S: MatchState, payoff: boolean) {
  const c = S.crowd;
  const avg = c.heatSum / Math.max(1, c.heatN);
  // Every match opens cold, so an average in the 50s is a hot crowd: score the average from 25
  // (dead) to 60 (rocking), and reward the peak properly. Same as before for a typical crowd (~45
  // average, ~80 peak); up to ~0.3 more for a hot one.
  const crowd = clamp((avg - 25) / 35, 0, 1.2) + (c.heatPeak >= 95 ? 0.35 : c.heatPeak >= 85 ? 0.25 : c.heatPeak >= 75 ? 0.1 : 0);
  const limb = [topPart(S.you), topPart(S.them)].sort((a, b) => b.n - a.n)[0]!;
  const structure = (c.heatSeg ? 0.3 : 0) + (c.comeback ? 0.5 : 0);
  const psych = (limb.n >= 5 ? 0.25 : 0) + (payoff ? 0.35 : 0) - Math.min(0.6, c.repeats * 0.1) - Math.max(0, c.rest - 3) * 0.08;
  // Stipulation drama: climbs stopped, pulls at the prize, ten counts beaten, refusing to quit, falls.
  const stipDrama = Math.min(0.6, c.climbStops * 0.15 + c.ladderPulls * 0.05 + c.cageClimbs * 0.06 + c.tenCounts * 0.12 + c.nearQuits * 0.2 + c.falls * 0.12);
  const drama = Math.min(0.7, c.nf * 0.15) + Math.min(0.7, c.fk * 0.35) + Math.min(0.5, c.finRev * 0.25) + Math.min(0.6, c.reversals * 0.05) + stipDrama;
  // Hardcore: tables broken, weapon shots, blood.
  const hardcore = Math.min(0.6, (c.tableBreaks * 2 + c.weaponHits + c.bleeds * 1.5) * 0.08);
  const spots = Math.min(0.3, c.high * 0.06) + (c.spots > 0 ? 0.1 : 0) + hardcore;
  return { avg, crowd, limb, structure, psych, drama, spots };
}

export interface LiveRating {
  /** Quarter stars, as if the match ended now with an ordinary finish. */
  stars: number;
  /** 0–1 per part, on the same scale as the result screen. */
  crowd: number;
  story: number;
  drama: number;
  action: number;
  /** The weakest part right now, in a few words. */
  missing: string;
}

/**
 * The rating so far, for the in-match tracker: the same sums as the final rating, with no finish
 * yet and no penalty for being early (a three-minute match isn't short until it ends).
 */
export function rateSoFar(S: MatchState): LiveRating {
  const mins = S.t / 60;
  const { crowd, structure, psych, drama, spots } = components(S, S.crowd.limbPayoff);
  const length = mins < 10 ? 0 : mins <= 28 ? 0.2 : mins <= 35 ? 0 : -0.2;
  const raw = 0.5 + crowd + structure + psych + drama + spots + length + (S.rules.title ? 0.1 : 0);
  const parts = {
    crowd: crowd / 1.55,
    story: clamp((structure + psych) / 1.5, 0, 1),
    drama: clamp(drama / 1.6, 0, 1),
    action: clamp((spots + length + 0.6) / 1.2, 0, 1),
  };
  const c = S.crowd;
  const missing = !c.heatSeg ? 'Nobody has taken over yet'
    : !c.comeback ? 'Waiting on a comeback'
    : parts.drama < 0.3 ? 'Needs near-falls'
    : parts.crowd < 0.4 ? 'The crowd is quiet'
    : 'Building nicely';
  return { stars: clamp(Math.round(raw * 4) / 4, 0.25, 5), ...parts, missing };
}

export function rate(S: MatchState): Rating {
  const c = S.crowd, R = S.result;
  if (!R) throw new Error('rate() before the match ended');
  const mins = R.t / 60;
  const W = R.winner ? S[R.winner] : null, L = R.loser ? S[R.loser] : null;
  const finishPart = R.move ? (R.move.parts.find((p) => p !== 'NONE') as BodyPart | undefined) : undefined;
  const lossWork = L ? workedOn(S, L) : { part: 'BODY' as BodyPart, n: 0 };
  // Limb work pays off when the finish goes after that part, or when the part is wrecked by the end:
  // a head worked into critical condition is why the loser couldn't fight back, whatever ended it.
  const wrecked = !!L && lossWork.n >= 4 && L.hp[lossWork.part] < 25;
  const payoff = c.limbPayoff || wrecked || (!!finishPart && finishPart === lossWork.part && lossWork.n >= 4);
  const { avg, crowd, limb, structure, psych, drama, spots } = components(S, payoff);
  const how = R.finish === 'SUBMISSION' || R.finish === 'I_QUIT' ? 'sub' : R.finish === 'PINFALL' ? 'pin'
    : R.finish === 'COUNT_OUT' || R.finish === 'DOUBLE_COUNT_OUT' ? 'countout' : R.finish === 'DISQUALIFICATION' ? 'dq' : 'stip';
  let finish = 0;
  if (R.byFin && mins >= 10) finish += 0.4;
  if (R.byFin && R.afterFk) finish += 0.25;
  if (R.byFlash && mins >= 12) finish += 0.2;
  if (mins < 6 && !R.byFin) finish -= 0.5;
  if (how === 'sub' && payoff) finish += 0.1;
  if (how === 'countout') finish -= 0.3;
  if (how === 'dq') finish -= 0.4;
  if (how === 'stip' && mins >= 10) finish += 0.3;
  const length = mins < 6 ? -0.6 : mins < 10 ? -0.25 : mins <= 28 ? 0.2 : mins <= 35 ? 0 : -0.2;
  const bigMatch = S.you.big && (has(S.you, 'big_match') || has(S.them, 'big_match')) ? FX.big_match.stars : 0;
  const raw = 0.5 + crowd + structure + psych + drama + finish + spots + length + (S.rules.title ? 0.1 : 0) + bigMatch;
  const stars = clamp(Math.round(raw * 4) / 4, 0.25, 5);
  const story = structure + psych;

  const T = RATING;
  const storyBits = [
    c.heatSeg ? format(T.story.heatSeg, { x: S[c.heatSeg].w.name }) : T.story.noHeatSeg,
    c.comeback ? format(T.story.comeback, { x: S[c.comeback].w.name }) : T.story.noComeback,
    limb.n >= 4 ? format(T.story.limb, { part: PART_LABEL[limb.part], n: limb.n, tail: payoff ? T.story.limbPaid : T.story.limbUnpaid }) : T.story.noLimb,
    c.repeats ? format(T.story.repeats, { n: c.repeats, s: c.repeats > 1 ? 's' : '' }) : '',
  ];
  const finishNote =
    how === 'countout' ? 'Decided on the floor. Not the finish anyone came to see.'
    : how === 'dq' ? T.finish.dq
    : how === 'stip' ? (T.finish.stip[R.finish as keyof typeof T.finish.stip] ?? T.finish.plain)
    : R.byFin && R.afterFk ? T.finish.afterFk
    : R.byFin && mins >= 10 ? T.finish.earned
    : R.byFin ? T.finish.tooSoon
    : R.byFlash && mins >= 12 ? T.finish.stolen
    : mins < 6 ? T.finish.tooEarly
    : how === 'sub' ? T.finish.tapped
    : T.finish.plain;
  const parts = [
    { l: T.parts.crowd, v: crowd / 1.55, n: format(T.crowdNote, { avg: Math.round(avg), peak: Math.round(c.heatPeak) }) },
    { l: T.parts.story, v: clamp(story / 1.5, 0, 1), n: storyBits.filter(Boolean).join(' · ') + '.' },
    { l: T.parts.drama, v: clamp(drama / 1.6, 0, 1), n: format(T.drama, { nf: c.nf, nfs: s(c.nf), rev: c.reversals, revs: s(c.reversals), fr: c.finRev, frs: s(c.finRev) }) },
    { l: T.parts.action, v: clamp((spots + length + 0.6) / 1.2, 0, 1), n: format(T.action, { high: c.high, highs: s(c.high), spots: c.spots, mins: Math.floor(mins) }) },
    { l: T.parts.finish, v: clamp((finish + 0.5) / 1.45, 0, 1), n: finishNote },
  ];
  const label = raw >= 5.5 ? T.labels.offScale : stars >= 4.25 ? T.labels.motn : stars >= 3.25 ? T.labels.strong : stars >= 2.25 ? T.labels.solid : stars >= 1.5 ? T.labels.needsWork : T.labels.goHome;
  const verdict = raw >= 5.5 ? T.verdicts.offScale : stars >= 4.5 ? T.verdicts.v45 : stars >= 4 ? T.verdicts.v4 : stars >= 3 ? T.verdicts.v3 : stars >= 2 ? T.verdicts.v2 : T.verdicts.low;

  const rec: string[] = [format(T.recap.intro, { event: S.event, venue: S.venue }) + (S.rules.title && S.titleName ? format(T.recap.title, { title: S.titleName }) : '')];
  if (c.heatSeg) {
    const dom = S[c.heatSeg], vic = S[other(c.heatSeg)], lp = workedOn(S, vic);
    rec.push(format(T.recap.heatSeg, { dom: dom.w.name, tail: lp.n >= 4 ? format(T.recap.heatSegLimb, { vic: vic.w.name, part: PART_LABEL[lp.part] }) : '' }));
  }
  if (c.comeback) rec.push(format(T.recap.comeback, { x: S[c.comeback].w.name, tail: '' }));
  if (c.nf) rec.push(format(T.recap.nf, { n: c.nf, s: s(c.nf), tail: c.fk ? format(T.recap.nfFk, { fk: c.fk }) : '' }));
  if (c.finRev) rec.push(format(T.recap.finRev, { n: c.finRev, s: c.finRev > 1 ? 's' : '' }));
  if (W) {
    rec.push(format(T.recap.won, {
      w: W.w.name,
      t: fmtClock(R.t),
      how: T.recap.wonBy[R.finish as keyof typeof T.recap.wonBy]
        ?? (how === 'countout' ? ' by count-out' : R.move ? format(T.recap.wonWithMove, { move: R.move.name }) : T.recap.wonPin),
      sub: how === 'sub' && R.finish !== 'I_QUIT' ? T.recap.wonSub : '',
    }));
  } else rec.push(`Neither wrestler beat the count. Double count-out at ${fmtClock(R.t)}.`);
  if (R.score) rec.splice(rec.length - 1, 0, format(T.recap.falls, { s: `${R.score.you}–${R.score.them}` }));
  return { raw, stars, parts, label, verdict, recap: rec.join(' ') };
}
