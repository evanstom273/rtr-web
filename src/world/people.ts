// People behind the curtain, and how everyone feels about everyone. Lives in the world (not the
// career), so a booker's identity, job history and relationships carry on through every job change,
// a career reset and a new career in the same world.
//
// Two things are kept apart on purpose:
// - personal feeling (bonds, here): whether two people like each other, for any pair of people;
// - professional standing (the career's patience and booker memory): whether a booker trusts the
//   player's work. A booker can like you and still not trust you with a title, or the reverse.
import { PROMOTIONS, shippedStaff, type Job, type SpellWhy, type Staffer } from '../data/rtr';
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
}

/** What a relationship has become. Mentor is directional: `mentor` names the teacher. */
export type BondKind = 'friend' | 'best_friend' | 'rival' | 'enemy' | 'mentor';

/** How two people feel about each other: −100 (can't stand each other) to +100. One record per pair. */
export interface Bond {
  a: string;
  b: string;
  v: number;
  kind?: BondKind;
  mentor?: string;
  met: Day;
  last: Day;
  log: { day: Day; d: number; t: string }[];
  /** Mentorship: attribute points the mentor has passed on so far. */
  given?: number;
}

export interface People {
  staff: Record<string, Staffer>;
  brands: Record<string, Brand>;
  bonds: Record<string, Bond>;
}

/** The people a fresh world starts with: the promotions' bookers as shipped. */
export function freshPeople(): People {
  return { staff: Object.fromEntries(shippedStaff().map((s) => [s.id, s])), brands: {}, bonds: {} };
}

// ------------------------------------------------------------------ bonds

/** The same key whichever way round the pair is given. */
export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const bondOf = (P: People, a: string, b: string): Bond | undefined => P.bonds[pairKey(a, b)];

/** Move how two people feel about each other, and say why (the last few reasons are kept). */
export function moveBond(P: People, a: string, b: string, d: number, why: string, day: Day, kind?: BondKind, mentor?: string): Bond {
  const k = pairKey(a, b);
  const x = (P.bonds[k] ??= { a: a < b ? a : b, b: a < b ? b : a, v: 0, met: day, last: day, log: [] });
  x.v = Math.max(-100, Math.min(100, Math.round(x.v + d)));
  x.last = day;
  if (kind) { x.kind = kind; if (kind === 'mentor') x.mentor = mentor; else delete x.mentor; }
  // A friendship gone sour isn't a friendship; a rivalry made up isn't a rivalry.
  if ((x.kind === 'friend' || x.kind === 'best_friend') && x.v < 0) delete x.kind;
  if ((x.kind === 'rival' || x.kind === 'enemy') && x.v > 0) delete x.kind;
  if (d) {
    x.log.unshift({ day, d, t: why });
    if (x.log.length > 5) x.log.length = 5;
  }
  return x;
}

/** Everyone `id` has a bond with. */
export function bondsOf(P: People, id: string): { other: string; bond: Bond }[] {
  const out: { other: string; bond: Bond }[] = [];
  for (const x of Object.values(P.bonds)) {
    if (x.a === id) out.push({ other: x.b, bond: x });
    else if (x.b === id) out.push({ other: x.a, bond: x });
  }
  return out;
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
