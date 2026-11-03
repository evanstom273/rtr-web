// The calendar: turns each promotion's schedule (schedules.json) into dated shows, a week at a time,
// so a career can draw it up as far ahead as it needs and always get the same answer for a seed.
import schedulesJson from '../data/rtr/schedules.json';
import { seededRng, type Rng } from '../engine/rng';
import {
  addDays, dateOf, dayOf, daysBetween, monthIndex, MONTHS, monthOf, nthWeekday, weekday, weekdayIndex, weekStart, yearOf, type Day,
} from './dates';
import { INDIE_COUNTRIES, indieEventName } from './indieEvents';
import { CITIES, PROMO_COUNTRIES, regionOfCountry } from './places';
import {
  INDIE_DATES_PER_WEEK, INDIE_REGION_DROUGHT_DAYS, INDIE_SHOWS_MAX_WEEK, INDIE_SHOWS_PER_WEEK, INDIE_SLOTS_PER_SHOW, SPECIAL_REPLACES_WEEKLY,
} from './tuning';
import type { Brand } from '../world/people';
import type { PopRegion, Show, ShowKind } from './types';

type When =
  | { every: string }
  | { nth: number | 'last'; day: string; month: string }
  | { date: number; month: string }
  | { irregular: { minGapDays: number; maxGapDays: number; day: string | null } }
  | { tour: { leadsTo: string; weeks: number; showsPerWeek: number } }
  | { touringMonths: { pattern: string; startMonth: string; showsPerWeek: [number, number]; days: string[] } }
  | { procedural: { eventsPerWeek: [number, number]; countries: string; sameDayAllowed: boolean } }
  | { dates: { date: number; month: string; optional?: boolean }[] };

interface Rule {
  name: string;
  kind: ShowKind;
  when: When;
  numbered?: boolean;
  numberingResets?: 'month';
  promotions?: string[];
  perYear?: [number, number];
}

export const SCHEDULES = schedulesJson as unknown as Record<string, Rule[]>;

export interface CalendarState {
  seed: number;
  counters: Record<string, number>;
  nextIrregular: Record<string, Day>;
  /** The indie scene's brands: when there are any, they run the indie week (each brand's last show is kept here). */
  indie?: IndieCalendar;
}

export interface IndieCalendar {
  brands: Brand[];
  /** How many indies there are to book. */
  pool: number;
  last: Record<string, Day>;
  regionLast: Partial<Record<PopRegion, Day>>;
}

/** Regular indie shows a week the draw aims for, from how many indies there are to book (Lyra's call: 6 to 10). */
export const indieTarget = (pool: number): number =>
  Math.max(INDIE_SHOWS_PER_WEEK[0], Math.min(INDIE_SHOWS_PER_WEEK[1], Math.round((pool * INDIE_DATES_PER_WEEK) / INDIE_SLOTS_PER_SHOW)));

/**
 * The indie week: the brands most due a show (and any in a region that's gone quiet) run one, about
 * the target number, never more than the weekly maximum. No region is promised a show every week.
 */
function brandWeek(r: Rng, ind: IndieCalendar, ws: Day, used: Set<string>): { date: Day; country: string; city?: string; name: string; brand: string }[] {
  const open = ind.brands.filter((b) => !b.closed && b.from <= addDays(ws, 6) && CITIES[b.country]?.length);
  const target = Math.min(open.length, INDIE_SHOWS_MAX_WEEK, Math.max(INDIE_SHOWS_PER_WEEK[0], Math.min(INDIE_SHOWS_PER_WEEK[1], indieTarget(ind.pool) + randInt(r, -1, 1))));
  const score = (b: Brand) => {
    const last = ind.last[b.id];
    let s = (last ? daysBetween(last, ws) : b.every) / b.every;
    const quiet = ind.regionLast[b.region];
    if (!quiet || daysBetween(quiet, ws) >= INDIE_REGION_DROUGHT_DAYS) s += 1.5;
    return s + r() * 0.6;
  };
  const picked = open.map((b) => ({ b, s: score(b) })).sort((x, y) => y.s - x.s || (x.b.id < y.b.id ? -1 : 1)).slice(0, target);
  return picked.map(({ b }) => {
    const shift = r() < 0.25 ? (r() < 0.5 ? -1 : 1) : 0;
    const date = addDays(ws, Math.max(0, Math.min(6, b.dow + shift)));
    ind.last[b.id] = date;
    if (!ind.regionLast[b.region] || ind.regionLast[b.region]! < date) ind.regionLast[b.region] = date;
    // Most nights at home; now and then a road show elsewhere in the country.
    const home = b.city && r() < 0.75 ? b.city : undefined;
    return { date, country: b.country, ...(home ? { city: home } : {}), name: indieEventName(r, b.country, used), brand: b.id };
  });
}

