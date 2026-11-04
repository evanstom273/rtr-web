// Days (Lyra's calls): every day has an AM and a PM. What you do with a free phase comes from your
// routine (train or rest), a day job's shifts, travel and moving take real time, and a booking reserves
// the whole journey. Everything here is switched on by FEATURES.days / FEATURES.jobs with its screens.
import { setAvailability } from './availability';
import { findWrestler, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondsOf } from '../world/people';
import { tierOf } from './clauses';
import { dealWith } from './deals';
import { letter, mod, person, phaseHooks, setCareerHooks, spend, finishDay, myBoutToday, showsOn } from './career';
import { contentSession, isCoaching, setGigFits, type Gig } from './hustle';
import { addDays, daysBetween, fmtDay, weekday, type Day } from './dates';
import { attributeTotal, trainingPrice } from './economy';
import { fire, ctxFor, registerEvents, type EventDef } from './events';
import { REGION_LABEL, regionOfCountry } from './places';
import type { SimJob, SimOut } from './sim';
import {
  COST_INDEX, FEATURES, FRIEND_LOAN, FRIEND_LOAN_BOND, GIG_DEFAULT_SHIFTS, GIG_SHIFT_PAY, JOB_HOLIDAY, JOB_NOTICE_DAYS, JOB_STRIKE_DAYS, JOB_STRIKES, JOBS,
  MONEY_TROUBLE_AT, MONEY_TROUBLE_EVERY, RELOCATE_COST, RELOCATE_DAYS, RELOCATE_SUBSIDY, RELOCATION_PAID, REST_RECOVERY, TOUR_DAYS, TRAIN_INJURY,
  TRAIN_SESSION_FATIGUE, TRAIN_SESSION_POINTS,
} from './tuning';
import type { Career, DayJob, PhaseName, Routine, Show } from './types';

export const phaseOf = (c: Career): PhaseName => c.phase ?? 'am';
export const pkey = (day: Day, ph: PhaseName) => `${day}|${ph}`;
const ATTRS = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'] as const;

export const defaultRoutine = (): Routine => ({
  week: Array.from({ length: 7 }, () => ({ am: 'rest' as const, pm: 'rest' as const })), clash: 'ask', trainMatchDays: false, maxTrainFatigue: 60, simMine: false,
});
export const routineOf = (c: Career): Routine => (c.routine ??= defaultRoutine());
const me = (c: Career): Wrestler => findWrestler(c.player)!;
export const baseCountry = (c: Career): string => c.base ?? me(c).country;

// ------------------------------------------------------------------ bookings and the itinerary

interface Booking { day: Day; country: string; show: string; name: string; ph: PhaseName; gig?: boolean }

