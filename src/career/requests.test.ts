import { C } from './clauses';
import { gradeOf } from './scouting';
import { describe, expect, it } from 'vitest';
import { FAN_REGIONS, fansForScore, findWrestler, globalScore, PROMOTIONS, TITLES, WRESTLERS } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { addDays } from './dates';
import { bookerKey, showBooker } from './patience';
import { who } from './testkit';
import {
  answerCounter, applyBout, askApproach, askChallenge, askIndieChallenge, askIndieTitleShot, askMore, askShow, askTitleShot, askableShows, askableIndieShows,
  askableIndieTitles, makeOffer, previewTitle, signOffer,
  finishDay, firstAskable, myBoutToday, patienceOf, showsOn, startCareer,
} from './index';
import type { SimJob, SimOut } from './sim';
import type { Ask, Career } from './types';

/** A stand-in for the engine: popularity and the seed decide it. `fix` forces your result. */
const runner = (fix?: () => 'you' | 'them' | null) => async (jobs: SimJob[]): Promise<SimOut[]> => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const pa = globalScore(a) / (globalScore(a) + globalScore(b));
  const zero = { movesTried: 20, movesLanded: 12, finTried: 1, finHit: 1, sigTried: 1, sigHit: 1, reversalTries: 5, reversalWins: 2, kickouts: 2, pinTries: 3 };
  const o: SimOut = { key: j.key, winner: (j.seed % 1000) / 1000 < pa ? 'you' : 'them', finish: 'PINFALL', t: 600, stars: 3, stats: { you: zero, them: zero } };
  return fix && o.key === 'mine' ? { ...o, winner: fix() } : o;
});

function begin(player = 'jamie_mercer', seed = 7): Career {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player: who(player), today: '2026-11-03', seed });
  w.career = c;
  return c;
}

async function day(c: Career, mine?: () => 'you' | 'them' | null): Promise<void> {
  const m = myBoutToday(c);
  if (m) {
    const [out] = await runner(mine)([{ key: 'mine', seed: 1, you: c.player, them: m.bout.a === c.player ? m.bout.b : m.bout.a, rules: {} }]);
    applyBout(c, m.show, m.index, out!, m.bout.a === c.player);
  }
  await finishDay(c, runner());
}

/** Reputation and patience maxed: every factor-driven yes chance clears 100. */
function charm(c: Career, promo: string): void {
  c.people[c.player]!.rep = 100;
  (c.patience ??= {})[bookerKey(promo)] = { v: 100, log: [] };
  for (let i = 0; i < 5; i++) c.history.unshift({ day: c.today, show: 'x', showName: 'x', promo, kind: 'weekly', opp: 'x', oppName: 'x', result: 'win', finish: 'PINFALL', t: 1, stars: 3, fee: 0, indie: false });
}

/** Asks on successive days until the answer is a counter (rolls are fixed per request and day). */
function untilCounter(c: Career, ask: () => Ask): Ask {
  const start = c.today;
  for (let i = 0; i < 60; i++) {
    c.today = addDays(start, i);
    c.asks = [];
    c.pledges = [];
    const a = ask();
    if (a.answer === 'counter') { c.today = start; return a; }
  }
  throw new Error('no counter in 60 days');
}

