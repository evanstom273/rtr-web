// Booker mode, stage 1 (Lyra's design): every promotion's a company with an owner; you can found your own, take one
// on (one major and one indie at most), set its schedule, and booking takes office hours out of your week.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROMOTIONS, rosterOf, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bookerOf } from '../world/people';
import { activityAt } from './day';
import { canRun, companyOf, foundPromotion, leaveRole, nightRule, officeNeed, officeOf, rolesOf, scheduleOf, setSchedule, takeRole } from './company';
import { addDays, weekday } from './dates';
import { begin, day, quick } from './testkit';
import { FEATURES, FOUND } from './tuning';

let was = false;
beforeEach(() => { was = FEATURES.booker; FEATURES.booker = true; });
afterEach(() => { FEATURES.booker = was; });

const found = (c: ReturnType<typeof begin>, extra: Partial<Parameters<typeof foundPromotion>[1]> = {}) =>
  foundPromotion(c, { name: 'Northern Lights Wrestling', initials: 'NLW', country: 'UK', city: 'Leeds', capital: 3000, night: { every: 'weekly', day: 'Saturday' }, ...extra });

describe('booker mode: foundations', () => {
  it('every promotion is a company with an owner and a tier', () => {
    begin('@indie', 7);
    for (const p of PROMOTIONS.filter((x) => !x.indie)) {
      const co = companyOf(p.initials)!;
      expect(co).toBeTruthy();
      expect(['local', 'regional', 'national', 'global']).toContain(co.tier);
      const owner = activeWorld().people!.staff[co.owner]!;
      expect(owner.job).toEqual({ kind: 'owner', promo: p.initials });
    }
    expect(companyOf('TCG')!.tier).toBe('global');
  });

  it('you can found your own promotion: real, on the calendar, in your home town, booked from free agents', async () => {
    const c = begin('@indie', 7);
    c.money = 10_000;
    expect(found(c, { capital: 500 })).toContain(`at least`);
    expect(found(c)).toContain('open for business');
    expect(c.money).toBe(7000);
    expect(PROMOTIONS.some((p) => p.initials === 'NLW')).toBe(true);
    const co = companyOf('NLW')!;
    expect(co).toMatchObject({ owner: 'player', booker: 'player', tier: 'local', bank: 3000 });
    expect(rolesOf(c)).toEqual([{ promo: 'NLW', as: 'owner', since: c.today }]);
    const shows = Object.values(c.shows).filter((s) => s.promo === 'NLW');
    expect(shows.length).toBeGreaterThan(3);
    expect(shows.every((s) => s.city === 'Leeds' && weekday(s.date) === 6)).toBe(true);
    // The same initials can't be used twice; nor can you run a second indie.
    expect(found(c, { name: 'Other' })).toContain('taken');
    expect(found(c, { name: 'Other', initials: 'OTH' })).toContain('one at a time');
    // A week or so on, its first show has a card of free agents from the region (it has no roster yet).
    for (let i = 0; i < 14 && !shows.some((s) => s.done); i++) await day(c, quick, 'simmed');
    const done = Object.values(c.shows).find((s) => s.promo === 'NLW' && s.card?.length);
    expect(done).toBeTruthy();
    expect(done!.card!.every((b) => WRESTLERS.find((w) => w.id === b.a)?.promotion === 'TIS')).toBe(true);
    expect(rosterOf('NLW').length).toBe(0); // nobody signs for you: that's your job
    expect(FOUND.startPop).toBeGreaterThan(0);
  });

  it('one major and one indie at most; taking on someone else’s means their booker goes', () => {
    const c = begin('@indie', 7);
    const P = activeWorld().people!;
    const old = bookerOf(P, 'IVW')!;
    expect(takeRole(c, 'IVW', 'booker')).toContain('booker');
    expect(old.job).toBeNull();
    expect(companyOf('IVW')!.booker).toBe('player');
    expect(companyOf('IVW')!.owner).not.toBe('player');
    expect(canRun(c, 'VWF')).toContain('major');
    // Its schedule is now yours to change, starting from the usual one.
    expect(scheduleOf('IVW').length).toBeGreaterThan(0);
    // Leaving: someone else is hired to book it.
    leaveRole(c, 'IVW', 'quit');
    expect(bookerOf(P, 'IVW')).toBeTruthy();
    expect(companyOf('IVW')!.booker).toBeUndefined();
    expect(rolesOf(c)).toEqual([]);
  });

  it('a monthly turnover never hires a booker over you', async () => {
    const c = begin('@indie', 7);
    takeRole(c, 'END', 'booker');
    for (let i = 0; i < 40; i++) await day(c, quick, 'simmed');
    expect(bookerOf(activeWorld().people!, 'END')).toBeUndefined();
    expect(companyOf('END')!.booker).toBe('player');
  });

  it('changing the schedule redraws what’s more than a week out', () => {
    const c = begin('@indie', 7);
    c.money = 10_000;
    found(c);
    expect(setSchedule(c, 'NLW', [nightRule('A', 'weekly', 'Friday', c.today), nightRule('B', 'weekly', 'Saturday', c.today)])).toContain('at most');
    expect(setSchedule(c, 'NLW', [nightRule('NLW Fridays', 'weekly', 'Friday', c.today)])).toBe('Schedule saved.');
    const later = Object.values(c.shows).filter((s) => s.promo === 'NLW' && s.date >= addDays(c.today, 7));
    expect(later.length).toBeGreaterThan(2);
    expect(later.every((s) => weekday(s.date) === 5 && s.name === 'NLW Fridays')).toBe(true);
  });

  it('booking takes office hours, and missing them gets noticed', async () => {
    const c = begin('@indie', 7);
    c.money = 10_000;
    found(c);
    takeRole(c, 'IVW', 'booker');
    expect(officeNeed(c)).toBe(1 + 3);
    const o = officeOf(c);
    expect(o.slots.length).toBe(4);
    const [d, ph] = o.slots[0]!;
    let x = c.today;
    while (weekday(x) !== d) x = addDays(x, 1);
    expect(['office', 'show', 'travel']).toContain(activityAt(c, x, ph));
    // Clear the slots: next Monday, the staff covered.
    o.slots = [];
    for (let i = 0; i < 15; i++) await day(c, quick, 'simmed');
    expect(c.letters.some((l) => l.subject.startsWith('Your staff covered'))).toBe(true);
  });
});
