import { it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { runHeadless } from '../sim/runHeadless';
import { seededRng } from '../rng';

const pick = (rnd: () => number, n: number) => {
  const out: string[] = [];
  while (out.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id)) out.push(w.id); }
  return out;
};

// The match-types harness (match overhaul): MATCHES=1 npx vitest run src/engine/__tests__/matchesrun.test.ts
it.skipIf(!process.env.MATCHES)('match types: length, stars, saves, eliminations', () => {
  const kinds = [
    { name: 'triple', teams: [0, 1, 2], elim: false },
    { name: 'fourway', teams: [0, 1, 2, 3], elim: false },
    { name: 'triple-elim', teams: [0, 1, 2], elim: true },
    { name: 'fourway-elim', teams: [0, 1, 2, 3], elim: true },
    { name: 'handicap 2v1', teams: [0, 1, 1], elim: false },
    { name: 'tornado 2v2', teams: [0, 1, 0, 1], elim: false },
    { name: 'six-way elim', teams: [0, 1, 2, 3, 4, 5], elim: true },
  ];
  for (const k of kinds) {
    const mins: number[] = [];
    const stats = { n: 0, stuck: 0, mins: 0, stars: [] as number[], saves: 0, steals: 0, elims: 0, fin: {} as Record<string, number>, youWin: 0, steps: 0, ms: 0 };
    for (let i = 0; i < 40; i++) {
      const rnd = seededRng(900 + i);
      const ids = pick(rnd, k.teams.length);
      const t0 = performance.now();
      const r = runHeadless({ seed: 5000 + i, you: ids[0]!, them: ids[1]!, extras: ids.slice(2).map((id, j) => ({ id, team: k.teams[j + 2]! })), model: { kind: 'skill', sigmaSeconds: 0.09 }, rules: { elimination: k.elim } });
      stats.ms += performance.now() - t0;
      stats.n++;
      if (r.stuck) { stats.stuck++; console.log(k.name, 'STUCK', r.stuck); continue; }
      const S = r.engine.state;
      stats.mins += (r.result?.t ?? 0) / 60; mins.push(Math.round((r.result?.t ?? 0) / 60));
      stats.stars.push(r.rating?.stars ?? 0);
      stats.saves += S.crowd.saves ?? 0; stats.steals += S.crowd.steals ?? 0; stats.elims += S.elims.length;
      stats.fin[r.result?.finish ?? 'none'] = (stats.fin[r.result?.finish ?? 'none'] ?? 0) + 1;
      if (r.result?.winners?.includes('you')) stats.youWin++;
      stats.steps += r.steps;
    }
    const st = stats.stars.sort((a, b) => a - b);
    console.log(`${k.name.padEnd(14)} stuck ${stats.stuck} | ${(stats.mins / stats.n).toFixed(1)} min | stars med ${st[Math.floor(st.length / 2)]} (${st[0]}–${st[st.length - 1]}) | saves ${(stats.saves / stats.n).toFixed(1)} steals ${(stats.steals / stats.n).toFixed(2)} elims ${(stats.elims / stats.n).toFixed(1)} | you win ${stats.youWin}/${stats.n} | ${JSON.stringify(stats.fin)} | ${(stats.ms / stats.n).toFixed(0)}ms | mins ${mins.sort((a, b) => a - b).join(',')}`);
  }
}, 600000);
