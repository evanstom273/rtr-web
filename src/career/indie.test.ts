// The indie scene's calendar and booking (Lyra's calls): 6–10 indie shows a week and never more than 10,
// one-offs and cups included; regions stay active over time without a weekly promise; at most two title
// matches on an indie card; and nobody available is ever locked out by accident.
import { describe, expect, it } from 'vitest';
import { globalScore, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { indieWeight, isIndieTitle, regionFactor } from './booker';
import { addDays, weekStart, type Day } from './dates';
import { REGION_OF } from './places';
import { indieDates } from './specials';
import { INDIE_REGION_MIN_PER_28D, INDIE_SHOWS_MAX_WEEK, INDIE_SHOWS_PER_WEEK } from './tuning';
import { begin, day } from './testkit';
import { showBooker } from './patience';
import type { Career, PopRegion, Show } from './types';

const REGIONS: PopRegion[] = ['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'];

/** Every indie show this career has seen: archived (played) and still on the calendar. */
function indieShows(c: Career): { id: string; date: Day; region: PopRegion; special: boolean; titles: number }[] {
  const seen = new Map<string, { id: string; date: Day; region: PopRegion; special: boolean; titles: number }>();
  for (const s of activeWorld().history.shows) if (s.promo === 'TIS' && !s.promos?.length) seen.set(s.id, { id: s.id, date: s.date, region: REGION_OF[s.country] ?? 'europe', special: !!s.tag, titles: s.bouts.filter((b) => b.title).length });
  for (const s of Object.values(c.shows)) if (s.promo === 'TIS' && !s.promos) seen.set(s.id, { id: s.id, date: s.date, region: s.region, special: !!s.special, titles: (s.card ?? []).filter((b) => b.title).length });
  return [...seen.values()];
}

describe('the indie calendar', () => {
  it('a year: 6–10 indie shows every week, one-offs included; every region busy over each four weeks; two title matches a card at most', async () => {
    const c = begin('jamie_mercer', 7);
    const start = c.today;
    for (let i = 0; i < 365; i++) await day(c);
    const shows = indieShows(c).filter((s) => s.date >= weekStart(start) && s.date < weekStart(c.today));
    const weeks = new Map<Day, number>();
    for (const s of shows) weeks.set(weekStart(s.date), (weeks.get(weekStart(s.date)) ?? 0) + 1);
    expect(weeks.size).toBeGreaterThan(50);
    for (const [ws, n] of weeks) {
      expect(n, ws).toBeLessThanOrEqual(INDIE_SHOWS_MAX_WEEK);
      expect(n, ws).toBeGreaterThanOrEqual(INDIE_SHOWS_PER_WEEK[0]);
    }
    for (let d = addDays(start, 28); d < addDays(c.today, -7); d = addDays(d, 7)) {
      for (const r of REGIONS) {
        const n = shows.filter((s) => s.region === r && s.date > addDays(d, -28) && s.date <= d).length;
        expect(n, `${r} in the 28 days to ${d}`).toBeGreaterThanOrEqual(INDIE_REGION_MIN_PER_28D);
      }
    }
    for (const s of shows) expect(s.titles, s.id).toBeLessThanOrEqual(2);
    // Brands come back: most run several shows a year.
    const byBrand = new Map<string, number>();
    for (const s of activeWorld().history.shows) if (s.brand) byBrand.set(s.brand, (byBrand.get(s.brand) ?? 0) + 1);
    expect([...byBrand.values()].filter((n) => n >= 10).length).toBeGreaterThan(byBrand.size / 2);
  }, 120000);

  it('a one-off in a full week takes a regular show’s place; a cup that can’t fit moves on a week', () => {
    const c = begin('jamie_mercer', 11);
    const ws = weekStart(addDays(c.today, 28));
    const week = () => Object.values(c.shows).filter((s) => s.promo === 'TIS' && !s.promos && weekStart(s.date) === ws);
    // Fill the week to the maximum.
    let k = 0;
    while (week().length < INDIE_SHOWS_MAX_WEEK) {
      const s: Show = { id: `fill${k++}`, promo: 'TIS', name: `Filler ${k}`, kind: 'indie', date: addDays(ws, k % 7), country: 'UK', city: 'Leeds', region: 'europe', card: null, done: false };
      c.shows[s.id] = s;
    }
    const before = week().map((s) => s.id);
    const [d] = indieDates(c, addDays(ws, 2), 'europe')!;
    expect(weekStart(d!)).toBe(ws);
    expect(week()).toHaveLength(INDIE_SHOWS_MAX_WEEK - 1); // one gave way; the one-off takes its place
    expect(before.length).toBe(INDIE_SHOWS_MAX_WEEK);
    // Every regular show in the week drawn up or promised: nothing can give way, so the cup moves on.
    for (const s of week()) s.card = [];
    c.shows['x'] = { id: 'x', promo: 'TIS', name: 'Taken', kind: 'indie', date: addDays(ws, 1), country: 'UK', city: 'Leeds', region: 'europe', card: [], done: false };
    const cup = indieDates(c, ws, 'europe', [0, 14, 28])!;
    expect(weekStart(cup[0]!) > ws).toBe(true);
  });
});

describe('indie booking', () => {
  it('nobody available is locked out by accident: everyone has a chance everywhere, most at home', () => {
    const c = begin('jamie_mercer', 23);
    const show = Object.values(c.shows).find((s) => s.promo === 'TIS' && s.brand)!;
    const promoter = showBooker(show);
    for (const w of WRESTLERS.filter((x) => x.promotion === 'TIS')) {
      for (const r of REGIONS) expect(regionFactor(c, w, r, show.date)).toBeGreaterThan(0);
      expect(indieWeight(c, w, show, promoter), w.id).toBeGreaterThan(0);
    }
    // Indie champions are all generated indies, and the scene's promoters are real people.
    for (const t of TITLES.filter((x) => isIndieTitle(x.id))) expect(WRESTLERS.find((w) => w.id === t.holder)?.promotion).toBe('TIS');
    expect(activeWorld().people!.staff[promoter]?.job?.kind).toBe('promoter');
  });

  it('a year: indies mostly work at home, and every wrestler with no dates in 120 days has a reason', async () => {
    const c = begin('jamie_mercer', 7);
    for (let i = 0; i < 300; i++) await day(c);
    const H = activeWorld().history;
    const since = addDays(c.today, -120);
    const recent = H.shows.filter((s) => s.promo === 'TIS' && s.date >= since);
    const dates = new Map<string, number>();
    let home = 0, all = 0;
    for (const s of recent) for (const b of s.bouts) for (const id of [b.a, b.b]) {
      dates.set(id, (dates.get(id) ?? 0) + 1);
      const w = WRESTLERS.find((x) => x.id === id);
      if (w?.promotion !== 'TIS') continue;
      all++;
      if (w.region === Object.entries({ NORTH_AMERICA: 'northAmerica', SOUTH_AMERICA: 'southAmerica', EUROPE: 'europe', ASIA: 'asia', AFRICA: 'africa', OCEANIA: 'oceania' }).find(([, v]) => v === (REGION_OF[s.country] ?? 'europe'))?.[0]) home++;
    }
    expect(home / all).toBeGreaterThan(0.6);
    const idle = WRESTLERS.filter((w) => w.promotion === 'TIS' && !dates.has(w.id) && w.id !== c.player);
    for (const w of idle) {
      const p = c.people[w.id];
      const joined = H.events.some((e) => e.who === w.id && (e.kind === 'released' || e.kind === 'expired' || e.kind === 'debut') && e.day >= since);
      const why = p?.retired || (p?.injury && p.injury.until >= since) || (p?.last && p.last >= since) // worked a promotion date, or injured
        || joined // only on the indies for part of the window
        || globalScore(w) < 15; // a low-popularity unknown: plausible to struggle for dates
      expect(!!why, `${w.name} (${w.region}, pop ${globalScore(w)}) had no dates in 120 days for no reason`).toBe(true);
    }
  }, 120000);
});
