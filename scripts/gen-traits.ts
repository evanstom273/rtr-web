/*
 * Gives every shipped wrestler their traits, deterministically, and writes them into wrestlers.json.
 * Traits come from each wrestler's style, alignment, attributes, age and standing (traitWeights);
 * then no single trait may be held by more than TRAIT_PREVALENCE_CAP of the roster.
 * Run: npx vite-node scripts/gen-traits.ts   (re-running gives the same result)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CONFLICTS, TRAIT_IDS, canAdd, rollCount, rollTraits, traitWeights, type TraitId } from '../src/data/rtr/traits';
import { TRAIT_COUNTS_SHIPPED, TRAIT_PREVALENCE_CAP } from '../src/career/tuning';
import { seededRng } from '../src/engine/rng';
import type { Wrestler } from '../src/data/rtr/types';

const FILE = new URL('../src/data/rtr/wrestlers.json', import.meta.url);
const ws = JSON.parse(readFileSync(FILE, 'utf8')) as Wrestler[];

const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

for (const w of ws) {
  const rnd = seededRng(hash(`traits|${w.id}`));
  w.traits = rollTraits(w, rnd, rollCount(rnd, TRAIT_COUNTS_SHIPPED));
}

// Thin out any trait that's too common: its least likely holders swap it for their best open alternative.
const cap = Math.floor(ws.length * TRAIT_PREVALENCE_CAP);
const count = () => Object.fromEntries(TRAIT_IDS.map((t) => [t, ws.filter((w) => w.traits!.includes(t)).length])) as Record<TraitId, number>;
for (let pass = 0; pass < 50; pass++) {
  const n = count();
  const over = TRAIT_IDS.filter((t) => n[t] > cap);
  if (!over.length) break;
  for (const t of over) {
    const holders = ws.filter((w) => w.traits!.includes(t)).sort((a, b) => traitWeights(a)[t] - traitWeights(b)[t] || (a.id < b.id ? -1 : 1));
    for (const w of holders.slice(0, n[t] - cap)) {
      const k = traitWeights(w);
      const alt = TRAIT_IDS.filter((x) => x !== t && n[x] < cap && canAdd(w.traits!, x, t) === 'ok').sort((a, b) => k[b] - k[a] || (a < b ? -1 : 1))[0];
      if (!alt) continue;
      w.traits = w.traits!.map((x) => (x === t ? alt : x));
      n[t]--; n[alt]++;
    }
  }
}

const n = count();
const sizes = [1, 2, 3].map((k) => ws.filter((w) => w.traits!.length === k).length);
console.log(`traits per wrestler: one ${sizes[0]}, two ${sizes[1]}, three ${sizes[2]} (cap ${cap} per trait)`);
for (const t of [...TRAIT_IDS].sort((a, b) => n[b] - n[a])) console.log(`  ${t.padEnd(22)} ${n[t]}`);
for (const [a, b] of CONFLICTS) if (ws.some((w) => w.traits!.includes(a) && w.traits!.includes(b))) throw new Error(`conflict ${a}/${b}`);
writeFileSync(FILE, JSON.stringify(ws));
