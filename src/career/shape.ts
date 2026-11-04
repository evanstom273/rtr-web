// The shape of a career (Lyra's design): Booking Commitments (dates and card position, paid when they break it),
// Contract Renewal & Options, Championship Opportunities (rematches; reign protection lives in the booker), Push &
// Marketing, Retirement & Legacy (a farewell, a send-off, a pension) and Mentorship.
import { findWrestler, globalScore, rosterOf, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondsOf, moveBond } from '../world/people';
import { datesThisMonth, setCardHook, setPromiseHook } from './booker';
import { letter, makeOffer, person, promoName, setCareerHooks, setMod, spend } from './career';
import { tierOf } from './clauses';
import { addDays, addMonths, daysBetween, fmtDay } from './dates';
import { dealsOf, dealWith } from './deals';
import { round5 } from './economy';
import { arrangeFarewell } from './specials';
import {
  COMMIT_BREACH_WALK, COMMIT_DATES, COMMIT_MAIN_SHARE, OPTION_MONTHS, OPTION_TAKE_CHANCE, PENSION_FEES, PROTEGE_AGE, PROTEGE_REP, PROTEGES_MAX, PUSH_MULT, REMATCH_DAYS,
  RENEWAL_RAISE, RENEWAL_TALKS_DAYS, RETIRE_NOTICE_DAYS, SENDOFF_FEES,
} from './tuning';
import type { Bout, Career, Contract, PlayerMatch, Show } from './types';

const showDeal = (c: Career, id: string, show: Show): Contract | undefined =>
  (show.promos ?? [show.promo]).map((x) => dealWith(c.people[id], x)).find(Boolean);

// ------------------------------------------------------------------ Push & Marketing

/** Push & Marketing (Lyra's call: a fan-growth multiplier) on their shows, for you and the AI alike. */
setMod('fans', (c, id, show) => (show && show.promo !== 'TIS' ? PUSH_MULT[tierOf(showDeal(c, id, show), 'push')] ?? 1 : 1));

// ------------------------------------------------------------------ Booking Commitments

/** The dates a month they've committed to, and their big shows at Tier 3: the booker wants you on. */
setPromiseHook((c, show) => {
  const k = showDeal(c, c.player, show);
  const t = tierOf(k, 'booking');
  if (!k || !t) return false;
  if (t >= 3 && (show.kind === 'special' || show.kind === 'flagship')) return true;
  return datesThisMonth(c, c.player, show.date, k.promo) < (COMMIT_DATES[t] ?? 0);
});

/** Card position: never the opener (Tier 1), the upper half (Tier 2), and a share of main events (Tier 3). */
setCardHook((c, show, card) => {
  if (show.promo === 'TIS' || card.length < 2) return;
  const i = card.findIndex((b) => b.a === c.player || b.b === c.player);
  if (i < 0 || (c.heat && (show.promos ?? [show.promo]).includes(c.heat.promo))) return;
  const t = tierOf(showDeal(c, c.player, show), 'booking');
  if (!t) return;
  const move = (to: number) => { const [b] = card.splice(i, 1); card.splice(Math.min(card.length, to), 0, b!); };
  if (t >= 3 && seededRng(hashSeed(c.seed, 'main', show.id))() < COMMIT_MAIN_SHARE) { if (i !== card.length - 1) move(card.length); return; }
  const floor = t >= 2 ? Math.floor(card.length / 2) : 1;
  if (i < floor) move(floor);
});

