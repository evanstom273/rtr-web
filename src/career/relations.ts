// Relationships and promoter memory (career expansion, stage 2).
//
// Wrestlers: an affinity from −100 to +100 with everyone you've dealt with, and sometimes a kind
// (friend, rival, mentor, protégé) that events and matches give it. Promoters: each booker (a
// promotion's, or each indie promoter, by show name) remembers how you've worked for them, and that
// memory sets how much they trust you. Patience is short-term (requests); trust is the long memory.
import { trustWeights } from './bookerLeans';
import { playerHas, relationMult } from './leans';
import { findWrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondOf, bondsOf, freshPeople, moveBond, type Bond, type BondKind, type People } from '../world/people';
import { setCareerHooks } from './career';
import type { Day } from './dates';
import { bookerKey, showBooker } from './patience';
import {
  REL_FEUD, REL_FRIEND_AT, REL_GREAT_MATCH, REL_OFF_SCRIPT_ON, REL_RIVAL_AT, TRUST_BOTCHED, TRUST_FAVOUR, TRUST_GOOD, TRUST_KEPT, TRUST_NO_SHOW,
  TRAIT_BACKSTAGE, TRUST_OFF_SCRIPT, TRUST_SNUB, TRUST_START,
} from './tuning';
import type { Bout, BookerMemory, Career, PlayerMatch, RelKind, Relation, Show } from './types';

// ------------------------------------------------------------------ wrestlers

// Your relationships are the world's bonds with you at one end (world/people.ts), seen from your side.

const people = (): People => (activeWorld().people ??= freshPeople());

/** A bond, as your relationship with the other person: their mentorship of you, or yours of them. */
function asRelation(b: Bond, other: string): Relation {
  const kind: RelKind | undefined = b.kind === 'mentor' ? (b.mentor === other ? 'mentor' : 'protege')
    : b.kind === 'friend' || b.kind === 'best_friend' ? 'friend'
      : b.kind === 'rival' || b.kind === 'enemy' ? 'rival' : undefined;
  return { v: b.v, met: b.met, last: b.last, log: b.log, ...(kind ? { kind } : {}) };
}

export const relationOf = (c: Career, id: string): Relation | undefined => {
  const b = bondOf(people(), c.player, id);
  return b ? asRelation(b, id) : undefined;
};
export const affinity = (c: Career, id: string): number => bondOf(people(), c.player, id)?.v ?? 0;

/** Move how someone feels about you, and say why (the last few reasons are kept). */
export function moveRelation(c: Career, id: string, d: number, why: string, kind?: RelKind): Relation | undefined {
  if (!id || id === c.player || !findWrestler(id)) return undefined;
  const k: BondKind | undefined = kind === 'protege' ? 'mentor' : kind;
  d = Math.round(d * relationMult(c, d));
  const b = moveBond(people(), c.player, id, d, why, c.today, k, kind === 'mentor' ? id : kind === 'protege' ? c.player : undefined);
  return asRelation(b, id);
}

/** How a relationship reads: an explicit kind first, then how strong the feeling is. */
export function relLabel(c: Career, id: string): string {
  const r = relationOf(c, id);
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
  return bondsOf(people(), c.player).filter((x) => !!findWrestler(x.other)).map((x) => ({ id: x.other, r: asRelation(x.bond, x.other) }))
    .sort((a, b) => Math.abs(b.r.v) - Math.abs(a.r.v) || (a.r.last < b.r.last ? 1 : -1));
}

// ------------------------------------------------------------------ promoters

const blank = (): BookerMemory => ({ matches: 0, kept: 0, offScript: 0, botched: 0, noShows: 0, good: 0, favours: 0, snubs: 0 });
export const memoryOf = (c: Career, key: string): BookerMemory => c.bookers?.[bookerKey(key)] ?? blank();

export function remember(c: Career, key: string, field: keyof Omit<BookerMemory, 'last'>, n = 1): void {
  const m = ((c.bookers ??= {})[bookerKey(key)] ??= blank());
  m[field] += n;
  m.last = c.today;
}

/**
 * How much a promoter trusts you, 0–100: 50 to start, built by keeping to their plans, good matches
 * and favours; lost by going off-script, no-shows, failing to deliver and turning them down.
 */
export function trust(c: Career, key: string): number {
  const m = c.bookers?.[bookerKey(key)];
  if (!m) return TRUST_START + (playerHas(c, 'reliable') ? TRAIT_BACKSTAGE.reliable.trustStart : 0);
  // Your personality: Reliable starts a step ahead, Professional's kept plans count more, a Politician's
  // favours count double, and trust in a Mercenary builds more slowly.
  // ...and the booker's: a professional cares most about the plan, a rebellious one least.
  const bw = trustWeights(key);
  const kept = (TRUST_KEPT + (playerHas(c, 'professional') ? TRAIT_BACKSTAGE.professional.keptTrust : 0)) * bw.kept;
  const favour = TRUST_FAVOUR * (playerHas(c, 'politician') ? TRAIT_BACKSTAGE.politician.favourTrust : 1);
  const gains = (m.kept * kept + m.good * TRUST_GOOD + m.favours * favour) * (playerHas(c, 'mercenary') ? TRAIT_BACKSTAGE.mercenary.trustGain : 1) * bw.gains;
  const t = TRUST_START + (playerHas(c, 'reliable') ? TRAIT_BACKSTAGE.reliable.trustStart : 0) + gains
    + m.offScript * TRUST_OFF_SCRIPT * bw.offScript + m.noShows * TRUST_NO_SHOW + m.botched * TRUST_BOTCHED + m.snubs * TRUST_SNUB;
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
