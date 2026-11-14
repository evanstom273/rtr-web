// Life stage 7: bad luck (Lyra's call). Car crashes (worse when you drive tired; a driver or flying cuts the risk),
// burglary and fire (insurance pays out), scams and bad advice (a good agent warns you), and the market's own shocks
// (crashes, slumps and businesses folding, already in stage 3). Monthly, on their own dice.
import { seededRng, hashSeed } from '../../engine/rng';
import { letter, person, spend } from '../career';
import { addDays, YEAR_DAYS } from '../dates';
import { registerReplies } from '../mail';
import { PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { vehicleName, vehicleValue } from './garage';
import { homeName, homeValue } from './homes';
import { luxuryName } from './invest';
import { life } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const r100 = (n: number) => Math.round(n / 100) * 100;

/** The car you'd drive yourself (a road vehicle, not the bus) if you've no driver. */
const ROAD = new Set(['used_car', 'car', 'luxury_car', 'van']);
const yourCar = (c: Career) => ((life(c).staff ?? []).some((s) => s.role === 'driver') ? undefined : life(c).cars.find((v) => ROAD.has(v.tier)));

/** The 1st: the dice for the month's bad luck. */
export function monthlyRisk(c: Career, month: string): void {
  const L = life(c), p = person(c, c.player);
  const r = seededRng(hashSeed(c.seed, 'risk', month));
  // A crash: only if you drive yourself; tired doubles it.
  const car = yourCar(c);
  if (car && r() < PB.risk.crash / 12 * PB.vehicles[car.tier].crash * (1 + p.fatigue / 50)) {
    const v = car;
    const roll = r();
    if (roll < PB.risk.crashHurt) {
      const days = 21 + Math.floor(r() * 60);
      if (!p.injury || p.injury.until < addDays(c.today, days)) p.injury = { what: 'a car crash', until: addDays(c.today, days) };
      L.cars = L.cars.filter((x) => x !== v);
      letter(c, { kind: 'injury', from: 'The hospital', subject: 'A car crash', body: [`You fell asleep at the wheel. The ${vehicleName(v).toLowerCase()} is a write-off and you’re out for ${Math.round(days / 7)} weeks.`, ...(L.loans.some((l) => l.on === v.id) ? ['The finance on it is still yours to pay.'] : [])] });
    } else if (roll < PB.risk.crashHurt + PB.risk.crashWriteOff) {
      const back = L.insure?.home ? r100(vehicleValue(c, v) * 0.8) : 0;
      L.cars = L.cars.filter((x) => x !== v);
      if (back) spend(c, back, `Insurance · the ${vehicleName(v).toLowerCase()}`, 'insurance', { untaxed: true });
      letter(c, { kind: 'news', from: 'The garage', subject: 'Your car’s a write-off', body: [`Nobody hurt, but the ${vehicleName(v).toLowerCase()} is done.`, back ? `The insurance pays ${money(back)}.` : 'You weren’t insured.'] });
    } else {
      const bill = r100(vehicleValue(c, v) * (0.05 + r() * 0.15));
      spend(c, L.insure?.home ? -Math.min(bill, PB.risk.excess) : -bill, `Repairs · the ${vehicleName(v).toLowerCase()}`, 'transport');
      letter(c, { kind: 'news', from: 'The garage', subject: 'A bump', body: [`A prang on the way back from a show. Repairs: ${money(bill)}${L.insure?.home ? `; you pay the ${money(PB.risk.excess)} excess` : ''}.`] });
    }
  }
  // Burglary: a home you own (the luxuries in it go, or cash and kit).
  const homes = L.homes.filter((h) => h.own && h.use !== 'let');
  if (homes.length && r() < PB.risk.burglary / 12 * homes.length) {
    const lux = (L.luxury ?? []).filter((x) => x.kind === 'watch' || x.kind === 'art');
    const took = lux.length ? lux[Math.floor(r() * lux.length)]! : undefined;
    const loss = took ? took.v : r100(PB.risk.burgle[0] + r() * (PB.risk.burgle[1] - PB.risk.burgle[0]));
    if (took) L.luxury = L.luxury!.filter((x) => x !== took);
    else spend(c, -loss, 'Burgled', 'insurance');
    if (L.insure?.home) spend(c, Math.max(0, loss - PB.risk.excess), 'Insurance · the burglary', 'insurance', { untaxed: true });
    letter(c, { kind: 'news', from: 'The police', subject: 'You’ve been burgled', body: [`While you were on the road. They took ${took ? luxuryName(took.kind, took.tier).toLowerCase() : 'cash and kit'} (${money(loss)}).`, L.insure?.home ? 'The insurance covers it, less the excess.' : 'You weren’t insured.'] });
  }
  // Fire: a home or a business.
  const all = [...L.homes.filter((h) => h.own), ...(L.ventures ?? [])];
  if (all.length && r() < PB.risk.fire / 12 * all.length) {
    const hit = all[Math.floor(r() * all.length)]!;
    const isHome = 'tier' in hit;
    const value = isHome ? homeValue(hit) : hit.v;
    const damage = r100(value * (0.15 + r() * 0.5));
    const covered = isHome ? L.insure?.home : L.insure?.business;
    if (isHome) spend(c, -damage, `Fire damage · ${homeName(hit).toLowerCase()}`, 'home');
    else { hit.v = Math.max(0, hit.v - damage); }
    if (covered) spend(c, Math.max(0, damage - PB.risk.excess), 'Insurance · the fire', 'insurance', { untaxed: true });
    letter(c, { kind: 'news', from: 'The fire brigade', subject: 'A fire', body: [`A fire at ${isHome ? `your ${homeName(hit).toLowerCase()} in ${hit.city}` : 'your business'}: ${money(damage)} of damage.`, covered ? 'The insurance pays, less the excess.' : 'You weren’t insured.'] });
  }
  // A scam: someone with a sure thing, now and then, when you've money about. A good agent smells it.
  if (c.money >= PB.risk.scamFrom && r() < PB.risk.scam / 12) {
    const amount = r100(Math.min(c.money * 0.2, 250_000));
    const warned = L.agent && (L.agent.tier === 'established' || L.agent.tier === 'super');
    letter(c, {
      kind: 'news', from: 'A friend of a friend', subject: 'A sure thing',
      body: [`A mate of a mate is putting together a property deal abroad: put in ${money(amount)} and you’ll double it in a year, guaranteed.`, ...(warned ? [`Your agent, ${L.agent!.name}: “Don’t. It stinks.”`] : [])],
      replies: [{ id: 'scam_in', label: `Put in ${money(amount)}`, detail: 'Doubled in a year, they say' }, { id: 'scam_no', label: 'No thanks', detail: '' }],
      ctx: { amount: String(amount) },
    });
  }
}

registerReplies({
  scam_in: (c, l) => {
    const amount = Number(l.ctx?.amount ?? 0);
    if (c.money < amount) return 'You don’t have it.';
    spend(c, -amount, 'A sure thing', 'invest', { untaxed: true });
    const r = seededRng(hashSeed(c.seed, 'scam', l.id));
    if (r() < PB.risk.scamReal) {
      (life(c).sure ??= []).push({ amount: amount * 2, due: addDays(c.today, YEAR_DAYS) });
      return 'In. They say a year.';
    }
    (life(c).sure ??= []).push({ amount: 0, due: addDays(c.today, 120), lost: amount });
    return 'In. They say a year.';
  },
  scam_no: () => 'You passed.',
});

/** A sure thing coming good (rarely) or the phone going dead (usually). */
export function dailySure(c: Career): void {
  const L = c.life;
  if (!L?.sure?.length) return;
  for (const s of [...L.sure]) {
    if (s.due > c.today) continue;
    L.sure = L.sure.filter((x) => x !== s);
    if (s.amount) { spend(c, s.amount, 'The sure thing paid off', 'invest'); letter(c, { kind: 'news', from: 'A friend of a friend', subject: 'Told you', body: [`Doubled, as promised: ${money(s.amount)}.`] }); }
    else letter(c, { kind: 'news', from: 'The police', subject: 'It was a scam', body: [`The “sure thing” was a scam. The number’s dead and your ${money(s.lost ?? 0)} is gone.`] });
  }
}
