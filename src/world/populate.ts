// The indie scene: generated for every new world (Lyra's call). Wrestlers built by the same rules as
// rookies and created wrestlers, indie brands with their own promoters, and the indie titles crowned.
// Everything here rolls from the world's seed, so the same world always gets the same scene.
import { canAdd, rollCount, rollTraits, TRAITS, type Staffer, type Title, type TraitId, type Wrestler, type WrestlerClass } from '../data/rtr';
import { personName, wrestlerGimmick, wrestlerName } from '../data/rtr/names';
import { CLASS_ORDER, QUESTIONS, startingAttributes, templateMoveset, LIMIT } from '../career/create';
import { CITIES, NEIGHBOURS, REGION_LABEL, REGION_OF } from '../career/places';
import {
  INDIE_ARCHETYPES, INDIE_BRAND_EVERY, INDIE_DOW, INDIE_ELSEWHERE_SHARE, INDIE_FEMALE_SHARE, INDIE_GENERATED,
  INDIE_GLOBAL_SHARE, INDIE_NEIGHBOUR_SHARE, INDIE_POOL_MIN, INDIE_REGION_SHARES, PROMOTER_REP,
} from '../career/tuning';
import type { PopRegion } from '../career/types';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { indieTarget } from '../career/calendar';
import { takeJob, type Brand, type People } from './people';

export const REGIONS: PopRegion[] = ['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'];
/** Popularity keys back to the data's region strings. */
export const REGION_DATA: Record<PopRegion, string> = {
  northAmerica: 'NORTH_AMERICA', southAmerica: 'SOUTH_AMERICA', europe: 'EUROPE', asia: 'ASIA', africa: 'AFRICA', oceania: 'OCEANIA',
};

