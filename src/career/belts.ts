// Booker mode, stage 3 (Lyra's design): full control of your titles. Create them, rename, retire and unify them, set
// their division (world, mid-card, cruiserweight, women's, open), vacate them, and run tournaments (four or eight in,
// a round a show) for a vacant belt or a shot at one. An injured champion: the office asks whether to strip them.
import { databaseChanged, fansIn, findWrestler, PROMOTIONS, TITLES, WRESTLERS, type Title, type Wrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { available } from './booker';
import { letter, setCareerHooks } from './career';
import { companyOf, isMajorTier, playerRuns, roleIn, tierOf } from './company';
import { daysBetween, type Day } from './dates';
import { registerReplies } from './mail';
import { BELTS, FEATURES } from './tuning';
import type { Bout, Career, Show } from './types';

export type Division = NonNullable<Title['division']>;
export const DIVISION_LABEL: Record<Division, string> = { world: 'World', midcard: 'Mid-card', cruiser: 'Cruiserweight', women: 'Women’s', open: 'Open' };

export interface Cup {
  id: string;
  promo: string;
  name: string;
  size: 4 | 8;
  gender: 'MALE' | 'FEMALE';
  /** Bracket order (1v8, 4v5, 2v7, 3v6 for eight; 1v4, 2v3 for four). */
  entrants: string[];
  won: (string | null)[][];
  /** A show a round, first round first. */
  shows: string[];
  /** A vacant title to crown the winner, or (held) a shot at it. */
  prize?: string;
  winner?: string;
  settled?: number;
}

const W = (id: string): Wrestler | undefined => findWrestler(id);
const nameOf = (id: string): string => W(id)?.name ?? id;
const history = () => activeWorld().history;
const promotion = (promo: string) => PROMOTIONS.find((p) => p.initials === promo);
export const titlesOf = (promo: string): Title[] => TITLES.filter((t) => promotion(promo)?.titles.includes(t.id) && !t.retired);
export const titleLimit = (promo: string): number => BELTS.max[tierOf(promo)] ?? 4;
export const cupsOf = (c: Career, promo?: string): Cup[] => ((c.office as { cups?: Cup[] } | undefined)?.cups ?? []).filter((x) => !promo || x.promo === promo);
const allCups = (c: Career): Cup[] => ((c.office ??= { roles: [], slots: [] }) as { cups?: Cup[] }).cups ??= [];
const mine = (c: Career, t: Title | undefined): boolean => !!t && PROMOTIONS.some((p) => p.titles.includes(t.id) && roleIn(c, p.initials));

/** Who a title's for: its division and gender (a cruiserweight title has a weight limit). */
export function titleAllows(t: Title, w: Wrestler): string | null {
  if ((t.gender === 'FEMALE') !== (w.gender === 'FEMALE')) return `The ${t.name} isn’t for ${w.name}’s division.`;
  if (t.division === 'cruiser' && w.weight > BELTS.cruiserLbs) return `${w.name} is over the cruiserweight limit (${BELTS.cruiserLbs} lbs).`;
  return null;
}

function endReign(t: Title, day: Day): void {
  const open = history().reigns[t.id]?.find((r) => r.to === null);
  if (open) open.to = day;
  t.holder = null;
}

/** Make a new title for a promotion you run. */
export function createTitle(c: Career, promo: string, o: { name: string; gender: 'MALE' | 'FEMALE'; division: Division }): string {
  if (!FEATURES.booker || !roleIn(c, promo)) return 'You don’t book it.';
  const p = promotion(promo)!;
  const name = o.name.trim();
  if (!name || name.length > 50) return 'Give it a name.';
  if (titlesOf(promo).length >= titleLimit(promo)) return `A ${tierOf(promo)} promotion can have ${titleLimit(promo)} titles at most.`;
  if (TITLES.some((t) => t.name.toLowerCase() === name.toLowerCase())) return 'There’s already a title by that name.';
  const base = `${promo}_${name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`.slice(0, 48);
  let id = base, n = 2;
  while (TITLES.some((t) => t.id === id)) id = `${base}_${n++}`;
  const t: Title = { id, name, promotionId: p.id, gender: o.division === 'women' ? 'FEMALE' : o.gender, holder: null, weeksHeld: 0, division: o.division, createdBy: c.player };
  TITLES.push(t);
  p.titles.push(id);
  c.titles[id] = { since: c.today, defences: 0, last: null };
  databaseChanged();
  return `The ${name} is yours to give out. It starts vacant.`;
}

export function renameTitle(c: Career, id: string, name: string): string {
  const t = TITLES.find((x) => x.id === id);
  if (!mine(c, t)) return 'It isn’t yours.';
  const n = name.trim();
  if (!n || n.length > 50) return 'Give it a name.';
  t!.name = n;
  databaseChanged();
  return `It’s the ${n} now.`;
}

export function setDivision(c: Career, id: string, division: Division): string {
  const t = TITLES.find((x) => x.id === id);
  if (!mine(c, t)) return 'It isn’t yours.';
  t!.division = division;
  if (division === 'women') t!.gender = 'FEMALE';
  if (t!.holder && W(t!.holder) && titleAllows(t!, W(t!.holder)!)) { endReign(t!, c.today); return `${DIVISION_LABEL[division]} now: the champion doesn’t fit, so it’s vacant.`; }
  return `${DIVISION_LABEL[division]} now.`;
}

/** Strip the champion. */
export function vacateTitle(c: Career, id: string, why = 'vacated'): string {
  const t = TITLES.find((x) => x.id === id);
  if (!mine(c, t)) return 'It isn’t yours.';
  if (!t!.holder) return 'It’s already vacant.';
  const was = t!.holder;
  endReign(t!, c.today);
  c.titles[t!.id] = { since: c.today, defences: 0, last: null };
  for (const s of Object.values(c.shows)) if (!s.done && s.card) for (const b of s.card) if (b.title === t!.id && !b.result) delete b.title;
  databaseChanged();
  return `The ${t!.name} is vacant: ${nameOf(was)} ${why}.`;
}

/** Retire a title: it's history (its reigns stay in the record). */
export function retireTitle(c: Career, id: string): string {
  const t = TITLES.find((x) => x.id === id);
  if (!mine(c, t)) return 'It isn’t yours.';
  const p = PROMOTIONS.find((x) => x.titles.includes(t!.id))!;
  if (t!.holder) endReign(t!, c.today);
  t!.retired = c.today;
  p.titles = p.titles.filter((x) => x !== t!.id);
  for (const s of Object.values(c.shows)) if (!s.done && s.card) for (const b of s.card) if (b.title === t!.id && !b.result) delete b.title;
  databaseChanged();
  return `The ${t!.name} is retired.`;
}

/** Unify two titles: the second's retired into the first (its champion keeps the first, if that's vacant). */
export function unifyTitles(c: Career, keep: string, absorb: string): string {
  const k = TITLES.find((x) => x.id === keep), a = TITLES.find((x) => x.id === absorb);
  if (!mine(c, k) || !mine(c, a) || keep === absorb) return 'Pick two of your titles.';
  if (k!.gender !== a!.gender) return 'They’re for different divisions.';
  const champ = a!.holder;
  retireTitle(c, absorb);
  if (champ && !k!.holder && W(champ) && !titleAllows(k!, W(champ)!)) {
    k!.holder = champ;
    (history().reigns[k!.id] ??= []).push({ holder: champ, name: nameOf(champ), from: c.today, to: null, defences: 0 });
    c.titles[k!.id] = { since: c.today, defences: 0, last: null };
  }
  databaseChanged();
  return `The ${a!.name} is unified into the ${k!.name}.`;
}

// ------------------------------------------------------------------ tournaments

const SEEDS: Record<4 | 8, number[]> = { 4: [0, 3, 1, 2], 8: [0, 7, 3, 4, 1, 6, 2, 5] };
export const cupRounds = (cup: Pick<Cup, 'size'>): number => (cup.size === 8 ? 3 : 2);
export const cupRoundName = (cup: Pick<Cup, 'size'>, r: number): string => (['Quarter-final', 'Semi-final', 'Final'] as const)[r + (cup.size === 8 ? 0 : 1)] ?? 'Final';

/** A round's pairs: the bracket first, then the winners of the round before. */
export function cupPairs(cup: Cup, r: number): [string | null, string | null][] {
  const src = r === 0 ? cup.entrants : cup.won[r - 1] ?? [];
  const n = cup.size / 2 ** (r + 1);
  return Array.from({ length: n }, (_, i) => [src[2 * i] ?? null, src[2 * i + 1] ?? null]);
}

/** Who could be in a promotion's cup: its roster and (a small one) free agents from its home region. */
function entrantPool(c: Career, promo: string, gender: 'MALE' | 'FEMALE', day: Day): Wrestler[] {
  const co = companyOf(promo);
  const local = co && !isMajorTier(co.tier);
  const home = Object.values(c.shows).find((s) => s.promo === promo)?.region;
  return WRESTLERS.filter((w) => w.gender === gender && (w.promotion === promo || w.also?.includes(promo) || (local && w.promotion === 'TIS' && !!home && fansIn(w, home) > 0)) && available(c.people[w.id], day))
    .sort((a, b) => (home ? fansIn(b, home) - fansIn(a, home) : 0));
}

/** Run a tournament: four or eight in, a round on each of your next shows, for a vacant title or a shot at one. */
export function startCup(c: Career, promo: string, o: { name: string; size: 4 | 8; gender: 'MALE' | 'FEMALE'; prize?: string; entrants?: string[] }): string {
  if (!FEATURES.booker || !roleIn(c, promo)) return 'You don’t book it.';
  const name = o.name.trim();
  if (!name) return 'Give it a name.';
  const rounds = cupRounds({ size: o.size });
  const shows = Object.values(c.shows).filter((s) => s.promo === promo && !s.done && s.date > c.today && !cupsOf(c).some((x) => !x.winner && x.shows.includes(s.id)))
    .sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, rounds);
  if (shows.length < rounds) return `You need ${rounds} shows coming up with nothing else on them.`;
  if (o.prize) {
    const t = TITLES.find((x) => x.id === o.prize);
    if (!mine(c, t) || (t!.gender === 'FEMALE') !== (o.gender === 'FEMALE')) return 'That prize isn’t one of your titles for this division.';
  }
  const pool = (o.entrants ?? entrantPool(c, promo, o.gender, shows[0]!.date).map((w) => w.id)).slice(0, o.size);
  if (pool.length < o.size) return `Not enough ${o.gender === 'FEMALE' ? 'women' : 'men'} to fill it.`;
  const cup: Cup = { id: `cup${++c.seq}`, promo, name, size: o.size, gender: o.gender, entrants: SEEDS[o.size].map((i) => pool[i]!), won: [], shows: shows.map((s) => s.id), ...(o.prize ? { prize: o.prize } : {}) };
  allCups(c).push(cup);
  return `${name}: ${o.size} in, ${rounds} rounds, starting ${shows[0]!.name}.`;
}

