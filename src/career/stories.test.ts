// Booker mode, stage 3 (Lyra's design): storylines you write and the game keeps score of; turns, alliances and
// betrayals; full control of your titles; tournaments.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROMOTIONS, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { createTitle, cupsOf, renameTitle, retireTitle, roundBouts, setDivision, startCup, titlesOf, unifyTitles, vacateTitle } from './belts';
import { bookerPool, setCard } from './card';
import { foundPromotion, setSchedule } from './company';
import { addDays } from './dates';
import { replyTo } from './mail';
import { formAlliance, setPayoff, startStory, storiesOf, turn, turnsOf } from './stories';
import { begin, day, quick } from './testkit';
import { BELTS, FEATURES, STORY } from './tuning';
import type { Career, Show } from './types';

let was = false;
beforeEach(() => { was = FEATURES.booker; FEATURES.booker = true; });
afterEach(() => { FEATURES.booker = was; });

const next = (c: Career): Show => Object.values(c.shows).filter((s) => s.promo === 'NLW' && !s.done && s.date > c.today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]!;
const own = (c: Career) => { c.money = 20_000; foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 5000, night: { every: 'weekly', day: 'Saturday' } }); };
const men = (c: Career, show: Show): Wrestler[] => bookerPool(c, show).filter((w) => w.gender === 'MALE' && w.id !== c.player);
const toShow = async (c: Career, show: Show) => { while (!show.done) await day(c, quick, 'simmed'); };

describe('booker mode: storylines', () => {
  it('heat builds with what you put on, a quiet week cools it, and cold ends it', async () => {
    const c = begin('@indie', 7);
    own(c);
    const show = next(c);
    const [a, b, x, y] = men(c, show);
    expect(startStory(c, 'NLW', a!.id, b!.id)).toContain('on');
    const f = storiesOf(c, 'NLW')[0]!;
    expect(f.heat).toBeGreaterThanOrEqual(STORY.start);
    setCard(c, show.id, [{ a: x!.id, b: y!.id, planned: x!.id }], [{ kind: 'signing', who: [a!.id, b!.id], after: 0 }]);
    const h0 = f.heat!;
    await toShow(c, show);
    const seg = show.segments![0]!;
    expect(f.heat).toBe(Math.max(0, Math.min(100, Math.round(h0 + (seg.score! - 2) * STORY.segHeat))));
    expect(f.beats![0]!.t).toContain('contract signing');
    // Nothing for weeks (no shows at all): it cools and goes cold.
    setSchedule(c, 'NLW', []);
    for (const s of Object.values(c.shows)) if (s.promo === 'NLW' && !s.done) delete c.shows[s.id];
    f.heat = 8;
    for (let i = 0; i < 16 && !f.done; i++) await day(c, quick, 'simmed');
    expect(f.done).toBe(true);
    expect(f.ended).toBe('cold');
  });

  it('the blow-off pays off by the heat: the winner rides it, and the show rates it', async () => {
    const c = begin('@indie', 7);
    own(c);
    const show = next(c);
    const [a, b] = men(c, show);
    startStory(c, 'NLW', a!.id, b!.id);
    const f = storiesOf(c, 'NLW')[0]!;
    f.heat = 90;
    expect(setPayoff(c, f.id, show.id)).toContain('pays off');
    setCard(c, show.id, [{ a: a!.id, b: b!.id, planned: a!.id }], []);
    expect(show.card![0]!.feud).toBe(f.id);
    const fans0 = a!.fans[show.region];
    await toShow(c, show);
    expect(f.ended).toBe('blowoff');
    if (show.card![0]!.result!.winner === a!.id) expect(a!.fans[show.region]).toBeGreaterThanOrEqual(fans0);
    expect(show.rating!.parts.some(([k]) => k === 'Payoffs')).toBe(true);
  });

  it('turns land when they’re shown; flip-flopping falls flat', async () => {
    const c = begin('@indie', 7);
    own(c);
    const show = next(c);
    const [a, b, d] = men(c, show);
    const to = a!.disposition === 'HEEL' ? 'FACE' : 'HEEL';
    expect(turn(c, 'NLW', a!.id, to)).toContain('turns');
    expect(a!.disposition).toBe(to);
    setCard(c, show.id, [{ a: b!.id, b: d!.id, planned: b!.id }], [{ kind: 'promo', who: [a!.id], after: -1 }]);
    await toShow(c, show);
    expect(turnsOf(c)[0]!.landed).toBe(true);
    expect(c.letters.some((l) => l.subject.includes('turn landed'))).toBe(true);
    // And straight back: the crowd's stopped caring.
    turn(c, 'NLW', a!.id, to === 'HEEL' ? 'FACE' : 'HEEL');
    const s2 = next(c);
    // (Keep them free that night: an indie may have booked them.)
    for (const s of Object.values(c.shows)) if (s.date === s2.date && s.id !== s2.id && s.card) s.card = s.card.filter((x) => x.a !== a!.id && x.b !== a!.id);
    const [p, q] = men(c, s2).filter((w) => w.id !== a!.id);
    expect(setCard(c, s2.id, [{ a: p!.id, b: q!.id, planned: p!.id }], [{ kind: 'promo', who: [a!.id], after: -1 }])).toContain('booked');
    await toShow(c, s2);
    expect(c.letters.some((l) => l.subject.includes('fell flat'))).toBe(true);
  });

  it('an alliance ends in betrayal, and a storyline starts hot', async () => {
    const c = begin('@indie', 7);
    own(c);
    const show = next(c);
    const [a, b, x, y] = men(c, show);
    expect(formAlliance(c, 'NLW', a!.id, b!.id)).toContain('team');
    setCard(c, show.id, [{ a: x!.id, b: y!.id, planned: x!.id }], [{ kind: 'betrayal', who: [a!.id, b!.id], after: 0 }]);
    await toShow(c, show);
    const f = storiesOf(c, 'NLW').find((s) => [s.a, s.b].includes(a!.id) && [s.a, s.b].includes(b!.id))!;
    expect(f).toBeTruthy();
    expect(f.heat!).toBeGreaterThanOrEqual(40);
  });
});

