// People behind the curtain, and how everyone feels about everyone. Lives in the world (not the
// career), so a booker's identity, job history and relationships carry on through every job change,
// a career reset and a new career in the same world.
//
// Two things are kept apart on purpose:
// - personal feeling (bonds, here): whether two people like each other, for any pair of people;
// - professional standing (the career's patience and booker memory): whether a booker trusts the
//   player's work. A booker can like you and still not trust you with a title, or the reverse.
import { PROMOTIONS, shippedStaff, type Job, type SpellWhy, type Staffer } from '../data/rtr';
import { BOND_KIND, BOND_LOG, BOND_MARK } from '../career/tuning';
import type { Day } from '../career/dates';
import type { PopRegion } from '../career/types';

/** An indie promotion with a life of its own: where it runs, how often, and who runs it. */
export interface Brand {
  id: string;
  name: string;
  country: string;
  region: PopRegion;
  /** Its home city (most of its shows are there). */
  city?: string;
  /** Runs a show about every this many days, usually on this weekday (0 = Monday). */
  every: number;
  dow: number;
  /** The promoter running it (a staff id). */
  promoter: string | null;
  from: Day;
  closed?: Day;
  /** 0–100 (5–30 for an indie brand): its reach. Moves a little each month (world rev 7). */
  popularity?: number;
}

/** What a relationship has become (worked out from the feelings and history: see kindOf). */
export type BondKind = 'friend' | 'best_friend' | 'rival' | 'enemy';

/** Why a relationship moved: the like it moved by, and whose feelings (a's, b's, or both when missing). */
export interface BondLog { day: Day; t: string; d?: number; by?: 'a' | 'b' }

/**
 * How two people get on (Lyra's redesign): each feels their own way about the other, on two dials, like (as a
 * person) and respect (as a worker), −100 to +100; and they know each other this well (familiarity, 0–100).
 * One record per pair, a and b in id order. Kinds (friend, best friend, rival, enemy) come from the dials and
 * history (kindOf); a mentorship is its own thing, alongside whatever else they are.
 */
export interface Bond {
  a: string;
  b: string;
  /** How a feels about b. */
  la: number;
  ra: number;
  /** How b feels about a. */
  lb: number;
  rb: number;
  /** How well they know each other. */
  f: number;
  /** Rivals since (competing for the same things: a feud, a title, a public challenge). Fades after a year. */
  riv?: Day;
  /** Mentorship: who teaches, and the attribute points passed on so far. */
  mentor?: string;
  given?: number;
  /** When they met (kept where the player's one of the pair; otherwise it's `last`'s business). */
  met?: Day;
  last: Day;
  /** The last few reasons it moved, newest first (kept where the player's one of the pair). */
  log?: BondLog[];
  /** What it last was (for news when that changes). */
  k?: BondKind;
  /** Romance (Lyra's call: full life): a crush (one-sided: `by` has it), dating, partners, living together, engaged, married, or exes. */
  love?: Love;
}

export type LoveStage = 'crush' | 'dating' | 'partner' | 'living' | 'engaged' | 'married' | 'ex';
export interface Love { st: LoveStage; since: Day; by?: string; wedding?: Day }
/** Together (not a crush, not exes). */
export const together = (x: Bond): boolean => !!x.love && x.love.st !== 'crush' && x.love.st !== 'ex';

export type Orientation = 'straight' | 'gay' | 'bi' | 'ace';
export type GoalKind = 'title' | 'top' | 'signed' | 'money' | 'move' | 'stay' | 'even' | 'teach' | 'wind_down';
/** What someone's after right now, since when, and who or where it's about. */
export interface Goal { kind: GoalKind; since: Day; on?: string }

/** Someone's life outside the ring that the world keeps (the rest comes from the world seed: see lives.ts). */
export interface Life {
  /** Home city, once it's not the one the world gave them (they moved). */
  home?: string;
  /** Orientation, once set (you set your own; everyone else's comes from the seed). */
  orient?: Orientation;
  /** Wellbeing, 0–100, and when it was last worked out. */
  mood?: number;
  moodAt?: Day;
  /** The biggest things weighing on it lately, for the profile. */
  why?: string[];
  goal?: Goal;
  /** The last time they got what they were after. */
  met?: Day;
  /** The player's circle (trainer, school mates, family) has been made. */
  circle?: Day;
  /** Things that happened to them, lifting or weighing on wellbeing for a while (a death in the family, a wedding, a break-up). */
  shocks?: { k: string; d: number; until: Day }[];
  /** They've died (rarely: Lyra's call). */
  died?: Day;
}