const pick = <T>(rnd: Rng, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const between = (rnd: Rng, [lo, hi]: readonly [number, number] | readonly number[]) => lo! + Math.floor(rnd() * (hi! - lo! + 1));
function weighted<T>(rnd: Rng, xs: readonly T[], w: (x: T) => number): T {
  const total = xs.reduce((t, x) => t + Math.max(0, w(x)), 0);
  let r = rnd() * total;
  for (const x of xs) { r -= Math.max(0, w(x)); if (r <= 0) return x; }
  return xs[xs.length - 1]!;
}
/** Countries with somewhere to put on a show, by region. */
export const countriesIn = (r: PopRegion): string[] => Object.keys(REGION_OF).filter((k) => REGION_OF[k] === r && CITIES[k]?.length);

type Archetype = keyof typeof INDIE_ARCHETYPES;
const LINES: Record<Archetype, string[]> = {
  prospect: ['A hungry prospect working every date going on the {r} circuit.', 'Fresh out of a wrestling school and already turning heads in {r}.', 'Still learning, never short of nerve.'],
  journeyman: ['A dependable hand on the {r} indies. Has wrestled everyone, everywhere.', 'Works three shows a weekend and a day job in between.', 'Knows every promoter on the {r} scene by their first name.'],
  veteran: ['A grizzled veteran who has seen promotions come and go across {r}.', 'Wrestled for anyone who’d pay, for longer than some fans have been alive.', 'Twenty years on the {r} indies and still the one the locker room listens to.'],
};

/**
 * One generated indie wrestler: an archetype (prospect, journeyman, veteran), a home region and
 * country, a body modelled on someone real from there, attributes and moves by the create-a-wrestler
 * rules, popularity mostly at home, a name and gimmick from the pools, and their traits.
 */
export function makeIndie(rnd: Rng, roster: readonly Wrestler[], id: string, region?: PopRegion): Wrestler {
  const home = region ?? weighted(rnd, REGIONS, (r) => INDIE_REGION_SHARES[r]);
  const country = pick(rnd, countriesIn(home));
  const gender = rnd() < INDIE_FEMALE_SHARE ? 'FEMALE' : 'MALE';
  const arch = weighted(rnd, Object.keys(INDIE_ARCHETYPES) as Archetype[], (a) => INDIE_ARCHETYPES[a].share);
  const A = INDIE_ARCHETYPES[arch];
  const models = roster.filter((w) => w.gender === gender && w.country === country);
  const model = pick(rnd, models.length ? models : roster.filter((w) => w.gender === gender));
  const classes: WrestlerClass[] = rnd() < 0.5 ? [pick(rnd, CLASS_ORDER)] : (() => { const a = pick(rnd, CLASS_ORDER); let b = pick(rnd, CLASS_ORDER); while (b === a) b = pick(rnd, CLASS_ORDER); return [a, b]; })();
  const answers = QUESTIONS.map((q) => Math.floor(rnd() * q.a.length));
  const base = startingAttributes(classes, answers);
  const clampStat = (v: number) => Math.max(LIMIT[0], Math.min(LIMIT[1], Math.round(v)));
  const stats = {
    strength: clampStat(base.strength + A.stats + (rnd() * 6 - 3)),
    speed: clampStat(base.speed + (arch === 'veteran' ? -3 : arch === 'prospect' ? 2 : 0) + (rnd() * 6 - 3)),
    stamina: clampStat(base.stamina + A.stats + (rnd() * 6 - 3)),
    skill: clampStat(base.skill + A.stats * 1.5 + (rnd() * 6 - 3)),
    striking: clampStat(base.striking + A.stats + (rnd() * 6 - 3)),
    charisma: clampStat(base.charisma + A.stats + (rnd() * 6 - 3)),
  };
  const kit = templateMoveset(classes, stats, rnd);
  const heel = rnd() < 0.5;
  const hp = between(rnd, A.pop);
  const pop = Object.fromEntries(REGIONS.map((r) => [r, Math.max(2, Math.round(hp * (r === home ? 1 : NEIGHBOURS[home].includes(r) ? INDIE_NEIGHBOUR_SHARE : INDIE_ELSEWHERE_SHARE)))])) as Record<PopRegion, number>;
  const w: Wrestler = {
    id, wrestlerId: 0,
    name: wrestlerName(rnd, country, gender, new Set(roster.map((x) => x.name))),
    gimmick: wrestlerGimmick(rnd, classes, heel, pick(rnd, CITIES[country]!), new Set(roster.map((x) => x.gimmick))),
    gimmickDescription: pick(rnd, LINES[arch]).replace('{r}', REGION_LABEL[home]),
    classes, gender, disposition: heel ? 'HEEL' : 'FACE', age: between(rnd, A.age),
    height: model.height, weight: model.weight, region: REGION_DATA[home], regionLabel: REGION_LABEL[home], country,
    promotion: 'TIS', division: gender === 'FEMALE' ? 'WOMENS' : 'MENS', stats,
    popularity: { global: Math.max(2, Math.round(hp * INDIE_GLOBAL_SHARE)), ...pop },
    ...kit,
  };
  w.traits = rollTraits(w, rnd, rollCount(rnd));
  return w;
}

// ------------------------------------------------------------------ brands and promoters

const B_ADJ = ['Northern', 'Southern', 'Coastal', 'Iron', 'Brick', 'Midnight', 'Harbour', 'Last Stop', 'Red Light', 'Underground', 'Wildside', 'Neon', 'Riverside', 'Backstreet', 'Old Town', 'Union', 'Lowland', 'High Street', 'Cross Town', 'Basement'];
const B_NOUN = ['Grit', 'Riot', 'Rumble', 'Uprising', 'Collective', 'Syndicate', 'Brawl', 'Mayhem', 'Clash', 'Assembly', 'Heat', 'Ruckus', 'Showdown', 'Scrap', 'Uproar', 'Gauntlet'];
const B_TAIL = ['Wrestling', 'Pro Wrestling', 'Championship Wrestling', 'Grappling', 'Wrestling Alliance', 'Wrestling Club'];
const B_SHORT = ['Wrestling', 'Pro', 'Wrestling'];
const LUCHA_TAIL = ['Lucha Libre', 'Lucha Extrema', 'Lucha Independiente'];
const LATIN = new Set(['Mexico', 'Argentina', 'Chile', 'Spain']);

function brandName(rnd: Rng, country: string, city: string, taken: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const r = rnd();
    const n = LATIN.has(country) && r < 0.3 ? `${pick(rnd, LUCHA_TAIL)} ${city}`
      : r < 0.55 ? `${city} ${pick(rnd, B_TAIL)}`
        : r < 0.85 ? `${pick(rnd, B_ADJ)} ${pick(rnd, B_NOUN)} ${pick(rnd, B_SHORT)}`
          : `${pick(rnd, B_NOUN)} ${city}`;
    if (!taken.has(n)) { taken.add(n); return n; }
  }
  return `${city} Wrestling ${taken.size}`;
}

const BACKSTAGE = TRAITS.filter((t) => t.cat === 'backstage').map((t) => t.id);
function backstageTraits(rnd: Rng): TraitId[] {
  const out: TraitId[] = [];
  const n = rnd() < 0.55 ? 1 : 2;
  while (out.length < n) { const t = pick(rnd, BACKSTAGE); if (canAdd(out, t) === 'ok') out.push(t); }
  return out;
}

const PROMOTER_BIOS = [
  'Started {b} in a church hall with a borrowed ring and sixty fans.',
  'A former wrestler who never quite made the big time, now making it for others at {b}.',
  'Runs {b} on a shoestring and a lot of goodwill in {c}.',
  'Took over {b} when the founder retired, and has kept the lights on since.',
  'Ex-referee. Knows every rule, and how far each one bends at {b}.',
];

/** A new indie promoter for a brand (they founded it). */
export function makePromoter(rnd: Rng, P: People, brand: Brand, id: string): Staffer {
  const gender = rnd() < 0.3 ? 'FEMALE' : 'MALE';
  const s: Staffer = {
    id, name: personName(rnd, brand.country, gender), born: `${between(rnd, [1958, 1996])}-${String(between(rnd, [1, 12])).padStart(2, '0')}-${String(between(rnd, [1, 28])).padStart(2, '0')}`,
    country: brand.country, gender, background: pick(rnd, ['promoter', 'promoter', 'wrestler', 'wrestler', 'trainer'] as const), traits: backstageTraits(rnd),
    rep: between(rnd, PROMOTER_REP), job: null, spells: [], bio: pick(rnd, PROMOTER_BIOS).replace('{b}', brand.name).replace('{c}', CITIES[brand.country]?.[0] ?? brand.country),
  };
  P.staff[s.id] = s;
  takeJob(P, s, { kind: 'promoter', brand: brand.id }, brand.from, 'founded');
  return s;
}


