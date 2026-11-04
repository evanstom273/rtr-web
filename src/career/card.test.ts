// Booker mode, stage 2 (Lyra's design): the card you book, finishes, segments, the whole show judged, watching a
// match, your staff booking what you leave, and booking yourself.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rosterOf, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondOf } from '../world/people';
import { autoBook, bookerPool, cardIssues, rateShow, setCard, watchBout } from './card';
import { boutRules, scripted } from './career';
import { foundPromotion, takeRole } from './company';
import { standingOf } from './politics';
import { rumoursOf } from './rumours';
import type { SimOut } from './sim';
import { begin, day, quick } from './testkit';
import { FEATURES } from './tuning';
import type { Career, Show } from './types';

let was = false;
beforeEach(() => { was = FEATURES.booker; FEATURES.booker = true; });
afterEach(() => { FEATURES.booker = was; });

const out = (winner: 'you' | 'them' | null, stars = 3): SimOut => ({ key: 'x', winner, finish: 'PINFALL', t: 600, stars, stats: { you: {} as never, them: {} as never } });
const mine = (c: Career, promo: string): Show => Object.values(c.shows).filter((s) => s.promo === promo && !s.done && s.date > c.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
const own = (c: Career) => { c.money = 20_000; foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 5000, night: { every: 'weekly', day: 'Saturday' } }); return mine(c, 'NLW'); };

