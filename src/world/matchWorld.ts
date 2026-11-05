// The world the match overhaul needs (stage 8, behind FEATURES.matches): real tag teams and trios (named,
// with records and chemistry, formed from friends and broken up), a tag title for every major, a trios title
// for SLN and a hardcore title where it fits; masks (a real thing: lose one and it's gone) and how everyone
// feels about hardcore matches; and the lasting damage a match leaves. Set up once per world.
import type { Title, Wrestler } from '../data/rtr';
import type { BodyPart } from '../data/rtr/types';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import type { Day } from '../career/dates';
import type { Person } from '../career/types';
import { likeOf, respectOf } from './people';
import type { World } from './world';

export const MATCH_WORLD = 1;

export interface Team {
  id: string;
  name: string;
  members: string[];
  promo: string;
  since: Day;
  wins: number;
  losses: number;
  /** 0–100: how well they work together (their bonds, then their matches together). */
  chemistry: number;
  /** Established teams' finisher. */
  finisher?: string;
  /** Broken up (and why). */
  split?: Day;
  splitWhy?: 'betrayal' | 'drift' | 'moved';
  trios?: boolean;
}

/** Money in the Bank: a title shot whenever they like, for a year. */
export interface Briefcase { holder: string; promo: string; from: Day; until: Day; cashed?: Day }

/** Lucha promotions: most of the roster wears a mask. */
const LUCHA: ReadonlySet<string> = new Set(['SLN']);
const PART_LUCHA: ReadonlySet<string> = new Set(['SSWC']);
/** Hardcore promotions (Lyra's call): their own title, and a roster that'll do it. */
export const HARDCORE_PROMOS: ReadonlySet<string> = new Set(['END', 'IVW']);
/** Trios: SLN. */
export const TRIOS_PROMOS: ReadonlySet<string> = new Set(['SLN']);

const ADJ = ['Iron', 'Midnight', 'Rapid', 'Savage', 'Golden', 'Crimson', 'Storm', 'Silver', 'Wild', 'Black', 'Northern', 'Lost', 'Royal', 'Rebel', 'Neon', 'Broken', 'Night', 'High', 'Wolf', 'Steel'];
const NOUN = ['Saints', 'Riders', 'Express', 'Kings', 'Order', 'Syndicate', 'Brothers', 'Hounds', 'Society', 'Crew', 'Outlaws', 'Dynasty', 'Union', 'Machine', 'Collective', 'Regime', 'Breed', 'Faction', 'Alliance', 'Movement'];
const FIN_A = ['Total', 'Last', 'Final', 'Double', 'Twin', 'Dead', 'High', 'Hard', 'Black', 'Grand'];
const FIN_B = ['Eclipse', 'Rites', 'Impact', 'Thunder', 'Drop', 'Fall', 'Verdict', 'Sentence', 'Crash', 'Doctrine'];

