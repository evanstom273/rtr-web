// Body and schedule clauses (Lyra's design): Medical Pay (long-injury payout, job protection, your spot held),
// Training & Development (cheaper, then free with coaching, then a performance centre), Match Conditions (no
// hardcore, approve stipulations, safer matches), Schedule Flexibility (holiday weeks, part-time), Travel &
// Accommodation (who pays, per diems, and long trips that tire you) and International Touring (opt out, pick, headline).
import { HARDCORE_STIPS, setBookableHook, setCardHook } from './booker';
import { letter, mod, person, promoName, setCareerHooks, setMod, spend } from './career';
import { tierOf, type ClauseId } from './clauses';
import { addDays, addMonths, addWeeks, fmtDay, norm, yearsBetween, type Day } from './dates';
import { dealsOf, dealWith } from './deals';
import { round5 } from './economy';
import { homeCountry, tripCost, tripFatigue, upgradeCost } from './life/travel';
import {
  CENTRE_RECOVERY, CENTRE_REHAB, CONDITIONS_T3, HOLIDAY_WEEKS, LONG_INJURY_DAYS, LONG_INJURY_FEES, MENTOR_TRAIN_BONUS, PARTTIME_DATES, PER_DIEM,
  TOUR_HEADLINE_FANS, TRAIN_GAIN_BONUS, TRAIN_PRICE_MULT, TRAVEL_FATIGUE_CUT,
} from './tuning';
import type { Bout, Career, Contract, PlayerMatch, Show } from './types';

/** Someone's best tier of a clause across their deals (training and recovery follow the best set-up you have). */
const best = (c: Career, id: string, clause: ClauseId): number => Math.max(0, ...dealsOf(c.people[id]).map((k) => tierOf(k, clause)));
/** Their tier with the promotion putting on this show. */
const atShow = (c: Career, id: string, show: Show | undefined, clause: ClauseId): number =>
  !show || show.promo === 'TIS' ? 0 : Math.max(0, ...(show.promos ?? [show.promo]).map((p) => tierOf(dealWith(c.people[id], p), clause)));

// ------------------------------------------------------------------ modifiers

// Training & Development: cheaper (Tier 1), free (Tier 2+); coaching's extra gains (Tier 2+), with a mentor's on top (Mentorship Tier 2+).
setMod('trainPrice', (c, id) => TRAIN_PRICE_MULT[best(c, id, 'training')] ?? 1);
setMod('trainGain', (c, id) => 1 + (TRAIN_GAIN_BONUS[best(c, id, 'training')] ?? 0) + (MENTOR_TRAIN_BONUS[best(c, id, 'mentorship')] ?? 0));
// The performance centre (Tier 3): faster recovery and rehab.
setMod('recovery', (c, id) => (best(c, id, 'training') >= 3 ? CENTRE_RECOVERY : 1));
setMod('rehab', (c, id) => (best(c, id, 'training') >= 3 ? CENTRE_REHAB : 1));
// Match Conditions Tier 3: shorter, safer matches on their shows.
setMod('injury', (c, id, show) => (atShow(c, id, show, 'conditions') >= 3 ? CONDITIONS_T3.injury : 1));
setMod('fatigue', (c, id, show) => (atShow(c, id, show, 'conditions') >= 3 ? CONDITIONS_T3.fatigue : 1));
// International Touring Tier 3: you headline their tours abroad, and win more fans there.
setMod('fans', (c, id, show) => (show?.kind === 'tour' && atShow(c, id, show, 'touring') >= 3 ? TOUR_HEADLINE_FANS : 1));

// ------------------------------------------------------------------ cards

/**
 * Match Conditions: no hardcore stipulation for anyone with the clause (Tier 1+). International Touring Tier 3:
 * you headline the tour shows you're on.
 */
setCardHook((c, show, card) => {
  if (show.promo === 'TIS') return;
  for (const b of card) {
    if (b.stip && HARDCORE_STIPS.has(b.stip) && (atShow(c, b.a, show, 'conditions') >= 1 || atShow(c, b.b, show, 'conditions') >= 1)) delete b.stip;
  }
  if (show.kind === 'tour' && atShow(c, c.player, show, 'touring') >= 3) {
    const i = card.findIndex((b) => b.a === c.player || b.b === c.player);
    if (i >= 0 && i < card.length - 1) card.push(card.splice(i, 1)[0]!);
  }
});

