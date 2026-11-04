// Relationships and promoter memory (career expansion, stage 2; Lyra's relationships redesign).
//
// People: everyone you've dealt with feels their own way about you, on two dials (like you as a person, respect
// your work), and you about them; how well you know each other decides how clearly you can read them. What it's
// become (friend, best friend, rival, enemy) comes from the dials; a mentorship sits alongside. Promoters: each
// booker (a promotion's, or each indie promoter, by show name) remembers how you've worked for them, and that
// memory sets how much they trust you, which is their respect for your work. Patience is short-term (requests).
import { trustWeights } from './bookerLeans';
import { playerHas, relationMult } from './leans';
import { findWrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondOf, bondsOf, feelPair, freshPeople, kindOf, likeOf, mark, type Bond, type People } from '../world/people';
import { setCareerHooks } from './career';
import type { Day } from './dates';
import { bookerKey, showBooker } from './patience';
import {
  BOND_KIND, BOND_LOG, REL_GREAT_MATCH, REL_OFF_SCRIPT_ON, SOCIAL_READ, SOCIAL_TOUCH, TRUST_BOTCHED, TRUST_FAVOUR, TRUST_GOOD, TRUST_KEPT, TRUST_NO_SHOW,
  TRAIT_BACKSTAGE, TRUST_OFF_SCRIPT, TRUST_SNUB, TRUST_START,
} from './tuning';
import type { Bout, BookerMemory, Career, PlayerMatch, RelKind, Relation, Show } from './types';

// ------------------------------------------------------------------ wrestlers

// Your relationships are the world's bonds with you at one end (world/people.ts), seen from your side.

const people = (): People => (activeWorld().people ??= freshPeople());

/** Someone you can have a relationship with: a wrestler, a booker or promoter, or someone outside the ring. */
export const knowable = (id: string): boolean => !!findWrestler(id) || !!people().staff[id] || !!people().folk?.[id];

/** A bond, as your relationship with the other person (a booker's respect is their trust in your work). */
function asRelation(c: Career, b: Bond, other: string): Relation {
  const meA = b.a === c.player;
  const like = meA ? b.lb : b.la;
  const respect = people().staff[other] ? (trust(c, other) - 50) * 2 : meA ? b.rb : b.ra;
  const tie = kindOf(b, c.today);
  const kind: RelKind | undefined = b.mentor ? (b.mentor === other ? 'mentor' : 'protege') : tie;
  return {
    v: like, like, respect, mine: { like: meA ? b.la : b.lb, respect: meA ? b.ra : b.rb }, fam: b.f, met: b.met ?? b.last, last: b.last, log: b.log ?? [],
    ...(kind ? { kind } : {}), ...(tie ? { tie } : {}),
    ...(b.love && b.love.st !== 'crush' ? { love: b.love.st } : {}), ...(b.love?.st === 'crush' && b.love.by === other ? { crush: true } : {}),
  };
}

export const relationOf = (c: Career, id: string): Relation | undefined => {
  const b = bondOf(people(), c.player, id);
  return b ? asRelation(c, b, id) : undefined;
};
/** How someone feels about you (their like). */
export const affinity = (c: Career, id: string): number => likeOf(people(), id, c.player);

/**
 * Move how someone feels about you, and say why (the last few reasons are kept). You've dealt with them, so you
 * know each other a little better, and you take to them a share of how they've taken to you. `kind` marks it:
 * friends, rivals, or a mentorship (theirs of you, or yours of them).
 */
export function moveRelation(c: Career, id: string, d: number, why: string, kind?: RelKind): Relation | undefined {
  if (!id || id === c.player || !knowable(id)) return undefined;
  d = Math.round(d * relationMult(c, d));
  const P = people();
  const b = feelPair(P, id, c.player, [d, 0], [Math.round(d * SOCIAL_TOUCH.reciprocal), 0], why, c.today, { keep: BOND_LOG.mine, fam: SOCIAL_TOUCH.fam });
  if (kind === 'mentor') mark(b, 'mentor', c.today, id);
  else if (kind === 'protege') mark(b, 'mentor', c.today, c.player);
  else if (kind === 'friend' || kind === 'best_friend') mark(b, 'friend', c.today);
  else if (kind === 'rival' || kind === 'enemy') mark(b, 'rival', c.today);
  return asRelation(c, b, id);
}

/**
 * How a relationship reads to you (Lyra's call: clearer the closer). Mentorships and what it's become first; past
 * that, how they feel, if you know them well enough to tell. Someone who can't stand you, but whom you don't know
 * well, can hide it.
 */
export function relLabel(c: Career, id: string): string {
  const r = relationOf(c, id);
  if (!r) return 'Stranger';
  const fam = r.fam ?? 0;
  if (r.love) return LOVE_WORD[r.love] ?? 'Partner';
  if (r.crush && fam >= SOCIAL_READ.clear) return 'Fancies you';
  if (r.kind === 'mentor') return 'Mentor';
  if (r.kind === 'protege') return 'Protégé';
  if (r.kind === 'enemy' && ((r.mine?.like ?? 0) <= BOND_KIND.enemy || fam >= SOCIAL_READ.clear)) return 'Enemy';
  if (r.kind === 'best_friend') return 'Best friend';
  if (r.kind === 'rival') return (r.like ?? 0) >= BOND_KIND.friend && (r.mine?.like ?? 0) >= BOND_KIND.friend ? 'Friendly rival' : 'Rival';
  if (r.kind === 'friend') return 'Friend';
  if (fam < SOCIAL_READ.rough) return 'Acquaintance';
  if (r.v >= 15) return 'Trusted colleague';
  if (r.v <= -15) return 'Disliked';
  return 'Colleague';
}

const LOVE_WORD: Record<string, string> = { dating: 'Dating', partner: 'Partner', living: 'Partner', engaged: 'Engaged', married: 'Married', ex: 'Ex' };

/** How clearly you can read someone: not at all, roughly, or clearly. */
export const readOf = (r: Relation | undefined): 'none' | 'rough' | 'clear' => (!r || (r.fam ?? 0) < SOCIAL_READ.rough ? 'none' : (r.fam ?? 0) < SOCIAL_READ.clear ? 'rough' : 'clear');

/** People you know (wrestlers, and people outside the ring), closest (or most hostile) first. */
export function relationsList(c: Career): { id: string; r: Relation }[] {
  const P = people();
  return bondsOf(P, c.player).filter((x) => !!findWrestler(x.other) || !!P.folk?.[x.other]).map((x) => ({ id: x.other, r: asRelation(c, x.bond, x.other) }))
    .sort((a, b) => (Math.abs(b.r.v) + (b.r.fam ?? 0)) - (Math.abs(a.r.v) + (a.r.fam ?? 0)) || (a.r.last < b.r.last ? 1 : -1));
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
  // A feud makes you rivals; whether it gets personal is down to who you both are (socialLife.ts, Lyra's call).
  if (bout.feud && c.feuds.some((f) => f.id === bout.feud)) { const b = bondOf(people(), c.player, opp); if (b) mark(b, 'rival', c.today); }
}

/** A promoter you let down by not turning up. */
export function noShow(c: Career, key: string): void {
  remember(c, key, 'noShows');
}

setCareerHooks({ mine: afterMine });

export type { Day };
