// Booker mode, the career's side (Lyra's design, stage 1): the promotions you run, founding your own, its schedule,
// and the office hours booking takes out of your week. How you got there decides what you are (Lyra's call): your own
// promotion makes you owner and booker; booking someone else's makes you their booker, answering to an owner. You can
// run one major and one indie at a time, and keep wrestling the whole while (for anyone: no conflict of interest).
import { databaseChanged, findWrestler, PROMOTIONS, TITLES, WRESTLERS, type Promotion, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { bookerOf, leaveJob } from '../world/people';
import { calendarExtras, TIER_LABEL, type Company, type Tier } from '../world/companies';
import { REGION_DATA } from '../world/populate';
import { regionFactor, setExtraPool } from './booker';
import { drawCalendar, SCHEDULES, type Rule } from './calendar';
import { letter, promoName, setCareerHooks, setRosterTarget, spend } from './career';
import { addDays, fmtDay, weekday, WEEKDAYS, weekStart, type Day } from './dates';
import { CITIES, PROMO_COUNTRIES, regionOfCountry } from './places';
import { appointBooker } from './staff';
import { COMPANY, FEATURES, FOUND } from './tuning';
import type { Career, PhaseName, ShowKind } from './types';

export type { Company, Tier };
export { TIER_LABEL };

export interface OfficeRole {
  promo: string;
  /** Owner (your own, or one you bought) or booker (someone else's). */
  as: 'owner' | 'booker';
  since: Day;
}
export interface OfficeState {
  roles: OfficeRole[];
  /** Your office hours: the half-days of the week (0 = Sunday) you keep for booking. */
  slots: [number, PhaseName][];
  /** Half-days worked this week (from `weekOf`), and how many short you were last week. */
  worked?: number;
  weekOf?: Day;
  short?: number;
  /** Booking yourself to win: when (for the glory-hog talk). */
  selfWins?: Day[];
}

// ------------------------------------------------------------------ looking things up

export const companies = (): Record<string, Company> => (activeWorld().companies ??= {});
export const companyOf = (promo: string): Company | undefined => activeWorld().companies?.[promo];
export const tierOf = (promo: string): Tier => companyOf(promo)?.tier ?? 'national';
/** National and global promotions are the majors; local and regional are the indies (one of each, Lyra's call). */
export const isMajorTier = (t: Tier): boolean => t === 'national' || t === 'global';
export const playerRuns = (promo: string): boolean => companyOf(promo)?.booker === 'player';
export const officeOf = (c: Career): OfficeState => (c.office ??= { roles: [], slots: [] });
export const rolesOf = (c: Career): OfficeRole[] => c.office?.roles ?? [];
export const roleIn = (c: Career, promo: string): OfficeRole | undefined => rolesOf(c).find((r) => r.promo === promo);
export const ownerName = (promo: string): string => {
  const co = companyOf(promo);
  if (!co) return '';
  return co.owner === 'player' ? 'You' : activeWorld().people?.staff[co.owner]?.name ?? 'The owner';
};
const me = (c: Career): Wrestler => findWrestler(c.player)!;
const history = () => activeWorld().history;

/** Why you can't take on a promotion (null: you can). */
export function canRun(c: Career, promo: string): string | null {
  if (!FEATURES.booker) return 'Booker mode isn’t switched on yet.';
  const co = companyOf(promo);
  if (!co || co.closed) return 'There’s no such promotion.';
  if (roleIn(c, promo)) return 'You already run it.';
  const major = isMajorTier(co.tier);
  if (rolesOf(c).some((r) => isMajorTier(tierOf(r.promo)) === major)) return major ? 'You already run a major: one at a time.' : 'You already run an indie: one at a time.';
  return null;
}

// ------------------------------------------------------------------ taking one on, and leaving

/** You take over a promotion: as its booker (someone else's), or as owner and booker. */
export function takeRole(c: Career, promo: string, as: OfficeRole['as']): string {
  const no = canRun(c, promo);
  if (no) return no;
  const co = companyOf(promo)!;
  const P = activeWorld().people!;
  const old = bookerOf(P, promo);
  if (old) {
    leaveJob(old, c.today, 'fired');
    addEvent(history(), { day: c.today, kind: 'left', who: old.id, name: old.name, promo, what: 'replaced as booker' });
  }
  co.booker = 'player';
  if (as === 'owner' && co.owner !== 'player') {
    const was = P.staff[co.owner];
    if (was) leaveJob(was, c.today, 'quit');
    co.owner = 'player';
  }
  // You set its schedule from now on: the usual one, copied across for you to change.
  co.schedule ??= structuredClone(SCHEDULES[promo] ?? []);
  officeOf(c).roles.push({ promo, as, since: c.today });
  fillSlots(c);
  addEvent(history(), { day: c.today, kind: 'hired', who: c.player, name: me(c).name, promo, what: as === 'owner' ? 'took over as owner and booker' : 'hired as booker' });
  databaseChanged();
  return as === 'owner' ? `${promoName(promo)} is yours.` : `You’re ${promoName(promo)}’s booker.`;
}

/** You stop running a promotion (you quit, were sacked, sold up, or it closed). Someone else books it from here. */
export function leaveRole(c: Career, promo: string, why: 'quit' | 'sacked' | 'sold' | 'closed'): void {
  const o = officeOf(c);
  if (!roleIn(c, promo)) return;
  o.roles = o.roles.filter((r) => r.promo !== promo);
  fillSlots(c);
  const co = companyOf(promo);
  if (!co) return;
  delete co.booker;
  addEvent(history(), { day: c.today, kind: 'left', who: c.player, name: me(c).name, promo, what: why === 'sacked' ? 'sacked as booker' : why === 'sold' ? 'sold up' : why === 'closed' ? 'closed it down' : 'quit as booker' });
  if (!co.closed) appointBooker(c, promo, seededRng(hashSeed(c.seed, 'appoint', promo, c.today)));
}

// ------------------------------------------------------------------ founding your own

export interface Founding {
  name: string;
  initials: string;
  country: string;
  city: string;
  capital: number;
  /** Its regular night: how often, and which weekday. */
  night?: { every: 'weekly' | 'fortnightly' | 'monthly'; day: string };
}

/** Why a founding wouldn't work (null: it would). */
export function foundingProblem(c: Career, f: Founding): string | null {
  if (!FEATURES.booker) return 'Booker mode isn’t switched on yet.';
  const name = f.name.trim(), ini = f.initials.trim().toUpperCase();
  if (!name) return 'Give it a name.';
  if (name.length > FOUND.nameMax) return 'That name’s too long.';
  if (!/^[A-Z0-9&]+$/.test(ini) || ini.length < FOUND.initials[0] || ini.length > FOUND.initials[1]) return `Initials: ${FOUND.initials[0]}–${FOUND.initials[1]} letters.`;
  if (PROMOTIONS.some((p) => p.initials === ini) || ini === 'TIS' || ini === 'JOINT') return 'Those initials are taken.';
  if (PROMOTIONS.some((p) => p.name.toLowerCase() === name.toLowerCase())) return 'That name’s taken.';
  if (!CITIES[f.country]?.includes(f.city)) return 'Pick a city.';
  if (f.capital < FOUND.minCapital) return `Put in at least £${FOUND.minCapital.toLocaleString('en-GB')}.`;
  if (f.capital > c.money) return 'You haven’t got that much.';
  if (rolesOf(c).some((r) => !isMajorTier(tierOf(r.promo)))) return 'You already run an indie: one at a time.';
  return null;
}

/** A regular night as a schedule rule. */
export function nightRule(name: string, every: 'weekly' | 'fortnightly' | 'monthly', day: string, from: Day, kind: ShowKind = 'weekly'): Rule {
  const when = every === 'weekly' ? { every: day }
    : every === 'fortnightly' ? { everyN: { day, weeks: 2, anchor: weekStart(from) } }
    : { nth: 1, day, month: 'every' };
  return { name, kind, when } as Rule;
}

/** Found your own promotion: a real one (in the database, on the calendar, in Records), owned and booked by you. */
export function foundPromotion(c: Career, f: Founding): string {
  const no = foundingProblem(c, f);
  if (no) return no;
  const name = f.name.trim(), ini = f.initials.trim().toUpperCase();
  const p: Promotion = { id: Math.max(0, ...PROMOTIONS.map((x) => x.id)) + 1, name, initials: ini, indie: false, region: REGION_DATA[regionOfCountry(f.country)], titles: [], popularity: FOUND.startPop };
  PROMOTIONS.push(p);
  PROMO_COUNTRIES[ini] = [f.country];
  const night = f.night ?? { every: 'monthly', day: 'Saturday' };
  const first = addDays(c.today, 7);
  const co: Company = {
    promo: ini, owner: 'player', booker: 'player', tier: 'local', bank: f.capital, founded: c.today, home: { country: f.country, city: f.city },
    schedule: [nightRule(night.every === 'monthly' ? `${ini} Monthly` : `${name}`, night.every, night.day, first)],
  };
  companies()[ini] = co;
  spend(c, -f.capital, `Into ${name}`, 'company');
  officeOf(c).roles.push({ promo: ini, as: 'owner', since: c.today });
  fillSlots(c);
  addEvent(history(), { day: c.today, kind: 'founded', who: c.player, name: me(c).name, promo: ini, what: `founded ${name}` });
  redraw(c, ini, first);
  letter(c, { kind: 'news', from: 'The news desk', subject: `${me(c).name} launches ${name}`, body: [`${me(c).name} has founded ${name} (${ini}), based in ${f.city}. ${night.every === 'weekly' ? 'Shows every' : night.every === 'fortnightly' ? 'Shows every other' : 'Shows on the first'} ${night.day}${night.every === 'monthly' ? ' of the month' : ''}.`] });
  databaseChanged();
  return `${name} is open for business.`;
}

// ------------------------------------------------------------------ the schedule

export const scheduleOf = (promo: string): Rule[] => companyOf(promo)?.schedule ?? SCHEDULES[promo] ?? [];

/** Roughly how many shows a week a schedule runs (weekly 1, fortnightly ½, monthly ¼; one-a-year dates hardly count). */
export function perWeek(rules: Rule[]): number {
  return rules.reduce((t, r) => {
    const w = r.when as Record<string, unknown>;
    return t + ('every' in w ? 1 : 'everyN' in w ? 1 / ((w.everyN as { weeks: number }).weeks || 1) : 'nth' in w ? ((w as { month: string }).month === 'every' ? 0.25 : 0.02) : 'date' in w ? 0.02 : 'irregular' in w ? 0.2 : 'touringMonths' in w ? 1.25 : 0.25);
  }, 0);
}

/** Change a promotion's schedule (yours to set, Lyra's call): what's already a week out stays, the rest is redrawn. */
export function setSchedule(c: Career, promo: string, rules: Rule[]): string {
  if (!roleIn(c, promo)) return 'You don’t run it.';
  const co = companyOf(promo)!;
  if (perWeek(rules) > COMPANY.showsPerWeek[co.tier] + 0.01) return `A ${TIER_LABEL[co.tier].toLowerCase()} promotion can run ${COMPANY.showsPerWeek[co.tier]} show${COMPANY.showsPerWeek[co.tier] > 1 ? 's' : ''} a week at most.`;
  const names = rules.map((r) => r.name.trim());
  if (names.some((n) => !n) || new Set(names).size !== names.length) return 'Every show needs its own name.';
  co.schedule = rules;
  redraw(c, promo, addDays(c.today, 7));
  return 'Schedule saved.';
}

/** Redraw one promotion's calendar from `from`: its undrawn shows go, and its schedule's shows come back in. */
export function redraw(c: Career, promo: string, from: Day): void {
  if (!c.drawnTo || c.drawnTo < from) return;
  for (const [id, s] of Object.entries(c.shows)) {
    if (s.promo !== promo || s.done || s.date < from || s.special || s.promos || s.irregular) continue;
    // Numbering carries on from the last show that's staying.
    if (s.series && s.n !== undefined) c.counters[s.series] = Math.min(c.counters[s.series] ?? s.n, s.n - 1);
    delete c.shows[id];
  }
  const state = { seed: c.seed, counters: c.counters, nextIrregular: c.nextIrregular, ...calendarExtras(companies()), only: promo };
  const r = drawCalendar(state, addDays(weekStart(from), -1), from, c.drawnTo);
  for (const s of r.shows) if (!c.shows[s.id]) c.shows[s.id] = s;
}

// ------------------------------------------------------------------ office hours

/** Half-days a week your jobs take (Lyra's call: booking takes time like a job, more for a bigger promotion). */
export const officeNeed = (c: Career): number => rolesOf(c).reduce((t, r) => t + COMPANY.officeDays[tierOf(r.promo)], 0);
const SLOT_ORDER: [number, PhaseName][] = [[1, 'am'], [3, 'am'], [5, 'am'], [2, 'am'], [4, 'am'], [1, 'pm'], [3, 'pm'], [2, 'pm'], [4, 'pm'], [5, 'pm']];
/** Keep your office hours in step with your jobs: add the usual half-days when you need more, drop the last ones when you need fewer. */
export function fillSlots(c: Career): void {
  const o = officeOf(c);
  const need = officeNeed(c);
  const key = ([d, p]: [number, PhaseName]) => `${d}${p}`;
  for (const s of SLOT_ORDER) {
    if (o.slots.length >= need) break;
    if (!o.slots.some((x) => key(x) === key(s))) o.slots.push(s);
  }
  if (o.slots.length > need) o.slots = o.slots.slice(0, need);
}
/** Pick your own office hours (at least what your jobs need). */
export function setSlots(c: Career, slots: [number, PhaseName][]): string {
  const need = officeNeed(c);
  if (slots.length < need) return `Your jobs need ${need} half-day${need === 1 ? '' : 's'} a week.`;
  officeOf(c).slots = slots.slice(0, Math.max(need, 7));
  return 'Office hours saved.';
}
export const isOffice = (c: Career, day: Day, ph: PhaseName): boolean =>
  FEATURES.booker && !!c.office?.roles.length && c.office.slots.some(([d, p]) => d === weekday(day) && p === ph);
export const slotLabel = ([d, p]: [number, PhaseName]): string => `${WEEKDAYS[d]!.slice(0, 3)} ${p.toUpperCase()}`;

/** A half-day in the office counts towards the week. */
function phase(c: Career, _ph: PhaseName, activity: string): void {
  if (!FEATURES.booker || !c.office?.roles.length || activity !== 'office') return;
  const o = c.office;
  const ws = weekStart(c.today);
  if (o.weekOf !== ws) { o.weekOf = ws; o.worked = 0; }
  o.worked = (o.worked ?? 0) + 1;
}

/** Mondays: last week's office hours are settled. Short, and your staff covered (stage 2: their booking, not yours). */
function daily(c: Career): void {
  if (!FEATURES.booker || !c.office?.roles.length || weekday(c.today) !== 1) return;
  const o = c.office;
  const last = addDays(c.today, -7);
  const need = rolesOf(c).filter((r) => r.since <= last).reduce((t, r) => t + COMPANY.officeDays[tierOf(r.promo)], 0);
  const short = Math.max(0, need - (o.weekOf === last ? o.worked ?? 0 : 0));
  o.short = short;
  o.weekOf = c.today;
  o.worked = 0;
  if (short) letter(c, { kind: 'news', from: 'The office', subject: `Your staff covered ${short} half-day${short === 1 ? '' : 's'}`, body: [`You were out of the office ${short} half-day${short === 1 ? '' : 's'} last week (shows, travel, other plans). Things got done, just not the way you’d have done them.`] });
}

// ------------------------------------------------------------------ the world around your promotions

/** A small promotion's card isn't only its own roster: free agents in the region fill it out (per-show bookings). */
setExtraPool((c, show, roster, rnd) => {
  const co = companyOf(show.promo);
  if (!co || isMajorTier(co.tier)) return [];
  return roster.filter((w) => w.promotion === 'TIS' && w.id !== c.player && rnd() < Math.min(1, regionFactor(c, w, show.region, show.date)));
});

/** How many a promotion keeps on its roster: by tier, and none signed for you while you sign them yourself. */
setRosterTarget((promo, fallback) => {
  const co = companyOf(promo);
  if (!co) return fallback;
  if (co.closed) return 0;
  if (co.booker === 'player' && !co.autoSign) return 0;
  return COMPANY.roster[co.tier];
});

setCareerHooks({
  phase,
  daily,
  // The AI doesn't release anyone from a roster you run: that's your call.
  protect: (_c, _id, promo) => playerRuns(promo),
});

/** Your promotions in a line each: "IVW · booker · national · £2.5m". */
export function roleLine(r: OfficeRole): string {
  const co = companyOf(r.promo);
  return `${promoName(r.promo)} · ${r.as === 'owner' ? 'owner and booker' : 'booker'}${co ? ` · ${TIER_LABEL[co.tier].toLowerCase()}` : ''} · since ${fmtDay(r.since, 'dm')}`;
}

/** Champions and signed wrestlers of a promotion, for the Office overview. */
export function rosterSummary(promo: string): { signed: number; women: number; champs: number } {
  const roster = WRESTLERS.filter((w) => w.promotion === promo || w.also?.includes(promo));
  return { signed: roster.length, women: roster.filter((w) => w.gender === 'FEMALE').length, champs: TITLES.filter((t) => PROMOTIONS.find((p) => p.initials === promo)?.titles.includes(t.id) && t.holder).length };
}

