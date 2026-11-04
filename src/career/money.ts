// The money clauses (Lyra's design): Guaranteed Pay's monthly minimum and pulled-from-the-card pay, Wage
// Matching's raises and parity, Performance Bonuses, Merchandise Rights' online store cut, Profit Share,
// Signing Bonus & Advances, Loyalty & Tenure, and Character & Image Rights (leave without them and you rebrand).
import { fansTotal, findWrestler, getPromotion, globalScore, rosterOf, TITLES, WRESTLERS } from '../data/rtr';
import type { Rng } from '../engine/rng';
import { setCardHook } from './booker';
import { letter, person, promoName, setCareerHooks, spend } from './career';
import { BONUS_TRIGGERS, tierOf, triggerSlots, type BonusTrigger } from './clauses';
import { onSigned } from './contracts';
import { addDays, daysBetween, type Day } from './dates';
import { dealsOf, dealWith } from './deals';
import { round5 } from './economy';
import {
  ADVANCE_FEES, ADVANCE_INTEREST, ADVANCE_REPAY_SHARE, ADVANCE_WRITE_OFF_T3, BONUS_FEES, LEGEND_REP, LEGEND_YEARS, LOYALTY_FEES, LOYALTY_PROTECT_YEARS, MERCH_STORE_PER_FAN,
  MONTHLY_MIN_FEES, PERF_RAISE, PERF_RAISE_STARS, PROFIT_SHARE, PULLED_PAY, REBRAND_LOSS, SIGNING_BONUS_FEES, STORE_CUT, TAKINGS, YEARLY_RAISE,
} from './tuning';
import type { Bout, Career, Contract, PlayerMatch, Show } from './types';

const yearsSince = (from: Day, to: Day): number => Math.floor(daysBetween(from, to) / 365.25);
const money = (n: number): string => `£${n.toLocaleString('en-GB')}`;

// ------------------------------------------------------------------ signing money

/** Signing Bonus (Lyra's call: all signing money lives here): weekly fees, paid when you sign. */
onSigned((c, k) => {
  const n = SIGNING_BONUS_FEES[tierOf(k, 'signing')] ?? 0;
  if (!n || c.spectator) return;
  const amount = round5(k.fee * n);
  spend(c, amount, `Signing bonus · ${k.promo}`, 'bonus');
});

/** What you could borrow against your fees right now (0 if you can't). */
export function advanceAvailable(c: Career, promo?: string): { amount: number; owed: number; why?: string; k?: Contract } {
  const p = person(c, c.player);
  const k = (promo ? dealWith(p, promo) : null) ?? dealsOf(p).sort((a, b) => tierOf(b, 'signing') - tierOf(a, 'signing'))[0];
  if (!k) return { amount: 0, owed: 0, why: 'You’re not under contract.' };
  const t = tierOf(k, 'signing');
  if (!t) return { amount: 0, owed: 0, why: 'Your deal has no Signing Bonus & Advances.', k };
  if (k.advance) return { amount: 0, owed: k.advance, why: `You still owe ${k.promo} ${money(k.advance)}.`, k };
  if (c.money >= k.fee) return { amount: 0, owed: 0, why: 'They only advance money when you’re skint.', k };
  const amount = round5(k.fee * ADVANCE_FEES[t]!);
  return { amount, owed: round5(amount * (1 + ADVANCE_INTEREST[t]!)), k };
}

/** Take an advance against your fees: paid back from each fee they pay you (with interest below Tier 3). */
export function takeAdvance(c: Career, promo?: string): string {
  const a = advanceAvailable(c, promo);
  if (!a.amount || !a.k) return a.why ?? 'Not possible.';
  a.k.advance = a.owed;
  spend(c, a.amount, `Advance from ${a.k.promo}`, 'bonus');
  return `${a.k.promo} advanced you ${money(a.amount)}. You’ll pay back ${money(a.owed)} out of your fees.`;
}

// ------------------------------------------------------------------ after each of your matches

