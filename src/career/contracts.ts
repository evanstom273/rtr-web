// Negotiating contracts clause by clause (packages, walk-away lines), signing (a second major, first refusal, the
// courtesy call), pay reviews and getting out of a deal.
import { roundsAdjust, willingnessMult } from './bookerLeans';
import { leanFrom, playerHas } from './leans';
import { findWrestler, PROMOTIONS, rosterOf } from '../data/rtr';
import { seededRng } from '../engine/rng';
import { hashSeed, promoRegion, regionalPop } from './booker';
import { attitude, C, CLAUSES, packageClauses, PACKAGES, type PackageId, patience, tierOf, triggerSlots, type BonusTrigger } from './clauses';
import { beltsOnMove, leavingHooks, letter, person, promoName, setCareerHooks, spend } from './career';
import { addDays, addMonths, daysBetween, fmtDay } from './dates';
import { addDeal, dealsOf, dealWith, dropDeal, openToSecond, playerPackage, promoteDeal } from './deals';
import { contractFee, floorFee, payWords, preferredPay, round5 } from './economy';
import { startTitlePromise } from './offers';
import { movePatience } from './patience';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import {
  PAY, ATTITUDE_MULT, BUYOUT_SHARE, CLAUSE_COST, DATES_FEE_LIFT, DATES_FULL, EXCL_ATTITUDE, EXCL_COST, FIRST_REFUSAL_BLOCK, FIRST_REFUSAL_COMP_FEES, FIRST_REFUSAL_PATIENCE, MAX_MAJORS, NEGO_ACCEPT, NEGO_COUNTER, NEGO_FORM_SWING, NEGO_REP_SWING, NEGO_RIVAL_LIFT, NEGO_WALK_PATIENCE, NONCOMPETE_DAYS, NOTICE_DAYS, RELEASE_GRANT_ABOVE_MEDIAN, RELEASE_GRANT_BELOW_MEDIAN, REP_ASK_RELEASE, SHOW_MULT, SPLIT_DATES_TOTAL, SPLIT_DEFAULT_NEW, TRAIT_BACKSTAGE, WAGE_MATCH_T2_MAX, WAGE_REVIEW_MONTHS, WAGE_REVIEW_POP_BAND,
} from './tuning';
import type { Career, Contract, Offer, PayType } from './types';

export interface Proposal { fee: number; months: number; clauses: number[]; dates?: number; triggers?: BonusTrigger[]; /** How it pays (Lyra's pay rework: PPA, Monthly or Both, negotiated). */ pay?: PayType; /** Life: pyro and production on any show you're on (it costs them about 3% of the fee). */ entrance?: boolean }
export type Mood = 'keen' | 'happy' | 'hesitant' | 'losing';

/** Life: an agent gets you more; a bankrupt gets less (career/life plugs in). */
const agentLifts: ((c: Career) => number)[] = [];
export const setAgentLift = (f: (c: Career) => number): void => { agentLifts.push(f); };
const agentLift = (c: Career): number => agentLifts.reduce((m, f) => m * f(c), 1);

/** What a promotion will pay you a weekly-show match on a standard (Major Exclusive) deal, before any other clauses. */
export function willingness(c: Career, promo: string, excludeOffer?: string): number {
  const me = findWrestler(c.player)!;
  const p = person(c, c.player);
  // The same fee model as their offers (fans in the promotion's home region), then reputation and form.
  let base = contractFee(me, promo);
  base *= 1 + ((p.rep - 50) / 50) * NEGO_REP_SWING;
  const last = c.history.slice(0, 10);
  if (last.length) {
    const avg = last.reduce((t, m) => t + m.stars, 0) / last.length;
    base *= 1 + Math.max(-1, Math.min(1, (avg - 3) / 2)) * NEGO_FORM_SWING;
  }
  // Personality: a Loyal wrestler re-signing is worth a little more to them; a Mercenary plays rival offers harder.
  if (playerHas(c, 'loyal') && p.contract?.promo === promo) base *= TRAIT_BACKSTAGE.loyal.ownRenewal;
  // ...and the booker's: a mercenary one pays less, an ambitious one pays for stars.
  base *= willingnessMult(promo, me, rosterOf(promo));
  base *= agentLift(c);
  const rival = c.offers.filter((o) => o.status === 'open' && o.promo !== promo && o.id !== excludeOffer).reduce((m, o) => Math.max(m, o.fee), 0);
  return round5(Math.max(base, rival * (playerHas(c, 'mercenary') ? TRAIT_BACKSTAGE.mercenary.rivalLift : NEGO_RIVAL_LIFT)));
}

