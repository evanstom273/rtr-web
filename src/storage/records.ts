// The match archive: every finished match in full (log, stats, rating), kept in IndexedDB.
// Full logs run ~30KB a match, far too big for localStorage. If IndexedDB is unavailable (private
// mode on some browsers) the archive lives in memory for the session and says so.
import type { MatchRecord } from '../ui/record';
import { loadHits } from './greatestHits';
import { store } from './storage';

const DB = 'rtr';
const STORE = 'matches';
const MIGRATED = 'rtr-hits-migrated';

let memory: MatchRecord[] | null = null;
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => {
    memory ??= [];
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const r = run(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

/** True when matches only last until the app closes. */
export const archiveIsTemporary = (): boolean => memory !== null;

export async function saveRecord(r: MatchRecord): Promise<void> {
  try {
    await tx('readwrite', (s) => s.put(r));
  } catch {
    memory = [...(memory ?? []).filter((x) => x.id !== r.id), r];
  }
}

export async function deleteRecords(ids: string[]): Promise<void> {
  try {
    await Promise.all(ids.map((id) => tx('readwrite', (s) => s.delete(id))));
  } catch {
    memory = (memory ?? []).filter((x) => !ids.includes(x.id));
  }
}

/**
 * Greatest Hits from before the archive (summaries only, no logs) come across once, so the archive
 * starts with everything the game remembers.
 */
async function migrateHits(): Promise<void> {
  if (store.get(MIGRATED, false)) return;
  const hits = loadHits();
  for (const [i, h] of hits.entries()) {
    await saveRecord({
      v: 1, id: `hit-${i}-${h.you}-${h.them}`, at: 0, legacy: true, stars: h.stars, label: '', verdict: '', recap: '',
      you: { id: '', name: h.you }, them: { id: '', name: h.them }, winner: null, winnerName: null, loserName: null, finish: '', how: h.how, t: 0,
      falls: '', stipulation: 'Standard', venue: h.venue, event: '', title: '', parts: [], stats: null, heat: { avg: 0, peak: 0, line: [] }, log: [],
    });
  }
  store.set(MIGRATED, true);
}

/** Every match on file, newest first. */
export async function allRecords(): Promise<MatchRecord[]> {
  try {
    await migrateHits();
    const all = await tx<MatchRecord[]>('readonly', (s) => s.getAll() as IDBRequest<MatchRecord[]>);
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return [...(memory ?? [])].sort((a, b) => b.at - a.at);
  }
}
