// Shared helpers for the career's tests and long-run harnesses (not used by the game itself).
import { TITLES, WRESTLERS, findWrestler } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { applyBout, finishDay, myBoutToday, startCareer } from './index';
import type { SimJob, SimOut } from './sim';
import type { Career } from './types';

export type Runner = (jobs: SimJob[]) => Promise<SimOut[]>;

const statLine = { movesTried: 20, movesLanded: 12, finTried: 1, finHit: 1, sigTried: 1, sigHit: 1, reversalTries: 5, reversalWins: 2, kickouts: 2, pinTries: 3 };

/** A stand-in for the engine: instant results from popularity and a coin, so years run in seconds. */
export const quick: Runner = async (jobs) => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const h = (j.seed % 1000) / 1000;
  const pa = a.popularity.global / (a.popularity.global + b.popularity.global);
  return { key: j.key, winner: h < pa ? 'you' : 'them', finish: 'PINFALL', t: 600 + (j.seed % 600), stars: 2 + (j.seed % 30) / 10, stats: { you: statLine, them: statLine } };
});

/**
 * The indie scene is generated per world, so tests ask for an indie by kind rather than by id:
 * '@indie' (the most popular North American man without a title), '@indie-f' (the same, a woman),
 * '@champ' (the World Independent champion). Anything else is a wrestler id.
 */
export function who(player: string): string {
  if (!player.startsWith('@')) return player;
  if (player === '@champ') return TITLES.find((t) => t.id === 'WORLD_INDEPENDENT_CHAMPIONSHIP')!.holder!;
  const held = new Set(TITLES.map((t) => t.holder));
  const gender = player === '@indie-f' ? 'FEMALE' : 'MALE';
  const pool = WRESTLERS.filter((w) => w.promotion === 'TIS' && w.gender === gender && !held.has(w.id));
  const na = pool.filter((w) => w.region === 'NORTH_AMERICA');
  return (na.length ? na : pool).sort((a, b) => b.popularity.global - a.popularity.global || (a.id < b.id ? -1 : 1))[0]!.id;
}

/** A fresh world and a career in it. */
export function begin(player: string, seed = 7, today = '2026-11-03'): Career {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player: who(player), today, seed });
  w.career = c;
  return c;
}

/** Play out a day the way the game does: your match first (as if you played it, unless `how` says simmed), then the world. */
export async function day(c: Career, run: Runner = quick, how: 'played' | 'simmed' = 'played'): Promise<void> {
  const mine = myBoutToday(c);
  if (mine) {
    const [out] = await run([{ key: 'mine', seed: 1, you: mine.bout.a, them: mine.bout.b, rules: {} }]);
    applyBout(c, mine.show, mine.index, out!, true, how);
  }
  await finishDay(c, run);
}

/** Median and a percentile of a list of numbers. */
export function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]!;
}
