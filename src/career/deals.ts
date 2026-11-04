// Deals: everyone's contracts (more than one major for a non-exclusive wrestler), what exclusivity allows,
// AI deals by package, and rewriting every contract under the 25-clause system (Lyra's call: fresh contracts).
import { findWrestler, rosterOf, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { aiClauses, aiPackage, C, CLAUSES, NCLAUSES, NO_CLAUSES, OLD_CLAUSES, packageClauses, PACKAGES, type PackageId, rosterRank, tierOf, triggerSlots } from './clauses';
import { addMonths, type Day } from './dates';
import { contractFee } from './economy';
import { patienceOf } from './patience';
import { EXCL_APPROVAL } from './tuning';
import type { Career, Contract, Person } from './types';

/** Every contract someone's on: their main one first, then any other majors (non-exclusive). */
export const dealsOf = (p: Person | undefined | null): Contract[] => (p ? [p.contract, ...(p.deals ?? [])].filter((k): k is Contract => !!k) : []);
/** Their contract with one promotion, if any. */
export const dealWith = (p: Person | undefined | null, promo: string): Contract | undefined => dealsOf(p).find((k) => k.promo === promo);
/** The strictest exclusivity across someone's deals (0 when they have none). */
export const exclusivityOf = (p: Person | undefined | null): number => dealsOf(p).reduce((m, k) => Math.max(m, tierOf(k, 'exclusivity')), 0);

/**
 * What exclusivity leaves you for indie dates and outside work (Lyra's call: stepped). Non-exclusive and
 * First Refusal: free. Major Exclusive: their approval. Total: none at all.
 */
export type Freedom = 'free' | 'approval' | 'banned';
export function sideWork(p: Person | undefined | null): { rule: Freedom; promo?: string } {
  const strict = dealsOf(p).reduce<Contract | undefined>((m, k) => (!m || tierOf(k, 'exclusivity') > tierOf(m, 'exclusivity') ? k : m), undefined);
  const t = tierOf(strict, 'exclusivity');
  return t >= 3 ? { rule: 'banned', promo: strict!.promo } : t === 2 ? { rule: 'approval', promo: strict!.promo } : { rule: 'free' };
}

/** Do they approve (Major Exclusive): likelier the more patient their booker. Seeded, so it's the same answer if asked again. */
export function approves(c: Career, promo: string, ...salt: (string | number)[]): boolean {
  const chance = EXCL_APPROVAL.base + patienceOf(c, promo) * EXCL_APPROVAL.perPatience;
  return seededRng(hashSeed(c.seed, 'excl-approve', promo, ...salt))() < chance;
}

/** The clauses of a contract by name, for reading. */
export const clauseName = (i: number): string => CLAUSES[i]?.name ?? '';

/** A contract for someone already on a roster when the world starts, or an AI signing: by package (Lyra's call). */
export function aiContract(rnd: Rng, w: Wrestler, promo: string, start: Day, months: number, pkg?: PackageId): Contract {
  const roster = rosterOf(promo);
  const p = pkg ?? aiPackage(rnd, w, rosterRank(w, roster.length ? roster : [w]));
  const k: Contract = { promo, start, end: addMonths(start, months), fee: contractFee(w, promo), clauses: aiClauses(rnd, promo, p), pkg: p, since: start };
  if (PACKAGES[p].dates) k.dates = PACKAGES[p].dates;
  const slots = triggerSlots(tierOf(k, 'bonuses'));
  if (slots) k.triggers = (['title', 'great', 'main', 'big'] as const).slice(0, slots);
  return k;
}

/** The ten old clauses' tiers onto the new 25 (the eight that carried over keep theirs). */
export function fromOldClauses(old: number[]): number[] {
  const out = NO_CLAUSES();
  OLD_CLAUSES.forEach((id, i) => { if (id in C) out[C[id as keyof typeof C]] = old[i] ?? 0; });
  return out;
}

const isOld = (k: { clauses: number[] }): boolean => k.clauses.length !== NCLAUSES;

/**
 * Rewrite every contract under the 25 clauses (Lyra's call: fresh contracts on update). Fees, lengths and
 * promotions stay; the clauses come from each wrestler's package at their promotion. Your own deal gets your
 * package too, keeping any tier you'd already negotiated on the eight clauses that carried over. Returns
 * whether anything changed (so the career can tell you).
 */
export function freshContracts(c: Career, seed = c.seed): boolean {
  let changed = false;
  const rnd = seededRng(hashSeed(seed, 'fresh-contracts'));
  for (const [id, p] of Object.entries(c.people)) {
    const w = findWrestler(id);
    for (const k of [p.contract, p.next, ...(p.deals ?? [])]) {
      if (!k || !isOld(k)) continue;
      changed = true;
      const old = k.clauses;
      if (id === c.player) {
        const pkg = playerPackage(c, k.promo);
        const fresh = packageClauses(k.promo, pkg);
        const kept = fromOldClauses(old);
        k.clauses = fresh.map((t, i) => (i === C.exclusivity ? t : Math.max(t, kept[i]!)));
        k.pkg = pkg;
        if (PACKAGES[pkg].dates) k.dates = PACKAGES[pkg].dates;
        const slots = triggerSlots(tierOf(k, 'bonuses'));
        if (slots) k.triggers = (['title', 'great', 'main', 'big'] as const).slice(0, slots);
        if (!c.spectator) c.letters.unshift({ id: `l${++c.seq}`, day: c.today, read: false, kind: 'contract', from: k.promo, subject: 'Your contract, rewritten',
          body: [`Contracts have 25 clauses now. Your ${k.promo} deal has been rewritten as their ${PACKAGES[pkg].name.toLowerCase()}, keeping your fee, your dates and anything you’d already negotiated.`, 'Have a look at it under Contract.'] });
      } else if (w) {
        const pkg = aiPackage(rnd, w, rosterRank(w, rosterOf(k.promo)));
        k.clauses = aiClauses(rnd, k.promo, pkg);
        k.pkg = pkg;
        if (PACKAGES[pkg].dates) k.dates = PACKAGES[pkg].dates;
      } else k.clauses = fromOldClauses(old);
      k.since ??= k.start;
    }
  }
  for (const o of c.offers) if (isOld(o)) { o.clauses = fromOldClauses(o.clauses); o.clauses[C.exclusivity] = 2; changed = true; }
  return changed;
}

/** The package a promotion would offer you: by where you'd stand on its roster, your age, and theirs. */
export function playerPackage(c: Career, promo: string): PackageId {
  const me = findWrestler(c.player);
  if (!me) return 'standard';
  const roster = rosterOf(promo).filter((w) => w.id !== me.id);
  const rank = rosterRank(me, [...roster, me]);
  const rnd = seededRng(hashSeed(c.seed, 'pkg', promo, c.today.slice(0, 7)));
  const pkg = aiPackage(rnd, me, rank);
  // You never get the plain AI deal as an opening: the mid-card are offered a developmental deal young, a standard-shaped star deal otherwise.
  return pkg === 'standard' ? (me.age <= 25 ? 'developmental' : 'star') : pkg;
}

/** Sign someone to another major as well (a non-exclusive deal): on both rosters, fully. */
export function addDeal(p: Person, w: Wrestler, k: Contract): void {
  (p.deals ??= []).push(k);
  w.also = [...new Set([...(w.also ?? []), k.promo])];
}

/** End one of someone's extra deals (or promote it to their main one if the main one's ending). */
export function dropDeal(p: Person, w: Wrestler, promo: string): void {
  p.deals = (p.deals ?? []).filter((k) => k.promo !== promo);
  if (!p.deals.length) delete p.deals;
  w.also = (w.also ?? []).filter((x) => x !== promo);
  if (!w.also.length) delete w.also;
}

/**
 * Their main deal's ended: an extra deal becomes the main one (they stay on that roster), or they're a free
 * agent. Returns the promotion they're now with ('TIS' for a free agent).
 */
export function promoteDeal(p: Person, w: Wrestler): string {
  const next = p.deals?.[0];
  if (!next) { p.contract = null; w.promotion = 'TIS'; return 'TIS'; }
  dropDeal(p, w, next.promo);
  p.contract = next;
  w.promotion = next.promo;
  return next.promo;
}

/** Can a promotion sign someone who's already on a deal, as a second one? By their exclusivity and how many majors they're on. */
export function openToSecond(p: Person | undefined, promo: string, maxMajors: number): { ok: boolean; why?: string; refusal?: string } {
  const deals = dealsOf(p);
  if (!deals.length) return { ok: true };
  if (deals.some((k) => k.promo === promo)) return { ok: false, why: 'Already signed there.' };
  if (deals.length >= maxMajors) return { ok: false, why: `You’re already on ${deals.length} majors.` };
  const strict = deals.find((k) => tierOf(k, 'exclusivity') >= 2);
  if (strict) return { ok: false, why: `Your ${strict.promo} deal is exclusive.` };
  const refusal = deals.find((k) => tierOf(k, 'exclusivity') === 1);
  return { ok: true, ...(refusal ? { refusal: refusal.promo } : {}) };
}
