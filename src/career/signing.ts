// Booker mode, stage 5 (Lyra's design): signing from the other side of the table. You approach someone (a free agent,
// or someone else's, buying out their deal); they ask for a fee a date and the clauses they want (the same 25 the
// player gets); you offer; they accept, counter, or walk. What they ask depends on their fans where you are, how big
// you are against where they are now, their traits, and how they feel about you. Releases cost what's left of the deal.
// Contracts ending on your roster: you're asked whether to renew; someone who can't stand you won't.
import { databaseChanged, fansIn, findWrestler, globalScore, rosterOf, TITLES, WRESTLERS, type Wrestler, holds } from '../data/rtr';
import { inBout } from './bouts';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { feelPair, likeOf } from '../world/people';
import { TIERS } from '../world/companies';
import { promoRegion } from './booker';
import { post } from './books';
import { aiClauses, aiPackage, C, NO_CLAUSES, rosterRank } from './clauses';
import { letter, person, release, setCareerHooks } from './career';
import { companyOf, officeOf, playerRuns, roleIn } from './company';
import { clauseCost } from './contracts';
import { dropDeal } from './deals';
import { addMonths, daysBetween, type Day } from './dates';
import { registerReplies } from './mail';
import { regionOfCountry } from './places';
import { BOND_LOG, FEATURES, SIGN } from './tuning';
import type { Career, Contract } from './types';

export interface Deal { fee: number; months: number; clauses: number[] }
export interface Approach {
  id: string;
  promo: string;
  who: string;
  /** What they want, what you last offered, and what they said. */
  ask: Deal;
  offered?: Deal;
  said: string;
  rounds: number;
  /** Buying them out of the deal they're on (paid to their promotion when they sign). */
  buyout?: number;
  status: 'open' | 'signed' | 'walked';
  day: Day;
}

const W = (id: string): Wrestler | undefined => findWrestler(id);
const nameOf = (id: string): string => W(id)?.name ?? id;
const r5 = (v: number) => Math.round(v / 5) * 5;
const P = () => activeWorld().people!;
const allApproaches = (c: Career): Approach[] => ((officeOf(c) as { approaches?: Approach[] }).approaches ??= []);
export const approachesOf = (c: Career, promo?: string): Approach[] => allApproaches(c).filter((a) => !promo || a.promo === promo);
/** Where a promotion's fans are: its home, or its region. */
export const homeRegion = (promo: string) => { const co = companyOf(promo); return co?.home ? regionOfCountry(co.home.country) : promoRegion(promo); };
/** Contracted to a promotion (its main deal, or a second one). */
export const contractWith = (c: Career, id: string, promo: string): Contract | undefined => {
  const p = c.people[id];
  return p?.contract?.promo === promo ? p.contract : p?.deals?.find((d) => d.promo === promo);
};
const tierAt = (promo: string): number => (promo === 'TIS' ? -1 : TIERS.indexOf(companyOf(promo)?.tier ?? 'national'));

/** What someone's worth a date to a promotion: their fans where it is, its size, where they are now, their traits, and you. */
export function worth(c: Career, promo: string, w: Wrestler): number {
  const co = companyOf(promo);
  const tier = co?.tier ?? 'national';
  const fans = fansIn(w, homeRegion(promo));
  let fee = SIGN.floor[tier]! * Math.min(SIGN.maxFactor, Math.max(SIGN.minFactor, (Math.max(1, fans) / SIGN.ref[tier]!) ** 0.5));
  // Stepping down to a smaller promotion takes persuading; the indies come cheaper.
  if (tierAt(w.promotion) > tierAt(promo)) fee *= SIGN.stepDown;
  if (w.traits?.includes('mercenary')) fee *= SIGN.mercenary;
  if (w.promotion !== 'TIS' && w.traits?.includes('loyal')) fee *= SIGN.loyal;
  // How they feel about you, the one asking.
  fee *= 1 - likeOf(P(), w.id, c.player) * SIGN.likeEffect;
  return Math.max(SIGN.minFee, r5(fee));
}

/** What they'd ask for: a fee a date, a deal length and the clauses someone of their standing wants. */
/** What someone's money does to their asking price (Life stage 4: the rich are picky, the skint aren't). */
const demandLifts: ((c: Career, id: string, promo: string) => number)[] = [];
export const setDemandLift = (f: (c: Career, id: string, promo: string) => number): void => { demandLifts.push(f); };
const demandLift = (c: Career, id: string, promo: string) => demandLifts.reduce((m, f) => m * f(c, id, promo), 1);

export function demand(c: Career, promo: string, w: Wrestler): Deal {
  const rnd = seededRng(hashSeed(c.seed, 'ask', promo, w.id, c.today.slice(0, 7)));
  const rank = rosterRank(w, [...rosterOf(promo), w]);
  const clauses = aiClauses(rnd, promo, aiPackage(rnd, w, rank));
  clauses[C.exclusivity] = NO_CLAUSES()[C.exclusivity] ?? 0;
  const lift = demandLift(c, w.id, promo);
  return { fee: lift === 1 ? worth(c, promo, w) : r5(worth(c, promo, w) * lift), months: 12, clauses };
}
/** A deal's worth to them: the fee and every clause (exclusivity aside: signing with you means working for you). */
export const dealValue = (promo: string, base: number, d: Deal): number => d.fee + d.clauses.reduce((t, tier, i) => t + (i === C.exclusivity ? 0 : clauseCost(promo, base, i, tier)), 0);

