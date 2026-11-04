// The world: the one save shared by exhibition and career (Wrestling Empire style). It holds the live
// database plus, once a career is running, everything the career tracks. Kept in IndexedDB; if that's
// unavailable the world lives in memory for the session.
import { PROMOTIONS, TITLES, WRESTLERS, applyDatabase, databaseChanged, fansFromPopularity, rollCount, rollTraits, shippedDatabase, shippedWrestler, type Database, type Wrestler } from '../data/rtr';
import { BUDGET, floorFor } from '../career/clauses';
import { freshContracts } from '../career/deals';
import { BRAND_POP_BOUNDS } from '../career/tuning';
import { hashSeed, seededRng } from '../engine/rng';
import { tx } from '../storage/db';
import type { Career } from '../career/types';
import { weekStart, type Day } from '../career/dates';
import { emptyHistory, type WorldHistory } from './history';
import { bookerOf, freshPeople, fromOldBond, pairKey, type People } from './people';
import { ensureCircle, seedWorld } from './social';
import { crownIndies, growIndies, populateIndies } from './populate';

/** The world save's revision: each step in `upgrade` runs once, in order, on older saves. */
export const WORLD_REV = 10;

export interface World {
  v: 1;
  /** Which upgrade steps this save has had (missing: 1, from before revisions). */
  rev?: number;
  /** Seeds everything the world rolls, so a day plays out the same if it's replayed. */
  seed: number;
  createdAt: number;
  db: Database;
  /** The career in this world; null when there isn't one. */
  career: Career | null;
  /** Every show, title reign and roster move since the world started. Survives a career reset. */
  history: WorldHistory;
  /** The next day this world has to play (a new career in a kept world starts here). */
  day: Day | null;
  /** Show numbering and irregular schedules, kept when a career ends so the next one carries on. */
  calendar?: { counters: Record<string, number>; nextIrregular: Record<string, Day> };
  /** Bookers, indie brands and promoters, and everyone's relationships (rev 3). */
  people?: People;
  /** The indie scene's been generated (or topped up, for a world played before it existed). */
  indies?: { generated: number; brands: number };
  /** A history being simulated before a career (Lyra's call): the world with nobody playing, and how far it's got. */
  sim?: { career: import('../career/types').Career; start: Day; end: Day; years: number; reached: number; totals?: Record<string, number>; prev?: Record<string, number> };
}

const KEY = 'current';
let active: World | null = null;
let persistent = true;

export function freshWorld(seed = Math.floor(Math.random() * 2 ** 31)): World {
  return { v: 1, rev: WORLD_REV, seed, createdAt: Date.now(), db: shippedDatabase(), career: null, history: emptyHistory(), day: null, people: freshPeople() };
}

/** Make `w` the active world. Its database becomes the live one everything reads. */
export function setWorld(w: World): World {
  const rev = w.rev ?? 1;
  upgrade(w);
  applyDatabase(w.db);
  // From here on the world's database *is* the live arrays, so changes made through either are saved.
  w.db = { wrestlers: WRESTLERS, promotions: PROMOTIONS, titles: TITLES };
  active = w;
  // Rev 9 (Lyra's call): the 25-clause contracts. Everyone's rewritten under them (it reads the live rosters, so it runs here).
  if (rev < 9) for (const c of [w.career, w.sim?.career]) if (c) freshContracts(c);
  return w;
}

