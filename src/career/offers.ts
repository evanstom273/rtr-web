// Work coming your way: indie bookings, asking for a spot, tryouts and contract offers.
import { PROMOTIONS, TITLES, WRESTLERS, findWrestler } from '../data/rtr';
import type { Rng } from '../engine/rng';
import { seededRng } from '../engine/rng';
import { available, hashSeed, promoRegion, regionalPop } from './booker';
import { letter, makeOffer, person, promoName, setCareerHooks, spend } from './career';
import { C } from './clauses';
import { addDays, addMonths, daysBetween, fmtDay, weekday, type Day } from './dates';
import { indieFee, travelCost } from './economy';
import {
  ASK_SPOT_BASE_PCT, ASK_SPOT_MAX_PCT, DAY_OFF_T1_CHANCE, INDIE_OFFER_WINDOW_DAYS, INDIE_OFFERS_BASE, INDIE_OFFERS_PER_POP, INDIE_T1_APPROVAL, NOTICE_CHANCE, REP_NO_SHOW, PATIENCE_NO_SHOW, INDIE_OFFER_CHAMPION, INDIE_OFFER_TRUSTED, TRUST_HIGH, TRUST_LOW,
} from './tuning';
import type { Career, Letter, Show } from './types';
import { movePatience, showBooker } from './patience';
import { remember, trust } from './relations';

/** Can you take an indie date on this day? (Free agents always; signed wrestlers by their Indie Bookings tier.) */
export function indieAllowed(c: Career, day: Day): { ok: boolean; why?: string; needsApproval?: boolean } {
  const p = person(c, c.player);
  if (p.injury && p.injury.until > day) return { ok: false, why: 'You’re injured that day.' };
  if (Object.keys(c.indie).some((id) => c.shows[id]?.date === day)) return { ok: false, why: 'You’ve already got an indie date that day.' };
  const k = p.contract;
  const tier = k?.clauses[C.indie] ?? 0;
  // Already on a card that day: only Unrestricted indie bookings let you take a clashing date.
  const onCard = Object.values(c.shows).some((s) => s.date === day && s.card?.some((b) => b.a === c.player || b.b === c.player));
  if (onCard && (!k || tier < 3)) return { ok: false, why: 'You’re already booked that day.' };
  if (!k) return { ok: true };
  if (tier === 0) return { ok: false, why: `Your ${k.promo} contract doesn’t allow indie dates.` };
  const clash = Object.values(c.shows).some((s) => s.date === day && (s.promos ?? [s.promo]).includes(k.promo));
  if (clash && tier < 3) return { ok: false, why: `${k.promo} have a show that day.` };
  return { ok: true, needsApproval: tier === 1 };
}

/** Put you on an indie show you've agreed to. If its card is already drawn up, add a match. */
export function joinIndie(c: Career, show: Show, fee: number, travel: number): void {
  c.indie[show.id] = { fee, travel };
  // Unrestricted indie bookings can clash with a contracted date: you miss that date, and it costs you.
  const k = person(c, c.player).contract;
  if (k) {
    for (const s of Object.values(c.shows)) {
      if (s.date !== show.date || s.id === show.id || !s.card?.some((b) => b.a === c.player || b.b === c.player)) continue;
      s.card = s.card.filter((b) => b.a !== c.player && b.b !== c.player);
      const p = person(c, c.player);
      p.rep = Math.max(0, p.rep + REP_NO_SHOW);
      movePatience(c, k.promo, PATIENCE_NO_SHOW, `Missed ${s.name} for an indie date`);
      remember(c, k.promo, 'noShows');
      letter(c, { kind: 'contract', from: promoName(k.promo), subject: `You’re missing ${s.name}`, body: [`You’ve taken an indie date the same night. Your contract lets you, but ${k.promo} aren’t happy: reputation ${REP_NO_SHOW}.`] });
    }
  }
  if (!show.card) return;
  const busy = new Set<string>();
  for (const s of Object.values(c.shows)) if (s.date === show.date) for (const b of s.card ?? []) { busy.add(b.a); busy.add(b.b); }
  const me = findWrestler(c.player)!;
  const opp = WRESTLERS.filter((w) => w.promotion === 'TIS' && w.id !== c.player && !busy.has(w.id) && available(c.people[w.id], show.date))
    .sort((a, b) => Math.abs(regionalPop(a, show.region) - regionalPop(me, show.region)) - Math.abs(regionalPop(b, show.region) - regionalPop(me, show.region)))[0];
  if (opp) show.card.splice(Math.max(0, show.card.length - 1), 0, { a: opp.id, b: c.player });
}

