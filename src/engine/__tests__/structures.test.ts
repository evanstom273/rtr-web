import { describe, expect, it } from 'vitest';
import { getWeapon, WRESTLERS } from '../../data/rtr';
import { MatchEngine } from '../match';
import { runHeadless } from '../sim/runHeadless';
import { seededRng } from '../rng';
import { canRetrieve } from '../env';
import { validSetups } from '../setups';
import { SCAFFOLD_BLOCKED } from '../structures';
import type { StipulationId } from '../types';

const pick = (seed: number, n: number) => {
  const rnd = seededRng(seed), out: string[] = [];
  while (out.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id)) out.push(w.id); }
  return out;
};
const cfg = (seed: number, teams: number[], stipulation: StipulationId, rules: Record<string, unknown> = {}) => {
  const ids = pick(seed, teams.length);
  return { you: ids[0]!, them: ids[1]!, extras: ids.slice(2).map((id, i) => ({ id, team: teams[i + 2]! })), seed, rules: { stipulation, ...rules } };
};
const run = (seed: number, teams: number[], stipulation: StipulationId, rules: Record<string, unknown> = {}) =>
  runHeadless({ ...cfg(seed, teams, stipulation, rules), model: { kind: 'fixed', rate: 0.5 } });
const text = (r: ReturnType<typeof run>) => r.engine.state.log.map((l) => l.segs.map((s) => s.v).join('')).join('\n');

describe('Hell in a Cell', () => {
  it('falls count anywhere inside the cell, no DQs, and people end up on the roof (and off it)', () => {
    let roof = 0, off = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = run(seed, [0, 1], 'hell_in_a_cell');
      expect(r.stuck).toBeNull();
      expect(['PINFALL', 'SUBMISSION']).toContain(r.result!.finish);
      expect(r.engine.state.rules.dq).toBe(false);
      const t = text(r);
      if (/top of the cell|climbing the side of the cell/.test(t)) roof++;
      if (/off the top of the cell|roof gives way/.test(t)) off++;
    }
    expect(roof).toBeGreaterThan(3);
    expect(off).toBeGreaterThan(0);
  });
});

describe('Elimination Chamber', () => {
  it('two start, the rest come out of the pods every four minutes, and it goes to the last one', () => {
    const r = run(10, [0, 1, 2, 3, 4, 5], 'elimination_chamber');
    expect(r.stuck).toBeNull();
    const S = r.engine.state, E = r.result!.entries!;
    expect(S.rules.elimination).toBe(true);
    expect(S.elims).toHaveLength(5);
    const byN = Object.values(E).sort((a, b) => a.n - b.n);
    for (let i = 2; i < 6; i++) {
      expect(byN[i]!.inAt!).toBeGreaterThanOrEqual((i - 1) * 240);
      expect(byN[i]!.inAt!).toBeLessThan((i - 1) * 240 + 25);
    }
    expect(text(r)).toMatch(/The pod opens/);
  });
});

describe('WarGames', () => {
  it('one from each team starts, they come in alternately, and nobody can win until everyone is in', () => {
    for (let seed = 20; seed < 26; seed++) {
      let earlyFall = false, allIn = false;
      const r = runHeadless({
        ...cfg(seed, [0, 1, 0, 1, 0, 1, 0, 1], 'wargames'), model: { kind: 'fixed', rate: 0.5 },
        onStep: (e) => {
          const S = e.state;
          allIn ||= S.order.every((k) => S.sides[k]!.out !== 'waiting');
          if (!allIn && (e.pending.kind === 'refCount' || e.pending.kind === 'kickout')) earlyFall = true;
        },
      });
      expect(r.stuck).toBeNull();
      expect(earlyFall).toBe(false);
      const S = r.engine.state, draw = S.draw!;
      expect(S.sides[draw[0]!]!.team).not.toBe(S.sides[draw[1]!]!.team);
      for (let i = 2; i < draw.length - 1; i += 2) expect(S.sides[draw[i]!]!.team).not.toBe(S.sides[draw[i + 1]!]!.team);
      expect(text(r)).toMatch(/match beyond/);
      expect(r.result!.winners).toHaveLength(4);
    }
  });
});

describe('scaffold and Ultimate X', () => {
  it('scaffold: both start up there, nobody goes anywhere, and it ends with someone knocked off', () => {
    const e = new MatchEngine(cfg(30, [0, 1], 'scaffold'));
    expect(e.state.you.perch).toBe('scaffold');
    for (const id of validSetups(e.state, 'you')) expect(SCAFFOLD_BLOCKED.has(id)).toBe(false);
    for (let seed = 30; seed < 36; seed++) {
      const r = run(seed, [0, 1], 'scaffold');
      expect(r.stuck).toBeNull();
      expect(r.result!.finish).toBe('SCAFFOLD');
      expect(r.result!.t / 60).toBeGreaterThan(5);
    }
  });

  it('Ultimate X: up to the cables, hand over hand, pulled down along the way, and the X comes down', () => {
    let pulled = 0;
    for (let seed = 40; seed < 52; seed++) {
      const r = run(seed, [0, 1, 2, 3], 'ultimate_x');
      expect(r.stuck).toBeNull();
      expect(r.result!.finish).toBe('ULTIMATE_X');
      if (/yanks .* down off the cables|loses their grip/.test(text(r))) pulled++;
    }
    expect(pulled).toBeGreaterThan(4);
  });
});

describe('TLC and Money in the Bank', () => {
  it('TLC is a ladder match with tables and chairs, and more ladders', () => {
    const S = new MatchEngine(cfg(60, [0, 1], 'tlc')).state;
    expect(canRetrieve(S, getWeapon('ladder'))).toBe(true);
    for (let seed = 60; seed < 66; seed++) {
      const r = run(seed, [0, 1], 'tlc');
      expect(r.stuck).toBeNull();
      expect(r.result!.finish).toBe('LADDER');
    }
  });

  it('Money in the Bank: six of them, the briefcase, and nobody in particular lost', () => {
    let tipped = 0;
    for (let seed = 70; seed < 76; seed++) {
      const r = run(seed, [0, 1, 2, 3, 4, 5], 'money_in_the_bank');
      expect(r.stuck).toBeNull();
      expect(r.result!.finish).toBe('LADDER');
      expect(r.result!.loser).toBeNull();
      expect(r.result!.winners).toHaveLength(1);
      if (/tips|topples|shoves the ladder|knocks .* off the ladder/i.test(text(r))) tipped++;
    }
    expect(tipped).toBeGreaterThan(0);
  });
});
