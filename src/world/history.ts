// The world's memory: every show, every title reign, every signing and release. It belongs to the
// world rather than a career, so it survives a career reset and the next career carries it on.
import type { FinishType, StipulationId } from '../engine/types';
import type { Day } from '../career/dates';
import type { ShowKind } from '../career/types';

export interface ArchivedBout {
  a: string;
  b: string;
  /** Names at the time (a wrestler can be renamed later). */
  an: string;
  bn: string;
  title?: string;
  stip?: StipulationId;
  /** 'a', 'b' or null for a draw. */
  w: 'a' | 'b' | null;
  finish: FinishType;
  t: number;
  stars: number;
  move?: string;
  /** The title changed hands here. */
  newChamp?: boolean;
}

export interface ArchivedShow {
  id: string;
  date: Day;
  promo: string;
  promos?: string[];
  name: string;
  kind: ShowKind;
  city: string;
  country: string;
  bouts: ArchivedBout[];
  /** One-offs: "Charity show", "Farewell: Name", "Cup final". */
  tag?: string;
  /** Indie shows: the brand that put it on, and who booked it (a person id, or an old show-name key). */
  brand?: string;
  booker?: string;
}

export interface Reign {
  holder: string;
  /** Name at the time. */
  name: string;
  from: Day;
  to: Day | null;
  defences: number;
  /** How it was won: the show and who it was taken from. Missing for champions when records began. */
  won?: { show: string; from: string | null; fromName: string | null };
}

export type WorldEventKind = 'title' | 'signed' | 'released' | 'expired' | 'poached' | 'debut'
  | 'retired' | 'returned' | 'milestone' | 'tournament' | 'breakthrough' | 'injured' | 'trait';
export interface WorldEvent {
  day: Day;
  kind: WorldEventKind;
  who: string;
  name: string;
  /** The promotion it happened at (signed: the new one). */
  promo?: string;
  /** Poached / signed from another promotion. */
  from?: string;
  title?: string;
  show?: string;
  /** Words for the newer kinds: "100 days as champion", "the Leeds Cup". */
  what?: string;
}

export interface WorldHistory {
  shows: ArchivedShow[];
  reigns: Record<string, Reign[]>;
  events: WorldEvent[];
}

export const emptyHistory = (): WorldHistory => ({ shows: [], reigns: {}, events: [] });

export function addEvent(h: WorldHistory, e: WorldEvent): void {
  h.events.push(e);
}

/** A title's lineage, newest reign first. */
export function titleLineage(h: WorldHistory, titleId: string): Reign[] {
  return [...(h.reigns[titleId] ?? [])].reverse();
}

/** Everything that happened at a promotion, newest first: moves, title changes, its shows. */
export function promotionStory(h: WorldHistory, initials: string): WorldEvent[] {
  return h.events.filter((e) => e.promo === initials || e.from === initials).reverse();
}

export interface WrestlerMatch { day: Day; show: string; showId: string; promo: string; opp: string; oppName: string; result: 'win' | 'loss' | 'draw'; stars: number; title?: string; finish: FinishType }

/** Every recorded match a wrestler had, newest first. */
export function wrestlerHistory(h: WorldHistory, id: string): WrestlerMatch[] {
  const out: WrestlerMatch[] = [];
  for (let i = h.shows.length - 1; i >= 0; i--) {
    const s = h.shows[i]!;
    for (const b of s.bouts) {
      if (b.a !== id && b.b !== id) continue;
      const mine = b.a === id ? 'a' : 'b';
      out.push({
        day: s.date, show: s.name, showId: s.id, promo: s.promo, opp: mine === 'a' ? b.b : b.a, oppName: mine === 'a' ? b.bn : b.an,
        result: b.w === null ? 'draw' : b.w === mine ? 'win' : 'loss', stars: b.stars, ...(b.title ? { title: b.title } : {}), finish: b.finish,
      });
    }
  }
  return out;
}

/** Every reign a wrestler has had, across all titles. */
export function reignsOf(h: WorldHistory, id: string): (Reign & { title: string })[] {
  return Object.entries(h.reigns).flatMap(([title, rs]) => rs.filter((r) => r.holder === id).map((r) => ({ ...r, title })));
}
