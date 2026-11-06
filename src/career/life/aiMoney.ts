// Life stage 4: everyone's money. Every AI wrestler earns from their deal (or the indies), pays tax and lives by their
// personality: showboats spend, the methodical save. They buy homes, open businesses, and some go broke. Wealth
// changes when they retire and what they'll sign for. A rich list every January. Monthly and in aggregate (a few
// numbers each), so it costs next to nothing.
import { seededRng, hashSeed } from '../../engine/rng';
import { findWrestler, WRESTLERS, type Wrestler } from '../../data/rtr';
import { lifeWorld, type Wealth } from '../../world/lifeWorld';
import { letter, setMod } from '../career';
import { indieFee } from '../economy';
import { REGION_KEY } from '../places';
import { setDemandLift } from '../signing';
import { COST_INDEX, PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { on } from './state';
import { netWorth as netWorthOf } from './worth';
import { openAiSchool } from './school';

const money = (n: number) => (n >= 1e6 ? `£${(n / 1e6).toFixed(1)}m` : `£${Math.round(n / 1000)}k`);
const HOME_PRICE = [0, PB.buy.flat.price, PB.buy.house.price, PB.buy.penthouse.price, PB.buy.mansion.price];
const HOME_WEEK = [PB.rent.room.rent + PB.rent.room.bills, PB.buy.flat.bills, PB.buy.house.bills, PB.buy.penthouse.bills, PB.buy.mansion.bills];
const CAR_PRICE = [0, PB.vehicles.car.price, PB.vehicles.luxury_car.price, PB.vehicles.jet_share.price];
const CAR_MONTH = [0, PB.vehicles.car.monthly, PB.vehicles.luxury_car.monthly, PB.vehicles.jet_share.monthly];

type Style = 'flash' | 'careful' | 'risky' | 'normal';
export function styleOf(w: Wrestler): Style {
  const t = w.traits ?? [];
  if (t.includes('showboat') || t.includes('egotistical')) return 'flash';
  if (t.includes('professional') || t.includes('methodical') || t.includes('reliable')) return 'careful';
  if (t.includes('risk_taker')) return 'risky';
  return 'normal';
}
/** Of what's left after living, how much goes on the good life (the rest is saved). */
const SPEND: Record<Style, number> = { flash: 0.8, normal: 0.5, risky: 0.5, careful: 0.2 };
/** Lifestyle creep: a month's spending as a share of their cash. */
const CREEP: Record<Style, number> = { flash: 0.012, normal: 0.004, risky: 0.004, careful: 0.001 };
/** What their spare cash earns a month (the careful put it to work). */
const GROW: Record<Style, number> = { flash: 0, normal: 0.0025, risky: 0.004, careful: 0.004 };
/** How much of a home's price they need in the bank before they move up. */
const NERVE: Record<Style, number> = { flash: 0.12, normal: 0.3, risky: 0.25, careful: 0.5 };

/** A year's earnings now: their deal (dates a month × the fee), or the indies. */
export function yearIncome(c: Career, w: Wrestler): number {
  const p = c.people[w.id];
  if (!p || p.retired) return 0;
  const k = p.contract;
  if (k) return k.fee * (k.dates ?? 4) * 12 * 1.15;
  // The indies: about a date and a half a month in their home region, and a day job to pay the rent.
  const region = REGION_KEY[w.region] ?? 'europe';
  return indieFee(w, region) * 18 + PB.dayJob * (COST_INDEX[region] ?? 1);
}

/** Tax on a year's earnings (the bands, no regional tweak). */
function yearTax(income: number): number {
  let low = 0, tax = 0;
  for (const [top, r] of PB.taxBands) { const hi = Math.min(income, top); if (hi > low) tax += (hi - low) * r; low = top; if (income <= top) break; }
  return tax;
}

export const worthOf = (x: Wealth | undefined): number => (x ? x.m + x.a - x.d : 0);

/** Everyone's money, seeded once from how long they've been at it and what they earn. */
export function wealthOf(c: Career): Record<string, Wealth> {
  const L = lifeWorld();
  if (L.wealth) return L.wealth;
  const out: Record<string, Wealth> = {};
  for (const w of WRESTLERS) {
    if (w.id === c.player) continue;
    const r = seededRng(hashSeed(c.seed, 'wealth', w.id));
    const style = styleOf(w), inc = yearIncome(c, w);
    const years = Math.max(0, w.age - 21);
    const saved = Math.round(inc * Math.pow(years, 0.9) * (1 - SPEND[style]) * 0.25 * (0.5 + r()) / 100) * 100;
    let h = 0;
    for (let t = 4; t >= 1; t--) if (saved >= HOME_PRICE[t]! * NERVE[style] * 2) { h = t; break; }
    const a = HOME_PRICE[h]! + (h >= 2 ? CAR_PRICE[Math.min(3, h - 1)]! : 0);
    const d = Math.round(a * (style === 'flash' ? 0.6 : style === 'careful' ? 0.15 : 0.35));
    out[w.id] = { m: Math.max(500, saved - (a - d)), a, d, h: h as Wealth['h'], v: (h >= 2 ? Math.min(3, h - 1) : 0) as Wealth['v'] };
  }
  L.wealth = out;
  return out;
}

/** The 1st: everyone's month. Earnings in, tax and living out, the good life by personality, debts paid down. */
export function monthlyWealth(c: Career, month: string): void {
  const all = wealthOf(c);
  for (const w of WRESTLERS) {
    if (w.id === c.player) continue;
    // Someone new (a rookie, a debut): they start with next to nothing.
    const x = (all[w.id] ??= { m: 500, a: 0, d: 0, h: 0, v: 0 });
    const r = seededRng(hashSeed(c.seed, 'wealth', w.id, month));
    const style = styleOf(w), inc = yearIncome(c, w);
    const net = (inc - yearTax(inc) - (inc > 100_000 ? inc * 0.1 : 0)) / 12;
    const living = HOME_WEEK[x.h]! * 52 / 12 + CAR_MONTH[x.v]! + HOME_PRICE[x.h]! * 0.01 / 12;
    const spare = net - living;
    // The good life: a share of what's spare, and lifestyle creep (the richer, the more goes out).
    const good = (spare > 0 ? spare * SPEND[style] : 0) + Math.max(0, x.m) * CREEP[style];
    // Money that sits earns (the careful invest it; the flash don't bother).
    const earns = x.m > 50_000 ? x.m * GROW[style] * (style === 'risky' ? 1 + (r() - 0.5) * 4 : 1) : 0;
    x.m = Math.round(x.m + spare - good + earns);
    // The mortgage and finance: about 0.6% of what's owed a month.
    if (x.d > 0) { const pay = Math.min(x.d, Math.max(200, x.d * 0.006)); x.m -= pay; x.d = Math.round(x.d - pay * 0.6); }
    x.a = Math.round(x.a * 1.0025);
    // A business: its takings (and now and then it folds).
    if (x.biz && x.biz !== 'school') {
      const b = PB.business[x.biz];
      if (r() < b.fold / 12) { x.a = Math.max(0, x.a - b.price); delete x.biz; }
      else x.m += Math.round(b.price * b.yield / 12);
    }
    // Moving up: a better home, a better car.
    const next = x.h + 1;
    if (next <= 4 && x.m >= HOME_PRICE[next]! * NERVE[style] && net * 12 * PB.borrowMult >= HOME_PRICE[next]! * 0.8) {
      const price = HOME_PRICE[next]!;
      x.m -= Math.round(price * 0.2); x.a += price - HOME_PRICE[x.h]!; x.d += Math.round(price * 0.8); x.h = next as Wealth['h'];
    } else if (x.v < 3 && x.m >= CAR_PRICE[x.v + 1]! * (style === 'flash' ? 1 : 3)) {
      x.m -= CAR_PRICE[x.v + 1]!; x.a += CAR_PRICE[x.v + 1]!; x.v = (x.v + 1) as Wealth['v'];
    }
    // A business once they've money to spare (a mentor opens a school instead).
    if (!x.biz && worthOf(x) > 1_000_000 && r() < (style === 'careful' ? 0.01 : 0.02)) {
      const kind = (w.traits ?? []).includes('mentor') ? 'school' : (['gym', 'bar', 'merch', 'media'] as const)[Math.floor(r() * 4)]!;
      if (kind !== 'school') { const price = PB.business[kind].price; if (x.m > price) { x.m -= price; x.a += price; x.biz = kind; } }
      else if (x.m > PB.school.buyBase) { x.m -= PB.school.buyBase; x.a += PB.school.buyBase; x.biz = 'school'; if (on('school')) openAiSchool(w); }
    }
    // Skint: they sell down (the home first, then the car), and it gets about.
    if (x.m < -Math.max(5_000, net * 3)) {
      if (x.h > 0) { const back = Math.round(HOME_PRICE[x.h]! * 0.85); x.a = Math.max(0, x.a - HOME_PRICE[x.h]!); const clear = Math.min(x.d, back); x.d -= clear; x.m += back - clear; x.h = (x.h - 1) as Wealth['h']; }
      else if (x.v > 0) { x.m += Math.round(CAR_PRICE[x.v]! * 0.6); x.a = Math.max(0, x.a - CAR_PRICE[x.v]!); x.v = (x.v - 1) as Wealth['v']; }
      if (!x.broke && x.m < 0) { x.broke = month; if (knows(c, w.id)) letter(c, { kind: 'news', from: 'The rumour mill', subject: `${w.name} is skint`, body: [`Word is ${w.name} has had to sell up. Too much house, not enough dates.`] }); }
    } else if (x.broke && x.m > 0) delete x.broke;
  }
}
const knows = (c: Career, id: string) => (c.people[id]?.contract?.promo ?? '') === c.people[c.player]?.contract?.promo;

/** January: the rich list (everyone in the world, you included), in the press. */
export function richList(c: Career, year: string, mine: number): void {
  const L = lifeWorld();
  const all = wealthOf(c);
  const top = Object.entries(all).map(([id, x]) => [id, worthOf(x)] as [string, number]);
  if (mine > 0) top.push([c.player, mine]);
  top.sort((a, b) => b[1] - a[1]);
  const ten = top.slice(0, 10).map(([id, v]) => [id, Math.round(v / 1000) * 1000] as [string, number]);
  L.rich = [...(L.rich ?? []).filter((x) => x.year !== year), { year, top: ten }].slice(-10);
  const you = top.findIndex(([id]) => id === c.player);
  letter(c, {
    kind: 'news', from: 'The Wrestling Observer', subject: `The ${year} rich list`,
    body: [
      ...ten.slice(0, 5).map(([id, v], i) => `${i + 1}. ${findWrestler(id)?.name ?? id}: ${money(v)}`),
      you >= 0 ? (you < 10 ? `You’re number ${you + 1}.` : `You’re number ${you + 1} of ${top.length}.`) : 'You’re not on it.',
    ],
  });
}

// Wealth on the decisions: the rich retire sooner, the skint work on; the rich are picky about deals, the skint aren't.
setMod('retire', (c, id) => {
  if (!on('ai') || id === c.player) return 1;
  const x = lifeWorld().wealth?.[id];
  if (!x) return 1;
  const v = worthOf(x);
  return x.broke ? 0.5 : v > 3_000_000 ? 1.6 : v > 1_000_000 ? 1.25 : 1;
});
setDemandLift((c, id) => {
  if (!on('ai') || id === c.player) return 1;
  const x = lifeWorld().wealth?.[id];
  return !x ? 1 : x.broke ? 0.85 : worthOf(x) > 2_000_000 ? 1.1 : 1;
});

/** Where you'd stand on the rich list today (everyone's worth against yours). */
export function richRank(c: Career): { rank: number; of: number } {
  const all = Object.values(wealthOf(c)).map(worthOf);
  const mine = netWorthOf(c);
  return { rank: all.filter((v) => v > mine).length + 1, of: all.length + 1 };
}
