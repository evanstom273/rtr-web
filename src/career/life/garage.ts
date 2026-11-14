// Life: getting about. A banger to a jet: cash or finance, running costs on the 1st, and what they're worth if you
// sell. The van and the tour bus take mates along: they chip in, and the drive does the friendship good.
import { findWrestler } from '../../data/rtr';
import { activeWorld } from '../../world/world';
import { bondsOf, kindOf, moveBond } from '../../world/people';
import { spend } from '../career';
import { daysBetween, YEAR_DAYS } from '../dates';
import { PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { borrow } from './loans';
import { life, newId, type Vehicle, type VehicleTier } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
export const VEHICLE_TIERS = Object.keys(PB.vehicles) as VehicleTier[];
/** What they lose a year: cars and vans about 15%, the bus and a jet share 10%, a jet 7%, a banger 10%. */
const KEEP: Record<VehicleTier, number> = { used_car: 0.9, car: 0.85, luxury_car: 0.85, van: 0.85, tour_bus: 0.9, jet_share: 0.9, jet: 0.93 };
export const vehicleValue = (c: Career, v: Vehicle): number => Math.round(v.paid * KEEP[v.tier] ** (daysBetween(v.since, c.today) / YEAR_DAYS) / 100) * 100;
export const vehicleName = (v: Pick<Vehicle, 'tier'>): string => PB.vehicles[v.tier].name;
const loanKind = (t: VehicleTier) => (t === 'jet' || t === 'jet_share' ? 'jet' as const : 'car' as const);

/** Buy one (cash, or on finance: the deposit now). One of each kind. */
export function buyVehicle(c: Career, tier: VehicleTier, finance: boolean): { ok: boolean; text: string } {
  const L = life(c);
  if (L.cars.some((v) => v.tier === tier)) return { ok: false, text: `You’ve already got a ${PB.vehicles[tier].name.toLowerCase()}.` };
  const price = PB.vehicles[tier].price, id = `v${L.seq + 1}`, name = PB.vehicles[tier].name;
  if (finance) {
    const b = borrow(c, loanKind(tier), id, name, price);
    if (!b.loan) return { ok: false, text: b.why! };
    spend(c, -b.deposit, `Deposit · ${name}`, 'transport', { untaxed: true });
  } else {
    if (c.money < price) return { ok: false, text: `You need ${money(price)}.` };
    spend(c, -price, `Bought · ${name}`, 'transport', { untaxed: true });
  }
  newId(c, 'v');
  L.cars.push({ id, tier, paid: price, since: c.today });
  return { ok: true, text: `${name}: yours${finance ? `, on finance at ${money(L.loans.find((l) => l.on === id)!.monthly)} a month` : ''}. Running it costs ${money(PB.vehicles[tier].monthly)} a month.` };
}

/** Sell one: what it's worth, less anything still owed on it. */
export function sellVehicle(c: Career, id: string): string {
  const L = life(c), v = L.cars.find((x) => x.id === id);
  if (!v) return 'You don’t own that.';
  const worth = vehicleValue(c, v), loan = L.loans.find((l) => l.on === id);
  spend(c, worth, `Sold · ${vehicleName(v)}`, 'transport', { untaxed: true });
  if (loan) { spend(c, -loan.left, `Finance cleared · ${vehicleName(v)}`, 'loan', { untaxed: true }); L.loans = L.loans.filter((x) => x !== loan); }
  L.cars = L.cars.filter((x) => x !== v);
  return `Sold for ${money(worth)}${loan ? ` (${money(loan.left)} of it cleared the finance)` : ''}.`;
}

/** The 1st: running costs (fuel, insurance, servicing; the bus's driver; the jet's crew and hangar). */
export function monthlyGarage(c: Career): void {
  for (const v of life(c).cars) spend(c, -PB.vehicles[v.tier].monthly, `Running · ${vehicleName(v)}`, 'transport');
}

/** Taken back: sold at 80%. */
export function seizeVehicle(c: Career, id: string): number {
  const L = life(c), v = L.cars.find((x) => x.id === id);
  if (!v) return 0;
  L.cars = L.cars.filter((x) => x !== v);
  return Math.round(vehicleValue(c, v) * PB.repossess.at);
}

export const garageValue = (c: Career): number => life(c).cars.reduce((t, v) => t + vehicleValue(c, v), 0);

/** Who rides with you in the van or on the bus: your closest friends in the business, up to the seats. */
export function roadCrew(c: Career, seats: number): string[] {
  if (!life(c).crewOn || seats <= 4) return [];
  const P = activeWorld().people;
  if (!P) return [];
  return bondsOf(P, c.player)
    .filter(({ other, bond }) => { const k = kindOf(bond, c.today); return (k === 'friend' || k === 'best_friend') && !!findWrestler(other) && !c.people[other]?.retired && !c.people[other]?.injury; })
    .sort((a, b) => (b.bond.a === c.player ? b.bond.lb : b.bond.la) - (a.bond.a === c.player ? a.bond.lb : a.bond.la))
    .slice(0, seats - 1)
    .map(({ other }) => other);
}

/** A road trip with the crew: a little closer every time. */
export function crewTrip(c: Career, crew: string[]): void {
  const P = activeWorld().people;
  if (!P) return;
  for (const id of crew) moveBond(P, c.player, id, 2, 'on the road together', c.today);
}