/** The first of the month: were last month's committed dates kept? Short is paid anyway; enough breaches and you can walk. */
function commitments(c: Career): void {
  const p = c.people[c.player];
  if (!p) return;
  const last = addDays(c.today, -1).slice(0, 7);
  for (const k of dealsOf(p)) {
    const t = tierOf(k, 'booking');
    if (!t || k.start.slice(0, 7) >= last || k.checked === last) continue;
    k.checked = last;
    // You weren't available much (hurt, on holiday, suspended): not their breach.
    const off = (p.daysOff ?? []).filter((d) => d.startsWith(last)).length;
    const hurt = c.ledger.some((e) => e.kind === 'medical' && e.day.startsWith(last));
    if (off >= 7 || hurt) continue;
    const worked = c.history.filter((m) => m.promo === k.promo && m.day.startsWith(last)).length;
    const short = (COMMIT_DATES[t] ?? 0) - worked;
    if (short <= 0) continue;
    spend(c, round5(k.fee * short), `Booking Commitments: ${short} date${short === 1 ? '' : 's'} ${k.promo} owed you`, 'fee');
    k.breaches = (k.breaches ?? 0) + 1;
    if (k.breaches >= COMMIT_BREACH_WALK && !k.breachExit) {
      k.breachExit = true;
      letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'You can walk', body: [`${k.promo} have broken their booking commitments ${k.breaches} times. You can leave them whenever you like, free (Requests › Your contract).`] });
    } else letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Dates you were owed', body: [`${k.promo} didn’t give you the dates they committed to last month, so they’ve paid you for ${short}. That’s ${k.breaches} breach${k.breaches === 1 ? '' : 'es'}: at ${COMMIT_BREACH_WALK} you can walk.`] });
  }
}

// ------------------------------------------------------------------ Championship Opportunities: rematches

/** After your match: a title match settles a rematch or a guaranteed shot; losing a title (Tier 1+) earns a rematch. */
function afterMatch(c: Career, show: Show, bout: Bout, m: PlayerMatch): void {
  if (!bout.title || show.promo === 'TIS') return;
  const k = showDeal(c, c.player, show);
  if (!k) return;
  if (k.rematch?.title === bout.title) delete k.rematch;
  delete k.titleShotBy;
  if (bout.a === c.player && m.result === 'loss' && tierOf(k, 'title') >= 1) {
    k.rematch = { title: bout.title, by: addDays(c.today, REMATCH_DAYS) };
    letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'You’re owed a rematch', body: [`Your Championship Opportunities clause: a rematch before ${fmtDay(k.rematch.by, 'long')}.`] });
  }
}

// ------------------------------------------------------------------ Contract Renewal & Options

/** Renewal talks (Lyra's call: early at Tier 1+), and a rematch they didn't give you. Every day. */
function daily(c: Career): void {
  const p = c.people[c.player];
  if (!p || c.spectator) return;
  for (const k of dealsOf(p)) {
    if (k.rematch && k.rematch.by < c.today) {
      delete k.rematch;
      k.breaches = (k.breaches ?? 0) + 1;
      letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'No rematch', body: [`${k.promo} never gave you your rematch. That’s a broken promise on your record with them (${k.breaches}).`] });
      if (k.breaches >= COMMIT_BREACH_WALK) k.breachExit = true;
    }
    // Their renewal offer, when talks open: earlier with a better clause; a guaranteed raise at Tier 2+.
    const t = tierOf(k, 'renewal');
    if (!k.talked && !p.next && k === p.contract && daysBetween(c.today, k.end) <= (RENEWAL_TALKS_DAYS[t] ?? 90) && !c.offers.some((o) => o.promo === k.promo && o.status === 'open')) {
      k.talked = true;
      const me = findWrestler(c.player)!;
      const roster = rosterOf(k.promo);
      const below = roster.filter((w) => globalScore(w) < globalScore(me)).length / Math.max(1, roster.length);
      if (t >= 2 || below >= 0.25) {
        makeOffer(c, k.promo, 'Your deal’s coming up');
        const o = c.offers.find((x) => x.promo === k.promo && x.status === 'open');
        if (o) o.fee = Math.max(o.fee, round5(k.fee * (1 + (RENEWAL_RAISE[t] ?? 0))));
      }
    }
  }
}

/**
 * Your deal reaching its end. None: they hold the option, and take up a year on the same terms if they want you
 * (and you haven't signed elsewhere). Mutual (Tier 1): they still might. Tier 3 renews itself with a raise unless
 * you've said you're walking. (Your Option, Tier 2, is yours to take before the end.)
 */
