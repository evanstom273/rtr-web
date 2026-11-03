// Regional indie titles: crowned when a world starts, defended only on indie shows in their region,
// challenged for by whoever's been working there (not by where they were born), and, with the other
// indie titles, defended often enough under the ten-shows-a-week cap. Older saves get them too.
import { describe, expect, it } from 'vitest';
import { TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld, freshWorld, setWorld, WORLD_REV } from '../world/world';
import { isIndieTitle, regionalEligible, titleClass, titleRegion } from './booker';
import { addDays, daysBetween } from './dates';
import { REGION_OF } from './places';
import { askableIndieTitles, previewIndieTitle, startCareer } from './index';
import { begin, day, who } from './testkit';
import type { Day } from './dates';

const regional = () => TITLES.filter((t) => t.region);

describe('regional indie titles', () => {
  it('twelve of them, a world and a women’s title for each region, all held from the start by someone from there', () => {
    begin('jamie_mercer', 7);
    expect(regional()).toHaveLength(12);
    for (const t of regional()) {
      expect(titleClass(t.id)).toBe('regional');
      expect(isIndieTitle(t.id)).toBe(true);
      const champ = WRESTLERS.find((w) => w.id === t.holder)!;
      expect(champ, t.id).toBeDefined();
      expect(champ.promotion).toBe('TIS');
      expect(champ.region).toBe(t.region);
      expect(champ.gender).toBe(t.gender);
    }
    const held = TITLES.filter((t) => t.holder).map((t) => t.holder);
    expect(new Set(held).size).toBe(held.length);
  });

  it('eligibility is where you’ve been wrestling: a Japanese wrestler working Europe can chase the European title', () => {
    const c = begin('jamie_mercer', 7);
    const jp = WRESTLERS.find((w) => w.promotion === 'TIS' && w.country === 'Japan')!;
    const p = c.people[jp.id]!;
    expect(regionalEligible(c, jp, 'asia', c.today)).toBe(true); // a fresh record: judged by home
    expect(regionalEligible(c, jp, 'europe', c.today)).toBe(false);
    p.circuit = [0, 10, 20, 30].map((d) => ({ r: 'europe' as const, d: addDays(c.today, -d) }));
    expect(regionalEligible(c, jp, 'europe', c.today)).toBe(true);
    expect(regionalEligible(c, jp, 'asia', c.today)).toBe(false); // working Europe now, not home
    // Old dates don't count.
    p.circuit = [200, 210, 220].map((d) => ({ r: 'europe' as const, d: addDays(c.today, -d) }));
    expect(regionalEligible(c, jp, 'europe', c.today)).toBe(false);
  });

  it('a free agent asking for a regional title is told where it’s defended and what it takes', () => {
    const c = begin('@indie', 11);
    const me = WRESTLERS.find((w) => w.id === c.player)!;
    const titles = askableIndieTitles(c);
    expect(titles.length).toBe(TITLES.filter((t) => isIndieTitle(t.id) && t.gender === me.gender).length);
    // The worldwide ones come first, then the regions you can challenge in.
    expect(titleRegion(titles[0])).toBeUndefined();
    const far = titles.find((t) => t.region && t.region !== me.region)!;
    const there = Object.values(c.shows).find((s) => s.promo === 'TIS' && s.region === titleRegion(far) && s.date > addDays(c.today, 8))!;
    expect(previewIndieTitle(c, far.id, there.id).hard).toMatch(/Work 3 dates in/);
    const elsewhere = Object.values(c.shows).find((s) => s.promo === 'TIS' && s.region !== titleRegion(far) && s.date > addDays(c.today, 8))!;
    expect(previewIndieTitle(c, far.id, elsewhere.id).hard).toMatch(/only defended in/);
  });

  it('three years under the weekly cap: regional titles only defended in their region, and all fifteen indie titles defended steadily (injuries aside)', async () => {
    for (const seed of [7, 11, 23]) {
      const c = begin('jamie_mercer', seed);
      const start = c.today;
      // Days each title's champion was out injured (a champion keeps the belt while hurt).
      const hurt: Record<string, Set<Day>> = {};
      for (let i = 0; i < 365 * 3; i++) {
        for (const t of TITLES) { const p = t.holder ? c.people[t.holder] : undefined; if (p?.injury && p.injury.until > c.today) (hurt[t.id] ??= new Set()).add(c.today); }
        await day(c);
      }
      const H = activeWorld().history;
      const years = daysBetween(start, c.today) / 365;
      for (const t of TITLES.filter((x) => isIndieTitle(x.id))) {
        const bouts: Day[] = [];
        for (const s of H.shows) for (const b of s.bouts) {
          if (b.title !== t.id) continue;
          bouts.push(s.date);
          if (t.region) expect(REGION_OF[s.country], `${t.id} on ${s.name} in ${s.country}`).toBe(titleRegion(t));
        }
        bouts.sort();
        expect(bouts.length / years, `${t.id} (seed ${seed}) matches a year`).toBeGreaterThanOrEqual(5);
        // The longest stretch without a defence, not counting days the champion was injured.
        const marks = [start, ...bouts, c.today];
        const gaps = marks.slice(1).map((d, i) => daysBetween(marks[i]!, d) - [...(hurt[t.id] ?? [])].filter((x) => x > marks[i]! && x < d).length);
        expect(Math.max(...gaps), `${t.id} (seed ${seed}) longest gap`).toBeLessThanOrEqual(90);
        // Never vacant for long: every reign starts within a month of the last one ending.
        const reigns = H.reigns[t.id] ?? [];
        for (let i = 1; i < reigns.length; i++) expect(daysBetween(reigns[i - 1]!.to!, reigns[i]!.from), `${t.id} vacant`).toBeLessThanOrEqual(30);
      }
    }
  }, 600000);

  it('an older save gets the twelve, crowned from its own indies, with reigns from today', () => {
    const w = freshWorld(5);
    setWorld(w);
    const c = startCareer({ player: who('jamie_mercer'), today: '2026-11-03', seed: 5 });
    w.career = c;
    for (let i = 0; i < 3; i++) c.today = addDays(c.today, 1);
    // How a rev-3 save looked: no regional titles.
    const old = structuredClone(w);
    old.rev = 3;
    old.db.titles = old.db.titles.filter((t) => !t.region);
    const tis = old.db.promotions.find((p) => p.indie)!;
    tis.titles = tis.titles.filter((id) => !id.includes('AN_INDEPENDENT') && !id.startsWith('ASIAN') && !id.startsWith('EUROPEAN') && !id.startsWith('OCEANIC'));
    for (const id of Object.keys(old.history.reigns)) if (!old.db.titles.some((t) => t.id === id)) delete old.history.reigns[id];
    setWorld(old);
    expect(old.rev).toBe(WORLD_REV);
    expect(regional()).toHaveLength(12);
    expect(tis.titles).toHaveLength(15);
    for (const t of regional()) {
      expect(t.holder, t.id).toBeTruthy();
      expect(activeWorld().history.reigns[t.id]!.at(-1)!.from).toBe(c.today);
      expect(old.career!.titles[t.id]!.since).toBe(c.today);
    }
  });
});