/** Agreed dates: fewer dates a month pay more a date (part-timers, special attractions). */
export const datesLift = (dates?: number): number => (dates && dates < DATES_FULL ? 1 + (DATES_FULL - dates) * DATES_FEE_LIFT : 1);
/** What they'll pay a match for this shape of deal (its dates a month), before clauses. */
export const baseFor = (c: Career, o: Offer, p: Pick<Proposal, 'dates'>): number => round5(willingness(c, o.promo, o.id) * datesLift(p.dates));

/**
 * What a clause costs them a match. Exclusivity is priced the other way (Lyra's call: they buy it with a fee
 * premium): against Major Exclusive, non-exclusive and First Refusal cost them, Total Exclusivity pays you more.
 */
export function clauseCost(promo: string, base: number, i: number, tier: number): number {
  if (i === C.exclusivity) return round5(base * EXCL_COST[tier]! * EXCL_ATTITUDE[attitude(promo, i)]);
  if (!tier) return 0;
  const id = CLAUSES[i]!.id;
  return round5(base * CLAUSE_COST[id][tier - 1]! * ATTITUDE_MULT[attitude(promo, i)]);
}

export function askValue(promo: string, base: number, p: Proposal): number {
  return p.fee + p.clauses.reduce((t, tier, i) => t + clauseCost(promo, base, i, tier), 0) + (p.entrance ? Math.round(base * ENTRANCE_TERM_COST) : 0) + payCost(promo, base, p.pay);
}
/** Asking to be paid a way they don't prefer: a term like any other (Lyra's call), it costs them a little. */
export const payCost = (promo: string, base: number, pay?: PayType): number => (pay && pay !== preferredPay(promo) ? Math.round(base * PAY.askCost) : 0);
/** Life: the entrance term costs them this share of what they'd pay a match. */
export const ENTRANCE_TERM_COST = 0.03;

/** Lyra's call: no gates, anything's possible at a price. Only the rules: a second deal can't be exclusive. */
export function gate(_c: Career, o: Offer | undefined, i: number, tier: number): string | null {
  if (o?.second && i === C.exclusivity && tier >= 2) return 'You’re on another major: this deal can’t be exclusive';
  return null;
}

export function mood(c: Career, o: Offer, p: Proposal): Mood {
  const base = baseFor(c, o, p);
  const r = askValue(o.promo, base, p) / (base * NEGO_ACCEPT);
  return r <= 0.9 ? 'keen' : r <= 1 ? 'happy' : r <= NEGO_COUNTER / NEGO_ACCEPT ? 'hesitant' : 'losing';
}

/** How many rounds they'll haggle: by budget, a round fewer with a hot-headed booker. */
const rounds = (promo: string): number => Math.max(1, patience(promo) + roundsAdjust(promo));
export const roundsLeft = (o: Offer): number => Math.max(0, rounds(o.promo) - o.rounds);

/** Their offer's gone under one of your walk-away lines: you can walk away and they won't hold it against you. */
export const underLine = (o: Offer): number => (o.lines ? o.clauses.findIndex((t, i) => t < (o.lines![i] ?? 0)) : -1);

/** Start from a package (Lyra's call: they open with one; you can build your own too). */
export function packageProposal(c: Career, o: Offer, pkg: PackageId | 'custom', from: Proposal): Proposal {
  if (pkg === 'custom') return { ...from, clauses: from.clauses.map(() => 0), triggers: [] };
  const def = PACKAGES[pkg];
  const clauses = packageClauses(o.promo, pkg);
  if (o.second) clauses[C.exclusivity] = Math.min(1, clauses[C.exclusivity]!);
  const dates = def.dates ?? (o.second ? SPLIT_DEFAULT_NEW : undefined);
  const p: Proposal = { fee: 0, months: def.months, clauses, ...(dates ? { dates } : {}), triggers: defaultTriggers(clauses), pay: from.pay ?? o.pay ?? preferredPay(o.promo) };
  p.fee = openingFee(c, o, p);
  return p;
}
const defaultTriggers = (clauses: number[]): BonusTrigger[] => (['title', 'great', 'main', 'big'] as BonusTrigger[]).slice(0, triggerSlots(clauses[C.bonuses] ?? 0));

