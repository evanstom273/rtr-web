// Relationships and promoter memory (career expansion, stage 2).
//
// Wrestlers: an affinity from −100 to +100 with everyone you've dealt with, and sometimes a kind
// (friend, rival, mentor, protégé) that events and matches give it. Promoters: each booker (a
// promotion's, or each indie promoter, by show name) remembers how you've worked for them, and that
// memory sets how much they trust you. Patience is short-term (requests); trust is the long memory.
import { findWrestler } from '../data/rtr';
import { setCareerHooks } from './career';
import type { Day } from './dates';
import { showBooker } from './patience';
import {
  REL_FEUD, REL_FRIEND_AT, REL_GREAT_MATCH, REL_OFF_SCRIPT_ON, REL_RIVAL_AT, TRUST_BOTCHED, TRUST_FAVOUR, TRUST_GOOD, TRUST_KEPT, TRUST_NO_SHOW,
  TRUST_OFF_SCRIPT, TRUST_SNUB, TRUST_START,
} from './tuning';
import type { Bout, BookerMemory, Career, PlayerMatch, RelKind, Relation, Show } from './types';

// ------------------------------------------------------------------ wrestlers

export const relationOf = (c: Career, id: string): Relation | undefined => c.relations?.[id];
export const affinity = (c: Career, id: string): number => c.relations?.[id]?.v ?? 0;

/** Move how someone feels about you, and say why (the last few reasons are kept). */
export function moveRelation(c: Career, id: string, d: number, why: string, kind?: RelKind): Relation | undefined {
  if (!id || id === c.player || !findWrestler(id)) return undefined;
  const r = ((c.relations ??= {})[id] ??= { v: 0, met: c.today, last: c.today, log: [] });
  r.v = Math.max(-100, Math.min(100, Math.round(r.v + d)));
  r.last = c.today;
  if (kind) r.kind = kind;
  // A friendship gone sour isn't a friendship; a rivalry made up isn't a rivalry.
  if (r.kind === 'friend' && r.v < 0) delete r.kind;
  if (r.kind === 'rival' && r.v > 0) delete r.kind;
  if (d) {
    r.log.unshift({ day: c.today, d, t: why });
    if (r.log.length > 5) r.log.length = 5;
  }
  return r;
}

/** How a relationship reads: an explicit kind first, then how strong the feeling is. */
export function relLabel(c: Career, id: string): string {
  const r = c.relations?.[id];
  if (!r) return 'Stranger';
  if (r.kind === 'mentor') return 'Mentor';
  if (r.kind === 'protege') return 'Protégé';
  if (r.kind === 'friend' || r.v >= REL_FRIEND_AT) return 'Friend';
  if (r.kind === 'rival' || r.v <= REL_RIVAL_AT) return 'Rival';
  if (r.v >= 15) return 'Trusted colleague';
  if (r.v <= -15) return 'Disliked';
  return 'Colleague';
}

/** People you know, closest (or most hostile) first. */
export function relationsList(c: Career): { id: string; r: Relation }[] {
  return Object.entries(c.relations ?? {}).map(([id, r]) => ({ id, r })).filter((x) => !!findWrestler(x.id))
    .sort((a, b) => Math.abs(b.r.v) - Math.abs(a.r.v) || (a.r.last < b.r.last ? 1 : -1));
}

// ------------------------------------------------------------------ promoters

const blank = (): BookerMemory => ({ matches: 0, kept: 0, offScript: 0, botched: 0, noShows: 0, good: 0, favours: 0, snubs: 0 });
export const memoryOf = (c: Career, key: string): BookerMemory => c.bookers?.[key] ?? blank();

export function remember(c: Career, key: string, field: keyof Omit<BookerMemory, 'last'>, n = 1): void {
  const m = ((c.bookers ??= {})[key] ??= blank());
  m[field] += n;
  m.last = c.today;
}

/**
 * How much a promoter trusts you, 0–100: 50 to start, built by keeping to their plans, good matches
 * and favours; lost by going off-script, no-shows, failing to deliver and turning them down.
 */
export function trust(c: Career, key: string): number {
  const m = c.bookers?.[key];
  if (!m) return TRUST_START;
  const t = TRUST_START + m.kept * TRUST_KEPT + m.good * TRUST_GOOD + m.favours * TRUST_FAVOUR
    + m.offScript * TRUST_OFF_SCRIPT + m.noShows * TRUST_NO_SHOW + m.botched * TRUST_BOTCHED + m.snubs * TRUST_SNUB;
  return Math.max(0, Math.min(100, Math.round(t)));
}

export function trustLabel(t: number): string {
  return t >= 80 ? 'Trusts you completely' : t >= 65 ? 'Trusts you' : t >= 45 ? 'Neutral' : t >= 25 ? 'Wary of you' : 'Doesn’t trust you';
}

/** A one-line summary of what a promoter remembers. */
export function memoryLine(m: BookerMemory): string {
  const bits = [`${m.matches} ${m.matches === 1 ? 'match' : 'matches'}`];
  if (m.kept) bits.push(`kept ${m.kept} ${m.kept === 1 ? 'plan' : 'plans'}`);
  if (m.offScript) bits.push(`off-script ${m.offScript}×`);
  if (m.botched) bits.push(`didn’t deliver ${m.botched}×`);
  if (m.noShows) bits.push(`no-shows ${m.noShows}`);
  if (m.good) bits.push(`${m.good} great ${m.good === 1 ? 'match' : 'matches'}`);
  if (m.favours) bits.push(`${m.favours} ${m.favours === 1 ? 'favour' : 'favours'}`);
  if (m.snubs) bits.push(`turned them down ${m.snubs}×`);
  return bits.join(' · ');
}

// ------------------------------------------------------------------ what a match does to both

function afterMine(c: Career, show: Show, bout: Bout, m: PlayerMatch): void {
  const key = showBooker(show);
  remember(c, key, 'matches');
  if (m.planned === 'kept') remember(c, key, 'kept');
  if (m.planned === 'off-script') remember(c, key, 'offScript');
  if (m.planned === 'botched') remember(c, key, 'botched');
  if (m.stars >= 4) remember(c, key, 'good');
  const opp = m.opp;
  if (m.stars >= 4) moveRelation(c, opp, REL_GREAT_MATCH, `A ${m.stars}★ match on ${show.name}`);
  if (m.planned === 'off-script') moveRelation(c, opp, REL_OFF_SCRIPT_ON, `You went off-script on them at ${show.name}`);
  const feud = bout.feud ? c.feuds.find((f) => f.id === bout.feud) : undefined;
  if (feud) {
    const r = moveRelation(c, opp, REL_FEUD, `Feuding: ${show.name}`);
    if (r && r.v <= REL_RIVAL_AT && !r.kind) r.kind = 'rival';
  }
}

/** A promoter you let down by not turning up. */
export function noShow(c: Career, key: string): void {
  remember(c, key, 'noShows');
}

setCareerHooks({ mine: afterMine });

export type { Day };