/** Buying someone out of their deal elsewhere: their fee for a month a date a week, for what's left, ×. */
export function buyoutFor(c: Career, w: Wrestler): number {
  const k = c.people[w.id]?.contract;
  if (!k || w.promotion === 'TIS') return 0;
  const months = Math.max(1, Math.ceil(daysBetween(c.today, k.end) / 30));
  return r5(k.fee * 4 * months * SIGN.buyout);
}

/** Why you can't approach someone (null: you can). */
export function cantApproach(c: Career, promo: string, who: string): string | null {
  if (!FEATURES.booker || !roleIn(c, promo)) return 'You don’t book it.';
  const w = W(who);
  if (!w || c.people[who]?.retired) return 'They’re not around.';
  if (who === c.player) return 'That’s you.';
  if (contractWith(c, who, promo)) return 'They’re already signed with you.';
  if (approachesOf(c).some((a) => a.who === who && a.status === 'open')) return 'You’re already talking to them.';
  if (TITLES.some((t) => holds(t, who) && w.promotion !== 'TIS')) return 'They’re a champion where they are: nobody’s selling.';
  return null;
}

/** Start talking: what they want (and, if they're signed elsewhere, what it'd cost to buy them out). */
export function approach(c: Career, promo: string, who: string): Approach | string {
  const no = cantApproach(c, promo, who);
  if (no) return no;
  const w = W(who)!;
  const ask = demand(c, promo, w);
  const buyout = buyoutFor(c, w);
  // A star someone else wants: they know it.
  const rival = globalScore(w) >= SIGN.rivalFrom && seededRng(hashSeed(c.seed, 'rival', who, c.today))() < SIGN.rivalChance;
  if (rival) ask.fee = r5(ask.fee * SIGN.rivalLift);
  const a: Approach = {
    id: `ap${++c.seq}`, promo, who, ask, rounds: 0, status: 'open', day: c.today, ...(buyout ? { buyout } : {}),
    said: rival ? `Someone else has been on the phone. ${ask.fee.toLocaleString('en-GB')} a date, and I want it in writing.` : `I’d want £${ask.fee.toLocaleString('en-GB')} a date${ask.clauses.some((t, i) => t && i !== C.exclusivity) ? ', and a few things in the contract' : ''}.`,
  };
  allApproaches(c).push(a);
  return a;
}

/** Make an offer: they sign, meet you halfway, or walk. */
export function offer(c: Career, id: string, d: Deal): string {
  const a = approachesOf(c).find((x) => x.id === id && x.status === 'open');
  if (!a || !roleIn(c, a.promo)) return 'You’re not talking to them.';
  const w = W(a.who);
  if (!w) return 'They’re not around.';
  const co = companyOf(a.promo)!;
  a.rounds++;
  a.offered = d;
  const base = a.ask.fee;
  const want = dealValue(a.promo, base, a.ask) * (d.months > a.ask.months ? 1 + (d.months - a.ask.months) * SIGN.longerPerMonth : d.months < 6 ? SIGN.shortDeal : 1);
  const got = dealValue(a.promo, base, d);
  const r = got / Math.max(1, want);
  if (r >= 1) {
    if (a.buyout && co.bank < a.buyout) return `The buyout’s £${a.buyout.toLocaleString('en-GB')} and the company hasn’t got it.`;
    signWith(c, a, d);
    return `${w.name} signs: £${d.fee.toLocaleString('en-GB')} a date for ${d.months} months.`;
  }
  if (r < SIGN.walkBelow || a.rounds >= SIGN.rounds) {
    a.status = 'walked';
    if (r < SIGN.insult) feelPair(P(), a.who, c.player, [SIGN.insultLike, 0], [0, 0], 'Insulted me with an offer', c.today, { keep: BOND_LOG.mine });
    a.said = r < SIGN.insult ? 'Are you having a laugh? Don’t ring me again.' : 'We’re too far apart. Good luck with it.';
    return `${w.name} walks.`;
  }
  // Meet in the middle: the fee comes down towards yours.
  a.ask = { ...a.ask, fee: r5((a.ask.fee + d.fee) / 2 + (want - got) * SIGN.counterGap) };
  a.said = `Meet me at £${a.ask.fee.toLocaleString('en-GB')} a date and we’ve a deal.`;
  return `${w.name} comes back: £${a.ask.fee.toLocaleString('en-GB')}.`;
}

