// Negotiating contracts clause by clause, signing, pay reviews and getting out of a deal.
import { WRESTLERS, findWrestler } from '../data/rtr';
import { seededRng } from '../engine/rng';
import { hashSeed, promoRegion, regionalPop } from './booker';
import { BUDGET, C, CLAUSES, attitude, patience } from './clauses';
import { letter, person, promoName, spend } from './career';
import { addDays, addMonths, daysBetween, fmtDay } from './dates';
import { round5 } from './economy';
import { startTitlePromise } from './offers';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import {
  ATTITUDE_MULT, BUYOUT_SHARE, CLAUSE_COST, FEE_BASE, FEE_PER_POP, NEGO_ACCEPT, NEGO_COUNTER, NEGO_FORM_SWING, NEGO_GATE_POP_RESIST_T2,
  NEGO_GATE_POP_RESIST_T3, NEGO_GATE_REP_T3, NEGO_REGION_WEIGHT, NEGO_REP_SWING, NEGO_RIVAL_LIFT, NOTICE_DAYS, RELEASE_GRANT_ABOVE_MEDIAN,
  RELEASE_GRANT_BELOW_MEDIAN, REP_ASK_RELEASE, SHOW_MULT, WAGE_MATCH_T2_MAX, WAGE_REVIEW_MONTHS, WAGE_REVIEW_POP_BAND,
} from './tuning';
import type { Career, Contract, Offer } from './types';

export interface Proposal { fee: number; months: number; clauses: number[] }
export type Mood = 'keen' | 'happy' | 'hesitant' | 'losing';

/** What a promotion will pay you a weekly-show match, before any clauses. */
export function willingness(c: Career, promo: string, excludeOffer?: string): number {
  const me = findWrestler(c.player)!;
  const p = person(c, c.player);
  const pop = NEGO_REGION_WEIGHT * regionalPop(me, promoRegion(promo)) + (1 - NEGO_REGION_WEIGHT) * me.popularity.global;
  let base = (FEE_BASE + FEE_PER_POP * pop) * (BUDGET[promo] ?? 0.5);
  base *= 1 + ((p.rep - 50) / 50) * NEGO_REP_SWING;
  const last = c.history.slice(0, 10);
  if (last.length) {
    const avg = last.reduce((t, m) => t + m.stars, 0) / last.length;
    base *= 1 + Math.max(-1, Math.min(1, (avg - 3) / 2)) * NEGO_FORM_SWING;
  }
  const rival = c.offers.filter((o) => o.status === 'open' && o.promo !== promo && o.id !== excludeOffer).reduce((m, o) => Math.max(m, o.fee), 0);
  return round5(Math.max(base, rival * NEGO_RIVAL_LIFT));
}

export function clauseCost(promo: string, base: number, i: number, tier: number): number {
  if (!tier) return 0;
  return round5(base * CLAUSE_COST[i]![tier - 1]! * ATTITUDE_MULT[attitude(promo, i)]);
}

export function askValue(promo: string, base: number, p: Proposal): number {
  return p.fee + p.clauses.reduce((t, tier, i) => t + clauseCost(promo, base, i, tier), 0);
}

/** Tiers you can't have at all, and why. */
export function gate(c: Career, promo: string, i: number, tier: number): string | null {
  const me = findWrestler(c.player)!;
  const p = person(c, c.player);
  if (tier >= 3 && p.rep < NEGO_GATE_REP_T3) return `Tier 3 needs reputation ${NEGO_GATE_REP_T3} (you: ${Math.round(p.rep)})`;
  if (attitude(promo, i) === 'resist') {
    const pop = regionalPop(me, promoRegion(promo));
    if (tier >= 3 && pop < NEGO_GATE_POP_RESIST_T3) return `They won’t give Tier 3 below ${NEGO_GATE_POP_RESIST_T3} popularity here`;
    if (tier >= 2 && pop < NEGO_GATE_POP_RESIST_T2) return `They won’t give Tier 2 below ${NEGO_GATE_POP_RESIST_T2} popularity here`;
  }
  return null;
}

export function mood(c: Career, o: Offer, p: Proposal): Mood {
  const base = willingness(c, o.promo, o.id);
  const r = askValue(o.promo, base, p) / (base * NEGO_ACCEPT);
  return r <= 0.9 ? 'keen' : r <= 1 ? 'happy' : r <= NEGO_COUNTER / NEGO_ACCEPT ? 'hesitant' : 'losing';
}

export const roundsLeft = (o: Offer): number => Math.max(0, patience(o.promo) - o.rounds);