/** People outside the ring (Lyra's call: outsiders and family): trainers, family, partners from outside the business. */
export interface Folk {
  id: string;
  name: string;
  kind: 'trainer' | 'family' | 'outsider';
  /** What they are to `of`: family (mother, father, sibling, child), or an outsider's partner. */
  rel?: string;
  of?: string;
  gender: import('../data/rtr').Gender;
  country: string;
  city?: string;
  born?: Day;
  /** A trainer's school. */
  school?: string;
  died?: Day;
}

export interface People {
  staff: Record<string, Staffer>;
  brands: Record<string, Brand>;
  bonds: Record<string, Bond>;
  /** Lives outside the ring (wellbeing, goals, a move, your orientation). */
  lives?: Record<string, Life>;
  /** Trainers, family and outsiders. */
  folk?: Record<string, Folk>;
  /** The day the world was given its relationships (lived-in seeding), so it only happens once; and its couples. */
  lived?: Day;
  loves?: Day;
}

/** The people a fresh world starts with: the promotions' bookers as shipped. */
export function freshPeople(): People {
  return { staff: Object.fromEntries(shippedStaff().map((s) => [s.id, s])), brands: {}, bonds: {} };
}

// ------------------------------------------------------------------ bonds

/** The same key whichever way round the pair is given. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const bondOf = (P: People, a: string, b: string): Bond | undefined => P.bonds[pairKey(a, b)];

// Who has a bond with whom, so finding someone's relationships doesn't mean reading every bond in the world.
// Built on first use; kept up to date by everything here that adds or drops a bond (always go through them).
const IDX = new WeakMap<People, { src: Record<string, Bond>; by: Map<string, Set<string>> }>();
function index(P: People): Map<string, Set<string>> {
  const i = IDX.get(P);
  if (i && i.src === P.bonds) return i.by;
  const by = new Map<string, Set<string>>();
  for (const [k, x] of Object.entries(P.bonds)) { addTo(by, x.a, k); addTo(by, x.b, k); }
  IDX.set(P, { src: P.bonds, by });
  return by;
}
const addTo = (by: Map<string, Set<string>>, id: string, k: string) => { let s = by.get(id); if (!s) by.set(id, (s = new Set())); s.add(k); };

const clamp100 = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));

/** The bond between two people, made (as strangers) if there isn't one. */
export function ensureBond(P: People, a: string, b: string, day: Day): Bond {
  const k = pairKey(a, b);
  let x = P.bonds[k];
  if (!x) {
    x = P.bonds[k] = { a: a < b ? a : b, b: a < b ? b : a, la: 0, ra: 0, lb: 0, rb: 0, f: 0, last: day };
    const by = index(P);
    addTo(by, x.a, k); addTo(by, x.b, k);
  }
  return x;
}

/** A bond goes (pruned, or someone's gone from the world). */
export function dropBond(P: People, k: string): void {
  const x = P.bonds[k];
  if (!x) return;
  delete P.bonds[k];
  const by = index(P);
  by.get(x.a)?.delete(k); by.get(x.b)?.delete(k);
}

/** How `from` feels about `to`: like and respect. */
export function likeOf(P: People, from: string, to: string): number { const x = bondOf(P, from, to); return !x ? 0 : x.a === from ? x.la : x.lb; }
export function respectOf(P: People, from: string, to: string): number { const x = bondOf(P, from, to); return !x ? 0 : x.a === from ? x.ra : x.rb; }
/** How well two people know each other. */
export const famOf = (P: People, a: string, b: string): number => bondOf(P, a, b)?.f ?? 0;
/** The two likes: the warmer and the colder of the pair. */
export const mutual = (x: Bond): { lo: number; hi: number } => ({ lo: Math.min(x.la, x.lb), hi: Math.max(x.la, x.lb) });

function note(x: Bond, day: Day, t: string, d: number | undefined, by: 'a' | 'b' | undefined, keep: number): void {
  if (!keep) return;
  x.met ??= day;
  const log = (x.log ??= []);
  log.unshift({ day, t, ...(d ? { d } : {}), ...(by ? { by } : {}) });
  if (log.length > keep) log.length = keep;
}

