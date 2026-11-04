import { describe, expect, it } from 'vitest';
import { simMyMatch } from '../ui/career/simMine';
import { ordersOf, routineOf, skip } from './index';
import { begin, quick } from './testkit';

describe('while you’re away (Lyra’s call)', () => {
  it('an indie wrestler skipping a month still takes bookings and wrestles; with orders off, nothing', async () => {
    const run = async (on: boolean) => {
      const c = begin('@indie', 8);
      Object.assign(routineOf(c), { simMine: true, stopFor: { decisions: false, people: false, checkins: false, news: false } });
      const o = ordersOf(c);
      o.on = on;
      o.indie.reach = 'anywhere';
      const r = await skip(c, { days: 45 }, quick, { mine: async (x) => simMyMatch(x) });
      return { matches: c.history.length, handled: r.handled, stopped: r.stopped };
    };
    const away = await run(true), off = await run(false);
    expect(away.handled.some((h) => h.startsWith('Took '))).toBe(true);
    expect(away.matches).toBeGreaterThan(0);
    expect(off.matches).toBe(0);
  }, 300000);

  it('events, people and contracts follow their orders', async () => {
    const c = begin('jamie_mercer', 8);
    Object.assign(routineOf(c), { simMine: true, stopFor: { decisions: false, people: false, checkins: false, news: false } });
    const o = ordersOf(c);
    o.events = 'yes'; o.people = 'gracious';
    const r = await skip(c, { days: 40 }, quick, { mine: async (x) => simMyMatch(x) });
    const open = c.letters.filter((l) => (l.action?.type === 'event' || (l.replies?.length && !l.action)) && !l.done && !l.replied && l.day < c.today);
    expect(r.handled.length).toBeGreaterThan(0);
    expect(open.filter((l) => l.day < c.today).length).toBeLessThanOrEqual(1);
  }, 300000);
});
