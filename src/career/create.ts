// Create-a-wrestler rules (the Mount & Blade-style life story) and moveset templates. The create
// screens use these, and so do generated rookies, so a rookie is built exactly like you are.
import { MOVES, type Attributes, type Move, type MoveType, type Wrestler, type WrestlerClass } from '../data/rtr';
import type { Rng } from '../engine/rng';

export const ATTR_KEYS: (keyof Attributes)[] = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'];
export const ATTR_SHORT = ['STR', 'SPD', 'STA', 'SKL', 'STK', 'CHA'];
export const ATTR_LONG = ['Strength', 'Speed', 'Stamina', 'Skill', 'Striking', 'Charisma'];

/** The roster average of each attribute minus 8 (see the create-a-wrestler sheet). */
export const BASE = [59, 59, 68, 68, 65, 68];
/** How far each class's wrestlers sit from the roster average, from the data. */
export const CLASS_MODS: Record<WrestlerClass, number[]> = {
  POWERHOUSE: [18, -15, -1, -13, 6, -2],
  TECHNICIAN: [-5, 3, 1, 9, -4, 1],
  STRIKER: [3, 3, 2, -2, 10, 1],
  HIGH_FLYER: [-19, 21, -2, 0, -11, 5],
  HARDCORE: [8, -14, -3, -13, 6, -2],
};
export const CLASS_ORDER: WrestlerClass[] = ['POWERHOUSE', 'TECHNICIAN', 'STRIKER', 'HIGH_FLYER', 'HARDCORE'];
export const CLASS_NAME: Record<WrestlerClass, string> = { POWERHOUSE: 'Powerhouse', TECHNICIAN: 'Technician', STRIKER: 'Striker', HIGH_FLYER: 'High Flyer', HARDCORE: 'Hardcore' };
/** The lowest and highest attributes in the database. */
export const LIMIT: [number, number] = [25, 98];

export interface Answer { t: string; d: string; mods: number[] }
export interface Question { ch: string; q: string; a: Answer[] }

export const QUESTIONS: Question[] = [
  { ch: 'Childhood', q: 'Where did you grow up?', a: [
    { t: 'On a working farm', d: 'Up before dawn, lifting whatever needed lifting.', mods: [5, 0, 3, 0, 0, -3] },
    { t: 'The rough end of a big city', d: 'You could throw a punch before you could ride a bike.', mods: [0, 3, 0, -3, 5, 0] },
    { t: 'On the road with a circus family', d: 'Tumbling in the big top, playing to a crowd every night.', mods: [-3, 5, 0, 0, 0, 3] },
    { t: 'A quiet suburb, raised on wrestling tapes', d: 'You knew every hold by name before you took a single bump.', mods: [0, 0, -3, 5, 0, 3] },
    { t: 'Moving country every few years', d: 'A forces family. New school, new language, same discipline.', mods: [0, 0, 5, 3, -3, 0] },
  ] },
  { ch: 'Sport', q: 'Before wrestling, what did you compete in?', a: [
    { t: 'Amateur wrestling', d: 'Mats, singlets and making weight.', mods: [0, 0, 3, 5, -3, 0] },
    { t: 'Martial arts', d: 'Belts, sparring and a lot of kicking pads.', mods: [0, 0, 0, 3, 5, -3] },
    { t: 'Competitive athletics', d: 'Sprints and hurdles. The decathlon if you were feeling brave.', mods: [-3, 5, 3, 0, 0, 0] },
    { t: 'Performing arts', d: 'Stage school, musical theatre and dance.', mods: [-3, 3, 0, 0, 0, 5] },
    { t: 'No formal background', d: 'A bit of everything, never stuck with one.', mods: [1, 1, 1, 1, 1, 0] },
  ] },
  { ch: 'Training', q: 'Where did you learn to wrestle?', a: [
    { t: 'A strict dojo in Japan', d: 'Thousands of squats, endless drills and no talking back.', mods: [0, 0, 5, 3, 0, -3] },
    { t: 'A lucha libre academy in Mexico', d: 'Rope-running, dives and headscissors from day one.', mods: [-3, 5, 0, 3, 0, 0] },
    { t: 'The backyard, then the local indie', d: 'Trampolines, ladders and learning to sell on concrete.', mods: [0, 0, 3, -3, 3, 2] },
    { t: 'One-on-one with a retired legend', d: 'An old-timer took you under their wing and taught you the psychology.', mods: [-3, 0, 0, 5, 0, 3] },
    { t: 'A strongman gym with a ring out back', d: 'Atlas stones on weekdays, wrestling on Sundays.', mods: [5, -3, 3, 0, 0, 0] },
  ] },
  { ch: 'Motivation', q: 'Why wrestling?', a: [
    { t: 'To be famous', d: 'Your name in lights and your face on a T-shirt.', mods: [0, 0, 0, 0, 0, 5] },
    { t: 'It’s the family business', d: 'Your mum wrestled. So did her dad. You never really had a choice.', mods: [0, 0, 0, 3, 0, 2] },
    { t: 'Fighting’s the one thing you’re good at', d: 'School didn’t take. The gym did.', mods: [2, 0, 0, 0, 3, 0] },
    { t: 'The money', d: 'It pays better than the warehouse. Probably.', mods: [2, 0, 3, 0, 0, 0] },
    { t: 'You saw one show as a kid', d: 'And you’ve not shut up about it since.', mods: [0, 3, 0, 2, 0, 0] },
  ] },
  { ch: 'Before the debut', q: 'What were you doing the year before your first match?', a: [
    { t: 'Working the door at a nightclub', d: 'Breaking up fights every Friday and Saturday.', mods: [3, 0, 0, -3, 5, 0] },
    { t: 'Stunt work for film and TV', d: 'Falling off things for money, on purpose.', mods: [0, 5, 0, 3, -3, 0] },
    { t: 'Ring crew for an indie promotion', d: 'Up at two, down at midnight, watching every match in between.', mods: [0, 0, 3, 5, 0, -3] },
    { t: 'Personal trainer', d: 'In the best shape of your life and telling everyone about it.', mods: [3, 0, 5, 0, 0, -3] },
    { t: 'Hosting a local wrestling podcast', d: 'Hours of talking about wrestling. Now do it on the mic.', mods: [0, 0, -3, 3, 0, 5] },
  ] },
];