export interface FeelOpts { keep?: number; fam?: number }

/**
 * Move how `from` feels about `to` (like and respect), and say why. `fam` adds familiarity (they've spent time
 * together); `keep` is how many reasons to keep (five for the player's own, one otherwise).
 */
export function feel(P: People, from: string, to: string, like: number, respect: number, why: string, day: Day, o: FeelOpts = {}): Bond {
  const x = ensureBond(P, from, to, day);
  if (x.a === from) { x.la = clamp100(x.la + like); x.ra = clamp100(x.ra + respect); } else { x.lb = clamp100(x.lb + like); x.rb = clamp100(x.rb + respect); }
  if (o.fam) x.f = Math.max(0, Math.min(100, Math.round(x.f + o.fam)));
  x.last = day;
  if (like || respect) note(x, day, why, like || undefined, x.a === from ? 'a' : 'b', o.keep ?? BOND_LOG.theirs);
  return x;
}

/**
 * Each side's feelings move their own way at once (one reason logged): `dx` is how x's feelings about y move
 * (like, respect), `dy` how y's about x move.
 */
export function feelPair(P: People, x: string, y: string, dx: [number, number], dy: [number, number], why: string, day: Day, o: FeelOpts = {}): Bond {
  const b = ensureBond(P, x, y, day);
  const [xl, xr, yl, yr] = b.a === x ? (['la', 'ra', 'lb', 'rb'] as const) : (['lb', 'rb', 'la', 'ra'] as const);
  b[xl] = clamp100(b[xl] + dx[0]); b[xr] = clamp100(b[xr] + dx[1]);
  b[yl] = clamp100(b[yl] + dy[0]); b[yr] = clamp100(b[yr] + dy[1]);
  if (o.fam) b.f = Math.max(0, Math.min(100, Math.round(b.f + o.fam)));
  b.last = day;
  if (dx[0] || dx[1] || dy[0] || dy[1]) note(b, day, why, dy[0] || dx[0] || undefined, undefined, o.keep ?? BOND_LOG.theirs);
  return b;
}

/** Both feel the same move (a shared moment): like and respect each way, and familiarity. */
export function feelBoth(P: People, a: string, b: string, like: number, respect: number, why: string, day: Day, o: FeelOpts = {}): Bond {
  const x = ensureBond(P, a, b, day);
  x.la = clamp100(x.la + like); x.lb = clamp100(x.lb + like);
  x.ra = clamp100(x.ra + respect); x.rb = clamp100(x.rb + respect);
  if (o.fam) x.f = Math.max(0, Math.min(100, Math.round(x.f + o.fam)));
  x.last = day;
  if (like || respect) note(x, day, why, like || undefined, undefined, o.keep ?? BOND_LOG.theirs);
  return x;
}

/** Explicit kinds an event can set: friends (closer, and they know each other), rivals, a mentorship. */
export type BondMark = 'friend' | 'rival' | 'mentor';

/**
 * Move how two people feel about each other (like, both ways) and say why: the old one-number move, for
 * moments they share. `kind` marks it: friends (both brought up to friendly), rivals, or a mentorship (`mentor`
 * names the teacher).
 */
export function moveBond(P: People, a: string, b: string, d: number, why: string, day: Day, kind?: BondMark, mentor?: string, keep: number = BOND_LOG.theirs): Bond {
  const x = feelBoth(P, a, b, d, 0, why, day, { keep });
  if (kind) mark(x, kind, day, mentor);
  return x;
}

/** Make a bond what an event says it is. */
export function mark(x: Bond, kind: BondMark, day: Day, mentor?: string): void {
  if (kind === 'mentor') { x.mentor = mentor; x.f = Math.max(x.f, BOND_MARK.mentorFam); return; }
  if (kind === 'rival') { x.riv = day; return; }
  x.la = Math.max(x.la, BOND_MARK.friendLike); x.lb = Math.max(x.lb, BOND_MARK.friendLike);
  x.f = Math.max(x.f, BOND_MARK.friendFam);
}

