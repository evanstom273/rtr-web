// The match archive: every finished match in full (log, stats, rating), kept in IndexedDB.
// Full logs run ~30KB a match, far too big for localStorage. If IndexedDB is unavailable (private
// mode on some browsers) the archive lives in memory for the session and says so.
import type { MatchRecord } from '../ui/record';
import { loadHits } from './greatestHits';
import { tx as dbTx } from './db';
import { store } from './storage';

const MIGRATED = 'rtr-hits-migrated';

let memory: MatchRecord[] | null = null;

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return dbTx('matches', mode, run).catch((e: unknown) => {
    memory ??= [];
    throw e;
  });
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
