// Behaviour (Lyra's design): Social Media Policy (their rules on going after their roster, then freedom, then
// their channels amplifying you) and Conduct & Discipline (fines, not suspensions: tiers soften the fines for
// no-shows, going off-script and online beefs; three no-shows in 90 days is a suspension whatever the tier).
// No-shows are a real choice now: "Don't turn up" on the show screen.
import { findWrestler, globalScore, rosterOf, worksFor } from '../data/rtr';
import { setBookableHook } from './booker';
import { letter, person, promoName, setCareerHooks, spend } from './career';
import { tierOf } from './clauses';
import { activeWorld } from '../world/world';
import { bookerOf, likeOf } from '../world/people';
import { setSocialFine } from './social';
import { addDays, daysBetween, fmtDay } from './dates';
import { dealsOf, dealWith } from './deals';
import { round5 } from './economy';
import { movePatience, showBooker } from './patience';
import { remember } from './relations';
import { CONDUCT_FINES, CONDUCT_MULT, PATIENCE_NO_SHOW, REP_NO_SHOW, SOCIAL_FINE_FEES, SOCIAL_FINE_PATIENCE, SUSPENSION , BOOKER_LIKE } from './tuning';
import type { Bout, Career, Contract, PlayerMatch, Show } from './types';

/** A fine under Conduct & Discipline: weekly fees × what the offence costs × how lenient your deal is. */
function fine(c: Career, k: Contract, fees: number, why: string): number {
  // A booker who likes you goes easier (relationships stage 5).
  const P = activeWorld().people, bk = P ? bookerOf(P, k.promo) : undefined;
  const soft = bk && P ? 1 - Math.max(0, likeOf(P, bk.id, c.player)) / BOOKER_LIKE.fines : 1;
  const amount = round5(k.fee * fees * (CONDUCT_MULT[tierOf(k, 'conduct')] ?? 1) * soft);
  if (amount > 0) spend(c, -amount, `Fined by ${k.promo}: ${why}`, 'event');
  return amount;
}

/**
 * Don't turn up (Lyra's call: a real option on the show screen). You're off the card, your reputation and their
 * patience take the hit, they fine you by your Conduct & Discipline tier, and a third in 90 days is a suspension.
 */
export function noShow(c: Career, showId: string): string {
  const show = c.shows[showId];
  const bout = show?.card?.find((b) => (b.a === c.player || b.b === c.player) && !b.result);
  if (!show || !bout) return 'You’re not on that card.';
  const p = person(c, c.player);
  show.card = show.card!.filter((b) => b !== bout);
  p.rep = Math.max(0, p.rep + REP_NO_SHOW);
  p.noShows = [...(p.noShows ?? []).filter((d) => daysBetween(d, c.today) < SUSPENSION.windowDays), c.today];
  delete c.indie[show.id];
  if (show.promo === 'TIS') {
    movePatience(c, showBooker(show), PATIENCE_NO_SHOW, `Didn't turn up to ${show.name}`);
    return `You didn’t turn up to ${show.name}. Reputation ${REP_NO_SHOW}. The promoter won’t forget.`;
  }
  const k = (show.promos ?? [show.promo]).map((x) => dealWith(p, x)).find(Boolean);
  movePatience(c, show.promo, PATIENCE_NO_SHOW, `Didn't turn up to ${show.name}`);
  remember(c, show.promo, 'noShows');
  const paid = k ? fine(c, k, CONDUCT_FINES.noShow, `no-show at ${show.name}`) : 0;
  let said = `You didn’t turn up to ${show.name}. Reputation ${REP_NO_SHOW}, patience ${PATIENCE_NO_SHOW}${paid ? `, fined £${paid.toLocaleString('en-GB')}` : ''}.`;
  if (p.noShows.length >= SUSPENSION.noShows) {
    p.suspendedUntil = addDays(c.today, SUSPENSION.days);
    p.noShows = [];
    for (const s of Object.values(c.shows)) if (!s.done && s.date > c.today && s.date < p.suspendedUntil && s.card) s.card = s.card.filter((b) => b.result || (b.a !== c.player && b.b !== c.player));
    said += ` That’s three: you’re suspended until ${fmtDay(p.suspendedUntil, 'dm')}.`;
    letter(c, { kind: 'contract', from: promoName(show.promo), subject: 'You’re suspended', body: [`Three no-shows in ${SUSPENSION.windowDays} days. You’re off our shows until ${fmtDay(p.suspendedUntil, 'long')}, unpaid.`] });
  }
  return said;
}

/** Suspended: no bookings. */
setBookableHook((c) => { const p = c.people[c.player]; return !p?.suspendedUntil || p.suspendedUntil <= c.today; });

/** Going off-script costs a fine as well (Creative Control Tier 3 covers it). */
function afterMatch(c: Career, show: Show, _bout: Bout, m: PlayerMatch): void {
  if (m.planned !== 'off-script' || show.promo === 'TIS') return;
  const k = (show.promos ?? [show.promo]).map((x) => dealWith(person(c, c.player), x)).find(Boolean);
  if (!k || tierOf(k, 'creative') >= 3) return;
  const paid = fine(c, k, CONDUCT_FINES.offScript, `going off-script at ${show.name}`);
  if (paid) letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Fined', body: [`You went off-script at ${show.name}. That’s £${paid.toLocaleString('en-GB')}.`] });
}

/**
 * Social Media Policy (Lyra's call): going after someone on their roster online. None: their rules, a fine and
 * their booker's patience. Some Freedom: a smaller fine, and only for their top names. Free Rein and up: nothing.
 * Conduct & Discipline softens any fine.
 */
export function socialFine(c: Career, kind: 'callout' | 'beef', target: string): string | null {
  const them = findWrestler(target);
  if (!them) return null;
  const k = dealsOf(c.people[c.player]).find((x) => worksFor(them, x.promo));
  if (!k) return null;
  const t = tierOf(k, 'social');
  if (t >= 2) return null;
  if (t === 1) {
    const roster = rosterOf(k.promo);
    const above = roster.filter((w) => globalScore(w) > globalScore(them)).length / Math.max(1, roster.length);
    if (above > 0.25) return null;
  }
  const paid = fine(c, k, (SOCIAL_FINE_FEES[t] ?? 0) + (kind === 'beef' ? CONDUCT_FINES.beef : 0), `going after ${them.name} online`);
  if (t === 0) movePatience(c, k.promo, SOCIAL_FINE_PATIENCE, `Went after ${them.name} online`);
  return paid ? `${k.promo} fined you £${paid.toLocaleString('en-GB')} for it.` : t === 0 ? `${k.promo} weren’t happy.` : null;
}

setSocialFine(socialFine);
setCareerHooks({ mine: afterMatch });