/** The fee they'd open with for these terms: what they'd pay, less what the clauses cost them, never under their floor. */
function openingFee(c: Career, o: Offer, p: Proposal): number {
  const base = baseFor(c, o, p);
  // Never under the promotion's floor (Lyra's call: about £2,500 at the bottom).
  return round5(Math.max(floorFee(o.promo), base * 0.5, base - askValue(o.promo, base, { ...p, fee: 0 })));
}

/** Put your terms to them: they accept, counter, or walk. */
export function propose(c: Career, o: Offer, p: Proposal): 'accept' | 'counter' | 'walk' {
  if (o.status !== 'open') return 'walk';
  o.rounds++;
  for (let i = 0; i < p.clauses.length; i++) {
    const g = gate(c, o, i, p.clauses[i]!);
    if (g) { o.said = `“${g}.”`; return 'counter'; }
  }
  const triggers = (p.triggers ?? []).slice(0, triggerSlots(p.clauses[C.bonuses] ?? 0));
  const base = baseFor(c, o, p);
  const ask = askValue(o.promo, base, p);
  const keep = (x: Partial<Offer>) => Object.assign(o, { months: p.months, ...(p.dates ? { dates: p.dates } : { dates: undefined }), triggers, entrance: p.entrance || undefined, pay: p.pay ?? o.pay, ...x });
  if (ask <= base * NEGO_ACCEPT) {
    keep({ fee: p.fee, clauses: [...p.clauses] });
    o.said = '“Done. We’ll draw it up.”';
    return 'accept';
  }
  if (ask > base * NEGO_COUNTER || o.rounds >= rounds(o.promo)) {
    o.status = 'walked';
    o.said = '“We’re done here.” They’ve walked away.';
    return 'walk';
  }
  // A counter: keep your clauses and cut the fee to fit; or, if that cuts too deep, ask for more exclusivity
  // (it saves them money) and drop the dearest clause they fight.
  const clauses = [...p.clauses];
  let fee = round5(base * NEGO_ACCEPT - askValue(o.promo, base, { ...p, fee: 0 }));
  if (fee < p.fee * 0.7) {
    if (!o.second && clauses[C.exclusivity]! < 2) clauses[C.exclusivity] = 2;
    const worst = clauses.map((t, i) => ({ i, cost: i === C.exclusivity ? -1 : clauseCost(o.promo, base, i, t) * (attitude(o.promo, i) === 'resist' ? 2 : 1) })).sort((a, b) => b.cost - a.cost)[0];
    if (worst && worst.cost > 0 && clauses[worst.i]! > 0) clauses[worst.i]!--;
    fee = round5(Math.min(p.fee, base * NEGO_ACCEPT - askValue(o.promo, base, { ...p, clauses, fee: 0 })));
  }
  keep({ fee: Math.max(round5(base * 0.5), fee), clauses });
  const dropped = clauses.findIndex((t, i) => t < p.clauses[i]!);
  const raised = clauses[C.exclusivity]! > p.clauses[C.exclusivity]!;
  o.said = dropped >= 0
    ? `“Too rich. We’ll do ${payWords({ ...o, pay: p.pay ?? o.pay })} if ${CLAUSES[dropped]!.name} comes down a tier${raised ? ' and you’re exclusive to us' : ''}.”`
    : raised ? `“Too rich. ${payWords({ ...o, pay: p.pay ?? o.pay })}, if you’re exclusive to us.”`
      : `“Too rich. We can do ${payWords({ ...o, pay: p.pay ?? o.pay })} with those terms.”`;
  const line = underLine(o);
  if (line >= 0) o.said += ` That’s under your line on ${CLAUSES[line]!.name}: you can walk away and they won’t mind.`;
  return 'counter';
}

/** Walk away from the table. It costs a little patience with them, unless their offer's under one of your lines. */
export function walkAway(c: Career, o: Offer): string {
  if (o.status !== 'open') return '';
  o.status = 'declined';
  if (underLine(o) >= 0 || o.rounds === 0) return `You’ve walked away from ${o.promo}. No hard feelings.`;
  movePatience(c, o.promo, NEGO_WALK_PATIENCE, 'Walked away from the table');
  return `You’ve walked away from ${o.promo}. They’re a little put out.`;
}

