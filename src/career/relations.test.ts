import { describe, expect, it } from 'vitest';
import { TITLES, WRESTLERS } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { addDays } from './dates';
import { affinity, applyBout, memoryOf, patienceOf, relLabel, startCareer, trust } from './index';
import { indieKey } from './patience';
import type { SimOut } from './sim';
import { who } from './testkit';
import type { Career, Show } from './types';

function begin(player = '@indie', seed = 3): Career {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player: who(player), today: '2026-11-03', seed });
  w.career = c;
  return c;
}

const out = (winner: 'you' | 'them', stars = 3): SimOut => ({ key: 'mine', winner, finish: 'PINFALL', t: 600, stars, stats: { you: {} as never, them: {} as never } });

/** An indie show today with you against a champion, the promoter planning the champion to retain. */
function titleNight(c: Career, name: string): { show: Show; champ: string } {
  const t = TITLES.find((x) => x.id === 'WORLD_INDEPENDENT_CHAMPIONSHIP')!;
  const show: Show = { id: `t-${name}`, promo: 'TIS', name, kind: 'indie', date: c.today, country: 'UK', city: 'London', region: 'europe', card: [], done: false };
  show.card!.push({ a: t.holder!, b: c.player, title: t.id, planned: t.holder! });
  c.shows[show.id] = show;
  return { show, champ: t.holder! };
}

describe('promoter memory and relationships', () => {
  it('winning against the plan in a match you played is off-script; simmed, it’s an upset with no penalty', () => {
    const c = begin();
    const rep = c.people[c.player]!.rep;
    const a = titleNight(c, 'Ring of Fire');
    applyBout(c, a.show, 0, out('you'), false, 'played');
    expect(c.history[0]!.planned).toBe('off-script');
    expect(c.people[c.player]!.rep).toBeLessThan(rep);
    expect(memoryOf(c, indieKey('Ring of Fire')).offScript).toBe(1);

    const d = begin();
    const rep2 = d.people[d.player]!.rep;
    const b = titleNight(d, 'Ring of Fire');
    applyBout(d, b.show, 0, out('you'), false, 'simmed');
    expect(d.history[0]!.planned).toBe('upset');
    expect(d.people[d.player]!.rep).toBeGreaterThanOrEqual(rep2);
    expect(d.people[d.player]!.titleBanUntil).toBeUndefined();
    expect(memoryOf(d, indieKey('Ring of Fire')).offScript).toBe(0);
  });

  it('losing when you were booked to win is failing to deliver: a small knock, not off-script', () => {
    const c = begin();
    const a = titleNight(c, 'Light Up the Night');
    a.show.card![0]!.planned = c.player;
    applyBout(c, a.show, 0, out('them'), false, 'played');
    expect(c.history[0]!.planned).toBe('botched');
    expect(patienceOf(c, indieKey('Light Up the Night'))).toBe(70 - 5);
    expect(c.people[c.player]!.titleBanUntil).toBeUndefined();
  });

  it('every promoter remembers for themselves: crossing one doesn’t make the others distrust you', () => {
    const c = begin();
    const a = titleNight(c, 'Ring of Fire');
    applyBout(c, a.show, 0, out('you'), false, 'played');
    expect(trust(c, indieKey('Ring of Fire'))).toBeLessThan(50);
    expect(trust(c, indieKey('Heart of the Matter'))).toBe(50);
    // Keep to someone else's plan a few times and they come to trust you.
    for (let i = 0; i < 4; i++) {
      c.today = addDays(c.today, 1);
      const t = TITLES.find((x) => x.id === 'WORLD_INDEPENDENT_CHAMPIONSHIP')!;
      const opp = WRESTLERS.find((w) => w.promotion === 'TIS' && w.id !== c.player && w.id !== t.holder)!;
      const show: Show = { id: `k${i}`, promo: 'TIS', name: 'Heart of the Matter', kind: 'indie', date: c.today, country: 'UK', city: 'Leeds', region: 'europe', card: [{ a: opp.id, b: c.player }], done: false };
      c.shows[show.id] = show;
      applyBout(c, show, 0, out('them', 4.25), false);
    }
    expect(trust(c, indieKey('Heart of the Matter'))).toBeGreaterThan(50);
  });

  it('relationships move with matches: a great match warms them, going off-script on them sours it', () => {
    const c = begin();
    const a = titleNight(c, 'Ring of Fire');
    applyBout(c, a.show, 0, out('you', 2), false, 'played');
    expect(affinity(c, a.champ)).toBeLessThan(0);
    const d = begin();
    const t = TITLES.find((x) => x.id === 'WORLD_INDEPENDENT_CHAMPIONSHIP')!;
    const opp = WRESTLERS.find((w) => w.promotion === 'TIS' && w.id !== d.player && w.id !== t.holder)!;
    const show: Show = { id: 'g', promo: 'TIS', name: 'Pack the House', kind: 'indie', date: d.today, country: 'UK', city: 'Leeds', region: 'europe', card: [{ a: opp.id, b: d.player }], done: false };
    d.shows[show.id] = show;
    applyBout(d, show, 0, out('them', 4.5), false);
    expect(affinity(d, opp.id)).toBeGreaterThan(0);
    expect(relLabel(d, opp.id)).toBe('Colleague');
  });
});
