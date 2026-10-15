import movesJson from './moves.json';
import promotionsJson from './promotions.json';
import titlesJson from './titles.json';
import wrestlersJson from './wrestlers.json';
import type { Move, Promotion, Title, Wrestler } from './types';

export * from './types';

export const MOVES = movesJson as Move[];
export const WRESTLERS = wrestlersJson as Wrestler[];
export const PROMOTIONS = promotionsJson as Promotion[];
export const TITLES = titlesJson as Title[];

const moveById = new Map(MOVES.map((m) => [m.id, m]));
const wrestlerById = new Map(WRESTLERS.map((w) => [w.id, w]));
const promotionByInitials = new Map(PROMOTIONS.map((p) => [p.initials, p]));

export function getMove(id: string): Move {
  const m = moveById.get(id);
  if (!m) throw new Error(`Unknown move ${id}`);
  return m;
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

/** Titles a wrestler currently holds. Holder ids are promotion-local, so match within the promotion. */
export function titlesHeldBy(w: Wrestler): Title[] {
  const promo = getPromotion(w.promotion);
  if (!promo) return [];
  return TITLES.filter((t) => t.promotionId === promo.id && t.holderId !== 0 && t.holderId === w.wrestlerId);
}

export const isChampion = (w: Wrestler): boolean => titlesHeldBy(w).length > 0;