/** Leaving early, you can't go to their region's other majors for a while (Contract Exit's non-compete). */
export function barred(c: Career, promo: string): string | null {
  const n = person(c, c.player).noCompete;
  if (!n || n.until <= c.today || n.promo === promo) return null;
  return promoRegion(n.promo) === promoRegion(promo) ? `Your non-compete with ${n.promo} runs to ${fmtDay(n.until, 'dm')}.` : null;
}

/**
 * Sign an accepted offer. A second deal (non-exclusive) goes alongside what you're on; otherwise it starts now if
 * you're free, or the day after your current deal ends. Before you sign elsewhere, your current promotion always
 * gets a courtesy call (Lyra's call): they can make a counter-offer, and you choose.
 */
export function signOffer(c: Career, o: Offer): string {
  const p = person(c, c.player);
  const bar = barred(c, o.promo);
  if (bar) return bar;
  if (o.second) return signSecond(c, o);
  if (p.contract && p.contract.promo !== o.promo && !o.courtesy && !c.spectator) {
    const counter = courtesyCall(c, o);
    o.courtesy = counter ?? 'none';
    if (counter) return `${p.contract.promo} want a word before you go: there’s a counter-offer in your mail. Sign whichever you like.`;
  }
  const start = p.contract && p.contract.promo !== o.promo ? o.start > c.today ? o.start : addDays(p.contract.end, 1) : c.today;
  const k: Contract = {
    promo: o.promo, pay: o.pay ?? preferredPay(o.promo), start, end: addMonths(start, o.months), fee: o.fee, clauses: [...o.clauses], ...(c.life?.agent ? { agent: true } : {}), ...(o.entrance ? { entrance: true } : {}),
    ...(o.pkg ? { pkg: o.pkg } : {}), ...(o.dates ? { dates: o.dates } : {}), ...(o.triggers?.length ? { triggers: [...o.triggers] } : {}),
    since: p.contract?.promo === o.promo ? p.contract.since ?? p.contract.start : start,
  };
  o.status = 'signed';
  for (const x of c.offers) if (x.status === 'open' && !x.second) x.status = 'declined';
  // What it says about you: re-signing with them, or moving on for the money.
  if (p.contract?.promo === o.promo) leanFrom(c, 'renewed');
  else if (p.contract && o.fee >= p.contract.fee * 1.15) leanFrom(c, 'moved_for_money');
  const me = findWrestler(c.player)!;
  for (const f of signedHooks) f(c, k);
  if (start <= c.today) {
    addEvent(activeWorld().history, { day: c.today, kind: me.promotion === 'TIS' ? 'signed' : 'poached', who: me.id, name: me.name, promo: o.promo, ...(me.promotion !== 'TIS' ? { from: me.promotion } : {}) });
    if (p.contract && p.contract.promo !== o.promo) leavingHooks(c, p.contract, 'moved');
    p.contract = k;
    me.promotion = o.promo;
    if (me.also?.includes(o.promo)) dropDeal(p, me, o.promo);
    for (const s of Object.values(c.shows)) if (!s.done && s.date > c.today && s.promo === o.promo) s.card = null;
    startTitlePromise(c);
    beltsOnMove(c, c.today);
    letter(c, { kind: 'contract', from: promoName(o.promo), subject: `Signed: ${promoName(o.promo)}`, body: [`${o.months} months, ${payWords(o)}, starting today. Welcome aboard.`] });
    return `Signed with ${o.promo}.`;
  }
  p.next = k;
  letter(c, { kind: 'contract', from: promoName(o.promo), subject: `Signed: ${promoName(o.promo)}`, body: [`${o.months} months, ${payWords(o)}, starting ${fmtDay(start, 'long')}.`] });
  return `Signed with ${o.promo}, from ${fmtDay(start, 'dm')}.`;
}

/** Clauses that pay out on signing (Signing Bonus) plug in here. */
const signedHooks: ((c: Career, k: Contract) => void)[] = [];
export const onSigned = (f: (c: Career, k: Contract) => void): void => { signedHooks.push(f); };

/**
 * A second major (Lyra's call: non-exclusive deals, dates split between them, fully on both rosters). A deal
 * with First Refusal lets that promotion block it, at a price: you're compensated and their booker owes you.
 */
