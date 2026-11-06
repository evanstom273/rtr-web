// Money: fees, travel and the training price curve.
import { fansIn, findWrestler, getPromotion, TITLES, type Wrestler, rosterOf, holds } from '../data/rtr';
import schedulesJson from '../data/rtr/schedules.json';
import { activeWorld } from '../world/world';
import { setRescalePay } from '../world/payHook';
import { C } from './clauses';
import { isIndieTitle, promoRegion, titleClass } from './booker';
import { regionOfCountry } from './places';
import {
  APPEARANCE_BONUS_T3, REBRAND, COST_INDEX, INDIE_FEE_BASE, INDIE_FEE_BRAND, INDIE_FEE_CHAMP, INDIE_FEE_EXP, INDIE_FEE_FANS_REF, INDIE_FEE_RANGE, INDIE_FEE_REP, INDIE_FEE_SPECIAL, LIVING_COST_EUROPE, PAY, SHOW_MULT, SHOW_MULT_WEEKLY_FLAGSHIP, TRAIN_DIVISOR, TRAIN_LEVEL_OFFSET, TRAVEL,
} from './tuning';
import type { Career, Contract, PayType, PopRegion, Show, ShowKind } from './types';

export const round5 = (v: number): number => Math.round(v / 5) * 5;

// ------------------------------------------------------------------ the salary curve (Lyra's pay rework)

/** How much a promotion pays against the biggest major (×1): the smallest major ×0.5, falling away fast below the majors. */
export function payScale(promo: string): number {
  const pop = getPromotion(promo)?.popularity ?? PAY.scale.bottomPop;
  const S = PAY.scale;
  if (pop >= S.bottomPop) return S.bottom + (1 - S.bottom) * Math.min(1.1, (pop - S.bottomPop) / (S.topPop - S.bottomPop));
  return S.bottom * Math.max(0, (Math.max(S.floorPop, pop) - S.floorPop) / (S.bottomPop - S.floorPop)) ** S.belowExp;
}

/** The curve: a standing on the roster (0 the bottom, 1 the top) to a year's pay at the biggest major. */
export function curveAt(standing: number): number {
  const xs = PAY.curve;
  const p = Math.max(0, Math.min(1, standing));
  for (let i = 1; i < xs.length; i++) {
    const [x1, y1] = xs[i]!, [x0, y0] = xs[i - 1]!;
    if (p <= x1) return y0 * (y1 / y0) ** ((p - x0) / Math.max(1e-9, x1 - x0));
  }
  return xs.at(-1)![1];
}

/**
 * What a wrestler's worth a year to a major (Lyra's tiers): their drawing power (fans in its home region, where they
 * stand against its roster; an exceptional draw past the top keeps going), reputation and titles, × the promotion's scale.
 */
export function yearlyWorth(w: Wrestler, promo: string): number {
  const region = promoRegion(promo);
  const mine = fansIn(w, region);
  const others = rosterOf(promo).filter((x) => x.id !== w.id).map((x) => fansIn(x, region)).sort((a, b) => a - b);
  let year: number;
  if (!others.length) year = curveAt(0.5);
  else {
    const below = others.filter((f) => f < mine).length;
    const top = others.at(-1)!;
    year = curveAt(below / others.length);
    if (mine > top && top > 0) year *= (mine / top) ** PAY.beyondExp;
  }
  const rep = activeWorld().career?.people[w.id]?.rep ?? 50;
  const [r0, r1] = PAY.rep;
  year *= r0 + (r1 - r0) * Math.max(0, Math.min(100, rep)) / 100;
  const held = TITLES.filter((t) => holds(t, w.id) && t.kind !== 'tag' && t.kind !== 'trios');
  if (held.some((t) => titleClass(t.id) === 'world')) year *= PAY.title.world;
  else if (held.length) year *= PAY.title.other;
  return Math.round(year * payScale(promo));
}

/** Where a wrestler's drawing power puts them on a promotion's roster: 0 the bottom, 1 the top (fans in its home region). */
export function rosterStanding(w: Wrestler, promo: string): number {
  const region = promoRegion(promo);
  const mine = fansIn(w, region);
  const others = rosterOf(promo).filter((x) => x.id !== w.id).map((x) => fansIn(x, region));
  return others.length ? others.filter((f) => f < mine).length / others.length : 0.5;
}

