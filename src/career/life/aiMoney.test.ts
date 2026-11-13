import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bringBack } from '../cut.testkit';
import { begin as kitBegin } from '../testkit';
import { FEATURES } from '../tuning';
import { findWrestler, WRESTLERS } from '../../data/rtr';
import { lifeWorld } from '../../world/lifeWorld';
import { mod } from '../career';
import { demand } from '../signing';
import { monthlyWealth, richList, styleOf, wealthOf, worthOf } from './aiMoney';

// The big cut hid this; the tests bring it back so the code keeps working.
let putBack = (): void => {};
beforeEach(() => { putBack = bringBack(); });
afterEach(() => putBack());

const was = FEATURES.life;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { life: boolean }).life = true; return c; };
beforeEach(() => { (FEATURES as { life: boolean }).life = true; });
afterEach(() => { (FEATURES as { life: boolean }).life = was; });
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

describe('Life stage 4: everyone’s money', () => {
  it('seeds everyone from their career so far: veterans on big deals are rich, rookies have next to nothing', () => {
    const c = begin('@indie');
    const all = wealthOf(c);
    expect(Object.keys(all).length).toBeGreaterThan(300);
    const signed = WRESTLERS.filter((w) => c.people[w.id]?.contract && w.age >= 30).map((w) => worthOf(all[w.id]));
    const young = WRESTLERS.filter((w) => w.age <= 22 && !c.people[w.id]?.contract).map((w) => worthOf(all[w.id]));
    expect(median(signed)).toBeGreaterThan(median(young) * 3);
  });

  it('ten years on: a rich list in the millions, the median signed wrestler comfortable, and some veterans broke', () => {
    const c = begin('@indie');
    for (let y = 2027; y < 2037; y++) for (let m = 1; m <= 12; m++) monthlyWealth(c, `${y}-${String(m).padStart(2, '0')}`);
    const all = wealthOf(c);
    const worths = Object.entries(all).map(([id, x]) => [id, worthOf(x)] as const).sort((a, b) => b[1] - a[1]);
    const top10 = worths.slice(0, 10).map(([, v]) => v);
    const signed = WRESTLERS.filter((w) => c.people[w.id]?.contract).map((w) => worthOf(all[w.id]));
    const vets = WRESTLERS.filter((w) => w.age >= 35);
    const broke = vets.filter((w) => all[w.id]?.broke).length / vets.length;
    console.log(`top ${Math.round(top10[0]! / 1e6)}M … ${Math.round(top10[9]! / 1e6)}M · median signed ${Math.round(median(signed) / 1000)}k · veterans broke ${(broke * 100).toFixed(1)}%`,
      `· styles ${['flash', 'careful', 'risky', 'normal'].map((s) => `${s} ${WRESTLERS.filter((w) => styleOf(w) === s).length}`).join(' ')}`);
    expect(top10[9]!).toBeGreaterThan(2_000_000);
    expect(top10[0]!).toBeLessThan(80_000_000);
    expect(median(signed)).toBeGreaterThan(60_000);
    expect(broke).toBeLessThan(0.25);
  });

  it('the rich list goes out in January, with you on it; the rich retire sooner and ask for more', () => {
    const c = begin('buck_stratton');
    c.money = 50_000_000;
    richList(c, '2027', 50_000_000);
    const L = lifeWorld();
    expect(L.rich?.at(-1)?.top[0]?.[0]).toBe(c.player);
    expect(c.letters.some((l) => /rich list/.test(l.subject))).toBe(true);
    const all = wealthOf(c);
    const someone = WRESTLERS.find((w) => w.id !== c.player && c.people[w.id]?.contract && !c.people[w.id]?.retired)!;
    all[someone.id] = { m: 5_000_000, a: 0, d: 0, h: 0, v: 0 };
    expect(mod('retire', c, someone.id)).toBeGreaterThan(1);
    const rich = demand(c, c.people[someone.id]!.contract!.promo, someone).fee;
    all[someone.id] = { m: -20_000, a: 0, d: 0, h: 0, v: 0, broke: '2027-01' };
    expect(mod('retire', c, someone.id)).toBeLessThan(1);
    expect(demand(c, c.people[someone.id]!.contract!.promo, someone).fee).toBeLessThan(rich);
    void findWrestler;
  });
});
