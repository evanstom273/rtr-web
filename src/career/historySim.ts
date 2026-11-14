// The history sim (Lyra's calls): a fresh world rewound 1–10 years, run year by year with nobody playing,
// a summary at each year's end (carry on, or start your career there), and a review at the end. Saved at
// each year's end, so closing the app loses at most the year in progress.
import { fansTotal, findWrestler, PROMOTIONS, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld, saveWorld } from '../world/world';
import type { WorldEvent } from '../world/history';
import { addMonths, norm, weeksBetween, type Day } from './dates';
import { attributeTotal } from './economy';
import type { SimJob, SimOut } from './sim';
import { FEATURES } from './tuning';
import { addNobody, backdate, dropNobody, NOBODY, simulateTo, startSpectator } from './worldSim';

export const historyOf = () => activeWorld().sim;

/** Rewind the active (fresh) world `years` years and get history ready to run. */
export function beginHistory(years: number, today: Day): void {
  today = norm(today);
  const w = activeWorld();
  const { start, waiting } = backdate(years, today, w.seed);
  const career = startSpectator({ today: start, seed: w.seed });
  career.waiting = waiting;
  w.career = null;
  w.sim = { career, start, end: today, years, reached: 0, totals: totals() };
}

const totals = () => Object.fromEntries(WRESTLERS.filter((w) => w.id !== NOBODY).map((w) => [w.id, attributeTotal(w)]));

/** Save where history's got to (Nobody isn't saved; he's put back after). */
export async function checkpoint(): Promise<void> {
  dropNobody();
  await saveWorld();
  if (historyOf() && historyOf()!.reached < historyOf()!.years) addNobody();
}

/** Run the next year. `onDay` sees each day go by (for the progress bar and headlines). Returns false if stopped. */
export async function runHistoryYear(run: (jobs: SimJob[]) => Promise<SimOut[]>, onDay?: (done: number, total: number) => void | Promise<void>, cancelled?: () => boolean): Promise<boolean> {
  const s = historyOf();
  if (!s || s.reached >= s.years) return false;
  addNobody();
  const from = s.career.today, to = addMonths(s.start, 12 * (s.reached + 1));
  const total = Math.max(1, weeksBetween(from, to));
  let done = 0;
  await simulateTo(s.career, to, run, async () => { done++; await onDay?.(done, total); }, cancelled);
  if (s.career.today < to) return false;
  s.reached++;
  s.prev = s.totals;
  s.totals = totals();
  await checkpoint();
  return true;
}

/** The year (or years) between two days, from the world's history. */
export interface Summary {
  from: Day; to: Day;
  champions: { title: string; holder: string; promo: string }[];
  changes: number;
  best: { a: string; b: string; stars: number; show: string }[];
  moves: string[];
  retired: string[];
  debuts: string[];
  rookies: { id: string; name: string; promo: string; fans: number }[];
  reigns: { title: string; holders: string[] }[];
}
const famous = (id: string) => fansTotal(findWrestler(id) ?? ({ fans: { northAmerica: 0, southAmerica: 0, europe: 0, asia: 0, africa: 0, oceania: 0 } } as never));
const top = <T>(xs: T[], by: (x: T) => number, n: number) => [...xs].sort((a, b) => by(b) - by(a)).slice(0, n);
const year = (d: Day) => d.slice(0, 4);

export function summarise(from: Day, to: Day, n = 6): Summary {
  const H = activeWorld().history;
  const ev = H.events.filter((e) => e.day >= from && e.day < to);
  const shows = H.shows.filter((s) => s.date >= from && s.date < to);
  const flagship = [...PROMOTIONS.filter((p) => !p.indie && !p.closed).map((p) => p.titles[0]!), PROMOTIONS.find((p) => p.indie)?.titles[0]].filter((x): x is string => !!x);
  const champions = flagship.map((id) => TITLES.find((t) => t.id === id)!).filter(Boolean).map((t) => ({ title: t.name, holder: t.holder ? findWrestler(t.holder)?.name ?? '—' : 'Vacant', promo: PROMOTIONS.find((p) => p.titles.includes(t.id))?.initials ?? '' }));
  const bouts = shows.flatMap((s) => s.bouts.filter((b) => !b.sides).map((b) => ({ a: b.an, b: b.bn, stars: b.stars, show: `${s.name}, ${year(s.date)}` })));
  const moveEv = ev.filter((e) => e.kind === 'signed' || e.kind === 'poached');
  const shippedDebuts = ev.filter((e) => e.kind === 'debut' && !e.who.startsWith('rookie_') && !e.who.startsWith('ind_') && !e.who.startsWith('hist_'));
  const debutIds = new Set(ev.filter((e) => e.kind === 'debut').map((e) => e.who));
  const reigns = flagship.map((id) => ({ title: TITLES.find((t) => t.id === id)?.name ?? id, holders: (H.reigns[id] ?? []).filter((r) => (r.to ?? '9999') > from && r.from < to).map((r) => `${r.name} (${year(r.from)})`) }));
  return {
    from, to, champions,
    changes: ev.filter((e) => e.kind === 'title').length,
    best: top(bouts, (b) => b.stars, n),
    moves: top(moveEv, (e) => famous(e.who), n).map((e: WorldEvent) => `${e.name} to ${e.promo}${e.from ? ` from ${e.from}` : ''}`),
    retired: top(ev.filter((e) => e.kind === 'retired'), (e) => famous(e.who), n).map((e) => `${e.name}${e.what ? ` (${e.what})` : ''}`),
    debuts: top(shippedDebuts, (e) => famous(e.who), n).map((e) => e.name),
    rookies: top(WRESTLERS.filter((w) => debutIds.has(w.id)), fansTotal, n).map((w) => ({ id: w.id, name: w.name, promo: w.promotion, fans: fansTotal(w) })),
    reigns,
  };
}

/** A headline for the ticker, or null if it isn't one. */
export function headline(e: WorldEvent): string | null {
  switch (e.kind) {
    case 'title': return `${e.name} wins the ${TITLES.find((t) => t.id === e.title)?.name ?? 'title'}`;
    case 'poached': return `${e.name} jumps from ${e.from} to ${e.promo}`;
    case 'signed': return famous(e.who) > 50000 ? `${e.name} signs with ${e.promo}` : null;
    case 'retired': return famous(e.who) > 50000 ? `${e.name} retires` : null;
    case 'tournament': return `${e.name} wins ${e.what}`;
    case 'debut': return findWrestler(e.who) && !/^(rookie_|ind_|hist_)/.test(e.who) ? `${e.name} debuts on the indies` : null;
    default: return null;
  }
}

/** Ones to watch: the young who've grown most in the last year (their ceiling stays hidden). */
export function onesToWatch(n = 12): string[] {
  const s = historyOf();
  if (!s?.prev) return [];
  return WRESTLERS.filter((w) => w.id !== NOBODY && w.age <= 25 && s.prev![w.id] !== undefined)
    .map((w) => ({ id: w.id, g: attributeTotal(w) - s.prev![w.id]! }))
    .filter((x) => x.g > 0).sort((a, b) => b.g - a.g).slice(0, n).map((x) => x.id);
}

/** The year someone debuted (in the history being simulated), if they did. */
export function debutYear(id: string): string | null {
  const e = activeWorld().history.events.find((x) => x.kind === 'debut' && x.who === id);
  return e ? year(e.day) : null;
}

export const historyOn = () => FEATURES.history;
