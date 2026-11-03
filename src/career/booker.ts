// The AI bookers: who wrestles on each card, title defences, feuds and planned finishes.
import { PROMOTIONS, TITLES, findWrestler, type Title, type Wrestler } from '../data/rtr';
import type { StipulationId } from '../engine/types';
import { seededRng, type Rng } from '../engine/rng';
import { addDays, daysBetween, type Day } from './dates';
import { REGION_KEY } from './places';
import {
  CARD_SIZE, CONTENDER_T1_BONUS, DEFENCE_CHANCE, DEFENCE_GAP_DAYS, FEUD_WEEKS, FEUDS_PER_PROMOTION, INTERGENDER_CHANCE,
  INTERGENDER_CHANCE_INDIE, PLANNED_RETAIN, SCHEDULE_T2_MAX_PER_MONTH, STIP_CHANCE,
} from './tuning';
import type { Bout, Career, Feud, Person, PopRegion, Show } from './types';

/** Stipulations a booker reaches for, roughly how often. Hardcore ones tire people more. */
const STIPS: [StipulationId, number][] = [
  ['no_dq', 5], ['falls_count_anywhere', 3], ['tables', 3], ['ladder', 2], ['steel_cage', 2], ['last_man_standing', 2],
  ['submission', 2], ['two_out_of_three', 2], ['i_quit', 1], ['iron_man', 1],
];
export const HARDCORE_STIPS = new Set<StipulationId>(['no_dq', 'falls_count_anywhere', 'tables', 'ladder', 'steel_cage', 'last_man_standing', 'i_quit']);

export function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const promoRegion = (initials: string): PopRegion => REGION_KEY[PROMOTIONS.find((p) => p.initials === initials)?.region ?? ''] ?? 'europe';
export const regionalPop = (w: Wrestler, r: PopRegion): number => w.popularity[r] ?? w.popularity.global;

/** Everyone who works for a show's promotion(s) right now. */
export function showRoster(show: Show, roster: readonly Wrestler[]): Wrestler[] {
  const promos = show.promos ?? [show.promo];
  return roster.filter((w) => promos.includes(w.promotion));
}

/** Titles defended on a show: the promotion's own (joint shows: the alliance titles). */
export function showTitles(show: Show): Title[] {
  if (show.promos?.length) return TITLES.filter((t) => t.id.startsWith('ARISE_'));
  const p = PROMOTIONS.find((x) => x.initials === show.promo);
  return p ? p.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t): t is Title => !!t && !t.id.startsWith('ARISE_')) : [];
}

const busyOn = (c: Career, day: Day): Set<string> => {
  const busy = new Set<string>();
  for (const s of Object.values(c.shows)) if (s.date === day && s.card) for (const b of s.card) { busy.add(b.a); busy.add(b.b); }
  return busy;
};

export function available(p: Person | undefined, day: Day): boolean {
  if (!p) return false;
  if (p.injury && p.injury.until > day) return false;
  return true;
}

/** How many dates someone's worked (or is booked for) in the month of `day`. */
function datesThisMonth(c: Career, id: string, day: Day): number {
  const m = day.slice(0, 7);
  let n = 0;
  for (const s of Object.values(c.shows)) if (s.date.startsWith(m) && s.card?.some((b) => b.a === id || b.b === id)) n++;
  return n;
}

/** Can the booker put the player on this promotion show? Respects their contract and indie dates. */
function playerBookable(c: Career, show: Show): boolean {
  const me = c.people[c.player];
  const w = findWrestler(c.player);
  if (!me || !w) return false;
  if (show.promo === 'TIS') return false; // indie dates only come from offers you accept
  if (!(show.promos ?? [show.promo]).includes(w.promotion)) return false;
  if (Object.keys(c.indie).some((id) => c.shows[id]?.date === show.date)) return false;
  const sched = me.contract?.clauses[6] ?? 0;
  if (sched >= 2 && datesThisMonth(c, c.player, show.date) >= SCHEDULE_T2_MAX_PER_MONTH) return false;
  if (me.daysOff?.includes(show.date)) return false;
  return true;
}

function weightedPick<T>(rnd: Rng, xs: T[], w: (x: T) => number): T | undefined {
  const total = xs.reduce((t, x) => t + Math.max(0, w(x)), 0);
  if (total <= 0) return xs[0];
  let r = rnd() * total;
  for (const x of xs) {
    r -= Math.max(0, w(x));
    if (r <= 0) return x;
  }
  return xs[xs.length - 1];
}

/** Top contenders for a title, best first. */
export function contenders(c: Career, title: Title, pool: Wrestler[], region: PopRegion, day: Day): Wrestler[] {
  const score = (w: Wrestler) => {
    const p = c.people[w.id]!;
    const form = (p.recent ?? []).reduce((a, b) => a + b, 0);
    let s = regionalPop(w, region) + form * 4;
    const tier = w.id === c.player ? p.contract?.clauses[5] ?? 0 : 0;
    if (tier >= 1) s += CONTENDER_T1_BONUS;
    if (p.contract?.titleShotBy) s += 100;
    return s;
  };
  const eligible = pool.filter((w) => w.id !== title.holder && w.gender === title.gender && !(c.people[w.id]?.titleBanUntil && c.people[w.id]!.titleBanUntil! > day));
  // Champions don't chase their promotion's other titles, unless there's nobody else.
  const unheld = eligible.filter((w) => !TITLES.some((t) => t.holder === w.id));
  return (unheld.length ? unheld : eligible).sort((a, b) => score(b) - score(a));
}