export function acceptLetter(c: Career, l: Letter): string {
  const a = l.action;
  if (!a || l.done) return '';
  if (a.type === 'indie') {
    const show = c.shows[a.show];
    if (!show || show.date <= c.today) { l.done = 'expired'; return 'That show’s been and gone.'; }
    const ok = indieAllowed(c, show.date);
    if (!ok.ok) return ok.why ?? 'You can’t make that date.';
    if (ok.needsApproval && seededRng(hashSeed(c.seed, 'approve', l.id))() >= INDIE_T1_APPROVAL) {
      l.done = 'declined';
      return `${person(c, c.player).contract!.promo} said no to this one.`;
    }
    joinIndie(c, show, a.fee, a.travel);
    l.done = 'accepted';
    return `You’re booked: ${show.name}, ${fmtDay(show.date, 'dm')}.`;
  }
  if (a.type === 'tryout') {
    const show = c.shows[a.show];
    if (!show || show.date <= c.today) { l.done = 'expired'; return 'The tryout date has passed.'; }
    c.tryouts[show.id] = a.promo;
    if (show.card) show.card = null; // redraw it with you on
    l.done = 'accepted';
    return `Tryout booked: ${show.name}, ${fmtDay(show.date, 'dm')}.`;
  }
  return '';
}

export function declineLetter(c: Career, l: Letter): void {
  if (!l.action || l.done) return;
  l.done = 'declined';
  if (l.action.type === 'negotiate') {
    const o = c.offers.find((x) => x.id === (l.action as { offer: string }).offer);
    if (o && o.status === 'open') o.status = 'declined';
  }
}

/** Ask an indie promoter for a spot on their show. */
export function askForSpot(c: Career, show: Show): { ok: boolean; text: string } {
  if (show.done || show.date < c.today) return { ok: false, text: 'That show’s been and gone.' };
  const allowed = indieAllowed(c, show.date);
  if (!allowed.ok) return { ok: false, text: allowed.why ?? 'You can’t make that date.' };
  if (c.indie[show.id]) return { ok: false, text: 'You’re already on it.' };
  const me = findWrestler(c.player)!;
  const chance = Math.min(ASK_SPOT_MAX_PCT, ASK_SPOT_BASE_PCT + me.popularity.global) / 100;
  const asked = (c.asked ??= {});
  if (asked[show.id]) return { ok: false, text: 'They’ve already said no.' };
  asked[show.id] = true;
  if (seededRng(hashSeed(c.seed, 'ask', show.id))() >= chance) return { ok: false, text: 'They’re full. Maybe next time.' };
  const fee = indieFee(me, show.region), travel = travelCost(me.country, show.country);
  joinIndie(c, show, fee, travel);
  return { ok: true, text: `You’re on: £${fee.toLocaleString('en-GB')}${travel ? `, travel £${travel}` : ''}.` };
}

