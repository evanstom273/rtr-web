// The money clauses (Lyra's design): Guaranteed Pay's monthly minimum and pulled-from-the-card pay, Wage
// Matching's raises and parity, Performance Bonuses, Merchandise Rights' online store cut, Profit Share,
// Signing Bonus & Advances, Loyalty & Tenure, and Character & Image Rights (leave without them and you rebrand).
import { fansTotal, findWrestler, getPromotion, globalScore, rosterOf, TITLES, WRESTLERS, holds } from '../data/rtr';
import type { Rng } from '../engine/rng';
import { setCardHook } from './booker';
import { letter, person, promoName, setCareerHooks, spend } from './career';
import { BONUS_TRIGGERS, tierOf, triggerSlots, type BonusTrigger } from './clauses';
import { onSigned } from './contracts';
import { registerReplies } from './mail';
import { addDays, daysBetween, type Day } from './dates';
import { dealsOf, dealWith } from './deals';
import { isWeeklyFlagship, matchPay, merchShare, monthlySalary, payOf, round5 } from './economy';
import {
  ADVANCE_FEES, ADVANCE_INTEREST, ADVANCE_REPAY_SHARE, ADVANCE_WRITE_OFF_T3, BONUS_DRAW_AT, BONUS_FEES, BONUS_FIVE_STAR, GUARANTEED_DATES, LEGEND_REP, LEGEND_YEARS, LOYALTY_FEES, LOYALTY_PROTECT_YEARS, MERCH_STORE_PER_FAN,
  PERF_RAISE, PERF_RAISE_STARS, REBRAND, PROFIT_SHARE, PULLED_PAY, REBRAND_LOSS, SIGNING_BONUS_FEES, STORE_CUT, TAKINGS, YEARLY_RAISE,
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
  spend(c, amount, `Signing bonus · ${k.promo}`, 'bonus', { contract: true });
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
  spend(c, a.amount, `Advance from ${a.k.promo}`, 'bonus', { untaxed: true });
  return `${a.k.promo} advanced you ${money(a.amount)}. You’ll pay back ${money(a.owed)} out of your fees.`;
}

// ------------------------------------------------------------------ after each of your matches

