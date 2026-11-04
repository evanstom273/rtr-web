// The shared layer under the skins: what each screen shows, worked out once. Skins only draw it.
import { globalScore } from '../data/rtr';
import { CLASS_LABEL } from '../data/commentary';
import type { Wrestler } from '../data/rtr';
import { fmtClock, type LogEntry, type MatchState, type Rating, type SideKey } from '../engine';

/** "Adebayo "The Great" Okoro" → "Okoro". */
export function surname(w: Wrestler): string {
  const parts = w.name.replace(/"[^"]*"\s*/g, '').trim().split(/\s+/);
  return parts[parts.length - 1] ?? w.name;
}

/** Plain text of a log line. */
export const lineText = (l: LogEntry): string => l.segs.map((s) => s.v).join('');

// ---------------------------------------------------------------- the match

export interface Moment {
  /** The big word: the latest flash ("Countered!", a finisher's name), else the move in the line. */
  big: string;
  /** The line it came from, for the deck under the headline. */
  line: LogEntry | null;
  /** Who it belongs to, when the line names someone first. */
  side: SideKey | null;
  /** Bumps whenever the moment changes, for re-running entrance animations. */
  id: number;
}

/**
 * The headline moment: the most recent big event and the commentary line that goes with it. Flashes
 * and log lines share one sequence, so the line is the first one logged around the flash.
 */
export function moment(S: MatchState): Moment {
  let flash: { id: number; text: string } | null = null;
  for (let i = S.events.length - 1; i >= 0; i--) {
    const ev = S.events[i]!;
    if (ev.type === 'flash') {
      flash = { id: ev.id, text: ev.text };
      break;
    }
  }
  const real = (l: LogEntry) => l.cls !== 'dim' && l.cls !== 'crowd';
  let line: LogEntry | null = null;
  if (flash) {
    // The line logged nearest the flash (moves log just before they flash; finishes just after).
    let best = Infinity;
    for (const l of S.log) {
      if (!real(l)) continue;
      const d = Math.abs(l.id - flash.id);
      if (d < best) {
        best = d;
        line = l;
      }
    }
    if (best > 6) line = null;
  }
  // Nothing big has happened lately: the latest highlighted (or any) line carries the headline.
  const lastHl = [...S.log].reverse().find((l) => l.cls === 'hl') ?? [...S.log].reverse().find(real) ?? null;
  if (!flash || (lastHl && line && lastHl.id - line.id > 12)) {
    line = lastHl;
    flash = null;
  }
  const mv = line?.segs.find((s) => s.k === 'move')?.v;
  const who = line?.segs.find((s) => s.k === 'name');
  const big = flash?.text ?? mv ?? (line ? lineText(line).replace(/[.!]+$/, '') : 'Bell time');
  return { big, line, side: who && who.k === 'name' ? who.side : null, id: flash?.id ?? line?.id ?? 0 };
}

/** The last few real commentary lines, newest first. */
export function recentLines(S: MatchState, n: number): LogEntry[] {
  const out: LogEntry[] = [];
  for (let i = S.log.length - 1; i >= 0 && out.length < n; i--) out.push(S.log[i]!);
  return out;
}

// ---------------------------------------------------------------- tale of the tape

export const STAT_KEYS = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'] as const;
export const STAT_LABEL: Record<(typeof STAT_KEYS)[number] | 'popularity', string> = {
  strength: 'Strength', speed: 'Speed', stamina: 'Stamina', skill: 'Skill', striking: 'Striking', charisma: 'Charisma', popularity: 'Popularity',
};
const EDGE_WORD: Record<(typeof STAT_KEYS)[number], string> = {
  strength: 'the stronger of the two', speed: 'quicker', stamina: 'the fitter', skill: 'the cleaner wrestler', striking: 'the harder hitter', charisma: 'the bigger personality',
};

export interface TapeStat {
  key: string;
  label: string;
  a: number;
  b: number;
  /** Who has the edge: 'a', 'b' or level. */
  edge: 'a' | 'b' | null;
}

export interface Tape {
  a: Wrestler;
  b: Wrestler;
  vitals: { label: string; a: string; b: string }[];
  stats: TapeStat[];
  /** Two or three plain sentences: size, then each side's best edge. */
  story: string[];
}

/** "5'8" → "5′ 8″". */
export function fmtHeight(h: string): string {
  const m = /^(\d+)'\s*(\d+)?/.exec(h);
  return m ? `${m[1]}′ ${m[2] ?? 0}″` : h;
}

