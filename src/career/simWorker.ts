// Runs a day's matches off the main thread, so the calendar stays responsive while the world wrestles.
import type { Database } from '../data/rtr';
import { simJobs, type SimJob } from './sim';

self.onmessage = (e: MessageEvent<{ id: number; db: Database; jobs: SimJob[] }>) => {
  const { id, db, jobs } = e.data;
  try {
    const outs = simJobs(jobs, db);
    (self as unknown as Worker).postMessage({ id, outs });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
