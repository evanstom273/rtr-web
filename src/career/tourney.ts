// Cups: eight wrestlers, three rounds, each round on its own show a fortnight apart (career expansion, stage 4).
// Small and dependency-free so the booker and the specials can both use it.
import type { Career, Tourney } from './types';

export const ROUND_NAMES = ['Quarter-final', 'Semi-final', 'Final'] as const;
export const roundName = (r: number): string => ROUND_NAMES[r] ?? 'Final';
/** Bracket order for eight seeds: 1v8, 4v5, 2v7, 3v6, so the top two can only meet in the final. */
export const BRACKET = [0, 7, 3, 4, 1, 6, 2, 5];

export const tourneyOf = (c: Career, id?: string): Tourney | undefined => (id ? c.tourneys?.find((t) => t.id === id) : undefined);

/** A round's pairs: the bracket for the quarter-finals, then the winners of the round before. */
export function tourneyPairs(t: Tourney, round: number): [string | null, string | null][] {
  const src = round === 0 ? t.entrants : t.won[round - 1] ?? [];
  const n = round === 0 ? 4 : round === 1 ? 2 : 1;
  return Array.from({ length: n }, (_, i) => [src[2 * i] ?? null, src[2 * i + 1] ?? null]);
}

/** Every match in the round has a winner. */
export const roundDone = (t: Tourney, round: number): boolean => tourneyPairs(t, round).every((_, i) => !!t.won[round]?.[i]);
