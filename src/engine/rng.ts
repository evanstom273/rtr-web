/** A source of uniform numbers in [0, 1). Same contract as Math.random. */
export type Rng = () => number;

/** mulberry32: small, fast, good enough for a game, fully reproducible from a 32-bit seed. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mathRng: Rng = Math.random;

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export function pick<T>(rnd: Rng, arr: readonly T[]): T {
  if (!arr.length) throw new Error('pick() from empty array');
  return arr[Math.floor(rnd() * arr.length)] as T;
}
