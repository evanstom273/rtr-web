import { describe, expect, it } from 'vitest';
import { chineseNumber, drawCalendar, romanNumber, type CalendarState } from './calendar';
import { weekdayName } from './dates';
import type { Show } from './types';

const fresh = (seed = 1): CalendarState => ({ seed, counters: {}, nextIrregular: {} });
const year = (seed = 1) => drawCalendar(fresh(seed), null, '2026-11-03', '2027-11-02').shows;
const of = (shows: Show[], promo: string) => shows.filter((s) => s.promo === promo);

describe('the calendar', () => {
  const shows = year();

  it('VWF runs Loaded on Mondays and Defiance on Thursdays', () => {
    const vwf = of(shows, 'VWF');
    expect(vwf.filter((s) => s.name === 'Loaded').every((s) => weekdayName(s.date) === 'Monday')).toBe(true);
    expect(vwf.filter((s) => s.name === 'Defiance').every((s) => weekdayName(s.date) === 'Thursday')).toBe(true);
  });

  it('VWF specials land where they should, and Anniversary replaces that Monday\'s Loaded', () => {
    const vwf = of(shows, 'VWF');
    const on = (d: string) => vwf.filter((s) => s.date === d).map((s) => s.name);
    expect(on('2026-12-07')).toEqual(['Anniversary']);
    expect(on('2027-02-06')).toEqual(['Ignition']);
    expect(on('2027-04-03')).toEqual(['Uprising']);
    expect(vwf.find((s) => s.name === 'Uprising')!.kind).toBe('flagship');
  });

  it('IVW: After Eight is the last Saturday of every month', () => {
    const ivw = of(shows, 'IVW');
    expect(ivw).toHaveLength(12);
    expect(ivw[0]!.name).toBe('IVW: After Eight — November');
    expect(ivw[0]!.date).toBe('2026-11-28');
    expect(ivw.every((s) => weekdayName(s.date) === 'Saturday')).toBe(true);
  });

  it('NWGP tours on the Road to Golden Challenge for four weeks, three shows a week', () => {
    const road = of(shows, 'NWGP').filter((s) => s.name === 'NWGP: Road to Golden Challenge' && s.date < '2027-01-01');
    expect(road).toHaveLength(12);
    expect(road.every((s) => s.date >= '2026-12-04' && s.kind === 'tour')).toBe(true);
    expect(of(shows, 'NWGP').find((s) => s.date === '2027-01-01')!.name).toBe('Golden Challenge');
  });

  it('UFC only tours in alternate months, numbering from 1 each month', () => {
    const ufc = of(shows, 'UFC');
    const months = new Set(ufc.map((s) => Number(s.date.slice(5, 7))));
    expect([...months].every((m) => m % 2 === 1)).toBe(true);
    expect(ufc[0]!.name).toBe('UFC: November 1');
    const jan = ufc.filter((s) => s.date.startsWith('2027-01'));
    expect(jan[0]!.name).toBe('UFC: January 1');
    expect(jan.length).toBeGreaterThanOrEqual(8);
  });

  it('ZWA counts its chapters in Chinese and never resets', () => {
    const zwa = of(shows, 'ZWA');
    expect(zwa[0]!.name).toBe('ZWA：第一章');
    expect(zwa[10]!.name).toBe('ZWA：第十一章');
    expect(zwa.every((s) => weekdayName(s.date) === 'Wednesday')).toBe(true);
  });

  it('ENDEAVOUR and AAWA run irregularly, inside their gaps', () => {
    const end = of(shows, 'END');
    expect(end.length).toBeGreaterThan(6);
    for (let i = 1; i < end.length; i++) {
      const gap = (Date.parse(end[i]!.date) - Date.parse(end[i - 1]!.date)) / 864e5;
      expect(gap).toBeGreaterThanOrEqual(21);
      expect(gap).toBeLessThanOrEqual(55);
    }
    expect(end.every((s) => weekdayName(s.date) === 'Sunday')).toBe(true);
    expect(of(shows, 'AAWA')[1]!.name).toBe('AAWA: Chapter II');
  });

  it('The Indie Scene runs 5–9 shows a week, all over the world, with real names', () => {
    const tis = of(shows, 'TIS');
    expect(tis.length).toBeGreaterThanOrEqual(5 * 50);
    expect(tis.length).toBeLessThanOrEqual(9 * 53);
    expect(new Set(tis.map((s) => s.country)).size).toBeGreaterThan(15);
    expect(tis.every((s) => s.kind === 'indie' && s.name.length > 3)).toBe(true);
  });

  it('A.R.I.S.E. happens on 5 May with both promotions', () => {
    const arise = shows.filter((s) => s.name.includes('A.R.I.S.E.'));
    expect(arise.some((s) => s.date === '2027-05-05')).toBe(true);
    expect(arise[0]!.promos).toEqual(['ZWA', 'NWGP']);
  });

  it('is the same every time for a seed, however it\'s drawn up', () => {
    const a = drawCalendar(fresh(9), null, '2026-11-03', '2027-03-01').shows;
    const st = fresh(9);
    const first = drawCalendar(st, null, '2026-11-03', '2026-12-31');
    const second = drawCalendar(st, first.drawnTo, '2026-11-03', '2027-03-01');
    const b = [...first.shows, ...second.shows].filter((s) => s.date <= second.drawnTo);
    expect(b.map((s) => s.id + s.name)).toEqual(a.filter((s) => s.date <= second.drawnTo).map((s) => s.id + s.name));
  });

  it('numbers in Chinese and Roman', () => {
    expect([1, 10, 11, 21, 100, 105, 120].map(chineseNumber)).toEqual(['一', '十', '十一', '二十一', '一百', '一百零五', '一百二十']);
    expect([1, 4, 9, 14, 40, 1994].map(romanNumber)).toEqual(['I', 'IV', 'IX', 'XIV', 'XL', 'MCMXCIV']);
  });
});