/** Match Conditions Tier 2+: turn down the stipulation on a match you're booked in. It costs nothing. */
export function refuseStip(c: Career, showId: string): string {
  const show = c.shows[showId];
  const bout = show?.card?.find((b) => (b.a === c.player || b.b === c.player) && !b.result);
  if (!show || !bout?.stip) return 'There’s no stipulation to turn down.';
  if (atShow(c, c.player, show, 'conditions') < 2) return `Your ${show.promo} deal doesn’t let you approve stipulations.`;
  delete bout.stip;
  return 'Done: it’s a straight match now.';
}

// ------------------------------------------------------------------ after your matches: travel

/**
 * Travel & Accommodation (Lyra's call: who pays, then comfort; long trips tire you): with no clause you pay to get
 * to their dates; Tier 2+ pays a per diem away from home; the further you go the more it takes out of you, less in
 * comfort. Indie trips are always your own.
 */
function afterMatch(c: Career, show: Show, _bout: Bout, _m: PlayerMatch): void {
  const home = homeCountry(c);
  const p = person(c, c.player);
  const indie = show.promo === 'TIS';
  const t = indie ? 0 : atShow(c, c.player, show, 'travel');
  if (!indie) {
    if (t === 0) {
      const cost = tripCost(c, show);
      if (cost) spend(c, -cost, `Travel · ${show.city} (your own way)`, 'travel');
    } else {
      // They pay to get you there (economy); an upgrade you chose is yours (Life).
      const up = upgradeCost(c, show);
      if (up) spend(c, -up, `Travel · ${show.city} (your upgrade)`, 'travel');
    }
    const perDiem = home !== show.country ? PER_DIEM[t] ?? 0 : 0;
    if (perDiem) spend(c, perDiem, `Per diem · ${show.city}`, 'travel');
  }
  const tired = tripFatigue(c, show) * (TRAVEL_FATIGUE_CUT[t] ?? 1);
  if (tired) p.fatigue = Math.min(100, p.fatigue + tired);
}

// ------------------------------------------------------------------ injuries

/**
 * Medical Pay: a payout for a long injury (by tier); Tier 3 holds your spot, so any title shot owed waits for you.
 */
function injured(c: Career, id: string, days: number, show: Show): void {
  if (id !== c.player || c.spectator) return;
  const k = (show.promos ?? [show.promo]).map((x) => dealWith(person(c, id), x)).find(Boolean) ?? person(c, id).contract;
  if (!k) return;
  const t = tierOf(k, 'medical');
  if (days >= LONG_INJURY_DAYS && LONG_INJURY_FEES[t]) {
    const amount = round5(k.fee * LONG_INJURY_FEES[t]!);
    spend(c, amount, `Medical Pay: long-injury payout`, 'medical');
  }
  if (t >= 3) {
    if (k.titleShotBy) k.titleShotBy = addDays(k.titleShotBy, days);
    if (k.rematch) k.rematch.by = addDays(k.rematch.by, days);
    letter(c, { kind: 'injury', from: promoName(k.promo), subject: 'Your spot’s held', body: ['Your Medical Pay covers it: your place on the card, and any title shot you’re owed, wait for you to come back.'] });
  }
}

/** Medical Pay Tier 2+: a deal that ends while you're injured runs on until you're fit (and a fortnight more). */
function ending(c: Career, w: { id: string }, k: Contract): boolean {
  const p = c.people[w.id];
  if (!p?.injury || p.injury.until <= c.today || tierOf(k, 'medical') < 2 || p.next) return false;
  k.end = addDays(p.injury.until, 14);
  if (w.id === c.player) letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Your job’s safe', body: [`Your deal was due to end, but your Medical Pay protects you while you’re injured: it now runs to ${fmtDay(k.end, 'long')}.`] });
  return true;
}

// ------------------------------------------------------------------ schedule

