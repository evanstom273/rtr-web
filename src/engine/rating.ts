import { RATING } from '../data/commentary';
import { PL } from '../data/labels';
import { fmtClock, format, other } from './commentary';
import { clamp } from './rng';
import type { BodyPart, MatchState, Rating, Side } from './types';
import { PARTS } from './types';

export function topPart(w: Side): { part: BodyPart; n: number } {
  let best: BodyPart = 'leg', n = 0;
  for (const p of PARTS) {
    if (w.partHits[p] > n) {
      n = w.partHits[p];
      best = p;
    }
  }
  return { part: best, n };
}

const s = (n: number) => (n === 1 ? '' : 's');

/** Star rating and breakdown for a finished match. */
export function rate(S: MatchState): Rating {
  const st = S.stats, R = S.result;
  if (!R) throw new Error('rate() before the match ended');
  const mins = R.t / 60, W = S[R.winner], L = S[R.loser];
  const avg = st.heatSum / Math.max(1, st.heatN);
  const crowd = (avg / 100) * 1.3 + (st.heatPeak >= 88 ? 0.25 : st.heatPeak >= 75 ? 0.1 : 0);
  const limb = [topPart(S.you), topPart(S.them)].sort((a, b) => b.n - a.n)[0] as { part: BodyPart; n: number };
  const payoff = st.limbPayoff || !!(R.move && R.move.part === topPart(L).part && topPart(L).n >= 4);
  const structure = (st.heatSeg ? 0.3 : 0) + (st.comeback ? 0.5 : 0) + (st.fireUp && st.comeback === st.fireUp ? 0.1 : 0);
  const psych = (limb.n >= 5 ? 0.25 : 0) + (payoff ? 0.35 : 0) - Math.min(0.6, st.repeats * 0.1) - Math.max(0, st.rest - 3) * 0.08;
  const drama = Math.min(0.7, st.nf * 0.15) + Math.min(0.7, st.fk * 0.35) + Math.min(0.5, st.finRev * 0.25) + Math.min(0.35, st.reversals * 0.03);
  let finish = 0;
  if (R.byFin && mins >= 10) finish += 0.4;
  if (R.byFin && R.afterFk) finish += 0.25;
  if (R.byFlash && mins >= 12) finish += 0.2;
  if (mins < 6 && !R.byFin) finish -= 0.5;
  if (R.how === 'sub' && payoff) finish += 0.1;
  const spots = Math.min(0.3, st.high * 0.06) + (st.spots > 0 ? 0.1 : 0);
  const length = mins < 6 ? -0.6 : mins < 10 ? -0.25 : mins <= 28 ? 0.2 : mins <= 35 ? 0 : -0.2;
  const raw = 0.5 + crowd + structure + psych + drama + finish + spots + length + (S.title ? 0.1 : 0);
  const stars = clamp(Math.round(raw * 4) / 4, 0.25, 5);
  const story = structure + psych;

  const T = RATING;
  const storyBits = [
    st.heatSeg ? format(T.story.heatSeg, { x: S[st.heatSeg].name }) : T.story.noHeatSeg,
    st.comeback ? format(T.story.comeback, { x: S[st.comeback].name }) : T.story.noComeback,
    limb.n >= 4
      ? format(T.story.limb, { part: PL[limb.part], n: limb.n, tail: payoff ? T.story.limbPaid : T.story.limbUnpaid })
      : T.story.noLimb,
    st.repeats ? format(T.story.repeats, { n: st.repeats, s: st.repeats > 1 ? 's' : '' }) : '',
  ];
  const finishNote =
    R.byFin && R.afterFk ? T.finish.afterFk
    : R.byFin && mins >= 10 ? T.finish.earned
    : R.byFin ? T.finish.tooSoon
    : R.byFlash && mins >= 12 ? T.finish.stolen
    : mins < 6 ? T.finish.tooEarly
    : R.how === 'sub' ? T.finish.tapped
    : T.finish.plain;
  const parts = [
    { l: T.parts.crowd, v: crowd / 1.55, n: format(T.crowdNote, { avg: Math.round(avg), peak: Math.round(st.heatPeak) }) },
    { l: T.parts.story, v: clamp(story / 1.5, 0, 1), n: storyBits.filter(Boolean).join(' · ') + '.' },
    {
      l: T.parts.drama,
      v: clamp(drama / 1.6, 0, 1),
      n: format(T.drama, { nf: st.nf, nfs: s(st.nf), rev: st.reversals, revs: s(st.reversals), fr: st.finRev, frs: s(st.finRev) }),
    },
    {
      l: T.parts.action,
      v: clamp((spots + length + 0.6) / 1.2, 0, 1),
      n: format(T.action, { high: st.high, highs: s(st.high), spots: st.spots, mins: Math.floor(mins) }),
    },
    { l: T.parts.finish, v: clamp((finish + 0.5) / 1.45, 0, 1), n: finishNote },
  ];
  const label =
    raw >= 5.5 ? T.labels.offScale
    : stars >= 4.25 ? T.labels.motn
    : stars >= 3.25 ? T.labels.strong
    : stars >= 2.25 ? T.labels.solid
    : stars >= 1.5 ? T.labels.needsWork
    : T.labels.goHome;
  const verdict =
    raw >= 5.5 ? T.verdicts.offScale
    : stars >= 4.5 ? T.verdicts.v45
    : stars >= 4 ? T.verdicts.v4
    : stars >= 3 ? T.verdicts.v3
    : stars >= 2 ? T.verdicts.v2
    : T.verdicts.low;

  const rec: string[] = [format(T.recap.intro, { event: S.event, venue: S.venue }) + (S.title ? format(T.recap.title, { title: S.titleName }) : '')];
  if (st.heatSeg) {
    const dom = S[st.heatSeg], vic = S[other(st.heatSeg)], lp = topPart(vic);
    rec.push(format(T.recap.heatSeg, { dom: dom.name, tail: lp.n >= 4 ? format(T.recap.heatSegLimb, { vic: vic.name, part: PL[lp.part] }) : '' }));
  }
  if (st.comeback) rec.push(format(T.recap.comeback, { x: S[st.comeback].name, tail: st.fireUp === st.comeback ? T.recap.comebackCrowd : '' }));
  if (st.nf) rec.push(format(T.recap.nf, { n: st.nf, s: s(st.nf), tail: st.fk ? format(T.recap.nfFk, { fk: st.fk }) : '' }));
  if (st.finRev) rec.push(format(T.recap.finRev, { n: st.finRev, s: st.finRev > 1 ? 's' : '' }));
  rec.push(
    format(T.recap.won, {
      w: W.name,
      t: fmtClock(R.t),
      how: R.move ? format(T.recap.wonWithMove, { move: R.move.name }) : T.recap.wonPin,
      sub: R.how === 'sub' ? T.recap.wonSub : '',
    }),
  );
  return { raw, stars, parts, label, verdict, recap: rec.join(' ') };
}
