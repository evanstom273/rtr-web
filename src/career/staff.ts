// Bookers' and promoters' careers, a month at a time: fired, quitting, retiring, hired; indie brands
// closing and new ones opening; an indie promoter hired by a promotion; a retired wrestler turned booker.
// Identity, bonds and their memory of you go with the person, wherever they go (world/people.ts).
//
// Succession (Lyra's call): a new booker gets the office's files, not the old booker's feelings. Their
// memory of your work starts at a share of the last one's; their patience starts fresh; how they feel
// about you is whatever it already was between you. Every open promise is honoured or refused, on record.
import { canAdd, globalScore, PROMOTIONS, type Staffer, type TraitId, TRAITS, WRESTLERS } from '../data/rtr';
import { personName } from '../data/rtr/names';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { bookerOf, freshPeople, jobLabel, leaveJob, takeJob, type People } from '../world/people';
import { countriesIn, makePromoter, REGION_DATA } from '../world/populate';
import { pledgeDone } from './booker';
import { letter, promoName, setCareerHooks } from './career';
import { addDays, daysBetween, type Day } from './dates';
import { CITIES, PROMO_COUNTRIES, REGION_OF } from './places';
import {
  BOOKER_BAD_STARS, BOOKER_FIRE_BAD, BOOKER_FIRE_MONTHLY, BOOKER_FX, BOOKER_QUIT_MONTHLY, BOOKER_RETIRE_AGE, BOOKER_RETIRE_BASE, BOOKER_RETIRE_PER_YEAR, BOOKER_RETURN_DAYS, BOOKER_RETURN_MAX_AGE, BRAND_POP_BOUNDS, INDIE_BRAND_EVERY, INDIE_DOW, PLEDGE_HONOUR_BASE, PLEDGE_HONOUR_SWING, PROMOTER_CLOSE_MONTHLY, PROMOTER_PROMOTE_MIN_REP, STAFF_REP_PER_YEAR, TRUST_INHERIT,
} from './tuning';
import type { BookerMemory, Career, PopRegion } from './types';

