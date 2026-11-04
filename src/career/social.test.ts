import { describe, expect, it } from 'vitest';
import { FAN_REGIONS, fansTotal, findWrestler, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { addDays } from './dates';
import { matchFans } from './fanGrowth';
import { previewChallenge, socialAct, socialPreview, socialWeekCap } from './index';
import { begin } from './testkit';
import type { Career, Show } from './types';

const setAll = (c: Career, home: number, region: (typeof FAN_REGIONS)[number] = 'europe') => { const me = findWrestler(c.player)!; for (const r of FAN_REGIONS) me.fans[r] = r === region ? home : Math.round(home * 0.02); };
const kinds = ['post', 'reply', 'promote', 'callout', 'beef', 'post', 'reply'] as const;

describe('social media (Lyra’s brief: optional, light, never better than wrestling)', () => {
  it('one action a day; the same kind again within a week is half as good; a weekly cap', () => {
    const c = begin('@indie');
    setAll(c, 500);
    const first = socialAct(c, 'post');
    expect(first.fans).toBeGreaterThan(0);
    expect(first.fans).toBeLessThanOrEqual(5);
    expect(socialAct(c, 'post').text).toMatch(/already posted today/);
    c.today = addDays(c.today, 1);
    expect(socialPreview(c, 'post').fans).toBeLessThanOrEqual(Math.ceil(first.fans / 2) + 1);
    // A week of posting never passes the cap.
    const me = findWrestler(c.player)!;
    const start = fansTotal(me);
    for (let i = 0; i < 7; i++) { c.today = addDays(c.today, 1); socialAct(c, 'post'); }
    expect(fansTotal(me) - start).toBeLessThanOrEqual(Math.ceil(socialWeekCap(me)) * 2);
  });

  it('promoting your match lifts that show’s fans; calling someone out makes a match with them easier to ask for', () => {
    const c = begin('jamie_mercer');
    const show = { promo: 'VWF', kind: 'weekly', region: 'northAmerica', date: c.today, id: 'x' } as Show;
    const w1 = structuredClone(findWrestler(c.player)!), w2 = structuredClone(findWrestler(c.player)!);
    for (const r of FAN_REGIONS) { w1.fans[r] = 20000; w2.fans[r] = 20000; }
    expect(matchFans(w2, show, 3, true, false, false, 1.15)).toBeGreaterThan(matchFans(w1, show, 3, true, false, false));
    const target = WRESTLERS.find((w) => w.promotion === 'VWF' && w.id !== c.player)!;
    const later = Object.values(c.shows).find((s) => s.promo === 'VWF' && s.date > addDays(c.today, 8))!;
    const before = previewChallenge(c, target.id, later.id).chance;
    socialAct(c, 'callout', target.id);
    expect(previewChallenge(c, target.id, later.id).chance).toBeGreaterThan(before);
  });

  it('call-outs and beefs can backfire (the same way every time for the same day)', () => {
    let backfires = 0;
    for (let d = 0; d < 60; d++) {
      const c = begin('@indie');
      c.today = addDays(c.today, d);
      setAll(c, 5000);
      const target = WRESTLERS.find((w) => w.id !== c.player && w.promotion === 'TIS')!;
      const r = socialAct(c, 'beef', target.id);
      if (r.backfired) { backfires++; expect(r.fans).toBeLessThan(0); }
    }
    expect(backfires).toBeGreaterThan(3);
    expect(backfires).toBeLessThan(30);
  });

  it('over a year, posting on top of wrestling adds at most a third; posting alone is worth far less than wrestling', () => {
    for (const home of [500, 3_000_000]) {
      const c = begin('@indie');
      const me = findWrestler(c.player)!;
      const show = (home > 100000
        ? { promo: 'TCG', kind: 'weekly', region: 'northAmerica', date: c.today }
        : { promo: 'TIS', kind: 'indie', region: 'europe', date: c.today, brand: Object.values(activeWorld().people!.brands).sort((a, b) => a.popularity! - b.popularity!)[Math.floor(Object.keys(activeWorld().people!.brands).length / 2)]!.id }) as Show;
      const perMonth = home > 100000 ? 6 : 2;
      const run = (wrestle: boolean, post: boolean) => {
        setAll(c, home, home > 100000 ? 'northAmerica' : 'europe');
        c.social = undefined;
        const start = fansTotal(me);
        const day0 = c.today;
        for (let d = 0; d < 365; d++) {
          c.today = addDays(day0, d);
          if (post) socialAct(c, kinds[d % kinds.length]!, WRESTLERS.find((w) => w.id !== c.player)!.id);
          if (wrestle && d % Math.round(30 / perMonth) === 0) matchFans(me, show, 3, d % 2 === 0, d % 2 === 1, false);
        }
        c.today = day0;
        return fansTotal(me) - start;
      };
      const wrestling = run(true, false), both = run(true, true), posting = run(false, true);
      expect(posting, `posting alone (${home})`).toBeLessThan(wrestling);
      expect(both / wrestling, `both against wrestling (${home})`).toBeLessThanOrEqual(1.35);
    }
  });
});