/** Mondays: indie promoters write with bookings. */
function indieOffers(c: Career, rnd: Rng): void {
  const p = person(c, c.player);
  if (p.contract && (p.contract.clauses[C.indie] ?? 0) === 0) return;
  const me = findWrestler(c.player)!;
  // A champion draws more interest.
  const champ = TITLES.some((t) => t.holder === c.player);
  const n = INDIE_OFFERS_BASE + Math.floor(me.popularity.global / INDIE_OFFERS_PER_POP) + (champ ? 1 : 0);
  const home = me.region;
  const shows = Object.values(c.shows)
    .filter((s) => s.promo === 'TIS' && s.date > addDays(c.today, 1) && s.date <= addDays(c.today, INDIE_OFFER_WINDOW_DAYS) && indieAllowed(c, s.date).ok)
    .filter((s) => trust(c, showBooker(s)) >= TRUST_LOW)
    .map((s) => ({ s, w: (regionalPop(me, s.region) + 5) * (s.country === me.country ? 2 : 1) * (0.5 + rnd())
      * (trust(c, showBooker(s)) >= TRUST_HIGH ? INDIE_OFFER_TRUSTED : 1) * (champ ? INDIE_OFFER_CHAMPION : 1) }))
    .sort((a, b) => b.w - a.w);
  const days = new Set<string>();
  let sent = 0;
  for (const { s } of shows) {
    if (sent >= n) break;
    if (days.has(s.date)) continue;
    days.add(s.date);
    const fee = indieFee(me, s.region), travel = travelCost(me.country, s.country);
    const ok = indieAllowed(c, s.date);
    letter(c, {
      kind: 'offer', from: `${s.name} · ${s.city}, ${s.country}`, subject: `Booking: ${s.name}`,
      body: [`We’re running ${s.name} in ${s.city} on ${fmtDay(s.date, 'long')} and want you on the card.`],
      terms: [['Date', fmtDay(s.date)], ['Fee', `£${fee.toLocaleString('en-GB')}`], ['Travel', travel ? `£${travel}` : 'None']],
      ...(p.contract ? { note: ok.needsApproval ? `Your Indie Bookings clause (Tier 1) means ${p.contract.promo} have to approve it.` : `Your Indie Bookings clause allows it.` } : {}),
      action: { type: 'indie', show: s.id, fee, travel, ...(ok.needsApproval ? { needsApproval: true } : {}) },
    });
    sent++;
  }
  void home;
}

/** The 1st of the month: promotions take notice of free agents (and anyone whose deal is nearly up). */
function notice(c: Career, rnd: Rng): void {
  const p = person(c, c.player);
  const me = findWrestler(c.player)!;
  if (p.next) return;
  const freeAgent = !p.contract;
  if (!freeAgent && daysBetween(c.today, p.contract!.end) > 183) return;
  for (const promo of PROMOTIONS.filter((x) => !x.indie && x.initials !== p.contract?.promo)) {
    if (c.offers.some((o) => o.promo === promo.initials && o.status === 'open')) continue;
    const region = promoRegion(promo.initials);
    const pops = WRESTLERS.filter((w) => w.promotion === promo.initials).map((w) => regionalPop(w, region)).sort((a, b) => a - b);
    const q1 = pops[Math.floor(pops.length / 4)] ?? 0, median = pops[Math.floor(pops.length / 2)] ?? 0;
    const mine = regionalPop(me, region);
    if (rnd() >= NOTICE_CHANCE) continue;
    if (mine >= median) makeOffer(c, promo.initials, 'We’ve been watching you');
    else if (mine >= q1 && freeAgent) tryoutInvite(c, promo.initials);
  }
}

function tryoutInvite(c: Career, promo: string): void {
  const show = Object.values(c.shows)
    .filter((s) => s.promo === promo && s.date >= addDays(c.today, 3) && s.date <= addDays(c.today, 30) && (s.kind === 'weekly' || s.kind === 'tour' || s.kind === 'special'))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .find((s) => indieAllowed(c, s.date).ok || !person(c, c.player).contract);
  if (!show) return;
  letter(c, {
    kind: 'offer', from: promoName(promo), subject: `Tryout: ${show.name}`,
    body: [`We’d like to see you in our ring. One match at ${show.name} in ${show.city}, ${fmtDay(show.date, 'long')}.`, 'Win, or put on a good match (3★ or better), and we’ll talk contract.'],
    terms: [['Date', fmtDay(show.date)], ['Show', show.name]],
    action: { type: 'tryout', show: show.id, promo },
  });
}