/** An advance comes back out of what they pay you. */
function repay(c: Career, k: Contract, paid: number): void {
  if (!k.advance) return;
  const back = Math.min(k.advance, round5(paid * ADVANCE_REPAY_SHARE));
  k.advance = Math.max(0, k.advance - back);
  if (!k.advance) delete k.advance;
  if (back) spend(c, -back, `Advance repayment · ${k.promo}`, 'bonus');
}
/** A show's usual takings for its promotion and kind (its recent ones), so a big draw stands out. */
function usualTakings(c: Career, show: Show): number {
  const xs = Object.values(c.shows).filter((h) => h.promo === show.promo && h.kind === show.kind && h.id !== show.id && (h.books?.in ?? 0) > 0).map((h) => h.books!.in);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
/** Performance Bonuses' "drawing a crowd": the morning after, once the night's takings are in. */
function drewBig(c: Career, show: Show, k: Contract): void {
  if (!(k.triggers ?? []).slice(0, triggerSlots(tierOf(k, 'bonuses'))).includes('draw')) return;
  const last = show.card?.at(-1);
  if (!last || (last.a !== c.player && last.b !== c.player && !last.sides?.some((x) => x.includes(c.player)))) return;
  const gate = show.books?.in ?? 0, usual = usualTakings(c, show);
  if (!(gate > 0 && usual > 0 && gate >= usual * BONUS_DRAW_AT)) return;
  spend(c, round5(k.fee * BONUS_FEES.draw), `Bonus · Drawing a crowd · ${show.name}`, 'bonus', { contract: true });
}

function afterMatch(c: Career, show: Show, bout: Bout, m: PlayerMatch): void {
  if (show.promo === 'TIS') return;
  const k = (show.promos ?? [show.promo]).map((x) => dealWith(person(c, c.player), x)).find(Boolean);
  if (!k) return;
  // Advances come back out of your fees (on a salary, out of each month's: see payday).
  if (m.fee > 0) repay(c, k, m.fee);
  // Performance Bonuses: the triggers you picked, as many as your tier allows.
  const triggers = (k.triggers ?? []).slice(0, triggerSlots(tierOf(k, 'bonuses')));
  const hit = (t: BonusTrigger): boolean => {
    switch (t) {
      case 'title': return !!m.wonTitle;
      case 'defence': return !!m.title && !m.wonTitle && m.result === 'win' && (() => { const t = TITLES.find((x) => x.id === m.title); return !!t && holds(t, c.player); })();
      case 'great': return m.stars >= 4;
      case 'main': return show.card?.at(-1) === bout;
      case 'big': return show.kind === 'special' || show.kind === 'flagship';
      case 'streak': return false;
      case 'win': return m.result === 'win';
      // Headlining a show that drew big: the next morning, once the takings are in (drewBig).
      case 'draw': return false;
    }
  };
  k.streak = m.result === 'win' ? (k.streak ?? 0) + 1 : 0;
  for (const t of triggers) {
    const ok = t === 'streak' ? k.streak > 0 && k.streak % 5 === 0 : hit(t);
    if (!ok) continue;
    const amount = round5(k.fee * BONUS_FEES[t] * (t === 'great' && m.stars >= 5 ? BONUS_FIVE_STAR : 1));
    spend(c, amount, `Bonus · ${BONUS_TRIGGERS.find((x) => x.id === t)!.name} · ${k.promo}`, 'bonus', { contract: true });
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
  if (amount > 0) spend(c, amount, `Profit share · ${show.name}`, 'bonus', { contract: true });
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
      drewBig(c, show, k);
      // Profit Share: their flagships (Tier 1+) and specials (Tier 2+), whether you're on them or not.
      const t = tierOf(k, 'profit');
      if ((show.kind === 'flagship' && t >= 1) || (show.kind === 'special' && t >= 2)) profitCut(c, k, show);
      // Guaranteed Pay: on the card when it was drawn, taken off it since (not by you).
      if (c.drawnMe?.[show.id] && !show.card?.some((b) => b.a === c.player || b.b === c.player)) {
        const share = PULLED_PAY[tierOf(k, 'guaranteed')] ?? 0;
        const mine = p!.injury && p!.injury.until > yesterday || p!.daysOff?.includes(yesterday) || (p!.suspendedUntil && p!.suspendedUntil > yesterday) || p!.noShows?.includes(yesterday);
        const was = matchPay(k, show.kind, false, isWeeklyFlagship(show)).pay;
        if (share && was && !mine) spend(c, round5(was * share), `Pulled from ${show.name} (Guaranteed Pay)`, 'fee', { contract: true });
      }
    }
  }
  if (c.drawnMe) for (const id of Object.keys(c.drawnMe)) if (!c.shows[id] || c.shows[id]!.date < yesterday) delete c.drawnMe[id];
  for (const k of deals) anniversaries(c, k);
  // Salaries (Monthly, or Both's base): each month's on its first day, whatever's happened (Lyra's call: always); a deal
  // (or a career) starting part-way through a month gets the rest of that month's, there and then.
  const month = c.today.slice(0, 7);
  const paid = (c.salaryPaid ??= {});
  for (const k of deals) {
    if (k.start > c.today || !monthlySalary(k) || paid[k.promo] === month) continue;
    payday(c, k, c.today.endsWith('-01') ? 1 : daysLeftInMonth(c.today));
    paid[k.promo] = month;
  }
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
      spend(c, amount, `Loyalty bonus · ${served} year${served === 1 ? '' : 's'} with ${k.promo}`, 'bonus', { contract: true });
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
    // Guaranteed Pay: last month's dates (PPA, or Both's per-show part) topped up to the guaranteed number.
    const want = GUARANTEED_DATES[tierOf(k, 'guaranteed')] ?? 0;
    const per = matchPay(k, 'weekly').pay;
    if (want && per && k.start.slice(0, 7) < last) {
      const got = c.history.filter((m) => m.promo === k.promo && m.day.startsWith(last)).length;
      if (got < want) spend(c, round5(per * (want - got)), `Guaranteed dates · ${k.promo} (${want - got} short)`, 'fee', { contract: true });
    }
    // Merchandise Rights: a cut of their online store's sales of your gear.
    const cut = STORE_CUT[tierOf(k, 'merch')] ?? 0;
    if (cut) {
      const amount = round5(fansTotal(me) * MERCH_STORE_PER_FAN * cut * merchShare(c));
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

/** The share of a month left from today (today included). */
function daysLeftInMonth(day: Day): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return (days - d + 1) / days;
}
/** Payday: a salary (or a share of one), and an advance comes back out of it. */
function payday(c: Career, k: Contract, share: number): void {
  const amount = round5(monthlySalary(k) * share);
  if (!amount) return;
  spend(c, amount, `Salary · ${k.promo}${payOf(k) === 'both' ? ' (base)' : ''}`, 'fee', { contract: true });
  repay(c, k, amount);
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
  // The character goes with the name (Lyra's call): the entrance you bought for it, your finishers' names, and your merch.
  const took: string[] = [];
  const gear = c.life?.gear;
  const kept = { ...(gear?.theme ? { theme: true } : {}), ...(gear?.video ? { video: true } : {}) };
  if (gear && (gear.theme || gear.video)) { delete gear.theme; delete gear.video; took.push('your entrance theme and video'); }
  const names = me.moveNames;
  if (names && Object.keys(names).length) { delete me.moveNames; took.push('your finishers’ and signatures’ names'); }
  c.merchSince = c.today;
  took.push('your merch (it builds back up as the new name does)');
  const price = Math.max(REBRAND.buyMin, Math.round((lost * REBRAND.buyPerFan) / 1000) * 1000);
  (c.lostNames ??= []).push({ promo: k.promo, name: me.name, lost, day: c.today, price, ...(names ? { moveNames: { ...names } } : {}), ...(Object.keys(kept).length ? { gear: kept } : {}) });
  c.rebrand = { from: k.promo, old: me.name, lost, took };
  letter(c, { kind: 'contract', from: promoName(k.promo), subject: `“${me.name}” stays with us`, body: [
    `${k.promo} own your ring name and gimmick, so you can’t use them any more. You’ll need a new name.`,
    `Not every fan follows a new name: about ${Math.round(share * 100)}% of them (${lost.toLocaleString('en-GB')}) don’t.`,
    `It all stays with us: ${took.join(', ')}.`,
    `You can buy “${me.name}” back from us (${money(price)}), or come back and it’s yours again.`,
  ] });
}

/** Two names too close to call (Lyra's call: no getting round it with a capital, a space, a letter or a "The"). */
function tooClose(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z]/g, '');
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y || (y.length >= 4 && x.includes(y)) || (x.length >= 4 && y.includes(x))) return true;
  // Edit distance: a letter or two swapped is the same name.
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array<number>(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0]![j] = j;
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1));
  return d[x.length]![y.length]! <= (y.length >= 8 ? 2 : 1);
}

