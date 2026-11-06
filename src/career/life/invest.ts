// Life stage 3: businesses (passive: a yearly yield that wobbles, and they can fold), funds (they move monthly and
// crash now and then), stakes in promotions (dividends; a quarter gets you a say; a majority is owning it), luxury
// (status when flaunted; some of it holds its value) and insurance.
import { seededRng, hashSeed } from '../../engine/rng';
import { fansTotal, findWrestler, PROMOTIONS } from '../../data/rtr';
import { crashedIn } from '../../world/lifeWorld';
import { letter, setCareerHooks, spend } from '../career';
import { bookSummary } from '../books';
import { companyOf } from '../company';
import { askingPrice, buy as buyPromotion, valuation } from '../owners';

import { PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { borrow } from './loans';
import { cityPrice, life, newId, on, type FundKind, type LuxuryKind, type VentureKind } from './state';
import { homesValue } from './homes';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const r100 = (n: number) => Math.round(n / 100) * 100;
/** A roll in −1…1 that bunches in the middle. */
const wob = (r: () => number) => (r() + r() + r() - 1.5) / 1.5;

export const VENTURE_KINDS = Object.keys(PB.business) as VentureKind[];
export const FUND_KINDS = Object.keys(PB.funds) as FundKind[];
export const LUXURY_KINDS = Object.keys(PB.luxury) as LuxuryKind[];

// ------------------------------------------------------------------ businesses

/** What a business costs to buy into (a gym or a bar by the city's prices). */
export const venturePrice = (kind: VentureKind, city: string): number => r100(PB.business[kind].price * (PB.business[kind].local ? cityPrice(city) : 1));
/** Merch and media do better the more fans you've got. */
const fanLift = (c: Career, kind: VentureKind) => (PB.business[kind].fans ? Math.min(2, Math.max(0.5, (fansTotal(findWrestler(c.player)!) / 200_000) ** 0.35)) : 1);
export const ventureName = (kind: VentureKind, city: string) => `${PB.business[kind].name}${PB.business[kind].local ? ` in ${city}` : ''}`;

export function buyVenture(c: Career, kind: VentureKind, city: string, finance: boolean): string {
  const L = life(c);
  if ((L.ventures ?? []).some((v) => v.kind === kind && v.city === city)) return 'You’ve already got one of those there.';
  const price = venturePrice(kind, city), id = `b${L.seq + 1}`, name = ventureName(kind, city);
  if (finance) {
    const b = borrow(c, 'business', id, name, price);
    if (!b.loan) return b.why!;
    spend(c, -b.deposit, `Deposit · ${name}`, 'business', { untaxed: true });
  } else {
    if (c.money < price) return `You need ${money(price)}.`;
    spend(c, -price, `Bought into · ${name}`, 'business', { untaxed: true });
  }
  newId(c, 'b');
  (L.ventures ??= []).push({ id, kind, city, paid: price, v: price, size: 1, since: c.today });
  return `${name}: yours. About ${Math.round(PB.business[kind].yield * 100)}% a year back, give or take.`;
}

/** A second site (or a bigger one): three times as much in, as much more out. */
export function growVenture(c: Career, id: string): string {
  const v = life(c).ventures?.find((x) => x.id === id);
  if (!v) return 'No such business.';
  if (v.size === 2) return 'It’s as big as it gets.';
  const cost = venturePrice(v.kind, v.city) * (PB.bigger - 1);
  if (c.money < cost) return `You need ${money(cost)}.`;
  spend(c, -cost, `A second site · ${ventureName(v.kind, v.city)}`, 'business', { untaxed: true });
  v.size = 2; v.paid += cost; v.v += cost;
  return 'A second site: bigger takings, bigger risks.';
}

/** Repossessed (the business loan unpaid): the lenders take it and sell it at 80%. */
export function seizeVenture(c: Career, id: string): number {
  const L = life(c), v = L.ventures?.find((x) => x.id === id);
  if (!v) return 0;
  L.ventures = L.ventures!.filter((x) => x !== v);
  return r100(v.v * PB.repossess.at);
}

export function sellVenture(c: Career, id: string): string {
  const L = life(c), v = L.ventures?.find((x) => x.id === id);
  if (!v) return 'No such business.';
  const got = r100(v.v * 0.9), loan = L.loans.find((l) => l.on === id);
  spend(c, got, `Sold · ${ventureName(v.kind, v.city)}`, 'business', { untaxed: true });
  if (loan) { spend(c, -loan.left, `Loan cleared · ${ventureName(v.kind, v.city)}`, 'loan', { untaxed: true }); L.loans = L.loans.filter((x) => x !== loan); }
  L.ventures = L.ventures!.filter((x) => x !== v);
  return `Sold for ${money(got)}.`;
}

/** The 1st: a month's takings (the yield, wobbling), the value drifting, and now and then one folds. */
export function monthlyVentures(c: Career, month: string): void {
  const L = life(c);
  for (const v of [...(L.ventures ?? [])]) {
    const b = PB.business[v.kind], r = seededRng(hashSeed(c.seed, 'venture', v.id, month));
    if (r() < b.fold / 12) {
      const left = r100(v.v * 0.1);
      if (left) spend(c, left, `What was left · ${ventureName(v.kind, v.city)}`, 'business', { untaxed: true });
      L.ventures = L.ventures!.filter((x) => x !== v);
      letter(c, { kind: 'news', from: 'Your accountant', subject: `${ventureName(v.kind, v.city)} has gone under`, body: [`It’s folded. There was ${money(left)} left once the creditors had theirs.`, ...(L.loans.some((l) => l.on === v.id) ? ['The loan on it is still yours to pay.'] : [])] });
      continue;
    }
    const year = b.yield + b.wobble * wob(r);
    const take = Math.round(v.v * year / 12 * fanLift(c, v.kind));
    if (take) spend(c, take, `${take > 0 ? 'Takings' : 'A bad month'} · ${ventureName(v.kind, v.city)}`, 'business');
    v.v = Math.max(r100(v.paid * 0.3), r100(v.v * (1 + wob(r) * b.wobble / 6)));
  }
}

// ------------------------------------------------------------------ funds

export const fundsValue = (c: Career): number => Object.values(c.life?.funds ?? {}).reduce((t, f) => t + (f?.v ?? 0), 0);

export function putIn(c: Career, kind: FundKind, amount: number): string {
  if (amount <= 0) return 'How much?';
  if (c.money < amount) return `You haven’t got ${money(amount)}.`;
  const f = ((life(c).funds ??= {})[kind] ??= { v: 0, put: 0 });
  spend(c, -amount, `Into the ${PB.funds[kind].name.toLowerCase()}`, 'invest', { untaxed: true });
  f.v += amount; f.put += amount;
  return `${money(amount)} into the ${PB.funds[kind].name.toLowerCase()}.`;
}
export function takeOut(c: Career, kind: FundKind, amount?: number): string {
  const f = life(c).funds?.[kind];
  if (!f || f.v <= 0) return 'Nothing in it.';
  const a = Math.min(f.v, amount ?? f.v);
  const gain = Math.max(0, Math.round(a - (f.put * a) / f.v));
  // The profit's income (tax); what you put in comes back untaxed.
  spend(c, a - gain, `Out of the ${PB.funds[kind].name.toLowerCase()}`, 'invest', { untaxed: true });
  if (gain) spend(c, gain, `Gains · ${PB.funds[kind].name.toLowerCase()}`, 'invest');
  f.put -= (f.put * a) / f.v; f.v -= a;
  return `${money(a)} out of the ${PB.funds[kind].name.toLowerCase()}.`;
}

/** The 1st: every fund moves; in a crash month, they all fall. */
export function monthlyFunds(c: Career, month: string): void {
  const L = life(c);
  const crash = crashedIn(month);
  for (const k of FUND_KINDS) {
    const f = L.funds?.[k];
    if (!f || f.v <= 0) continue;
    const d = PB.funds[k], r = seededRng(hashSeed(c.seed, 'fund', k, month));
    f.v = Math.max(0, Math.round(f.v * (1 + d.mean / 12 + wob(r) * d.wobble / Math.sqrt(12)) * (crash ? 1 - d.crash : 1)));
  }
  if (crash && fundsValue(c) > 0) letter(c, { kind: 'news', from: 'Your accountant', subject: 'The markets have crashed', body: ['Everything’s down. The risky fund worst. It comes back, usually: the question is whether you can wait.'] });
}

// ------------------------------------------------------------------ promotion stakes

/** What a slice of a promotion costs: its share of what it's worth, a little over. */
export const stakePrice = (promo: string, pct: number): number => r100(valuation(promo) * (pct / 100) * PB.stake.premium);
export const stakeOf = (c: Career, promo: string): number => c.life?.stakes?.find((s) => s.promo === promo)?.pct ?? 0;
export const stakesValue = (c: Career): number => (c.life?.stakes ?? []).reduce((t, s) => t + r100(valuation(s.promo) * s.pct / 100), 0);
export const stakeable = (): string[] => PROMOTIONS.filter((p) => !p.indie && companyOf(p.initials) && !companyOf(p.initials)!.closed && companyOf(p.initials)!.owner !== 'player').map((p) => p.initials);

export function buyStake(c: Career, promo: string, pct: number): string {
  const L = life(c), co = companyOf(promo);
  if (!co || co.closed) return 'There’s no such promotion.';
  if (co.owner === 'player') return 'You own it already.';
  const have = stakeOf(c, promo);
  if (have + pct > PB.stake.max) return `${promo}’s owner won’t sell past ${PB.stake.max}%: for more, you buy the lot.`;
  const price = stakePrice(promo, pct);
  if (c.money < price) return `You need ${money(price)}.`;
  spend(c, -price, `${pct}% of ${promo}`, 'invest', { untaxed: true });
  const s = (L.stakes ??= []).find((x) => x.promo === promo);
  if (s) { s.pct += pct; s.paid += price; } else L.stakes!.push({ promo, pct, paid: price });
  return `${pct}% of ${promo}${have + pct >= PB.stake.say ? ': that’s a seat at the table' : ''}.`;
}
export function sellStake(c: Career, promo: string): string {
  const L = life(c), s = L.stakes?.find((x) => x.promo === promo);
  if (!s) return 'You don’t own any of it.';
  const got = r100(valuation(promo) * s.pct / 100);
  const gain = Math.max(0, got - s.paid);
  spend(c, got - gain, `Sold ${s.pct}% of ${promo}`, 'invest', { untaxed: true });
  if (gain) spend(c, gain, `Gains · ${promo} stake`, 'invest');
  L.stakes = L.stakes!.filter((x) => x !== s);
  return `Sold for ${money(got)}.`;
}
/** Buy the rest: the owner's price, less what your stake's worth. Then it's yours (booker mode's owner). */
export function buyOut(c: Career, promo: string): string {
  const L = life(c), s = L.stakes?.find((x) => x.promo === promo);
  const credit = s ? r100(valuation(promo) * s.pct / 100) : 0;
  const ask = askingPrice(c, promo);
  if (c.money + credit < ask) return `You need ${money(ask - credit)} on top of your stake.`;
  if (credit) spend(c, credit, `Your ${s!.pct}% of ${promo} towards it`, 'invest', { untaxed: true });
  const said = buyPromotion(c, promo, ask);
  if (companyOf(promo)?.owner === 'player') { L.stakes = L.stakes?.filter((x) => x !== s); return said; }
  if (credit) spend(c, -credit, `Your ${s!.pct}% of ${promo} back`, 'invest', { untaxed: true });
  return said;
}

/** The 1st: half of last month's profit, paid out by stake. */
export function monthlyStakes(c: Career): void {
  for (const s of c.life?.stakes ?? []) {
    const co = companyOf(s.promo);
    if (!co || co.closed) continue;
    const last = bookSummary(co).months.at(-1);
    const profit = last ? last.in - last.out : 0;
    const div = Math.round(Math.max(0, profit) * PB.stake.payout * s.pct / 100);
    if (div) spend(c, div, `Dividend · ${s.pct}% of ${s.promo}`, 'invest');
  }
}

// A quarter of the promotion: they won't release you, and they look after you.
setCareerHooks({ protect: (c, id, promo) => on('invest') && id === c.player && stakeOf(c, promo) >= PB.stake.say });

// ------------------------------------------------------------------ luxury

export const luxuryValue = (c: Career): number => (c.life?.luxury ?? []).reduce((t, x) => t + x.v, 0);
export const luxuryName = (kind: LuxuryKind, tier: number) => `${['A nice', 'A fine', 'A collector’s'][tier]} ${PB.luxury[kind].name.toLowerCase()}`;

export function buyLuxury(c: Career, kind: LuxuryKind, tier: 0 | 1 | 2): string {
  const price = PB.luxury[kind].tiers[tier]!;
  if (c.money < price) return `You need ${money(price)}.`;
  spend(c, -price, `Bought · ${luxuryName(kind, tier).toLowerCase()}`, 'luxury', { untaxed: true });
  (life(c).luxury ??= []).push({ id: newId(c, 'x'), kind, tier, paid: price, v: price, since: c.today });
  return `${luxuryName(kind, tier)}: yours.`;
}
export function sellLuxury(c: Career, id: string): string {
  const L = life(c), x = L.luxury?.find((y) => y.id === id);
  if (!x) return 'You don’t own that.';
  spend(c, x.v, `Sold · ${luxuryName(x.kind, x.tier).toLowerCase()}`, 'luxury', { untaxed: true });
  L.luxury = L.luxury!.filter((y) => y !== x);
  return `Sold for ${money(x.v)}.`;
}
/** The 1st: values drift, upkeep goes out. */
export function monthlyLuxury(c: Career, month: string): void {
  for (const x of c.life?.luxury ?? []) {
    const d = PB.luxury[x.kind], r = seededRng(hashSeed(c.seed, 'lux', x.id, month));
    x.v = Math.max(r100(x.paid * 0.1), r100(x.v * (1 + d.drift / 12 + wob(r) * d.wobble / Math.sqrt(12))));
    const up = Math.round(x.v * d.upkeep / 12);
    if (up) spend(c, -up, `Upkeep · ${luxuryName(x.kind, x.tier).toLowerCase()}`, 'luxury');
  }
}

// ------------------------------------------------------------------ insurance

export const venturesValue = (c: Career): number => (c.life?.ventures ?? []).reduce((t, v) => t + v.v, 0);
export function premiums(c: Career): { home: number; business: number } {
  return { home: Math.round(homesValue(c) * PB.insurance.home / 12), business: Math.round(venturesValue(c) * PB.insurance.business / 12) };
}
export function monthlyInsurance(c: Career): void {
  const i = c.life?.insure, p = premiums(c);
  if (i?.home && p.home) spend(c, -p.home, 'Insurance · your homes', 'insurance');
  if (i?.business && p.business) spend(c, -p.business, 'Insurance · your businesses', 'insurance');
}

/** Everything invested, for what you're worth. */
export const investedValue = (c: Career): number => venturesValue(c) + fundsValue(c) + stakesValue(c) + luxuryValue(c);


