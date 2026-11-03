/*
 * Lyra's call: the 40 shipped indie wrestlers join the ten promotions, 4 each, so every promotion
 * starts with 40 and the indie scene is generated per world. Each region's indies go to that region's
 * promotions first (most popular first, spread round), and the few left over fill the promotions in
 * regions with too few. The indie titles ship vacant: generated indies are crowned when a world starts.
 * Run once: npx vite-node scripts/move-indies.ts   (it refuses to run twice)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Promotion, Title, Wrestler } from '../src/data/rtr/types';

const W = new URL('../src/data/rtr/wrestlers.json', import.meta.url);
const T = new URL('../src/data/rtr/titles.json', import.meta.url);
const P = new URL('../src/data/rtr/promotions.json', import.meta.url);
const ws = JSON.parse(readFileSync(W, 'utf8')) as Wrestler[];
const ts = JSON.parse(readFileSync(T, 'utf8')) as Title[];
const ps = JSON.parse(readFileSync(P, 'utf8')) as Promotion[];

const indies = ws.filter((w) => w.promotion === 'TIS');
if (!indies.length) throw new Error('Already moved: no shipped indies left.');
const promos = ps.filter((p) => !p.indie);
const size = (p: string) => ws.filter((w) => w.promotion === p).length;
const women = (p: string) => ws.filter((w) => w.promotion === p && w.gender === 'FEMALE').length;
const TARGET = 40;

const left: Wrestler[] = [];
for (const region of ['NORTH_AMERICA', 'EUROPE', 'ASIA', 'SOUTH_AMERICA', 'AFRICA', 'OCEANIA']) {
  const here = promos.filter((p) => p.region === region);
  // Women first so each promotion gets at least one where there are enough; then by popularity.
  const pool = indies.filter((w) => w.region === region).sort((a, b) => (a.gender === b.gender ? b.popularity.global - a.popularity.global || (a.id < b.id ? -1 : 1) : a.gender === 'FEMALE' ? -1 : 1));
  for (const w of pool) {
    const open = here.filter((p) => size(p.initials) < TARGET).sort((a, b) => (w.gender === 'FEMALE' ? women(a.initials) - women(b.initials) : 0) || size(a.initials) - size(b.initials) || a.id - b.id);
    if (open[0]) w.promotion = open[0].initials;
    else left.push(w);
  }
}
for (const w of left) {
  const open = promos.filter((p) => size(p.initials) < TARGET).sort((a, b) => size(a.initials) - size(b.initials) || a.id - b.id);
  if (!open[0]) throw new Error('No room');
  w.promotion = open[0].initials;
}
for (const p of promos) if (size(p.initials) !== TARGET) throw new Error(`${p.initials} has ${size(p.initials)}`);

for (const t of ts) if (t.promotionId === ps.find((p) => p.indie)!.id) t.holder = null;

for (const p of promos) {
  const joined = indies.filter((w) => w.promotion === p.initials);
  console.log(`${p.initials.padEnd(5)} +${joined.length}: ${joined.map((w) => `${w.name} (${w.country}, ${w.gender === 'FEMALE' ? 'F' : 'M'})`).join(', ')} → ${size(p.initials)} (${women(p.initials)} women)`);
}
writeFileSync(W, JSON.stringify(ws));
writeFileSync(T, JSON.stringify(ts));