/** Two classes average their modifiers rather than stacking them. */
export function classMods(classes: WrestlerClass[]): number[] {
  if (!classes.length) return [0, 0, 0, 0, 0, 0];
  return [0, 1, 2, 3, 4, 5].map((i) => Math.round(classes.reduce((t, c) => t + CLASS_MODS[c][i]!, 0) / classes.length));
}

export function historyMods(answers: (number | null)[]): number[] {
  return [0, 1, 2, 3, 4, 5].map((i) => answers.reduce<number>((t, a, q) => t + (a === null || a === undefined ? 0 : QUESTIONS[q]!.a[a]!.mods[i]!), 0));
}

/** Starting attributes: base + class + life story, kept inside the database's range. */
export function startingAttributes(classes: WrestlerClass[], answers: (number | null)[]): Attributes {
  const c = classMods(classes), h = historyMods(answers);
  const v = BASE.map((b, i) => Math.max(LIMIT[0], Math.min(LIMIT[1], b + c[i]! + h[i]!)));
  return Object.fromEntries(ATTR_KEYS.map((k, i) => [k, v[i]!])) as unknown as Attributes;
}

const QUOTA: [MoveType, number][] = [['GRAPPLE', 15], ['STRIKE', 9], ['SUBMISSION', 5], ['RUNNING', 4], ['PINNING_MOVE', 4], ['AERIAL', 2], ['SPRINGBOARD', 1]];
/** How each class shifts the moveset's make-up. */
const QUOTA_SHIFT: Partial<Record<WrestlerClass, Partial<Record<MoveType, number>>>> = {
  HIGH_FLYER: { AERIAL: 3, SPRINGBOARD: 3, GRAPPLE: -3, SUBMISSION: -2, STRIKE: -1 },
  STRIKER: { STRIKE: 5, GRAPPLE: -3, SUBMISSION: -2 },
  TECHNICIAN: { SUBMISSION: 3, PINNING_MOVE: 1, STRIKE: -3, AERIAL: -1 },
  POWERHOUSE: { GRAPPLE: 4, AERIAL: -2, SPRINGBOARD: -1, SUBMISSION: -1 },
  HARDCORE: { STRIKE: 2, GRAPPLE: 1, AERIAL: -1, SUBMISSION: -2 },
};

/**
 * A moveset built from the wrestler's classes and attributes: moves that suit their style come first,
 * and the mix leans towards what they're good at. 40 moves, 2 signatures, 3 finishers.
 */
