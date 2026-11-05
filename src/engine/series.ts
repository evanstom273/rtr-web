// Series (match overhaul, stage 4): best of three, five or seven, across shows. The matches themselves are
// ordinary bookings; this is the scoreboard that strings them together (and can give each game its own
// stipulation). Career and booker mode book the games and record them (stage 9).
import type { StipulationId } from './types';

export type SeriesSide = 'a' | 'b';

export interface Series {
  id: string;
  /** Each side's wrestlers (one each for singles; teams for a tag series). */
  a: string[];
  b: string[];
  bestOf: 3 | 5 | 7;
  /** Results so far, in order (null: a no-contest, replayed). */
  games: { winner: SeriesSide | null; day?: string }[];
  /** A stipulation for each game, if the booker set them (otherwise standard). */
  stips?: StipulationId[];
  /** Belt on the line, or a shot at one, for whoever wins it. */
  prize?: string;
}

export const gamesToWin = (s: Series): number => Math.ceil(s.bestOf / 2);

export function seriesScore(s: Series): Record<SeriesSide, number> {
  const score = { a: 0, b: 0 };
  for (const g of s.games) if (g.winner) score[g.winner]++;
  return score;
}

/** Who's won it, if anyone has yet. */
export function seriesWinner(s: Series): SeriesSide | null {
  const sc = seriesScore(s), need = gamesToWin(s);
  return sc.a >= need ? 'a' : sc.b >= need ? 'b' : null;
}

/** The next game (its number and stipulation), or null once it's settled. */
export function nextGame(s: Series): { n: number; stip: StipulationId } | null {
  if (seriesWinner(s)) return null;
  const played = s.games.filter((g) => g.winner).length;
  return { n: s.games.length + 1, stip: s.stips?.[played] ?? 'standard' };
}

/** Put a result on the board. Returns the series winner if that settled it. */
export function recordGame(s: Series, winner: SeriesSide | null, day?: string): SeriesSide | null {
  if (seriesWinner(s)) return seriesWinner(s);
  s.games.push(day ? { winner, day } : { winner });
  return seriesWinner(s);
}

/** "Best of seven: Rook leads 3–2", "…all square at 2–2", "…Rook wins it 4–2". */
export function seriesLine(s: Series, aName: string, bName: string): string {
  const sc = seriesScore(s), w = seriesWinner(s);
  const head = `Best of ${s.bestOf === 3 ? 'three' : s.bestOf === 5 ? 'five' : 'seven'}`;
  if (w) return `${head}: ${w === 'a' ? aName : bName} wins it ${Math.max(sc.a, sc.b)}–${Math.min(sc.a, sc.b)}`;
  if (sc.a === sc.b) return `${head}: all square at ${sc.a}–${sc.b}`;
  return `${head}: ${sc.a > sc.b ? aName : bName} leads ${Math.max(sc.a, sc.b)}–${Math.min(sc.a, sc.b)}`;
}
