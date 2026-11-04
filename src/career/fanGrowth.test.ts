import { describe, expect, it } from 'vitest';
import { FAN_REGIONS, fansTotal, WRESTLERS, type Wrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { audience, eventFans, matchFans } from './fanGrowth';
import { begin, day } from './testkit';
import type { Show } from './types';

const show = (o: Partial<Show>) => ({ promo: 'TCG', kind: 'weekly', region: 'northAmerica', date: '2026-11-03', ...o }) as Show;
const someone = (fans: Partial<Record<(typeof FAN_REGIONS)[number], number>>): Wrestler => {
  const w = structuredClone(WRESTLERS.find((x) => x.promotion === 'TIS' && !x.traits?.includes('crowd_pleaser'))!);
  w.fans = Object.fromEntries(FAN_REGIONS.map((r) => [r, fans[r] ?? 0])) as unknown as Wrestler['fans'];
  return w;
};

describe('fan growth (Lyra’s brief: regional, saturating, bigger stages reach more, no runaway)', () => {
  it('bigger promotions, home shows and bigger nights reach more people; so do bigger indie brands', () => {
    begin('@indie');
    expect(audience(show({ promo: 'TCG' }))).toBeGreaterThan(audience(show({ promo: 'UFC' })));
    expect(audience(show({ promo: 'TCG', region: 'northAmerica' }))).toBeGreaterThan(audience(show({ promo: 'TCG', region: 'asia' })));
    expect(audience(show({ kind: 'flagship', promo: 'VWF', date: '2026-11-07' }))).toBeGreaterThan(audience(show({ promo: 'VWF' })));
    const brands = Object.values(activeWorld().people!.brands).sort((a, b) => a.popularity! - b.popularity!);
    const small = audience(show({ promo: 'TIS', kind: 'indie', brand: brands[0]!.id }));
    const big = audience(show({ promo: 'TIS', kind: 'indie', brand: brands.at(-1)!.id }));
    expect(big).toBeGreaterThan(small);
    expect(small).toBeGreaterThanOrEqual(250);
    expect(big).toBeLessThanOrEqual(16000);
  });

  it('a match’s fans come mostly where the show is; better matches and wins bring more', () => {
    begin('@indie');
    const s = show({ promo: 'TIS', kind: 'indie', region: 'europe' });
    const gain = (stars: number, won: boolean) => { const w = someone({ europe: 500 }); return matchFans(w, s, stars, won, !won, false); };
    expect(gain(4, true)).toBeGreaterThan(gain(3, true));
    expect(gain(3, true)).toBeGreaterThan(gain(3, false));
    const w = someone({ europe: 500, asia: 10 });
    matchFans(w, s, 3, true, false, false);
    expect(w.fans.asia).toBe(10);
    expect(w.fans.europe).toBeGreaterThan(500);
  });

  it('a following saturates against the audience it works in front of', () => {
    begin('@indie');
    const s = show({ promo: 'TIS', kind: 'indie', region: 'europe' });
    const a = audience(s);
    const fresh = someone({ europe: 500 }), packed = someone({ europe: Math.round(a * 20) });
    expect(matchFans(fresh, s, 3.5, true, false, false)).toBeGreaterThan(0);
    expect(matchFans(packed, s, 3.5, true, false, false)).toBe(0);
  });

  it('a five-star indie match reaches a little further, but doesn’t make a global star', () => {
    begin('@indie');
    const w = someone({ europe: 500, northAmerica: 40, asia: 5 });
    const before = fansTotal(w);
    const got = matchFans(w, show({ promo: 'TIS', kind: 'indie', region: 'europe' }), 5, true, false, false);
    expect(got).toBeGreaterThan(0);
    expect(w.fans.northAmerica).toBeGreaterThan(40);
    expect(fansTotal(w) - before).toBeLessThan(600);
  });

  it('a real stinker costs a few; events move a share with a floor', () => {
    begin('@indie');
    const w = someone({ europe: 10000 });
    expect(matchFans(w, show({ promo: 'TIS', kind: 'indie', region: 'europe' }), 1, false, true, false)).toBe(-30);
    const n = someone({ europe: 100 });
    expect(eventFans(n, 'europe', 1)).toBe(15);
    const big = someone({ europe: 100000 });
    expect(eventFans(big, 'europe', 2)).toBe(3000);
  });

  it('a year of the world: the stars hold steady and nobody runs away', async () => {
    const c = begin('jamie_mercer', 11);
    const signed = () => WRESTLERS.filter((w) => w.promotion !== 'TIS' && !c.people[w.id]?.retired).map(fansTotal).sort((a, b) => a - b);
    const before = signed();
    for (let i = 0; i < 365; i++) await day(c);
    const after = signed();
    const med = (xs: number[]) => xs[Math.floor(xs.length / 2)]!;
    expect(med(after) / med(before)).toBeGreaterThan(0.8);
    expect(med(after) / med(before)).toBeLessThan(1.25);
    expect(after.at(-1)!).toBeLessThan(15_000_000);
  }, 300000);
});