const surname = (w: Wrestler) => w.name.split(' ').slice(-1)[0]!;
const pick = <T,>(rnd: Rng, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const fanTotal = (w: Wrestler) => Object.values(w.fans).reduce((a, b) => a + b, 0);

export function teamName(rnd: Rng, members: Wrestler[]): string {
  if (rnd() < 0.3) return members.map(surname).join(' & ');
  return `The ${pick(rnd, ADJ)} ${pick(rnd, NOUN)}`;
}
export const finisherName = (rnd: Rng): string => `${pick(rnd, FIN_A)} ${pick(rnd, FIN_B)}`;

/* ---------- masks and willingness ---------- */

/**
 * Who wears a mask: most of a lucha roster, some of a part-lucha one, and anyone whose gimmick says so;
 * hardly anyone else. How they feel about hardcore matches: the hardcore promotions and hardcore wrestlers
 * love them, the careful and the older won't.
 */
export function seedMasks(wrestlers: Wrestler[], seed: number): void {
  for (const w of wrestlers) {
    if (w.masked !== undefined && w.hardcore !== undefined) continue;
    const rnd = seededRng(hashSeed(seed, 'mask', w.id));
    const text = `${w.gimmick} ${w.gimmickDescription}`.toLowerCase();
    const says = /\bmask(ed)?\b|enmascarad|luchador/.test(text) && !/unmask/.test(text);
    if (w.masked === undefined) w.masked = says || (LUCHA.has(w.promotion) ? rnd() < 0.7 : PART_LUCHA.has(w.promotion) ? rnd() < 0.25 : rnd() < 0.02);
    if (w.hardcore === undefined) {
      let p = 0;
      if (w.classes.includes('HARDCORE')) p += 0.5;
      if (HARDCORE_PROMOS.has(w.promotion)) p += 0.25;
      if (w.traits?.includes('aggressive') || w.traits?.includes('risk_taker')) p += 0.1;
      let no = 0.08 + (w.age >= 40 ? 0.12 : 0) + (w.traits?.includes('defensive') || w.traits?.includes('professional') ? 0.08 : 0) - (HARDCORE_PROMOS.has(w.promotion) ? 0.06 : 0);
      no = Math.max(0.02, no);
      const r = rnd();
      w.hardcore = r < p ? 1 : r > 1 - no ? -1 : 0;
    }
  }
}

/** Lost their mask: it's gone for good, and the mystique with it (a few go on to bigger things). */
export function unmask(w: Wrestler, day: Day, rnd: Rng): 'drop' | 'rise' {
  w.masked = false;
  w.unmasked = day;
  const rise = rnd() < 0.15;
  const f = rise ? 1.12 : 0.8;
  for (const k of Object.keys(w.fans) as (keyof Wrestler['fans'])[]) w.fans[k] = Math.round(w.fans[k] * f);
  return rise ? 'rise' : 'drop';
}

export function shave(w: Wrestler, day: Day): void {
  w.shaved = day;
  // A shaved babyface gets the sympathy; a shaved heel gets laughed at.
  const f = w.disposition === 'FACE' ? 1.04 : 0.95;
  for (const k of Object.keys(w.fans) as (keyof Wrestler['fans'])[]) w.fans[k] = Math.round(w.fans[k] * f);
}

/** Won't do it (−1), will (0), or loves it (1). */
export const willing = (w: Wrestler): -1 | 0 | 1 => w.hardcore ?? 0;

/* ---------- teams ---------- */

export const activeTeams = (w: World): Team[] => Object.values(w.teams ?? {}).filter((t) => !t.split);
/** The team someone's in right now. */
export const teamOf = (w: World, id: string): Team | undefined => activeTeams(w).find((t) => t.members.includes(id));
export const teamsIn = (w: World, promo: string): Team[] => activeTeams(w).filter((t) => t.promo === promo);

/** How well they'd work together: how they feel about each other, before any matches. */
export function bondChemistry(w: World, members: string[]): number {
  const P = w.people;
  if (!P) return 40;
  let sum = 0, n = 0;
  for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
    const a = members[i]!, b = members[j]!;
    sum += (likeOf(P, a, b) + likeOf(P, b, a) + respectOf(P, a, b) + respectOf(P, b, a)) / 4;
    n++;
  }
  return Math.max(10, Math.min(90, Math.round(40 + (n ? sum / n : 0) / 2)));
}

export function formTeam(w: World, members: Wrestler[], promo: string, day: Day, rnd: Rng): Team {
  const id = `team_${members.map((m) => m.id).sort().join('_')}_${day}`;
  const chemistry = bondChemistry(w, members.map((m) => m.id));
  const t: Team = {
    id, name: teamName(rnd, members), members: members.map((m) => m.id), promo, since: day, wins: 0, losses: 0, chemistry,
    ...(chemistry >= 55 ? { finisher: finisherName(rnd) } : {}), ...(members.length >= 3 ? { trios: true } : {}),
  };
  (w.teams ??= {})[id] = t;
  return t;
}

export function splitTeam(w: World, t: Team, day: Day, why: Team['splitWhy']): void {
  t.split = day;
  t.splitWhy = why;
  // A team title goes with them.
  for (const title of w.db.titles) if (title.team === t.id) { title.holder = null; title.holders = []; delete title.team; }
}

