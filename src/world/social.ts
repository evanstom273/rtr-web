// Lives and a lived-in world (Lyra's relationships redesign, stage 1). What doesn't need storing comes from the
// world seed, the same every time: where someone lives, the school they trained at, their orientation, and the
// "click" between two people. How people take to each other (chemistry) is worked out here too, and a fresh world
// is given its relationships: roster mates who know each other, friends, grudges, rivalries at the top of the
// card, veterans with a protégé, bookers' favourites. The player's own small circle is made here as well.
//
// Nothing in here reads the active world: everything it needs is passed in.
import type { Gender, Staffer, TraitId, Wrestler } from '../data/rtr';
import { personName } from '../data/rtr/names';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { CITIES } from '../career/places';
import { CHEMISTRY, CIRCLE, ORIENTATION, ROMANCE, SCHOOLS_PER_COUNTRY, SOCIAL_RESPECT, SOCIAL_SEED } from '../career/tuning';
import type { Day } from '../career/dates';
import { bondOf, bondsOf, ensureBond, feelPair, type Folk, type Life, type Orientation, type People } from './people';
import { yearsBetween } from '../career/dates';

// ------------------------------------------------------------------ where people live and trained

const frac = (seed: number, ...parts: (string | number)[]): number => (Math.abs(hashSeed(seed, ...parts)) % 1_000_000) / 1_000_000;

/** Someone's home city: the one they moved to, else one in their country (the same for this world every time). */
export function homeOf(seed: number, id: string, country: string, life?: Life): string | undefined {
  if (life?.home) return life.home;
  const cities = CITIES[country];
  return cities?.length ? cities[Math.floor(frac(seed, 'home', id) * cities.length)] : undefined;
}

export interface School { id: string; name: string; country: string; city?: string }

const SCHOOL_NAMES = [
  (city: string) => `${city} Wrestling Academy`, (city: string) => `${city} Pro Wrestling School`,
  (city: string) => `The ${city} Dojo`, (city: string) => `${city} Training Centre`,
];

const schoolCache = new Map<string, School[]>();
const trainedAt = new Map<string, School>();

/** The wrestling schools in a country (two to four, named after its cities). */
export function schoolsIn(seed: number, country: string): School[] {
  const key = `${seed}|${country}`;
  const hit = schoolCache.get(key);
  if (hit) return hit;
  const made = makeSchools(seed, country);
  schoolCache.set(key, made);
  return made;
}

function makeSchools(seed: number, country: string): School[] {
  const [lo, hi] = SCHOOLS_PER_COUNTRY as [number, number];
  const n = lo + Math.floor(frac(seed, 'schools', country) * (hi - lo + 1));
  const cities = CITIES[country] ?? [country];
  const start = Math.floor(frac(seed, 'school-city', country) * cities.length);
  return Array.from({ length: n }, (_, i) => {
    const city = cities[(start + i) % cities.length]!;
    const name = SCHOOL_NAMES[(i + Math.floor(frac(seed, 'school-name', country) * SCHOOL_NAMES.length)) % SCHOOL_NAMES.length]!(city);
    return { id: `${country}#${i}`, name, country, city: CITIES[country] ? city : undefined };
  });
}

/** Where someone trained: one of their country's schools. */
export function schoolOf(seed: number, id: string, country: string): School {
  const key = `${seed}|${id}|${country}`;
  let s = trainedAt.get(key);
  if (!s) {
    const all = schoolsIn(seed, country);
    trainedAt.set(key, (s = all[Math.floor(frac(seed, 'school', id) * all.length)]!));
  }
  return s;
}

/** Someone's orientation: the one they've set (you), else one the world gives them. */
export function orientationOf(seed: number, id: string, life?: Life): Orientation {
  if (life?.orient) return life.orient;
  let r = frac(seed, 'orient', id);
  for (const [k, share] of Object.entries(ORIENTATION) as [Orientation, number][]) { if (r < share) return k; r -= share; }
  return 'straight';
}

// ------------------------------------------------------------------ chemistry