/** Put your terms to them: they accept, counter, or walk. */
export function propose(c: Career, o: Offer, p: Proposal): 'accept' | 'counter' | 'walk' {
  if (o.status !== 'open') return 'walk';
  o.rounds++;
  for (let i = 0; i < p.clauses.length; i++) {
    const g = gate(c, o.promo, i, p.clauses[i]!);
    if (g) { o.said = `“${g}.”`; return 'counter'; }
  }
  const base = willingness(c, o.promo, o.id);
  const ask = askValue(o.promo, base, p);
  if (ask <= base * NEGO_ACCEPT) {
    o.fee = p.fee; o.months = p.months; o.clauses = [...p.clauses];
    o.said = '“Done. We’ll draw it up.”';
    return 'accept';
  }
  if (ask > base * NEGO_COUNTER || o.rounds >= patience(o.promo)) {
    o.status = 'walked';
    o.said = '“We’re done here.” They’ve walked away.';
    return 'walk';
  }
  // A counter: keep your clauses and cut the fee to fit, or drop the dearest clause they resist.
  const clauses = [...p.clauses];
  let fee = round5(base * NEGO_ACCEPT - askValue(o.promo, base, { ...p, fee: 0 }));
  if (fee < p.fee * 0.7) {
    const worst = clauses.map((t, i) => ({ i, cost: clauseCost(o.promo, base, i, t) * (attitude(o.promo, i) === 'resist' ? 2 : 1) })).sort((a, b) => b.cost - a.cost)[0];
    if (worst && clauses[worst.i]! > 0) clauses[worst.i]!--;
    fee = round5(Math.min(p.fee, base * NEGO_ACCEPT - askValue(o.promo, base, { ...p, clauses, fee: 0 })));
  }
  o.fee = Math.max(round5(base * 0.5), fee); o.months = p.months; o.clauses = clauses;
  const dropped = clauses.findIndex((t, i) => t < p.clauses[i]!);
  o.said = dropped >= 0
    ? `“Too rich. We’ll do £${o.fee.toLocaleString('en-GB')} if ${CLAUSES[dropped]!.name} comes down a tier.”`
    : `“Too rich. We can do £${o.fee.toLocaleString('en-GB')} a match with those terms.”`;
  return 'counter';
}

/** Sign an accepted offer. It starts now if you're free, or the day after your current deal ends. */
export function signOffer(c: Career, o: Offer): void {
  const p = person(c, c.player);
  const start = p.contract && p.contract.promo !== o.promo ? o.start > c.today ? o.start : addDays(p.contract.end, 1) : c.today;
  const k: Contract = { promo: o.promo, start, end: addMonths(start, o.months), fee: o.fee, clauses: [...o.clauses] };
  o.status = 'signed';
  for (const x of c.offers) if (x.status === 'open') x.status = 'declined';
  const me = findWrestler(c.player)!;
  if (start <= c.today) {
    addEvent(activeWorld().history, { day: c.today, kind: me.promotion === 'TIS' ? 'signed' : 'poached', who: me.id, name: me.name, promo: o.promo, ...(me.promotion !== 'TIS' ? { from: me.promotion } : {}) });
    p.contract = k;
    me.promotion = o.promo;
    for (const s of Object.values(c.shows)) if (!s.done && s.date > c.today && s.promo === o.promo) s.card = null;
    startTitlePromise(c);
    letter(c, { kind: 'contract', from: promoName(o.promo), subject: `Signed: ${promoName(o.promo)}`, body: [`${o.months} months at £${o.fee.toLocaleString('en-GB')} a match, starting today. Welcome aboard.`] });
  } else {
    p.next = k;
    letter(c, { kind: 'contract', from: promoName(o.promo), subject: `Signed: ${promoName(o.promo)}`, body: [`${o.months} months at £${o.fee.toLocaleString('en-GB')} a match, starting ${fmtDay(start, 'long')}.`] });
  }
}

/** Wage Matching Tier 1: ask for a review against comparable wrestlers on the roster. */
export function payReview(c: Career): string {
  const k = person(c, c.player).contract;
  if (!k || (k.clauses[C.wage] ?? 0) < 1) return 'Your contract has no Wage Matching.';
  if (k.lastReview && daysBetween(k.lastReview, c.today) < WAGE_REVIEW_MONTHS * 30) return `You can ask again after ${fmtDay(addMonths(k.lastReview, WAGE_REVIEW_MONTHS), 'dm')}.`;
  k.lastReview = c.today;
  const me = findWrestler(c.player)!;
  const region = promoRegion(k.promo);
  const peers = WRESTLERS.filter((w) => w.promotion === k.promo && w.id !== me.id && Math.abs(regionalPop(w, region) - regionalPop(me, region)) <= WAGE_REVIEW_POP_BAND)
    .map((w) => c.people[w.id]?.contract?.fee ?? 0).filter(Boolean).sort((a, b) => a - b);
  const median = peers[Math.floor(peers.length / 2)] ?? 0;
  if (median > k.fee) {
    k.fee = median;
    return `Review done: you’re up to £${median.toLocaleString('en-GB')} a match, in line with the roster.`;
  }
  return 'Review done: you’re already paid in line with the roster.';
}