/** Keep each promotion's feuds going: a title feud for each title and a couple of others. */
export function refreshFeuds(c: Career, show: Show, roster: readonly Wrestler[]): void {
  if (show.promo === 'TIS' || show.promos) return;
  const promo = show.promo;
  const live = c.feuds.filter((f) => f.promo === promo && !f.done);
  const rnd = seededRng(hashSeed(c.seq, 'feuds', show.id));
  const pool = showRoster(show, roster).filter((w) => available(c.people[w.id], show.date));
  const busy = new Set(live.flatMap((f) => [f.a, f.b]));
  const region = promoRegion(promo);
  // A payoff show for a feud starting now: the next special or flagship far enough off, else any show.
  const upcoming = Object.values(c.shows).filter((s) => s.promo === promo && s.date > show.date).sort((a, b) => (a.date < b.date ? -1 : 1));
  const minDays = FEUD_WEEKS[0] * 7, maxDays = FEUD_WEEKS[1] * 7;
  const payoffFor = () =>
    upcoming.find((s) => (s.kind === 'special' || s.kind === 'flagship') && daysBetween(show.date, s.date) >= minDays && daysBetween(show.date, s.date) <= maxDays + 14)
    ?? upcoming.find((s) => daysBetween(show.date, s.date) >= minDays);
  for (const t of showTitles(show)) {
    if (!t.holder || live.some((f) => f.title === t.id)) continue;
    const champ = findWrestler(t.holder);
    if (!champ) continue;
    const top = contenders(c, t, pool, region, show.date).find((w) => !busy.has(w.id));
    const payoff = payoffFor();
    if (!top || !payoff) continue;
    c.feuds.push({ id: `f${++c.seq}`, promo, a: champ.id, b: top.id, start: show.date, payoff: payoff.id, title: t.id, matches: 0, done: false });
    busy.add(champ.id); busy.add(top.id);
  }
  let others = live.filter((f) => !f.title).length;
  const free = pool.filter((w) => !busy.has(w.id) && !TITLES.some((t) => t.holder === w.id)).sort((a, b) => regionalPop(b, region) - regionalPop(a, region));
  while (others < FEUDS_PER_PROMOTION && free.length >= 2) {
    const a = free.splice(Math.floor(rnd() * Math.min(free.length, 8)), 1)[0]!;
    const near = free.filter((w) => w.gender === a.gender).slice(0, 6);
    const b = near[Math.floor(rnd() * near.length)];
    const payoff = payoffFor();
    if (!b || !payoff) break;
    free.splice(free.indexOf(b), 1);
    c.feuds.push({ id: `f${++c.seq}`, promo, a: a.id, b: b.id, start: show.date, payoff: payoff.id, matches: 0, done: false });
    others++;
  }
}