function signSecond(c: Career, o: Offer): string {
  const p = person(c, c.player);
  const me = findWrestler(c.player)!;
  const chk = openToSecond(p, o.promo, MAX_MAJORS);
  if (!chk.ok) return chk.why!;
  if (o.clauses[C.exclusivity]! >= 2) return 'You’re on another major: this deal can’t be exclusive.';
  if (chk.refusal) {
    const k = dealWith(p, chk.refusal)!;
    const chance = FIRST_REFUSAL_BLOCK.base + (promoRegion(k.promo) === promoRegion(o.promo) ? FIRST_REFUSAL_BLOCK.sameRegion : 0);
    if (seededRng(hashSeed(c.seed, 'first-refusal', o.id))() < chance) {
      o.status = 'blocked';
      const comp = round5(k.fee * FIRST_REFUSAL_COMP_FEES);
      spend(c, comp, `${k.promo} blocked your ${o.promo} deal (First Refusal)`, 'bonus');
      movePatience(c, k.promo, FIRST_REFUSAL_PATIENCE, `Blocked your ${o.promo} deal`);
      letter(c, { kind: 'contract', from: promoName(k.promo), subject: `We’re using our first refusal`, body: [`We’d rather you didn’t work for ${o.promo}, so we’re blocking it, as your contract lets us. Here’s £${comp.toLocaleString('en-GB')} for your trouble, and we owe you one.`] });
      return `${k.promo} used their first refusal: the ${o.promo} deal’s off. You’re £${comp.toLocaleString('en-GB')} better off.`;
    }
  }
  const dates = Math.max(1, Math.min(SPLIT_DATES_TOTAL - 2, o.dates ?? SPLIT_DEFAULT_NEW));
  const k: Contract = {
    promo: o.promo, pay: o.pay ?? preferredPay(o.promo), start: c.today, end: addMonths(c.today, o.months), fee: o.fee, clauses: [...o.clauses], dates, since: c.today, ...(c.life?.agent ? { agent: true } : {}), ...(o.entrance ? { entrance: true } : {}),
    ...(o.pkg ? { pkg: o.pkg } : {}), ...(o.triggers?.length ? { triggers: [...o.triggers] } : {}),
  };
  // Lyra's call: the month splits between them when you sign. The others share what's left.
  const others = dealsOf(p);
  const left = SPLIT_DATES_TOTAL - dates;
  for (const x of others) x.dates = Math.max(1, Math.min(x.dates ?? left, Math.floor(left / others.length)));
  o.status = 'signed';
  for (const f of signedHooks) f(c, k);
  addDeal(p, me, k);
  addEvent(activeWorld().history, { day: c.today, kind: 'signed', who: me.id, name: me.name, promo: o.promo, from: me.promotion });
  for (const s of Object.values(c.shows)) if (!s.done && s.date > c.today && s.promo === o.promo) s.card = null;
  letter(c, { kind: 'contract', from: promoName(o.promo), subject: `Signed: ${promoName(o.promo)} (alongside ${others.map((x) => x.promo).join(' and ')})`,
    body: [`${o.months} months, ${payWords(o)}, ${dates} date${dates === 1 ? '' : 's'} a month. ${others.map((x) => `${x.promo} get ${x.dates}`).join(', ')}.`] });
  return `Signed with ${o.promo} as well: ${dates} dates a month with them.`;
}

/** The courtesy call: your promotion's counter before you leave, if they want to keep you and can get near it. */
function courtesyCall(c: Career, o: Offer): string | null {
  const k = person(c, c.player).contract!;
  const own = willingness(c, k.promo);
  if (o.fee > own * NEGO_COUNTER) {
    letter(c, { kind: 'contract', from: promoName(k.promo), subject: 'Before you go', body: [`We heard about ${o.promo}. We can’t get near that, so: good luck.`] });
    return null;
  }
  const pkg = playerPackage(c, k.promo);
  const id = `o${++c.seq}`;
  const offer: Offer = { id, promo: k.promo, pay: k.pay ?? preferredPay(k.promo), day: c.today, fee: round5(Math.max(o.fee * 1.05, own)), months: Math.max(12, o.months), clauses: packageClauses(k.promo, pkg), pkg, start: addDays(k.end, 1), rounds: 0, said: '“Stay. We’ll beat it.”', status: 'open' };
  offer.start = offer.start > c.today ? c.today : offer.start;
  c.offers.push(offer);
  letter(c, {
    kind: 'offer', from: promoName(k.promo), subject: 'Before you sign with them…',
    body: [`We heard ${o.promo} want you. We’d like you to stay: £${offer.fee.toLocaleString('en-GB')} a match for ${offer.months} months, on our ${PACKAGES[pkg].name.toLowerCase()}.`, 'Your call. Sign whichever you like.'],
    terms: [['Fee', `£${offer.fee.toLocaleString('en-GB')} a match`], ['Length', `${offer.months} months`], ['Deal', PACKAGES[pkg].name]],
    action: { type: 'negotiate', offer: id },
  });
  return id;
}

