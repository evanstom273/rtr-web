// Hands a batch of matches to the sim worker (or runs them here when there's no worker, as in tests).
import { PROMOTIONS, TITLES, WRESTLERS } from '../data/rtr';
import { simJobs, type SimJob, type SimOut } from './sim';

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, { resolve: (o: SimOut[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    if (typeof Worker === 'undefined') return (worker = null);
    worker = new Worker(new URL('./simWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; outs?: SimOut[]; error?: string }>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.outs) w.resolve(e.data.outs);
      else w.reject(new Error(e.data.error ?? 'sim failed'));
    };
    worker.onerror = () => {
      for (const w of waiting.values()) w.reject(new Error('sim worker crashed'));
      waiting.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** Run matches against the live database. Uses the worker when it can, falls back to this thread. */
export async function runJobs(jobs: SimJob[]): Promise<SimOut[]> {
  if (!jobs.length) return [];
  const w = getWorker();
  if (!w) return simJobs(jobs);
  const id = nextId++;
  const db = { wrestlers: WRESTLERS, promotions: PROMOTIONS, titles: TITLES };
  try {
    return await new Promise<SimOut[]>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      w.postMessage({ id, db, jobs });
    });
  } catch {
    return simJobs(jobs);
  }
}
