// Social life over months of the world (opt-in, slow): how many friends, enemies and rivals people have, wellbeing,
// goals, how many bonds the world keeps, the time a day takes and the save's size.
// SOCIAL=1 npx vitest run src/career/socialrun.test.ts  [MONTHS=12 SEEDS=7]
import { expect, it } from 'vitest';
import { WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondsOf, kindOf } from '../world/people';
import { moodOf } from './socialLife';
import { begin, day } from './testkit';
import { relationsList, relLabel } from './relations';
import { MOOD_FX } from './tuning';

function census(c: ReturnType<typeof begin>): string {
  const P = activeWorld().people!;
  const live = WRESTLERS.filter((w) => !c.people[w.id]?.retired && !w.id.startsWith('__'));
  const n = { friend: 0, best_friend: 0, rival: 0, enemy: 0, bonds: 0, none: 0 };
  for (const w of live) {
    const mine = bondsOf(P, w.id);
    n.bonds += mine.length;
    if (!mine.some((b) => { const k = kindOf(b.bond, c.today); return k === 'friend' || k === 'best_friend'; })) n.none++;
    for (const b of mine) { const k = kindOf(b.bond, c.today); if (k) n[k]++; }
  }
  const moods = live.map((w) => moodOf(w.id)).sort((a, b) => a - b);
  const q = (f: number) => moods[Math.floor(f * (moods.length - 1))];
  const goals: Record<string, number> = {};
  for (const w of live) { const g = P.lives?.[w.id]?.goal?.kind ?? '-'; goals[g] = (goals[g] ?? 0) + 1; }
  const per = (x: number) => (x / live.length).toFixed(2);
  const low = moods.filter((m) => m <= MOOD_FX.low).length, high = moods.filter((m) => m >= MOOD_FX.high).length;
  return [
    `  ${live.length} wrestlers · ${Object.keys(P.bonds).length} bonds (${per(n.bonds)} each) · each: friends ${per(n.friend)} best ${per(n.best_friend)} rivals ${per(n.rival)} enemies ${per(n.enemy)} · no friend ${n.none}`,
    `  wellbeing: 10% ${q(0.1)} · 25% ${q(0.25)} · median ${q(0.5)} · 75% ${q(0.75)} · 90% ${q(0.9)} · lowest ${moods[0]} highest ${moods.at(-1)} · at or under ${MOOD_FX.low} ${low} · at or over ${MOOD_FX.high} ${high}`,
    `  goals ${JSON.stringify(goals)}`,
    `  save: people ${(JSON.stringify(P).length / 1024).toFixed(0)} KB (bonds ${(JSON.stringify(P.bonds).length / 1024).toFixed(0)} KB) · whole world ${(JSON.stringify(activeWorld()).length / 1024).toFixed(0)} KB`,
  ].join('\n');
}

it.skipIf(!process.env.SOCIAL)('social life over months of the world', async () => {
  const months = Number(process.env.MONTHS ?? 12);
  const seeds = (process.env.SEEDS ?? '7').split(',').map(Number);
  for (const seed of seeds) {
    const c = begin('@indie', seed);
    const out: string[] = [`seed ${seed}`, 'start', census(c)];
    const mine = () => relationsList(c).slice(0, 8).map((r) => `${r.id.slice(0, 14)} ${relLabel(c, r.id)} ${r.r.v}/${r.r.respect}/${r.r.fam}`).join(' · ');
    out.push(`  you: ${mine()} · wellbeing ${moodOf(c.player)}`);
    for (let m = 1; m <= months; m++) {
      const t = performance.now();
      for (let i = 0; i < 30; i++) await day(c);
      const ms = (performance.now() - t) / 30;
      if (m % 3 === 0 || m === months) {
        out.push(`month ${m}: ${ms.toFixed(1)} ms/day`, census(c));
        out.push(`  you: ${mine()} · wellbeing ${moodOf(c.player)}`);
      }
    }
    console.log(out.join('\n'));
    expect(Object.keys(activeWorld().people!.bonds).length).toBeGreaterThan(0);
  }
}, 3_600_000);
