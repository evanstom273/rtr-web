import { describe, expect, it } from 'vitest';
import { MatchEngine } from '../match';
import { rate } from '../rating';
import type { MatchResult, MatchState } from '../types';

function finished(over: Partial<MatchResult>, tweak: (S: MatchState) => void = () => {}): MatchState {
  const S = new MatchEngine({ you: 'rook', them: 'juno', stakes: 'exh', seed: 1 }).state;
  S.stats.heatSum = 500;
  S.stats.heatN = 10; // average 50
  S.stats.heatPeak = 60;
  const res: MatchResult = {
    winner: 'you', loser: 'them', how: 'pin', move: S.you.sig, t: 900,
    byFin: false, byFlash: false, afterFk: false, ...over,
  };
  S.result = res;
  tweak(S);
  return S;
}

describe('rate', () => {
  it('a plain fifteen-minute finisher win', () => {
    // 0.5 base + crowd .65 + finish .4 + length .2 = 1.75
    const r = rate(finished({ byFin: true, move: null }));
    expect(r.raw).toBeCloseTo(1.75);
    expect(r.stars).toBe(1.75);
    expect(r.label).toBe('Needs work');
    expect(r.verdict).toBe("Someone's getting a talking-to in the back.");
    expect(r.parts.map((p) => p.l)).toEqual(['Crowd', 'Story', 'Drama', 'Action', 'Finish']);
  });

  it('a short match is punished hard', () => {
    // 0.5 + .65 + finish -.5 + length -.6 = 0.05 → clamps to 0.25
    const r = rate(finished({ t: 240 }));
    expect(r.raw).toBeCloseTo(0.05);
    expect(r.stars).toBe(0.25);
    expect(r.label).toBe('Go home early');
  });

  it('the full story: heat segment, fired-up comeback, limb payoff, near-falls, title', () => {
    const S = finished({ byFin: true, afterFk: true, how: 'sub', move: null, t: 1200 }, (S) => {
      const st = S.stats;
      st.heatSum = 750; // avg 75
      st.heatPeak = 90; // +.25
      st.heatSeg = 'them';
      st.comeback = 'you';
      st.fireUp = 'you';
      st.limbPayoff = true;
      st.nf = 3;
      st.fk = 1;
      st.finRev = 1;
      st.reversals = 10;
      st.high = 2;
      st.spots = 1;
      st.repeats = 1;
      S.them.partHits.arm = 5;
      S.title = true;
    });
    const r = rate(S);
    const crowd = 0.75 * 1.3 + 0.25;
    const structure = 0.3 + 0.5 + 0.1;
    const psych = 0.25 + 0.35 - 0.1;
    const drama = 0.45 + 0.35 + 0.25 + 0.3;
    const finish = 0.4 + 0.25 + 0.1;
    const spots = 0.12 + 0.1;
    const raw = 0.5 + crowd + structure + psych + drama + finish + spots + 0.2 + 0.1;
    expect(r.raw).toBeCloseTo(raw);
    expect(r.stars).toBe(5);
    expect(r.label).toBe('Off the scale');
    // Rook (the victim of the heat segment) had no limb worked, so no "going after" tail
    expect(r.recap).toContain('The World Independent Championship was on the line. Juno Vance took over the middle of the match.');
    expect(r.recap).toContain('Isla Rook fought from underneath and turned it around with the whole building behind them.');
    expect(r.recap).toContain('3 near-falls, 1 of them out of a finisher.');
    expect(r.recap).toContain('Isla Rook won it at 20:00 with a pinfall by submission.');
    expect(r.parts[1]?.n).toBe('Juno Vance had a proper heat segment · Isla Rook came back · worked the arm ×5, and it paid off · 1 repeated move.');
  });

  it('star rounding is to the nearest quarter and label thresholds hold', () => {
    const r = rate(finished({ byFin: true, move: null }, (S) => { S.stats.nf = 2; })); // +.3 → 2.05 → 2
    expect(r.stars).toBe(2);
    expect(r.label).toBe('Needs work');
    expect(r.verdict).toBe('It happened. The crowd will mostly remember the hot dogs.');
  });

  it('rest holds and repeats drag psychology down', () => {
    const base = rate(finished({ byFin: true, move: null })).raw;
    const r = rate(finished({ byFin: true, move: null }, (S) => { S.stats.rest = 5; S.stats.repeats = 10; }));
    expect(base - r.raw).toBeCloseTo(0.6 + 0.16);
  });
});
