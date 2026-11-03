// Career days are plain 'YYYY-MM-DD' strings in UTC, so they sort, compare and save as text and no
// time zone or clock change can shift a show onto the wrong day.
export type Day = string;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type MonthName = (typeof MONTHS)[number];

const pad = (n: number) => String(n).padStart(2, '0');

export function dayOf(y: number, m: number, d: number): Day {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** The player's real-world date today (a career starts on the day you start it). */
export function todayReal(now = new Date()): Day {
  return dayOf(now.getFullYear(), now.getMonth(), now.getDate());
}

export const toDate = (d: Day): Date => new Date(`${d}T00:00:00Z`);
const fromDate = (t: Date): Day => dayOf(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());

export function addDays(d: Day, n: number): Day {
  const t = toDate(d);
  t.setUTCDate(t.getUTCDate() + n);
  return fromDate(t);
}

export const daysBetween = (a: Day, b: Day): number => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
export const weekday = (d: Day): number => toDate(d).getUTCDay();
export const weekdayName = (d: Day): Weekday => WEEKDAYS[weekday(d)]!;
export const yearOf = (d: Day): number => Number(d.slice(0, 4));
/** 0-based month. */
export const monthOf = (d: Day): number => Number(d.slice(5, 7)) - 1;
export const dateOf = (d: Day): number => Number(d.slice(8, 10));
export const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const monthIndex = (name: string): number => MONTHS.indexOf(name as MonthName);
export const weekdayIndex = (name: string): number => WEEKDAYS.indexOf(name as Weekday);

export function addMonths(d: Day, n: number): Day {
  const y = yearOf(d), m = monthOf(d) + n;
  const ty = y + Math.floor(m / 12), tm = ((m % 12) + 12) % 12;
  return dayOf(ty, tm, Math.min(dateOf(d), daysInMonth(ty, tm)));
}

/** The nth (1-based, or 'last') given weekday of a month, or null if there isn't one. */
export function nthWeekday(y: number, m: number, wd: number, nth: number | 'last'): Day | null {
  if (nth === 'last') {
    const last = daysInMonth(y, m);
    const lastWd = new Date(Date.UTC(y, m, last)).getUTCDay();
    return dayOf(y, m, last - ((lastWd - wd + 7) % 7));
  }
  const firstWd = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const date = 1 + ((wd - firstWd + 7) % 7) + (nth - 1) * 7;
  return date <= daysInMonth(y, m) ? dayOf(y, m, date) : null;
}

/** Monday of the week a day falls in. */
export const weekStart = (d: Day): Day => addDays(d, -((weekday(d) + 6) % 7));

export function fmtDay(d: Day, style: 'short' | 'long' | 'dm' = 'short'): string {
  const t = toDate(d);
  if (style === 'dm') return t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  if (style === 'long') return t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