/** Holiday weeks this contract year, and how many the clause gives. */
export function holidays(c: Career, promo?: string): { used: number; allowed: number; k?: Contract } {
  const p = person(c, c.player);
  const k = promo ? dealWith(p, promo) : p.contract ?? undefined;
  if (!k) return { used: 0, allowed: 0 };
  const yearStart = addMonths(k.start, 12 * Math.floor(yearsBetween(k.start, c.today)));
  return { used: (k.holidays ?? []).filter((d) => d >= yearStart).length, allowed: HOLIDAY_WEEKS[tierOf(k, 'schedule')] ?? 0, k };
}

/** Schedule Flexibility: book a holiday week (from the Monday on or after `from`): no bookings, no penalty. */
export function bookHoliday(c: Career, from: Day, promo?: string): string {
  const h = holidays(c, promo);
  if (!h.k) return 'You’re not under contract.';
  if (!h.allowed) return 'Your contract has no holiday weeks.';
  if (h.used >= h.allowed) return `You’ve used your ${h.allowed} holiday week${h.allowed === 1 ? '' : 's'} this contract year.`;
  let monday = norm(from);
  if (monday <= c.today) monday = addWeeks(monday, 1);
  const p = person(c, c.player);
  const week = [monday];
  p.daysOff = [...new Set([...(p.daysOff ?? []), ...week])];
  (h.k.holidays ??= []).push(monday);
  for (const s of Object.values(c.shows)) if (!s.done && week.includes(s.date) && s.card) s.card = s.card.filter((b) => b.result || (b.a !== c.player && b.b !== c.player));
  return `Holiday booked: ${fmtDay(monday, 'long')}. Nobody will book you.`;
}

/** Schedule Flexibility Tier 2+: go part-time (a few dates a month), or back to full-time. */
export function setPartTime(c: Career, on: boolean, promo?: string): string {
  const p = person(c, c.player);
  const k = promo ? dealWith(p, promo) : p.contract;
  if (!k) return 'You’re not under contract.';
  if (tierOf(k, 'schedule') < 2) return 'Part-time needs Schedule Flexibility Tier 2.';
  if (on) { k.dates = PARTTIME_DATES; return `You’re part-time with ${k.promo}: ${PARTTIME_DATES} dates a month.`; }
  if (dealsOf(p).length > 1) return 'You work for more than one major: your dates are split between them.';
  delete k.dates;
  return `You’re back full-time with ${k.promo}.`;
}

// ------------------------------------------------------------------ touring

/** International Touring Tier 2+: opt in or out of their tours. */
export function setTours(c: Career, on: boolean, promo?: string): string {
  const p = person(c, c.player);
  const k = promo ? dealWith(p, promo) : p.contract;
  if (!k || tierOf(k, 'touring') < 2) return 'Picking your tours needs International Touring Tier 2.';
  k.tours = on;
  if (!on) for (const s of Object.values(c.shows)) if (!s.done && s.kind === 'tour' && s.promo === k.promo && s.date > c.today && s.card) s.card = s.card.filter((b) => b.result || (b.a !== c.player && b.b !== c.player));
  return on ? `You’re on ${k.promo}’s tours.` : `You’re off ${k.promo}’s tours.`;
}

/** International Touring Tier 1: skip a tour date you're booked on (or would be), free. */
export function skipTour(c: Career, showId: string): string {
  const s = c.shows[showId];
  if (!s || s.kind !== 'tour') return 'That’s not a tour date.';
  if (atShow(c, c.player, s, 'touring') < 1) return 'Your contract doesn’t let you skip tours.';
  const p = person(c, c.player);
  p.daysOff = [...new Set([...(p.daysOff ?? []), s.date])];
  if (s.card) s.card = s.card.filter((b) => b.result || (b.a !== c.player && b.b !== c.player));
  return `You’re skipping ${s.name}.`;
}

/** Can the booker put you on this show? International Touring: at Tier 2+ only tours you've opted into. */
export function tourOk(c: Career, show: Show): boolean {
  if (show.kind !== 'tour') return true;
  const k = (show.promos ?? [show.promo]).map((x) => dealWith(person(c, c.player), x)).find(Boolean);
  return !k || tierOf(k, 'touring') < 2 || !!k.tours;
}

setBookableHook(tourOk);
setCareerHooks({ mine: afterMatch, injured, ending });
export { mod };
