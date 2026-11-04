import movesJson from './moves.json';
import promotionsJson from './promotions.json';
import titlesJson from './titles.json';
import weaponsJson from './weapons.json';
import wrestlersJson from './wrestlers.json';
import bookersJson from './bookers.json';
import type { Move, Promotion, Staffer, Title, Weapon, Wrestler } from './types';

export * from './types';
export * from './traits';
export * from './fans';

export const MOVES = movesJson as Move[];
export const WEAPONS = weaponsJson as Weapon[];

/**
 * The live database. Exhibition and career share it (one world, like Wrestling Empire): a career
 * changes champions, rosters and wrestlers, and exhibition sees it. These arrays are never replaced,
 * only refilled by `applyDatabase`, so everything that imported them keeps working.
 */
export const WRESTLERS: Wrestler[] = [];
export const PROMOTIONS: Promotion[] = [];
export const TITLES: Title[] = [];

export interface Database {
  wrestlers: Wrestler[];
  promotions: Promotion[];
  titles: Title[];
}

/** A fresh copy of the database exactly as the game ships it. */
export function shippedDatabase(): Database {
  return structuredClone({
    wrestlers: wrestlersJson as Wrestler[],
    promotions: promotionsJson as Promotion[],
    titles: titlesJson as Title[],
  });
}

const shippedById = new Map((wrestlersJson as Wrestler[]).map((w) => [w.id, w]));
const shippedIds = new Set(shippedById.keys());
/** A shipped wrestler as the game ships them (read-only), for migrations. */
export const shippedWrestler = (id: string): Readonly<Wrestler> | undefined => shippedById.get(id);

/** Each promotion's share of women as the game ships it, so signings keep both divisions in shape. */
const womenShare = new Map<string, number>();
for (const p of new Set((wrestlersJson as Wrestler[]).map((w) => w.promotion))) {
  const roster = (wrestlersJson as Wrestler[]).filter((w) => w.promotion === p);
  womenShare.set(p, roster.filter((w) => w.gender === 'FEMALE').length / Math.max(1, roster.length));
}
export const shippedWomenShare = (promo: string): number => womenShare.get(promo) ?? 0.35;

/** The promotions' bookers as the game ships them (a fresh copy). */
export const shippedStaff = (): Staffer[] => structuredClone(bookersJson as Staffer[]);
/** Ships with the game (so a fresh world has them); generated and created wrestlers don't. */
export const isShippedWrestler = (id: string): boolean => shippedIds.has(id);

const moveById = new Map(MOVES.map((m) => [m.id, m]));
const weaponById = new Map(WEAPONS.map((w) => [w.id, w]));
const wrestlerById = new Map<string, Wrestler>();
const promotionByInitials = new Map<string, Promotion>();

let version = 0;
const listeners = new Set<() => void>();

/** Swap in a database (the active world's). Lookups and every importer of the arrays see it at once. */
export function applyDatabase(db: Database): void {
  WRESTLERS.splice(0, WRESTLERS.length, ...db.wrestlers);
  PROMOTIONS.splice(0, PROMOTIONS.length, ...db.promotions);
  TITLES.splice(0, TITLES.length, ...db.titles);
  databaseChanged();
}

/** Call after changing wrestlers, promotions or titles in place, so lookups and screens catch up. */
export function databaseChanged(): void {
  wrestlerById.clear();
  for (const w of WRESTLERS) wrestlerById.set(w.id, w);
  promotionByInitials.clear();
  for (const p of PROMOTIONS) promotionByInitials.set(p.initials, p);
  version++;
  for (const l of listeners) l();
}

/** For React's useSyncExternalStore: re-render when the database changes. */
export const databaseVersion = (): number => version;
export function onDatabaseChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

applyDatabase(shippedDatabase());

export function getMove(id: string): Move {
  const m = moveById.get(id);
  if (!m) throw new Error(`Unknown move ${id}`);
  return m;
}

export function getWeapon(id: string): Weapon {
  const w = weaponById.get(id);
  if (!w) throw new Error(`Unknown weapon ${id}`);
  return w;
}

export function findWrestler(id: string): Wrestler | undefined {
  return wrestlerById.get(id);
}

export function getWrestler(id: string): Wrestler {
  const w = wrestlerById.get(id);
  if (!w) throw new Error(`Unknown wrestler ${id}`);
  return w;
}

export function getPromotion(initials: string): Promotion | undefined {
  return promotionByInitials.get(initials);
}

/** On a promotion's roster: their main promotion, or another major they're also signed to (non-exclusive deals count fully on both). */
export const worksFor = (w: Wrestler, promo: string): boolean => w.promotion === promo || !!w.also?.includes(promo);
/** Everyone on a promotion's roster right now. */
export const rosterOf = (promo: string): Wrestler[] => WRESTLERS.filter((w) => worksFor(w, promo));

/** Titles a wrestler currently holds. */
export function titlesHeldBy(w: Wrestler): Title[] {
  return TITLES.filter((t) => t.holder === w.id);
}

export const isChampion = (w: Wrestler): boolean => TITLES.some((t) => t.holder === w.id);
