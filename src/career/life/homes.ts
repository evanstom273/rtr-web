// Life: homes. Today's flat living cost becomes rent on a real place in your city; owning one means no rent, just
// bills, upkeep and the mortgage. Homes you own can be let, sold (it takes a month or three) or lived in; switching
// between homes you own is instant.
import { seededRng, hashSeed } from '../../engine/rng';
import { marketIdx } from '../../world/lifeWorld';
import { letter, spend } from '../career';
import { addDays, weekday, type Day } from '../dates';
import { ROMANCE, PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { borrow } from './loans';
import { cityPrice, countryOfCity, life, liveHome, newId, type BuyTier, type Home, type RentTier } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const r5 = (n: number) => Math.round(n / 5) * 5;
const r1k = (n: number) => Math.round(n / 1000) * 1000;

export const RENT_TIERS = Object.keys(PB.rent) as RentTier[];
export const BUY_TIERS = Object.keys(PB.buy) as BuyTier[];
export const isOwnTier = (t: string): t is BuyTier => t in PB.buy && !(t in PB.rent && t === 'room');

/** A rented place a week: rent, and bills and food. */
export const rentOf = (tier: RentTier, city: string): number => r5(PB.rent[tier].rent * cityPrice(city));
export const billsOf = (h: Pick<Home, 'tier' | 'own' | 'city'>): number => r5((h.own ? PB.buy[h.tier as BuyTier].bills : PB.rent[h.tier as RentTier].bills) * cityPrice(h.city));
export const rentWeek = (tier: RentTier, city: string): number => rentOf(tier, city) + billsOf({ tier, own: false, city });

/** What a home costs to buy in a city today (the market moves it). */
export const buyPrice = (tier: BuyTier, city: string): number => r1k(PB.buy[tier].price * cityPrice(city) * marketIdx(city));
/** What a home you own is worth today. */
export const homeValue = (h: Home): number => (h.own && h.paid && h.idx ? r1k(h.paid * marketIdx(h.city) / h.idx) : 0);
/** Let out, a week (before the agent and repairs). */
export const letsFor = (h: Home): number => (h.own ? r5(PB.buy[h.tier as BuyTier].lets * cityPrice(h.city) * Math.sqrt(marketIdx(h.city))) : 0);

export const tierName = (h: Pick<Home, 'tier' | 'own'>): string => (h.own ? PB.buy[h.tier as BuyTier].name : PB.rent[h.tier as RentTier].name);
export const homeName = (h: Home): string => `${tierName(h)} in ${h.city}`;
const quality = (h: Home) => (h.own ? PB.buy[h.tier as BuyTier] : PB.rent[h.tier as RentTier]);
/** How much better you sleep at home (the recovery bonus), and how it sits with you. */
export const homeRest = (c: Career): number => quality(liveHome(c)).rest;
export const homeMood = (c: Career): number => quality(liveHome(c)).mood;

/** Life's version of the Monday living cost: rent (if you rent) and bills, shared if you live with someone. */
export function weeklyHome(c: Career, day: Day): boolean {
  if (weekday(day) !== 1 || c.people[c.player]?.retired) return true;
  // A career that's never paid: the old first-Monday notice sets the start date.
  if (!c.livingFrom) return false;
  if (day < c.livingFrom || (c.livingPaidThrough && c.livingPaidThrough >= day)) return true;
  const h = liveHome(c);
  const shared = c.home ? 1 - ROMANCE.livingSplit : 1;
  const rent = h.own ? 0 : rentOf(h.tier as RentTier, h.city);
  const total = Math.round((rent + billsOf(h)) * shared);
  spend(c, -total, `${rent ? 'Rent and bills' : 'Bills'} · ${homeName(h)}${c.home ? ' (shared)' : ''}`, rent ? 'rent' : 'living');
  c.livingPaidThrough = day;
  return true;
}

/** The 1st: upkeep on what you own, rent in from what you let, and sales that complete. */
export function monthlyHomes(c: Career): void {
  const L = life(c);
  const month = c.today.slice(0, 7);
  for (const h of [...L.homes]) {
    if (!h.own) continue;
    if (h.selling && h.selling <= c.today) { completeSale(c, h); continue; }
    const v = homeValue(h);
    const upkeep = Math.round(v * PB.buy[h.tier as BuyTier].upkeep / 12);
    if (upkeep) spend(c, -upkeep, `Upkeep · ${homeName(h)}`, 'home');
    if (h.use === 'let') {
      const r = seededRng(hashSeed(c.seed, 'let', h.id, month));
      const empty = r() < PB.voidMonth * (h.letAgent ? 1 : 1.5);
      if (empty) { spend(c, 0, `Empty this month · ${homeName(h)}`, 'home'); continue; }
      const gross = Math.round(letsFor(h) * 52 / 12);
      const off = Math.round(gross * ((h.letAgent ? PB.letAgent : 0) + PB.repairs));
      spend(c, gross - off, `Rent in · ${homeName(h)}${h.letAgent ? ' (after the letting agent)' : ''}`, 'home');
    }
  }
}

function completeSale(c: Career, h: Home): void {
  const L = life(c);
  const v = homeValue(h);
  const net = Math.round(v * (1 - PB.sellFees));
  const loan = L.loans.find((l) => l.on === h.id);
  spend(c, net, `Sold · ${homeName(h)}`, 'home', { untaxed: true });
  if (loan) { spend(c, -loan.left, `Mortgage cleared · ${homeName(h)}`, 'loan', { untaxed: true }); L.loans = L.loans.filter((x) => x !== loan); }
  L.homes = L.homes.filter((x) => x !== h);
  letter(c, { kind: 'news', from: 'The estate agent', subject: `Sold: ${homeName(h)}`, body: [`It went for ${money(v)}. After fees${loan ? ' and the mortgage' : ''}, ${money(net - (loan?.left ?? 0))} is yours.`] });
}

/** Move into a home: the place you lived is given up (renting) or left empty (owning). */
function moveIn(c: Career, h: Home): void {
  const L = life(c);
  const was = L.homes.find((x) => x.use === 'live' && x !== h);
  if (was) { if (was.own) was.use = 'empty'; else L.homes = L.homes.filter((x) => x !== was); }
  h.use = 'live';
  delete h.selling;
  L.city = h.city;
  c.base = h.country;
}

/** Switch to a home you own: instant and free (Lyra's call). */
export function switchTo(c: Career, id: string): string {
  const h = life(c).homes.find((x) => x.id === id);
  if (!h || !h.own) return 'You don’t own that.';
  if (h.use === 'live') return 'You live there already.';
  if (c.moving) return 'You’re in the middle of a move.';
  moveIn(c, h);
  return `You’re living in your ${homeName(h).toLowerCase()} now.`;
}

/** The end of a move (day.ts): into a home you own, or renting a place in the new city. */
export function arrive(c: Career, mv: NonNullable<Career['moving']>): void {
  const L = life(c);
  if (mv.home) { const h = L.homes.find((x) => x.id === mv.home); if (h) return moveIn(c, h); }
  const city = mv.city!;
  const was = liveHome(c);
  const tier: RentTier = mv.tier ?? (was.own ? 'flat' : (was.tier as RentTier));
  const h: Home = { id: newId(c, 'h'), city, country: countryOfCity(city), tier, own: false, use: 'empty', since: c.today };
  L.homes.push(h);
  moveIn(c, h);
}

/**
 * Buy a home (cash, or a mortgage: the deposit and fees come out now). It's yours empty: switch to it, let it,
 * or keep it. A penthouse or mansion comes with a home gym.
 */
export function buyHome(c: Career, city: string, tier: BuyTier, mortgage: boolean): { ok: boolean; text: string; id?: string } {
  const L = life(c);
  const price = buyPrice(tier, city), fees = Math.round(price * PB.buyFees);
  const id = `h${L.seq + 1}`;
  const name = `${PB.buy[tier].name} in ${city}`;
  if (mortgage) {
    const b = borrow(c, 'mortgage', id, name, price);
    if (!b.loan) return { ok: false, text: b.why! };
    if (c.money < b.deposit + fees) { L.loans = L.loans.filter((x) => x !== b.loan); return { ok: false, text: `You need ${money(b.deposit + fees)} for the deposit and fees.` }; }
    spend(c, -(b.deposit + fees), `Deposit and fees · ${name}`, 'home', { untaxed: true });
  } else {
    if (c.money < price + fees) return { ok: false, text: `You need ${money(price + fees)} (with fees).` };
    spend(c, -(price + fees), `Bought · ${name}`, 'home', { untaxed: true });
  }
  newId(c, 'h');
  const h: Home = { id, city, country: countryOfCity(city), tier, own: true, paid: price, idx: marketIdx(city), use: 'empty', since: c.today, ...(tier === 'penthouse' || tier === 'mansion' ? { gym: 'gym' as const } : {}) };
  L.homes.push(h);
  return { ok: true, text: `It’s yours: ${name} for ${money(price)}${mortgage ? `, with a mortgage of ${money(L.loans.find((l) => l.on === id)?.left ?? 0)}` : ''}.`, id };
}

/** Put a home up for sale: it sells in one to three months, at what it's worth then. */
export function sellHome(c: Career, id: string): string {
  const h = life(c).homes.find((x) => x.id === id);
  if (!h || !h.own) return 'You don’t own that.';
  if (h.use === 'live') return 'You live there: move out first.';
  if (h.selling) return 'It’s already on the market.';
  const r = seededRng(hashSeed(c.seed, 'sell', id, c.today));
  h.selling = addDays(c.today, PB.sellDays[0] + Math.floor(r() * (PB.sellDays[1] - PB.sellDays[0])));
  if (h.use === 'let') h.use = 'empty';
  return `On the market at about ${money(homeValue(h))}. These things take a month or three.`;
}
export function cancelSale(c: Career, id: string): string {
  const h = life(c).homes.find((x) => x.id === id);
  if (!h?.selling) return 'It isn’t for sale.';
  delete h.selling;
  return 'Taken off the market.';
}

/** Let a home out (with a letting agent: 12% off, fewer empty months, no hassle), or stop. */
export function letHome(c: Career, id: string, agent: boolean): string {
  const h = life(c).homes.find((x) => x.id === id);
  if (!h || !h.own) return 'You don’t own that.';
  if (h.use === 'live') return 'You live there.';
  if (h.tier === 'mansion') return 'Nobody rents a mansion by the week.';
  if (h.selling) return 'It’s on the market.';
  h.use = 'let';
  h.letAgent = agent;
  return `Let out at ${money(letsFor(h))} a week${agent ? ', through a letting agent' : ''}.`;
}
export function stopLetting(c: Career, id: string): string {
  const h = life(c).homes.find((x) => x.id === id);
  if (!h || h.use !== 'let') return 'It isn’t let.';
  h.use = 'empty';
  return 'The tenants are out at the end of the month.';
}

/** A home gym (a house: £12k) or your own ring (a house or a mansion: £40k), in a home you own. */
export function addGym(c: Career, id: string, kind: 'gym' | 'ring'): string {
  const h = life(c).homes.find((x) => x.id === id);
  if (!h || !h.own) return 'You don’t own that.';
  if (h.tier === 'flat') return 'There’s no room in a flat.';
  if (h.gym === kind || (h.gym === 'ring' && kind === 'gym')) return 'You’ve got that already.';
  const price = kind === 'ring' ? PB.ring.price : PB.homeGym.price;
  if (c.money < price) return `You need ${money(price)}.`;
  spend(c, -price, `${kind === 'ring' ? 'Your own ring' : 'A home gym'} · ${homeName(h)}`, 'home', { untaxed: true });
  h.gym = kind;
  return kind === 'ring' ? 'A ring in the garden. The neighbours will love it.' : 'The home gym’s in.';
}

/** Training at home: a gym or a ring in the home you live in. */
export const homeTrainPrice = (c: Career): number => {
  const g = liveHome(c).gym;
  return g === 'ring' ? PB.ring.trainPrice : g === 'gym' ? PB.homeGym.trainPrice : 1;
};

/** Taken back by the bank: sold at 80%. If it was home, you're in a rented room in the same city. */
export function seizeHome(c: Career, homeId: string): number {
  const L = life(c), h = L.homes.find((x) => x.id === homeId);
  if (!h) return 0;
  const raised = Math.round(homeValue(h) * PB.repossess.at);
  if (h.use === 'live') {
    const room: Home = { id: newId(c, 'h'), city: h.city, country: h.country, tier: 'room', own: false, use: 'live', since: c.today };
    L.homes.push(room);
  }
  L.homes = L.homes.filter((x) => x !== h);
  return raised;
}

export const homesValue = (c: Career): number => life(c).homes.reduce((t, h) => t + homeValue(h), 0);
