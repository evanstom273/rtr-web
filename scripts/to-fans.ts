/*
 * Lyra's call: wrestlers' 0–100 popularity becomes fan counts in each of the six regions
 * (fans = 150 × 10^(score ÷ 20), five times the base curve; worldwide is the sum), and promotions get a
 * 0–100 popularity of their own (10 + 70 × their old budget factor, so pay doesn't jump).
 * Run once: npx vite-node scripts/to-fans.ts   (it refuses to run twice)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fansFromPopularity } from '../src/data/rtr/fans';
import type { Promotion, Wrestler } from '../src/data/rtr/types';

const W = new URL('../src/data/rtr/wrestlers.json', import.meta.url);
const P = new URL('../src/data/rtr/promotions.json', import.meta.url);
const ws = JSON.parse(readFileSync(W, 'utf8')) as Wrestler[];
const ps = JSON.parse(readFileSync(P, 'utf8')) as Promotion[];
if (ws.every((w) => w.fans && !w.popularity)) throw new Error('Already converted: every wrestler has fans.');

// The old budget factors (average roster popularity ÷ TCG's), from career/clauses.ts.
const BUDGET: Record<string, number> = { TCG: 1, VWF: 0.87, NWGP: 0.87, ZWA: 0.83, SLN: 0.78, IVW: 0.68, SSWC: 0.67, AAWA: 0.6, END: 0.6, UFC: 0.52, TIS: 0.4 };

const out = ws.map((w) => {
  const { popularity, ...rest } = w;
  // Keep the field order: fans where popularity was.
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) {
    if (k === 'popularity') o.fans = fansFromPopularity(popularity!);
    else o[k] = v;
  }
  void rest;
  return o;
});
for (const p of ps) p.popularity = Math.round((10 + 70 * (BUDGET[p.initials] ?? 0.5)) * 10) / 10;
writeFileSync(W, JSON.stringify(out));
writeFileSync(P, JSON.stringify(ps));
console.log('converted', out.length, 'wrestlers and', ps.length, 'promotions');