/**
 * A promotion wants you (Lyra's call: they open with a package). Free agents and anyone in the last months of a
 * deal get a full deal; someone signed non-exclusively can get a second deal alongside it.
 */
export function offerDeal(c: Career, promo: string, why: string, want?: PackageId): void {
  if (barred(c, promo)) return;
  const p = person(c, c.player);
  const mine = p.contract;
  const ending = !mine || daysBetween(c.today, mine.end) <= 183;
  // Non-exclusive and not near the end: a second deal alongside. Otherwise a full deal (from the end of your current one).
  const second = !!mine && !ending && openToSecond(p, promo, MAX_MAJORS).ok;
  if (dealWith(p, promo) && !ending) return;
  const pkg: PackageId = second ? 'attraction' : want ?? playerPackage(c, promo);
  const start = mine && !second ? addDays(mine.end, 1) : c.today;
  const id = `o${++c.seq}`;
  const o: Offer = { id, promo, pay: preferredPay(promo), day: c.today, fee: 0, months: PACKAGES[pkg].months, clauses: [], start, rounds: 0, said: '', status: 'open', pkg, ...(second ? { second: true } : {}) };
  const prop = packageProposal(c, o, pkg, { fee: 0, months: 12, clauses: [] });
  Object.assign(o, { fee: prop.fee, months: prop.months, clauses: prop.clauses, ...(prop.dates ? { dates: prop.dates } : {}), triggers: prop.triggers });
  o.said = `${payWords(o)} for ${o.months} months: our ${PACKAGES[pkg].name.toLowerCase()}.`;
  c.offers.push(o);
  letter(c, {
    kind: 'offer', from: promoName(promo), subject: second ? `${promo} want you too` : `${promo} want to sign you`,
    body: [
      second ? `${why}: your deal with ${mine!.promo} isn’t exclusive, so we’d like you on our shows as well: ${o.dates ?? SPLIT_DEFAULT_NEW} dates a month, ${payWords(o)}.`
        : `${why}: we’d like to bring you to ${promoName(promo)} on our ${PACKAGES[pkg].name.toLowerCase()}, ${o.months} months, ${payWords(o)}.`,
      second ? PACKAGES[pkg].blurb : mine ? `Your current deal runs to ${fmtDay(mine.end, 'long')}, so this would start the day after.` : `${PACKAGES[pkg].blurb} It would start straight away. The terms are open to negotiation.`,
    ],
    terms: [['Pay', payWords(o)], ['Length', `${o.months} months`], ['Deal', PACKAGES[pkg].name], ['Starts', fmtDay(start, 'dm')]],
    action: { type: 'negotiate', offer: id },
  });
}
setCareerHooks({ offer: offerDeal });

