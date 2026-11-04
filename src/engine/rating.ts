// Match of the Night's star rating, fed by the RtR engine's crowd stats.
import { RATING_CURVE, RATING_TITLE_BONUS, RATING_WEIGHTS, TRAIT_FX as FX } from '../career/tuning';
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

/** The crowd's average and the most-worked body part, for the write-up. */
function components(S: MatchState) {
  const c = S.crowd;
  const avg = c.heatSum / Math.max(1, c.heatN);
  const limb = [topPart(S.you), topPart(S.them)].sort((a, b) => b.n - a.n)[0]!;
  return { avg, limb };
}

/** Everything the rating reads from a finished (or running) match, as plain numbers. */
export interface MatchFeatures {
  mins: number; avg: number; peak: number; heatSeg: boolean; comeback: boolean; limbN: number; payoff: boolean;
  repeats: number; rest: number; nf: number; nearTaps: number; fk: number; finRev: number; reversals: number; counters: number; ropeBreaks: number;
  stip: number; tableBreaks: number; weaponHits: number; bleeds: number; high: number; spots: number;
  how: 'pin' | 'sub' | 'countout' | 'dq' | 'stip' | 'none'; byFin: boolean; afterFk: boolean; byFlash: boolean; title: boolean; big: boolean;
}

export function matchFeatures(S: MatchState): MatchFeatures {
  const c = S.crowd, R = S.result;
  const mins = (R?.t ?? S.t) / 60;
  let payoff = c.limbPayoff;
  if (R) {
    const L = R.loser ? S[R.loser] : null;
    const finishPart = R.move ? (R.move.parts.find((p) => p !== 'NONE') as BodyPart | undefined) : undefined;
    const lossWork = L ? workedOn(S, L) : { part: 'BODY' as BodyPart, n: 0 };
    payoff = payoff || (!!L && lossWork.n >= 4 && L.hp[lossWork.part] < 25) || (!!finishPart && finishPart === lossWork.part && lossWork.n >= 4);
  }
  const how = !R ? 'none' : R.finish === 'SUBMISSION' || R.finish === 'I_QUIT' ? 'sub' : R.finish === 'PINFALL' ? 'pin'
    : R.finish === 'COUNT_OUT' || R.finish === 'DOUBLE_COUNT_OUT' ? 'countout' : R.finish === 'DISQUALIFICATION' ? 'dq' : 'stip';
  return {
    mins, avg: c.heatSum / Math.max(1, c.heatN), peak: c.heatPeak, heatSeg: !!c.heatSeg, comeback: !!c.comeback,
    limbN: Math.max(topPart(S.you).n, topPart(S.them).n), payoff, repeats: c.repeats, rest: c.rest,
    nf: c.nf, nearTaps: c.nearTaps ?? 0, fk: c.fk, finRev: c.finRev, reversals: c.reversals, counters: c.counters ?? 0, ropeBreaks: c.ropeBreaks ?? 0,
    stip: c.climbStops * 0.15 + c.ladderPulls * 0.05 + c.cageClimbs * 0.06 + c.tenCounts * 0.12 + c.nearQuits * 0.2 + c.falls * 0.12,
    tableBreaks: c.tableBreaks, weaponHits: c.weaponHits, bleeds: c.bleeds, high: c.high, spots: c.spots,
    how, byFin: !!R?.byFin, afterFk: !!R?.afterFk, byFlash: !!R?.byFlash, title: !!S.rules.title,
    big: !!S.you.big && (has(S.you, 'big_match') || has(S.them, 'big_match')),
  };
}

export type RatingDim = keyof typeof RATING_WEIGHTS;
const sat = (x: number, k: number) => 1 - Math.exp(-Math.max(0, x) / k);

/**
 * The five style-neutral scores, 0–1 each. `live` leaves out the finish and doesn't count a match as
 * short before it's over.
 */
