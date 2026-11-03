import { describe, expect, it } from 'vitest';
import { PROMOTIONS, TITLES, findWrestler } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { acceptLetter, applyBout, finishDay, myBoutToday, runToday, showsOn, startCareer } from './index';
import type { SimJob, SimOut } from './sim';

/** A stand-in for the engine: instant results from popularity and the seed, so a year runs in a second. */
const quick = async (jobs: SimJob[]): Promise<SimOut[]> => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const h = (j.seed % 1000) / 1000;
  const pa = a.popularity.global / (a.popularity.global + b.popularity.global);
  const zero = { movesTried: 20, movesLanded: 12, finTried: 1, finHit: 1, sigTried: 1, sigHit: 1, reversalTries: 5, reversalWins: 2, kickouts: 2, pinTries: 3 };
  return { key: j.key, winner: h < pa ? 'you' : 'them', finish: 'PINFALL', t: 600 + (j.seed % 600), stars: 2 + (j.seed % 30) / 10, stats: { you: zero, them: zero } };
});

describe('title matches', () => {
  // Cards are drawn a week out, so a title booked twice in that week would put a former champion in
  // the second match: a "new champion" who already had it, or a champion who loses it without being there.
  for (const [player, seed] of [['jamie_mercer', 11], ['bishop_blackridge', 11], ['ama_quaye', 5], ['jamie_mercer', 23]] as const) {
    it(`always have the champion in them when they're wrestled (${player}, seed ${seed})`, async () => {
      const w = setWorld(freshWorld(seed));
      const c = startCareer({ player, today: '2026-11-03', seed });
      w.career = c;
      const bad: string[] = [];
      let bouts = 0;
      for (let i = 0; i < 365; i++) {
        for (const l of c.letters) if (!l.done && l.action?.type === 'indie') acceptLetter(c, l);
        const holder = new Map(TITLES.map((t) => [t.id, t.holder]));
        const shows = showsOn(c, c.today);
        const mine = myBoutToday(c);
        if (mine) applyBout(c, mine.show, mine.index, (await quick([{ key: 'mine', seed: i * 7, you: mine.bout.a, them: mine.bout.b, rules: {} }]))[0]!, true);
        await finishDay(c, quick);
        // Replay the night's title matches in the order they were settled: yours, then the cards.
        for (const b of [...(mine ? [mine.bout] : []), ...shows.flatMap((s) => s.card ?? []).filter((x) => x !== mine?.bout)]) {
          if (!b.title || !b.result) continue;
          bouts++;
          const h = holder.get(b.title);
          if (h !== b.a && h !== b.b) bad.push(`${b.title}: ${b.a} v ${b.b}, champion ${h}`);
          if (b.result.newChamp) holder.set(b.title, b.result.winner);
        }
      }
      expect(bouts).toBeGreaterThan(50);
      expect(bad).toEqual([]);
    }, 60000);
  }

  it('are settled once, even if the rest of the night is still running when you move the day on', async () => {
    const w = setWorld(freshWorld(11));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 11 });
    w.career = c;
    const later = async (jobs: SimJob[]) => { const o = await quick(jobs); await new Promise((r) => setTimeout(r, 1)); return o; };
    let nights = 0;
    for (let i = 0; i < 150; i++) {
      const mine = myBoutToday(c);
      if (!mine) { await finishDay(c, later); continue; }
      applyBout(c, mine.show, mine.index, (await quick([{ key: 'mine', seed: i, you: mine.bout.a, them: mine.bout.b, rules: {} }]))[0]!, true);
      const fatigue = new Map(Object.entries(c.people).map(([id, p]) => [id, p.fatigue]));
      const wrestled = showsOn(c, c.today).flatMap((s) => s.card ?? []).filter((b) => !b.result).flatMap((b) => [b.a, b.b]);
      // What the app does after your match: the rest of the night runs in the background, and you can press advance.
      await Promise.all([runToday(c, later), finishDay(c, later)]);
      nights++;
      // One match's worth of fatigue each (less the night's recovery), not two.
      for (const id of wrestled) expect(c.people[id]!.fatigue - (fatigue.get(id) ?? 0), id).toBeLessThanOrEqual(20);
    }
    expect(nights).toBeGreaterThan(10);
  }, 60000);

  it('drawn before the title changed hands (older saves) go ahead as ordinary matches: no new champion, no letter', () => {
    const w = setWorld(freshWorld(3));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 3 });
    w.career = c;
    const t = TITLES.find((x) => x.id === 'OPEN_CHALLENGE_TITLE')!;
    const champ = t.holder!;
    const [x, y] = ['seth_quarry', 'harlan_wren'];
    const show = Object.values(c.shows).find((s) => s.date === c.today && s.card)!;
    show.card!.push({ a: x, b: y, title: t.id, planned: x });
    const news = c.letters.length;
    applyBout(c, show, show.card!.length - 1, { key: 'k', winner: 'you', finish: 'PINFALL', t: 600, stars: 3, stats: { you: {} as never, them: {} as never } }, true);
    expect(t.holder).toBe(champ);
    expect(show.card!.at(-1)!.title).toBeUndefined();
    expect(show.card!.at(-1)!.result!.newChamp).toBeUndefined();
    expect(c.letters.length).toBe(news);
  });

  it('defend regularly without changing hands constantly: a year, by title class', async () => {
    const w = setWorld(freshWorld(19));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 19 });
    w.career = c;
    const cls = (id: string) => (id.startsWith('ARISE_') ? 'alliance' : PROMOTIONS.find((p) => p.titles.includes(id))?.initials === 'TIS' ? 'indie'
      : PROMOTIONS.find((p) => p.titles[0] === id) ? 'world' : 'secondary');
    const n: Record<string, { bouts: number; changes: number }> = {};
    for (let i = 0; i < 365; i++) {
      const shows = showsOn(c, c.today);
      const mine = myBoutToday(c);
      if (mine) applyBout(c, mine.show, mine.index, (await quick([{ key: 'mine', seed: i, you: mine.bout.a, them: mine.bout.b, rules: {} }]))[0]!, true);
      await finishDay(c, quick);
      for (const b of shows.flatMap((s) => s.card ?? [])) if (b.title && b.result) {
        const g = (n[cls(b.title)] ??= { bouts: 0, changes: 0 });
        g.bouts++;
        if (b.result.newChamp) g.changes++;
      }
    }
    const per = (k: string, count: number) => ({ defences: n[k]!.bouts / count, changes: n[k]!.changes / count });
    const titles = (k: string) => TITLES.filter((t) => cls(t.id) === k).length;
    const world = per('world', titles('world')), secondary = per('secondary', titles('secondary'));
    // World titles: a defence every month or so, about one change a year. Secondary: busier, still steady.
    expect(world.defences).toBeGreaterThan(5);
    expect(world.changes).toBeLessThan(1.6);
    expect(secondary.defences).toBeGreaterThan(7);
    expect(secondary.changes / secondary.defences).toBeLessThan(0.25);
  }, 60000);
});