/** Wage Matching Tier 1: ask for a review against comparable wrestlers on the roster. */
export function payReview(c: Career): string {
  const k = person(c, c.player).contract;
  if (!k || (k.clauses[C.wage] ?? 0) < 1) return 'Your contract has no Wage Matching.';
  if (k.lastReview && daysBetween(k.lastReview, c.today) < WAGE_REVIEW_MONTHS * 30) return `You can ask again after ${fmtDay(addMonths(k.lastReview, WAGE_REVIEW_MONTHS), 'dm')}.`;
  k.lastReview = c.today;
  const me = findWrestler(c.player)!;
  const region = promoRegion(k.promo);
  const peers = rosterOf(k.promo).filter((w) => w.id !== me.id && Math.abs(regionalPop(w, region) - regionalPop(me, region)) <= WAGE_REVIEW_POP_BAND)
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

/** The deal you mean: one promotion's, or your main one. */
const dealFor = (c: Career, promo?: string): Contract | null => (promo ? dealWith(person(c, c.player), promo) ?? null : person(c, c.player).contract);

/** What leaving early would take, by your Contract Exit tier (or free, if they've broken enough promises). */
export function exitTerms(c: Career, promo?: string): { tier: number; text: string; cost: number; free?: boolean } {
  const k = dealFor(c, promo);
  if (!k) return { tier: 0, text: '', cost: 0 };
  const tier = tierOf(k, 'exit');
  if (k.breachExit) return { tier, free: true, text: `They’ve broken their promises: you can walk away from ${k.promo} today, free.`, cost: 0 };
  const left = Math.max(0, daysBetween(c.today, k.end));
  const perWeek = c.history.filter((m) => m.promo === k.promo && !m.indie && daysBetween(m.day, c.today) <= 28).length / 4 || 1;
  const remaining = round5(k.fee * SHOW_MULT.weekly * perWeek * (left / 7) * BUYOUT_SHARE);
  const nc = NONCOMPETE_DAYS[tier] ? ` Then ${NONCOMPETE_DAYS[tier]} days before their region’s other majors can sign you.` : '';
  if (tier >= 3) return { tier, text: 'Open Exit: you can leave today, no penalty.', cost: 0 };
  if (tier === 2) return { tier, text: `Notice Period: give notice and you leave on ${fmtDay(addDays(c.today, NOTICE_DAYS), 'dm')}.${nc}`, cost: 0 };
  if (tier === 1) return { tier, text: `Buyout: £${remaining.toLocaleString('en-GB')} gets you out today.${nc}`, cost: remaining };
  return { tier, text: `No exit clause: you can ask for your release, and they decide.${nc}`, cost: 0 };
}

/** Leave a deal early (your main one, or one of your other majors). */
export function leaveContract(c: Career, promo?: string): string {
  const p = person(c, c.player);
  const k = dealFor(c, promo);
  if (!k) return 'You’re not under contract.';
  const t = exitTerms(c, k.promo);
  const me = findWrestler(c.player)!;
  const out = (how: 'left' | 'released') => {
    addEvent(activeWorld().history, { day: c.today, kind: 'released', who: me.id, name: me.name, promo: k.promo });
    leavingHooks(c, k, how);
    // Contract Exit's non-compete: their region's other majors have to wait (none after a breach, or at Open Exit).
    const days = t.free ? 0 : NONCOMPETE_DAYS[t.tier] ?? 0;
    if (days) p.noCompete = { promo: k.promo, until: addDays(c.today, days) };
    if (k === p.contract) promoteDeal(p, me); else dropDeal(p, me, k.promo);
    for (const s of Object.values(c.shows)) if (!s.done && s.date > c.today && s.card && (s.promos ?? [s.promo]).includes(k.promo)) s.card = s.card.filter((b) => b.a !== c.player && b.b !== c.player);
    beltsOnMove(c, c.today);
  };
  const now = () => (me.promotion === 'TIS' ? 'You’re a free agent.' : `You’re still with ${me.promotion}.`);
  if (t.free || t.tier >= 3) { out('left'); return `You’ve left ${k.promo}. ${now()}`; }
  if (t.tier === 2) { k.leaving = addDays(c.today, NOTICE_DAYS); k.end = k.leaving; return `Notice given: you leave ${k.promo} on ${fmtDay(k.leaving, 'dm')}.`; }
  if (t.tier === 1) {
    if (c.money < t.cost) return `You need £${t.cost.toLocaleString('en-GB')} to buy yourself out.`;
    spend(c, -t.cost, `Buyout from ${k.promo}`, 'buyout');
    out('left');
    return `Bought out for £${t.cost.toLocaleString('en-GB')}. ${now()}`;
  }
  // Tier 0: ask nicely.
  const key = `release-${k.promo}-${c.today.slice(0, 7)}`;
  if (c.asked?.[key]) return 'You’ve asked this month. They said no.';
  (c.asked ??= {})[key] = true;
  p.rep = Math.max(0, p.rep + REP_ASK_RELEASE);
  const region = promoRegion(k.promo);
  const pops = rosterOf(k.promo).map((w) => regionalPop(w, region)).sort((a, b) => a - b);
  const median = pops[Math.floor(pops.length / 2)] ?? 0;
  const chance = regionalPop(me, region) < median ? RELEASE_GRANT_BELOW_MEDIAN : RELEASE_GRANT_ABOVE_MEDIAN;
  if (seededRng(hashSeed(c.seed, 'release', k.promo, c.today))() < chance) { out('released'); return `${k.promo} granted your release. ${now()}`; }
  return `${k.promo} turned you down. They want to keep you.`;
}

export { CLAUSES, PROMOTIONS };
