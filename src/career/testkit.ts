// Shared helpers for the career's tests and long-run harnesses (not used by the game itself).
import { findWrestler, globalScore, TITLES, WRESTLERS } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { applyBout, boutJob, finishDay, myBoutToday, startCareer } from './index';
import type { SimJob, SimOut } from './sim';
import { FEATURES } from './tuning';
import type { Career } from './types';

export type Runner = (jobs: SimJob[]) => Promise<SimOut[]>;

const statLine = { movesTried: 20, movesLanded: 12, finTried: 1, finHit: 1, sigTried: 1, sigHit: 1, reversalTries: 5, reversalWins: 2, kickouts: 2, pinTries: 3 };

/** A stand-in for the engine: instant results from popularity and a coin, so years run in seconds. */
export const quick: Runner = async (jobs) => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const h = (j.seed % 1000) / 1000;
  const pa = globalScore(a) / (globalScore(a) + globalScore(b));
  const winner = h < pa ? 'you' : 'them';
  const out: SimOut = { key: j.key, winner, finish: 'PINFALL', t: 600 + (j.seed % 600), stars: 2 + (j.seed % 30) / 10, stats: { you: statLine, them: statLine } };
  // More than two people: the winning lead's whole team wins (in a free-for-all, just them).
  if (j.extras?.length) {
    const all = [{ id: j.you, team: 0 }, { id: j.them, team: 1 }, ...j.extras];
    const team = winner === 'you' ? 0 : 1;
    out.multi = { winners: all.filter((x) => x.team === team).map((x) => x.id), losers: all.filter((x) => x.team !== team).map((x) => x.id), elims: [], hp: {} };
  }
  return out;
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
  return (na.length ? na : pool).sort((a, b) => globalScore(b) - globalScore(a) || (a.id < b.id ? -1 : 1))[0]!.id;
}

/** A fresh world and a career in it. (MATCHES_ON=1: with the match overhaul on, for the long-run harnesses.) */
export function begin(player: string, seed = 7, today = '2026-11-03'): Career {
  if (process.env.MATCHES_ON) (FEATURES as { matches: boolean }).matches = true;
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player: who(player), today, seed });
  w.career = c;
  return c;
}

/** Play out a day the way the game does: your match first (as if you played it, unless `how` says simmed), then the world. */
export async function day(c: Career, run: Runner = quick, how: 'played' | 'simmed' = 'played'): Promise<void> {
  const mine = myBoutToday(c);
  if (mine) {
    const job = mine.bout.sides ? { ...boutJob(c, mine.show, mine.bout, mine.index), key: 'mine', seed: 1 } : { key: 'mine', seed: 1, you: mine.bout.a, them: mine.bout.b, rules: {} };
    const [out] = await run([job]);
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