/** The cup matches due on a show (for its card): this round's pairs, the final with the title on it if it's vacant. */
export function roundBouts(c: Career, show: Show): Bout[] {
  const out: Bout[] = [];
  for (const cup of cupsOf(c, show.promo)) {
    const r = cup.shows.indexOf(show.id);
    if (r < 0 || cup.winner) continue;
    const last = r === cupRounds(cup) - 1;
    const t = cup.prize ? TITLES.find((x) => x.id === cup.prize) : undefined;
    cupPairs(cup, r).forEach(([a, b], slot) => {
      if (!a || !b) return;
      out.push({ a, b, tourney: { id: cup.id, round: r, slot }, ...(last && t && !t.holder ? { title: t.id } : {}) });
    });
  }
  return out;
}

/** Put the cup matches on a card (first), taking anyone in them out of other matches. */
export function mergeRound(c: Career, show: Show): void {
  const due = roundBouts(c, show).filter((b) => !show.card?.some((x) => x.tourney?.id === b.tourney!.id && x.tourney.slot === b.tourney!.slot));
  if (!due.length) return;
  const busy = new Set(due.flatMap((b) => [b.a, b.b]));
  show.card = [...due, ...(show.card ?? []).filter((b) => !busy.has(b.a) && !busy.has(b.b))];
}

