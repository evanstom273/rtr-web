// The calendar: turns each promotion's schedule (schedules.json) into dated shows, a week at a time,
// so a career can draw it up as far ahead as it needs and always get the same answer for a seed. Lyra's call: four
// weeks a month, every show in a week on its show night, and a special takes the place of that week's TV.
import schedulesJson from '../data/rtr/schedules.json';
import { seededRng, type Rng } from '../engine/rng';
import { addWeeks, dateOf, daysBetween, monthIndex, MONTHS, monthOf, norm, weekIn, weekOf, weeksBetween, yearOf, type Day } from './dates';
import { INDIE_COUNTRIES, indieEventName } from './indieEvents';
import { CITIES, PROMO_COUNTRIES, regionOfCountry } from './places';
import {
  INDIE_DATES_PER_WEEK, INDIE_REGION_DROUGHT_DAYS, INDIE_SHOWS_MAX_WEEK, INDIE_SHOWS_PER_WEEK, INDIE_SLOTS_PER_SHOW, SPECIAL_REPLACES_WEEKLY,
} from './tuning';
import type { Brand } from '../world/people';
import type { PopRegion, Show, ShowKind } from './types';

export type When =
  /** The weeks of every month it runs (1–4): [1, 2, 3, 4] every week, [1, 3] alternate weeks, [4] once a month. */
  | { weeks: number[] }
  /** Every so many weeks, counted from a week (booker mode: a fortnightly show). */
  | { everyN: { weeks: number; anchor: Day } }
  /** A week of one month, or of every month ('every'). */
  | { week: number; month: string }
  /** No fixed schedule: the next one between so many weeks on. */
  | { irregular: { minGapWeeks: number; maxGapWeeks: number } }
  /** A show a week for the weeks running up to its big show. */
  | { tour: { leadsTo: string; weeks: number } }
  /** Every week of its touring months ('alternate': every other month from the start month). */
  | { touringMonths: { pattern: string; startMonth: string } }
  | { procedural: { eventsPerWeek: [number, number]; countries: string } }
  | { dates: { week: number; month: string; optional?: boolean }[] };

export interface Rule {
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
  /** Booker mode: companies' own schedules (in place of schedules.json), where they're based, and which have closed. */
  schedules?: Record<string, Rule[]>;
  homes?: Record<string, { country: string; city: string; local: boolean }>;
  closed?: string[];
  /** Draw only this promotion's shows (a changed schedule being redrawn). */
  only?: string;
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
  const open = ind.brands.filter((b) => !b.closed && b.from <= ws && CITIES[b.country]?.length);
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
    // Every show in a week is on its show night (the brand's old night of the week no longer matters).
    const date = ws;
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

/** The week of a fixed-week rule in the given year and month, or null if it doesn't run then. */
function fixedWeek(when: { week: number; month: string }, y: number, m: number): Day | null {
  return when.month === 'every' || monthIndex(when.month) === m ? weekIn(y, m, when.week) : null;
}

/** The shows one week `ws` brings, before numbering. */
function draftWeek(state: CalendarState, ws: Day): Draft[] {
  const out: Draft[] = [];
  const y = yearOf(ws), m = monthOf(ws), wk = weekOf(ws);
  const all = state.schedules ? { ...SCHEDULES, ...state.schedules } : SCHEDULES;
  for (const [promo, rules] of Object.entries(all)) {
    if (state.closed?.includes(promo) || (state.only && promo !== state.only)) continue;
    for (const rule of rules) {
      const w = rule.when as When;
      const key = `${promo}:${rule.name}`;
      if ('weeks' in w) {
        if (w.weeks.includes(wk)) out.push({ date: ws, promo, rule });
      } else if ('everyN' in w) {
        const n = weeksBetween(w.everyN.anchor, ws);
        if (n >= 0 && n % w.everyN.weeks === 0) out.push({ date: ws, promo, rule });
      } else if ('week' in w) {
        if (fixedWeek(w, y, m) === ws) out.push({ date: ws, promo, rule });
      } else if ('irregular' in w) {
        const r = rngFor(state.seed, key, 'irregular');
        let next = state.nextIrregular[key];
        if (!next) next = addWeeks(ws, randInt(r, 0, w.irregular.maxGapWeeks));
        while (next <= ws) {
          if (next === ws) out.push({ date: ws, promo, rule, irregular: key });
          next = addWeeks(next, randInt(rngFor(state.seed, key, next), w.irregular.minGapWeeks, w.irregular.maxGapWeeks));
        }
        state.nextIrregular[key] = next;
      } else if ('tour' in w) {
        const target = rules.find((x) => x.name === w.tour.leadsTo);
        if (!target || !('week' in target.when)) continue;
        // A tour runs the `weeks` weeks before its show: is its show that close ahead?
        for (let k = 1; k <= w.tour.weeks; k++) {
          const big = addWeeks(ws, k);
          if (fixedWeek(target.when as { week: number; month: string }, yearOf(big), monthOf(big)) === big) out.push({ date: ws, promo, rule });
        }
      } else if ('touringMonths' in w) {
        const start = monthIndex(w.touringMonths.startMonth);
        if (w.touringMonths.pattern !== 'alternate' || (m - start + 12) % 2 === 0) out.push({ date: ws, promo, rule });
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
          out.push({ date: ws, promo, rule, country, name: indieEventName(r, country, used) });
        }
      } else if ('dates' in w) {
        for (const spec of w.dates) {
          if (fixedWeek(spec, y, m) !== ws) continue;
          if (spec.optional && rngFor(state.seed, key, y)() < 0.5) continue;
          const promos = rule.promotions ?? [];
          out.push({ date: ws, promo: promos[0] ?? promo, rule, promos, country: PROMO_COUNTRIES[promos[y % 2] ?? 'NWGP']?.[0] });
        }
      }
    }
  }
  return out;
}

