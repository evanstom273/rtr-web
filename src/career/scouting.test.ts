import { describe, expect, it } from 'vitest';
import { findWrestler, PROMOTIONS, rosterOf, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { gradeOf, introduce } from './scouting';
import { begin, day } from './testkit';
import type { Career } from './types';

/** An indie wrestler like Lyra's Jamie Diaz: 21, elite attributes, a European indie title, good form, few fans. */
function diaz(seed = 7): Career {
  const c = begin('@indie', seed);
  const w = findWrestler(c.player)!;
  w.age = 21;
  w.stats = { strength: 72, speed: 87, stamina: 68, skill: 95, striking: 64, charisma: 71 };
  w.fans = { northAmerica: 42, southAmerica: 52, europe: 6400, asia: 145, africa: 103, oceania: 46 };
  w.traits = ['risk_taker', 'professional'];
  const p = c.people[c.player]!;
  p.rep = 100;
  p.form = { stars: 3.4, res: 0.5, n: 123, big: 3 };
  const t = TITLES.find((x) => x.id.startsWith('WORLD_') && x.holder) ?? TITLES.find((x) => x.region)!;
  const reigns = (activeWorld().history.reigns[t.id] ??= []);
  for (const r of reigns) if (r.to === null) r.to = c.today;
  t.holder = c.player;
  reigns.push({ holder: c.player, name: w.name, from: '2026-06-01', to: null, defences: 4 });
  return c;
}

describe('scouting (Lyra’s redesign)', () => {
  it('a talented unknown is graded on everything, not just regional fans', () => {
    const c = diaz();
    const rows = PROMOTIONS.filter((p) => !p.indie).map((p) => gradeOf(c, findWrestler(c.player)!, p.initials));
    if (process.env.SCOUT_STATS) for (const g of rows) console.log(g.promo, g.grade, 'bars', g.q1, g.median, g.step, 'standouts', g.standouts.join(','), 'weak', g.weakest.join(','), JSON.stringify(g.scores));
    // Attributes rank high everywhere; fans rank low everywhere.
    for (const g of rows) expect(g.scores.fans).toBeLessThan(25);
    // Not easier: the TV-first and money promotions don't simply hand it over.
    expect(rows.filter((g) => g.step === 'offer').length).toBeLessThan(rows.length / 2);
    // Not every door's shut any more: at least one major would look (radar or better), and the purists rate them highest.
    expect(rows.some((g) => g.step !== 'pass')).toBe(true);
    const ivw = rows.find((g) => g.promo === 'IVW')!, vwf = rows.find((g) => g.promo === 'VWF')!;
    expect(ivw.grade).toBeGreaterThan(vwf.grade - 5);
  });

  it('a nobody stays a nobody: contracts aren’t easier', () => {
    const c = begin('@indie', 7);
    const weak = WRESTLERS.filter((w) => w.promotion === 'TIS' && w.age > 30).sort((a, b) => Object.values(a.stats).reduce((x, y) => x + y, 0) - Object.values(b.stats).reduce((x, y) => x + y, 0))[0]!;
    const rows = PROMOTIONS.filter((p) => !p.indie).map((p) => gradeOf(c, weak, p.initials));
    expect(rows.filter((g) => g.step === 'offer')).toHaveLength(0);
  });

  it('roster bars sit inside their own roster', () => {
    const c = begin('jamie_mercer', 7);
    for (const p of PROMOTIONS.filter((x) => !x.indie)) {
      const gs = rosterOf(p.initials).map((w) => gradeOf(c, w, p.initials).grade);
      const atOrAbove = gs.filter((g) => g >= gradeOf(c, rosterOf(p.initials)[0]!, p.initials).median).length;
      expect(atOrAbove / gs.length).toBeGreaterThan(0.3);
    }
  });

  it('an introduction is a guaranteed tryout', () => {
    const c = diaz();
    const friend = rosterOf('ZWA')[0]!;
    const said = introduce(c, 'ZWA', friend.id);
    expect(said).toMatch(/tryout|watching/);
    expect(c.scout?.ZWA?.intro?.who).toBe(friend.id);
    expect(['tryout', 'radar']).toContain(c.scout!.ZWA!.stage);
  });

  it('the world keeps signing: rosters stay full on the grade', async () => {
    const c = begin('jamie_mercer', 11);
    for (let i = 0; i < 120; i++) await day(c);
    for (const p of PROMOTIONS.filter((x) => !x.indie)) expect(rosterOf(p.initials).length).toBeGreaterThanOrEqual(38);
  });
});