function signWith(c: Career, a: Approach, d: Deal): void {
  const w = W(a.who)!;
  const co = companyOf(a.promo)!;
  const from = w.promotion;
  if (a.buyout && from !== 'TIS') {
    post(co, 'fees', a.buyout);
    const theirs = companyOf(from);
    if (theirs) post(theirs, 'invest', a.buyout);
  }
  const p = person(c, w.id);
  for (const k of [...(p.deals ?? [])]) dropDeal(p, w, k.promo);
  addEvent(activeWorld().history, { day: c.today, kind: from === 'TIS' ? 'signed' : 'poached', who: w.id, name: w.name, promo: a.promo, ...(from !== 'TIS' ? { from } : {}) });
  w.promotion = a.promo;
  p.contract = { promo: a.promo, start: c.today, end: addMonths(c.today, d.months), fee: d.fee, clauses: [...d.clauses], since: c.today };
  p.moves = [...(p.moves ?? []), c.today].slice(-4);
  p.renewals = 0;
  // Off any other promotion's cards from tonight.
  for (const s of Object.values(c.shows)) if (!s.done && s.promo !== a.promo && s.card) s.card = s.card.filter((b) => b.result || !inBout(b, w.id));
  feelPair(P(), w.id, c.player, [SIGN.signedLike, SIGN.signedLike], [0, 0], `Signed for ${a.promo}`, c.today, { keep: BOND_LOG.mine });
  a.status = 'signed';
  a.said = 'Pleasure doing business.';
  databaseChanged();
}

/** Let someone go: what's left of their deal is paid off (Contract Exit), and their friends notice. */
export function releaseFrom(c: Career, promo: string, who: string): string {
  if (!roleIn(c, promo)) return 'You don’t run it.';
  const w = W(who);
  const k = contractWith(c, who, promo);
  if (!w || !k) return 'They’re not signed with you.';
  const co = companyOf(promo)!;
  const months = Math.max(0, Math.ceil(daysBetween(c.today, k.end) / 30));
  const cost = r5(k.fee * 4 * Math.min(SIGN.releaseMonths, months));
  post(co, 'wages', cost);
  release(c, w, 'released', promo);
  feelPair(P(), who, c.player, [SIGN.releasedLike, 0], [0, 0], 'Released me', c.today, { keep: BOND_LOG.mine });
  return `${w.name} is released${cost ? `: £${cost.toLocaleString('en-GB')} to pay off the rest of the deal` : ''}.`;
}

/** Thirty days out: a contract on your roster is up soon. Renew it (they say no if they can't stand you), or let it run out. */
function renewals(c: Career): void {
  if (!FEATURES.booker) return;
  for (const r of officeOf(c).roles) {
    for (const w of rosterOf(r.promo)) {
      const k = contractWith(c, w.id, r.promo);
      if (!k || k.walk || daysBetween(c.today, k.end) !== SIGN.renewNotice) continue;
      letter(c, { kind: 'contract', from: `${r.promo} · the office`, subject: `${w.name}’s contract is up on ${k.end}`, body: [`£${k.fee.toLocaleString('en-GB')} a date. Renew for a year at ${Math.round((SIGN.renewLift - 1) * 100)}% more, or let it run out?`],
        replies: [{ id: 'renew_yes', label: 'Renew it' }, { id: 'renew_no', label: 'Let it run out' }], ctx: { renew: w.id, promo: r.promo } });
    }
  }
}

registerReplies({
  renew_yes: (c, l) => {
    const who = l.ctx?.renew ?? '', promo = l.ctx?.promo ?? '';
    const k = contractWith(c, who, promo);
    if (!k || !roleIn(c, promo)) return 'Too late.';
    if (likeOf(P(), who, c.player) <= SIGN.walkLike) { k.walk = true; return `${nameOf(who)} won’t sign another deal with you. They’re off when it runs out.`; }
    k.fee = r5(k.fee * SIGN.renewLift); k.end = addMonths(k.end, 12); k.talked = true;
    return `${nameOf(who)} re-signs: £${k.fee.toLocaleString('en-GB')} a date.`;
  },
  renew_no: (c, l) => { const k = contractWith(c, l.ctx?.renew ?? '', l.ctx?.promo ?? ''); if (k) k.walk = true; return 'It runs out.'; },
});

setCareerHooks({
  daily: renewals,
  // A deal on a roster you run that ends: renewed (above), or they go. The AI doesn't re-sign for you.
  ending: (c, w, k) => {
    if (!FEATURES.booker || !playerRuns(k.promo)) return false;
    release(c, w, 'expired', k.promo);
    if (roleIn(c, k.promo)) letter(c, { kind: 'news', from: `${k.promo} · the office`, subject: `${w.name} has left`, body: ['Their contract ran out.'] });
    return true;
  },
});

/** Who you might sign: free agents near you, and others' talent (buyouts), by how much they'd draw where you are. */
export function prospects(c: Career, promo: string, n = 40): Wrestler[] {
  const region = homeRegion(promo);
  return WRESTLERS.filter((w) => w.id !== c.player && !c.people[w.id]?.retired && !contractWith(c, w.id, promo) && fansIn(w, region) > 0)
    .sort((a, b) => fansIn(b, region) - fansIn(a, region)).slice(0, n);
}

