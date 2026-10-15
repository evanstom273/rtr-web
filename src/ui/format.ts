import { CLASS_LABEL } from '../data/commentary';
import { isChampion, type Wrestler, type WrestlerClass } from '../data/rtr';
import { clamp } from '../engine';

/** Body-part colour ramp, red → orange → gold → green-blue. */
export function hpColor(h: number): string {
  const st: [number, [number, number, number]][] = [
    [0, [200, 63, 74]],
    [35, [224, 122, 45]],
    [65, [201, 162, 39]],
    [100, [76, 168, 140]],
  ];
  for (let i = 1; i < st.length; i++) {
    const [b, cb] = st[i]!;
    if (h <= b) {
      const [a, ca] = st[i - 1]!, f = (h - a) / (b - a);
      return `rgb(${ca.map((c, j) => Math.round(c + (cb[j]! - c) * f)).join(',')})`;
    }
  }
  return 'rgb(76,168,140)';
}

/** Impact as five pips. */
export function pts(imp: number): string {
  const n = clamp(Math.ceil(imp / 2), 1, 5);
  return '●'.repeat(n) + '○'.repeat(5 - n);
}

export const classNames = (cls: readonly WrestlerClass[]): string => cls.map((c) => CLASS_LABEL[c]).join(' · ');

/** "(c) Jamie Mercer (f)": champion prefix, disposition suffix. */
export function displayName(w: Wrestler): string {
  return `${isChampion(w) ? '(c) ' : ''}${w.name} (${w.disposition === 'HEEL' ? 'h' : 'f'})`;
}

/** Colour class: champions are gold whatever their disposition, otherwise face blue / heel red. */
export const nameTone = (w: Wrestler): 'champ' | 'face' | 'heel' => (isChampion(w) ? 'champ' : w.disposition === 'HEEL' ? 'heel' : 'face');

/** Short surname-ish label for tight spots (ring markers). */
export function shortName(w: Wrestler): string {
  const clean = w.name.replace(/"[^"]*"\s*/g, '').trim();
  const parts = clean.split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1]! : clean).toUpperCase();
}

/** "3.50" → "3.5", "3.00" → "3". */
export const starsShort = (x: number): string => x.toFixed(2).replace(/\.00$/, '').replace(/0$/, '');

export const reduceMotion = (): boolean => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/** Light haptic tick where supported (Android Chrome). */
export function buzz(ms: number | number[] = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}