export function tape(a: Wrestler, b: Wrestler): Tape {
  const stats: TapeStat[] = [
    ...STAT_KEYS.map((k) => ({ key: k, label: STAT_LABEL[k], a: a.stats[k], b: b.stats[k] })),
    { key: 'popularity', label: STAT_LABEL.popularity, a: globalScore(a), b: globalScore(b) },
  ].map((s) => ({ ...s, edge: s.a > s.b ? 'a' : s.b > s.a ? 'b' : null }));
  const classes = (w: Wrestler) => w.classes.map((c) => CLASS_LABEL[c]).join(' · ');
  const vitals = [
    { label: 'Height', a: fmtHeight(a.height), b: fmtHeight(b.height) },
    { label: 'Weight', a: `${a.weight} lb`, b: `${b.weight} lb` },
    { label: 'Age', a: String(a.age), b: String(b.age) },
    { label: 'From', a: a.country, b: b.country },
    { label: 'Promotion', a: a.promotion, b: b.promotion },
    { label: 'Style', a: classes(a), b: classes(b) },
  ];
  const story: string[] = [];
  const diff = Math.abs(a.weight - b.weight);
  if (diff >= 20) {
    const [heavy, light] = a.weight > b.weight ? [a, b] : [b, a];
    story.push(`${surname(heavy)} outweighs ${surname(light)} by ${diff} lb.`);
  } else story.push(`There's next to nothing between them on the scales.`);
  const best = (x: 'a' | 'b') => {
    let k: (typeof STAT_KEYS)[number] | null = null, d = 0;
    for (const key of STAT_KEYS) {
      const gap = x === 'a' ? a.stats[key] - b.stats[key] : b.stats[key] - a.stats[key];
      if (gap > d) {
        d = gap;
        k = key;
      }
    }
    return k ? { k, d } : null;
  };
  for (const [x, w, o] of [['a', a, b], ['b', b, a]] as const) {
    const e = best(x);
    story.push(e ? `${surname(w)} is ${EDGE_WORD[e.k]}: ${e.d} more ${STAT_LABEL[e.k].toLowerCase()}.` : `${surname(w)} is outgunned everywhere by ${surname(o)}.`);
  }
  return { a, b, vitals, stats, story };
}

// ---------------------------------------------------------------- the report

export const FINISH_LABEL: Record<string, string> = {
  PINFALL: 'Pinfall', SUBMISSION: 'Submission', COUNT_OUT: 'Count-out', DOUBLE_COUNT_OUT: 'Double count-out',
  DISQUALIFICATION: 'Disqualification', TABLES: 'Through a table', LADDER: 'Ladder retrieval', CAGE_ESCAPE: 'Cage escape',
  TEN_COUNT: 'Ten count', I_QUIT: 'I quit', TIME_DECISION: 'Time limit',
};

export interface Report {
  winner: Wrestler | null;
  loser: Wrestler | null;
  winnerSide: SideKey | null;
  /** "Pinfall, Spear" */
  how: string;
  /** "12:20" */
  time: string;
  /** "(2–1 in falls)" or '' */
  falls: string;
  /** A newspaper headline: "OKORO PINS SOSA". */
  headline: string;
  rating: Rating;
  parts: (Rating['parts'][number] & { grade: string })[];
}

const HEADLINE: Record<string, (w: string, l: string) => string> = {
  PINFALL: (w, l) => `${w} pins ${l}`,
  SUBMISSION: (_w, l) => `${l} taps out`,
  COUNT_OUT: (_w, l) => `${l} counted out`,
  DOUBLE_COUNT_OUT: () => 'Nobody beats the count',
  DISQUALIFICATION: (_w, l) => `${l} disqualified`,
  TABLES: (_w, l) => `${l} goes through a table`,
  LADDER: (w) => `${w} climbs to the top`,
  CAGE_ESCAPE: (w) => `${w} escapes the cage`,
  TEN_COUNT: (_w, l) => `${l} stays down`,
  I_QUIT: (_w, l) => `${l} says "I quit"`,
  TIME_DECISION: (w) => `${w} wins on the clock`,
};

/** A, B, C… from a part's 0–1 score. */
export const grade = (v: number): string => (v >= 0.8 ? 'A' : v >= 0.6 ? 'B' : v >= 0.4 ? 'C' : v >= 0.2 ? 'D' : 'E');

export function report(S: MatchState, rating: Rating): Report | null {
  const R = S.result;
  if (!R) return null;
  const winner = R.winner ? S[R.winner].w : null, loser = R.loser ? S[R.loser].w : null;
  const how = `${FINISH_LABEL[R.finish] ?? 'Decision'}${R.move ? `, ${R.move.name}` : ''}`;
  const headline = winner && loser ? (HEADLINE[R.finish] ?? ((w: string) => `${w} wins`))(surname(winner), surname(loser)) : R.finish === 'DOUBLE_COUNT_OUT' ? 'Nobody beats the count' : 'No contest';
  return {
    winner, loser, winnerSide: R.winner, how, time: fmtClock(R.t),
    falls: R.score && R.winner && R.loser ? `${R.score[R.winner]}–${R.score[R.loser]} in falls` : '',
    headline, rating, parts: rating.parts.map((p) => ({ ...p, grade: grade(p.v) })),
  };
}

/** "3.5" → "★★★½", for print. */
export function starText(x: number): string {
  const full = Math.floor(x), fr = x - full;
  const frac = fr >= 0.74 ? '¾' : fr >= 0.49 ? '½' : fr >= 0.24 ? '¼' : '';
  return '★'.repeat(full) + frac || '0';
}
