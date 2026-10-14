import { store } from './storage';

export interface Hit {
  stars: number;
  you: string;
  them: string;
  how: string;
  venue: string;
}

const KEY = 'motn-hits';
const KEEP = 6;

export function loadHits(): Hit[] {
  const h = store.get<unknown>(KEY, []);
  return Array.isArray(h) ? (h as Hit[]) : [];
}

/** Add a match, keep the best six. Returns the updated list. */
export function addHit(hit: Hit): Hit[] {
  const hits = [...loadHits(), hit];
  hits.sort((a, b) => b.stars - a.stars);
  const kept = hits.slice(0, KEEP);
  store.set(KEY, kept);
  return kept;
}