function afterMatch(c: Career, show: Show, bout: Bout, m: PlayerMatch): void {
  if (show.promo === 'TIS') return;
  const k = (show.promos ?? [show.promo]).map((x) => dealWith(person(c, c.player), x)).find(Boolean);
  if (!k) return;
  // Advances come back out of your fees.
  if (k.advance && m.fee > 0) {
    const back = Math.min(k.advance, round5(m.fee * ADVANCE_REPAY_SHARE));
    k.advance = Math.max(0, k.advance - back);
    if (!k.advance) delete k.advance;
    if (back) spend(c, -back, `Advance repayment · ${k.promo}`, 'bonus');
  }
  // Performance Bonuses: the triggers you picked, as many as your tier allows.
  const triggers = (k.triggers ?? []).slice(0, triggerSlots(tierOf(k, 'bonuses')));
  const hit = (t: BonusTrigger): boolean => {
    switch (t) {
      case 'title': return !!m.wonTitle;
      case 'defence': return !!m.title && !m.wonTitle && m.result === 'win' && TITLES.find((x) => x.id === m.title)?.holder === c.player;
      case 'great': return m.stars >= 4;
      case 'main': return show.card?.at(-1) === bout;
      case 'big': return show.kind === 'special' || show.kind === 'flagship';
      case 'streak': return false;
    }
  };
  k.streak = m.result === 'win' ? (k.streak ?? 0) + 1 : 0;
  for (const t of triggers) {
    const ok = t === 'streak' ? k.streak > 0 && k.streak % 5 === 0 : hit(t);
    if (!ok) continue;
    const amount = round5(k.fee * BONUS_FEES[t]);
    spend(c, amount, `Bonus · ${BONUS_TRIGGERS.find((x) => x.id === t)!.name} · ${k.promo}`, 'bonus');
  }
  // Wage Matching Tier 2+: a raise for winning one of their titles.
  if (m.wonTitle && tierOf(k, 'wage') >= 2) {
    k.fee = round5(k.fee * (1 + PERF_RAISE));
    letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'A raise for the title', body: [`Your Wage Matching clause: you’re on ${money(k.fee)} a match now.`] });
  }
  // Profit Share Tier 3: a cut of every show you're on (flagships and specials are counted below, the next morning).
  if (tierOf(k, 'profit') >= 3 && show.kind !== 'flagship' && show.kind !== 'special') profitCut(c, k, show);
}

/** A show's takings: by its kind and the promotion's popularity (Lyra's call: bigger promotions, bigger takings). */
export function takings(show: Pick<Show, 'kind' | 'promo'>): number {
  const pop = getPromotion(show.promo)?.popularity ?? 50;
  return (TAKINGS[show.kind] ?? 0) * (pop / 50) ** 2;
}
function profitCut(c: Career, k: Contract, show: Show): void {
  const amount = round5(takings(show) * PROFIT_SHARE[tierOf(k, 'profit')]!);
  if (amount > 0) spend(c, amount, `Profit share · ${show.name}`, 'bonus');
}

// ------------------------------------------------------------------ the daily round

/** Every morning: yesterday's takings, cards you were pulled from, anniversaries. */
function daily(c: Career): void {
  if (c.spectator) return;
  const p = c.people[c.player];
  const deals = dealsOf(p);
  const yesterday = addDays(c.today, -1);
  for (const show of Object.values(c.shows).filter((s) => s.date === yesterday && s.promo !== 'TIS')) {
    for (const promo of show.promos ?? [show.promo]) {
      const k = deals.find((x) => x.promo === promo);
      if (!k) continue;
      // Profit Share: their flagships (Tier 1+) and specials (Tier 2+), whether you're on them or not.
      const t = tierOf(k, 'profit');
      if ((show.kind === 'flagship' && t >= 1) || (show.kind === 'special' && t >= 2)) profitCut(c, k, show);
      // Guaranteed Pay: on the card when it was drawn, taken off it since (not by you).
      if (c.drawnMe?.[show.id] && !show.card?.some((b) => b.a === c.player || b.b === c.player)) {
        const share = PULLED_PAY[tierOf(k, 'guaranteed')] ?? 0;
        const mine = p!.injury && p!.injury.until > yesterday || p!.daysOff?.includes(yesterday) || (p!.suspendedUntil && p!.suspendedUntil > yesterday) || p!.noShows?.includes(yesterday);
        if (share && !mine) spend(c, round5(k.fee * share), `Pulled from ${show.name} (Guaranteed Pay)`, 'fee');
      }
    }
  }
  if (c.drawnMe) for (const id of Object.keys(c.drawnMe)) if (!c.shows[id] || c.shows[id]!.date < yesterday) delete c.drawnMe[id];
  for (const k of deals) anniversaries(c, k);
}