const people = (): People => (activeWorld().people ??= freshPeople());
const history = () => activeWorld().history;
const age = (s: Staffer, day: Day) => Math.floor(daysBetween(s.born, day) / 365.25);
const has = (s: Staffer, t: TraitId) => s.traits.includes(t);
const pick = <T>(rnd: Rng, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const weighted = <T>(rnd: Rng, xs: readonly T[], w: (x: T) => number): T | undefined => {
  const total = xs.reduce((t, x) => t + Math.max(0, w(x)), 0);
  if (total <= 0) return undefined;
  let r = rnd() * total;
  for (const x of xs) { r -= Math.max(0, w(x)); if (r <= 0) return x; }
  return xs[xs.length - 1];
};

/** A promotion's matches lately, against the world's (stars): a booker whose shows are flat is likelier to go. */
function starsGap(promo: string, day: Day): number {
  const from = addDays(day, -90);
  let mine = 0, mn = 0, all = 0, an = 0;
  for (const s of history().shows) {
    if (s.date < from) continue;
    for (const b of s.bouts) {
      all += b.stars; an++;
      if (s.promo === promo || s.promos?.includes(promo)) { mine += b.stars; mn++; }
    }
  }
  if (!mn || !an) return 0;
  return mine / mn - all / an;
}

const BACKSTAGE = TRAITS.filter((t) => t.cat === 'backstage').map((t) => t.id);
function backstageTraits(rnd: Rng, keep: TraitId[] = []): TraitId[] {
  const out = keep.filter((t) => BACKSTAGE.includes(t)).slice(0, 2);
  const n = Math.max(out.length, rnd() < 0.5 ? 1 : 2);
  while (out.length < n) { const t = pick(rnd, BACKSTAGE); if (canAdd(out, t) === 'ok') out.push(t); }
  return out;
}

/** A new face behind the curtain (from business, the media or training). */
function newStaffer(c: Career, rnd: Rng, country: string): Staffer {
  const gender = rnd() < 0.35 ? 'FEMALE' : 'MALE';
  const id = `st_${c.today.replace(/-/g, '')}_${Math.floor(rnd() * 1e6).toString(36)}`;
  const s: Staffer = {
    id, name: personName(rnd, country, gender), born: `${1960 + Math.floor(rnd() * 30)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`,
    country, gender, background: pick(rnd, ['business', 'media', 'trainer'] as const), traits: backstageTraits(rnd), rep: 40 + Math.floor(rnd() * 20),
    job: null, spells: [], bio: pick(rnd, ['Came up through television production.', 'Ran a training school for a decade.', 'A promoter’s right hand for years, finally in charge.']),
  };
  people().staff[id] = s;
  return s;
}

/** A retired wrestler steps into the office: the same person (same id), so their bonds carry on. */
function wrestlerTurnedBooker(c: Career, rnd: Rng, promo: string): Staffer | undefined {
  const P = people();
  const home = PROMO_COUNTRIES[promo]?.[0];
  const region = home ? REGION_OF[home] : undefined;
  const cands = WRESTLERS.filter((w) => c.people[w.id]?.retired && !P.staff[w.id] && w.age >= 38 && w.age <= 65 && globalScore(w) >= 35
    && (!region || w.region === REGION_DATA[region]));
  const w = weighted(rnd, cands, (x) => globalScore(x));
  if (!w) return undefined;
  const s: Staffer = {
    id: w.id, name: w.name, born: addDays(c.today, -Math.round(w.age * 365.25)), country: w.country, gender: w.gender === 'FEMALE' ? 'FEMALE' : 'MALE', background: 'wrestler',
    traits: backstageTraits(rnd, w.traits ?? []), rep: Math.min(80, 40 + Math.round(globalScore(w) / 2)), job: null, spells: [],
    bio: `${w.gimmick} in the ring for years. Now on the other side of the curtain.`,
  };
  P.staff[s.id] = s;
  return s;
}

/**
 * Who gets a promotion's book: someone between jobs, an indie promoter who's made a name, a former booker
 * coming back, a retired wrestler, or a new face. People from the promotion's region first.
 */
function successor(c: Career, promo: string, rnd: Rng, leaving: Staffer): { s: Staffer; why: 'hired' | 'promoted' } {
  const P = people();
  const home = PROMO_COUNTRIES[promo]?.[0];
  const region = home ? REGION_OF[home] : undefined;
  const near = (s: Staffer) => (region && REGION_OF[s.country] === region ? 2 : 1);
  const free = Object.values(P.staff).filter((s) => s.id !== leaving.id && !s.job && age(s, c.today) < BOOKER_RETURN_MAX_AGE
    && (!s.retired || daysBetween(s.retired, c.today) >= BOOKER_RETURN_DAYS) && s.spells.some((x) => x.job.kind === 'booker'));
  const promoters = Object.values(P.staff).filter((s) => s.job?.kind === 'promoter' && s.rep >= PROMOTER_PROMOTE_MIN_REP);
  const r = rnd();
  if (r < 0.35 && free.length) return { s: weighted(rnd, free, (s) => s.rep * near(s) * (s.retired ? 0.3 : 1))!, why: 'hired' };
  if (r < 0.7 && promoters.length) return { s: weighted(rnd, promoters, (s) => s.rep * near(s))!, why: 'promoted' };
  if (r < 0.85) { const w = wrestlerTurnedBooker(c, rnd, promo); if (w) return { s: w, why: 'hired' }; }
  return { s: newStaffer(c, rnd, home ?? 'UK'), why: 'hired' };
}

/** The office's files on you, for the new booker: a share of the old one's memory of your work (never their feelings). */
function inheritFiles(c: Career, from: string, to: string): void {
  const old = c.bookers?.[from];
  if (!old || c.bookers?.[to]) return;
  const files = {} as BookerMemory;
  for (const k of Object.keys(old) as (keyof BookerMemory)[]) if (k !== 'last') (files[k] as number) = Math.round((old[k] as number) * TRUST_INHERIT);
  c.bookers![to] = files;
}

/** The new booker decides about the old one's open promises: honoured, or refused (and recorded as such). */
export function promisesOnHandover(c: Career, promo: string, s: Staffer, rnd: Rng): void {
  for (const p of [...(c.pledges ?? [])]) {
    if (p.promo !== promo) continue;
    const swing = (has(s, 'reliable') || has(s, 'professional') ? PLEDGE_HONOUR_SWING : 0) - (has(s, 'egotistical') || has(s, 'unpredictable') ? PLEDGE_HONOUR_SWING : 0);
    if (rnd() < PLEDGE_HONOUR_BASE + swing) { p.by = s.id; continue; }
    pledgeDone(c, p, `${s.name}, ${promo}’s new booker, won’t honour it.`, 'refused', s.id);
    letter(c, { kind: 'contract', from: `${s.name} · ${promoName(promo)}`, subject: 'A promise I won’t keep',
      body: [`I’ve looked through what my predecessor agreed with you. I’m not honouring it: ${p.kind === 'title' ? 'the title shot' : p.kind === 'match' ? 'the match' : p.kind === 'dates' ? 'the extra dates' : 'the booking'} is off.`, 'It’s on the record as refused. It won’t count against you.'] });
  }
}

/** Does this concern you (for your mail)? */
const concernsYou = (c: Career, promo: string, ids: string[]): boolean => {
  const mine = WRESTLERS.find((w) => w.id === c.player)?.promotion;
  return promo === mine || ids.some((id) => !!c.bookers?.[id]);
};

/** Booker mode: a promotion you booked needs a booker again (you quit, were sacked or sold up). */
export function appointBooker(c: Career, promo: string, rnd: Rng): Staffer {
  const P = people();
  const { s, why } = successor(c, promo, rnd, { id: c.player } as Staffer);
  takeJob(P, s, { kind: 'booker', promo }, c.today, why);
  addEvent(history(), { day: c.today, kind: 'hired', who: s.id, name: s.name, promo, what: 'hired as booker' });
  return s;
}

/** A promotion's booker goes (fired, quit, retired) and someone takes over. Exported for tests and the dev console. */
export function handover(c: Career, promo: string, old: Staffer, why: 'fired' | 'quit' | 'retired', rnd: Rng): Staffer {
  const P = people();
  leaveJob(old, c.today, why);
  addEvent(history(), { day: c.today, kind: 'left', who: old.id, name: old.name, promo, what: why === 'fired' ? 'fired as booker' : why === 'quit' ? 'quit as booker' : 'retired as booker' });
  const { s, why: how } = successor(c, promo, rnd, old);
  const wasPromoter = s.job?.kind === 'promoter' ? s.job.brand : null;
  takeJob(P, s, { kind: 'booker', promo }, c.today, how);
  if (wasPromoter) {
    // Their brand carries on under a new promoter.
    const brand = P.brands[wasPromoter];
    if (brand) { brand.promoter = null; makePromoter(rnd, P, { ...brand, from: c.today }, `st_${c.today.replace(/-/g, '')}_p${Math.floor(rnd() * 1e6).toString(36)}`); }
  }
  addEvent(history(), { day: c.today, kind: 'hired', who: s.id, name: s.name, promo, what: how === 'promoted' ? `hired as booker from the indies` : s.background === 'wrestler' && s.spells.length === 1 ? 'hired as booker after retiring from the ring' : 'hired as booker' });
  inheritFiles(c, old.id, s.id);
  promisesOnHandover(c, promo, s, rnd);
  const out = s;
  if (concernsYou(c, promo, [old.id, s.id])) {
    letter(c, { kind: 'news', from: 'The news desk', subject: `${promo} has a new booker`,
      body: [`${old.name} ${why === 'fired' ? 'has been fired' : why === 'quit' ? 'has quit' : 'has retired'} as ${promoName(promo)}’s booker. ${s.name} (${how === 'promoted' ? 'from the indies' : s.background === 'wrestler' ? 'a former wrestler' : jobLabel(P, s) === `${promo} booker` ? 'new to the job' : 'back in the business'}) takes over.`,
        `The office’s files on you go to ${s.name.split(' ')[0]}; how they feel about you is their own business.`] });
  }
  return out;
}

/** A new indie brand in a region (a closed one is replaced, so the scene keeps its shape). */
export function openBrand(c: Career, region: PopRegion, rnd: Rng): void {
  const P = people();
  const country = pick(rnd, countriesIn(region));
  const city = pick(rnd, CITIES[country]!);
  const id = `b${c.today.replace(/-/g, '')}_${Math.floor(rnd() * 1e6).toString(36)}`;
  const taken = new Set(Object.values(P.brands).map((b) => b.name));
  let name = `${city} ${pick(rnd, ['Pro Wrestling', 'Wrestling', 'Championship Wrestling', 'Wrestling Club'])}`;
  if (taken.has(name)) name = `New ${name}`;
  const every = INDIE_BRAND_EVERY[0] + Math.floor(rnd() * (INDIE_BRAND_EVERY[1] - INDIE_BRAND_EVERY[0] + 1));
  let r = rnd(), dow = 5;
  for (let d = 0; d < 7; d++) { r -= INDIE_DOW[d]!; if (r <= 0) { dow = d; break; } }
  // A new brand starts small.
  P.brands[id] = { id, name, country, city, region, every, dow, promoter: null, from: c.today, popularity: BRAND_POP_BOUNDS[0] + Math.floor(rnd() * 6) };
  // Sometimes someone between jobs, or a retired wrestler, starts it; otherwise a new promoter.
  const free = Object.values(P.staff).filter((s) => !s.job && !s.retired && REGION_OF[s.country] === region);
  const founder = free.length && rnd() < 0.4 ? pick(rnd, free) : undefined;
  if (founder) takeJob(P, founder, { kind: 'promoter', brand: id }, c.today, 'founded');
  else makePromoter(rnd, P, P.brands[id]!, `st_${c.today.replace(/-/g, '')}_n${Math.floor(rnd() * 1e6).toString(36)}`);
  addEvent(history(), { day: c.today, kind: 'founded', who: P.brands[id]!.promoter ?? '', name: name, what: `${name} opened in ${city}` });
}

function monthly(c: Career): void {
  const rnd = seededRng(hashSeed(c.seed, 'staff', c.today));
  const P = people();
  // Promotion bookers.
  for (const p of PROMOTIONS.filter((x) => !x.indie && !x.closed)) {
    // Booker mode: a promotion you book has no other booker.
    if (activeWorld().companies?.[p.initials]?.booker === 'player') continue;
    const b = bookerOf(P, p.initials);
    if (!b) { const s = successor(c, p.initials, rnd, { id: '' } as Staffer); takeJob(P, s.s, { kind: 'booker', promo: p.initials }, c.today, s.why); continue; }
    const years = age(b, c.today);
    const retire = years >= BOOKER_RETIRE_AGE ? BOOKER_RETIRE_BASE + (years - BOOKER_RETIRE_AGE) * BOOKER_RETIRE_PER_YEAR : 0;
    const flat = starsGap(p.initials, c.today) < -BOOKER_BAD_STARS;
    const fired = (BOOKER_FIRE_MONTHLY + (flat ? BOOKER_FIRE_BAD : 0)) * (has(b, 'politician') ? BOOKER_FX.politician.fired : 1) * (has(b, 'hot_headed') ? BOOKER_FX.hot_headed.fired : 1);
    const quit = BOOKER_QUIT_MONTHLY * (has(b, 'loyal') ? BOOKER_FX.loyal.quit : 1) * (has(b, 'mercenary') ? BOOKER_FX.mercenary.quit : 1) * (has(b, 'ambitious') ? BOOKER_FX.ambitious.quit : 1);
    const r = rnd();
    if (r < retire) handover(c, p.initials, b, 'retired', rnd);
    else if (r < retire + fired) handover(c, p.initials, b, 'fired', rnd);
    else if (r < retire + fired + quit) handover(c, p.initials, b, 'quit', rnd);
  }
  // Indie promoters: a brand closes now and then (or its promoter retires), and a new one opens in the region.
  for (const brand of Object.values(P.brands)) {
    if (brand.closed) continue;
    const pr = brand.promoter ? P.staff[brand.promoter] : undefined;
    const old = pr && age(pr, c.today) >= BOOKER_RETIRE_AGE + 5 && rnd() < BOOKER_RETIRE_BASE * 2;
    if (!pr || old || rnd() < PROMOTER_CLOSE_MONTHLY) {
      brand.closed = c.today;
      if (pr) leaveJob(pr, c.today, old ? 'retired' : 'closed');
      addEvent(history(), { day: c.today, kind: 'closed', who: pr?.id ?? '', name: pr?.name ?? brand.name, what: `${brand.name} closed` });
      if (pr && c.bookers?.[pr.id]) letter(c, { kind: 'news', from: 'The news desk', subject: `${brand.name} has closed`, body: [`${pr.name} has ${old ? 'retired and closed' : 'closed'} ${brand.name}.`] });
      openBrand(c, brand.region, rnd);
    }
  }
  // A year in the business builds standing.
  if (c.today.slice(5, 7) === '01') for (const s of Object.values(P.staff)) if (s.job) s.rep = Math.min(95, s.rep + STAFF_REP_PER_YEAR);
}

setCareerHooks({ monthly });