/** Pick your new ring name after leaving a promotion that owned the old one. */
export function rebrand(c: Career, name: string): string {
  const n = name.trim();
  if (!c.rebrand) return '';
  if (n.length < 2) return 'That’s not a name.';
  if (WRESTLERS.some((w) => w.id !== c.player && w.name.toLowerCase() === n.toLowerCase())) return 'Someone’s already using that name.';
  const owned = (c.lostNames ?? []).find((x) => tooClose(n, x.name));
  if (owned) return `That’s too close to “${owned.name}”, and ${owned.promo} own it. Something properly new.`;
  const me = findWrestler(c.player)!;
  me.name = n;
  delete c.rebrand;
  return `From now on, you’re ${n}.`;
}

/** Get a name back: buy it from them, or (free) by going back there. Your name, finishers' names, entrance, some fans. */
export function buyBackName(c: Career, promo: string, free = false): string {
  const i = (c.lostNames ?? []).findIndex((x) => x.promo === promo);
  const rec = i >= 0 ? c.lostNames![i]! : undefined;
  if (!rec) return 'They don’t own a name of yours.';
  if (c.rebrand) return 'Pick your new name first.';
  if (WRESTLERS.some((w) => w.id !== c.player && w.name.toLowerCase() === rec.name.toLowerCase())) return `Someone else is wrestling as “${rec.name}” now.`;
  if (!free && c.money < rec.price) return `It’s ${money(rec.price)}. You haven’t got that.`;
  if (!free) spend(c, -rec.price, `Bought back “${rec.name}” from ${promo}`, 'event', { untaxed: true });
  const me = findWrestler(c.player)!;
  me.name = rec.name;
  // Your finishers' names, where they're still your finishers and signatures.
  const mine = new Set([...me.finishers, ...me.signatures]);
  const names = Object.fromEntries(Object.entries(rec.moveNames ?? {}).filter(([id]) => mine.has(id)));
  if (Object.keys(names).length) me.moveNames = { ...names, ...(me.moveNames ?? {}) };
  if (rec.gear && c.life) Object.assign((c.life.gear ??= {}), rec.gear);
  // Some of the fans who didn't follow the new name come back to the old one.
  const back = Math.round(rec.lost * REBRAND.fansBack), total = Math.max(1, fansTotal(me));
  for (const r of Object.keys(me.fans) as (keyof typeof me.fans)[]) me.fans[r] = Math.round(me.fans[r] + (back * me.fans[r]) / total);
  delete c.merchSince;
  c.lostNames!.splice(i, 1);
  return `You’re “${rec.name}” again.${back ? ` About ${back.toLocaleString('en-GB')} fans are back with you.` : ''}`;
}

/** Back with a promotion that owns your old name: it's yours again if you want it (Lyra's call). */
onSigned((c, k) => {
  const rec = (c.lostNames ?? []).find((x) => x.promo === k.promo);
  if (!rec || c.spectator) return;
  letter(c, {
    kind: 'contract', from: promoName(k.promo), subject: `“${rec.name}” is yours again, if you want it`,
    body: [`You’re back with us, so the name’s yours to use again (the finishers, the entrance, the lot).`],
    replies: [{ id: 'name_back', label: `Be “${rec.name}” again` }, { id: 'name_keep', label: 'Keep my new name' }],
    ctx: { promo: k.promo },
  });
});
registerReplies({
  name_back: (c, l) => buyBackName(c, l.ctx?.promo ?? '', true),
  name_keep: () => 'You’ll stay as you are.',
});

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