export function templateMoveset(classes: WrestlerClass[], stats: Attributes, rnd: Rng): { moves: string[]; signatures: string[]; finishers: string[] } {
  const suits = (m: Move) => m.classPref.some((c) => classes.includes(c));
  const quota = new Map(QUOTA);
  for (const c of classes) for (const [t, d] of Object.entries(QUOTA_SHIFT[c] ?? {})) quota.set(t as MoveType, Math.max(0, (quota.get(t as MoveType) ?? 0) + Math.round(d! / classes.length)));
  if (stats.speed < 50) { quota.set('AERIAL', 0); quota.set('SPRINGBOARD', 0); }
  // Top up or trim to exactly 40, through grapples (every style has them).
  const total = [...quota.values()].reduce((a, b) => a + b, 0);
  quota.set('GRAPPLE', (quota.get('GRAPPLE') ?? 0) + 40 - total);

  const weight = (m: Move) => (suits(m) ? 3 : 1) * (0.5 + rnd());
  const pickFrom = (pool: Move[], n: number, used: Set<string>) => {
    const ranked = pool.filter((m) => !used.has(m.id)).map((m) => ({ m, w: weight(m) })).sort((a, b) => b.w - a.w);
    const out = ranked.slice(0, n).map((x) => x.m.id);
    for (const id of out) used.add(id);
    return out;
  };
  const used = new Set<string>();
  const finishers = pickFrom(MOVES.filter((m) => m.finisher && suits(m)), 3, used);
  if (finishers.length < 3) finishers.push(...pickFrom(MOVES.filter((m) => m.finisher), 3 - finishers.length, used));
  const signatures = pickFrom(MOVES.filter((m) => m.finisher || m.impact >= 7), 2, used);
  const moves: string[] = [];
  for (const [t, n] of quota) moves.push(...pickFrom(MOVES.filter((m) => m.type === t), n, used));
  if (moves.length < 40) moves.push(...pickFrom(MOVES.filter((m) => m.type === 'GRAPPLE' || m.type === 'STRIKE'), 40 - moves.length, used));
  return { moves: moves.slice(0, 40), signatures, finishers };
}

/** A generated rookie, built with the same rules as a created wrestler. */
export function makeRookie(rnd: Rng, roster: readonly Wrestler[], id: string): Wrestler {
  const pickOne = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const model = pickOne(roster);
  const country = model.country;
  const sameCountry = roster.filter((w) => w.country === country && w.gender === model.gender && !/["“]/.test(w.name));
  const pool = sameCountry.length >= 2 ? sameCountry : roster.filter((w) => w.gender === model.gender && !/["“]/.test(w.name));
  const first = pickOne(pool).name.split(' ')[0]!;
  const lastSrc = pickOne(pool).name.split(' ');
  const last = lastSrc.length > 1 ? lastSrc.slice(1).join(' ') : lastSrc[0]!;
  const taken = new Set(roster.map((w) => w.name));
  let name = `${first} ${last}`;
  if (taken.has(name)) name = `${first} ${pickOne(pool).name.split(' ').slice(-1)[0]}`;
  const classes: WrestlerClass[] = rnd() < 0.5 ? [pickOne(CLASS_ORDER)] : (() => { const a = pickOne(CLASS_ORDER); let b = pickOne(CLASS_ORDER); while (b === a) b = pickOne(CLASS_ORDER); return [a, b]; })();
  const answers = QUESTIONS.map((q) => Math.floor(rnd() * q.a.length));
  const stats = startingAttributes(classes, answers);
  const kit = templateMoveset(classes, stats, rnd);
  const gimmicks = roster.map((w) => w.gimmick).filter(Boolean);
  return {
    id, wrestlerId: 0, name, gimmick: pickOne(gimmicks), gimmickDescription: 'A rookie fresh out of training.',
    classes, gender: model.gender, disposition: rnd() < 0.5 ? 'FACE' : 'HEEL', age: 19 + Math.floor(rnd() * 6),
    height: model.height, weight: model.weight, region: model.region, regionLabel: model.regionLabel, country,
    promotion: 'TIS', division: model.division, stats,
    popularity: { global: 5, northAmerica: 5, southAmerica: 5, europe: 5, asia: 5, africa: 5, oceania: 5, [regionKeyOf(model.region)]: 10 },
    ...kit,
  };
}

const regionKeyOf = (r: string): string =>
  ({ NORTH_AMERICA: 'northAmerica', SOUTH_AMERICA: 'southAmerica', EUROPE: 'europe', ASIA: 'asia', AFRICA: 'africa', OCEANIA: 'oceania' })[r] ?? 'europe';