/** What chemistry needs to know about someone (a wrestler, a booker, a trainer). */
export interface Persona { id: string; traits: readonly TraitId[]; age: number; country: string; ability?: number }

export const personaOf = (w: Wrestler): Persona => ({ id: w.id, traits: w.traits ?? [], age: w.age, country: w.country, ability: abilityOf(w) });
export const staffPersona = (s: Staffer, today: Day): Persona => ({ id: s.id, traits: s.traits, age: Math.floor(yearsBetween(s.born, today)), country: s.country });
/** Attribute total, the measure of a worker. */
export const abilityOf = (w: Pick<Wrestler, 'stats'>): number => w.stats.strength + w.stats.speed + w.stats.stamina + w.stats.skill + w.stats.striking + w.stats.charisma;

/** The seeded "click" between two people (the same both ways): −1 to +1. */
export const click = (seed: number, a: string, b: string): number => frac(seed, 'click', a < b ? a : b, a < b ? b : a) * 2 - 1;

/**
 * How `a` takes to `b`, about −3 to +3: their traits against each other's, where they're from and trained, the age
 * gap (a mentor warms to the young), and the click between them.
 */
export function chemistry(seed: number, a: Persona, b: Persona): number {
  const C = CHEMISTRY;
  let v = 0;
  for (const [x, y, d] of C.pairs) {
    if (x !== '*' && !a.traits.includes(x as TraitId)) continue;
    if (y !== '*' && !b.traits.includes(y as TraitId)) continue;
    if (x === '*' && y === '*') continue;
    v += d;
  }
  if (a.country === b.country) v += C.sameCountry;
  if (a.country === b.country && schoolOf(seed, a.id, a.country).id === schoolOf(seed, b.id, b.country).id) v += C.sameSchool;
  const gap = Math.abs(a.age - b.age);
  if (a.traits.includes('mentor') && b.age <= C.mentorYoung.age && a.age > b.age) v += C.mentorYoung.by;
  else if (gap > C.ageGap.over) v += C.ageGap.by;
  return v + click(seed, a.id, b.id) * C.click;
}

/** First impressions of someone as a worker: by their ability against your own, and the people they are. */
export function firstRespect(a: Persona, b: Persona, rnd: Rng): number {
  const R = SOCIAL_RESPECT;
  const diff = (b.ability ?? a.ability ?? 300) - (a.ability ?? 300);
  const pro = (b.traits.includes('professional') ? 5 : 0) + (b.traits.includes('reliable') ? 3 : 0) - (b.traits.includes('unpredictable') ? 3 : 0);
  return Math.round(Math.max(R.min, Math.min(R.max, R.start + diff * R.perAbility + pro + gauss(rnd) * R.noise)));
}

