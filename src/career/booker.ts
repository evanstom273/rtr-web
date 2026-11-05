// The AI bookers: who wrestles on each card, title defences, feuds and planned finishes.
import { booked, fitsTrip } from './availability';
import { boutPeople } from './bouts';
import { changeLean, contenderBias, stipMult, titleBooker } from './bookerLeans';
import { contenderLean } from './leans';
import { fanScore, findWrestler, PROMOTIONS, type Title, TITLES, type Wrestler, worksFor } from '../data/rtr';
import { tierOf } from './clauses';
import { dealWith, sideWork } from './deals';
import type { StipulationId } from '../engine/types';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { addDays, daysBetween, type Day } from './dates';
import { NEIGHBOURS, REGION_KEY } from './places';
import { activeWorld } from '../world/world';
import { likeOf } from '../world/people';
import {
  CARD_SIZE, CAUGHT_BOOK_MULT, CIRCUIT_DAYS, CONTENDER_T1_BONUS, FEATURES, FEUD_WEEKS, FEUDS_PER_PROMOTION, INDIE_CHAMP_DRAW, INDIE_DEFENCE_CHANCE, INDIE_DEFENCE_OVERDUE, INDIE_PICK_BOND_WEIGHT, INDIE_PICK_REP_WEIGHT, INDIE_REGION_WEIGHT, INDIE_TITLE_BOUTS_MAX, INTERGENDER_CHANCE, INTERGENDER_CHANCE_INDIE, PLEDGE_LOG_MAX, REGIONAL_CONTENDER_PER_DATE, REGIONAL_DEFENCE_CHANCE, REGIONAL_DEFENCE_OVERDUE, REGIONAL_ELIGIBLE_DATES, REGIONAL_HOME_DAYS, REGIONAL_WINDOW_DAYS, SCHEDULE_T2_MAX_PER_MONTH, STIP_CHANCE, REIGN_PROTECT_DAYS, TITLE_CHANGE_MAX, TITLE_CHANGE_PER_REIGN_YEAR, TITLE_PLANNED_CHANGE, TITLE_RHYTHM, type TitleClass, TRUST_HIGH, TRUST_LOW, TRUST_RETAIN_SWING_HIGH, TRUST_RETAIN_SWING_LOW,
} from './tuning';
import type { Bout, Career, Feud, Person, Pledge, PopRegion, Show } from './types';
import { BRACKET, tourneyOf, tourneyPairs } from './tourney';
import { showBooker } from './patience';
import { trust } from './relations';

/** Stipulations a booker reaches for, roughly how often. Hardcore ones tire people more. */
const STIPS: [StipulationId, number][] = [
  ['no_dq', 5], ['falls_count_anywhere', 3], ['tables', 3], ['ladder', 2], ['steel_cage', 2], ['last_man_standing', 2],
  ['submission', 2], ['two_out_of_three', 2], ['i_quit', 1], ['iron_man', 1],
];
export const HARDCORE_STIPS = new Set<StipulationId>(['no_dq', 'falls_count_anywhere', 'tables', 'ladder', 'steel_cage', 'last_man_standing', 'i_quit']);

export { hashSeed };

export const promoRegion = (initials: string): PopRegion => REGION_KEY[PROMOTIONS.find((p) => p.initials === initials)?.region ?? ''] ?? 'europe';
/** Someone's draw in a region on the old 0–100 scale (from their fans there): what the booking formulas weigh. */
export const regionalPop = (w: Wrestler, r: PopRegion): number => fanScore(w, r);

/** Everyone who works for a show's promotion(s) right now (a non-exclusive star is on every major they're signed to). */
export function showRoster(show: Show, roster: readonly Wrestler[]): Wrestler[] {
  const promos = show.promos ?? [show.promo];
  return roster.filter((w) => promos.some((p) => worksFor(w, p)));
}

/** A regional title's region, as a popularity key (undefined for every other title). */
export const titleRegion = (t: Pick<Title, 'region'> | undefined): PopRegion | undefined => (t?.region ? REGION_KEY[t.region] : undefined);

/** Titles defended on a show: the promotion's own (joint shows: the alliance titles; indie shows: regional titles only in their region). */
export function showTitles(show: Show): Title[] {
  if (show.special?.noTitles) return [];
  if (show.promos?.length) return TITLES.filter((t) => t.id.startsWith('ARISE_'));
  const p = PROMOTIONS.find((x) => x.initials === show.promo);
  return p ? p.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t): t is Title => !!t && !t.id.startsWith('ARISE_') && (!t.region || titleRegion(t) === show.region)) : [];
}

/** Dates someone's worked in a region lately (their circuit). */
export function regionalDates(c: Career, id: string, region: PopRegion, day: Day): number {
  return (c.people[id]?.circuit ?? []).filter((x) => x.r === region && x.d <= day && daysBetween(x.d, day) <= REGIONAL_WINDOW_DAYS).length;
}

/**
 * Can someone challenge for a regional title? Lyra's call: by where they've been wrestling, not where
 * they're from. Someone with hardly any recent record (a new world, back from injury) is judged by home.
 */
export function regionalEligible(c: Career, w: Wrestler, region: PopRegion, day: Day): boolean {
  if (regionalDates(c, w.id, region, day) >= REGIONAL_ELIGIBLE_DATES) return true;
  const recent = (c.people[w.id]?.circuit ?? []).filter((x) => x.d <= day && daysBetween(x.d, day) <= REGIONAL_WINDOW_DAYS).length;
  return recent < REGIONAL_ELIGIBLE_DATES && REGION_KEY[w.region] === region;
}

