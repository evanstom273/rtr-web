// Hands a batch of matches to the sim workers (or runs them here when there's no worker, as in tests).
// A pool of up to four workers splits the batch; every result comes back with its job's key and the
// night applies them in show and card order, so how many workers there are never changes the outcome.
import { PROMOTIONS, TITLES, WRESTLERS } from '../data/rtr';
import { simJobs, type SimJob, type SimOut } from './sim';

interface Slot { w: Worker; waiting: Map<number, { resolve: (o: SimOut[]) => void; reject: (e: Error) => void }> }
let pool: Slot[] | null | undefined;
let nextId = 1;

function makeWorker(): Slot | null {
  try {
    const w = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    const slot: Slot = { w, waiting: new Map() };
    w.onmessage = (e: MessageEvent<{ id: number; outs?: SimOut[]; error?: string }>) => {
      const p = slot.waiting.get(e.data.id);
      if (!p) return;
      slot.waiting.delete(e.data.id);
      if (e.data.outs) p.resolve(e.data.outs);
      else p.reject(new Error(e.data.error ?? 'sim failed'));
    };
    w.onerror = () => {
      for (const p of slot.waiting.values()) p.reject(new Error('sim worker crashed'));
      slot.waiting.clear();
      pool = pool?.filter((s) => s !== slot) ?? null;
    };
    return slot;
  } catch {
    return null;
  }
}

function getPool(): Slot[] | null {
  if (pool !== undefined) return pool;
  if (typeof Worker === 'undefined') return (pool = null);
  const n = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));
  const slots = Array.from({ length: n }, makeWorker).filter((s): s is Slot => !!s);
  return (pool = slots.length ? slots : null);
}

function runOn(slot: Slot, jobs: SimJob[]): Promise<SimOut[]> {
  const id = nextId++;
  // Only the wrestlers in these matches cross to the worker: the engine looks nobody else up.
  const who = new Set(jobs.flatMap((j) => [j.you, j.them]));
  const db = { wrestlers: WRESTLERS.filter((x) => who.has(x.id)), promotions: PROMOTIONS, titles: TITLES };
  return new Promise<SimOut[]>((resolve, reject) => {
    slot.waiting.set(id, { resolve, reject });
    slot.w.postMessage({ id, db, jobs });
  });
}

/** Run matches against the live database, split across the workers. Falls back to this thread. */
export async function runJobs(jobs: SimJob[]): Promise<SimOut[]> {
  if (!jobs.length) return [];
  const slots = getPool();
  if (!slots?.length) return simJobs(jobs);
  const chunks = slots.map((_, i) => jobs.filter((_, k) => k % slots.length === i)).filter((x) => x.length);
  try {
    const outs = (await Promise.all(chunks.map((ch, i) => runOn(slots[i]!, ch)))).flat();
    // Back in the order the jobs were given (every result also carries its key).
    const byKey = new Map(outs.map((o) => [o.key, o]));
    return jobs.map((j) => byKey.get(j.key)!);
  } catch {
    return simJobs(jobs);
  }
}
