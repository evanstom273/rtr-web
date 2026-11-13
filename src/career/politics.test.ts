// Politics (Lyra's relationships redesign, stage 5): chemistry in the ring, enemies who won't put you over, the locker
// room and its leaders, cliques, badmouthing, signings pulled by friends and partners, bookers who like you.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bringBack } from './cut.testkit';
import { rosterOf, WRESTLERS, type Wrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondOf, bookerOf, ensureBond } from '../world/people';
import { applyBout, boutRules } from './career';
import { movePatience, patienceOf } from './patience';
import { cliqueOf, cliquesOf, pull, standingOf } from './politics';
import { replyTo } from './mail';
import type { SimOut } from './sim';
import { begin, day, quick } from './testkit';
import { CHEM, ROOM } from './tuning';
import type { Career, Show } from './types';

// The big cut hid this; the tests bring it back so the code keeps working.
let putBack = (): void => {};
beforeEach(() => { putBack = bringBack(); });
afterEach(() => putBack());

const P = () => activeWorld().people!;
const set = (c: Career, a: string, b: string, la: number, lb: number, ra = 0, rb = 0, f = 50) => {
  const x = ensureBond(P(), a, b, c.today);
  if (x.a === a) { x.la = la; x.lb = lb; x.ra = ra; x.rb = rb; } else { x.lb = la; x.la = lb; x.rb = ra; x.ra = rb; }
  x.f = f;
  return x;
};
const out = (winner: 'you' | 'them', stars = 3): SimOut => ({ key: 'x', winner, finish: 'PINFALL', t: 600, stars, stats: { you: {} as never, them: {} as never } });

describe('politics', () => {
  it('chemistry: people who rate and like each other have better matches; enemies work stiff', () => {
    const c = begin('jamie_mercer', 7);
    const [a, b, d, e] = WRESTLERS.filter((w) => w.id !== c.player).slice(0, 4) as [Wrestler, Wrestler, Wrestler, Wrestler];
    set(c, a.id, b.id, 70, 70, 80, 80);
    set(c, d.id, e.id, -80, 10);
    const show = Object.values(c.shows)[0]!;
    expect(boutRules(c, show, { a: a.id, b: b.id }, a.id, b.id, false).chemistry ?? 0).toBeGreaterThan(0);
    expect(boutRules(c, show, { a: d.id, b: e.id }, d.id, e.id, false).chemistry ?? 0).toBeLessThan(0);
  });

  it('someone booked to lose to a person they can’t stand won’t make it easy', () => {
    const c = begin('jamie_mercer', 7);
    const [a, b] = WRESTLERS.filter((w) => w.id !== c.player).slice(0, 2) as [Wrestler, Wrestler];
    const show = Object.values(c.shows)[0]!;
    const plain = boutRules(c, show, { a: a.id, b: b.id, planned: a.id }, a.id, b.id, true).booked!.bonus;
    set(c, b.id, a.id, -90, 0);
    const hated = boutRules(c, show, { a: a.id, b: b.id, planned: a.id }, a.id, b.id, true).booked!.bonus;
    expect(hated).toBeCloseTo(plain * (1 - CHEM.refuseNudge));
  });

  it('the locker room: putting someone over earns standing, going off-script costs it', () => {
    const c = begin('jamie_mercer', 7);
    const promo = c.people[c.player]!.contract!.promo;
    const opp = rosterOf(promo).find((w) => w.id !== c.player)!;
    const show: Show = { id: 'lr1', promo, name: 'Weekly', kind: 'weekly', date: c.today, country: 'USA', city: 'Chicago', region: 'northAmerica', done: false, card: [{ a: c.player, b: opp.id, planned: opp.id }] };
    c.shows[show.id] = show;
    applyBout(c, show, 0, out('them'), true, 'played');
    expect(standingOf(c, promo)).toBe(ROOM.start + ROOM.putOver);
    const s2: Show = { ...show, id: 'lr2', card: [{ a: c.player, b: opp.id, planned: opp.id }] };
    c.shows[s2.id] = s2;
    applyBout(c, s2, 0, out('you'), true, 'played');
    expect(standingOf(c, promo)).toBeLessThan(ROOM.start);
  });

  it('cliques form among friends on a roster; you’re asked in when you’re close to a couple of them', async () => {
    const c = begin('jamie_mercer', 7);
    const promo = c.people[c.player]!.contract!.promo;
    const roster = rosterOf(promo).filter((w) => w.id !== c.player).slice(0, 4);
    for (const x of roster) for (const y of roster) if (x.id < y.id) set(c, x.id, y.id, 80, 80, 40, 40, 80);
    for (const x of roster.slice(0, 2)) set(c, c.player, x.id, 70, 70, 30, 30, 70);
    for (let i = 0; i < 31 && !cliquesOf(c, promo).length; i++) await day(c, quick, 'simmed');
    for (let i = 0; i < 31 && !c.letters.some((l) => l.replies?.some((r) => r.id === 'clique_yes')); i++) await day(c, quick, 'simmed');
    expect(cliquesOf(c, promo).length).toBeGreaterThan(0);
    const inv = c.letters.find((l) => l.replies?.some((r) => r.id === 'clique_yes'));
    if (inv) {
      const before = standingOf(c, promo);
      replyTo(c, inv.id, 'clique_yes');
      expect(cliqueOf(c, c.player)).toBeTruthy();
      expect(standingOf(c, promo)).toBeGreaterThan(before);
    }
  });

  it('enemies badmouth you to bookers who like them; a booker who likes you gives you more rope', async () => {
    const c = begin('jamie_mercer', 7);
    const promo = c.people[c.player]!.contract!.promo;
    const bk = bookerOf(P(), promo)!;
    const enemy = rosterOf(promo).find((w) => w.id !== c.player)!;
    set(c, enemy.id, c.player, -90, -20);
    set(c, bk.id, enemy.id, 60, 0);
    for (let i = 0; i < 31; i++) await day(c, quick, 'simmed');
    expect(bondOf(P(), bk.id, c.player)!.log!.some((l) => l.t.includes('badmouthing'))).toBe(true);
    // Second chances: the same knock costs less with a booker who likes you.
    const d = begin('jamie_mercer', 11);
    const promo2 = d.people[d.player]!.contract!.promo;
    const bk2 = bookerOf(P(), promo2)!;
    const p0 = patienceOf(d, promo2);
    movePatience(d, promo2, -10, 'test');
    const cold = p0 - patienceOf(d, promo2);
    set(d, bk2.id, d.player, 100, 0);
    const p1 = patienceOf(d, promo2);
    movePatience(d, promo2, -10, 'test');
    expect(p1 - patienceOf(d, promo2)).toBeLessThan(cold);
  });

  it('signings lean towards friends and a partner on the roster, away from enemies', () => {
    const c = begin('jamie_mercer', 7);
    const w = WRESTLERS.find((x) => x.promotion === 'TIS' && x.id !== c.player)!;
    const [f1, f2] = rosterOf('VWF').filter((x) => x.id !== c.player) as [Wrestler, Wrestler];
    const base = pull(c, w, 'VWF');
    set(c, w.id, f1.id, 70, 70);
    expect(pull(c, w, 'VWF')).toBeGreaterThan(base);
    bondOf(P(), w.id, f1.id)!.love = { st: 'married', since: c.today };
    const loved = pull(c, w, 'VWF');
    set(c, w.id, f2.id, -90, -90);
    expect(pull(c, w, 'VWF')).toBeLessThan(loved);
  });
});
