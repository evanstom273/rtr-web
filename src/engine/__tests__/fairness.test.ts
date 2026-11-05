// Opt-in (MATCHES=1): in a crowd, nobody's place in the running order should decide who wins. With the AI on
// every side, each position in a free-for-all should win about its share (the first side used to be jumped
// by the whole field: everyone's first target, and every tie on who to go after next).
import { expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { seededRng } from '../rng';
import { runHeadless } from '../sim/runHeadless';

const pick = (rnd: () => number, n: number) => {
  const out: string[] = [];
  while (out.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id) && w.gender === 'MALE') out.push(w.id); }
  return out;
};

it.skipIf(!process.env.MATCHES)('every place in the running order gets its fair share of wins', () => {
  const N = 200;
  for (const k of [{ name: 'fourway', n: 4, elim: false }, { name: 'fourway-elim', n: 4, elim: true }, { name: 'six-way elim', n: 6, elim: true }]) {
    const wins = Array(k.n).fill(0);
    for (let i = 0; i < N; i++) {
      const ids = pick(seededRng(900 + i), k.n);
      const r = runHeadless({ seed: 5000 + i, you: ids[0]!, them: ids[1]!, player: null, extras: ids.slice(2).map((id, j) => ({ id, team: j + 2 })), model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { elimination: k.elim } });
      const w = r.result?.winner;
      if (w) wins[r.engine.state.sides[w]!.team]++;
    }
    console.log(k.name.padEnd(13), wins.join(' '));
    const fair = N / k.n;
    for (const x of wins) expect(x, k.name).toBeGreaterThan(fair * 0.6);
  }
}, 900_000);