/**
 * Indie brands for each region, in proportion to its share of the scene: enough that the region's
 * brands could run its share of the weekly target with room to spare, and at least two everywhere.
 * Each has a promoter who founded it.
 */
export function makeBrands(rnd: Rng, P: People, indies: readonly Wrestler[], prefix: string): void {
  const target = indieTarget(indies.length);
  const taken = new Set(Object.values(P.brands).map((b) => b.name));
  let n = Object.keys(P.brands).length;
  for (const r of REGIONS) {
    const share = indies.filter((w) => w.region === REGION_DATA[r]).length / Math.max(1, indies.length);
    const want = target * BRAND_SPARE * share;
    let capacity = 0;
    for (let i = 0; i < 2 || capacity < want; i++) {
      const country = pick(rnd, countriesIn(r));
      const city = pick(rnd, CITIES[country]!);
      const id = `${prefix}b${++n}`;
      const b: Brand = {
        id, name: brandName(rnd, country, city, taken), country, city, region: r, every: between(rnd, INDIE_BRAND_EVERY),
        dow: weighted(rnd, [0, 1, 2, 3, 4, 5, 6], (d) => INDIE_DOW[d]!), promoter: null, from: `${between(rnd, [2006, 2025])}-${String(between(rnd, [1, 12])).padStart(2, '0')}-01`,
      };
      P.brands[id] = b;
      capacity += 7 / b.every;
      makePromoter(rnd, P, b, `${prefix}p${n}`);
    }
  }
}

/** Brands can run this many times the region's share of the weekly target between them, so the draw has a choice. */
const BRAND_SPARE = 1.4;

// ------------------------------------------------------------------ crowning

/** How good a wrestler looks to a promoter crowning a champion: popularity first, then ability. */
export const champScore = (w: Wrestler, region?: PopRegion): number =>
  (region ? w.popularity[region] : w.popularity.global) * 2 + (w.stats.strength + w.stats.speed + w.stats.stamina + w.stats.skill + w.stats.striking + w.stats.charisma) / 30;

/**
 * Give each vacant indie title to the best indie for it (regional titles: the best in that region).
 * Nobody holds two. Returns who got what.
 */
export function crownIndies(titles: Title[], indieTitleIds: readonly string[], roster: readonly Wrestler[]): [string, string][] {
  const out: [string, string][] = [];
  const holding = new Set(titles.map((t) => t.holder).filter(Boolean) as string[]);
  for (const id of indieTitleIds) {
    const t = titles.find((x) => x.id === id);
    if (!t || t.holder) continue;
    const region = t.region ? (Object.entries(REGION_DATA).find(([, v]) => v === t.region)?.[0] as PopRegion | undefined) : undefined;
    const best = roster.filter((w) => w.promotion === 'TIS' && w.gender === t.gender && !holding.has(w.id) && (!region || w.region === t.region))
      .sort((a, b) => champScore(b, region) - champScore(a, region) || (a.id < b.id ? -1 : 1))[0];
    if (!best) continue;
    t.holder = best.id;
    holding.add(best.id);
    out.push([t.id, best.id]);
  }
  return out;
}

// ------------------------------------------------------------------ the whole scene

export interface PopulateResult { generated: number; brands: number; crowned: [string, string][] }

/**
 * Fill a world's indie scene: a fresh world gets 100–200 indies, brands and its indie champions; a
 * world that's been played is only topped up to the minimum. Rolls from the world's seed.
 */
export function populateIndies(o: { seed: number; played: boolean; wrestlers: Wrestler[]; titles: Title[]; indieTitles: readonly string[]; people: People; retired: (id: string) => boolean }): PopulateResult {
  const rnd = seededRng(hashSeed(o.seed, 'indies'));
  const active = o.wrestlers.filter((w) => w.promotion === 'TIS' && !o.retired(w.id)).length;
  const goal = o.played ? INDIE_POOL_MIN : between(rnd, INDIE_GENERATED);
  const tag = (o.seed >>> 0).toString(36);
  let made = 0;
  for (let i = 0; active + made < goal; i++) {
    const id = `ind_${tag}_${i}`;
    if (o.wrestlers.some((w) => w.id === id)) continue;
    o.wrestlers.push(makeIndie(rnd, o.wrestlers, id));
    made++;
  }
  let brands = 0;
  if (!Object.keys(o.people.brands).length) {
    makeBrands(rnd, o.people, o.wrestlers.filter((w) => w.promotion === 'TIS' && !o.retired(w.id)), `${tag}_`);
    brands = Object.keys(o.people.brands).length;
  }
  const crowned = o.played ? [] : crownIndies(o.titles, o.indieTitles, o.wrestlers);
  return { generated: made, brands, crowned };
}
