// What you're worth: the bank, your homes, the garage and everything invested, less what you owe.
import type { Career } from '../types';
import { garageValue } from './garage';
import { homesValue } from './homes';
import { investedValue } from './invest';
import { on } from './state';

export function netWorth(c: Career): number {
  const L = c.life;
  if (!L) return c.money;
  return Math.round(c.money + homesValue(c) + garageValue(c) + (on('invest') ? investedValue(c) : 0) - L.loans.reduce((t, l) => t + l.left, 0));
}
