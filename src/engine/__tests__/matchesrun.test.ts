import { it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { runHeadless } from '../sim/runHeadless';
import { seededRng } from '../rng';
import type { StipulationId } from '../types';

const pick = (rnd: () => number, n: number) => {
  const out: string[] = [];
  while (out.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id)) out.push(w.id); }
  return out;
};

// The match-types harness (match overhaul): MATCHES=1 npx vitest run src/engine/__tests__/matchesrun.test.ts
it.skipIf(!process.env.MATCHES)('match types: length, stars, saves, eliminations', () => {
  const only = process.env.ONLY;
  const kinds = [
    { name: 'singles', teams: [0, 1], elim: false },
    { name: 'triple', teams: [0, 1, 2], elim: false },
    { name: 'fourway', teams: [0, 1, 2, 3], elim: false },
    { name: 'triple-elim', teams: [0, 1, 2], elim: true },
    { name: 'fourway-elim', teams: [0, 1, 2, 3], elim: true },
    { name: 'handicap 2v1', teams: [0, 1, 1], elim: false },
    { name: 'tornado 2v2', teams: [0, 1, 0, 1], elim: false },
    { name: 'six-way elim', teams: [0, 1, 2, 3, 4, 5], elim: true },
    { name: 'tag 2v2', teams: [0, 1, 0, 1], elim: false, tag: true },
    { name: 'tag 3v3', teams: [0, 1, 0, 1, 0, 1], elim: false, tag: true },
    { name: 'handicap tag', teams: [0, 1, 1], elim: false, tag: true },
    { name: 'elim tag 3v3', teams: [0, 1, 0, 1, 0, 1], elim: true, tag: true },
    { name: 'battle royal 10', teams: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], elim: true, type: 'battle_royal' },
    { name: 'battle royal 20', teams: Array.from({ length: 20 }, (_, i) => i), elim: true, type: 'battle_royal' },
    { name: 'rumble 30', teams: Array.from({ length: 30 }, (_, i) => i), elim: true, type: 'rumble' },
    { name: 'gauntlet 5', teams: [0, 1, 2, 3, 4], elim: true, type: 'gauntlet' },
    ...(['street_fight', 'no_holds_barred', 'texas_death', 'first_blood', 'deathmatch', 'casket', 'ambulance', 'stretcher', 'strap', 'dog_collar', 'bull_rope', 'lumberjack', 'pole'] as const)
      .map((stip) => ({ name: stip, teams: [0, 1], elim: false, stip })),
    { name: 'hell_in_a_cell', teams: [0, 1], elim: false, stip: 'hell_in_a_cell' },
    { name: 'chamber 6', teams: [0, 1, 2, 3, 4, 5], elim: true, stip: 'elimination_chamber' },
    { name: 'wargames 4v4', teams: [0, 1, 0, 1, 0, 1, 0, 1], elim: false, stip: 'wargames' },
    { name: 'scaffold', teams: [0, 1], elim: false, stip: 'scaffold' },
    { name: 'ultimate_x 4', teams: [0, 1, 2, 3], elim: false, stip: 'ultimate_x' },
    { name: 'tlc', teams: [0, 1], elim: false, stip: 'tlc' },
    { name: 'mitb 6', teams: [0, 1, 2, 3, 4, 5], elim: false, stip: 'money_in_the_bank' },
  ];
  for (const k of kinds.filter((x) => !only || only.split(',').includes(x.name))) {
    const mins: number[] = [];
    const stats = { ott: 0, hangs: 0, tags: 0, hot: 0, cut: 0, dt: 0, n: 0, stuck: 0, mins: 0, stars: [] as number[], saves: 0, steals: 0, elims: 0, fin: {} as Record<string, number>, youWin: 0, steps: 0, ms: 0 };
    for (let i = 0; i < 40; i++) {
      const rnd = seededRng(900 + i);
      const ids = pick(rnd, k.teams.length);
      const t0 = performance.now();
      const r = runHeadless({ seed: 5000 + i, you: ids[0]!, them: ids[1]!, extras: ids.slice(2).map((id, j) => ({ id, team: k.teams[j + 2]! })), model: { kind: 'skill', sigmaSeconds: 0.09 }, rules: { elimination: k.elim, ...('tag' in k ? { tag: true } : {}), ...('stip' in k ? { stipulation: k.stip as StipulationId } : {}) }, ...('type' in k ? { type: k.type as 'rumble' } : {}) });
      stats.ms += performance.now() - t0;
      stats.n++;
      if (r.stuck) { stats.stuck++; console.log(k.name, 'STUCK', r.stuck); continue; }
      const S = r.engine.state;
      stats.mins += (r.result?.t ?? 0) / 60; mins.push(Math.round((r.result?.t ?? 0) / 60));
      stats.stars.push(r.rating?.stars ?? 0);
      stats.ott += S.crowd.ottTries ?? 0; stats.hangs += S.crowd.hangs ?? 0;
      stats.tags += S.crowd.tags ?? 0; stats.hot += S.crowd.hotTags ?? 0; stats.cut += S.crowd.cutOffs ?? 0; stats.dt += S.crowd.doubleTeams ?? 0;
      stats.saves += S.crowd.saves ?? 0; stats.steals += S.crowd.steals ?? 0; stats.elims += S.elims.length;
      stats.fin[r.result?.finish ?? 'none'] = (stats.fin[r.result?.finish ?? 'none'] ?? 0) + 1;
      if (r.result?.winners?.includes('you')) stats.youWin++;
      stats.steps += r.steps;
    }
    const st = stats.stars.sort((a, b) => a - b);
    console.log(`${k.name.padEnd(14)} stuck ${stats.stuck} | ${(stats.mins / stats.n).toFixed(1)} min | stars med ${st[Math.floor(st.length / 2)]} (${st[0]}–${st[st.length - 1]}) | saves ${(stats.saves / stats.n).toFixed(1)} steals ${(stats.steals / stats.n).toFixed(2)} elims ${(stats.elims / stats.n).toFixed(1)} | ott ${(stats.ott / stats.n).toFixed(0)} hang ${(stats.hangs / stats.n).toFixed(1)} | tags ${(stats.tags / stats.n).toFixed(1)} hot ${(stats.hot / stats.n).toFixed(2)} cut ${(stats.cut / stats.n).toFixed(1)} dt ${(stats.dt / stats.n).toFixed(1)} | you win ${stats.youWin}/${stats.n} | ${JSON.stringify(stats.fin)} | ${(stats.ms / stats.n).toFixed(0)}ms | mins ${mins.sort((a, b) => a - b).join(',')}`);
  }
}, 600000);
