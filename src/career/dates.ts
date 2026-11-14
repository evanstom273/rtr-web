// The calendar (Lyra's call): four weeks a month, 48 a year, and a week is the game's tick, with an AM (yours) and a
// PM (show night). A Day is still a 'YYYY-MM-DD' string in UTC, so it sorts, compares and saves as text: it's the first
// day of its week, the 1st, 8th, 15th or 22nd. Any other date (a real one, from data) reads as the week it falls in
// (the 29th–31st as week 4).
//
// Day counts everywhere else still read as days: a week is seven of them (a month 28, a year 336). So "30 days" is
// four weeks, "a day later" is the next week, and `daysBetween` is seven a week.
export type Day = string;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type MonthName = (typeof MONTHS)[number];

/** Weeks in a month, days in a week, days in a year (48 weeks). */
export const WEEKS_A_MONTH = 4;
export const WEEK_DAYS = 7;
export const YEAR_DAYS = 48 * WEEK_DAYS;
const STARTS = [1, 8, 15, 22] as const;

const pad = (n: number) => String(n).padStart(2, '0');
const raw = (y: number, m: number, d: number): Day => `${y}-${pad(m + 1)}-${pad(d)}`;

export const yearOf = (d: Day): number => Number(d.slice(0, 4));
/** 0-based month. */
export const monthOf = (d: Day): number => Number(d.slice(5, 7)) - 1;
/** The week of its month, 1–4. */
export const weekOf = (d: Day): number => Math.min(WEEKS_A_MONTH, Math.floor((Number(d.slice(8, 10)) - 1) / WEEK_DAYS) + 1);
/** The day of the month the week starts on (1, 8, 15 or 22). */
export const dateOf = (d: Day): number => STARTS[weekOf(d) - 1]!;

/** A day as the week it falls in (y, 0-based m, d). */
export function dayOf(y: number, m: number, d: number): Day {
  return raw(y, m, STARTS[Math.min(WEEKS_A_MONTH, Math.floor((d - 1) / WEEK_DAYS) + 1) - 1]!);
}
/** The week a date falls in. */
export const norm = (d: Day): Day => dayOf(yearOf(d), monthOf(d), Number(d.slice(8, 10)));
/** Week `w` (1–4) of a month. */
export const weekIn = (y: number, m: number, w: number): Day => raw(y, m, STARTS[Math.max(1, Math.min(WEEKS_A_MONTH, w)) - 1]!);

const index = (d: Day): number => (yearOf(d) * 12 + monthOf(d)) * WEEKS_A_MONTH + weekOf(d) - 1;
function fromIndex(i: number): Day {
  const w = ((i % WEEKS_A_MONTH) + WEEKS_A_MONTH) % WEEKS_A_MONTH, mm = (i - w) / WEEKS_A_MONTH;
  const y = Math.floor(mm / 12);
  return raw(y, mm - y * 12, STARTS[w]!);
}

/** The player's real-world date today, as its week (a career starts in the week you start it). */
export function todayReal(now = new Date()): Day {
  return dayOf(now.getFullYear(), now.getMonth(), now.getDate());
}

export const toDate = (d: Day): Date => new Date(`${d}T00:00:00Z`);

export const addWeeks = (d: Day, n: number): Day => fromIndex(index(d) + n);
/** `n` days on, in whole weeks (any day at all is at least a week; 30 days is four weeks). */
export function addDays(d: Day, n: number): Day {
  if (!n) return norm(d);
  return addWeeks(d, Math.sign(n) * Math.max(1, Math.round(Math.abs(n) / WEEK_DAYS)));
}
export const weeksBetween = (a: Day, b: Day): number => index(b) - index(a);
/** Days between two weeks: seven a week. */
export const daysBetween = (a: Day, b: Day): number => weeksBetween(a, b) * WEEK_DAYS;
/** A day's chance as the week's (it's rolled once a week now): 1 − (1 − p)^7. */
export const perWeek = (pDay: number): number => 1 - (1 - Math.max(0, Math.min(1, pDay))) ** WEEK_DAYS;
/** Years between two days (48 weeks a year). */
export const yearsBetween = (a: Day, b: Day): number => weeksBetween(a, b) / 48;
/**
 * Every week reads as a Monday: the old "on Mondays" weekly checks run every week. Nothing in the game is on any other
 * weekday any more.
 */
export const weekday = (_d: Day): number => 1;
export const weekdayName = (d: Day): Weekday => WEEKDAYS[weekday(d)]!;
export const daysInMonth = (_y: number, _m: number): number => WEEKS_A_MONTH * WEEK_DAYS;
export const monthIndex = (name: string): number => MONTHS.indexOf(name as MonthName);
export const weekdayIndex = (name: string): number => WEEKDAYS.indexOf(name as Weekday);

/** The same week of the month, `n` months on. */
export function addMonths(d: Day, n: number): Day {
  return addWeeks(d, n * WEEKS_A_MONTH);
}

/** The week a day falls in (it used to be that week's Monday). */
export const weekStart = (d: Day): Day => norm(d);

const MON = (d: Day) => MONTHS[monthOf(d)]!;
/**
 * 'short': "Wk 2 · Nov 2026"; 'long': "Week 2 of November 2026"; 'dm': "Wk 2 Nov".
 */
export function fmtDay(d: Day, style: 'short' | 'long' | 'dm' = 'short'): string {
  const w = weekOf(d);
  if (style === 'dm') return `Wk ${w} ${MON(d).slice(0, 3)}`;
  if (style === 'long') return `Week ${w} of ${MON(d)} ${yearOf(d)}`;
  return `Wk ${w} · ${MON(d).slice(0, 3)} ${yearOf(d)}`;
}
