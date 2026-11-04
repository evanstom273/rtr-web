// Title rhythm and stability over simulated years, by title class (balance sheet section 14).
// Opt-in (slow): TITLE_STATS=1 npx vitest run src/career/titlestats.test.ts  [DAYS=730 LABEL=...]
import { it } from 'vitest';
import { findWrestler, globalScore, PROMOTIONS, TITLES } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { applyBout, finishDay, myBoutToday, showsOn, startCareer } from './index';
import type { SimJob, SimOut } from './sim';

const quick = async (jobs: SimJob[]): Promise<SimOut[]> => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const pa = globalScore(a) / (globalScore(a) + globalScore(b));
  return { key: j.key, winner: (j.seed % 1000) / 1000 < pa ? 'you' : 'them', finish: 'PINFALL', t: 600, stars: 3, stats: { you: {} as never, them: {} as never } };
});

const cls = (id: string) => {
  if (id.startsWith('ARISE_')) return 'alliance';
  const p = PROMOTIONS.find((x) => x.titles.includes(id));
  if (!p) return '?';
  if (p.initials === 'TIS') return TITLES.find((t) => t.id === id)?.region ? 'regional' : 'indie';
  return p.titles[0] === id ? 'world' : 'secondary';
};

it.skipIf(!process.env.TITLE_STATS)('title stats', async () => {
  const days = Number(process.env.DAYS ?? 730);
  const agg: Record<string, { titles: Set<string>; bouts: number; changes: number; retained: number; plannedKept: number; planned: number; reigns: number[]; gaps: number[] }> = {};
  for (const seed of [7, 11, 23]) {
    const w = setWorld(freshWorld(seed));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed });
    w.career = c;
    const lastMatch: Record<string, string> = {};
    const reignStart: Record<string, string> = Object.fromEntries(TITLES.map((t) => [t.id, c.today]));
    for (let i = 0; i < days; i++) {
      const shows = showsOn(c, c.today);
      const mine = myBoutToday(c);
      if (mine) applyBout(c, mine.show, mine.index, (await quick([{ key: 'mine', seed: i, you: mine.bout.a, them: mine.bout.b, rules: {} }]))[0]!, true);
      await finishDay(c, quick);
      for (const s of shows) for (const b of s.card ?? []) {
        if (!b.title || !b.result) continue;
        const k = cls(b.title);
        const g = (agg[k] ??= { titles: new Set(), bouts: 0, changes: 0, retained: 0, plannedKept: 0, planned: 0, reigns: [], gaps: [] });
        g.titles.add(`${seed}:${b.title}`);
        g.bouts++;
        if (lastMatch[b.title]) g.gaps.push((Date.parse(s.date) - Date.parse(lastMatch[b.title]!)) / 864e5);
        lastMatch[b.title] = s.date;
        if (b.result.newChamp) {
          g.changes++;
          g.reigns.push((Date.parse(s.date) - Date.parse(reignStart[b.title]!)) / 864e5);
          reignStart[b.title] = s.date;
        } else g.retained++;
        if (b.planned) { g.planned++; if (b.planned === b.result.winner) g.plannedKept++; }
      }
    }
  }
  const years = days / 365;
  const rows: string[] = [];
  for (const [k, g] of Object.entries(agg)) {
    const n = g.titles.size;
    const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);
    rows.push(`${k.padEnd(9)} titles ${n} · matches/yr ${(g.bouts / n / years).toFixed(1)} · changes/yr ${(g.changes / n / years).toFixed(2)} · champion wins ${(100 * g.retained / g.bouts).toFixed(0)}% · plan kept ${(100 * g.plannedKept / Math.max(1, g.planned)).toFixed(0)}% · gap median ${med(g.gaps)}d (max ${Math.max(0, ...g.gaps)}) · completed reign median ${med(g.reigns).toFixed(0)}d`);
  }
  console.log(`\n${process.env.LABEL ?? 'current'} (${days} days × 3 worlds)\n${rows.join('\n')}`);
}, 600000);