/** Every day: Monday's indie mail, promises coming due, notice running out. */
function daily(c: Career, rnd: Rng): void {
  if (weekday(c.today) === 1) indieOffers(c, rnd);
  // Old offers lapse once their date has passed.
  for (const l of c.letters) {
    if (l.done || !l.action) continue;
    if ((l.action.type === 'indie' || l.action.type === 'tryout') && (c.shows[l.action.show]?.date ?? '0') <= c.today) l.done = 'expired';
  }
  const p = person(c, c.player);
  const k = p.contract;
  if (k?.titleShotBy && k.titleShotBy < c.today) titleShotBreach(c);
  if (k?.leaving && k.leaving <= c.today) {
    k.end = addDays(c.today, -1);
  }
  // Wage Matching Tier 3: a rival offer above your fee raises it straight away.
  if (k && (k.clauses[C.wage] ?? 0) >= 3) {
    const rival = c.offers.filter((o) => o.status === 'open' && o.promo !== k.promo).reduce((m, o) => Math.max(m, o.fee), 0);
    if (rival > k.fee) {
      k.fee = rival;
      letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Your fee has gone up', body: [`Your Wage Matching clause matched a rival offer: you’re on £${rival.toLocaleString('en-GB')} a match now.`] });
    }
  }
}

function titleShotBreach(c: Career): void {
  const k = person(c, c.player).contract!;
  const tier = k.clauses[C.title] ?? 0;
  delete k.titleShotBy;
  const fees = tier >= 3 ? 8 : 4;
  spend(c, k.fee * fees, `${k.promo} missed your guaranteed title shot`, 'bonus');
  if (tier >= 3) k.clauses[C.exit] = 3;
  letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'We owe you a title shot', body: [`We didn’t get you a title match in time. That’s £${(k.fee * fees).toLocaleString('en-GB')} compensation${tier >= 3 ? ', and you’re free to leave whenever you like' : ''}.`] });
}

/** Set the clock on a Championship Opportunities promise when a contract starts. */
export function startTitlePromise(c: Career): void {
  const k = person(c, c.player).contract;
  if (!k) return;
  const tier = k.clauses[C.title] ?? 0;
  if (tier >= 2) k.titleShotBy = addDays(c.today, tier >= 3 ? 60 : 120);
}

/** Schedule Flexibility: ask for a day off (Tier 1+, granted by chance below Tier 2) or refuse a date (Tier 3). */
export function dayOff(c: Career, day: Day): string {
  const p = person(c, c.player);
  const k = p.contract;
  const tier = k?.clauses[C.schedule] ?? 0;
  if (!k || tier === 0) return 'Your contract has no Schedule Flexibility.';
  if (day <= c.today) return 'Too late for that.';
  const booked = Object.values(c.shows).find((s) => s.date === day && s.card?.some((b) => b.a === c.player || b.b === c.player));
  if (booked && tier < 3) return `You’re already on ${booked.name}. Only Tier 3 lets you refuse a date.`;
  if (tier === 1 && seededRng(hashSeed(c.seed, 'dayoff', day))() >= DAY_OFF_T1_CHANCE) return `${k.promo} need you that day.`;
  (p.daysOff ??= []).push(day);
  if (booked) booked.card = booked.card!.filter((b) => b.a !== c.player && b.b !== c.player);
  return booked ? `Refused: you’re off ${booked.name}, no penalty.` : `${fmtDay(day, 'dm')} is yours: ${k.promo} won’t book you.`;
}

setCareerHooks({ notice, daily });
export { addMonths };
