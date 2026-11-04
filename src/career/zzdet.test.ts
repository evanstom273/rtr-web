import { it } from 'vitest';
import { findWrestler, globalScore } from '../data/rtr';
import { activeWorld, freshWorld, setWorld } from '../world/world';
import { answerEvent, applyBout, finishDay, myBoutToday, startCareer } from './index';
import { seededRng } from '../engine/rng';
import type { SimJob, SimOut } from './sim';
import type { Career } from './types';
const quick = async (jobs: SimJob[]): Promise<SimOut[]> => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const pa = globalScore(a) / (globalScore(a) + globalScore(b));
  return { key: j.key, winner: (j.seed % 1000) / 1000 < pa ? 'you' : 'them', finish: 'PINFALL', t: 600, stars: 3, stats: { you: {} as never, them: {} as never } };
});
function begin(player = 'jamie_mercer', seed = 7): Career {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player, today: '2026-11-03', seed });
  w.career = c;
  return c;
}
async function day(c: Career, i: number): Promise<void> {
  const mine = myBoutToday(c);
  if (mine) applyBout(c, mine.show, mine.index, (await quick([{ key: 'mine', seed: i, you: mine.bout.a, them: mine.bout.b, rules: {} }]))[0]!, true);
  await finishDay(c, quick);
}
it('det', async () => {
  const snaps: string[][] = [];
  for (let r = 0; r < 2; r++) {
    const c = begin('jamie_mercer', 7);
    const pick = seededRng(7);
    const s: string[] = [];
    for (let i = 0; i < 365; i++) {
      await day(c, i);
      for (const id of Object.keys(c.events?.open ?? {})) {
        if (pick() < 0.15) continue;
        const l = c.letters.find((y) => y.id === id)!;
        const opts = l.action?.type === 'event' ? l.action.options.filter((o) => !o.blocked) : [];
        if (opts.length) answerEvent(c, id, opts[Math.floor(pick() * opts.length)]!.id);
      }
      const P = activeWorld().people!;
      s.push(`${c.today} bonds ${JSON.stringify(P.bonds).length} lives ${JSON.stringify(P.lives ?? {})} letters ${c.letters.length} money ${c.money}`);
    }
    snaps.push(s);
  }
  const i = snaps[0]!.findIndex((x, k) => x !== snaps[1]![k]);
  console.log('first diff at', i, '\n', snaps[0]![i]?.slice(0, 300), '\n', snaps[1]![i]?.slice(0, 300));
  if (i > 0) { const a = snaps[0]![i]!, b = snaps[1]![i]!; let k = 0; while (a[k] === b[k]) k++; console.log('at char', k, a.slice(k - 200, k + 100), '\n', b.slice(k - 200, k + 100)); }
}, 600000);