/** Saves from before world history: start it, and move any title reigns the career kept. */
function upgrade(w: World): void {
  if (!w.history) {
    w.history = emptyHistory();
    const old = w.career?.titles as Record<string, { reigns?: { holder: string; from: Day; to: Day | null; defences: number }[] }> | undefined;
    for (const [id, t] of Object.entries(old ?? {})) {
      if (t.reigns?.length) w.history.reigns[id] = t.reigns.map((r) => ({ ...r, name: w.db.wrestlers.find((x) => x.id === r.holder)?.name ?? r.holder }));
      delete t.reigns;
    }
  }
  if (w.day === undefined) w.day = w.career?.today ?? null;
  const rev = w.rev ?? 1;
  // Rev 7 first: everything after reads fans (traits, crowning, the indie top-up).
  if (rev < 7) toFans(w);
  if (rev < 2) giveTraits(w);
  if (rev < 3) meetThePeople(w);
  w.people ??= freshPeople();
  w.rev = WORLD_REV;
  ensurePopulation(w);
  if (rev < 4) addRegionalTitles(w);
  // Rev 5: promises know who made them (the promotion's booker now) and have a status.
  if (rev < 5 && w.career) for (const p of w.career.pledges ?? []) {
    p.status ??= 'open';
    if (!p.by && p.promo !== 'TIS') p.by = bookerOf(w.people!, p.promo)?.id;
  }
  // Rev 8: the new pay floor (Lyra's call): contracts and open offers below it come up to it.
  if (rev < 8) raiseToFloor(w);
  // Rev 6: the indie scene is a straight 200 (Lyra's call), so an older one grows to it.
  if (rev < 6 && w.indies) w.indies.generated += growIndies({ seed: w.seed, wrestlers: w.db.wrestlers, people: w.people, retired: (id) => !!w.career?.people[id]?.retired });
  // Rev 10 (Lyra's relationships redesign): two dials each way. Older bonds convert, and a world with a career in it
  // is brought to life around what's already there (Lyra's call), the player given their circle.
  if (rev < 10) toTwoWay(w);
}

/** Rev 10: every bond becomes two-way (like and respect each way, and familiarity); a played world is given its relationships. */
export function toTwoWay(w: World): void {
  const P = w.people!;
  for (const [k, b] of Object.entries(P.bonds)) if ('v' in (b as object)) P.bonds[k] = fromOldBond(b as unknown as Parameters<typeof fromOldBond>[0]);
  for (const c of [w.career, w.sim?.career]) {
    if (!c) continue;
    const out = (id: string) => id.startsWith('__') || !!c.people[id]?.retired;
    seedWorld({ seed: w.seed, day: c.today, wrestlers: w.db.wrestlers, people: P, out });
    const me = w.db.wrestlers.find((x) => x.id === c.player);
    if (me && !c.spectator) ensureCircle({ seed: w.seed, day: c.today, player: me, wrestlers: w.db.wrestlers, people: P, out });
  }
}

/**
 * Rev 7 (Lyra's call): popularity becomes fans. Every wrestler's six regional scores convert exactly
 * (150 × 10^(score ÷ 20)), so regional order and every formula built on the old scale stay as they
 * were; worldwide is the sum. Promotions get their 0–100 popularity (10 + 70 × their old budget) and
 * indie brands theirs (5–30, the same for this world every time).
 */
export function toFans(w: World): void {
  for (const x of w.db.wrestlers) {
    if (!x.fans && x.popularity) x.fans = fansFromPopularity(x.popularity);
    delete x.popularity;
  }
  for (const p of w.db.promotions) p.popularity ??= Math.round((10 + 70 * (BUDGET[p.initials] ?? 0.5)) * 10) / 10;
  for (const b of Object.values(w.people?.brands ?? {})) {
    const [lo, hi] = BRAND_POP_BOUNDS;
    b.popularity ??= lo + (Math.abs(hashSeed(w.seed, 'brand-pop', b.id)) % (hi - lo + 1));
  }
}

/**
 * Rev 8 (Lyra's call: about £2,500 a match at the bottom): contracts and open offers below their
 * promotion's new floor come up to it. Nothing else about them changes; higher ones are untouched.
 */
