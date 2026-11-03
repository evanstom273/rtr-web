// A finished match, kept whole for the archive: who, how, the rating, the numbers, the crowd and
// every line of commentary. Also the two download formats: readable text and data (JSON).
import { PART_LABEL } from '../data/commentary';
import { fmtClock, stipulation, topPart, type LogEntry, type MatchState, type RatingPart, type Seg, type SideKey, type SideStats } from '../engine';
import { zipBytes, type ZipFile } from '../storage/zip';
import { FINISH_LABEL, report, starText, surname } from './model';

export interface RecordSide extends SideStats {
  damageDealt: number;
  /** The body part they went after most, and how often. */
  worked: string;
  workedN: number;
  warnings: number;
}

export interface MatchRecord {
  v: 1;
  id: string;
  /** When it finished (epoch ms); 0 for matches carried over from before the archive. */
  at: number;
  /** Carried over from Greatest Hits: a summary only, no log or numbers. */
  legacy?: boolean;
  stars: number;
  label: string;
  verdict: string;
  recap: string;
  you: { id: string; name: string };
  them: { id: string; name: string };
  winner: SideKey | null;
  winnerName: string | null;
  loserName: string | null;
  finish: string;
  /** "Pinfall, Spear" */
  how: string;
  /** Match length, seconds. */
  t: number;
  falls: string;
  stipulation: string;
  venue: string;
  event: string;
  title: string;
  parts: RatingPart[];
  stats: { you: RecordSide; them: RecordSide } | null;
  heat: { avg: number; peak: number; line: number[] };
  log: { t: number; cls: LogEntry['cls']; segs: Seg[] }[];
}

function side(S: MatchState, k: SideKey): RecordSide {
  const w = S[k], top = topPart(w);
  return { ...w.stats, damageDealt: Math.round(w.damageDealt), worked: top.n ? PART_LABEL[top.part] : '', workedN: top.n, warnings: S.ref.warnings[k] };
}

