// Simulating the world with nobody playing (Lyra's history sim). The world runs exactly as it does in a
// career, through every system, but the "player" is Nobody: a hidden, retired placeholder who's never
// booked and never written to. When history's done, Nobody goes and a real career carries on from it.
import { databaseChanged, fansIn, PROMOTIONS, shippedWrestler, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { makeIndie } from '../world/populate';
import { ensurePotential } from './development';
import { titleRegion } from './booker';
import { finishDay, person, startCareer, type StartOptions } from './career';
import { QUESTIONS, startingAttributes } from './create';
import { addMonths, type Day } from './dates';
import { attributeTotal } from './economy';
import { createdFans } from './fanStart';
import { REGION_KEY } from './places';
import { BACKDATE, DEV, INDIE_POOL_MIN, ROSTER_TARGET } from './tuning';
import type { SimJob, SimOut } from './sim';
import type { Career } from './types';

export const NOBODY = '__nobody';

function nobody(): Wrestler {
  const model = WRESTLERS.find((w) => w.promotion === 'TIS') ?? WRESTLERS[0]!;
  return {
    ...structuredClone(model), id: NOBODY, name: 'Nobody', promotion: 'TIS', traits: [],
    fans: { northAmerica: 0, southAmerica: 0, europe: 0, asia: 0, africa: 0, oceania: 0 },
  } as Wrestler;
}

/** Nobody in the database while history runs (taken out for saving and choosing). */
export function addNobody(): void { if (!WRESTLERS.some((w) => w.id === NOBODY)) { WRESTLERS.push(nobody()); databaseChanged(); } }
export function dropNobody(): void {
  const i = WRESTLERS.findIndex((w) => w.id === NOBODY);
  if (i >= 0) { WRESTLERS.splice(i, 1); databaseChanged(); }
  const P = activeWorld().people;
  if (P) for (const [k, b] of Object.entries(P.bonds)) if (b.a === NOBODY || b.b === NOBODY) delete P.bonds[k];
}

/** A world with nobody playing, from `today`. */
export function startSpectator(o: Omit<StartOptions, 'player' | 'deal' | 'carry' | 'created'>): Career {
  addNobody();
  const c = startCareer({ ...o, player: NOBODY, created: true });
  c.spectator = true;
  c.letters = [];
  const p = c.people[NOBODY]!;
  p.retired = true;
  p.contract = null;
  return c;
}

/** Run the world on to `until` (a day at a time, every match through `run`). */
export async function simulateTo(c: Career, until: Day, run: (jobs: SimJob[]) => Promise<SimOut[]>, onDay?: (c: Career) => void | Promise<void>, cancelled?: () => boolean): Promise<void> {
  while (c.today < until) {
    if (cancelled?.()) return;
    debuts(c);
    await finishDay(c, run);
    await onDay?.(c);
  }
}

/** History's done: Nobody goes, and your career carries on from where the world got to. */
export function careerFrom(sim: Career, player: string, extra: Omit<StartOptions, 'player' | 'today' | 'seed' | 'carry'> = {}): Career {
  // Anyone due to debut today is in the world before you start.
  debuts(sim);
  dropNobody();
  return startCareer({ ...extra, player, today: sim.today, seed: sim.seed, carry: sim });
}

// ------------------------------------------------------------------ backdating (Lyra's calls)

/**
 * Rewind the world `years` years so history can run up to `today`. Everyone gets younger; anyone younger than
 * their debut age then waits to debut on the indies. Abilities rewind along the development curve towards a
 * potential near their shipped level, fans with the years they'd been in the business. Each title starts with
 * the biggest name on its roster at the time.
 */
export function backdate(years: number, today: Day, seed: number): { start: Day; waiting: { w: Wrestler; on: Day }[] } {
  const start = addMonths(today, -12 * years);
  const waiting: { w: Wrestler; on: Day }[] = [];
  const keep: Wrestler[] = [];
  const g = 1 - DEV.grow * BACKDATE.avgWork;
  // Lyra's call: today's generated indie scene never existed. Only the shipped roster rewinds; the indie
  // scene of back then is generated fresh (below), at the ages a new indie scene has.
  const gone = new Set(WRESTLERS.filter((w) => w.id !== NOBODY && !shippedWrestler(w.id)).map((w) => w.id));
  const P = activeWorld().people;
  if (P) for (const [k, b] of Object.entries(P.bonds)) if (gone.has(b.a) || gone.has(b.b)) delete P.bonds[k];
  for (const w of WRESTLERS) {
    if (gone.has(w.id)) continue;
    if (w.id === NOBODY) { keep.push(w); continue; }
    const rnd = seededRng(hashSeed(seed, 'rewind', w.id));
    // Everyone shipped has debuted by today, however young they are now.
    const debut = Math.min(w.age, BACKDATE.debut[0] + Math.floor(rnd() * (BACKDATE.debut[1] - BACKDATE.debut[0] + 1)));
    const now = attributeTotal(w);
    const P = Math.max(150, Math.min(DEV.cap * 6, now + Math.round((rnd() * 2 - 1) * BACKDATE.potentialSpread)));
    const peak = DEV.peak[0] + Math.floor(rnd() * (DEV.peak[1] - DEV.peak[0] + 1));
    const rookie = Object.values(startingAttributes(w.classes, QUESTIONS.map(() => null))).reduce((a, b) => a + b, 0);
    // Where the curve puts them at an age: rookie level at debut, towards P until the peak, then decline from 34.
    const at = (age: number) => {
      if (age <= debut) return Math.min(rookie, P);
      const t = P - (P - Math.min(rookie, P)) * g ** ((Math.min(age, peak) - debut) * 12);
      return t - (age > DEV.declineFrom ? (Math.min(age, DEV.declineSteep) - DEV.declineFrom) * 3 + Math.max(0, age - DEV.declineSteep) * 6.5 : 0);
    };
    const then = w.age - years;
    const target = at(Math.max(then, debut));
    for (const k of Object.keys(w.stats) as (keyof Wrestler['stats'])[]) w.stats[k] = Math.max(25, Math.min(DEV.cap, Math.round((w.stats[k] * target) / now)));
    const home = REGION_KEY[w.region] ?? 'europe';
    const fresh = createdFans(home);
    const f = then < debut ? 0 : ((then - debut + 1) / (Math.max(0, w.age - debut) + 1)) ** BACKDATE.fanExp;
    for (const r of Object.keys(w.fans) as (keyof Wrestler['fans'])[]) w.fans[r] = Math.max(fresh[r], Math.round(w.fans[r] * f));
    w.potential = P; w.peak = peak; w.dev = 0;
    if (then < debut) {
      // Not old enough yet: they debut on the indies when they are.
      w.age = debut;
      w.promotion = 'TIS';
      waiting.push({ w, on: addMonths(start, 12 * (debut - then)) });
    } else {
      w.age = then;
      keep.push(w);
    }
  }
  WRESTLERS.splice(0, WRESTLERS.length, ...keep);
  // The indie scene of back then (Lyra's call: bigger at the start): a normal scene's worth plus however many the
  // majors are short of their rosters, so it's still about a normal size once scouting has filled them.
  const short = PROMOTIONS.filter((p) => !p.indie).reduce((t, p) => t + Math.max(0, ROSTER_TARGET - keep.filter((w) => w.promotion === p.initials).length), 0);
  const rnd = seededRng(hashSeed(seed, 'history-indies', start));
  for (let i = 0; i < INDIE_POOL_MIN + short; i++) {
    const w = makeIndie(rnd, WRESTLERS, `hist_${start.replace(/-/g, '')}_${i}`);
    ensurePotential(w, seed);
    WRESTLERS.push(w);
  }
  databaseChanged();
  crownBestFits();
  return { start, waiting: waiting.sort((a, b) => (a.on < b.on ? -1 : 1)) };
}

/** Each title to the biggest name on its roster (right gender, right region) at the start of history; one each. */
function crownBestFits(): void {
  const held = new Set<string>();
  for (const t of TITLES) {
    const owners = PROMOTIONS.filter((p) => p.titles.includes(t.id)).map((p) => p.initials);
    const home = titleRegion(t);
    const region = home ?? (PROMOTIONS.find((p) => owners.includes(p.initials) && !p.indie) ? REGION_KEY[PROMOTIONS.find((p) => owners.includes(p.initials))!.region] ?? 'europe' : 'europe');
    const pool = WRESTLERS.filter((w) => w.id !== NOBODY && owners.includes(w.promotion) && w.gender === t.gender && (!home || REGION_KEY[w.region] === home) && !held.has(w.id));
    const best = pool.sort((a, b) => fansIn(b, region) - fansIn(a, region))[0];
    t.holder = best?.id ?? null;
    if (best) held.add(best.id);
  }
}

/** Anyone whose day has come debuts on the indies (history runs call this every day). */
export function debuts(c: Career): void {
  if (!c.waiting?.length) return;
  while (c.waiting.length && c.waiting[0]!.on <= c.today) {
    const { w } = c.waiting.shift()!;
    WRESTLERS.push(w);
    databaseChanged();
    person(c, w.id);
    addEvent(activeWorld().history, { day: c.today, kind: 'debut', who: w.id, name: w.name, promo: 'TIS' });
  }
}