/** Draw up the shows for the week `ws`. Updates numbering in `state`. */
export function drawWeek(state: CalendarState, ws: Day): Show[] {
  ws = norm(ws);
  let drafts = draftWeek(state, ws);
  if (SPECIAL_REPLACES_WEEKLY) {
    // Lyra's call: a special's week has no TV (that week's weekly or tour show). A joint show takes the place of its
    // promotions' shows that week (all but a flagship).
    const big = new Set(drafts.filter((d) => !d.promos?.length && (d.rule.kind === 'special' || d.rule.kind === 'flagship')).map((d) => d.promo));
    const joint = new Set(drafts.filter((d) => d.promos?.length).flatMap((d) => d.promos!));
    drafts = drafts.filter((d) => d.promos?.length || !((big.has(d.promo) && (d.rule.kind === 'weekly' || d.rule.kind === 'tour')) || (joint.has(d.promo) && d.rule.kind !== 'flagship')));
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
    const home = state.homes?.[d.promo];
    const countries = home ? [home.country] : PROMO_COUNTRIES[d.promo] ?? ['USA'];
    const country = d.country ?? (d.rule.kind === 'tour' || countries.length > 1 ? countries[Math.floor(r() * countries.length)]! : countries[0]!);
    // A local promotion runs in its home town; bigger ones move around the country.
    const cities = home?.local ? [home.city] : CITIES[country] ?? ['Philadelphia'];
    shows.push({
      id: state.only ? `${d.date}|${d.promo}|r${i}` : `${d.date}|${d.promo}|${i}`,
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
  let ws = drawnTo ? addWeeks(drawnTo, 1) : norm(from);
  const start = norm(from);
  const shows: Show[] = [];
  while (ws <= to) {
    for (const s of drawWeek(state, ws)) if (s.date >= start) shows.push(s);
    ws = addWeeks(ws, 1);
  }
  return { shows, drawnTo: addWeeks(ws, -1) };
}

/** For the calendar grid: is `d` inside the month (year, 0-based month)? */
export const inMonth = (d: Day, y: number, m: number): boolean => yearOf(d) === y && monthOf(d) === m;
export { dateOf, daysBetween };
