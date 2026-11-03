import movesJson from './moves.json';
import promotionsJson from './promotions.json';
import titlesJson from './titles.json';
import weaponsJson from './weapons.json';
import wrestlersJson from './wrestlers.json';
import type { Move, Promotion, Title, Weapon, Wrestler } from './types';

export * from './types';

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

/** Titles a wrestler currently holds. */
export function titlesHeldBy(w: Wrestler): Title[] {
  return TITLES.filter((t) => t.holder === w.id);
}

export const isChampion = (w: Wrestler): boolean => TITLES.some((t) => t.holder === w.id);