describe('booker mode: the card', () => {
  it('a booked DQ, count-out or no contest is how it ends; cheating leans on the engine', () => {
    const c = begin('@indie', 7);
    const [a, b] = WRESTLERS.filter((w) => w.id !== c.player).slice(0, 2);
    expect(scripted({ a: a!.id, b: b!.id, planned: b!.id, finish: 'dq' }, out('you'), true)).toMatchObject({ winner: 'them', finish: 'DISQUALIFICATION' });
    expect(scripted({ a: a!.id, b: b!.id, planned: a!.id, finish: 'countout' }, out('them'), true)).toMatchObject({ winner: 'you', finish: 'COUNT_OUT' });
    expect(scripted({ a: a!.id, b: b!.id, finish: 'nocontest' }, out('you'), true)).toMatchObject({ winner: null, finish: 'NO_CONTEST' });
    expect(scripted({ a: a!.id, b: b!.id, planned: a!.id, finish: 'clean' }, out('them'), true).winner).toBe('them');
    const show = Object.values(c.shows)[0]!;
    expect(boutRules(c, show, { a: a!.id, b: b!.id, planned: a!.id, finish: 'cheat' }, a!.id, b!.id, true).booked).toMatchObject({ side: 'you', cheat: true });
  });

  it('you book the card: free agents in the region, rules about who and what', () => {
    const c = begin('@indie', 7);
    const show = own(c);
    const pool = bookerPool(c, show);
    expect(pool[0]!.id).toBe(c.player);
    const men = pool.filter((w) => w.gender === 'MALE' && w.id !== c.player);
    const woman = pool.find((w) => w.gender === 'FEMALE');
    expect(men.length).toBeGreaterThan(3);
    expect(setCard(c, show.id, [{ a: men[0]!.id, b: men[0]!.id }], [])).toContain('themselves');
    expect(setCard(c, show.id, [{ a: men[0]!.id, b: men[1]!.id }, { a: men[0]!.id, b: men[2]!.id }], [])).toContain('twice');
    if (woman) expect(setCard(c, show.id, [{ a: men[0]!.id, b: woman.id }], [])).toContain('men against men');
    expect(setCard(c, show.id, [{ a: men[0]!.id, b: men[1]!.id, finish: 'dq' }], [])).toContain('winner');
    expect(setCard(c, show.id, [{ a: men[0]!.id, b: men[1]!.id, planned: men[1]!.id, finish: 'dq' }, { a: men[2]!.id, b: men[3]!.id, planned: men[2]!.id }],
      [{ kind: 'promo', who: [men[2]!.id], after: -1 }, { kind: 'beatdown', who: [men[1]!.id], after: 0 }])).toContain('takes 2');
    expect(setCard(c, show.id, [{ a: men[0]!.id, b: men[1]!.id, planned: men[1]!.id, finish: 'dq' }, { a: men[2]!.id, b: men[3]!.id, planned: men[2]!.id }],
      [{ kind: 'promo', who: [men[2]!.id], after: -1 }, { kind: 'runin', who: [men[0]!.id], after: 0 }])).toContain('booked');
    expect(show.booked).toBe('player');
    expect(cardIssues(c, show)).not.toContain('No matches yet.');
  });

  it('a title match needs the champion; someone else’s promotion is theirs to book', () => {
    const c = begin('@indie', 7);
    takeRole(c, 'IVW', 'booker');
    const show = mine(c, 'IVW');
    const t = TITLES.find((x) => x.id === 'IVW_KING_OF_EUROPE')!;
    const others = rosterOf('IVW').filter((w) => w.id !== t.holder && w.gender === 'MALE');
    expect(setCard(c, show.id, [{ a: others[0]!.id, b: others[1]!.id, title: t.id }], [])).toContain('champion');
    expect(setCard(c, show.id, [{ a: others[0]!.id, b: t.holder!, title: t.id, planned: t.holder! }], [])).toContain('booked');
    expect(setCard(c, Object.values(c.shows).find((s) => s.promo === 'VWF' && !s.done)!.id, [], [])).toContain('don’t book');
  });

  it('left alone, your staff book it the night before; the show’s judged and you hear how it went', async () => {
    const c = begin('@indie', 7);
    const show = own(c);
    for (let i = 0; i < 12 && !show.card; i++) await day(c, quick, 'simmed');
    expect(show.card?.length).toBeGreaterThan(0);
    expect(show.booked).toBe('staff');
    expect(show.segments?.length).toBeGreaterThan(0);
    for (let i = 0; i < 3 && !show.done; i++) await day(c, quick, 'simmed');
    expect(show.done).toBe(true);
    expect(show.rating!.score).toBeGreaterThan(0);
    expect(show.segments!.every((g) => g.score !== undefined)).toBe(true);
    expect(c.letters.some((l) => l.subject.startsWith(`${show.name}: `))).toBe(true);
    expect(activeWorld().history.shows.find((s) => s.id === show.id)?.rating).toBe(show.rating!.score);
  });

  it('the whole show: the main event matters most, and a run of screwy finishes costs', () => {
    const c = begin('@indie', 7);
    const show = own(c);
    const men = bookerPool(c, show).filter((w) => w.gender === 'MALE' && w.id !== c.player);
    const res = (stars: number, finish = 'PINFALL') => ({ winner: null, finish, t: 600, stars }) as never;
    show.card = [{ a: men[0]!.id, b: men[1]!.id, result: res(3) }, { a: men[2]!.id, b: men[3]!.id, result: res(3) }, { a: men[4]!.id, b: men[5]!.id, result: res(4.5) }];
    const good = rateShow(c, show).score;
    show.card = [{ a: men[0]!.id, b: men[1]!.id, result: res(4.5) }, { a: men[2]!.id, b: men[3]!.id, result: res(3, 'DISQUALIFICATION') }, { a: men[4]!.id, b: men[5]!.id, result: res(3, 'NO_CONTEST') }];
    const bad = rateShow(c, show);
    expect(good).toBeGreaterThan(bad.score);
    expect(bad.notes.join(' ')).toMatch(/main event|screwy/);
  });

  it('you can watch a match on the night: it’s wrestled there and then', async () => {
    const c = begin('@indie', 7);
    const show = own(c);
    expect(autoBook(c, show.id)).toContain('booked');
    const i = show.card!.findIndex((b) => b.a !== c.player && b.b !== c.player);
    expect(watchBout(c, show.id, i)).toContain('on the night');
    while (c.today < show.date) await day(c, quick, 'simmed');
    const r = watchBout(c, show.id, i);
    expect(typeof r).toBe('object');
    expect((r as { log: unknown[] }).log.length).toBeGreaterThan(5);
    expect(show.card![i]!.result).toBeTruthy();
    expect(watchBout(c, show.id, i)).toContain('already');
  });

  it('booking yourself to win: the room and your opponent mind; enough of it and people talk', async () => {
    const c = begin('@indie', 7);
    own(c);
    const before = standingOf(c, 'NLW');
    for (let n = 0; n < 3; n++) {
      const show = mine(c, 'NLW');
      const opp = bookerPool(c, show).find((w) => w.id !== c.player && w.gender === WRESTLERS.find((x) => x.id === c.player)!.gender)!;
      expect(setCard(c, show.id, [{ a: c.player, b: opp.id, planned: c.player }], [])).toContain('booked');
      while (c.today < show.date) await day(c, quick, 'simmed');
      // You win (as if you'd played it the way you booked it).
      const { applyBout } = await import('./career');
      const idx = show.card!.findIndex((b) => b.a === c.player);
      applyBout(c, show, idx, out('you', 3), true, 'played');
      await day(c, quick, 'simmed');
      expect(bondOf(activeWorld().people!, opp.id, c.player)!.log!.some((l) => l.t.includes('Booked themselves to beat me'))).toBe(true);
    }
    expect(standingOf(c, 'NLW')).toBeLessThan(before);
    expect(rumoursOf(c).some((r) => r.kind === 'glory' && r.a === c.player)).toBe(true);
  });
});