/** A year's pay as the per-appearance unit every deal's priced in (`contract.fee`). */
export const unitFrom = (year: number): number => round5(year / (12 * PAY.datesPerMonth));
/** The unit back to a year's worth. */
export const yearFrom = (fee: number): number => Math.round(fee * 12 * PAY.datesPerMonth);

/** A major promotion's per-appearance unit for a wrestler: their yearly worth (the salary curve) ÷ (12 × dates a month). */
export function contractFee(w: Wrestler, promo: string): number {
  return unitFrom(yearlyWorth(w, promo));
}
/** The bottom of a promotion's scale, as a unit. */
export const floorFee = (promo: string): number => unitFrom(PAY.curve[0]![1] * payScale(promo));

/**
 * How many dates a month a promotion's regulars work: its schedule (shows in the next eight weeks), at most
 * `PAY.datesPerMonth`. A promotion that runs one show a month pays a salary sized to one show a month (size is
 * part of its scale, Lyra's call), and opens on per-appearance pay.
 */
let datesCache: { c: Career; day: string; n: number; by: Map<string, number> } | null = null;
export function promoDates(promo: string): number {
  const c = activeWorld().career;
  if (!c) return PAY.datesPerMonth;
  const n = Object.keys(c.shows).length;
  if (datesCache?.c !== c || datesCache.day !== c.today || datesCache.n !== n) {
    const by = new Map<string, number>();
    const to = new Date(Date.parse(`${c.today}T12:00:00Z`) + 56 * 864e5).toISOString().slice(0, 10);
    for (const s of Object.values(c.shows)) if (s.date > c.today && s.date <= to) for (const x of s.promos ?? [s.promo]) by.set(x, (by.get(x) ?? 0) + 1);
    datesCache = { c, day: c.today, n, by };
  }
  const shows = datesCache.by.get(promo);
  return shows === undefined ? PAY.datesPerMonth : Math.max(1, Math.min(PAY.datesPerMonth, (shows * 30.44) / 56));
}

/** How a deal pays (PPA if it doesn't say: every deal before the rework). */
export const payOf = (k: Pick<Contract, 'pay'> | undefined): PayType => k?.pay ?? 'ppa';
export const PAY_LABEL: Record<PayType, string> = { ppa: 'Per appearance', monthly: 'Monthly salary', both: 'Salary + appearances' };
/** Which way a promotion opens with (Lyra's call: by size). */
export function preferredPay(promo: string): PayType {
  if (promo === 'TIS' || promoDates(promo) < PAY.prefers.dates) return 'ppa';
  const pop = getPromotion(promo)?.popularity ?? 0;
  return pop >= PAY.prefers.monthly ? 'monthly' : pop >= PAY.prefers.both ? 'both' : 'ppa';
}
/** What a unit buys on each way of being paid: the per-date share (× the show's size) and the salary share (× dates a month). */
const dateShare = (t: PayType): number => (t === 'monthly' ? 0 : t === 'both' ? PAY.bothShow : PAY.ppaPremium);
const salaryShare = (t: PayType): number => (t === 'ppa' ? 0 : t === 'both' ? PAY.bothBase : 1);
type PayParts = Pick<Contract, 'fee' | 'pay' | 'promo'> & { dates?: number; salaryMult?: number; dateMult?: number };
const datesOf = (k: PayParts): number => Math.min(k.dates ?? PAY.datesPerMonth, promoDates(k.promo));

/** A deal's monthly salary (Monthly, or Both's base): set in the deal, or sized to the promotion's schedule; 0 on PPA. */
export function monthlySalary(k: PayParts): number {
  const t = payOf(k);
  if (t === 'ppa') return 0;
  return round5(k.fee * (k.salaryMult ?? datesOf(k) * salaryShare(t)));
}
/** What a deal pays a weekly-show appearance (PPA, or Both's per-date part): set in the deal, or the unit × its share. */
export function perDateOf(k: PayParts): number {
  const t = payOf(k);
  return t === 'monthly' ? 0 : round5(k.fee * (k.dateMult ?? dateShare(t)));
}
/**
 * Lyra's call: on Both you set the salary and the fee a date separately (and on Monthly the salary, on PPA the fee).
 * The two amounts become the deal's unit (what it's worth a year, as the standard split would pay it: that's what
 * the promotion weighs, and what every "in fees" price uses) and each one's ratio to it (so raises scale both).
 */