/** What a relationship is now: enemies (one of them can't stand the other), best friends, rivals, friends. */
export function kindOf(x: Bond, day?: Day): BondKind | undefined {
  const m = mutual(x);
  if (m.lo <= BOND_KIND.enemy) return 'enemy';
  if (m.lo >= BOND_KIND.best && x.f >= BOND_KIND.bestFam) return 'best_friend';
  if (x.riv && (!day || daysApart(x.riv, day) <= BOND_KIND.rivalDays)) return 'rival';
  if (m.lo >= BOND_KIND.friend && x.f >= BOND_KIND.friendFam) return 'friend';
  return undefined;
}
const daysApart = (a: Day, b: Day) => Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Everyone `id` has a bond with. */
export function bondsOf(P: People, id: string): { other: string; bond: Bond }[] {
  const out: { other: string; bond: Bond }[] = [];
  for (const k of index(P).get(id) ?? []) {
    const x = P.bonds[k];
    if (x) out.push({ other: x.a === id ? x.b : x.a, bond: x });
  }
  return out;
}

/** A bond from before the two dials: one feeling both ways, and an explicit kind (world rev 10). */
export function fromOldBond(o: { a: string; b: string; v?: number; kind?: string; mentor?: string; given?: number; met: Day; last: Day; log?: { day: Day; d: number; t: string }[] }): Bond {
  const v = o.v ?? 0;
  const x: Bond = { a: o.a, b: o.b, la: v, lb: v, ra: 0, rb: 0, f: Math.min(100, Math.max(20, Math.abs(v))), met: o.met, last: o.last, log: (o.log ?? []).map((l) => ({ day: l.day, t: l.t, ...(l.d ? { d: l.d } : {}) })) };
  if (o.kind === 'mentor' || o.mentor) { x.mentor = o.mentor; x.f = Math.max(x.f, BOND_MARK.mentorFam); x.ra = x.rb = 20; }
  if (o.kind === 'rival' || o.kind === 'enemy') x.riv = o.last;
  if (o.kind === 'friend' || o.kind === 'best_friend') mark(x, 'friend', o.last);
  if (o.given) x.given = o.given;
  return x;
}

// ------------------------------------------------------------------ staff and jobs

export const isStaff = (P: People, id: string): boolean => !!P.staff[id];

/** Whoever books a promotion right now. */
export function bookerOf(P: People, promo: string): Staffer | undefined {
  for (const s of Object.values(P.staff)) if (!s.retired && s.job?.kind === 'booker' && s.job.promo === promo) return s;
  return undefined;
}

/** Whoever runs an indie brand right now. */
export function promoterOf(P: People, brand: string): Staffer | undefined {
  const id = P.brands[brand]?.promoter;
  return id ? P.staff[id] : undefined;
}

const sameJob = (a: Job | null, b: Job | null): boolean =>
  !!a && !!b && a.kind === b.kind && (a.kind === 'booker' ? a.promo === (b as typeof a).promo : a.brand === (b as Extract<Job, { kind: 'promoter' }>).brand);

/** Someone leaves their job: the spell closes, and they're between jobs (or retired). */
export function leaveJob(s: Staffer, day: Day, end: SpellWhy): void {
  const open = s.spells.find((x) => x.to === null);
  if (open) { open.to = day; open.end = end; }
  s.job = null;
  if (end === 'retired') s.retired = day;
}

/** Someone takes a job: any current one ends first; a brand's promoter is updated too. */
export function takeJob(P: People, s: Staffer, job: Job, day: Day, why: SpellWhy): void {
  if (s.job && !sameJob(s.job, job)) leaveJob(s, day, 'quit');
  delete s.retired;
  s.job = job;
  s.spells.push({ job, from: day, to: null, why });
  if (job.kind === 'promoter' && P.brands[job.brand]) P.brands[job.brand]!.promoter = s.id;
}

/** "VWF booker", "Promoter, Northern Grit" — what someone does now. */
export function jobLabel(P: People, s: Staffer): string {
  if (!s.job) return s.retired ? 'Retired' : 'Between jobs';
  return s.job.kind === 'booker' ? `${s.job.promo} booker` : `Promoter, ${P.brands[s.job.brand]?.name ?? 'an indie'}`;
}

/** Promotion initials, for telling a booker key from a person id. */
export const isPromotionKey = (key: string): boolean => PROMOTIONS.some((p) => p.initials === key && !p.indie);
