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
  /**
   * Match overhaul: more than two people. Every side and their names at the time, which side won (−1: nobody),
   * the kind of match, and how it reads ("Vega & Rook vs Okoro & Bekhit", "a 20-man Rumble"). `a`/`b` stay the
   * first two sides' leads, and `w` says whether one of their sides won.
   */
  sides?: string[][];
  names?: string[][];
  won?: number;
  type?: import('../engine/types').MatchType;
  label?: string;
}

/** Everyone in an archived match. */
export const archivedPeople = (b: ArchivedBout): string[] => (b.sides ? b.sides.flat() : [b.a, b.b]);
/** The side someone was on (0, 1, …), or −1. */
export const archivedSideOf = (b: ArchivedBout, id: string): number => (b.sides ? b.sides.findIndex((s) => s.includes(id)) : id === b.a ? 0 : id === b.b ? 1 : -1);
/** Which side won (−1 for a draw or no contest). */
export const archivedWon = (b: ArchivedBout): number => b.won ?? (b.w === 'a' ? 0 : b.w === 'b' ? 1 : -1);
/** Someone's name as it was that night. */
export function archivedName(b: ArchivedBout, id: string): string {
  if (id === b.a) return b.an;
  if (id === b.b) return b.bn;
  const i = archivedSideOf(b, id);
  return i >= 0 ? b.names?.[i]?.[b.sides![i]!.indexOf(id)] ?? id : id;
}
/** A side's names, joined ("Vega & Rook"). */
export const archivedSideName = (b: ArchivedBout, i: number): string => (b.names?.[i] ?? (i === 0 ? [b.an] : i === 1 ? [b.bn] : [])).join(' & ');
/** How the match reads: "A vs B", or its label. */
export const archivedLabel = (b: ArchivedBout): string => b.label ?? `${b.an} vs ${b.bn}`;
/** Who won, by name, or null for a draw. */
export function archivedWinner(b: ArchivedBout): string | null {
  const i = archivedWon(b);
  return i < 0 ? null : archivedSideName(b, i) || null;
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
  /** Booker mode: the whole show's rating, and its segments. */
  rating?: number;
  segs?: { kind: string; who: string[]; score: number }[];
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
  | 'retired' | 'returned' | 'milestone' | 'tournament' | 'breakthrough' | 'injured' | 'trait' | 'hired' | 'left' | 'founded' | 'closed'
  | 'died' | 'married';
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
      const side = archivedSideOf(b, id);
      if (side < 0) continue;
      const won = archivedWon(b);
      // Against: the other lead in a two-sided match; a crowd reads as the match ("a 20-man Rumble").
      const opp = side === 0 ? b.b : b.a;
      const crowd = !!b.sides && b.sides.length > 2;
      out.push({
        day: s.date, show: s.name, showId: s.id, promo: s.promo, opp, oppName: crowd ? archivedLabel(b) : b.sides ? archivedSideName(b, side === 0 ? 1 : 0) : side === 0 ? b.bn : b.an,
        result: won < 0 ? 'draw' : won === side ? 'win' : 'loss', stars: b.stars, ...(b.title ? { title: b.title } : {}), finish: b.finish,
      });
    }
  }
  return out;
}

/** Every reign a wrestler has had, across all titles. */
export function reignsOf(h: WorldHistory, id: string): (Reign & { title: string })[] {
  return Object.entries(h.reigns).flatMap(([title, rs]) => rs.filter((r) => r.holder === id).map((r) => ({ ...r, title })));
}