/** A small stable hash, so every (seed, rule, week) gets its own repeatable dice. */
function hash(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const rngFor = (...parts: (string | number)[]): Rng => seededRng(hash(...parts));
const randInt = (r: Rng, a: number, b: number) => a + Math.floor(r() * (b - a + 1));

const ZH = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function chineseNumber(n: number): string {
  if (n < 10) return ZH[n]!;
  if (n < 20) return '十' + (n % 10 ? ZH[n % 10] : '');
  if (n < 100) return ZH[Math.floor(n / 10)] + '十' + (n % 10 ? ZH[n % 10] : '');
  if (n < 1000) {
    const rest = n % 100;
    return ZH[Math.floor(n / 100)] + '百' + (rest === 0 ? '' : rest < 10 ? '零' + ZH[rest] : rest < 20 ? '一' + chineseNumber(rest) : chineseNumber(rest));
  }
  const rest = n % 1000;
  return ZH[Math.floor(n / 1000)] + '千' + (rest === 0 ? '' : rest < 100 ? '零' + chineseNumber(rest) : chineseNumber(rest));
}

export function romanNumber(n: number): string {
  const R: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of R) while (n >= v) { out += s; n -= v; }
  return out;
}

function showName(rule: Rule, date: Day, n: number): string {
  return rule.name
    .replace('{n:zh}', chineseNumber(n))
    .replace('{n:roman}', romanNumber(n))
    .replace('{n}', String(n))
    .replace('{month}', MONTHS[monthOf(date)]!);
}

interface Draft { date: Day; promo: string; rule: Rule; country?: string; city?: string; name?: string; promos?: string[]; irregular?: string; brand?: string }

/** Every date in [from, to] with the given weekday. */
function weekdaysIn(from: Day, to: Day, wd: number): Day[] {
  const out: Day[] = [];
  let d = addDays(from, (wd - weekday(from) + 7) % 7);
  while (d <= to) { out.push(d); d = addDays(d, 7); }
  return out;
}

/** Dates of fixed-date and nth-weekday rules in [from, to]. */
function fixedDates(when: When, from: Day, to: Day): Day[] {
  const out: Day[] = [];
  for (let y = yearOf(from); y <= yearOf(to); y++) {
    for (let m = 0; m < 12; m++) {
      let d: Day | null = null;
      if ('date' in when) {
        if (monthIndex(when.month) === m) d = dayOf(y, m, when.date);
      } else if ('nth' in when) {
        if (when.month === 'every' || monthIndex(when.month) === m) d = nthWeekday(y, m, weekdayIndex(when.day), when.nth);
      }
      if (d && d >= from && d <= to) out.push(d);
    }
  }
  return out;
}

const TOUR_DAYS: Record<number, number[]> = { 1: [6], 2: [3, 6], 3: [2, 4, 6], 4: [2, 3, 5, 6] };

/** The shows one week (Monday `ws` to Sunday) brings, before numbering. */
function draftWeek(state: CalendarState, ws: Day): Draft[] {
  const we = addDays(ws, 6);
  const out: Draft[] = [];
  for (const [promo, rules] of Object.entries(SCHEDULES)) {
    for (const rule of rules) {
      const w = rule.when;
      const key = `${promo}:${rule.name}`;
      if ('every' in w) {
        for (const d of weekdaysIn(ws, we, weekdayIndex(w.every))) out.push({ date: d, promo, rule });
      } else if ('date' in w || 'nth' in w) {
        for (const d of fixedDates(w, ws, we)) out.push({ date: d, promo, rule });
      } else if ('irregular' in w) {
        const r = rngFor(state.seed, key, 'irregular');
        let next = state.nextIrregular[key];
        if (!next) {
          next = addDays(ws, randInt(r, 0, w.irregular.maxGapDays));
          if (w.irregular.day) next = addDays(next, (weekdayIndex(w.irregular.day) - weekday(next) + 7) % 7);
        }
        while (next <= we) {
          if (next >= ws) out.push({ date: next, promo, rule, irregular: key });
          const rr = rngFor(state.seed, key, next);
          let n = addDays(next, randInt(rr, w.irregular.minGapDays, w.irregular.maxGapDays));
          if (w.irregular.day) n = addDays(n, (weekdayIndex(w.irregular.day) - weekday(n) + 7) % 7);
          next = n;
        }
        state.nextIrregular[key] = next;
      } else if ('tour' in w) {
        const target = rules.find((x) => x.name === w.tour.leadsTo);
        if (!target) continue;
        // A tour runs the `weeks` weeks before its show: find any of those shows this week leads to.
        for (const big of fixedDates(target.when, ws, addDays(we, w.tour.weeks * 7))) {
          const tourFrom = addDays(big, -w.tour.weeks * 7), tourTo = addDays(big, -1);
          for (const wd of TOUR_DAYS[w.tour.showsPerWeek] ?? TOUR_DAYS[2]!) {
            for (const d of weekdaysIn(tourFrom, tourTo, wd)) if (d >= ws && d <= we) out.push({ date: d, promo, rule });
          }
        }
      } else if ('touringMonths' in w) {
        const t = w.touringMonths;
        const start = monthIndex(t.startMonth);
        const r = rngFor(state.seed, key, ws);
        const three = randInt(r, t.showsPerWeek[0], t.showsPerWeek[1]) >= 3;
        const days = t.days.slice(0, three ? 3 : 2).map(weekdayIndex);
        for (const wd of days) {
          for (const d of weekdaysIn(ws, we, wd)) {
            const m = monthOf(d);
            if (t.pattern === 'alternate' ? (m - start + 12) % 2 === 0 : true) out.push({ date: d, promo, rule });
          }
        }
      } else if ('procedural' in w) {
        const r = rngFor(state.seed, key, ws);
        const used = new Set<string>();
        if (state.indie?.brands.length) {
          for (const d of brandWeek(r, state.indie, ws, used)) out.push({ ...d, promo, rule });
          continue;
        }
        const n = randInt(r, w.procedural.eventsPerWeek[0], w.procedural.eventsPerWeek[1]);
        for (let i = 0; i < n; i++) {
          const country = INDIE_COUNTRIES[Math.floor(r() * INDIE_COUNTRIES.length)]!;
          const date = addDays(ws, Math.floor(r() * 7));
          out.push({ date, promo, rule, country, name: indieEventName(r, country, used) });
        }
      } else if ('dates' in w) {
        for (const spec of w.dates) {
          for (const d of fixedDates({ date: spec.date, month: spec.month }, ws, we)) {
            if (spec.optional && rngFor(state.seed, key, yearOf(d))() < 0.5) continue;
            const promos = rule.promotions ?? [];
            out.push({ date: d, promo: promos[0] ?? promo, rule, promos, country: PROMO_COUNTRIES[promos[yearOf(d) % 2] ?? 'NWGP']?.[0] });
          }
        }
      }
    }
  }
  return out;
}