function settleCups(c: Career, show: Show): void {
  for (const cup of cupsOf(c, show.promo)) {
    const r = cup.shows.indexOf(show.id);
    if (r < 0 || cup.winner || (cup.settled ?? 0) > r) continue;
    const won = (cup.won[r] ??= []);
    cupPairs(cup, r).forEach(([a, b], slot) => {
      if (won[slot]) return;
      const bout = show.card?.find((x) => x.tourney?.id === cup.id && x.tourney.slot === slot && x.result);
      const fans = (id: string | null) => (id && W(id) ? fansIn(W(id)!, show.region) : -1);
      // A no contest or a match that never happened: the bigger name goes through.
      won[slot] = bout?.result?.winner ?? (fans(a) >= fans(b) ? a : b);
    });
    cup.settled = r + 1;
    if (r === cupRounds(cup) - 1) {
      cup.winner = won[0] ?? undefined;
      if (!cup.winner) continue;
      addEvent(history(), { day: show.date, kind: 'tournament', who: cup.winner, name: nameOf(cup.winner), promo: cup.promo, what: cup.name });
      const t = cup.prize ? TITLES.find((x) => x.id === cup.prize) : undefined;
      letter(c, { kind: 'news', from: `${cup.promo} · the office`, subject: `${nameOf(cup.winner)} wins the ${cup.name}`,
        body: [t ? (t.holder === cup.winner ? `And with it the ${t.name}.` : `That’s a shot at the ${t.name}${t.holder ? ` and ${nameOf(t.holder)}` : ''}. Book it.`) : 'Bragging rights, and a crowd that knows their name.'] });
    }
  }
}