/** Wage Matching Tier 2: show them a rival offer and they match it, up to a point. */
export function matchRival(c: Career, offerId: string): string {
  const k = person(c, c.player).contract;
  const o = c.offers.find((x) => x.id === offerId);
  if (!k || !o || (k.clauses[C.wage] ?? 0) < 2) return 'Your contract doesn’t let you do that.';
  if (o.fee > k.fee * WAGE_MATCH_T2_MAX) return `${k.promo} won’t go that high.`;
  k.fee = Math.max(k.fee, o.fee);
  o.status = 'declined';
  return `${k.promo} matched it: £${k.fee.toLocaleString('en-GB')} a match.`;
}

/** What leaving early would take, by your Contract Exit tier. */
export function exitTerms(c: Career): { tier: number; text: string; cost: number } {
  const k = person(c, c.player).contract;
  if (!k) return { tier: 0, text: '', cost: 0 };
  const tier = k.clauses[C.exit] ?? 0;
  const left = Math.max(0, daysBetween(c.today, k.end));
  const perWeek = c.history.filter((m) => !m.indie && daysBetween(m.day, c.today) <= 28).length / 4 || 1;
  const remaining = round5(k.fee * SHOW_MULT.weekly * perWeek * (left / 7) * BUYOUT_SHARE);
  if (tier >= 3) return { tier, text: 'Open Exit: you can leave today, no penalty.', cost: 0 };
  if (tier === 2) return { tier, text: `Notice Period: give notice and you leave on ${fmtDay(addDays(c.today, NOTICE_DAYS), 'dm')}.`, cost: 0 };
  if (tier === 1) return { tier, text: `Buyout: £${remaining.toLocaleString('en-GB')} gets you out today.`, cost: remaining };
  return { tier, text: 'No exit clause: you can ask for your release, and they decide.', cost: 0 };
}

export function leaveContract(c: Career): string {
  const p = person(c, c.player);
  const k = p.contract;
  if (!k) return 'You’re not under contract.';
  const t = exitTerms(c);
  const me = findWrestler(c.player)!;
  const out = () => {
    addEvent(activeWorld().history, { day: c.today, kind: 'released', who: me.id, name: me.name, promo: k.promo });
    p.contract = null;
    me.promotion = 'TIS';
    for (const s of Object.values(c.shows)) if (!s.done && s.date > c.today && s.card) s.card = s.card.filter((b) => b.a !== c.player && b.b !== c.player);
  };
  if (t.tier >= 3) { out(); return `You’ve left ${k.promo}. You’re a free agent.`; }
  if (t.tier === 2) { k.leaving = addDays(c.today, NOTICE_DAYS); k.end = k.leaving; return `Notice given: you leave ${k.promo} on ${fmtDay(k.leaving, 'dm')}.`; }
  if (t.tier === 1) {
    if (c.money < t.cost) return `You need £${t.cost.toLocaleString('en-GB')} to buy yourself out.`;
    spend(c, -t.cost, `Buyout from ${k.promo}`, 'buyout');
    out();
    return `Bought out for £${t.cost.toLocaleString('en-GB')}. You’re a free agent.`;
  }
  // Tier 0: ask nicely.
  if (c.asked?.[`release-${c.today.slice(0, 7)}`]) return 'You’ve asked this month. They said no.';
  (c.asked ??= {})[`release-${c.today.slice(0, 7)}`] = true;
  p.rep = Math.max(0, p.rep + REP_ASK_RELEASE);
  const region = promoRegion(k.promo);
  const pops = WRESTLERS.filter((w) => w.promotion === k.promo).map((w) => regionalPop(w, region)).sort((a, b) => a - b);
  const median = pops[Math.floor(pops.length / 2)] ?? 0;
  const chance = regionalPop(me, region) < median ? RELEASE_GRANT_BELOW_MEDIAN : RELEASE_GRANT_ABOVE_MEDIAN;
  if (seededRng(hashSeed(c.seed, 'release', c.today))() < chance) { out(); return `${k.promo} granted your release. You’re a free agent.`; }
  return `${k.promo} turned you down. They want to keep you.`;
}

export { CLAUSES };
