// Life stage 6: family money. Married, you share: your partner's earnings go into the house and help with the bills.
// Kids cost money until they're grown (and can come to your school). A divorce splits what you own down the middle,
// with no prenups (Lyra's call): your half of the cash first, then things get sold.
import { findWrestler } from '../../data/rtr';
import { activeWorld } from '../../world/world';
import { letter, spend } from '../career';
import { partnerOf, setSplitHook } from '../romance';
import { COST_INDEX, PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { lifeWorld } from '../../world/lifeWorld';
import { yearIncome } from './aiMoney';
import { sellDown } from './fall';
import { life, on, regionOfCity } from './state';
import { netWorth } from './worth';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const ageOn = (born: string, today: string) => Number(today.slice(0, 4)) - Number(born.slice(0, 4)) - (today.slice(5) < born.slice(5) ? 1 : 0);

/** Your children (born to you in the game, or family from the start), with their ages. */
export function kidsOf(c: Career): { id: string; name: string; age: number }[] {
  const folk = activeWorld().people?.folk ?? {};
  return Object.values(folk).filter((f) => f.kind === 'family' && f.of === c.player && (f.rel === 'son' || f.rel === 'daughter') && f.born)
    .map((f) => ({ id: f.id, name: f.name, age: ageOn(f.born!, c.today) }));
}
/** What a child costs a month at this age (by where you live). */
export const kidCost = (c: Career, age: number): number => Math.round((age < 5 ? PB.family.kid[0] : age < 18 ? PB.family.kid[1] : age < 22 ? PB.family.kid[2] : 0) * COST_INDEX[regionOfCity(life(c).city)]);

/** What your partner puts in a month (married or living together): half their spare, up to half the bills. */
export function partnerIn(c: Career): number {
  const p = partnerOf(c.player);
  if (!p || p.bond.love?.st !== 'married') return 0;
  const w = findWrestler(p.other);
  const theirs = w ? yearIncome(c, w) / 12 * 0.35 : PB.family.job * COST_INDEX[regionOfCity(life(c).city)];
  return Math.round(Math.max(0, theirs));
}

/** The 1st: your partner's share in, the kids' costs out. */
export function monthlyFamily(c: Career): void {
  const inn = partnerIn(c);
  if (inn) {
    const p = partnerOf(c.player)!;
    spend(c, inn, `Household · ${findWrestler(p.other)?.name.split(' ')[0] ?? activeWorld().people?.folk?.[p.other]?.name.split(' ')[0] ?? 'your partner'} chips in`, 'family', { untaxed: true });
    // An AI partner's money goes down by what they put in.
    const x = lifeWorld().wealth?.[p.other];
    if (x) x.m -= inn;
  }
  for (const k of kidsOf(c)) {
    const cost = kidCost(c, k.age);
    if (cost) spend(c, -cost, `${k.name.split(' ')[0]} · ${k.age < 5 ? 'childcare' : k.age < 18 ? 'school and clothes' : 'university'}`, 'family');
  }
}

/** A divorce: they get half of everything you're worth (no prenups). Cash first, then things are sold. */
export function divorce(c: Career, other: string): string {
  const half = Math.max(0, Math.round(netWorth(c) / 2));
  if (!half) return '';
  const name = findWrestler(other)?.name ?? activeWorld().people?.folk?.[other]?.name ?? 'Your ex';
  const sold = c.money < half ? sellDown(c, half - Math.max(0, c.money)) : [];
  spend(c, -half, `Divorce settlement · ${name}`, 'family', { untaxed: true });
  const x = lifeWorld().wealth?.[other];
  if (x) x.m += half;
  letter(c, {
    kind: 'news', from: 'Your solicitor', subject: 'The divorce is settled',
    body: [`${name} gets half: ${money(half)}. No prenup, so that’s the law.`, ...(sold.length ? [`To pay it, you’ve had to sell: ${sold.join(', ')}.`] : [])],
  });
  return `Divorce: ${money(half)} to ${name}.`;
}

setSplitHook((c, a, b, was) => {
  if (!on('family') || was !== 'married' || c.spectator) return;
  if (a === c.player) divorce(c, b);
  else if (b === c.player) divorce(c, a);
});