// ------------------------------------------------------------------ the night and the office

/** An injured champion on a promotion you book: the office asks whether to strip them. */
function injuredChamps(c: Career): void {
  if (!FEATURES.booker) return;
  for (const t of TITLES) {
    if (!t.holder || t.retired || !mine(c, t)) continue;
    const inj = c.people[t.holder]?.injury;
    if (!inj || daysBetween(c.today, inj.until) < BELTS.injuredDays) continue;
    if (c.letters.some((l) => l.ctx?.vacate === t.id && l.ctx.until === inj.until)) continue;
    letter(c, {
      kind: 'news', from: 'The office', subject: `Your ${t.name} champion is hurt`,
      body: [`${nameOf(t.holder)} is out until about ${inj.until}. Strip them, or keep the title on them and wait?`],
      replies: [{ id: 'belt_vacate', label: 'Strip them' }, { id: 'belt_keep', label: 'Keep it on them' }], ctx: { vacate: t.id, until: inj.until, who: t.holder },
    });
  }
}

registerReplies({
  belt_vacate: (c, l) => vacateTitle(c, l.ctx?.vacate ?? '', 'stripped (injured)'),
  belt_keep: () => 'It stays on them. The division waits.',
});

setCareerHooks({
  show: (c, show) => { if (FEATURES.booker && playerRuns(show.promo)) settleCups(c, show); },
  daily: injuredChamps,
});