/** After a match together: the record, and chemistry grows (or sours after a loss). */
export function recordTeamMatch(w: World, members: string[], won: boolean): void {
  const t = activeTeams(w).find((x) => members.every((m) => x.members.includes(m)));
  if (!t) return;
  if (won) t.wins++;
  else t.losses++;
  t.chemistry = Math.max(5, Math.min(100, t.chemistry + (won ? 2 : -1)));
  if (!t.finisher && t.chemistry >= 60) t.finisher = finisherName(seededRng(hashSeed(w.seed, 'fin', t.id)));
}

/** A promotion's roster, still wrestling. */
function rosterOf(w: World, promo: string, out: (id: string) => boolean): Wrestler[] {
  return w.db.wrestlers.filter((x) => x.promotion === promo && !out(x.id));
}

/**
 * Teams for a roster: friends first (both like each other), then whoever's left of the same gender and
 * side, until there's a tag division (four men's teams, two women's; SLN also has two trios).
 */
export function seedTeams(w: World, promo: string, day: Day, out: (id: string) => boolean, player?: string): Team[] {
  const rnd = seededRng(hashSeed(w.seed, 'teams', promo));
  const roster = rosterOf(w, promo, out).filter((x) => x.id !== player && !teamOf(w, x.id));
  const made: Team[] = [];
  const P = w.people;
  for (const [gender, want] of [['MALE', 4], ['FEMALE', 2]] as const) {
    const pool = roster.filter((x) => x.gender === gender && !teamOf(w, x.id));
    // Friends first.
    const pairs: [Wrestler, Wrestler, number][] = [];
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i]!, b = pool[j]!;
      const like = P ? Math.min(likeOf(P, a.id, b.id), likeOf(P, b.id, a.id)) : 0;
      if (like >= 25) pairs.push([a, b, like]);
    }
    pairs.sort((x, y) => y[2] - x[2]);
    const used = new Set<string>();
    let n = teamsIn(w, promo).filter((t) => !t.trios && w.db.wrestlers.find((x) => x.id === t.members[0])?.gender === gender).length;
    for (const [a, b] of pairs) {
      if (n >= want) break;
      if (used.has(a.id) || used.has(b.id)) continue;
      used.add(a.id); used.add(b.id);
      made.push(formTeam(w, [a, b], promo, day, rnd)); n++;
    }
    // Then whoever's left, same side of the fence, the lesser lights first (the stars are busy).
    const rest = pool.filter((x) => !used.has(x.id)).sort((x, y) => fanTotal(x) - fanTotal(y));
    while (n < want && rest.length >= 2) {
      const a = rest.shift()!;
      const k = rest.findIndex((x) => x.disposition === a.disposition);
      const b = rest.splice(k >= 0 ? k : 0, 1)[0]!;
      made.push(formTeam(w, [a, b], promo, day, rnd)); n++;
    }
  }
  if (TRIOS_PROMOS.has(promo)) {
    const left = roster.filter((x) => x.gender === 'MALE' && !teamOf(w, x.id)).sort((x, y) => (y.masked ? 1 : 0) - (x.masked ? 1 : 0));
    for (let i = 0; i + 2 < left.length && made.filter((t) => t.trios).length < 2; i += 3) made.push(formTeam(w, left.slice(i, i + 3), promo, day, rnd));
  }
  return made;
}

/* ---------- titles ---------- */

const titleId = (promo: string, kind: 'tag' | 'trios' | 'hardcore') => `${promo}_${kind === 'tag' ? 'TAG_TEAM_CHAMPIONSHIP' : kind === 'trios' ? 'TRIOS_CHAMPIONSHIP' : 'HARDCORE_CHAMPIONSHIP'}`;
const titleName = (promo: string, kind: 'tag' | 'trios' | 'hardcore') =>
  kind === 'tag' ? `${promo} Tag Team Championship` : kind === 'trios' ? `${promo} Campeonato de Tríos` : `${promo} Hardcore Championship`;