function ending(c: Career, w: Wrestler, k: Contract, rnd: Rng): boolean {
  if (w.id !== c.player || c.spectator) return false;
  const p = person(c, c.player);
  if (p.next || k.leaving || k.optioned) return false;
  const t = tierOf(k, 'renewal');
  if (t >= 3) {
    if (k.walk) return false;
    k.end = addMonths(k.end, OPTION_MONTHS);
    k.fee = round5(k.fee * (1 + (RENEWAL_RAISE[3] ?? 0)));
    k.optioned = true;
    letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Renewed', body: [`Your deal renews itself: another ${OPTION_MONTHS} months at £${k.fee.toLocaleString('en-GB')} a match.`] });
    return true;
  }
  if (t <= 1) {
    const roster = rosterOf(k.promo);
    const below = roster.filter((x) => globalScore(x) < globalScore(w)).length / Math.max(1, roster.length);
    if (below >= 0.5 && rnd() < OPTION_TAKE_CHANCE) {
      k.end = addMonths(k.end, OPTION_MONTHS);
      k.optioned = true;
      letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'We’ve taken up our option', body: [`Your contract gives us an option year, and we’re taking it: you’re with us to ${fmtDay(k.end, 'long')}, same terms.`] });
      return true;
    }
  }
  return false;
}

/** Take up your option year (Mutual Option and up), within six months of the end. */
export function takeOption(c: Career, promo?: string): string {
  const p = person(c, c.player);
  const k = promo ? dealWith(p, promo) : p.contract;
  if (!k) return 'You’re not under contract.';
  const t = tierOf(k, 'renewal');
  if (t < 1) return 'Your contract gives the option to them, not you.';
  if (k.optioned) return 'You’ve already taken your option year.';
  if (daysBetween(c.today, k.end) > 183) return `You can take it from ${fmtDay(addMonths(k.end, -6), 'dm')}.`;
  k.end = addMonths(k.end, OPTION_MONTHS);
  k.optioned = true;
  return `Option taken: you’re with ${k.promo} to ${fmtDay(k.end, 'dm')} ${k.end.slice(0, 4)}, same terms.`;
}

/** Full Control (Tier 3): let it run out instead of renewing itself. */
export function setWalk(c: Career, walk: boolean, promo?: string): string {
  const p = person(c, c.player);
  const k = promo ? dealWith(p, promo) : p.contract;
  if (!k || tierOf(k, 'renewal') < 3) return 'Only Full Control renews itself.';
  k.walk = walk;
  return walk ? `It won’t renew: you’re out on ${fmtDay(k.end, 'dm')}.` : 'It’ll renew itself, with a raise.';
}

// ------------------------------------------------------------------ Retirement & Legacy

/**
 * Hang up the boots. With the clause your farewell match is guaranteed on one of their big shows (Tier 1), it's
 * their night for you with a purse (Tier 2), and there's a pension (Tier 3). Without it, your last day is a month off.
 */
export function announceRetirement(c: Career): string {
  const p = person(c, c.player);
  if (p.retiring) return `You’ve already announced it: your last day is ${fmtDay(p.retiring, 'dm')}.`;
  const me = findWrestler(c.player)!;
  const k = p.contract;
  const t = tierOf(k, 'retirement');
  if (k) c.retireDeal = { promo: k.promo, fee: k.fee, tier: t };
  let day = addDays(c.today, RETIRE_NOTICE_DAYS);
  if (t >= 1 || !k) day = arrangeFarewell(c, me, seededRng(hashSeed(c.seed, 'farewell', c.today)));
  p.retiring = day;
  if (k && k.end < day) k.end = day;
  if (t >= 2) {
    const s = Object.values(c.shows).find((x) => x.special?.kind === 'farewell' && x.special.for === c.player);
    if (s) s.special!.tag = `A Night for ${me.name}`;
  }
  letter(c, { kind: 'contract', from: k ? promoName(k.promo) : 'The Indie Scene', subject: 'You’re retiring', body: [
    t >= 1 || !k ? `Your farewell is on ${fmtDay(day, 'long')}.${t >= 2 ? ' The whole night is in your honour.' : ''}` : `Your last day is ${fmtDay(day, 'long')}. Your contract doesn’t guarantee a farewell match.`,
    t >= 3 ? 'Your pension is waiting.' : '',
  ].filter(Boolean) });
  return `Announced. Your last day is ${fmtDay(day, 'dm')}.`;
}