export function buildRecord(S: MatchState, at = Date.now()): MatchRecord | null {
  const R = S.result, r = S.rating;
  if (!R || !r) return null;
  const rep = report(S, r)!;
  const c = S.crowd;
  return {
    v: 1, id: `${at}-${S.id}`, at, stars: r.stars, label: r.label, verdict: r.verdict, recap: r.recap,
    you: { id: S.you.w.id, name: S.you.w.name }, them: { id: S.them.w.id, name: S.them.w.name },
    winner: R.winner, winnerName: rep.winner?.name ?? null, loserName: rep.loser?.name ?? null,
    finish: R.finish, how: rep.how, t: R.t, falls: rep.falls,
    stipulation: stipulation(S.rules.stipulation).name, venue: S.venue, event: S.event, title: S.rules.title ? S.titleName : '',
    parts: r.parts, stats: { you: side(S, 'you'), them: side(S, 'them') },
    heat: { avg: Math.round(c.heatSum / Math.max(1, c.heatN)), peak: Math.round(c.heatPeak), line: [...S.heatLine] },
    log: S.log.map((l) => ({ t: l.t, cls: l.cls, segs: l.segs })),
  };
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');

export interface StatRow {
  label: string;
  a: string;
  b: string;
  /** Who comes out of this one better: 'a', 'b' or neither. */
  edge: 'a' | 'b' | null;
}

/** The side-by-side numbers on the record, in reading order. */
export function statRows(r: MatchRecord): StatRow[] {
  if (!r.stats) return [];
  const a = r.stats.you, b = r.stats.them;
  const steps = Math.max(1, a.controlSteps + b.controlSteps);
  const better = (x: number, y: number, lowerWins = false): StatRow['edge'] => (x === y ? null : (x > y) !== lowerWins ? 'a' : 'b');
  return [
    { label: 'Moves tried', a: `${a.movesTried}`, b: `${b.movesTried}`, edge: null },
    { label: 'Moves landed', a: `${a.movesLanded} · ${pct(a.movesLanded, a.movesTried)}`, b: `${b.movesLanded} · ${pct(b.movesLanded, b.movesTried)}`, edge: better(a.movesLanded / Math.max(1, a.movesTried), b.movesLanded / Math.max(1, b.movesTried)) },
    { label: 'Reversed', a: `${a.reversed}`, b: `${b.reversed}`, edge: better(a.reversed, b.reversed, true) },
    { label: 'Countered', a: `${a.countered}`, b: `${b.countered}`, edge: better(a.countered, b.countered) },
    { label: 'Reads right', a: `${a.readsRight} of ${a.readsTried}`, b: `${b.readsRight} of ${b.readsTried}`, edge: better(a.readsRight, b.readsRight) },
    { label: 'Signatures hit', a: `${a.sigHit} of ${a.sigTried}`, b: `${b.sigHit} of ${b.sigTried}`, edge: better(a.sigHit, b.sigHit) },
    { label: 'Finishers hit', a: `${a.finHit} of ${a.finTried}`, b: `${b.finHit} of ${b.finTried}`, edge: better(a.finHit, b.finHit) },
    { label: 'Kickouts', a: `${a.kickouts}`, b: `${b.kickouts}`, edge: better(a.kickouts, b.kickouts) },
    { label: 'Pin attempts', a: `${a.pinTries}`, b: `${b.pinTries}`, edge: null },
    { label: 'Holds', a: `${a.holds}`, b: `${b.holds}`, edge: null },
    { label: 'In control', a: pct(a.controlSteps, steps), b: pct(b.controlSteps, steps), edge: better(a.controlSteps, b.controlSteps) },
    { label: 'Damage dealt', a: `${a.damageDealt}`, b: `${b.damageDealt}`, edge: better(a.damageDealt, b.damageDealt) },
    { label: 'Worked the', a: a.worked ? `${a.worked} ×${a.workedN}` : '–', b: b.worked ? `${b.worked} ×${b.workedN}` : '–', edge: null },
    { label: 'Warnings', a: `${a.warnings}`, b: `${b.warnings}`, edge: better(a.warnings, b.warnings, true) },
  ];
}

export const segText = (segs: Seg[]): string => segs.map((s) => s.v).join('');

const pad2 = (n: number) => String(n).padStart(2, '0');
export function fmtWhen(at: number, now = Date.now()): string {
  if (!at) return 'Before the archive';
  const d = new Date(at), today = new Date(now);
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear() !== today.getFullYear() ? d.getFullYear() + ' ' : ''}${time}`;
}

/** "Okoro def. Sosa" */
export function recordTitle(r: MatchRecord): string {
  const s = (n: string) => surname({ name: n } as never);
  if (r.winnerName && r.loserName) return `${s(r.winnerName)} def. ${s(r.loserName)}`;
  return `${s(r.you.name)} vs ${s(r.them.name)}`;
}

/** A filename-safe stem: "okoro-def-sosa-2026-11-03-0142". */
export function fileStem(r: MatchRecord): string {
  const d = new Date(r.at || Date.now());
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  const slug = recordTitle(r).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-');
  return `${slug}-${r.at ? date : 'before-archive'}`;
}

/** The human-readable report: what a person reads, and what's easiest to paste. */
export function recordText(r: MatchRecord): string {
  const L: string[] = [];
  const rule = '-'.repeat(60);
  L.push(`${r.you.name} vs ${r.them.name}`);
  L.push(`${r.stipulation} · ${r.event ? r.event + ' · ' : ''}${r.venue}${r.title ? ' · ' + r.title : ''}`);
  L.push(r.at ? new Date(r.at).toLocaleString('en-GB') : 'Before the archive');
  L.push(rule);
  L.push(r.winnerName ? `${r.winnerName} def. ${r.loserName}` : 'No winner');
  L.push(`${r.how}${r.falls ? ` (${r.falls})` : ''}${r.t ? `, ${fmtClock(r.t)}` : ''}`);
  L.push(`${r.stars} stars ${starText(r.stars)}${r.label ? ` · ${r.label}` : ''}`);
  if (r.verdict) L.push(r.verdict);
  if (r.parts.length) {
    L.push('', 'THE RATING');
    for (const p of r.parts) L.push(`  ${p.l.padEnd(8)} ${Math.round(p.v * 100).toString().padStart(3)}%  ${p.n}`);
  }
  const rows = statRows(r);
  if (rows.length) {
    const w = Math.max(...rows.map((x) => x.a.length), r.you.name.length, 6);
    L.push('', 'BY THE NUMBERS', `  ${''.padEnd(16)} ${r.you.name.padEnd(w)}   ${r.them.name}`);
    for (const x of rows) L.push(`  ${x.label.padEnd(16)} ${x.a.padEnd(w)}   ${x.b}`);
  }
  if (r.heat.line.length) L.push('', `THE CROWD  average ${r.heat.avg}, peak ${r.heat.peak}`, `  ${r.heat.line.join(' ')}`);
  if (r.recap) L.push('', 'RECAP', r.recap);
  if (r.log.length) {
    L.push('', rule, `THE COMMENTARY (${r.log.length} lines)`, rule);
    for (const l of r.log) L.push(`${fmtClock(l.t).padStart(6)}  ${segText(l.segs)}`);
  }
  return L.join('\n') + '\n';
}

/** One zip: a readable .txt and a .json per match. */
export function recordsZip(records: MatchRecord[]): Uint8Array {
  const used = new Set<string>();
  const files: ZipFile[] = [];
  for (const r of records) {
    let stem = fileStem(r);
    for (let i = 2; used.has(stem); i++) stem = `${fileStem(r)}-${i}`;
    used.add(stem);
    files.push({ name: `${stem}.txt`, data: recordText(r) }, { name: `${stem}.json`, data: JSON.stringify(r, null, 1) });
  }
  return zipBytes(files);
}

export { FINISH_LABEL };