const busyOn = (c: Career, day: Day): Set<string> => {
  const busy = new Set<string>();
  for (const s of Object.values(c.shows)) if (s.date === day && s.card) for (const b of s.card) for (const id of boutPeople(b)) busy.add(id);
  return busy;
};

export function available(p: Person | undefined, day: Day): boolean {
  if (!p || p.retired) return false;
  // Retiring: nothing after the farewell (cards are drawn a week ahead of it).
  if (p.retiring && day > p.retiring) return false;
  if (p.injury && p.injury.until > day) return false;
  // Booker mode: suspended (by you, as their booker).
  if (p.suspendedUntil && p.suspendedUntil > day) return false;
  return true;
}

/** How many dates someone's worked (or is booked for) in the month of `day`: anywhere, or for one promotion. */
export function datesThisMonth(c: Career, id: string, day: Day, promo?: string): number {
  const m = day.slice(0, 7);
  let n = 0;
  for (const s of Object.values(c.shows)) if (s.date.startsWith(m) && (!promo || (s.promos ?? [s.promo]).includes(promo)) && s.card?.some((b) => b.a === id || b.b === id)) n++;
  return n;
}

/**
 * Agreed dates (part-timers, special attractions, and anyone on more than one major): the dates a month
 * each promotion has with them. Counted once per show being drawn up, for just the people who have a cap.
 */
function capped(c: Career, show: Show, pool: readonly Wrestler[]): Set<string> {
  const out = new Set<string>();
  const promos = show.promos ?? [show.promo];
  const caps = new Map<string, number>();
  for (const w of pool) {
    const k = promos.map((p) => dealWith(c.people[w.id], p)).find(Boolean);
    if (k?.dates) caps.set(w.id, k.dates);
  }
  if (!caps.size) return out;
  const m = show.date.slice(0, 7);
  const n = new Map<string, number>();
  for (const s of Object.values(c.shows)) {
    if (s.id === show.id || !s.card || !s.date.startsWith(m) || !(s.promos ?? [s.promo]).some((p) => promos.includes(p))) continue;
    for (const b of s.card) for (const id of boutPeople(b)) if (caps.has(id)) n.set(id, (n.get(id) ?? 0) + 1);
  }
  for (const [id, cap] of caps) if ((n.get(id) ?? 0) >= cap) out.add(id);
  return out;
}

/** Wrestlers on a card the day before or after on another continent. */
function farAway(c: Career, show: Show): Set<string> {
  const out = new Set<string>();
  const near = [addDays(show.date, -1), addDays(show.date, 1)];
  for (const s of Object.values(c.shows)) {
    if (!near.includes(s.date) || !s.card || s.region === show.region) continue;
    for (const b of s.card) for (const id of boutPeople(b)) out.add(id);
  }
  return out;
}

/** Can the booker put the player on this promotion show? Respects their contract and indie dates. */
export function playerBookable(c: Career, show: Show): boolean {
  const me = c.people[c.player];
  const w = findWrestler(c.player);
  if (!me || !w) return false;
  if (show.promo === 'TIS') return false; // indie dates only come from offers you accept
  const promos = show.promos ?? [show.promo];
  if (!promos.some((p) => worksFor(w, p))) return false;
  if (Object.keys(c.indie).some((id) => c.shows[id]?.date === show.date)) return false;
  // Agreed dates (a part-time deal, or the split between your majors): no more than that a month with them.
  const k = promos.map((p) => dealWith(me, p)).find(Boolean) ?? me.contract;
  if (k?.dates && datesThisMonth(c, c.player, show.date, k.promo) >= k.dates) return false;
  const sched = tierOf(k, 'schedule');
  if (sched >= 2 && datesThisMonth(c, c.player, show.date) >= SCHEDULE_T2_MAX_PER_MONTH) return false;
  if (me.daysOff?.includes(show.date)) return false;
  // The whole trip has to fit (days on): travel there and back around everything else.
  if (!fitsTrip(c, show).ok) return false;
  // Clauses with a say (International Touring's opt-in, a suspension).
  if (bookableHooks.some((f) => !f(c, show))) return false;
  return true;
}
/** Clauses that can keep you off a show (set by body.ts and conduct.ts). */
let bookableHooks: ((c: Career, show: Show) => boolean)[] = [];
export const setBookableHook = (f: (c: Career, show: Show) => boolean): void => { bookableHooks = [...bookableHooks, f]; };
/** Clauses that make the booker want you (Booking Commitments' dates; set by shape.ts). */
let promiseHooks: ((c: Career, show: Show) => boolean)[] = [];
export const setPromiseHook = (f: (c: Career, show: Show) => boolean): void => { promiseHooks = [...promiseHooks, f]; };

/**
 * How likely an indie wrestler is to be around for a show in `region`: at home, in a region they've
 * worked lately, next door, or anywhere else. Never zero: anyone can turn up anywhere now and then.
 */
export function regionFactor(c: Career, w: Wrestler, region: PopRegion, day: Day): number {
  const home = REGION_KEY[w.region] ?? 'europe';
  if (home === region) return INDIE_REGION_WEIGHT.home;
  if (c.people[w.id]?.circuit?.some((x) => x.r === region && daysBetween(x.d, day) <= CIRCUIT_DAYS)) return INDIE_REGION_WEIGHT.circuit;
  if (NEIGHBOURS[home].includes(region)) return INDIE_REGION_WEIGHT.neighbour;
  return INDIE_REGION_WEIGHT.elsewhere;
}

/**
 * Who's around for an indie show tonight: each indie by how near they are; champions travel more. An
 * indie champion who signed with a promotion that allows indie dates still defends on the indies.
 * Someone the promoter has promised you tonight (a champion, a challenge) is flown in.
 */
