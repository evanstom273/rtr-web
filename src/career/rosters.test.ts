import { describe, expect, it } from 'vitest';
import { PROMOTIONS, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { begin, day } from './testkit';
import { ROSTER_FLOOR, ROSTER_SCOUT_DAYS, ROSTER_TARGET } from './tuning';

const roster = (p: string) => WRESTLERS.filter((w) => w.promotion === p);
const majors = () => PROMOTIONS.filter((x) => !x.indie).map((p) => p.initials);
const signings = (promo: string, since: string) => activeWorld().history.events.filter((e) => e.kind === 'signed' && e.promo === promo && e.day >= since);

describe('rosters (Lyra’s call): every major promotion aims for 38–40', () => {
  it('someone leaves and the promotion scouts a replacement from the same division, signed a week to three later', async () => {
    const c = begin('@indie');
    const start = c.today;
    const gone = roster('TCG').find((w) => w.gender === 'FEMALE' && !TITLES.some((t) => t.holder === w.id))!;
    gone.promotion = 'TIS';
    c.people[gone.id]!.contract = null;
    expect(roster('TCG')).toHaveLength(39);
    await day(c);
    expect(signings('TCG', start), 'not straight away: they go scouting first').toHaveLength(0);
    for (let i = 0; i < ROSTER_SCOUT_DAYS[1] + 1 && !signings('TCG', start).length; i++) await day(c);
    const [s] = signings('TCG', start);
    expect(s, 'a replacement signed within three weeks').toBeTruthy();
    expect(WRESTLERS.find((w) => w.id === s!.who)!.gender, 'the division that lost someone').toBe('FEMALE');
  }, 120000);

  it('under 38 they sign straight away, back up to 40 over the next weeks, and never past it', async () => {
    const c = begin('@indie');
    for (const w of roster('VWF').filter((x) => !TITLES.some((t) => t.holder === x.id)).slice(0, 5)) {
      w.promotion = 'TIS';
      c.people[w.id]!.contract = null;
    }
    expect(roster('VWF')).toHaveLength(35);
    await day(c);
    expect(roster('VWF').length).toBeGreaterThanOrEqual(ROSTER_FLOOR);
    const low: string[] = [];
    for (let i = 0; i < 90; i++) {
      await day(c);
      for (const p of majors()) {
        const n = roster(p).length;
        if (n < ROSTER_FLOOR || n > ROSTER_TARGET) low.push(`${c.today} ${p} ${n}`);
      }
    }
    expect(low, 'every promotion 38–40 every night').toEqual([]);
    expect(roster('VWF')).toHaveLength(ROSTER_TARGET);
  }, 300000);
});