describe('booker mode: titles and tournaments', () => {
  it('create, rename, divisions (a cruiserweight limit), vacate, retire, unify, up to the tier’s limit', () => {
    const c = begin('@indie', 7);
    own(c);
    expect(createTitle(c, 'NLW', { name: 'NLW Championship', gender: 'MALE', division: 'world' })).toContain('vacant');
    expect(createTitle(c, 'NLW', { name: 'NLW Flyweight Title', gender: 'MALE', division: 'cruiser' })).toContain('vacant');
    expect(createTitle(c, 'NLW', { name: 'Third', gender: 'MALE', division: 'midcard' })).toContain(`${BELTS.max.local} titles`);
    const [world, cruiser] = titlesOf('NLW');
    expect(renameTitle(c, world!.id, 'NLW Heavyweight Championship')).toContain('Heavyweight');
    const show = next(c);
    const heavy = men(c, show).find((w) => w.weight > BELTS.cruiserLbs)!;
    const light = men(c, show).find((w) => w.weight <= BELTS.cruiserLbs && w.id !== heavy.id)!;
    expect(setCard(c, show.id, [{ a: heavy.id, b: light.id, title: cruiser!.id }], [])).toContain('cruiserweight limit');
    world!.holder = heavy.id;
    expect(vacateTitle(c, world!.id)).toContain('vacant');
    expect(world!.holder).toBeNull();
    cruiser!.holder = light.id;
    expect(setDivision(c, cruiser!.id, 'open')).toContain('Open');
    expect(unifyTitles(c, world!.id, cruiser!.id)).toContain('unified');
    expect(world!.holder).toBe(light.id);
    expect(cruiser!.retired).toBeTruthy();
    expect(PROMOTIONS.find((p) => p.initials === 'NLW')!.titles).toEqual([world!.id]);
    expect(retireTitle(c, world!.id)).toContain('retired');
    expect(titlesOf('NLW')).toEqual([]);
  });

  it('a four-way tournament over two shows crowns the winner with the vacant title', async () => {
    const c = begin('@indie', 7);
    own(c);
    createTitle(c, 'NLW', { name: 'NLW Championship', gender: 'MALE', division: 'world' });
    const t = titlesOf('NLW')[0]!;
    expect(startCup(c, 'NLW', { name: 'The Crown', size: 4, gender: 'MALE', prize: t.id })).toContain('2 rounds');
    const cup = cupsOf(c, 'NLW')[0]!;
    const [s1, s2] = cup.shows.map((id) => c.shows[id]!);
    expect(roundBouts(c, s1!).length).toBe(2);
    // Your staff book both nights (cup matches first).
    await toShow(c, s1!);
    expect(s1!.card!.filter((b) => b.tourney?.id === cup.id).length).toBe(2);
    expect(cup.won[0]!.filter(Boolean).length).toBe(2);
    await toShow(c, s2!);
    expect(cup.winner).toBeTruthy();
    const final = s2!.card!.find((b) => b.tourney?.id === cup.id)!;
    expect(final.title).toBe(t.id);
    if (final.result!.winner) expect(TITLES.find((x) => x.id === t.id)!.holder).toBe(cup.winner);
    expect(c.letters.some((l) => l.subject.includes('wins the The Crown') || l.subject.includes('The Crown'))).toBe(true);
  });

  it('an injured champion: the office asks whether to strip them', async () => {
    const c = begin('@indie', 7);
    own(c);
    createTitle(c, 'NLW', { name: 'NLW Championship', gender: 'MALE', division: 'world' });
    const t = titlesOf('NLW')[0]!;
    const champ = WRESTLERS.find((w) => w.promotion === 'TIS' && w.gender === 'MALE' && w.id !== c.player)!;
    t.holder = champ.id;
    c.people[champ.id]!.injury = { what: 'a knee', until: addDays(c.today, 60) };
    await day(c, quick, 'simmed');
    const l = c.letters.find((x) => x.ctx?.vacate === t.id)!;
    expect(l).toBeTruthy();
    expect(replyTo(c, l.id, 'belt_vacate')).toContain('vacant');
    expect(t.holder).toBeNull();
  });
});