/** Draw up a show's card. */
export function bookShow(c: Career, show: Show, roster: readonly Wrestler[]): Bout[] {
  const rnd = seededRng(hashSeed(c.seq, 'book', show.id));
  const busy = busyOn(c, show.date);
  const region = show.region;
  const indie = show.promo === 'TIS';
  refreshFeuds(c, show, roster);

  let pool = (indie ? roster.filter((w) => w.promotion === 'TIS') : showRoster(show, roster))
    .filter((w) => w.id !== c.player && !busy.has(w.id) && available(c.people[w.id], show.date));
  const card: Bout[] = [];
  const used = new Set<string>();
  const take = (id: string) => { used.add(id); };
  const free = (id: string) => !used.has(id);

  // You: on a promotion show if the booker wants you; on an indie show if you agreed to it.
  const me = findWrestler(c.player);
  const meFree = !busy.has(c.player) && available(c.people[c.player], show.date);
  const mineIndie = indie && !!c.indie[show.id];
  const tryout = !!c.tryouts?.[show.id];
  const wantMe = me && meFree && (mineIndie || tryout || (!indie && playerBookable(c, show) && rnd() < bookChance(me, show, roster)));

  const [lo, hi] = CARD_SIZE[show.kind];
  const size = lo + Math.floor(rnd() * (hi - lo + 1));

  // Title matches: a feud paying off tonight, or a defence if the title's due one.
  for (const t of showTitles(show)) {
    if (!t.holder) continue;
    const champ = findWrestler(t.holder);
    const ts = c.titles[t.id];
    const champHere = champ && (champ.id === c.player ? wantMe : pool.some((w) => w.id === champ.id)) && free(champ.id);
    if (!champ || !champHere) continue;
    const feud = c.feuds.find((f) => f.title === t.id && !f.done && f.payoff === show.id);
    const sinceLast = ts?.last ? daysBetween(ts.last, show.date) : 999;
    const owedShot = c.people[c.player]?.contract?.titleShotBy && me && me.gender === t.gender && me.id !== champ.id;
    let challenger: Wrestler | undefined;
    if (feud) challenger = findWrestler(feud.a === champ.id ? feud.b : feud.a);
    else if (sinceLast >= DEFENCE_GAP_DAYS && rnd() < DEFENCE_CHANCE[show.kind]) {
      const cands = contenders(c, t, [...pool, ...(wantMe && me ? [me] : [])], region, show.date).filter((w) => free(w.id));
      challenger = owedShot && wantMe ? me : cands[0];
    }
    if (!challenger || !free(challenger.id) || (challenger.id !== c.player && !pool.some((w) => w.id === challenger!.id))) continue;
    if (challenger.id === c.player && !wantMe) continue;
    take(champ.id); take(challenger.id);
    const planned = rnd() < PLANNED_RETAIN ? champ.id : challenger.id;
    card.push({ a: champ.id, b: challenger.id, title: t.id, planned, ...(feud ? { feud: feud.id } : {}) });
  }

  // Feuds on this promotion: their next match, if both are here.
  for (const f of c.feuds.filter((x) => x.promo === show.promo && !x.done && !x.title)) {
    if (card.length >= size) break;
    const here = (id: string) => free(id) && (id === c.player ? wantMe : pool.some((w) => w.id === id));
    if (!here(f.a) || !here(f.b)) continue;
    const payoff = f.payoff === show.id;
    if (!payoff && rnd() < 0.4) continue; // feuds don't wrestle every week; they build
    take(f.a); take(f.b);
    card.push({ a: f.a, b: f.b, feud: f.id, ...(payoff && show.kind !== 'weekly' && rnd() < 0.5 ? { stip: pickStip(rnd) } : {}) });
  }

  // You, if you're on and not in a match yet.
  if (wantMe && me && free(me.id)) {
    const opp = opponentFor(rnd, me, pool.filter((w) => free(w.id)), region, indie);
    if (opp) {
      take(me.id); take(opp.id);
      card.push({ a: opp.id, b: me.id, ...(tryout ? { tryout: true } : rnd() < STIP_CHANCE[show.kind] ? { stip: pickStip(rnd) } : {}) });
    }
  }

  // Everyone else: people of similar standing, mostly within a division.
  pool = pool.filter((w) => free(w.id)).sort((a, b) => regionalPop(b, region) - regionalPop(a, region));
  while (card.length < size && pool.length >= 2) {
    const a = weightedPick(rnd, pool, (w) => 1 + regionalPop(w, region) / 10 - (c.people[w.id]?.fatigue ?? 0) / 25)!;
    pool.splice(pool.indexOf(a), 1);
    const b = opponentFor(rnd, a, pool, region, indie);
    if (!b) continue;
    pool.splice(pool.indexOf(b), 1);
    card.push({ a: a.id, b: b.id, ...(rnd() < STIP_CHANCE[show.kind] ? { stip: pickStip(rnd) } : {}) });
  }

  // Running order: the biggest match last (a world title if there is one), the smallest first.
  const weight = (b: Bout) => {
    const wa = findWrestler(b.a), wb = findWrestler(b.b);
    const pop = ((wa ? regionalPop(wa, region) : 0) + (wb ? regionalPop(wb, region) : 0)) / 2;
    const titleRank = b.title ? (showTitles(show).findIndex((t) => t.id === b.title) === 0 ? 300 : 150) : 0;
    return pop + titleRank + (b.feud ? 20 : 0);
  };
  return card.sort((x, y) => weight(x) - weight(y));
}

function pickStip(rnd: Rng): StipulationId {
  return weightedPick(rnd, STIPS, (s) => s[1])![0];
}

function opponentFor(rnd: Rng, a: Wrestler, pool: Wrestler[], region: PopRegion, indie: boolean): Wrestler | undefined {
  const mixed = rnd() < (indie ? INTERGENDER_CHANCE_INDIE : INTERGENDER_CHANCE);
  const same = pool.filter((w) => mixed || w.gender === a.gender);
  const pa = regionalPop(a, region);
  const near = [...same].sort((x, y) => Math.abs(regionalPop(x, region) - pa) - Math.abs(regionalPop(y, region) - pa)).slice(0, 5);
  return near[Math.floor(rnd() * near.length)];
}

/** How likely the booker is to use you on a given show: busier for bigger names. */
function bookChance(me: Wrestler, show: Show, roster: readonly Wrestler[]): number {
  const here = showRoster(show, roster);
  const mine = regionalPop(me, show.region);
  const better = here.filter((w) => regionalPop(w, show.region) > mine).length;
  const share = 1 - better / Math.max(1, here.length);
  return Math.min(0.95, 0.45 + share * 0.5);
}

/** Draw up cards for every show from `from` up to `days` ahead that hasn't got one. */
export function bookAhead(c: Career, from: Day, days: number, roster: readonly Wrestler[]): void {
  const until = addDays(from, days);
  const shows = Object.values(c.shows).filter((s) => !s.card && !s.done && s.date >= from && s.date <= until).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'indie' ? 1 : -1));
  for (const s of shows) s.card = bookShow(c, s, roster);
}

export type { Feud };
