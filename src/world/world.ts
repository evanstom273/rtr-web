// The world: the one save shared by exhibition and career (Wrestling Empire style). It holds the live
// database plus, once a career is running, everything the career tracks. Kept in IndexedDB; if that's
// unavailable the world lives in memory for the session.
import { PROMOTIONS, TITLES, WRESTLERS, applyDatabase, databaseChanged, shippedDatabase, type Database } from '../data/rtr';
import { tx } from '../storage/db';
import type { Career } from '../career/types';
import { weekStart, type Day } from '../career/dates';
import { emptyHistory, type WorldHistory } from './history';

export interface World {
  v: 1;
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
}

const KEY = 'current';
let active: World | null = null;
let persistent = true;

export function freshWorld(seed = Math.floor(Math.random() * 2 ** 31)): World {
  return { v: 1, seed, createdAt: Date.now(), db: shippedDatabase(), career: null, history: emptyHistory(), day: null };
}

/** Make `w` the active world. Its database becomes the live one everything reads. */
export function setWorld(w: World): World {
  upgrade(w);
  applyDatabase(w.db);
  // From here on the world's database *is* the live arrays, so changes made through either are saved.
  w.db = { wrestlers: WRESTLERS, promotions: PROMOTIONS, titles: TITLES };
  active = w;
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