export function splitDeal(promo: string, pay: PayType, salary: number, perDate: number, dates?: number): { fee: number; salaryMult?: number; dateMult?: number } {
  const d = Math.min(dates ?? PAY.datesPerMonth, promoDates(promo));
  const s = pay === 'ppa' ? 0 : Math.max(0, salary), x = pay === 'monthly' ? 0 : Math.max(0, perDate);
  const perUnit = (salaryShare(pay) + dateShare(pay)) * d * 12;
  const fee = Math.max(5, round5(((s + x * d) * 12) / Math.max(1e-9, perUnit)));
  return { fee, ...(pay !== 'ppa' ? { salaryMult: s / fee } : {}), ...(pay !== 'monthly' ? { dateMult: x / fee } : {}) };
}
const money = (n: number): string => (n >= 1_000_000 ? `£${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}m` : `£${n.toLocaleString('en-GB')}`);
/** A deal's pay in words: "£1.2m a year: a monthly salary of £100,000", "£22,000 an appearance", or both parts. */
export function payWords(k: PayParts): string {
  const t = payOf(k), m = monthlySalary(k), per = perDateOf(k);
  const parts = t === 'monthly' ? `${money(m)} a month` : t === 'both' ? `${money(m)} a month + ${money(per)} an appearance` : `${money(per)} an appearance`;
  return `about ${money(yearlyPay(k))} a year (${parts})`;
}

/** About what a deal's worth a year at a normal workload (for the screens and the AI's money). */
export function yearlyPay(k: PayParts): number {
  return Math.round((monthlySalary(k) + perDateOf(k) * datesOf(k)) * 12);
}

/**
 * An indie fee (Lyra's call: below the majors, and not the same everywhere): your fans where the show
 * is, the brand putting it on, an indie belt, a special or cup night. At a region alone (an event's
 * paid appearance), an ordinary brand.
 */
export function indieFee(w: Wrestler, at: PopRegion | Show): number {
  const show = typeof at === 'string' ? undefined : at;
  const region = show ? show.region : (at as PopRegion);
  const pop = show?.brand ? activeWorld().people?.brands[show.brand]?.popularity : undefined;
  const [b0, b1] = INDIE_FEE_BRAND;
  const brand = pop === undefined ? 1 : b0 + ((Math.max(5, Math.min(30, pop)) - 5) / 25) * (b1 - b0);
  const rep = activeWorld().career?.people[w.id]?.rep ?? 50;
  const [r0, r1] = INDIE_FEE_REP;
  const standing = r0 + (r1 - r0) * Math.max(0, Math.min(100, rep)) / 100;
  const champ = TITLES.some((t) => holds(t, w.id) && isIndieTitle(t.id)) ? INDIE_FEE_CHAMP : 1;
  const special = show && (show.special || show.kind === 'special') ? INDIE_FEE_SPECIAL : 1;
  const fee = INDIE_FEE_BASE * brand * standing * (Math.max(1, fansIn(w, region)) / INDIE_FEE_FANS_REF) ** INDIE_FEE_EXP * champ * special;
  return Math.max(INDIE_FEE_RANGE[0], Math.min(INDIE_FEE_RANGE[1], round5(fee)));
}

/** SLN-style flagships that run every week (from the schedules): paid like a big weekly show. */
const WEEKLY_FLAGSHIP = new Set(Object.entries(schedulesJson as unknown as Record<string, { kind: string; when: { every?: string } }[]>)
  .flatMap(([promo, rules]) => rules.filter((r) => r.kind === 'flagship' && r.when.every).map((r) => `${promo}:${r.when.every}`)));
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const isWeeklyFlagship = (show: Pick<Show, 'kind' | 'promo' | 'date'>): boolean =>
  show.kind === 'flagship' && WEEKLY_FLAGSHIP.has(`${show.promo}:${DAY_NAMES[new Date(`${show.date}T12:00:00Z`).getUTCDay()]}`);

export function travelCost(home: string, showCountry: string): number {
  if (home === showCountry) return TRAVEL.country;
  return regionOfCountry(home) === regionOfCountry(showCountry) ? TRAVEL.region : TRAVEL.abroad;
}

