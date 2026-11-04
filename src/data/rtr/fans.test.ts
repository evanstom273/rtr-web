import { describe, expect, it } from 'vitest';
import { BUDGET } from '../../career/clauses';
import { createdFans } from '../../career/fanStart';
import { makeRookie } from '../../career/create';
import { NEIGHBOURS } from '../../career/places';
import { begin, day } from '../../career/testkit';
import { seededRng } from '../../engine/rng';
import { activeWorld, freshWorld, setWorld, WORLD_REV } from '../../world/world';
import { makeIndie } from '../../world/populate';
import { FAN_REGIONS, fanScore, fansFromPopularity, fansFromScore, fansTotal, fmtFans, globalScore, PROMOTIONS, shippedDatabase, WRESTLERS, type Popularity } from './index';

describe('fans (Lyra’s call: real fan counts per region, worldwide is the sum)', () => {
  it('the conversion is exact: every regional score comes back as it was, and order never changes', () => {
    const scores = [0, 0.1, 5, 12.3, 20, 34.9, 35, 50, 61.5, 80, 95, 99.9];
    for (const s of scores) expect(fanScore({ fans: { ...fansFromPopularity({ global: 0, northAmerica: s, southAmerica: 0, europe: 0, asia: 0, africa: 0, oceania: 0 }) } }, 'northAmerica')).toBe(s);
    const fans = scores.map(fansFromScore);
    for (let i = 1; i < fans.length; i++) expect(fans[i]!).toBeGreaterThan(fans[i - 1]!);
    expect(fansFromScore(20)).toBe(1500);
    expect(fansFromScore(50)).toBe(47434);
    expect(fansFromScore(80)).toBe(1500000);
    expect(fmtFans(950)).toBe('950');
    expect(fmtFans(12400)).toBe('12k');
    expect(fmtFans(3400000)).toBe('3.4M');
  });

  it('the shipped 400 have fans and no old scores; worldwide is the sum of the six regions', () => {
    const db = shippedDatabase();
    expect(db.wrestlers).toHaveLength(400);
    for (const w of db.wrestlers) {
      expect(w.popularity).toBeUndefined();
      expect(fansTotal(w)).toBe(FAN_REGIONS.reduce((t, r) => t + w.fans[r], 0));
    }
    const hoffman = db.wrestlers.find((w) => w.name === 'Friedrich Hoffman')!;
    expect(Math.round(fansTotal(hoffman) / 1e5) / 10).toBe(3);
    const totals = db.wrestlers.map(fansTotal).sort((a, b) => a - b);
    expect(totals[200]!).toBeGreaterThan(500000);
    expect(totals[200]!).toBeLessThan(700000);
    // Promotions start at 10 + 70 × their old budget.
    for (const p of db.promotions) expect(p.popularity).toBe(Math.round((10 + 70 * BUDGET[p.initials]!) * 10) / 10);
  });

  it('an older save converts once: regional scores exactly as they were, promotions and brands get popularity', () => {
    const w = freshWorld(9);
    setWorld(w);
    // How a rev-6 save looked: 0–100 popularity, no promotion or brand popularity.
    const old = structuredClone(activeWorld());
    old.rev = 6;
    const before = new Map<string, Popularity>();
    for (const x of old.db.wrestlers) {
      const p = Object.fromEntries(FAN_REGIONS.map((r) => [r, fanScore(x, r)])) as unknown as Popularity;
      p.global = Math.round(FAN_REGIONS.reduce((t, r) => t + p[r], 0) / 6);
      before.set(x.id, p);
      x.popularity = p;
      delete (x as { fans?: unknown }).fans;
    }
    for (const p of old.db.promotions) delete p.popularity;
    for (const b of Object.values(old.people!.brands)) delete b.popularity;
    setWorld(old);
    expect(old.rev).toBe(WORLD_REV);
    for (const x of WRESTLERS) {
      const p = before.get(x.id)!;
      expect(x.popularity).toBeUndefined();
      for (const r of FAN_REGIONS) expect(fanScore(x, r), `${x.name} ${r}`).toBe(p[r]);
      // The old global was the regions' mean, rounded; the new one is the mean to 0.1.
      expect(Math.abs(globalScore(x) - p.global)).toBeLessThanOrEqual(0.5);
    }
    for (const p of PROMOTIONS) expect(p.popularity).toBe(Math.round((10 + 70 * (BUDGET[p.initials] ?? 0.5)) * 10) / 10);
    for (const b of Object.values(old.people!.brands)) {
      expect(b.popularity).toBeGreaterThanOrEqual(5);
      expect(b.popularity).toBeLessThanOrEqual(30);
    }
    const once = JSON.stringify(old);
    setWorld(old);
    expect(JSON.stringify(activeWorld())).toBe(once);
  });

  it('someone new starts with most of their fans at home, a few next door and hardly any elsewhere', () => {
    setWorld(freshWorld(3));
    const rnd = seededRng(5);
    for (let i = 0; i < 40; i++) {
      const w = makeIndie(rnd, WRESTLERS, `t_${i}`);
      const home = FAN_REGIONS.find((r) => FAN_REGIONS.every((q) => w.fans[q] <= w.fans[r]))!;
      expect(w.fans[home]).toBeGreaterThanOrEqual(fansFromScore(8) - 1);
      expect(w.fans[home]).toBeLessThanOrEqual(fansFromScore(34) + 1);
      for (const r of FAN_REGIONS) {
        if (r === home) continue;
        expect(w.fans[r]).toBeLessThanOrEqual(Math.ceil(w.fans[home] * (NEIGHBOURS[home].includes(r) ? 0.15 : 0.03)));
      }
    }
    const rookie = makeRookie(rnd, WRESTLERS, 'r_1');
    expect(Math.max(...FAN_REGIONS.map((r) => rookie.fans[r]))).toBeLessThanOrEqual(1200);
    const made = createdFans('europe');
    expect(made.europe).toBe(500);
    for (const r of FAN_REGIONS) if (r !== 'europe') expect(made[r]).toBe(NEIGHBOURS.europe.includes(r) ? 25 : 5);
  });

  it('promotion popularity moves a point a month at most, stays 10–95, and signed fees don’t move with it', async () => {
    const c = begin('jamie_mercer', 7);
    const start = new Map(PROMOTIONS.map((p) => [p.initials, p.popularity!]));
    const fee = c.people[c.player]!.contract!.fee;
    for (let i = 0; i < 95; i++) await day(c);
    for (const p of PROMOTIONS) {
      if (p.indie) continue;
      expect(p.popularity!).toBeGreaterThanOrEqual(10);
      expect(p.popularity!).toBeLessThanOrEqual(95);
      expect(Math.abs(p.popularity! - start.get(p.initials)!)).toBeLessThanOrEqual(3.01);
    }
    expect(c.people[c.player]!.contract!.fee).toBe(fee);
  }, 120000);
});