/** Once you've retired: the send-off purse and the pension, and the career is over. */
function retiredCheck(c: Career): void {
  const p = c.people[c.player];
  if (!p?.retired || c.over) return;
  c.over = c.today;
  const d = c.retireDeal;
  if (d && d.tier >= 2) spend(c, round5(d.fee * SENDOFF_FEES), `Send-off purse · ${d.promo}`, 'bonus');
  if (d && d.tier >= 3) spend(c, round5(d.fee * PENSION_FEES), `Pension · ${d.promo}`, 'bonus');
  letter(c, { kind: 'contract', from: d ? promoName(d.promo) : 'The Indie Scene', subject: 'That’s a career', body: [`You’ve wrestled your last match: ${c.history.length} of them, ${c.history.filter((m) => m.result === 'win').length} wins.`, d && d.tier >= 3 ? 'Your pension’s paid in. Enjoy it.' : 'Thanks for everything.'] });
}

// ------------------------------------------------------------------ Mentorship

/**
 * Mentorship (Lyra's call): an assigned mentor (Tier 1), a bigger name and a little extra from training (Tier 2, in
 * body.ts), your choice of mentor (Tier 3); a veteran at Tier 3 takes on protégés, who add to their reputation.
 */
function mentorship(c: Career): void {
  const P = activeWorld().people;
  const me = findWrestler(c.player);
  if (!P || !me || c.spectator) return;
  for (const k of dealsOf(c.people[c.player])) {
    const t = tierOf(k, 'mentorship');
    if (!t) continue;
    const mine = bondsOf(P, c.player).filter((b) => b.bond.kind === 'mentor');
    if (me.age < PROTEGE_AGE) {
      if (mine.some((b) => b.bond.mentor !== c.player)) continue;
      const vets = rosterOf(k.promo).filter((w) => w.id !== c.player && w.age >= 30 && !c.people[w.id]?.retired).sort((a, b) => globalScore(b) - globalScore(a));
      const picked = t >= 3 && c.mentorPick ? vets.find((w) => w.id === c.mentorPick) : undefined;
      const who = picked ?? (t >= 2 ? vets[0] : vets[Math.floor(seededRng(hashSeed(c.seed, 'mentor', c.today))() * Math.min(8, vets.length))]);
      if (!who) continue;
      moveBond(P, who.id, c.player, 15, `${k.promo} paired you up`, c.today, 'mentor', who.id);
      letter(c, { kind: 'person', from: who.name, subject: 'I’m your mentor now', body: [`${k.promo} asked me to keep an eye on you. Ask me anything.`], fromId: who.id });
    } else if (t >= 3) {
      const proteges = mine.filter((b) => b.bond.mentor === c.player);
      if (proteges.length < PROTEGES_MAX) {
        const young = rosterOf(k.promo).filter((w) => w.age <= 23 && w.id !== c.player && !bondsOf(P, w.id).some((b) => b.bond.kind === 'mentor')).sort((a, b) => globalScore(b) - globalScore(a))[0];
        if (young) moveBond(P, c.player, young.id, 15, `${k.promo} paired you up`, c.today, 'mentor', c.player);
      }
      const n = Math.min(PROTEGES_MAX, bondsOf(P, c.player).filter((b) => b.bond.kind === 'mentor' && b.bond.mentor === c.player).length);
      if (n) person(c, c.player).rep = Math.min(100, person(c, c.player).rep + PROTEGE_REP * n);
    }
  }
}

/** Mentorship Tier 3: pick your mentor (from next month). */
export function pickMentor(c: Career, id: string): string {
  if (!dealsOf(c.people[c.player]).some((k) => tierOf(k, 'mentorship') >= 3)) return 'Picking your mentor needs Mentorship Tier 3.';
  const w = findWrestler(id);
  if (!w) return 'Who?';
  c.mentorPick = id;
  const P = activeWorld().people;
  if (P) for (const b of bondsOf(P, c.player)) if (b.bond.kind === 'mentor' && b.bond.mentor !== c.player) delete b.bond.kind;
  return `${w.name} it is: they’ll take you on.`;
}

function monthly(c: Career): void {
  if (c.spectator) return;
  commitments(c);
  mentorship(c);
}

setCareerHooks({ mine: afterMatch, daily: (c) => { daily(c); retiredCheck(c); }, monthly, ending });
