import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { begin as kitBegin } from '../testkit';
import { FEATURES } from '../tuning';
import { replyTo } from '../mail';
import { willingness } from '../contracts';
import { buyHome, switchTo } from './homes';
import { buyVehicle } from './garage';
import { buyLuxury, putIn } from './invest';
import { canBorrow } from './loans';
import { isBust, monthlyFall, sellDown } from './fall';
import { dailySure, monthlyRisk } from './risk';
import { life } from './state';

const was = FEATURES.life;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { life: boolean }).life = true; return c; };
beforeEach(() => { (FEATURES as { life: boolean }).life = true; });
afterEach(() => { (FEATURES as { life: boolean }).life = was; });

describe('Life stage 7: bad luck and the fall', () => {
  it('forced sales go in order: luxuries, then funds, then the rest', () => {
    const c = begin('buck_stratton');
    c.money = 2_000_000;
    buyLuxury(c, 'watch', 1);
    putIn(c, 'safe', 100_000);
    buyVehicle(c, 'car', false);
    const gone = sellDown(c, 10_000);
    expect(gone).toEqual(['a fine watch']);
    const more = sellDown(c, 50_000);
    expect(more[0]).toMatch(/safe fund/);
    expect(life(c).cars.length).toBe(1);
  });

  it('past the overdraft with nothing left to sell: bankrupt (debts wiped, no borrowing, worse deals)', () => {
    const c = begin('buck_stratton');
    c.money = 3_000_000;
    const L = life(c);
    buyHome(c, L.city, 'house', true);
    const h = L.homes.find((x) => x.own)!;
    switchTo(c, h.id);
    const before = willingness(c, c.people[c.player]!.contract!.promo);
    c.money = -5_000_000;
    monthlyFall(c);
    expect(L.homes.some((x) => x.own)).toBe(false);
    expect(isBust(c)).toBe(true);
    expect(c.money).toBeGreaterThanOrEqual(0);
    expect(L.loans.length).toBe(0);
    expect(L.credit).toBe(0);
    expect(canBorrow(c)).toBe(0);
    expect(willingness(c, c.people[c.player]!.contract!.promo)).toBeLessThan(before);
    expect(c.letters.some((l) => /declared bankrupt/.test(l.subject))).toBe(true);
  });

  it('ten years of bad luck: crashes, burglaries, fires and scams turn up, and nothing throws', () => {
    const c = begin('buck_stratton');
    c.money = 5_000_000;
    const L = life(c);
    buyHome(c, L.city, 'house', false);
    buyVehicle(c, 'car', false);
    buyLuxury(c, 'watch', 1);
    L.insure = { home: true, business: true };
    const subjects = new Set<string>();
    for (let y = 2027; y < 2037; y++) for (let m = 1; m <= 12; m++) {
      c.money = Math.max(c.money, 1_000_000);
      monthlyRisk(c, `${y}-${String(m).padStart(2, '0')}`);
      if (!L.cars.length) buyVehicle(c, 'car', false);
    }
    for (const l of c.letters) subjects.add(l.subject);
    expect([...subjects].some((s) => /sure thing|burgled|fire|car|bump|write-off/i.test(s))).toBe(true);
    // Fall for a scam: the money's gone (usually), and a letter says so.
    const scam = c.letters.find((l) => l.subject === 'A sure thing' && !l.replied);
    if (scam) {
      const m = c.money;
      replyTo(c, scam.id, 'scam_in');
      expect(c.money).toBeLessThan(m);
      c.today = '2040-01-01';
      dailySure(c);
      expect(c.letters.some((l) => /scam|Told you/.test(l.subject))).toBe(true);
    }
  });
});
