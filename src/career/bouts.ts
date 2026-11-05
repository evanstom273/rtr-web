// Bouts with more than two people (match overhaul, stage 9). A multi-person bout keeps `a` and `b` as the
// first two sides' leads (and the player, if they're in it, is always one of those), so everything that
// looks at a bout pairwise still works; `sides` has everyone.
import type { MatchType, MatchRulesConfig } from '../engine/types';
import type { Bout } from './types';

export const isMultiBout = (b: Bout): boolean => !!b.sides && b.sides.flat().length > 2;
/** Everyone in a bout. */
export const boutPeople = (b: Bout): string[] => (b.sides ? b.sides.flat() : [b.a, b.b]);
export const inBout = (b: Bout, id: string): boolean => b.a === id || b.b === id || !!b.sides?.some((s) => s.includes(id));
/** The sides of a bout (singles: one each). */
export const boutSides = (b: Bout): string[][] => b.sides ?? [[b.a], [b.b]];
/** Whose side someone's on. */
export const sideOf = (b: Bout, id: string): string[] | undefined => boutSides(b).find((s) => s.includes(id));

/**
 * A multi-person bout from its sides. Whoever's to be the player's side goes first, the player first in it.
 */
export function multiBout(sides: string[][], extra: Partial<Bout> = {}, player?: string): Bout {
  let ss = sides.map((s) => [...s]).filter((s) => s.length);
  if (player) {
    const i = ss.findIndex((s) => s.includes(player));
    if (i > 0) ss = [ss[i]!, ...ss.slice(0, i), ...ss.slice(i + 1)];
    if (i >= 0) ss[0] = [player, ...ss[0]!.filter((x) => x !== player)];
  }
  return { a: ss[0]![0]!, b: ss[1]![0]!, sides: ss, ...extra };
}

/** The engine set-up for a bout: the first two leads, everyone else (with their team), the kind of match and its rules. */
export function boutEngine(b: Bout): { you: string; them: string; extras: { id: string; team: number }[]; type?: MatchType; rules: Partial<MatchRulesConfig> } {
  const sides = boutSides(b);
  const extras: { id: string; team: number }[] = [];
  sides.forEach((s, team) => s.forEach((id, j) => {
    if ((team === 0 || team === 1) && j === 0) return;
    extras.push({ id, team });
  }));
  const rules: Partial<MatchRulesConfig> = {};
  if (b.tag) rules.tag = true;
  if (b.elimination) rules.elimination = true;
  return { you: sides[0]![0]!, them: sides[1]![0]!, extras, ...(b.type ? { type: b.type } : {}), rules };
}

/** "Vega & Rook vs Okoro & Bekhit", "Vega vs Rook vs Okoro", "a 20-man battle royal". */
export function boutLabel(b: Bout, name: (id: string) => string): string {
  const sides = boutSides(b);
  if (b.type === 'battle_royal' || b.type === 'rumble') return `a ${sides.flat().length}-man ${b.type === 'rumble' ? 'Rumble' : 'battle royal'}`;
  return sides.map((s) => s.map(name).join(' & ')).join(' vs ');
}

export const MATCH_TYPE_LABEL: Record<MatchType, string> = {
  singles: 'Singles', tag: 'Tag team', tornado: 'Tornado tag', triple: 'Triple threat', fourway: 'Fatal four-way', multi: 'Multi-man',
  handicap: 'Handicap', battle_royal: 'Battle royal', rumble: 'Rumble', elim_tag: 'Elimination tag', gauntlet: 'Gauntlet',
};

/** What kind of match it is, for a card's tags ("Tag team", "Trios", "Triple threat"); singles: none. */
export function boutKind(b: Bout): string | null {
  if (!b.sides) return null;
  if ((b.type === 'tag' || !b.type) && b.sides.length === 2 && b.sides[0]!.length === 3) return 'Trios';
  if (b.type) return MATCH_TYPE_LABEL[b.type];
  return b.sides.length > 2 ? `${b.sides.length}-way` : 'Tag team';
}

/** Whoever won, by name ("Vega & Rook", or one winner of a multi-man); null for a draw. */
export function boutWinners(b: Bout, name: (id: string) => string): string | null {
  const r = b.result;
  if (!r) return null;
  const ws = r.winners?.length ? r.winners : r.winner ? [r.winner] : [];
  return ws.length ? ws.map(name).join(' & ') : null;
}

/** The engine side the booker's planned winner is on ('you', 'them', or an extra's 's2'…), for a bout with sides. */
export function plannedKey(b: Bout): string | null {
  if (!b.planned) return null;
  const e = boutEngine(b);
  if (b.planned === e.you) return 'you';
  if (b.planned === e.them) return 'them';
  const i = e.extras.findIndex((x) => x.id === b.planned);
  return i >= 0 ? `s${i + 2}` : null;
}

/**
 * Your match from where you stand: "vs Rook", "with Vega vs Okoro & Bekhit", "vs Rook and Okoro", "in a 20-man
 * Rumble".
 */
export function vsLine(b: Bout, me: string, name: (id: string) => string): string {
  if (!b.sides) return `vs ${name(b.a === me ? b.b : b.a)}`;
  if (b.type === 'battle_royal' || b.type === 'rumble' || boutPeople(b).length > 8) return `in ${boutLabel(b, name)}`;
  const mine = sideOf(b, me) ?? [me];
  const partners = mine.filter((x) => x !== me);
  const others = boutSides(b).filter((s) => s !== mine).map((s) => s.map(name).join(' & '));
  return `${partners.length ? `with ${partners.map(name).join(' & ')} ` : ''}vs ${others.join(' and ')}`;
}
