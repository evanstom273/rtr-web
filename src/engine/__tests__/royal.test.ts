import { describe, expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { MatchEngine } from '../match';
import { runHeadless } from '../sim/runHeadless';
import { seededRng } from '../rng';
import { fighting } from '../commentary';
import { validSetups } from '../setups';
import { ironMen, ROYAL_BLOCKED } from '../royal';
import { gamesToWin, nextGame, recordGame, seriesLine, seriesWinner, type Series } from '../series';
import type { MatchType } from '../types';

const pick = (seed: number, n: number) => {
  const rnd = seededRng(seed), out: string[] = [];
  while (out.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id)) out.push(w.id); }
  return out;
};
const field = (seed: number, n: number, type: MatchType, rules: Record<string, unknown> = {}) => {
  const ids = pick(seed, n);
  return { ids, cfg: { you: ids[0]!, them: ids[1]!, extras: ids.slice(2).map((id, i) => ({ id, team: i + 2 })), type, rules, seed } };
};
const run = (seed: number, n: number, type: MatchType, rules: Record<string, unknown> = {}) => {
  const { cfg } = field(seed, n, type, rules);
  return runHeadless({ ...cfg, model: { kind: 'fixed', rate: 0.5 } });
};

describe('battle royal', () => {
  it('everyone starts in, nothing counts but over the top, and everyone but one goes', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const r = run(seed, 10, 'battle_royal');
      expect(r.stuck).toBeNull();
      const S = r.engine.state;
      expect(S.rules.pins).toBe(false);
      expect(S.rules.subs).toBe(false);
      expect(S.elims).toHaveLength(9);
      expect(S.elims.every((e) => e.finish === 'OVER_THE_TOP')).toBe(true);
      expect(r.result!.finish).toBe('OVER_THE_TOP');
      expect(Object.values(r.result!.entries!).every((e) => e.inAt === 0)).toBe(true);
      expect(r.result!.entries![r.result!.winner!]!.outAt).toBeNull();
    }
  });

  it('nobody leaves through the ropes', () => {
    const { cfg } = field(2, 8, 'battle_royal');
    const S = new MatchEngine(cfg).state;
    S.you.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
    for (const id of validSetups(S, 'you')) expect(ROYAL_BLOCKED.has(id)).toBe(false);
  });

  it('people hang on to the apron, and some skin the cat back in', () => {
    let hangs = 0, skins = 0;
    for (let seed = 10; seed < 30; seed++) {
      const S = run(seed, 12, 'battle_royal').engine.state;
      hangs += S.crowd.hangs ?? 0;
      skins += S.crowd.skins ?? 0;
    }
    expect(hangs).toBeGreaterThan(30);
    expect(skins).toBeGreaterThan(3);
  });
});

describe('Rumble', () => {
  it('two start, the rest come in every 90 seconds in the order of the draw', () => {
    const r = run(40, 12, 'rumble');
    expect(r.stuck).toBeNull();
    const E = r.result!.entries!;
    const byNumber = Object.entries(E).sort((a, b) => a[1].n - b[1].n);
    expect(byNumber.map(([, e]) => e.n)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(byNumber[0]![1].inAt).toBe(0);
    expect(byNumber[1]![1].inAt).toBe(0);
    for (let i = 2; i < 12; i++) {
      const inAt = byNumber[i]![1].inAt!;
      // Due at (i-1) × 90; arrives on the first action step after.
      expect(inAt).toBeGreaterThanOrEqual((i - 1) * 90);
      expect(inAt).toBeLessThan((i - 1) * 90 + 25);
    }
    expect(r.engine.state.elims).toHaveLength(11);
  });

  it('a booked draw is the order they come in, and a surprise gets a pop', () => {
    const { ids, cfg } = field(41, 6, 'rumble');
    const keys = ['you', 'them', 's2', 's3', 's4', 's5'];
    const draw = ['s5', 's4', 's3', 's2', 'them', 'you'];
    const r = runHeadless({ ...cfg, rules: { draw, surprises: ['you'] }, model: { kind: 'fixed', rate: 0.5 } });
    expect(r.stuck).toBeNull();
    const E = r.result!.entries!;
    draw.forEach((k, i) => expect(E[k]!.n).toBe(i + 1));
    expect(r.engine.state.crowd.surprises).toBe(1);
    expect(r.engine.state.log.some((l) => l.segs.some((s) => s.v.includes('Nobody saw that coming')))).toBe(true);
    void ids; void keys;
  });

  it('skip to your entry: the match runs itself until you come through the curtain', () => {
    const { cfg } = field(42, 10, 'rumble');
    const draw = ['them', 's2', 's3', 's4', 's5', 's6', 'you', 's7', 's8', 's9'];
    const e = new MatchEngine({ ...cfg, rules: { draw } });
    e.fastForward((S) => !S.you.out);
    const S = e.state;
    expect(S.you.out).toBeUndefined();
    expect(S.t).toBeGreaterThanOrEqual(5 * 90);
    expect(fighting(S)).toContain('you');
  });

  it('iron man records: the longest time in it and the most eliminations', () => {
    const r = run(43, 15, 'rumble');
    const im = ironMen(r.engine.state);
    expect(im.longest).not.toBeNull();
    expect(im.secs).toBeGreaterThan(0);
    expect(im.most).not.toBeNull();
    expect(im.elims).toBeGreaterThanOrEqual(1);
  });

  it('a 30-man Rumble runs in well under a second and a half', () => {
    const t0 = performance.now();
    const r = run(44, 30, 'rumble');
    expect(r.stuck).toBeNull();
    expect(r.engine.state.elims).toHaveLength(29);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('gauntlet', () => {
  it('the next one comes in as soon as someone goes out, and the damage carries', () => {
    for (let seed = 50; seed < 56; seed++) {
      const r = run(seed, 5, 'gauntlet');
      expect(r.stuck).toBeNull();
      const S = r.engine.state, E = r.result!.entries!;
      expect(S.elims).toHaveLength(4);
      // Everyone after the first two came in at the moment someone went out.
      const outs = S.elims.map((x) => x.t);
      for (const e of Object.values(E)) if (e.n > 2) expect(outs).toContain(e.inAt);
    }
  });
});

describe('series', () => {
  const s = (): Series => ({ id: 'x', a: ['rook'], b: ['vale'], bestOf: 5, games: [], stips: ['standard', 'no_dq', 'ladder'] });

  it('first to three in a best of five, each game its own stipulation', () => {
    const x = s();
    expect(gamesToWin(x)).toBe(3);
    expect(nextGame(x)).toEqual({ n: 1, stip: 'standard' });
    recordGame(x, 'a');
    expect(nextGame(x)).toEqual({ n: 2, stip: 'no_dq' });
    recordGame(x, null); // no contest: replayed
    expect(nextGame(x)).toEqual({ n: 3, stip: 'no_dq' });
    recordGame(x, 'b');
    recordGame(x, 'a');
    expect(seriesLine(x, 'Rook', 'Vale')).toBe('Best of five: Rook leads 2–1');
    expect(recordGame(x, 'a')).toBe('a');
    expect(seriesWinner(x)).toBe('a');
    expect(nextGame(x)).toBeNull();
    expect(seriesLine(x, 'Rook', 'Vale')).toBe('Best of five: Rook wins it 3–1');
  });
});