function indiePool(c: Career, show: Show, roster: readonly Wrestler[], rnd: Rng, promised: ReadonlySet<string>): Wrestler[] {
  const champs = new Set(TITLES.filter((t) => isIndieTitle(t.id) && t.holder).map((t) => t.holder!));
  const indie = (w: Wrestler) => w.promotion === 'TIS' || (champs.has(w.id) && sideWork(c.people[w.id]).rule !== 'banned');
  return roster.filter((w) => w.id !== c.player && indie(w) && (rnd() < Math.min(1, regionFactor(c, w, show.region, show.date) * (champs.has(w.id) ? INDIE_CHAMP_DRAW : 1)) || promised.has(w.id)));
}

/**
 * An indie promoter filling a spot: popularity first, then reputation and how they feel about the
 * wrestler, less if they're worn out. Nobody's quota is guaranteed (Lyra's call): some struggle for dates.
 */
export function indieWeight(c: Career, w: Wrestler, show: Show, promoter: string): number {
  const p = c.people[w.id];
  const rep = 1 + (((p?.rep ?? 50) - 50) / 50) * INDIE_PICK_REP_WEIGHT;
  const P = activeWorld().people;
  const bond = P ? 1 + (likeOf(P, promoter, w.id) / 100) * INDIE_PICK_BOND_WEIGHT : 1;
  const tired = Math.max(0.2, 1 - (p?.fatigue ?? 0) / 100);
  return Math.max(0.01, (1 + regionalPop(w, show.region) / 10) * rep * bond * tired);
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

/**
 * A title's class sets its rhythm and stability: a promotion's first title is its world title, the
 * rest secondary; the Indie Scene's are indie; A.R.I.S.E.'s are the alliance's (joint shows only).
 */
export function titleClass(id: string): TitleClass {
  if (id.startsWith('ARISE_')) return 'alliance';
  const p = PROMOTIONS.find((x) => x.titles.includes(id));
  if (p?.initials === 'TIS') return TITLES.find((t) => t.id === id)?.region ? 'regional' : 'indie';
  return p?.titles[0] === id ? 'world' : 'secondary';
}
export const titleMinGap = (id: string): number => TITLE_RHYTHM[titleClass(id)].minGap;

/** The booker's chance of planning the champion to retain this defence: by class, less likely the longer the reign. */
export function planRetain(c: Career, titleId: string, day: Day): number {
  const ts = c.titles[titleId];
  const years = ts?.since ? Math.max(0, daysBetween(ts.since, day)) / 365 : 0;
  return 1 - Math.min(TITLE_CHANGE_MAX, TITLE_PLANNED_CHANGE[titleClass(titleId)] + years * TITLE_CHANGE_PER_REIGN_YEAR);
}

/**
 * Planned retention when you're in it: a promoter who doesn't trust you would rather the belt went off
 * you (or not onto you); one who trusts you leans the other way.
 */
export function planRetainWith(c: Career, titleId: string, show: Show, champ: string, challenger: string): number {
  // The booker's personality: the rebellious and the unpredictable plan more changes.
  let r = planRetain(c, titleId, show.date) - changeLean(showBooker(show));
  if (champ !== c.player && challenger !== c.player) return r;
  // Championship Opportunities (Tier 2+): a new champion can't lose it too soon.
  if (champ === c.player) {
    const k = (show.promos ?? [show.promo]).map((x) => dealWith(c.people[c.player], x)).find(Boolean);
    const since = c.titles[titleId]?.since;
    if (k && since && daysBetween(since, show.date) < (REIGN_PROTECT_DAYS[tierOf(k, 'title')] ?? 0)) return 0.98;
  }
  const t = trust(c, showBooker(show));
  const swing = t < TRUST_LOW ? TRUST_RETAIN_SWING_LOW : t >= TRUST_HIGH ? -TRUST_RETAIN_SWING_HIGH : 0;
  r += champ === c.player ? -swing : swing;
  return Math.max(0.05, Math.min(0.98, r));
}

/** Average days between a promotion's shows around a date (monthly promotions defend at most shows; weekly ones spread it). */
function promoSpacing(c: Career, show: Show): number {
  const from = addDays(show.date, -30), to = addDays(show.date, 30);
  const n = Object.values(c.shows).filter((s) => s.date >= from && s.date <= to && s.promo !== 'TIS' && (s.promos ?? [s.promo]).some((x) => (show.promos ?? [show.promo]).includes(x))).length;
  return 61 / Math.max(1, n);
}

/** The Indie Scene's titles: the three worldwide ones and the twelve regional ones. */
export const isIndieTitle = (id: string): boolean => !!PROMOTIONS.find((p) => p.initials === 'TIS')?.titles.includes(id);

/** Top contenders for a title, best first. */
export function contenders(c: Career, title: Title, pool: Wrestler[], region: PopRegion, day: Day): Wrestler[] {
  const home = titleRegion(title);
  // The booker's thumb on the scale: politicians favour their friends, mentors the young, the loyal those who stay.
  const booker = titleBooker(title.id);
  const score = (w: Wrestler) => {
    const p = c.people[w.id];
    const form = (p?.recent ?? []).reduce((a, b) => a + b, 0);
    let s = regionalPop(w, home ?? region) + form * 4 + (home ? regionalDates(c, w.id, home, day) * REGIONAL_CONTENDER_PER_DATE : 0) + (w.id === c.player ? 0 : contenderLean(w)) + contenderBias(c, booker, w);
    const tier = w.id === c.player ? tierOf(p?.contract, 'title') : 0;
    if (tier >= 1) s += CONTENDER_T1_BONUS;
    if (p?.contract?.titleShotBy) s += 100;
    return s;
  };
  const open = pool.filter((w) => w.id !== title.holder && w.gender === title.gender && !(c.people[w.id]?.titleBanUntil && c.people[w.id]!.titleBanUntil! > day));
  let eligible = open.filter((w) => !home || regionalEligible(c, w, home, day));
  // A thin regional division: when nobody here tonight has worked the region enough, someone from the
  // region can still challenge (so a champion isn't left without a defence for months).
  if (home && !eligible.length) eligible = open.filter((w) => REGION_KEY[w.region] === home);
  // Champions don't chase other titles, unless there's nobody else. An indie title doesn't count
  // against a promotion's titles: you can hold one of each.
  // Working for more than one major (Lyra's call: anyone's titles), a champion elsewhere can still chase this one.
  const indie = isIndieTitle(title.id);
  const owner = PROMOTIONS.find((p) => p.titles.includes(title.id));
  const unheld = eligible.filter((w) => !TITLES.some((t) => t.holder === w.id && (indie || (!isIndieTitle(t.id) && (!owner || owner.titles.includes(t.id))))));
  return (unheld.length ? unheld : eligible).sort((a, b) => score(b) - score(a));
}

/** Keep each promotion's feuds going: a title feud for each title and a couple of others. */
export function refreshFeuds(c: Career, show: Show, roster: readonly Wrestler[]): void {
  if (show.promo === 'TIS' || show.promos) return;
  // Booker mode: on a promotion you book, the storylines are yours to write (your staff book around them).
  if (activeWorld().companies?.[show.promo]?.booker === 'player') return;
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
    if (!t.holder || live.some((f) => f.title === t.id) || c.pledges?.some((p) => p.kind === 'title' && p.title === t.id)) continue;
    // Title feuds build to world-title defences; secondary titles get regular defences against varied
    // challengers. A feud starts only when its payoff would land about when the title's next due.
    if (titleClass(t.id) !== 'world') continue;
    const ts = c.titles[t.id];
    const since = ts?.last ?? ts?.since;
    if (since && daysBetween(since, show.date) < TITLE_RHYTHM.world.target - FEUD_WEEKS[1] * 7) continue;
    const champ = findWrestler(t.holder);
    if (!champ) continue;
    const top = contenders(c, t, pool, region, show.date).find((w) => !busy.has(w.id) && !(w.id === c.player && heated(c, show)));
    const payoff = payoffFor();
    if (!top || !payoff) continue;
    c.feuds.push({ id: `f${++c.seq}`, promo, a: champ.id, b: top.id, start: show.date, payoff: payoff.id, title: t.id, matches: 0, done: false });
    busy.add(champ.id); busy.add(top.id);
  }
  let others = live.filter((f) => !f.title).length;
  const free = pool.filter((w) => !busy.has(w.id) && !TITLES.some((t) => t.holder === w.id)).sort((a, b) => regionalPop(b, region) - regionalPop(a, region));
  // Angles from real life (relationships stage 6): real heat between two on the roster becomes the storyline.
  if (others < FEUDS_PER_PROMOTION && free.length >= 2) {
    const pair = heatPick(c, free.map((w) => w.id), rnd);
    const payoff = pair && payoffFor();
    if (pair && payoff) {
      for (const id of pair) free.splice(free.findIndex((w) => w.id === id), 1);
      c.feuds.push({ id: `f${++c.seq}`, promo, a: pair[0], b: pair[1], start: show.date, payoff: payoff.id, matches: 0, done: false, real: true });
      angleNews(c, promo, pair);
      others++;
    }
  }
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

/** A title already on another unplayed card (titles are only ever on one at a time). */
export function titlePending(c: Career, titleId: string, show: Show): boolean {
  return Object.values(c.shows).some((s) => s.id !== show.id && s.card?.some((b) => b.title === titleId && !b.result));
}

/** Days since a title was last defended or won, counting defences already booked on cards ahead. */
export function sinceLastDefence(c: Career, titleId: string, show: Show): number {
  const ts = c.titles[titleId];
  let lastOrWon = ts?.last ?? ts?.since;
  for (const s of Object.values(c.shows)) {
    if (s.id !== show.id && s.card?.some((b) => b.title === titleId) && (!lastOrWon || s.date > lastOrWon)) lastOrWon = s.date;
  }
  return lastOrWon ? Math.abs(daysBetween(lastOrWon, show.date)) : 999;
}

/** A card's been drawn up: clauses that shape it (Creative Control's protected stars) run here. Set by creative.ts. */
let cardHooks: ((c: Career, show: Show, card: Bout[]) => void)[] = [];
/** `first`: runs before the others (the match overhaul's style booking reshapes the card before clauses look at it). */
export const setCardHook = (f: (c: Career, show: Show, card: Bout[]) => void, first = false): void => { cardHooks = first ? [f, ...cardHooks] : [...cardHooks, f]; };

/** Indie promises that can't happen roll on to the promoter's next show: set by requests.ts. */
let rollIndie: ((c: Career, p: Pledge, show: Show) => boolean) | null = null;
export const setIndieRoll = (f: (c: Career, p: Pledge, show: Show) => boolean): void => { rollIndie = f; };

/** Requests: a pledge is used up (or moved on to the next suitable show). */
export function pledgeDone(c: Career, p: Pledge, then: string, status: 'kept' | 'lapsed' | 'refused' = then.startsWith('Booked') ? 'kept' : 'lapsed', by?: string): void {
  c.pledges = (c.pledges ?? []).filter((x) => x !== p);
  const a = c.asks?.find((x) => x.id === p.ask);
  if (a) a.then = then;
  // Every promise stays on record with how it ended.
  (c.pledgeLog ??= []).unshift({ ...p, status, settled: c.today, then, ...(by ? { settledBy: by } : {}) });
  if (c.pledgeLog.length > PLEDGE_LOG_MAX) c.pledgeLog.length = PLEDGE_LOG_MAX;
}
function pledgeLater(c: Career, p: Pledge, show: Show): void {
  // An indie promoter's promise rolls on to their next show, if you can make it (requests.ts knows indie dates).
  if (show.promo === 'TIS') {
    if (!rollIndie?.(c, p, show)) pledgeDone(c, p, `It couldn’t happen on ${show.name}, and there’s no later date of theirs you can make.`);
    return;
  }
  delete p.show;
  p.from = addDays(show.date, 1);
}

/** Caught talking to another promotion: your own holds it against you for a while. */
export const heated = (c: Career, show: Show): boolean => !!c.heat && (show.promos ?? [show.promo]).includes(c.heat.promo) && show.date < c.heat.until;

/** Draw up a show's card. */
export function bookShow(c: Career, show: Show, roster: readonly Wrestler[]): Bout[] {
  const rnd = seededRng(hashSeed(c.seq, 'book', show.id));
  const busy = busyOn(c, show.date);
  const region = show.region;
  const indie = show.promo === 'TIS';
  refreshFeuds(c, show, roster);
  const pledges = c.pledges ?? [];
  // Wrestlers promised to a match on another show that night (a challenge on an indie show) stay free for it.
  // Wrestlers promised to a match on another show that night (a challenge on an indie show, or a champion
  // whose title an indie promoter has promised you) stay free for it.
  const reserved = new Set(pledges.filter((p) => p.show && p.show !== show.id && c.shows[p.show]?.date === show.date)
    .map((p) => (p.kind === 'match' ? p.opp : p.kind === 'title' ? TITLES.find((t) => t.id === p.title)?.holder : undefined)).filter((x): x is string => !!x));

  const promisedHere = new Set(pledges.filter((p) => p.show === show.id)
    .map((p) => (p.kind === 'match' ? p.opp : p.kind === 'title' ? TITLES.find((t) => t.id === p.title)?.holder : undefined)).filter((x): x is string => !!x));
  // Days on: nobody works two continents on consecutive days (the travel takes the day between).
  const away = FEATURES.days ? farAway(c, show) : null;
  // ...so a regional champion whose belt is overdue isn't flown to indie shows abroad: they stay free for home.
  if (away && indie) for (const t of TITLES) if (t.holder && t.region && titleRegion(t) !== show.region && sinceLastDefence(c, t.id, show) >= REGIONAL_HOME_DAYS) away.add(t.holder);
  let pool = (indie ? indiePool(c, show, roster, rnd, promisedHere) : [...showRoster(show, roster), ...(extraPool?.(c, show, roster, rnd) ?? [])])
    .filter((w) => w.id !== c.player && !busy.has(w.id) && !reserved.has(w.id) && !away?.has(w.id) && available(c.people[w.id], show.date));
  // Agreed dates used up this month (part-timers, special attractions, stars split between majors).
  if (!indie) { const full = capped(c, show, pool); if (full.size) pool = pool.filter((w) => !full.has(w.id) || promisedHere.has(w.id)); }
  const card: Bout[] = [];
  const used = new Set<string>();
  const take = (id: string) => { used.add(id); };
  const free = (id: string) => !used.has(id);

  // You: on a promotion show if the booker wants you (or promised you); on an indie show if you agreed to it.
  const me = findWrestler(c.player);
  const meFree = !busy.has(c.player) && available(c.people[c.player], show.date);
  const mineIndie = indie && !!c.indie[show.id];
  const tryout = !!c.tryouts?.[show.id];
  const hot = heated(c, show);
  const titles = showTitles(show);
  // An unpredictable booker reaches for stipulations more.
  const stips = stipMult(showBooker(show));
  const shotHere = (p: Pledge) => p.kind === 'title' && !hot && titles.some((t) => t.id === p.title) && !titlePending(c, p.title!, show)
    && (p.show === show.id || (!p.show && !!p.from && show.date >= p.from && sinceLastDefence(c, p.title!, show) >= titleMinGap(p.title!) && !c.feuds.some((f) => f.title === p.title && !f.done)));
  const matchPledge = pledges.find((p) => p.kind === 'match' && (p.show === show.id || (!p.show && !!p.from && show.date >= p.from && (show.promos ?? [show.promo]).includes(p.promo))));
  const datesPledge = pledges.find((p) => p.kind === 'dates' && (show.promos ?? [show.promo]).includes(p.promo) && show.date.startsWith(p.month!));
  const promised = pledges.some((p) => (p.kind === 'show' && p.show === show.id) || shotHere(p)) || !!matchPledge
    || (!!datesPledge && datesThisMonth(c, c.player, show.date) < (datesPledge.min ?? 0)) || (!indie && promiseHooks.some((f) => f(c, show)));
  const wantMe = me && meFree && (mineIndie || tryout
    || (!indie && playerBookable(c, show) && (promised || rnd() < bookChance(me, show, roster) * (hot ? CAUGHT_BOOK_MULT : 1))));
  for (const p of pledges.filter((x) => x.kind === 'show' && x.show === show.id)) pledgeDone(c, p, wantMe ? `Booked on ${show.name}.` : `Couldn’t be booked on ${show.name}.`);

  const [lo, hi] = CARD_SIZE[show.kind];
  const size = lo + Math.floor(rnd() * (hi - lo + 1));

  // A cup night: the round's matches go on first. Someone who can't make it hands their opponent a walkover.
  const cup = tourneyOf(c, show.special?.tourney);
  if (cup && show.special?.round !== undefined) {
    const r = show.special.round;
    if (r === 0 && !cup.entrants.length) {
      const field = pool.filter((w) => free(w.id) && (!cup.gender || w.gender === cup.gender)).sort((a, b) => regionalPop(b, region) - regionalPop(a, region));
      const seeds = [...(cup.player && wantMe && me && free(me.id) ? [me] : []), ...field].slice(0, 8)
        .sort((a, b) => regionalPop(b, region) - regionalPop(a, region));
      cup.entrants = BRACKET.map((i) => seeds[i]?.id ?? '');
    }
    const here = (id: string | null) => !!id && free(id) && (id === c.player ? !!wantMe : pool.some((w) => w.id === id));
    const won = (cup.won[r] ??= []);
    tourneyPairs(cup, r).forEach(([x, y], slot) => {
      if (won[slot]) return;
      if (here(x) && here(y)) {
        take(x!); take(y!);
        card.push({ a: x!, b: y!, tourney: { id: cup.id, round: r, slot } });
        return;
      }
      won[slot] = here(x) ? x : here(y) ? y : x || y || null;
    });
  }

  // A farewell: the retiring wrestler's last match, against the best opponent here (or you, if they asked for you).
  const fw = show.special?.kind === 'farewell' ? findWrestler(show.special.for ?? '') : undefined;
  // It's their night wherever they're signed: the retiring wrestler is here if they're fit and free.
  if (fw && free(fw.id) && !busy.has(fw.id) && !reserved.has(fw.id) && available(c.people[fw.id], show.date)) {
    const asked = pledges.find((p) => p.kind === 'match' && p.show === show.id && p.opp === fw.id);
    let opp: Wrestler | undefined;
    if (asked && wantMe && me && free(me.id)) {
      opp = me;
      pledgeDone(c, asked, `Booked: ${fw.name}’s farewell, against you.`);
    } else {
      const cands = [...pool.filter((w) => w.id !== fw.id && free(w.id) && w.gender === fw.gender), ...(wantMe && me && free(me.id) && me.gender === fw.gender && !hot ? [me] : [])];
      opp = cands.sort((a, b) => regionalPop(b, region) - regionalPop(a, region))[0];
    }
    if (opp) {
      take(fw.id); take(opp.id);
      card.push({ a: opp.id, b: fw.id, farewell: true });
    }
  }

  // Title matches: a promised shot, a feud paying off tonight, or a defence if the title's due one.
  // An indie card has room for two at most (one on a short card): promised shots first, then the most overdue.
  const titleCap = indie ? (size <= 4 ? 1 : INDIE_TITLE_BOUTS_MAX) : Infinity;
  const titleBouts = () => card.filter((b) => b.title).length;
  const ordered = indie ? [...titles].sort((x, y) => Number(!pledges.some((p) => p.title === y.id)) - Number(!pledges.some((p) => p.title === x.id))
    || sinceLastDefence(c, y.id, show) - sinceLastDefence(c, x.id, show)) : titles;
  for (const t of ordered) {
    if (titleBouts() >= titleCap) break;
    // Tag and trios titles are booked team against team (the match overhaul's style booking).
    if (t.kind === 'tag' || t.kind === 'trios') continue;
    if (!t.holder) {
      // Vacant (its champion signed away without Indie Bookings): the top two contenders wrestle for it.
      if (titlePending(c, t.id, show)) continue;
      const [x, y] = contenders(c, t, [...pool, ...(wantMe && me && !hot ? [me] : [])], region, show.date).filter((w) => free(w.id));
      if (x && y) {
        take(x.id); take(y.id);
        card.push({ a: x.id, b: y.id, title: t.id });
      }
      continue;
    }
    const champ = findWrestler(t.holder);
    const pledge = pledges.find((p) => p.kind === 'title' && p.title === t.id);
    const champHere = champ && (champ.id === c.player ? wantMe : pool.some((w) => w.id === champ.id)) && free(champ.id);
    if (pledge && champ?.id === c.player) pledgeDone(c, pledge, 'You won the title another way.');
    if (!champ || !champHere) { if (pledge?.show === show.id) pledgeLater(c, pledge, show); continue; }
    const feud = c.feuds.find((f) => f.title === t.id && !f.done && f.payoff === show.id);
    // A title is only ever on one unplayed card. Cards are drawn a week out, so a second one could
    // end up with a former champion in it once the first has been wrestled.
    if (titlePending(c, t.id, show)) {
      // A feud paying off tonight still gets its match, just without the belt on the line.
      const other = feud ? findWrestler(feud.a === champ.id ? feud.b : feud.a) : undefined;
      if (feud && other && free(other.id) && (other.id === c.player ? wantMe : pool.some((w) => w.id === other.id))) {
        take(champ.id); take(other.id);
        card.push({ a: champ.id, b: other.id, feud: feud.id });
      }
      if (pledge?.show === show.id) pledgeLater(c, pledge, show);
      continue;
    }
    // A defence a promoter arranged with you, the champion (career events).
    const defence = pledges.find((p) => p.kind === 'defence' && p.title === t.id && p.show === show.id);
    if (defence) {
      const named = defence.opp ? findWrestler(defence.opp) : undefined;
      const opp = named && free(named.id) && pool.some((w) => w.id === named.id) ? named
        : contenders(c, t, pool, region, show.date).find((w) => free(w.id));
      if (champ.id === c.player && wantMe && me && free(me.id) && opp) {
        take(me.id); take(opp.id);
        card.push({ a: me.id, b: opp.id, title: t.id, planned: rnd() < planRetainWith(c, t.id, show, me.id, opp.id) ? me.id : opp.id });
        pledgeDone(c, defence, `Booked: defending the ${t.name} against ${opp.name} on ${show.name}.`);
        continue;
      }
      pledgeDone(c, defence, `The defence on ${show.name} couldn’t happen.`);
    }
    // A shot the booker promised you (Requests).
    if (pledge && me && champ.id !== me.id) {
      if (shotHere(pledge) && wantMe && free(me.id) && !feud) {
        take(champ.id); take(me.id);
        card.push({ a: champ.id, b: me.id, title: t.id, planned: rnd() < planRetainWith(c, t.id, show, champ.id, me.id) ? champ.id : me.id });
        pledgeDone(c, pledge, `Booked: ${show.name}, ${champ.name} for the ${t.name}.`);
        continue;
      }
      if (pledge.show === show.id) pledgeLater(c, pledge, show);
    }
    const sinceLast = sinceLastDefence(c, t.id, show);
    const feudLive = c.feuds.some((f) => f.title === t.id && !f.done);
    // A shot your contract guarantees (Championship Opportunities), or a rematch you're owed for this title.
    const myDeal = (show.promos ?? [show.promo]).map((x) => dealWith(c.people[c.player], x)).find(Boolean);
    const owedShot = (!!myDeal?.titleShotBy || myDeal?.rematch?.title === t.id) && me && me.gender === t.gender && me.id !== champ.id;
    let challenger: Wrestler | undefined;
    if (feud) challenger = findWrestler(feud.a === champ.id ? feud.b : feud.a);
    // Otherwise a defence when it's due, unless a title feud is already building to one (or you've been promised it).
    // Joint shows (A.R.I.S.E.) always put their titles on the line: it's the only place they're defended.
    // A title gone past its usual spacing is overdue: certain on a big show, likelier on any other.
    else if (!pledge && sinceLast >= titleMinGap(t.id) && !feudLive && (show.promos?.length ? true : rnd() < defenceChance(c, show, t.id, sinceLast))) {
      const cands = contenders(c, t, [...pool, ...(wantMe && me && !hot ? [me] : [])], region, show.date).filter((w) => free(w.id));
      // A cup winner owed a shot at this title gets it, if they're here.
      const cup = c.cupShots?.find((x) => x.title === t.id && x.who !== champ.id && cands.some((w) => w.id === x.who));
      challenger = owedShot && wantMe && !hot ? me : cup ? findWrestler(cup.who) : cands[0];
      if (cup && challenger?.id === cup.who) c.cupShots = c.cupShots!.filter((x) => x !== cup);
    }
    if (!challenger || !free(challenger.id) || (challenger.id !== c.player && !pool.some((w) => w.id === challenger!.id))) continue;
    if (challenger.id === c.player && !wantMe) continue;
    take(champ.id); take(challenger.id);
    const planned = rnd() < planRetainWith(c, t.id, show, champ.id, challenger.id) ? champ.id : challenger.id;
    card.push({ a: champ.id, b: challenger.id, title: t.id, planned, ...(feud ? { feud: feud.id } : {}) });
  }

  // A match the booker promised you (Requests): the opponent you asked for, or the one they offered.
  if (matchPledge && wantMe && me && free(me.id)) {
    const opp = findWrestler(matchPledge.opp!);
    const oppHere = !!opp && free(opp.id) && !busy.has(opp.id) && available(c.people[opp.id], show.date)
      && (indie || showRoster(show, roster).some((w) => w.id === opp.id));
    if (oppHere) {
      take(me.id); take(opp.id);
      card.push({ a: opp.id, b: me.id, ...(matchPledge.earn ? { earn: matchPledge.earn } : {}) });
      booked(c, show);
      pledgeDone(c, matchPledge, `Booked: ${show.name}, against ${opp.name}.`);
    } else if (matchPledge.show === show.id) pledgeLater(c, matchPledge, show);
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

  // Crossover showcases: the two rosters against each other where possible.
  const cross = show.special?.kind === 'crossover';
  const crossPool = (a: Wrestler, xs: Wrestler[]) => { if (!cross) return xs; const o = xs.filter((w) => w.promotion !== a.promotion); return o.length ? o : xs; };

  // You, if you're on and not in a match yet. In the doghouse: someone from the bottom half of the roster.
  if (wantMe && me && free(me.id)) {
    let opps = pool.filter((w) => free(w.id));
    if (hot) opps = [...opps].sort((x, y) => regionalPop(x, region) - regionalPop(y, region)).slice(0, Math.max(1, Math.ceil(opps.length / 2)));
    const opp = opponentFor(rnd, me, crossPool(me, opps), region, indie);
    if (opp) {
      take(me.id); take(opp.id);
      card.push({ a: opp.id, b: me.id, ...(tryout ? { tryout: true } : rnd() < STIP_CHANCE[show.kind] * stips ? { stip: pickStip(rnd) } : {}) });
      booked(c, show);
    }
  }

  // Everyone else: people of similar standing, mostly within a division.
  pool = pool.filter((w) => free(w.id)).sort((a, b) => regionalPop(b, region) - regionalPop(a, region));
  const promoter = indie ? showBooker(show) : '';
  while (card.length < size && pool.length >= 2) {
    const a = weightedPick(rnd, pool, (w) => (indie ? indieWeight(c, w, show, promoter) : 1 + regionalPop(w, region) / 10 - (c.people[w.id]?.fatigue ?? 0) / 25))!;
    pool.splice(pool.indexOf(a), 1);
    const b = opponentFor(rnd, a, crossPool(a, pool), region, indie);
    if (!b) continue;
    pool.splice(pool.indexOf(b), 1);
    card.push({ a: a.id, b: b.id, ...(rnd() < STIP_CHANCE[show.kind] * stips ? { stip: pickStip(rnd) } : {}) });
  }

  // Running order: the biggest match last (a world title if there is one), the smallest first.
  const weight = (b: Bout) => {
    const wa = findWrestler(b.a), wb = findWrestler(b.b);
    const pop = ((wa ? regionalPop(wa, region) : 0) + (wb ? regionalPop(wb, region) : 0)) / 2;
    const titleRank = b.title ? (showTitles(show).findIndex((t) => t.id === b.title) === 0 ? 300 : 150) : 0;
    const special = b.tourney ? 200 + b.tourney.round * 150 : b.farewell ? 400 : 0;
    return pop + titleRank + special + (b.feud ? 20 : 0);
  };
  card.sort((x, y) => weight(x) - weight(y));
  const last = card[card.length - 1];
  if (hot && card.length > 1 && last && (last.a === c.player || last.b === c.player)) card.splice(card.length - 2, 0, card.pop()!);
  for (const f of cardHooks) f(c, show, card);
  return card;
}

/**
 * Once a title's past its minimum gap, the chance it's defended on this show. Promotions: set by how
 * often they run, so the usual gap comes out near the class target; big shows count double; overdue
 * titles are certain on a big show. Indie titles: a champion on the card usually puts it on the line.
 */
function defenceChance(c: Career, show: Show, titleId: string, sinceLast: number): number {
  const cls = titleClass(titleId);
  const { minGap, target } = TITLE_RHYTHM[cls];
  if (sinceLast < minGap) return 0;
  if (cls === 'indie') return sinceLast >= target ? INDIE_DEFENCE_OVERDUE : INDIE_DEFENCE_CHANCE;
  if (cls === 'regional') return sinceLast >= target ? REGIONAL_DEFENCE_OVERDUE : REGIONAL_DEFENCE_CHANCE;
  const big = show.kind === 'special' || show.kind === 'flagship';
  const p = Math.min(1, promoSpacing(c, show) / Math.max(1, target - minGap));
  if (sinceLast >= target) return big ? 1 : Math.min(1, p * 3);
  return Math.min(1, big ? p * 2 : p);
}

function pickStip(rnd: Rng): StipulationId {
  return weightedPick(rnd, STIPS, (s) => s[1])![0];
}

/** Real heat a booker can use (rumours plugs in): a pair among these who can't stand each other, or null. */
let heatPick: (c: Career, ids: string[], rnd: Rng) => [string, string] | null = () => null;
let angleNews: (c: Career, promo: string, pair: [string, string]) => void = () => undefined;
export const setAngles = (pick: typeof heatPick, news: typeof angleNews): void => { heatPick = pick; angleNews = news; };

/** How keen a booker is to put two in the ring (politics plugs in: rivals, friends who lobby, enemies who refuse). */
let pairBias: (a: string, b: string) => number = () => 1;
export const setPairBias = (f: typeof pairBias): void => { pairBias = f; };
/** Booker mode: shows you book aren't drawn up ahead (your staff do it the night before if you haven't), and what your staff add. */
let deferHook: ((c: Career, show: Show) => boolean) | null = null;
let staffHook: ((c: Career, show: Show) => void) | null = null;
export const setBookDefer = (defer: typeof deferHook, staff: typeof staffHook): void => { deferHook = defer; staffHook = staff; };
/** Booker mode: who else a show can draw on (a small promotion books free agents in the region per show). */
let extraPool: ((c: Career, show: Show, roster: readonly Wrestler[], rnd: Rng) => Wrestler[]) | null = null;
export const setExtraPool = (f: typeof extraPool): void => { extraPool = f; };

function opponentFor(rnd: Rng, a: Wrestler, pool: Wrestler[], region: PopRegion, indie: boolean): Wrestler | undefined {
  const mixed = rnd() < (indie ? INTERGENDER_CHANCE_INDIE : INTERGENDER_CHANCE);
  const same = pool.filter((w) => mixed || w.gender === a.gender);
  const pa = regionalPop(a, region);
  const near = [...same].sort((x, y) => Math.abs(regionalPop(x, region) - pa) - Math.abs(regionalPop(y, region) - pa)).slice(0, 5);
  return weightedPick(rnd, near, (w) => pairBias(a.id, w.id));
}

/** How likely the booker is to use you on a given show: busier for bigger names. */
export function bookChance(me: Wrestler, show: Show, roster: readonly Wrestler[]): number {
  const here = showRoster(show, roster);
  const mine = regionalPop(me, show.region);
  const better = here.filter((w) => regionalPop(w, show.region) > mine).length;
  const share = 1 - better / Math.max(1, here.length);
  return Math.min(0.95, 0.45 + share * 0.5);
}

/** Draw up cards for every show from `from` up to `days` ahead that hasn't got one. */
export function bookAhead(c: Career, from: Day, days: number, roster: readonly Wrestler[]): void {
  const until = addDays(from, days);
  // One-offs draw first on their night (a cup needs its entrants), then promotions, then the indies.
  const rank = (s: Show) => (s.special ? 0 : s.kind === 'indie' ? 2 : 1);
  const shows = Object.values(c.shows).filter((s) => !s.card && !s.done && s.date >= from && s.date <= until).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a) - rank(b)));
  for (const s of shows) {
    // Booker mode: a show you book waits for you until the night before; then your staff book it.
    if (s.date > from && deferHook?.(c, s)) continue;
    s.card = bookShow(c, s, roster);
    if (deferHook?.(c, s)) { s.booked = 'staff'; staffHook?.(c, s); }
  }
}

export type { Feud };
