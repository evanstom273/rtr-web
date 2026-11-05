// Life: borrowing. Mortgages, car and bus finance, jet finance (and business loans later). Repayments go out on the
// 1st; miss three in a row and whatever it's for is taken and sold. Credit (0–100) sets the rate and the deposit.
import { letter, spend } from '../career';
import { addDays } from '../dates';
import { PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { life, newId, type Loan, type LoanKind } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/** Good (70+), middling (40+) or poor credit. */
export const creditBand = (c: Career): 0 | 1 | 2 => { const x = life(c).credit; return x >= PB.credit.good ? 0 : x >= PB.credit.poor ? 1 : 2; };
export const creditWord = (c: Career): string => ['Good', 'Middling', 'Poor'][creditBand(c)]!;

/** The rate you'd pay: good credit a point off, poor two on. */
export const rateFor = (c: Career, kind: LoanKind): number => Math.max(0.01, PB.loans[kind].rate + [-0.01, 0, 0.02][creditBand(c)]!);
export const depositFor = (c: Career, kind: LoanKind): number => PB.loans[kind].deposit[creditBand(c)]!;

/** A month's repayment on a loan (an ordinary repayment loan). */
export function monthlyFor(principal: number, rate: number, years: number): number {
  const r = rate / 12, n = years * 12;
  return r ? (principal * r) / (1 - (1 + r) ** -n) : principal / n;
}

/** What you've earned (taxable) over the last twelve months; newly signed, a year of your contract if that's more. */
export function yearEarned(c: Career): number {
  const L = life(c);
  const cut = addDays(c.today, -365).slice(0, 7);
  const past = Object.entries(L.months ?? {}).filter(([m]) => m > cut).reduce((t, [, v]) => t + v, 0);
  const k = c.people[c.player]?.contract;
  const contract = k ? k.fee * (k.dates ?? 4) * 12 : 0;
  return Math.max(past, contract);
}

/** How much more you can borrow (4.5 × a year's earnings, less what you already owe); nothing while bankrupt. */
export function canBorrow(c: Career): number {
  const L = life(c);
  if (L.bust && L.bust > c.today) return 0;
  const owed = L.loans.reduce((t, l) => t + l.left, 0);
  return Math.max(0, Math.round(yearEarned(c) * PB.borrowMult - owed));
}

/** Take out a loan for something: the deposit comes out of the bank, the rest is owed. */
export function borrow(c: Career, kind: LoanKind, on: string, what: string, price: number): { loan?: Loan; deposit: number; why?: string } {
  const deposit = Math.round(price * depositFor(c, kind));
  const principal = price - deposit;
  if (c.money < deposit) return { deposit, why: `You need ${money(deposit)} down.` };
  if (principal > canBorrow(c)) return { deposit, why: `They won’t lend you ${money(principal)}: you can borrow up to ${money(canBorrow(c))} on what you earn.` };
  const rate = rateFor(c, kind);
  const loan: Loan = { id: newId(c, 'l'), kind, on, what, left: principal, monthly: Math.round(monthlyFor(principal, rate, PB.loans[kind].years)), rate, missed: 0, since: c.today };
  life(c).loans.push(loan);
  return { loan, deposit };
}

/** Pay a loan off (what's left of it) from the bank. */
export function payOff(c: Career, id: string): string {
  const L = life(c), l = L.loans.find((x) => x.id === id);
  if (!l) return 'No such loan.';
  if (c.money < l.left) return `You need ${money(l.left)} to clear it.`;
  spend(c, -l.left, `Paid off · ${l.what}`, 'loan', { untaxed: true });
  L.loans = L.loans.filter((x) => x !== l);
  return `${l.what}: paid off.`;
}

/**
 * The 1st: every repayment. Can't pay: missed (credit −5, a letter); three in a row and it's repossessed (the
 * owner sells it at 80%, the loan's cleared from that, credit −30, and it's in the press). Paid: credit +1.
 * `seize` takes the thing back and returns what the sale raised.
 */
export function monthlyLoans(c: Career, seize: (c: Career, loan: Loan) => number): void {
  const L = life(c);
  for (const l of [...L.loans]) {
    const pay = Math.min(l.monthly, Math.round(l.left * (1 + l.rate / 12)));
    if (c.money >= pay) {
      const interest = Math.round(l.left * (l.rate / 12));
      spend(c, -pay, `Repayment · ${l.what}`, 'loan');
      l.left = Math.max(0, l.left + interest - pay);
      l.missed = 0;
      L.credit = Math.min(100, L.credit + PB.credit.onTime);
      if (l.left <= 0) { L.loans = L.loans.filter((x) => x !== l); letter(c, { kind: 'news', from: 'The bank', subject: `${l.what}: paid off`, body: ['That’s the last payment. It’s all yours.'] }); }
      continue;
    }
    l.missed++;
    l.left += Math.round(l.left * (l.rate / 12));
    L.credit = Math.max(0, L.credit - PB.credit.missed);
    if (l.missed < PB.repossess.missed) {
      letter(c, { kind: 'news', from: 'The bank', subject: `Missed payment · ${l.what}`, body: [`Your ${money(pay)} repayment didn’t go through. ${PB.repossess.missed - l.missed} more and they’ll take it back.`] });
      continue;
    }
    const raised = seize(c, l);
    L.loans = L.loans.filter((x) => x !== l);
    L.credit = Math.max(0, L.credit - PB.credit.repossessed);
    const short = Math.max(0, l.left - raised);
    if (short) spend(c, -short, `Still owed after repossession · ${l.what}`, 'loan');
    letter(c, { kind: 'news', from: 'The bank', subject: `Repossessed · ${l.what}`, body: [`Three missed payments. They’ve taken it and sold it for ${money(raised)}.${short ? ` You still owe ${money(short)}, and it’s come out of your account.` : ''}`, 'It’ll be in the papers by the weekend.'] });
  }
}