/** Everything you're booked on from today: promotion cards, indie dates, tryouts, side gigs (and a candidate). */
export function bookings(c: Career, extra?: Show, extraGig?: Gig): Booking[] {
  const out = new Map<string, Booking>();
  const add = (s: Show) => out.set(s.id, { day: s.date, country: s.country, show: s.id, name: s.name, ph: s.phase ?? 'pm' });
  const addGig = (g: Gig) => { for (const ph of g.phases) out.set(`${g.id}|${ph}`, { day: g.day, country: g.country, show: g.id, name: g.name, ph, gig: true }); };
  for (const s of Object.values(c.shows)) {
    if (s.date < c.today || s.done) continue;
    if (c.indie[s.id] || c.tryouts?.[s.id] || s.card?.some((b) => (b.a === c.player || b.b === c.player) && !b.result)) add(s);
  }
  if (extra) add(extra);
  for (const g of Object.values(c.hustle?.gigs ?? {})) if (g.day >= c.today) addGig(g);
  if (extraGig) addGig(extraGig);
  return [...out.values()].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

const place = (country: string) => country;
function legPhases(from: string, to: string, day: Day, after: boolean): Day[] | string[] {
  if (from === to) return [];
  const sameRegion = regionOfCountry(from) === regionOfCountry(to);
  // Going out: the AM of the show day (same region) or the whole day before. Coming home: the next AM or the next day.
  if (sameRegion) return [pkey(after ? addDays(day, 1) : day, 'am')];
  const d = after ? addDays(day, 1) : addDays(day, -1);
  return [pkey(d, 'am'), pkey(d, 'pm')];
}

/** What fills each phase of your coming days: shows, the travel between them, and a move. */
export function occupied(c: Career, list = bookings(c)): Map<string, string[]> {
  const occ = new Map<string, string[]>();
  const put = (k: string, what: string) => occ.set(k, [...(occ.get(k) ?? []), what]);
  const base = baseCountry(c);
  list.forEach((b, i) => {
    put(pkey(b.day, b.ph), b.gig ? `the gig (${b.name})` : `the show (${b.name})`);
    // A whole-day gig's two halves are one trip.
    if (b.gig && list[i - 1]?.show === b.show) return;
    const prev = list[i - 1], next = list[i + 1];
    const from = prev && daysBetween(prev.day, b.day) <= TOUR_DAYS ? prev.country : base;
    for (const k of legPhases(place(from), place(b.country), b.day, false)) put(k, `travelling to ${b.country}`);
    const after = next?.show === b.show ? list[i + 2] : next;
    if (!(next?.show === b.show) && (!after || daysBetween(b.day, after.day) > TOUR_DAYS)) for (const k of legPhases(place(b.country), place(base), b.day, true)) put(k, `travelling home from ${b.country}`);
  });
  if (c.moving) for (let d = c.today; d < c.moving.until; d = addDays(d, 1)) { put(pkey(d, 'am'), 'moving house'); put(pkey(d, 'pm'), 'moving house'); }
  return occ;
}

/** Would this booking fit? Only clashes it causes count (older bookings are honoured as they are). */
export function fits(c: Career, show: Show): { ok: boolean; why?: string } {
  if (!FEATURES.days) return { ok: true };
  const before = new Set([...occupied(c)].filter(([, v]) => v.length > 1).map(([k]) => k));
  for (const [k, v] of occupied(c, bookings(c, show))) {
    if (v.length > 1 && !before.has(k)) {
      const other = v.find((x) => !x.includes(show.name)) ?? v[0]!;
      return { ok: false, why: `You’d be ${other.replace(/^the show/, 'at another show')} then (${fmtDay(k.slice(0, 10), 'dm')} ${k.slice(11).toUpperCase()}).` };
    }
  }
  if (FEATURES.jobs && c.job && routineOf(c).clash === 'keep' && jobClashes(c, show).length) return { ok: false, why: 'You’d have to miss a shift at work.' };
  return { ok: true };
}

/** Would a side gig fit: no clash with shows, travel, other gigs, shifts or coaching. */
function fitsGig(c: Career, g: Gig): string | null {
  const before = new Set([...occupied(c)].filter(([, v]) => v.length > 1).map(([k]) => k));
  for (const [k, v] of occupied(c, bookings(c, undefined, g))) {
    if (v.length > 1 && !before.has(k)) {
      const other = v.find((x) => !x.includes(g.name)) ?? v[0]!;
      return `You’d be ${other.replace(/^the (show|gig) \((.*)\)$/, 'at $2')} then (${fmtDay(k.slice(0, 10), 'dm')} ${k.slice(11).toUpperCase()}).`;
    }
  }
  for (const ph of g.phases) {
    if (c.job && isShift(c, g.day, ph) && !c.job.off.includes(g.day)) return 'You’re at work then.';
    if (isCoaching(c, g.day, ph)) return 'You’re coaching then.';
  }
  return null;
}

// ------------------------------------------------------------------ what you do with a phase

/** A day job's shifts on a weekday. */
function shiftsOf(job: DayJob): [number, PhaseName][] {
  return job.id === 'gig' ? job.gig ?? GIG_DEFAULT_SHIFTS : (JOBS[job.id].shifts as unknown as [number, PhaseName][]);
}
export const isShift = (c: Career, day: Day, ph: PhaseName): boolean =>
  !!c.job && day >= c.job.from && shiftsOf(c.job).some(([d, p]) => d === weekday(day) && p === ph);

/** Shifts a booking (and its travel) would cut into. */
export function jobClashes(c: Career, show: Show): string[] {
  if (!c.job) return [];
  const mine = occupied(c, bookings(c, show));
  return [...mine.keys()].filter((k) => isShift(c, k.slice(0, 10), k.slice(11) as PhaseName) && !c.job!.off.includes(k.slice(0, 10)));
}

export type Activity = 'show' | 'travel' | 'moving' | 'work' | 'train' | 'rest' | 'hustle' | 'content' | 'social';
export function activityAt(c: Career, day: Day, ph: PhaseName): Activity {
  const occ = occupied(c).get(pkey(day, ph));
  if (occ?.some((x) => x.startsWith('the show'))) return 'show';
  if (occ?.some((x) => x.startsWith('the gig'))) return 'hustle';
  if (occ?.some((x) => x === 'moving house')) return 'moving';
  if (occ?.length) return 'travel';
  if (FEATURES.jobs && isShift(c, day, ph) && !c.job!.off.includes(day)) return 'work';
  if (FEATURES.hustles && isCoaching(c, day, ph)) return 'hustle';
  // Plans with someone (relationships stage 3): drinks, the gym, a visit.
  if (c.meets?.some((m) => m.status === 'on' && m.day === day && m.ph === ph)) return 'social';
  const plan = c.plans?.[pkey(day, ph)];
  if (plan) return plan === 'work' ? 'work' : plan === 'trained' ? 'train' : plan;
  const r = routineOf(c);
  const want = r.week[weekday(day)]![ph];
  const matchDay = bookings(c).some((b) => b.day === day);
  if (want === 'content' && FEATURES.hustles) return 'content';
  if (want === 'train' && (!matchDay || r.trainMatchDays) && person(c, c.player).fatigue <= r.maxTrainFatigue) return 'train';
  return 'rest';
}

/** A training session: up to two points at today's prices, some fatigue, a small risk if already tired. */
export function trainSession(c: Career, points?: Partial<Record<(typeof ATTRS)[number], number>>): string {
  const w = me(c), p = person(c, c.player);
  if (c.money < 0 && mod('trainPrice', c, c.player) > 0) return 'You’re overdrawn: no training until you’re back in the black.';
  // From the gym screen: this phase is your session (the clock won't train you again).
  if (points) c.plans = { ...(c.plans ?? {}), [pkey(c.today, phaseOf(c))]: 'trained' };
  const r = routineOf(c);
  const order = points ? (Object.keys(points) as (typeof ATTRS)[number][]) : [r.focus as (typeof ATTRS)[number], ...ATTRS].filter((k): k is (typeof ATTRS)[number] => !!k && ATTRS.includes(k));
  let bought = 0, spent = 0;
  const parts: string[] = [];
  for (const k of order) {
    let want = points ? points[k] ?? 0 : TRAIN_SESSION_POINTS - bought;
    while (want-- > 0 && bought < TRAIN_SESSION_POINTS && w.stats[k] < 100) {
      const price = Math.round(trainingPrice(attributeTotal(w)) * mod('trainPrice', c, c.player));
      if (c.money - spent < price || (r.spendCap && spent + price > r.spendCap)) break;
      w.stats[k]++;
      spent += price;
      bought++;
      parts.push(k);
    }
    if (bought >= TRAIN_SESSION_POINTS) break;
  }
  if (spent) spend(c, -spent, `Training session · +${bought} (${[...new Set(parts)].join(', ')})`, 'training');
  // Coaching and a mentor (Training & Development, Mentorship): a little extra from each session, carried over.
  const extra = bought * (mod('trainGain', c, c.player) - 1);
  if (extra > 0 && parts.length) {
    c.trainCarry = (c.trainCarry ?? 0) + extra;
    while (c.trainCarry >= 1) { const k = parts[0] as (typeof ATTRS)[number]; if (w.stats[k] < 100) w.stats[k]++; c.trainCarry -= 1; parts.push(k); }
  }
  const before = p.fatigue;
  p.fatigue = Math.min(100, p.fatigue + TRAIN_SESSION_FATIGUE);
  const risk = TRAIN_INJURY.filter(([f]) => before >= f).at(-1)?.[1] ?? 0;
  if (risk && seededRng(hashSeed(c.seed, 'train', c.today, phaseOf(c)))() < risk) {
    const days = 3 + Math.floor(seededRng(hashSeed(c.seed, 'train-days', c.today))() * 5);
    p.injury = { what: 'a training strain', until: addDays(c.today, days) };
    letter(c, { kind: 'injury', from: 'The gym', subject: 'Hurt in training', body: [`You pushed too hard tired. Out for ${days} days.`] });
  }
  return bought ? `+${bought} for £${spent.toLocaleString('en-GB')}` : 'A session with nothing bought (not enough money).';
}

/** Do the player's phase: rest, train, work or travel. */
export function runPhase(c: Career, ph: PhaseName): Activity {
  const a = activityAt(c, c.today, ph);
  const p = person(c, c.player);
  if (a === 'rest') p.fatigue = Math.max(0, p.fatigue - REST_RECOVERY);
  if (a === 'content') contentSession(c);
  // A session already done in the gym this phase isn't done twice.
  if (a === 'train' && c.plans?.[pkey(c.today, ph)] !== 'trained') trainSession(c);
  if (a === 'work' && c.job) {
    c.job.worked++;
    p.fatigue = Math.min(100, p.fatigue + JOBS[c.job.id].fatigue);
  }
  phaseHooks(c, ph, a);
  // A shift missed without arranging it: a strike.
  if (FEATURES.jobs && c.job && isShift(c, c.today, ph) && a !== 'work' && !c.job.off.includes(c.today)) strike(c, `Missed your ${ph.toUpperCase()} shift`);
  return a;
}

// ------------------------------------------------------------------ day jobs

export const wageRegion = (c: Career) => regionOfCountry(baseCountry(c));
/** Pay for one shift where you live. */
export function shiftPay(c: Career, id: DayJob['id']): number {
  const j = JOBS[id];
  const per = id === 'gig' ? GIG_SHIFT_PAY : j.weekly / Math.max(1, j.shifts.length);
  return Math.round(per * COST_INDEX[wageRegion(c)]);
}

/** This week's openings near you (gig work is always there). */
export function jobBoard(c: Career): DayJob['id'][] {
  const ws = addDays(c.today, -((weekday(c.today) + 6) % 7));
  const rnd = seededRng(hashSeed(c.seed, 'jobs', ws));
  const fixed = (['office', 'warehouse', 'retail', 'hospitality'] as const).filter(() => rnd() < 0.7);
  return [...(fixed.length ? fixed : ['retail' as const]), 'gig'];
}

export function takeJob(c: Career, id: DayJob['id'], gig?: [number, PhaseName][]): string {
  const start = addDays(c.today, ((8 - weekday(c.today)) % 7) || 7);
  c.job = { id, from: id === 'gig' ? c.today : start, holiday: JOB_HOLIDAY, off: [], strikes: [], worked: 0, ...(id === 'gig' ? { gig: gig ?? GIG_DEFAULT_SHIFTS } : {}) };
  letter(c, { kind: 'news', from: JOBS[id].name, subject: id === 'gig' ? 'You’re on the delivery app' : `You start on ${fmtDay(start, 'long')}`, body: [id === 'gig' ? `£${shiftPay(c, 'gig')} a shift, the phases you pick. No hard feelings if you don’t log on.` : `${JOBS[id].name}: about £${(shiftPay(c, id) * JOBS[id].shifts.length).toLocaleString('en-GB')} a week.`] });
  return JOBS[id].name;
}
export function quitJob(c: Career, why = 'You quit'): void {
  if (!c.job) return;
  const name = JOBS[c.job.id].name;
  payWages(c);
  c.job = null;
  letter(c, { kind: 'news', from: name, subject: 'Your last shift', body: [`${why}. Wages owed have been paid.`] });
}
function strike(c: Career, why: string): void {
  const j = c.job!;
  j.strikes = [c.today, ...j.strikes.filter((d) => daysBetween(d, c.today) < JOB_STRIKE_DAYS)];
  if (j.strikes.length >= JOB_STRIKES) { quitJob(c, `${why}: that’s three in ${JOB_STRIKE_DAYS} days, and they’ve let you go`); return; }
  letter(c, { kind: 'news', from: JOBS[j.id].name, subject: 'A warning from work', body: [`${why}. That’s ${j.strikes.length} of ${JOB_STRIKES}: one more short-notice absence and you’re out.`] });
}
/** Friday night (or leaving): wages for the shifts worked. */
export function payWages(c: Career): void {
  const j = c.job;
  if (!j || !j.worked) return;
  spend(c, shiftPay(c, j.id) * j.worked, `${JOBS[j.id].name} · ${j.worked} shift${j.worked === 1 ? '' : 's'}`, 'wage');
  j.worked = 0;
}

/** Arrange time off for a booking: unpaid with notice, holiday at short notice, otherwise a strike. */
export function timeOff(c: Career, days: Day[]): string[] {
  const j = c.job;
  if (!j) return [];
  const said: string[] = [];
  for (const d of [...new Set(days)]) {
    if (j.off.includes(d)) continue;
    j.off.push(d);
    if (daysBetween(c.today, d) >= JOB_NOTICE_DAYS) said.push(`${fmtDay(d, 'dm')} off, unpaid`);
    else if (j.holiday > 0) { j.holiday--; j.worked++; said.push(`${fmtDay(d, 'dm')} as holiday (${j.holiday} left)`); }
    else { strike(c, 'Short-notice time off with no holiday left'); said.push(`${fmtDay(d, 'dm')}: a strike`); }
  }
  return said;
}

/** A new booking cuts into shifts: your standing answer, or a letter asking. */
export function onBooked(c: Career, show: Show): void {
  if (!FEATURES.jobs || !c.job) return;
  const clashes = jobClashes(c, show).map((k) => k.slice(0, 10));
  if (!clashes.length) return;
  const how = routineOf(c).clash;
  if (how === 'take' || how === 'keep') { timeOff(c, clashes); return; }
  fire(ctxFor(c), CLASH, { show: show.id, name: show.name, date: show.date, days: clashes.join(',') });
}

const CLASH: EventDef = {
  id: 'job_clash', cat: 'career', weight: 0, cooldown: 0, when: () => false, expires: 3,
  from: (x) => JOBS[x.c.job?.id ?? 'retail'].name, subject: (_x, d) => `Work or ${String(d.name)}?`,
  body: (_x, d) => [`${String(d.name)} on ${fmtDay(String(d.date), 'long')} means missing ${String(d.days).split(',').length === 1 ? 'a shift' : 'shifts'}.`, 'With a week’s notice it’s unpaid time off; at shorter notice it comes out of your holiday, or it’s a strike.'],
  options: [
    { id: 'off', label: 'Take the time off', run: (x, d) => `Sorted: ${timeOff(x.c, String(d.days).split(',')).join(', ')}.` },
    { id: 'drop', label: 'Give up the date', decline: true, run: (x, d) => { const s = x.c.shows[String(d.show)]; if (s) { delete x.c.indie[s.id]; if (s.card) s.card = s.card.filter((b) => b.a !== x.c.player && b.b !== x.c.player); } return 'You’ll work instead.'; } },
  ],
  ignored: () => 'You never sorted it: miss a shift and it’s a strike.',
};

// ------------------------------------------------------------------ moving

export function relocateCost(c: Career, country: string): number {
  return regionOfCountry(country) === regionOfCountry(baseCountry(c)) ? RELOCATE_COST.region : RELOCATE_COST.abroad;
}
/** Move house: costs money (a promotion may pay), takes three days, ends a day job. */
export function relocate(c: Career, country: string, subsidy = 0): string {
  if (c.moving) return 'You’re already moving.';
  if (country === baseCountry(c)) return 'You already live there.';
  const share = Math.round(relocateCost(c, country) * (1 - subsidy));
  if (share > 0 && c.money - share < 0 && subsidy < 1) return 'You can’t afford the move right now.';
  if (share > 0) spend(c, -share, `Moving to ${country}`, 'relocation');
  if (c.job) quitJob(c, 'You’re moving away');
  c.moving = { to: country, until: addDays(c.today, RELOCATE_DAYS) };
  return `Moving to ${country}: three days, ${share ? `£${share.toLocaleString('en-GB')}` : 'paid for'}.`;
}

/** Travel & Accommodation: the share of a move a promotion pays (Tier 3 all of it; none without the clause). */
const movePaid = (c: Career, promo: string): number => {
  const k = dealWith(person(c, c.player), promo);
  return k ? RELOCATION_PAID[tierOf(k, 'travel')] ?? RELOCATE_SUBSIDY : RELOCATE_SUBSIDY;
};

const MOVE_OFFER: EventDef = {
  id: 'move_offer', cat: 'career', weight: 0, cooldown: 0, when: () => false, expires: 10,
  from: (_x, d) => String(d.promo), subject: (_x, d) => `Move to ${String(d.country)}?`,
  body: (x, d) => [`${String(d.promo)} would rather you lived nearer: they’ll pay ${Math.round(movePaid(x.c, String(d.promo)) * 100)}% of moving to ${String(d.country)}.`, `You live in ${baseCountry(x.c)} now; every date would mean a long trip.`],
  options: [
    { id: 'move', label: 'Move', run: (x, d) => relocate(x.c, String(d.country), movePaid(x.c, String(d.promo))) },
    { id: 'stay', label: 'Stay where you are', decline: true, run: () => 'You’ll travel.' },
  ],
};

// ------------------------------------------------------------------ money trouble

const TROUBLE: EventDef = {
  id: 'money_trouble', cat: 'career', weight: 0, cooldown: 0, when: () => false, expires: 7,
  from: () => 'Your bank', subject: () => 'You’re well overdrawn',
  body: (x) => [`You’re £${Math.round(-x.c.money).toLocaleString('en-GB')} overdrawn and the rent keeps coming.`, 'Something has to give.'],
  options: [
    { id: 'gig', label: 'Sign up for gig work', detail: (x) => `£${shiftPay(x.c, 'gig')} a shift, six mornings a week, drop it whenever`, run: (x) => `${takeJob(x.c, 'gig')}: you start today.` },
    { id: 'job', label: 'Take a job off the board', detail: (x) => JOBS[jobBoard(x.c)[0]!].name, run: (x) => `${takeJob(x.c, jobBoard(x.c)[0]!)}: you start next Monday.` },
    {
      id: 'loan', label: 'Borrow from a friend', detail: () => `£${FRIEND_LOAN.toLocaleString('en-GB')}, paid back from your fees`,
      hidden: (x) => !friend(x.c),
      run: (x) => { const f = friend(x.c)!; spend(x.c, FRIEND_LOAN, `Loan from ${findWrestler(f)?.name ?? 'a friend'}`, 'event'); x.c.loan = { from: f, left: FRIEND_LOAN }; return `${findWrestler(f)?.name ?? 'A friend'} helps you out.`; },
    },
    { id: 'ride', label: 'Ride it out', decline: true, run: () => 'You’ll manage. Somehow.' },
  ],
};
function friend(c: Career): string | undefined {
  const P = activeWorld().people;
  return P ? bondsOf(P, c.player).filter((x) => (x.bond.a === x.other ? x.bond.la : x.bond.lb) >= FRIEND_LOAN_BOND).map((x) => x.other).find((id) => !!findWrestler(id)) : undefined;
}

registerEvents([CLASH, MOVE_OFFER, TROUBLE]);

function daily(c: Career): void {
  if (FEATURES.days) {
    c.daysFrom ??= c.today;
    if (c.moving && c.today >= c.moving.until) {
      const to = c.moving.to;
      c.base = to;
      delete c.moving;
      letter(c, { kind: 'news', from: 'Home', subject: `Moved to ${to}`, body: [`You live in ${to} now (${REGION_LABEL[regionOfCountry(to)]}).`] });
    }
    // Signed somewhere far away: the promotion offers to move you, once a contract.
    const k = c.people[c.player]?.contract;
    const open = Object.values(c.events?.open ?? {}).some((o) => o.id === 'move_offer');
    if (k && !open && !c.moving && regionOfCountry(baseCountry(c)) !== promoHome(k.promo) && c.events?.seen.move_offer !== k.start) {
      const l = fire(ctxFor(c), MOVE_OFFER, { promo: k.promo, country: PROMO_COUNTRY[k.promo] ?? 'USA' });
      if (l) c.events!.seen.move_offer = k.start;
    }
  }
  if (FEATURES.jobs && !c.job && c.money <= MONEY_TROUBLE_AT && (!c.moneyTroubleAt || daysBetween(c.moneyTroubleAt, c.today) >= MONEY_TROUBLE_EVERY)) {
    if (!Object.values(c.events?.open ?? {}).some((o) => o.id === 'money_trouble') && fire(ctxFor(c), TROUBLE, {})) c.moneyTroubleAt = c.today;
  }
  if (c.job && new Date(`${c.today}T12:00:00Z`).getUTCDay() === 1 && c.today.slice(5) === '01-01') c.job.holiday = JOB_HOLIDAY;
}

const PROMO_COUNTRY: Record<string, string> = { VWF: 'USA', TCG: 'Canada', SLN: 'Mexico', END: 'England', IVW: 'France', NWGP: 'Japan', ZWA: 'China', UFC: 'Samoa', SSWC: 'Argentina', AAWA: 'Egypt' };
const promoHome = (promo: string) => regionOfCountry(PROMO_COUNTRY[promo] ?? 'USA');

setCareerHooks({ daily });
setAvailability(fits, onBooked);
setGigFits(fitsGig);

// ------------------------------------------------------------------ moving the clock

/**
 * Move on one phase. With days off, a whole day (as before). AM: your morning, then any AM shows.
 * PM: your evening if you're not wrestling (your match is played or simmed first), wages on a Friday,
 * then the night as before.
 */
export async function advancePhase(c: Career, run: (jobs: SimJob[]) => Promise<SimOut[]>): Promise<void> {
  if (!FEATURES.days) { await finishDay(c, run); return; }
  if (phaseOf(c) === 'am') {
    runPhase(c, 'am');
    c.phase = 'pm';
    return;
  }
  const wrestling = !!myBoutToday(c) || showsOn(c, c.today).some((s) => s.card?.some((b) => (b.a === c.player || b.b === c.player)));
  if (!wrestling) runPhase(c, 'pm');
  else if (FEATURES.jobs && c.job && isShift(c, c.today, 'pm') && !c.job.off.includes(c.today)) strike(c, 'Missed your PM shift');
  if (weekday(c.today) === 5) payWages(c);
  await finishDay(c, run);
  c.phase = 'am';
}