/** Draw up the shows for the week starting `ws` (a Monday). Updates numbering in `state`. */
export function drawWeek(state: CalendarState, ws: Day): Show[] {
  let drafts = draftWeek(state, ws).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (SPECIAL_REPLACES_WEEKLY) {
    // A special on a weekly show's night takes its place: one show that night, not two.
    const big = new Set(drafts.filter((d) => d.rule.kind === 'special' || d.rule.kind === 'flagship').map((d) => `${d.promo}|${d.date}`));
    drafts = drafts.filter((d) => d.rule.kind !== 'weekly' || !big.has(`${d.promo}|${d.date}`));
  }
  const shows: Show[] = [];
  drafts.forEach((d, i) => {
    let name = d.name ?? d.rule.name;
    let series: { series: string; n: number } | null = null;
    if (d.rule.numbered) {
      const key = d.rule.numberingResets === 'month' ? `${d.promo}:${d.rule.name}:${d.date.slice(0, 7)}` : `${d.promo}:${d.rule.name}`;
      const n = (state.counters[key] ?? 0) + 1;
      state.counters[key] = n;
      series = { series: key, n };
      name = showName(d.rule, d.date, n);
    } else if (!d.name) {
      name = showName(d.rule, d.date, 0);
    }
    const r = rngFor(state.seed, 'venue', d.date, i);
    const countries = PROMO_COUNTRIES[d.promo] ?? ['USA'];
    const country = d.country ?? (d.rule.kind === 'tour' || countries.length > 1 ? countries[Math.floor(r() * countries.length)]! : countries[0]!);
    const cities = CITIES[country] ?? ['Philadelphia'];
    shows.push({
      id: `${d.date}|${d.promo}|${i}`,
      promo: d.promo,
      ...(d.promos?.length ? { promos: d.promos } : {}),
      name,
      kind: d.rule.kind,
      date: d.date,
      country,
      city: d.city ?? cities[Math.floor(r() * cities.length)]!,
      region: regionOfCountry(country),
      card: null,
      done: false,
      ...(series ?? {}),
      ...(d.irregular ? { irregular: d.irregular } : {}),
      ...(d.brand ? { brand: d.brand } : {}),
    });
  });
  return shows;
}

/** Draw up every week from the one containing `from` until the calendar reaches `to`. */
export function drawCalendar(state: CalendarState, drawnTo: Day | null, from: Day, to: Day): { shows: Show[]; drawnTo: Day } {
  let ws = drawnTo ? addDays(drawnTo, 1) : weekStart(from);
  const shows: Show[] = [];
  while (ws <= to) {
    for (const s of drawWeek(state, ws)) if (s.date >= from) shows.push(s);
    ws = addDays(ws, 7);
  }
  return { shows, drawnTo: addDays(ws, -1) };
}

/** For the calendar grid: is `d` inside the month (year, 0-based month)? */
export const inMonth = (d: Day, y: number, m: number): boolean => yearOf(d) === y && monthOf(d) === m;
export { dateOf, daysBetween };