/** A contract year comes round (Wage Matching's yearly raise) and a year of service (Loyalty & Tenure). */
function anniversaries(c: Career, k: Contract): void {
  const years = yearsSince(k.start, c.today);
  if (years > (k.raisedYears ?? 0)) {
    k.raisedYears = years;
    const t = tierOf(k, 'wage');
    let rise = YEARLY_RAISE[t] ?? 0;
    // A great year (Tier 2+): a performance raise on top.
    const year = c.history.filter((m) => m.promo === k.promo && daysBetween(m.day, c.today) <= 365);
    if (t >= 2 && year.length >= 10 && year.reduce((a, m) => a + m.stars, 0) / year.length >= PERF_RAISE_STARS) rise += PERF_RAISE;
    if (rise) {
      k.fee = round5(k.fee * (1 + rise));
      letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Your yearly raise', body: [`Another year with us: your Wage Matching clause puts you on ${money(k.fee)} a match.`] });
    }
  }
  const served = yearsSince(k.since ?? k.start, c.today);
  if (served > (k.paidYears ?? 0)) {
    k.paidYears = served;
    const t = tierOf(k, 'loyalty');
    if (t) {
      const amount = round5(k.fee * LOYALTY_FEES[t]! * Math.min(5, served));
      spend(c, amount, `Loyalty bonus · ${served} year${served === 1 ? '' : 's'} with ${k.promo}`, 'bonus');
      const p = person(c, c.player);
      if (t >= 3 && served >= LEGEND_YEARS && p.legend !== k.promo) {
        p.legend = k.promo;
        p.rep = Math.min(100, p.rep + LEGEND_REP);
        letter(c, { kind: 'contract', from: promoName(k.promo), subject: `A ${k.promo} legend`, body: [`${served} years. You’re part of the furniture now: a legend of ${promoName(k.promo)}. Reputation +${LEGEND_REP}.`] });
      }
    }
  }
}

/** The first of the month: Guaranteed Pay's minimum, Merchandise Rights' store cut, Wage Matching's parity. */
function monthly(c: Career, _rnd: Rng): void {
  if (c.spectator) return;
  const me = findWrestler(c.player);
  if (!me) return;
  const last = addDays(c.today, -1).slice(0, 7);
  for (const k of dealsOf(c.people[c.player])) {
    // Guaranteed Pay Tier 2+: last month's fees from them topped up to a minimum.
    const min = round5(k.fee * (MONTHLY_MIN_FEES[tierOf(k, 'guaranteed')] ?? 0));
    if (min && k.start.slice(0, 7) < last) {
      const got = c.history.filter((m) => m.promo === k.promo && m.day.startsWith(last)).reduce((t, m) => t + m.fee, 0);
      if (got < min) spend(c, min - got, `Monthly minimum · ${k.promo} (Guaranteed Pay)`, 'fee');
    }
    // Merchandise Rights: a cut of their online store's sales of your gear.
    const cut = STORE_CUT[tierOf(k, 'merch')] ?? 0;
    if (cut) {
      const amount = round5(fansTotal(me) * MERCH_STORE_PER_FAN * cut);
      if (amount) spend(c, amount, `Online store cut · ${k.promo}`, 'merch');
    }
    // Wage Matching Tier 3: never paid less than anyone below you on their roster.
    if (tierOf(k, 'wage') >= 3) {
      const below = rosterOf(k.promo).filter((w) => w.id !== me.id && globalScore(w) < globalScore(me)).map((w) => dealWith(c.people[w.id], k.promo)?.fee ?? 0);
      const top = Math.max(0, ...below);
      if (top > k.fee) {
        k.fee = top;
        letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Your fee has gone up', body: [`Someone below you on the card was on more. Your Wage Matching clause puts you on ${money(top)} a match too.`] });
      }
    }
  }
}