/**
 * What a contracted appearance pays (Lyra's call: losing doesn't cost you anything): on PPA the unit × the show's size
 * × the PPA premium, on Both its per-show share, on Monthly nothing (the salary covers it). Guaranteed Pay Tier 3 adds
 * an appearance bonus. `lost` is kept for old callers and changes nothing.
 */
export function matchPay(contract: Pick<Contract, 'fee' | 'pay'> & { clauses?: number[]; dateMult?: number }, kind: ShowKind, _lost = false, weeklyFlagship = false): { pay: number; bonus: number } {
  const size = weeklyFlagship ? SHOW_MULT_WEEKLY_FLAGSHIP : SHOW_MULT[kind];
  const t = payOf(contract);
  const share = t === 'monthly' ? 0 : contract.dateMult ?? dateShare(t);
  const pay = round5(contract.fee * size * share);
  const tier = contract.clauses?.[C.guaranteed] ?? 0;
  const bonus = tier >= 3 ? round5(contract.fee * size * APPEARANCE_BONUS_T3) : 0;
  return { pay, bonus };
}

function eldenRingRunes(level: number): number {
  const x = Math.max(0, level + 81 - 92) * 0.02;
  return Math.floor((x + 0.1) * (level + 81) ** 2) + 1;
}

/** The price of the next +1 to any attribute, from the total of all six (Elden Ring's level curve). */
export function trainingPrice(total: number): number {
  return round5(eldenRingRunes(Math.max(1, total - TRAIN_LEVEL_OFFSET)) / TRAIN_DIVISOR);
}

export const attributeTotal = (w: Wrestler): number =>
  w.stats.strength + w.stats.speed + w.stats.stamina + w.stats.skill + w.stats.striking + w.stats.charisma;

/** The region you live in, which sets your living costs (your home country until you move). */
export const baseRegion = (c: Career): PopRegion => regionOfCountry(c.base ?? findWrestler(c.player)?.country ?? 'UK');

/** A week's living costs where you live (Lyra's call): Europe £220, by each region's cost index. */
export const livingCost = (region: PopRegion): number => round5(LIVING_COST_EUROPE * COST_INDEX[region]);

/**
 * Rev 12 (Lyra's pay rework): every current deal comes up onto the salary curve (never down), staying per-appearance
 * (what it was: Monthly or Both can be asked for at renewal); open offers too. You get a letter about yours.
 */
export function rescaleDeals(c: Career): void {
  const lift = (k: Contract, id: string): void => {
    const w = findWrestler(id);
    if (!w || k.promo === 'TIS') return;
    const fee = contractFee(w, k.promo);
    if (fee > k.fee) k.fee = fee;
    k.pay ??= 'ppa';
  };
  for (const [id, p] of Object.entries(c.people)) for (const k of [p.contract, p.next, ...(p.deals ?? [])]) if (k) lift(k, id);
  const me = findWrestler(c.player);
  for (const o of c.offers ?? []) if (o.status === 'open' && me && o.promo !== 'TIS') { o.fee = Math.max(o.fee, contractFee(me, o.promo)); o.pay ??= 'ppa'; }
  const mine = c.people[c.player]?.contract;
  if (mine && !c.spectator) {
    (c.letters ??= []).unshift({
      id: `L${++c.seq}`, day: c.today, read: false, kind: 'contract', from: `${mine.promo} · the office`, subject: 'Your pay’s gone up',
      body: ['Pay across the business has been brought up to date: a salary scale by how much you draw, no pay cut for losing, and a choice of how you’re paid.',
        `Your deal’s now ${payWords(mine)}. You can ask for a monthly salary, or salary plus appearances, when it comes up for renewal.`],
    } as never);
  }
}
setRescalePay(rescaleDeals);

/** After a rebrand your merch builds back up over a year (Lyra's call): this month's share of it. */
export function merchShare(c: Career): number {
  if (!c.merchSince) return 1;
  const months = Math.max(0, (Date.parse(`${c.today}T12:00:00Z`) - Date.parse(`${c.merchSince}T12:00:00Z`)) / (30.44 * 864e5));
  const share = REBRAND.merchStart + (1 - REBRAND.merchStart) * Math.min(1, months / REBRAND.merchMonths);
  if (share >= 1) delete c.merchSince;
  return share;
}