export function ratingDims(f: MatchFeatures, live = false): Record<RatingDim, number> {
  const crowdRaw = clamp((f.avg - 25) / 35, 0, 1.2) + (f.peak >= 95 ? 0.35 : f.peak >= 85 ? 0.25 : f.peak >= 75 ? 0.1 : 0);
  const story = clamp(((f.heatSeg ? 0.3 : 0) + (f.comeback ? 0.5 : 0) + (f.limbN >= 5 ? 0.25 : 0) + (f.payoff ? 0.35 : 0)) / 1.4, 0, 1);
  const dramaRaw = Math.min(0.7, f.nf * 0.15) + Math.min(0.7, f.fk * 0.35) + Math.min(0.5, f.finRev * 0.25) + Math.min(0.6, f.reversals * 0.05)
    + Math.min(0.3, f.counters * 0.08) + Math.min(0.4, f.ropeBreaks * 0.2) + Math.min(0.6, f.stip);
  const m = f.mins;
  let craft = 0.5;
  if (!live) {
    if (f.byFin && m >= 10) craft += 0.25;
    if (f.byFin && f.afterFk) craft += 0.15;
    if (f.byFlash && m >= 12) craft += 0.1;
    if (f.how === 'sub' && f.payoff) craft += 0.1;
    if (f.how === 'stip' && m >= 10) craft += 0.15;
    if (f.how === 'sub' && m >= 10 && !f.byFin) craft += 0.1;
    if (f.how === 'countout') craft -= 0.25;
    if (f.how === 'dq') craft -= 0.3;
  }
  craft += live && m < 10 ? 0 : m < 6 ? -0.4 : m < 10 ? -0.15 : m <= 28 ? 0.15 : m <= 35 ? 0 : -0.1;
  craft -= Math.min(0.4, f.repeats * 0.08) + Math.max(0, f.rest - 3) * 0.06;
  const hardcore = Math.min(0.6, (f.tableBreaks * 2 + f.weaponHits + f.bleeds * 1.5) * 0.08);
  return {
    crowd: clamp(crowdRaw / 1.55, 0, 1),
    story,
    drama: sat(dramaRaw, 1.1),
    craft: clamp(craft, 0, 1),
    spectacle: sat(Math.min(0.3, f.high * 0.06) + (f.spots > 0 ? 0.1 : 0) + hardcore, 0.45),
  };
}

/** The best four of the five, weighted: no match is marked down for the one thing its style doesn't do. */
export function ratingComposite(d: Record<RatingDim, number>): number {
  const best = (Object.keys(d) as RatingDim[]).sort((a, b) => d[b] * RATING_WEIGHTS[b] - d[a] * RATING_WEIGHTS[a]).slice(0, 4);
  return best.reduce((t, k) => t + d[k] * RATING_WEIGHTS[k], 0) / best.reduce((t, k) => t + RATING_WEIGHTS[k], 0);
}

/** The one fixed curve from composite to (unrounded) stars: strictly rising, steeper at the top. */
export function ratingCurve(c: number): number {
  const { at, stars } = RATING_CURVE;
  if (c <= at[0]!) return stars[0]!;
  for (let i = 1; i < at.length; i++) {
    if (c <= at[i]!) {
      const t = (c - at[i - 1]!) / Math.max(1e-9, at[i]! - at[i - 1]!);
      return stars[i - 1]! + t * (stars[i]! - stars[i - 1]!);
    }
  }
  return stars[stars.length - 1]!;
}

const quarter = (v: number) => clamp(Math.round(v * 4) / 4, 0.25, 5);

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
  const d = ratingDims(matchFeatures(S), true);
  const stars = quarter(ratingCurve(ratingComposite(d)) + (S.rules.title ? RATING_TITLE_BONUS : 0));
  const c = S.crowd;
  const missing = !c.heatSeg ? 'Nobody has taken over yet'
    : !c.comeback ? 'Waiting on a comeback'
    : d.drama < 0.3 ? 'Needs near-falls'
    : d.crowd < 0.4 ? 'The crowd is quiet'
    : 'Building nicely';
  return { stars, crowd: d.crowd, story: d.story, drama: d.drama, action: d.spectacle, missing };
}

export function rate(S: MatchState): Rating {
  const c = S.crowd, R = S.result;
  if (!R) throw new Error('rate() before the match ended');
  const mins = R.t / 60;
  const W = R.winner ? S[R.winner] : null;
  const f = matchFeatures(S);
  const { avg, limb } = components(S);
  const payoff = f.payoff;
  const d = ratingDims(f);
  const how = f.how;
  const bigMatch = f.big ? FX.big_match.stars : 0;
  const raw = ratingCurve(ratingComposite(d)) + (S.rules.title ? RATING_TITLE_BONUS : 0) + bigMatch;
  const stars = quarter(raw);

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
    { l: T.parts.crowd, v: d.crowd, n: format(T.crowdNote, { avg: Math.round(avg), peak: Math.round(c.heatPeak) }) },
    { l: T.parts.story, v: d.story, n: storyBits.filter(Boolean).join(' · ') + '.' },
    { l: T.parts.drama, v: d.drama, n: format(T.drama, { nf: c.nf, nfs: s(c.nf), rev: c.reversals, revs: s(c.reversals), fr: c.finRev, frs: s(c.finRev) }) },
    { l: T.parts.craft, v: d.craft, n: finishNote },
    { l: T.parts.action, v: d.spectacle, n: format(T.action, { high: c.high, highs: s(c.high), spots: c.spots, mins: Math.floor(mins) }) },
  ];
  const label = raw >= 5.15 ? T.labels.offScale : stars >= 4.25 ? T.labels.motn : stars >= 3.25 ? T.labels.strong : stars >= 2.25 ? T.labels.solid : stars >= 1.5 ? T.labels.needsWork : T.labels.goHome;
  const verdict = raw >= 5.15 ? T.verdicts.offScale : stars >= 4.5 ? T.verdicts.v45 : stars >= 4 ? T.verdicts.v4 : stars >= 3 ? T.verdicts.v3 : stars >= 2 ? T.verdicts.v2 : T.verdicts.low;

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