export function raiseToFloor(w: World): void {
  const c = w.career;
  if (!c) return;
  const floor = (promo: string) => {
    const p = w.db.promotions.find((x) => x.initials === promo);
    return !p || p.indie ? 0 : floorFor(p.popularity);
  };
  for (const p of Object.values(c.people)) {
    for (const k of [p.contract, p.next]) if (k) k.fee = Math.max(k.fee, floor(k.promo));
  }
  for (const o of c.offers ?? []) if (o.status === 'open') o.fee = Math.max(o.fee, floor(o.promo));
}

/**
 * Rev 4: the twelve regional indie titles join an older world. Each goes to the best indie in its
 * region straight away (Lyra's call: crowned at the start), with a reign from the world's day.
 */
export function addRegionalTitles(w: World): void {
  const shipped = shippedDatabase();
  const tis = w.db.promotions.find((p) => p.indie);
  const added: string[] = [];
  for (const t of shipped.titles) {
    if (!t.region || w.db.titles.some((x) => x.id === t.id)) continue;
    w.db.titles.push({ ...t, holder: null });
    if (tis && !tis.titles.includes(t.id)) tis.titles.push(t.id);
    added.push(t.id);
  }
  const retired = (id: string) => !!w.career?.people[id]?.retired;
  const day = w.career?.today ?? w.day;
  for (const [id, who] of crownIndies(w.db.titles, added, w.db.wrestlers.filter((x) => !retired(x.id)))) {
    if (!day) continue;
    const name = w.db.wrestlers.find((x) => x.id === who)?.name ?? who;
    (w.history.reigns[id] ??= []).push({ holder: who, name, from: day, to: null, defences: 0 });
    if (w.career) w.career.titles[id] = { since: day, defences: 0, last: null };
  }
}

/**
 * The indie scene (Lyra's call): a fresh world generates 200 indies, their brands and promoters,
 * and crowns its indie champions; a world played before the scene existed is topped up to 200. Once per world.
 */
export function ensurePopulation(w: World): void {
  if (w.indies) return;
  const tis = w.db.promotions.find((p) => p.indie);
  const r = populateIndies({
    seed: w.seed, played: worldPlayed(w), wrestlers: w.db.wrestlers, titles: w.db.titles, indieTitles: tis?.titles ?? [], people: w.people!,
    retired: (id) => !!w.career?.people[id]?.retired,
  });
  w.indies = { generated: r.generated, brands: r.brands };
}

/**
 * Rev 3: bookers become people. A promotion's patience and memory of the player move to its booker,
 * and the career's relationships become the world's bonds. Indie promoters' keys stay as they were.
 */
export function meetThePeople(w: World): void {
  const P = (w.people ??= freshPeople());
  const c = w.career;
  if (!c) return;
  for (const p of w.db.promotions) {
    if (p.indie) continue;
    const b = bookerOf(P, p.initials);
    if (!b) continue;
    const pat = c.patience?.[p.initials];
    if (pat && c.patience) {
      const now = c.patience[b.id];
      c.patience[b.id] = now ? { v: Math.min(now.v, pat.v), log: [...now.log, ...pat.log].slice(0, 6) } : pat;
      delete c.patience[p.initials];
    }
    const mem = c.bookers?.[p.initials];
    if (mem && c.bookers) {
      const now = c.bookers[b.id];
      if (now) for (const k of Object.keys(mem) as (keyof typeof mem)[]) { if (k !== 'last') (now[k] as number) += mem[k] as number; }
      else c.bookers[b.id] = mem;
      if (now && mem.last && (!now.last || mem.last > now.last)) now.last = mem.last;
      delete c.bookers[p.initials];
    }
  }
  for (const [id, r] of Object.entries(c.relations ?? {})) {
    const k = pairKey(c.player, id);
    const mentor = r.kind === 'mentor' ? id : r.kind === 'protege' ? c.player : undefined;
    P.bonds[k] = fromOldBond({ a: c.player < id ? c.player : id, b: c.player < id ? id : c.player, v: r.v, kind: mentor ? 'mentor' : r.kind, mentor, met: r.met, last: r.last, log: r.log.map((l) => ({ day: l.day, d: l.d ?? 0, t: l.t })) });
  }
  delete c.relations;
}