// ------------------------------------------------------------------ leaving

/**
 * Leaving a deal. Character & Image Rights (Lyra's call): if they own your name, you rebrand and lose a share of
 * your fans, more the longer you were there (Shared halves it; Licensed or better keeps the name). Signing Bonus &
 * Advances: anything still owed is paid back (Tier 3 writes some of it off).
 */
function leaving(c: Career, k: Contract, how: 'ended' | 'left' | 'released' | 'moved'): void {
  if (c.spectator) return;
  const p = person(c, c.player);
  if (k.advance) {
    const off = tierOf(k, 'signing') >= 3 ? round5(k.advance * ADVANCE_WRITE_OFF_T3) : 0;
    const owed = k.advance - off;
    delete k.advance;
    if (owed) spend(c, -owed, `Advance owed to ${k.promo}`, 'bonus');
    if (off) letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'We’ve written some of it off', body: [`${money(off)} of your advance is written off. The other ${money(owed)} has come out of your account.`] });
  }
  // Re-signing with them isn't leaving.
  if (how === 'ended' && p.next?.promo === k.promo) return;
  const image = tierOf(k, 'image');
  if (image >= 2) return;
  const me = findWrestler(c.player)!;
  const years = Math.max(0, daysBetween(k.since ?? k.start, c.today) / 365.25);
  const share = Math.min(REBRAND_LOSS.max, REBRAND_LOSS.base + REBRAND_LOSS.perYear * years) * (image === 1 ? 0.5 : 1);
  const before = fansTotal(me);
  for (const r of Object.keys(me.fans) as (keyof typeof me.fans)[]) me.fans[r] = Math.round(me.fans[r] * (1 - share));
  const lost = before - fansTotal(me);
  c.rebrand = { from: k.promo, old: me.name, lost };
  letter(c, { kind: 'contract', from: promoName(k.promo), subject: `“${me.name}” stays with us`, body: [
    `${k.promo} own your ring name and gimmick, so you can’t use them any more. You’ll need a new name.`,
    `Not every fan follows a new name: about ${Math.round(share * 100)}% of them (${lost.toLocaleString('en-GB')}) don’t.`,
  ] });
}

/** Pick your new ring name after leaving a promotion that owned the old one. */
export function rebrand(c: Career, name: string): string {
  const n = name.trim();
  if (!c.rebrand) return '';
  if (n.length < 2) return 'That’s not a name.';
  if (WRESTLERS.some((w) => w.id !== c.player && w.name.toLowerCase() === n.toLowerCase())) return 'Someone’s already using that name.';
  const me = findWrestler(c.player)!;
  me.name = n;
  delete c.rebrand;
  return `From now on, you’re ${n}.`;
}

// ------------------------------------------------------------------ registration

/** A card drawn with you on it: Guaranteed Pay remembers, in case you're pulled. */
setCardHook((c, show, card) => {
  if (c.spectator || show.promo === 'TIS' || !card.some((b) => b.a === c.player || b.b === c.player)) return;
  (c.drawnMe ??= {})[show.id] = show.promo;
});

/** Protected from a mid-contract release: Loyalty & Tenure (a few years in, Tier 2+), Medical Pay Tier 2+ while injured. */
function protect(c: Career, id: string, promo: string): boolean {
  const p = c.people[id];
  const k = dealWith(p, promo);
  if (!k) return false;
  if (tierOf(k, 'loyalty') >= 2 && yearsSince(k.since ?? k.start, c.today) >= LOYALTY_PROTECT_YEARS) return true;
  if (tierOf(k, 'medical') >= 2 && p?.injury && p.injury.until > c.today) return true;
  return false;
}

setCareerHooks({ mine: afterMatch, daily, monthly, leaving, protect });