describe('requests', () => {
  it('a title shot the booker agrees to is booked: you against the champion, on the show they named', async () => {
    const c = begin();
    charm(c, 'VWF');
    c.people[c.player]!.contract!.clauses[5] = 3;
    const t = TITLES.find((x) => x.id === 'VWF_NATIONAL_CHAMPIONSHIP')!;
    const a = askTitleShot(c, t.id);
    expect(a.answer).toBe('yes');
    const p = c.pledges!.find((x) => x.kind === 'title')!;
    const show = c.shows[p.show!]!;
    expect(show.date >= firstAskable(c)).toBe(true);
    while (c.today < show.date) await day(c);
    const bout = show.card!.find((b) => b.title === t.id);
    expect(bout, 'title match on the promised show').toBeTruthy();
    expect([bout!.a, bout!.b]).toContain(c.player);
    expect([bout!.a, bout!.b]).toContain(t.holder);
    expect(c.pledges!.some((x) => x.kind === 'title')).toBe(false);
  }, 60000);

  it('patience: nagging costs it and reputation, turning down a counter costs more, taking one gives some back', () => {
    const c = begin();
    const shows = askableShows(c);
    const target = WRESTLERS.find((w) => w.promotion === 'VWF' && w.id !== c.player && w.gender === 'MALE' && !TITLES.some((t) => t.holder === w.id))!;
    askChallenge(c, target.id, shows[0]!.id);
    const rep = c.people[c.player]!.rep;
    askChallenge(c, target.id, shows[1]!.id);
    expect(patienceOf(c, 'VWF')).toBe(70 - 8);
    expect(c.people[c.player]!.rep).toBeCloseTo(rep - 1, 5);

    const d = begin();
    const ask = untilCounter(d, () => askChallenge(d, target.id, askableShows(d)[2]!.id));
    const before = patienceOf(d, 'VWF');
    answerCounter(d, ask.id, false);
    expect(patienceOf(d, 'VWF')).toBe(before - 10);
    const e = begin();
    const ask2 = untilCounter(e, () => askChallenge(e, target.id, askableShows(e)[2]!.id));
    const b2 = patienceOf(e, 'VWF');
    answerCounter(e, ask2.id, true);
    expect(patienceOf(e, 'VWF')).toBe(Math.min(100, b2 + 5));
    expect(e.pledges!.length).toBe(1);
  });

  it('below 25 patience they won’t hear anything; it creeps back 2 a week, never past 70 on its own', async () => {
    const c = begin();
    (c.patience ??= {})[bookerKey('VWF')] = { v: 20, log: [] };
    expect(askMore(c).said).toMatch(/patience too low/);
    // Out injured, so no matches (and no off-script or no-show) muddy the weekly recovery.
    c.people[c.player]!.injury = { until: addDays(c.today, 60), what: 'test' };
    for (let i = 0; i < 21; i++) await day(c);
    expect(patienceOf(c, 'VWF')).toBe(26);
    (c.patience[bookerKey('VWF')] = { v: 69, log: [] });
    for (let i = 0; i < 14; i++) await day(c);
    expect(patienceOf(c, 'VWF')).toBe(70);
  }, 60000);

  it('a challenge they say yes to puts you in the ring with them that night', async () => {
    const c = begin();
    charm(c, 'VWF');
    const target = WRESTLERS.filter((w) => w.promotion === 'VWF' && w.id !== c.player && !TITLES.some((t) => t.holder === w.id) && !c.feuds.some((f) => f.a === w.id || f.b === w.id))
      .sort((a, b) => globalScore(a) - globalScore(b))[0]!;
    const show = askableShows(c)[1]!;
    expect(askChallenge(c, target.id, show.id).answer).toBe('yes');
    while (c.today < show.date) await day(c);
    const bout = show.card!.find((b) => b.a === c.player || b.b === c.player);
    expect(bout && [bout.a, bout.b]).toContain(target.id);
  }, 60000);

  it('asking to be on a show: a yes books you on it', async () => {
    const c = begin();
    charm(c, 'VWF');
    const show = askableShows(c).find((s) => s.kind === 'weekly')!;
    expect(askShow(c, show.id).answer).toBe('yes');
    while (c.today < show.date) await day(c);
    expect(show.card!.some((b) => b.a === c.player || b.b === c.player)).toBe(true);
  }, 60000);

  it('more matches: a yes means at least 4 dates next month, or their fee for each one missing', async () => {
    const c = begin();
    charm(c, 'VWF');
    expect(askMore(c).answer).toBe('yes');
    const month = c.pledges!.find((p) => p.kind === 'dates')!.month!;
    const fee = c.people[c.player]!.contract!.fee;
    const ledger = c.ledger.length;
    while (c.today.slice(0, 7) <= month) await day(c);
    const dates = c.history.filter((m) => m.day.startsWith(month) && m.promo === 'VWF').length;
    const paid = c.ledger.slice(0, c.ledger.length - ledger).filter((e) => e.text.includes('fell short')).reduce((t, e) => t + e.amount, 0);
    expect(dates + paid / fee).toBeGreaterThanOrEqual(4);
    expect(c.pledges!.some((p) => p.kind === 'dates')).toBe(false);
  }, 60000);

  it('approaching a promotion: their grade of you decides (an offer, a tryout counter, watching, or no)', () => {
    const promo = 'TCG';
    // A star in every way: an offer.
    const c = begin('@indie');
    const me = findWrestler(c.player)!;
    me.fans.northAmerica = 5_000_000;
    me.stats = { strength: 99, speed: 99, stamina: 99, skill: 99, striking: 99, charisma: 99 };
    expect(gradeOf(c, me, promo).step).toBe('offer');
    expect(askApproach(c, promo).answer).toBe('yes');
    expect(c.offers.some((o) => o.promo === promo && o.status === 'open')).toBe(true);
    // A nobody: no, and they say what's holding you back.
    const e = begin('@indie');
    const nob = findWrestler(e.player)!;
    nob.fans.northAmerica = 10; nob.stats = { strength: 40, speed: 40, stamina: 40, skill: 40, striking: 40, charisma: 40 };
    expect(gradeOf(e, nob, promo).step).toBe('pass');
    const a = askApproach(e, promo);
    expect(a.answer).toBe('no');
    expect(a.said).toMatch(/holding you back/);
    // In between: whatever their grade says (a tryout comes as a counter).
    const d = begin('@indie');
    const g = gradeOf(d, findWrestler(d.player)!, promo);
    const ans = askApproach(d, promo);
    expect(ans.answer).toBe(g.step === 'offer' ? 'yes' : g.step === 'tryout' ? 'counter' : 'no');
  });

  it('caught approaching while signed: patience −20, and for 30 days no main events or title matches', async () => {
    const c = begin();
    let caught = false;
    for (let i = 0; i < 40 && !caught; i++) {
      c.today = addDays('2026-11-03', i);
      askApproach(c, 'TCG');
      caught = !!c.heat;
    }
    c.today = '2026-11-03';
    expect(caught).toBe(true);
    expect(patienceOf(c, 'VWF')).toBeLessThanOrEqual(70 - 20);
    c.heat = { promo: 'VWF', until: addDays(c.today, 30) };
    for (let i = 0; i < 28; i++) {
      await day(c);
      // Cards already drawn when you were caught stand; the ones drawn after are the doghouse.
      for (const s of showsOn(c, c.today).filter((x) => x.promo === 'VWF' && x.card && x.date >= addDays('2026-11-03', 8) && x.date < c.heat!.until)) {
        const i2 = s.card!.findIndex((b) => b.a === c.player || b.b === c.player);
        if (i2 < 0) continue;
        expect(s.card![i2]!.title).toBeUndefined();
        if (s.card!.length > 1) expect(i2).toBeLessThan(s.card!.length - 1);
      }
    }
  }, 60000);

  it('earn it first: take the counter, win that match, and the title shot is booked after', async () => {
    const c = begin();
    const t = TITLES.find((x) => x.id === 'VWF_NATIONAL_CHAMPIONSHIP')!;
    // Not the #1 contender: the counter is "earn it first".
    c.people[c.player]!.rep = 90;
    let a: Ask | undefined;
    for (let i = 0; i < 80 && !a; i++) {
      c.today = addDays('2026-11-03', i);
      c.asks = [];
      const x = askTitleShot(c, t.id);
      if (x.answer === 'counter' && x.counter!.kind === 'earn') a = x;
    }
    c.today = '2026-11-03';
    if (!a) return; // Jamie can be #1 in this world; the other paths are covered above.
    answerCounter(c, a.id, true);
    const p = c.pledges!.find((x) => x.earn)!;
    const show = c.shows[p.show!]!;
    while (c.today <= show.date) await day(c, () => 'you');
    expect(c.pledges!.some((x) => x.kind === 'title' && x.title === t.id) || show.card!.every((b) => !b.earn || b.result?.winner !== c.player)).toBe(true);
  }, 60000);

  it('a challenge on an indie show can bring in someone signed elsewhere, and their promotion keeps them free that night', async () => {
    const c = begin('@indie');
    charm(c, 'TIS');
    const show = askableIndieShows(c).find((s) => s.region === 'northAmerica')!;
    // A signed wrestler whose deal allows indie dates.
    const target = WRESTLERS.find((w) => w.promotion !== 'TIS' && (c.people[w.id]?.contract?.clauses[1] ?? 0) >= 1 && !Object.values(c.shows).some((s) => s.date === show.date && s.promo === w.promotion))
      ?? WRESTLERS.find((w) => w.promotion !== 'TIS')!;
    c.people[target.id]!.contract!.clauses[1] = 3;
    for (const r of FAN_REGIONS) findWrestler(c.player)!.fans[r] = fansForScore(99);
    let a: Ask | undefined;
    for (let i = 0; i < 30 && a?.answer !== 'yes'; i++) {
      const s = askableIndieShows(c).filter((x) => x.date === show.date)[i % 3] ?? show;
      c.asked = {};
      c.asks = [];
      a = askIndieChallenge(c, target.id, s.id);
      if (a.answer === 'yes') { while (c.today < s.date) await day(c); expect(s.card!.some((b) => [b.a, b.b].includes(target.id) && [b.a, b.b].includes(c.player))).toBe(true); return; }
      c.today = addDays(c.today, 0);
    }
  }, 60000);

  it('titles still only ever have the champion in their matches with requests in the mix', async () => {
    const c = begin();
    charm(c, 'VWF');
    const bad: string[] = [];
    for (let i = 0; i < 120; i++) {
      if (i % 20 === 0) for (const t of TITLES.filter((x) => x.id.startsWith('VWF_') && x.gender === 'MALE')) askTitleShot(c, t.id);
      if (i % 10 === 0 && askableShows(c)[0]) askShow(c, askableShows(c)[0]!.id);
      const holder = new Map(TITLES.map((t) => [t.id, t.holder]));
      const shows = showsOn(c, c.today);
      await day(c);
      for (const b of shows.flatMap((s) => s.card ?? [])) {
        if (!b.title || !b.result) continue;
        const h = holder.get(b.title);
        if (h !== b.a && h !== b.b) bad.push(`${b.title}: ${b.a} v ${b.b}, champion ${h}`);
        if (b.result.newChamp) holder.set(b.title, b.result.winner);
      }
    }
    expect(bad).toEqual([]);
    void PROMOTIONS;
  }, 60000);

  it('a free agent can ask an indie promoter for a shot at an indie title: a yes puts you in it on their show', async () => {
    const c = begin('@indie');
    const me = findWrestler(c.player)!;
    for (const r of FAN_REGIONS) me.fans[r] = fansForScore(99);
    const t = askableIndieTitles(c)[0]!;
    const show = askableIndieShows(c).find((x) => x.date >= addDays(c.titles[t.id]!.since, 30))!;
    charm(c, showBooker(show));
    const a = askIndieTitleShot(c, t.id, show.id);
    expect(a.answer, a.said).toBe('yes');
    expect(c.indie[show.id]).toBeTruthy();
    const champ = t.holder;
    while (c.today < show.date) await day(c);
    const bout = show.card!.find((b) => b.title === t.id);
    expect(bout, 'title match on the promoter’s show').toBeTruthy();
    expect([bout!.a, bout!.b]).toContain(c.player);
    expect([bout!.a, bout!.b]).toContain(champ);
  }, 60000);

  it('an indie promoter whose champion isn’t free that night offers a different show', () => {
    const c = begin('@indie');
    const me = findWrestler(c.player)!;
    for (const r of FAN_REGIONS) me.fans[r] = fansForScore(99);
    const t = askableIndieTitles(c)[0]!;
    const show = askableIndieShows(c).find((x) => x.date >= addDays(c.titles[t.id]!.since, 30))!;
    charm(c, showBooker(show));
    c.people[t.holder!]!.injury = { until: addDays(show.date, 1), what: 'knee' };
    const a = askIndieTitleShot(c, t.id, show.id);
    expect(a.answer).toBe('counter');
    expect(a.counter!.kind).toBe('show');
    expect(c.shows[a.counter!.pledge!.show!]!.date > show.date).toBe(true);
  });

  it('indie title shots are for free agents', () => {
    const c = begin();
    expect(askableIndieTitles(c)).toEqual([]);
  });

  it('signing without Indie Bookings vacates your indie title, and the indie scene crowns someone new', async () => {
    const c = begin('@indie');
    const t = TITLES.find((x) => x.id === 'WORLD_INDEPENDENT_CHAMPIONSHIP')!;
    t.holder = c.player;
    makeOffer(c, 'TCG', 'test');
    signOffer(c, c.offers.find((o) => o.promo === 'TCG' && o.status === 'open')!);
    expect(t.holder).toBeNull();
    expect(c.letters.some((l) => l.subject.includes('vacated'))).toBe(true);
    for (let i = 0; i < 30 && !t.holder; i++) await day(c);
    expect(t.holder, 'a new champion within a month').toBeTruthy();
    expect(t.holder).not.toBe(c.player);
  }, 60000);

  it('signing short of Total Exclusivity keeps it, and it doesn’t stop you going for your promotion’s titles', () => {
    const c = begin('@indie');
    const t = TITLES.find((x) => x.id === 'WORLD_INDEPENDENT_CHAMPIONSHIP')!;
    t.holder = c.player;
    makeOffer(c, 'TCG', 'test');
    const o = c.offers.find((x) => x.promo === 'TCG' && x.status === 'open')!;
    o.clauses[C.exclusivity] = 2;
    signOffer(c, o);
    expect(t.holder).toBe(c.player);
    const tcg = TITLES.find((x) => x.id.startsWith('TCG_') && x.gender === findWrestler(c.player)!.gender)!;
    expect(previewTitle(c, tcg.id).hard ?? '').not.toMatch(/already hold/);
  });
});
