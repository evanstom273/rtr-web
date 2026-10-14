import { CLS } from '../data/labels';
import { clamp } from '../engine';
import type { WrestlerClass } from '../engine';

/** Body-part colour ramp, red → orange → gold → blue. */
export function hpColor(h: number): string {
  const st: [number, [number, number, number]][] = [
    [0, [200, 63, 74]],
    [40, [224, 122, 45]],
    [70, [201, 162, 39]],
    [100, [63, 145, 216]],
  ];
  for (let i = 1; i < st.length; i++) {
    const [b, cb] = st[i]!;
    if (h <= b) {
      const [a, ca] = st[i - 1]!, f = (h - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j]! - c) * f)).join(',')})`;
    }
  }
  return 'rgb(63,145,216)';
}

/** Impact as five pips. */
export function pts(imp: number): string {
  const n = clamp(Math.ceil(imp / 2.6), 1, 5);
  return '●'.repeat(n) + '○'.repeat(5 - n);
}

export const classNames = (cls: readonly WrestlerClass[]): string => cls.map((c) => CLS[c]).join(' · ');

/** "3.50" → "3.5", "3.00" → "3", as the original greatest-hits list did. */
export const starsShort = (x: number): string => x.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');

export const reduceMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