/** A standard normal draw. */
export function gauss(rnd: Rng): number {
  const u = Math.max(1e-9, rnd()), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ------------------------------------------------------------------ a lived-in world

export interface SeedOptions {
  seed: number;
  day: Day;
  wrestlers: readonly Wrestler[];
  people: People;
  /** Retired, or not really in the world (Nobody). */
  out: (id: string) => boolean;
}

const pick = <T>(rnd: Rng, xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);
const between = (rnd: Rng, [lo, hi]: readonly number[]) => lo! + Math.floor(rnd() * (hi! - lo! + 1));

/**
 * Give a fresh world its relationships (Lyra's call: lived-in): everyone knows a handful of people from their roster
 * (their region, on the indies), their school and their country, and feels about each their own way, with some
 * shared history. Friends, best friends and enemies fall out of that. Then the top of each division's card has its
 * rivalries, veteran mentors their protégés, and each booker their favourites and their doghouse. Once per world.
 */
export function seedWorld(o: SeedOptions): void {
  const P = o.people;
  if (P.lived) return;
  const S = SOCIAL_SEED;
  const rnd = seededRng(hashSeed(o.seed, 'lived-in'));
  const live = o.wrestlers.filter((w) => !o.out(w.id));
  const persona = new Map(live.map((w) => [w.id, personaOf(w)]));
  const group = (w: Wrestler) => (w.promotion === 'TIS' ? `TIS:${w.region}` : w.promotion);
  const by = <K>(f: (w: Wrestler) => K) => { const m = new Map<K, Wrestler[]>(); for (const w of live) { const k = f(w); const l = m.get(k); if (l) l.push(w); else m.set(k, [w]); } return m; };
  const rosters = by(group), schools = by((w) => schoolOf(o.seed, w.id, w.country).id), countries = by((w) => w.country);

  for (const w of live) {
    const n = between(rnd, S.per);
    for (let i = 0; i < n; i++) {
      const roll = rnd();
      const pool = roll < S.roster ? rosters.get(group(w)) : roll < S.roster + S.school ? schools.get(schoolOf(o.seed, w.id, w.country).id) : countries.get(w.country);
      const other = pick(rnd, (pool ?? []).filter((x) => x.id !== w.id));
      if (!other || bondOf(P, w.id, other.id)) continue;
      const a = persona.get(w.id)!, b = persona.get(other.id)!;
      const sameRoster = group(w) === group(other);
      // How they feel: a share of it they have in common (their history together), the rest their own, and chemistry.
      const shared = gauss(rnd) * S.likeSd * S.shared;
      const la = S.likeMean + shared + gauss(rnd) * S.likeSd * (1 - S.shared) + chemistry(o.seed, a, b) * S.chem;
      const lb = S.likeMean + shared + gauss(rnd) * S.likeSd * (1 - S.shared) + chemistry(o.seed, b, a) * S.chem;
      const x = feelPair(P, w.id, other.id, [Math.round(la), firstRespect(a, b, rnd)], [Math.round(lb), firstRespect(b, a, rnd)], sameRoster ? 'Work together' : 'Know each other from way back', o.day);
      x.f = Math.min(100, between(rnd, S.fam) + (sameRoster ? S.rosterFam : 0));
      x.last = o.day;
    }
  }

  // Best friends and old grudges on each roster (or region, on the indies): the pairs who click most, and least.
  for (const roster of rosters.values()) {
    const pairs = (n: number) => Array.from({ length: n }, () => [pick(rnd, roster), pick(rnd, roster)] as const).filter(([a, b]) => a && b && a.id !== b.id) as [Wrestler, Wrestler][];
    for (const [a, b] of pairs(Math.round(roster.length / S.bestPer))) {
      const pa = persona.get(a.id)!, pb = persona.get(b.id)!;
      if (chemistry(o.seed, pa, pb) + chemistry(o.seed, pb, pa) < 0) continue;
      const x = ensureBond(P, a.id, b.id, o.day);
      x.la = between(rnd, S.best); x.lb = between(rnd, S.best); x.f = between(rnd, S.bestFam);
      x.ra = Math.max(x.ra, firstRespect(pa, pb, rnd)); x.rb = Math.max(x.rb, firstRespect(pb, pa, rnd));
      x.last = o.day;
    }
    for (const [a, b] of pairs(Math.round(roster.length / S.grudgePer))) {
      const pa = persona.get(a.id)!, pb = persona.get(b.id)!;
      if (chemistry(o.seed, pa, pb) + chemistry(o.seed, pb, pa) > 1) continue;
      const x = ensureBond(P, a.id, b.id, o.day);
      // A grudge is often one-sided: one can't stand the other, who only cools on them.
      const one = rnd() < 0.5;
      x.la = between(rnd, S.grudge); x.lb = one ? Math.round(x.la / 3) : between(rnd, S.grudge);
      if (rnd() < 0.5) [x.la, x.lb] = [x.lb, x.la];
      x.f = Math.max(x.f, between(rnd, S.fam));
      x.ra = firstRespect(pa, pb, rnd); x.rb = firstRespect(pb, pa, rnd);
      x.last = o.day;
    }
  }

  // Rivalries at the top of each division: the best pairs fight over the same things.
  for (const [g, roster] of rosters) {
    if (g.startsWith('TIS:')) continue;
    for (const div of ['MENS', 'WOMENS'] as const) {
      const top = roster.filter((w) => w.division === div).sort((x, y) => abilityOf(y) - abilityOf(x));
      for (let i = 0; i + 1 < top.length && i / 2 < S.rivalsPerDivision; i += 2) {
        if (rnd() >= S.rivalChance) continue;
        const a = top[i]!, b = top[i + 1]!;
        const x = ensureBond(P, a.id, b.id, o.day);
        if (!x.f) { x.f = between(rnd, S.fam); x.ra = firstRespect(persona.get(a.id)!, persona.get(b.id)!, rnd); x.rb = firstRespect(persona.get(b.id)!, persona.get(a.id)!, rnd); }
        x.riv = o.day;
      }
    }
  }

  // Veteran mentors and their protégés.
  for (const m of live) {
    if (!m.traits?.includes('mentor') || m.age < 35 || rnd() >= S.protege) continue;
    const young = (rosters.get(group(m)) ?? []).filter((y) => y.age <= 25 && y.id !== m.id && !hasMentor(P, y.id));
    const y = pick(rnd, young);
    if (!y) continue;
    const x = feelPair(P, m.id, y.id, [20, 10], [25, 30], `${m.name} took ${y.name} under their wing`, o.day);
    x.mentor = m.id; x.given = Math.floor(rnd() * 3); x.f = Math.max(x.f, 45);
  }

  // Bookers and promoters: a few on their roster they like, a few they don't, and what they make of their work.
  for (const s of Object.values(P.staff)) {
    if (s.retired || !s.job) continue;
    const roster = s.job.kind === 'booker' ? live.filter((w) => w.promotion === (s.job as { promo: string }).promo)
      : live.filter((w) => w.promotion === 'TIS' && P.brands[(s.job as { brand: string }).brand]?.region === regionKeyOf(w));
    const sp = staffPersona(s, o.day);
    for (let i = 0; i < S.bookerPer; i++) {
      const w = pick(rnd, roster);
      if (!w || bondOf(P, s.id, w.id)) continue;
      const wp = persona.get(w.id)!;
      const x = feelPair(P, s.id, w.id, [Math.round(gauss(rnd) * S.bookerLikeSd + chemistry(o.seed, sp, wp) * S.chem), firstRespect({ ...sp, ability: 300 }, wp, rnd)],
        [Math.round(gauss(rnd) * S.bookerLikeSd), Math.round(10 + gauss(rnd) * 15)], 'Booker and talent', o.day);
      x.f = between(rnd, S.fam);
    }
  }
  P.lived = o.day;
}

const hasMentor = (P: People, id: string): boolean => bondsOf(P, id).some((b) => b.bond.mentor && b.bond.mentor !== id);
/** A wrestler's region key, as indie brands store it. */
const REGION_KEYS: Record<string, string> = { NORTH_AMERICA: 'northAmerica', SOUTH_AMERICA: 'southAmerica', EUROPE: 'europe', ASIA: 'asia', AFRICA: 'africa', OCEANIA: 'oceania' };
const regionKeyOf = (w: Wrestler): string => REGION_KEYS[w.region] ?? 'europe';

// ------------------------------------------------------------------ the player's circle

export interface CircleOptions { seed: number; day: Day; player: Wrestler; wrestlers: readonly Wrestler[]; people: People; out: (id: string) => boolean }

const FAMILY: { rel: string; gender: Gender; age: [number, number] }[] = [
  { rel: 'mother', gender: 'FEMALE', age: [22, 35] }, { rel: 'father', gender: 'MALE', age: [22, 38] },
  { rel: 'sister', gender: 'FEMALE', age: [-8, 8] }, { rel: 'brother', gender: 'MALE', age: [-8, 8] },
];

/** A school's head trainer (one per school, shared by everyone who trained there). */
export function trainerOf(P: People, seed: number, school: School, day: Day): Folk {
  const id = `folk_trainer_${school.id.replace(/[^A-Za-z0-9]/g, '_')}`;
  const folk = (P.folk ??= {});
  if (folk[id]) return folk[id]!;
  const rnd = seededRng(hashSeed(seed, 'trainer', school.id));
  const gender: Gender = rnd() < 0.8 ? 'MALE' : 'FEMALE';
  const age = 45 + Math.floor(rnd() * 21);
  return (folk[id] = { id, name: personName(rnd, school.country, gender), kind: 'trainer', gender, country: school.country, ...(school.city ? { city: school.city } : {}), born: `${Number(day.slice(0, 4)) - age}${day.slice(4)}`, school: school.id });
}

/**
 * The player's small circle (Lyra's call): the trainer who taught them, a school mate or two (friends), and one to
 * three family members. Made once; anyone already in their life keeps how they feel.
 */
export function ensureCircle(o: CircleOptions): void {
  const P = o.people;
  const me = o.player;
  const life = ((P.lives ??= {})[me.id] ??= {});
  if (life.circle) return;
  const rnd = seededRng(hashSeed(o.seed, 'circle', me.id));
  const C = CIRCLE;
  const keep = 5;
  const school = schoolOf(o.seed, me.id, me.country);
  const t = trainerOf(P, o.seed, school, o.day);
  if (!bondOf(P, t.id, me.id)) {
    const x = feelPair(P, t.id, me.id, [between(rnd, C.trainerLike), 30 + Math.floor(rnd() * 30)], [60 + Math.floor(rnd() * 20), 60 + Math.floor(rnd() * 20)], `Trained you at ${school.name}`, o.day, { keep });
    x.f = Math.max(x.f, 70);
  }
  // School mates: from your school, closest in age; failing that, from your country.
  const mates = o.wrestlers.filter((w) => w.id !== me.id && !o.out(w.id) && schoolOf(o.seed, w.id, w.country).id === school.id);
  const pool = (mates.length ? mates : o.wrestlers.filter((w) => w.id !== me.id && !o.out(w.id) && w.country === me.country)).slice().sort((a, b) => Math.abs(a.age - me.age) - Math.abs(b.age - me.age));
  const n = between(rnd, C.mates);
  for (const w of pool.slice(0, n)) {
    // A school mate is a friend: at least this warm both ways (already closer, they stay so).
    const was = bondOf(P, w.id, me.id);
    const x = feelPair(P, w.id, me.id, [0, 0], [0, 0], '', o.day, { keep });
    const [ml, tl] = x.a === me.id ? (['la', 'lb'] as const) : (['lb', 'la'] as const);
    x[ml] = Math.max(x[ml], between(rnd, C.mateLike)); x[tl] = Math.max(x[tl], between(rnd, C.mateLike));
    if (!was) { x.ra = 10 + Math.floor(rnd() * 25); x.rb = 10 + Math.floor(rnd() * 25); }
    x.f = Math.max(x.f, between(rnd, C.mateFam));
    (x.log ??= []).unshift({ day: o.day, t: mates.length ? `Came up together at ${school.name}` : 'Came up together' });
    x.met ??= o.day;
  }
  // Family.
  const folk = (P.folk ??= {});
  const home = homeOf(o.seed, me.id, me.country, life);
  const want = between(rnd, C.family);
  const order = [...FAMILY].sort(() => rnd() - 0.5);
  for (let i = 0; i < want; i++) {
    const f = order[i]!;
    const id = `folk_${me.id}_${f.rel}`;
    if (folk[id]) continue;
    const age = Math.max(16, me.age + (f.rel === 'mother' || f.rel === 'father' ? between(rnd, f.age) : between(rnd, f.age)));
    folk[id] = { id, name: `${personName(rnd, me.country, f.gender).split(' ')[0]} ${me.name.split(' ').slice(-1)[0]}`, kind: 'family', rel: f.rel, of: me.id, gender: f.gender, country: me.country, ...(home ? { city: home } : {}), born: `${Number(o.day.slice(0, 4)) - age}${o.day.slice(4)}` };
    const x = feelPair(P, id, me.id, [between(rnd, C.familyLike), 20], [between(rnd, C.familyLike), 20], 'Family', o.day, { keep });
    x.f = 90;
  }
  life.circle = o.day;
}

// ------------------------------------------------------------------ attraction and couples (stage 4)

/** Someone's gender, whoever they are. */
export function genderOf(P: People, wrestlers: readonly Wrestler[], id: string): Gender | undefined {
  return wrestlers.find((w) => w.id === id)?.gender ?? P.staff[id]?.gender ?? P.folk?.[id]?.gender;
}

/** Could `a` be into `b` at all: their orientation against b's gender (an orientation not set yet: no). */
export function into(o: Orientation | undefined, ga: Gender | undefined, gb: Gender | undefined): boolean {
  if (!o || !ga || !gb || o === 'ace') return false;
  if (o === 'bi') return true;
  return o === 'gay' ? ga === gb : ga !== gb;
}

/** The spark between two people (seeded, the same both ways): 0 to 1. */
export const spark = (seed: number, a: string, b: string): number => frac(seed, 'spark', a < b ? a : b, a < b ? b : a);

/**
 * A lived-in world's couples (Lyra's call: couples already exist): pairs who know each other, like each other, fit
 * each other and have the spark get together (dating, partners, living together or married); some of the rest have a
 * partner from outside the business. Once per world.
 */
export function seedCouples(o: SeedOptions & { orient: (id: string) => Orientation | undefined; age: (id: string) => number }): void {
  const P = o.people;
  if (P.loves) return;
  const R = ROMANCE;
  const rnd = seededRng(hashSeed(o.seed, 'couples'));
  const taken = new Set<string>();
  const live = new Map(o.wrestlers.filter((w) => !o.out(w.id)).map((w) => [w.id, w]));
  for (const x of Object.values(P.bonds)) {
    const a = live.get(x.a), b = live.get(x.b);
    if (!a || !b || taken.has(a.id) || taken.has(b.id)) continue;
    if (Math.min(x.la, x.lb) < 40 || x.f < 40 || Math.abs(a.age - b.age) > R.ageGap) continue;
    if (!into(o.orient(a.id), a.gender, b.gender) || !into(o.orient(b.id), b.gender, a.gender)) continue;
    if (spark(o.seed, a.id, b.id) < R.spark || rnd() >= R.seed.couple) continue;
    const r = rnd();
    const st = r < 0.25 ? 'dating' : r < 0.5 ? 'partner' : r < 0.55 + R.seed.married * 0.45 ? 'married' : 'living';
    x.love = { st, since: o.day };
    x.la = Math.max(x.la, 60); x.lb = Math.max(x.lb, 60); x.f = Math.max(x.f, 70);
    taken.add(a.id); taken.add(b.id);
  }
  // Partners from outside the business.
  const folk = (P.folk ??= {});
  for (const w of live.values()) {
    if (taken.has(w.id) || w.age < R.seed.outsiderAge || rnd() >= R.seed.outsider) continue;
    const o2 = o.orient(w.id);
    if (!o2 || o2 === 'ace') continue;
    const g: Gender = o2 === 'gay' ? w.gender : o2 === 'straight' ? (w.gender === 'MALE' ? 'FEMALE' : 'MALE') : rnd() < 0.5 ? 'MALE' : 'FEMALE';
    const id = `folk_${w.id}_partner`;
    const age = Math.max(20, w.age + Math.round((rnd() - 0.5) * 10));
    folk[id] = { id, name: personName(rnd, w.country, g), kind: 'outsider', rel: 'partner', of: w.id, gender: g, country: w.country, born: `${Number(o.day.slice(0, 4)) - age}${o.day.slice(4)}` };
    const x = feelPair(P, id, w.id, [75, 20], [75, 20], 'Together', o.day);
    x.f = 85;
    x.love = { st: rnd() < R.seed.married ? 'married' : 'living', since: o.day };
  }
  P.loves = o.day;
}
