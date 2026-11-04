import { afterEach, describe, expect, it } from 'vitest';
import { findWrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { advancePhase, applyBout, attributeTotal, fits, myBoutToday, relocate, routineOf, skip, takeJob, trainSession, type Career } from './index';
import { addDays, weekday } from './dates';
import { onBooked } from './day';
import { begin, quick } from './testkit';
import { FEATURES } from './tuning';
import type { Show } from './types';

afterEach(() => { FEATURES.days = false; FEATURES.jobs = false; FEATURES.livingCosts = false; });
const on = () => { FEATURES.days = true; FEATURES.jobs = true; };
const nextWeekday = (d: string, wd: number) => { let x = addDays(d, 1); while (weekday(x) !== wd) x = addDays(x, 1); return x; };
/** One phase the way the game does it: your match first (simmed with the quick stand-in), then the clock. */
async function step(c: Career) {
  const mine = myBoutToday(c);
  if (mine && (!FEATURES.days || c.phase === 'pm')) {
    const [out] = await quick([{ key: 'mine', seed: 1, you: mine.bout.a, them: mine.bout.b, rules: {} }]);
    applyBout(c, mine.show, mine.index, out!, true, 'simmed');
  }
  await advancePhase(c, quick);
}
const fake = (c: Career, id: string, date: string, country: string, region: Show['region']): Show => {
  const s = { id, promo: 'TIS', name: id, kind: 'indie', date, country, city: 'X', region, card: null, done: false } as Show;
  c.shows[id] = s;
  return s;
};

describe('days (Lyra’s calls: an AM and a PM, training sessions, travel that takes time)', () => {
  it('off, a press moves a whole day; on, the AM then the PM', async () => {
    const c = begin('@indie');
    const d0 = c.today;
    await step(c);
    expect(c.today).toBe(addDays(d0, 1));
    on();
    await step(c);
    expect(c.phase).toBe('pm');
    expect(c.today).toBe(addDays(d0, 1));
    await step(c);
    expect(c.phase).toBe('am');
    expect(c.today).toBe(addDays(d0, 2));
  });

  it('a free phase rests you; a training session buys up to two points and tires you', async () => {
    on();
    const c = begin('@indie');
    const p = c.people[c.player]!;
    p.fatigue = 20;
    routineOf(c).week[weekday(c.today)]!.am = 'rest';
    await step(c);
    expect(p.fatigue).toBe(16);
    c.money = 20000;
    const before = attributeTotal(findWrestler(c.player)!);
    p.fatigue = 10;
    trainSession(c);
    expect(attributeTotal(findWrestler(c.player)!)).toBe(before + 2);
    expect(p.fatigue).toBe(16);
  });

  it('no training injuries under 40 fatigue', () => {
    on();
    const c = begin('@indie');
    const p = c.people[c.player]!;
    for (let i = 0; i < 400; i++) {
      c.today = addDays(c.today, 1);
      p.fatigue = 39;
      p.injury = null;
      c.money = 0;
      trainSession(c);
      expect(p.injury).toBeNull();
    }
  });

  it('a booking reserves the whole trip: two continents on consecutive days won’t fit; the same region will', () => {
    on();
    const c = begin('@indie');
    c.base = 'England';
    const d = addDays(c.today, 12);
    const home = fake(c, 'h1', d, 'England', 'europe');
    c.indie[home.id] = { fee: 100, travel: 0 };
    expect(fits(c, fake(c, 'jp', addDays(d, 1), 'Japan', 'asia')).ok).toBe(false);
    expect(fits(c, fake(c, 'fr', addDays(d, 1), 'France', 'europe')).ok).toBe(true);
    expect(fits(c, fake(c, 'jp2', addDays(d, 4), 'Japan', 'asia')).ok).toBe(true);
  });

  it('nobody in the world is booked on two continents on consecutive days', async () => {
    FEATURES.days = true;
    const c = begin('jamie_mercer', 11);
    for (let i = 0; i < 40; i++) await step(c);
    const shows = Object.values(c.shows).filter((s) => s.card && s.date >= c.startedOn);
    const bad: string[] = [];
    for (const a of shows) for (const b of shows) {
      if (b.date !== addDays(a.date, 1) || a.region === b.region) continue;
      const ids = new Set(a.card!.flatMap((x) => [x.a, x.b]));
      for (const x of b.card!) for (const id of [x.a, x.b]) if (ids.has(id)) bad.push(`${id} ${a.date} ${a.region} → ${b.region}`);
    }
    // Cards drawn before days came on (the first week) are honoured as they were.
    expect(bad.filter((x) => x.split(' ')[1]! > addDays(c.startedOn, 8))).toEqual([]);
  }, 120000);

  it('moving costs money, takes three days, ends a day job, and changes where you live', async () => {
    on();
    const c = begin('@indie');
    c.money = 3000;
    takeJob(c, 'retail');
    expect(relocate(c, 'Japan')).toMatch(/three days/);
    expect(c.money).toBe(1500);
    expect(c.job).toBeNull();
    for (let i = 0; i < 8; i++) await step(c);
    expect(c.base).toBe('Japan');
    // A move a promotion pays for in full goes through even overdrawn.
    c.money = -500;
    expect(relocate(c, 'England', 1)).toMatch(/paid for/);
  });
});

describe('day jobs (Lyra’s call: optional, light)', () => {
  it('wages come on Friday for the shifts worked; missed shifts are strikes, and three gets you sacked', async () => {
    on();
    const c = begin('@indie');
    takeJob(c, 'office');
    const until = nextWeekday(c.job!.from, 6);
    while (c.today < until) await step(c);
    const wages = c.ledger.filter((e) => e.kind === 'wage');
    expect(wages.length).toBe(1);
    expect(wages[0]!.amount).toBeGreaterThan(300);
    // Three short-notice absences in 90 days.
    for (let i = 0; i < 3 && c.job; i++) {
      const mon = nextWeekday(c.today, 1);
      while (c.today < mon) await step(c);
      c.plans = { ...(c.plans ?? {}), [`${c.today}|am`]: 'rest' };
      c.job!.off = c.job!.off.filter((d) => d !== c.today);
      // Being somewhere else: a show that morning means you're not at work.
      const s = fake(c, `x${i}`, c.today, findWrestler(c.player)!.country, 'northAmerica');
      s.phase = 'am';
      c.indie[s.id] = { fee: 0, travel: 0 };
      await step(c);
    }
    expect(c.job).toBeNull();
  }, 120000);

  it('a booking against a shift with a week’s notice is unpaid time off, not a strike', () => {
    on();
    const c = begin('@indie');
    takeJob(c, 'office');
    routineOf(c).clash = 'take';
    const mon = nextWeekday(addDays(c.today, 14), 1);
    const s = fake(c, 'later', mon, findWrestler(c.player)!.country, 'northAmerica');
    s.phase = 'am';
    c.indie[s.id] = { fee: 0, travel: 0 };
    onBooked(c, s);
    expect(c.job!.off).toContain(mon);
    expect(c.job!.strikes).toEqual([]);
  });

  it('well overdrawn with no job: a money-trouble letter (gig work always on it), at most every four weeks', async () => {
    on();
    const c = begin('@indie');
    c.money = -2000;
    await step(c); await step(c);
    const trouble = c.letters.filter((l) => l.action?.type === 'event' && l.action.event === 'money_trouble');
    expect(trouble.length).toBe(1);
    expect(trouble[0]!.action!.type === 'event' && trouble[0]!.action!.options.map((o) => o.id)).toContain('gig');
    for (let i = 0; i < 20; i++) await step(c);
    expect(c.letters.filter((l) => l.action?.type === 'event' && l.action.event === 'money_trouble').length).toBe(1);
  }, 120000);
});

describe('time skipping (Lyra’s call: Football Manager style)', () => {
  it('skipping ends up exactly where pressing advance does', async () => {
    on();
    const run = async (useSkip: boolean) => {
      const c = begin('jamie_mercer', 21);
      if (useSkip) await skip(c, { days: 12 }, quick, { mine: async (x) => { const m = myBoutToday(x)!; const [o] = await quick([{ key: 'mine', seed: 1, you: m.bout.a, them: m.bout.b, rules: {} }]); applyBout(x, m.show, m.index, o!, true, 'simmed'); return true; } });
      else for (let i = 0; i < 24; i++) await step(c);
      const w = activeWorld();
      return JSON.stringify({ c: w.career, db: w.db.wrestlers, h: w.history });
    };
    expect(await run(true)).toBe(await run(false));
  }, 120000);

  it('a skip stops for a letter that needs an answer', async () => {
    on();
    const c = begin('@indie');
    c.money = -2000;
    const r = await skip(c, { days: 20 }, quick, { mine: async () => false });
    expect(r.stopped).toMatch(/letter|match/);
    expect(r.phases).toBeLessThan(40);
  }, 120000);
});