/** Put a team (or a wrestler) on a title, with the history to go with it. */
export function crown(w: World, t: Title, day: Day, by: { team?: Team; who?: string }): void {
  const open = w.history.reigns[t.id]?.find((r) => r.to === null);
  if (open) open.to = day;
  if (by.team) {
    t.team = by.team.id;
    t.holders = [...by.team.members];
    t.holder = by.team.members[0] ?? null;
  } else {
    t.holder = by.who ?? null;
    delete t.holders;
    delete t.team;
  }
  t.weeksHeld = 0;
  if (!t.holder) return;
  const name = by.team ? by.team.name : w.db.wrestlers.find((x) => x.id === t.holder)?.name ?? t.holder;
  (w.history.reigns[t.id] ??= []).push({ holder: t.holder, name, from: day, to: null, defences: 0 });
  if (w.career) w.career.titles[t.id] = { since: day, defences: 0, last: null };
}

/** A tag title for every major, trios for SLN, a hardcore title for the hardcore promotions; crowned from the best. */
export function addMatchTitles(w: World, day: Day, out: (id: string) => boolean): Title[] {
  const made: Title[] = [];
  for (const p of w.db.promotions) {
    if (p.indie) continue;
    const kinds: ('tag' | 'trios' | 'hardcore')[] = ['tag', ...(TRIOS_PROMOS.has(p.initials) ? ['trios' as const] : []), ...(HARDCORE_PROMOS.has(p.initials) ? ['hardcore' as const] : [])];
    for (const kind of kinds) {
      const id = titleId(p.initials, kind);
      if (w.db.titles.some((t) => t.id === id)) continue;
      const t: Title = { id, name: titleName(p.initials, kind), promotionId: p.id, gender: 'MALE', holder: null, weeksHeld: 0, kind };
      w.db.titles.push(t);
      if (!p.titles.includes(id)) p.titles.push(id);
      made.push(t);
      if (kind === 'hardcore') {
        const best = rosterOf(w, p.initials, out).filter((x) => x.gender === 'MALE' && willing(x) >= 0 && !w.db.titles.some((o) => o.holder === x.id || o.holders?.includes(x.id)))
          .sort((a, b) => (willing(b) - willing(a)) * 1e9 + fanTotal(b) - fanTotal(a))[0];
        if (best) crown(w, t, day, { who: best.id });
      } else {
        const teams = teamsIn(w, p.initials).filter((x) => (kind === 'trios') === !!x.trios && w.db.wrestlers.find((y) => y.id === x.members[0])?.gender === 'MALE');
        const best = teams.sort((a, b) => sumFans(w, b) - sumFans(w, a))[0];
        if (best) crown(w, t, day, { team: best });
      }
    }
  }
  return made;
}
const sumFans = (w: World, t: Team) => t.members.reduce((s, id) => s + fanTotal(w.db.wrestlers.find((x) => x.id === id)!), 0);

/* ---------- once a month: teams come and go ---------- */

/**
 * The AI forms new teams from friends who aren't in one, and breaks up teams that have gone stale (poor
 * chemistry, or one of them outgrowing the other) — heels sometimes with a betrayal. Returns news lines.
 */
export function monthlyTeams(w: World, day: Day, out: (id: string) => boolean, player?: string): string[] {
  const rnd = seededRng(hashSeed(w.seed, 'teams-month', day));
  const news: string[] = [];
  for (const t of activeTeams(w)) {
    const ms = t.members.map((id) => w.db.wrestlers.find((x) => x.id === id)!);
    if (ms.some((m) => !m || out(m.id) || m.promotion !== t.promo)) {
      splitTeam(w, t, day, 'moved');
      news.push(`${t.name} are no more: they're not on the same roster any longer.`);
      continue;
    }
    if (t.members.includes(player ?? '')) continue;
    const gap = Math.max(...ms.map(fanTotal)) / Math.max(1, Math.min(...ms.map(fanTotal)));
    const p = (t.chemistry < 30 ? 0.12 : 0.02) + (gap > 3 ? 0.06 : 0);
    if (rnd() < p) {
      const heel = ms.find((m) => m.disposition === 'HEEL');
      const betrayal = !!heel && rnd() < 0.6;
      splitTeam(w, t, day, betrayal ? 'betrayal' : 'drift');
      news.push(betrayal ? `${heel!.name} turns on ${ms.find((m) => m !== heel)!.name}: ${t.name} are finished.` : `${t.name} go their separate ways.`);
    }
  }
  for (const p of w.db.promotions) {
    if (p.indie || rnd() > 0.35) continue;
    const made = seedTeams(w, p.initials, day, out, player).slice(0, 1);
    for (const t of made) news.push(`New in ${p.initials}: ${t.name} (${t.members.map((id) => w.db.wrestlers.find((x) => x.id === id)!.name).join(' and ')}).`);
  }
  return news;
}