/**
 * Rev 2: everyone gets their traits. Shipped wrestlers get the ones they ship with; anyone else (rookies,
 * created wrestlers) rolls them from their style, the same for this world every time.
 */
export function giveTraits(w: World): void {
  for (const x of w.db.wrestlers) {
    if (x.traits?.length) continue;
    const shipped = shippedWrestler(x.id)?.traits;
    if (shipped?.length) { x.traits = [...shipped]; continue; }
    const rnd = seededRng(hashSeed(w.seed, 'traits', x.id));
    x.traits = rollTraits(x as Wrestler, rnd, x.id.startsWith('custom_') ? 1 : rollCount(rnd));
  }
}

/** The world has been played in: it has a history, or a career has been through it. */
export const worldPlayed = (w: World = activeWorld()): boolean => !!w.day || w.history.shows.length > 0;

/** End the career but keep the world exactly as it is (rosters, champions, history). */
export async function resetCareer(): Promise<void> {
  const w = activeWorld();
  const c = w.career;
  if (c) {
    w.day = c.today;
    // The calendar is drawn weeks ahead: wind numbering back to the start of this week so the next
    // career redraws from here and the numbers carry on without gaps.
    const cut = weekStart(c.today);
    const counters = { ...c.counters };
    const nextIrregular = { ...c.nextIrregular };
    const ahead = Object.values(c.shows).filter((s) => s.date >= cut).sort((a, b) => (a.date < b.date ? -1 : 1));
    const seen = new Set<string>();
    for (const s of ahead) {
      if (s.series && s.n !== undefined) counters[s.series] = Math.min(counters[s.series] ?? s.n, s.n - 1);
      // An irregular schedule's next show is the first one still ahead.
      if (s.irregular && !seen.has(s.irregular)) { seen.add(s.irregular); nextIrregular[s.irregular] = s.date; }
    }
    w.calendar = { counters, nextIrregular };
  }
  w.career = null;
  databaseChanged();
  await saveWorld(w);
}

export function activeWorld(): World {
  return active ?? setWorld(freshWorld());
}

/** False when saves only last until the app closes. */
export const worldIsPersistent = (): boolean => persistent;

export async function saveWorld(w: World = activeWorld()): Promise<void> {
  try {
    await tx('world', 'readwrite', (s) => s.put(w, KEY));
  } catch {
    persistent = false;
  }
}

/** Put the world back as it was last saved (after something went wrong mid-day). */
export async function reloadWorld(): Promise<void> {
  const w = await loadSaved();
  if (w) setWorld(w);
}

async function loadSaved(): Promise<World | null> {
  try {
    const w = await tx<World | undefined>('world', 'readonly', (s) => s.get(KEY) as IDBRequest<World | undefined>);
    return w && w.v === 1 ? w : null;
  } catch {
    persistent = false;
    return null;
  }
}

/**
 * Load the saved world, or start the shipped one and save it. Called once before the game renders;
 * `stillWanted` says no if the game gave up waiting, so a late load can't swap the database mid-game.
 */
export async function bootWorld(stillWanted: () => boolean = () => true): Promise<World> {
  const saved = await loadSaved();
  if (!stillWanted()) return activeWorld();
  if (saved) return setWorld(saved);
  const w = setWorld(freshWorld());
  await saveWorld(w);
  return w;
}

/** Back to the database as the game ships it (a new career starts here). */
export async function resetWorld(seed?: number): Promise<World> {
  const w = setWorld(freshWorld(seed));
  await saveWorld(w);
  return w;
}

/** After changing the live database in place: refresh lookups and screens, then save. */
export async function commitWorld(): Promise<void> {
  databaseChanged();
  await saveWorld();
}
