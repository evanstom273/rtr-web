// Life stage 7: the full fall (Lyra's call). Run out past what the bank will stand and things get sold, in order:
// the luxuries, the funds and stakes, the businesses, the cars, the places you let, and last the home you live in.
// If that still isn't enough, it's bankruptcy: the debts are wiped, the press have a field day, no one lends to you
// for six years, your partner takes it hard, and the deals you're offered are worse until you're discharged.
import { findWrestler } from '../../data/rtr';
import { letter, person, spend } from '../career';
import { addDays, addMonths, fmtDay } from '../dates';
import { moveRelation } from '../relations';
import { partnerOf } from '../romance';
import { PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { seizeVehicle, vehicleName } from './garage';
import { homeName, seizeHome } from './homes';
import { FUND_KINDS, luxuryName, sellStake, seizeVenture, takeOut, ventureName } from './invest';
import { yearEarned } from './loans';
import { life, on } from './state';
import { setAgentLift } from '../contracts';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/** How far into the red the bank lets you go before it calls things in: a quarter of a year's earnings, £5k at least. */
export const overdraftOf = (c: Career): number => Math.max(PB.fall.overdraft, Math.round(yearEarned(c) * 0.25));
export const isBust = (c: Career): boolean => !!c.life?.bust && c.life.bust > c.today;

/**
 * Sell things off until `need` is raised (or there's nothing left), cheapest-to-lose first. Each sale clears its own
 * loan; what's left over comes to you. Returns what went.
 */
export function sellDown(c: Career, need: number): string[] {
  const L = life(c), gone: string[] = [];
  let raised = 0;
  const take = (n: number, what: string) => { raised += n; gone.push(what); };
  const loanOn = (id: string) => L.loans.find((l) => l.on === id);
  const clear = (id: string, got: number, what: string): number => {
    const loan = loanOn(id);
    let net = got;
    if (loan) { net -= loan.left; L.loans = L.loans.filter((l) => l !== loan); }
    spend(c, net, `Forced sale · ${what}`, 'loan', { untaxed: true });
    return net;
  };
  for (const x of [...(L.luxury ?? [])].sort((a, b) => a.v - b.v)) {
    if (raised >= need) return gone;
    const got = Math.round(x.v * PB.fall.fireSale);
    spend(c, got, `Forced sale · ${luxuryName(x.kind, x.tier).toLowerCase()}`, 'luxury', { untaxed: true });
    L.luxury = L.luxury!.filter((y) => y !== x);
    take(got, luxuryName(x.kind, x.tier).toLowerCase());
  }
  for (const k of FUND_KINDS) {
    if (raised >= need) return gone;
    const f = L.funds?.[k];
    if (!f || f.v <= 0) continue;
    const v = f.v; takeOut(c, k); take(v, `your ${k} fund`);
  }
  for (const s of [...(L.stakes ?? [])]) {
    if (raised >= need) return gone;
    const before = c.money; sellStake(c, s.promo); take(c.money - before, `your stake in ${s.promo}`);
  }
  for (const v of [...(L.ventures ?? [])]) {
    if (raised >= need) return gone;
    const name = ventureName(v.kind, v.city);
    take(clear(v.id, seizeVenture(c, v.id) / PB.repossess.at * PB.fall.fireSale, name), name.toLowerCase());
  }
  for (const v of [...L.cars]) {
    if (raised >= need) return gone;
    const name = vehicleName(v);
    take(clear(v.id, seizeVehicle(c, v.id) / PB.repossess.at * PB.fall.fireSale, name), name.toLowerCase());
  }
  for (const h of [...L.homes].filter((x) => x.own).sort((a, b) => (a.use === 'live' ? 1 : 0) - (b.use === 'live' ? 1 : 0))) {
    if (raised >= need) return gone;
    const name = homeName(h).toLowerCase();
    take(clear(h.id, seizeHome(c, h.id) / PB.repossess.at * PB.fall.fireSale, name), name);
  }
  return gone;
}

/** The 1st: past the overdraft, things go; if there's nothing left to sell, bankruptcy. */
export function monthlyFall(c: Career): void {
  const L = life(c);
  if (L.bust && L.bust <= c.today && !L.discharged) {
    L.discharged = c.today;
    letter(c, { kind: 'news', from: 'The court', subject: 'You’re discharged', body: ['Your bankruptcy is over. You can borrow again, though your credit starts low.'] });
  }
  const limit = overdraftOf(c);
  if (c.money >= -limit) return;
  const gone = sellDown(c, -c.money);
  if (gone.length) letter(c, { kind: 'news', from: 'The bank', subject: 'Your overdraft', body: [`You were ${money(-c.money)} overdrawn, past what they’ll allow. To cover it: ${gone.join(', ')}.`] });
  if (c.money >= -limit || isBust(c)) return;
  bankrupt(c);
}

/** Bankruptcy: the debts wiped (the overdraft and every loan), credit gone, six years without borrowing. */
export function bankrupt(c: Career): void {
  const L = life(c);
  const owed = Math.max(0, -c.money) + L.loans.reduce((t, l) => t + l.left, 0);
  if (c.money < 0) spend(c, -c.money, 'Debts written off · bankruptcy', 'loan', { untaxed: true });
  L.loans = [];
  L.credit = 0;
  L.bust = addMonths(c.today, PB.fall.years * 12);
  delete L.discharged;
  L.busts = (L.busts ?? 0) + 1;
  const me = findWrestler(c.player)!;
  person(c, c.player).rep = Math.max(0, person(c, c.player).rep - PB.fall.rep);
  const p = partnerOf(c.player);
  if (p) moveRelation(c, p.other, PB.fall.partner, 'You went bankrupt');
  letter(c, {
    kind: 'news', from: 'The Wrestling Observer', subject: `${me.name} declared bankrupt`,
    body: [`${money(owed)} in debts. Word is the cars went first, then the house.`, `No one will lend to you until ${fmtDay(L.bust, 'long')}, and promoters know you need the money: the deals will be worse until then.`],
  });
  void addDays;
}

// Promoters know you need the money: the deals are worse until you're discharged.
setAgentLift((c) => (on('risk') && isBust(c) ? PB.risk.bustDeals : 1));