/* ---------- lasting damage ---------- */

/** How violent a match was for the body: 1 normal, more for the hardcore and the deathmatches. */
export function violenceOf(stip: string | undefined): number {
  if (!stip) return 1;
  if (stip === 'deathmatch' || stip === 'hell_in_a_cell' || stip === 'scaffold') return 2;
  if (['no_dq', 'street_fight', 'no_holds_barred', 'texas_death', 'first_blood', 'falls_count_anywhere', 'tables', 'ladder', 'tlc', 'steel_cage', 'last_man_standing', 'i_quit', 'elimination_chamber', 'wargames', 'money_in_the_bank', 'ultimate_x', 'casket', 'ambulance', 'stretcher', 'strap', 'dog_collar', 'bull_rope'].includes(stip)) return 1.5;
  return 1;
}

/** A match leaves its mark on the parts that took it, and the violent ones leave scars. */
export function addWear(p: Person, hp: Partial<Record<BodyPart, number>>, violence: number, scar?: string): void {
  const wear = (p.wear ??= {});
  for (const [part, v] of Object.entries(hp) as [BodyPart, number][]) {
    const took = Math.max(0, 100 - v);
    wear[part] = Math.min(60, Math.round(((wear[part] ?? 0) + took * 0.12 * violence) * 10) / 10);
  }
  if (scar && violence >= 2) {
    (p.scars ??= []).push(scar);
    if (p.scars.length > 12) p.scars.shift();
  }
}

/** Wear fades about 8% a week. */
export function fadeWear(p: Person, days: number): void {
  if (!p.wear) return;
  const f = Math.pow(0.92, days / 7);
  for (const k of Object.keys(p.wear) as BodyPart[]) {
    const v = (p.wear[k] ?? 0) * f;
    if (v < 0.5) delete p.wear[k];
    else p.wear[k] = Math.round(v * 10) / 10;
  }
}

/** How much more likely an injury is, from the wear (up to about +40%). */
export const wearInjury = (p: Person | undefined): number => 1 + Object.values(p?.wear ?? {}).reduce((a, b) => a + (b ?? 0), 0) / 400;

/** Body-part health to start a match on: the wear, half of it. */
export function wearStart(p: Person | undefined): Partial<Record<BodyPart, number>> | undefined {
  if (!p?.wear) return undefined;
  const out: Partial<Record<BodyPart, number>> = {};
  for (const [k, v] of Object.entries(p.wear) as [BodyPart, number][]) out[k] = Math.max(40, 100 - v * 0.5);
  return out;
}

/* ---------- briefcases ---------- */

export const briefcaseOf = (w: World, id: string): Briefcase | undefined => (w.briefcases ?? []).find((b) => b.holder === id && !b.cashed);

export function giveBriefcase(w: World, holder: string, promo: string, day: Day, until: Day): Briefcase {
  const b: Briefcase = { holder, promo, from: day, until };
  (w.briefcases ??= []).push(b);
  return b;
}

/* ---------- setting it all up ---------- */

/** Once per world, with the flag on: masks and willingness, the teams, and the new titles. */
export function ensureMatchWorld(w: World): void {
  if ((w.matchWorld ?? 0) >= MATCH_WORLD) return;
  const out = (id: string) => !!w.career?.people[id]?.retired;
  const day = w.career?.today ?? w.day ?? ('2025-01-01' as Day);
  seedMasks(w.db.wrestlers, w.seed);
  w.teams ??= {};
  for (const p of w.db.promotions) if (!p.indie) seedTeams(w, p.initials, day, out, w.career?.player);
  addMatchTitles(w, day, out);
  w.matchWorld = MATCH_WORLD;
}
