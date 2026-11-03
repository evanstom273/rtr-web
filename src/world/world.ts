// The world: the one save shared by exhibition and career (Wrestling Empire style). It holds the live
// database plus, once a career is running, everything the career tracks. Kept in IndexedDB; if that's
// unavailable the world lives in memory for the session.
import { PROMOTIONS, TITLES, WRESTLERS, applyDatabase, databaseChanged, shippedDatabase, type Database } from '../data/rtr';
import { tx } from '../storage/db';
import type { Career } from '../career/types';

export interface World {
  v: 1;
  /** Seeds everything the world rolls, so a day plays out the same if it's replayed. */
  seed: number;
  createdAt: number;
  db: Database;
  /** The career in this world; null when there isn't one. */
  career: Career | null;
}

const KEY = 'current';
let active: World | null = null;
let persistent = true;

export function freshWorld(seed = Math.floor(Math.random() * 2 ** 31)): World {
  return { v: 1, seed, createdAt: Date.now(), db: shippedDatabase(), career: null };
}

/** Make `w` the active world. Its database becomes the live one everything reads. */
export function setWorld(w: World): World {
  applyDatabase(w.db);
  // From here on the world's database *is* the live arrays, so changes made through either are saved.
  w.db = { wrestlers: WRESTLERS, promotions: PROMOTIONS, titles: TITLES };
  active = w;
  return w;
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
