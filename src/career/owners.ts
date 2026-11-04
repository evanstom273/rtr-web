// Booker mode, stage 6 (Lyra's design): the ways in, and the owners. You can be offered a booking job (by your name and
// how your shows have gone), apply for one, buy a promotion (or buy out the one you book), be handed one (a dying or
// retiring owner, or a desperate one) and sell up. Booking for someone else, the owner sets goals each quarter, has
// patience like any booker, pushes their favourites, and sacks you when it runs out.
import { databaseChanged, findWrestler, PROMOTIONS, rosterOf, TITLES, type Staffer } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { leaveJob, likeOf } from '../world/people';
import { makeOwner, TIER_LABEL, type Company } from '../world/companies';
import { bookSummary } from './books';
import { letter, promoName, setCareerHooks, spend } from './career';
import { canRun, companies, companyOf, leaveRole, playerRuns, roleIn, rolesOf, takeRole } from './company';
import { addDays, daysBetween, type Day } from './dates';
import { registerReplies } from './mail';
import { BIZ, FEATURES, OWNER } from './tuning';
import type { Career, Show } from './types';

export type GoalKind = 'crowd' | 'profit' | 'rating' | 'push' | 'keep';
export interface Goal { kind: GoalKind; target: number; who?: string; title?: string; until: Day; done?: boolean; got?: number }
export interface OwnerView { patience: number; goals: Goal[]; favourite?: string; applied?: Record<string, Day> }

const W = (id: string) => findWrestler(id);
const nameOf = (id: string): string => W(id)?.name ?? id;
const P = () => activeWorld().people!;
const r5 = (v: number) => Math.round(v / 5) * 5;
const money = (v: number) => `£${Math.round(v).toLocaleString('en-GB')}`;
/** The owner's side of a company you book for. */
export const ownerView = (co: Company): OwnerView => (co.boss ??= { patience: OWNER.start, goals: [] });
export const ownerOf = (promo: string): Staffer | undefined => { const co = companyOf(promo); return co && co.owner !== 'player' ? P().staff[co.owner] : undefined; };

// ------------------------------------------------------------------ what a promotion's worth

/** A promotion's price: its money, a year's takings, its fans, its roster. In trouble, it goes cheaper. */
export function valuation(promo: string): number {
  const co = companyOf(promo);
  if (!co) return 0;
  const year = bookSummary(co).months.reduce((t, m) => t + m.in, 0);
  const pop = PROMOTIONS.find((p) => p.initials === promo)?.popularity ?? 10;
  const v = Math.max(0, co.bank) + year * OWNER.yearsTakings + pop * OWNER.perPop[co.tier]! + rosterOf(promo).length * OWNER.perHead[co.tier]!;
  return r5(v * ((co.red ?? 0) > 0 ? OWNER.troubled : 1));
}
/** What its owner would take from you: the valuation, a little off if they like you. */
export function askingPrice(c: Career, promo: string): number {
  const o = ownerOf(promo);
  const like = o ? likeOf(P(), o.id, c.player) : 0;
  return r5(valuation(promo) * (1 - Math.max(0, like) * OWNER.friendDiscount));
}

/** Buy a promotion (or the one you book for, from its owner): your money, at their price. */
export function buy(c: Career, promo: string, amount: number): string {
  if (!FEATURES.booker) return 'Booker mode isn’t switched on yet.';
  const co = companyOf(promo);
  if (!co || co.closed) return 'There’s no such promotion.';
  if (co.owner === 'player') return 'It’s already yours.';
  const bookingIt = roleIn(c, promo)?.as === 'booker';
  if (!bookingIt) { const no = canRun(c, promo); if (no) return no; }
  const ask = askingPrice(c, promo);
  if (amount > c.money) return 'You haven’t got that much.';
  if (amount < ask * OWNER.counterFrom) return `${ownerOf(promo)?.name ?? 'The owner'} laughs. They want nearer ${money(ask)}.`;
  if (amount < ask) return `${ownerOf(promo)?.name ?? 'The owner'} won’t take less than ${money(ask)}.`;
  const o = ownerOf(promo);
  spend(c, -amount, `Bought ${promoName(promo)}`, 'company');
  if (o) leaveJob(o, c.today, 'quit');
  if (bookingIt) { co.owner = 'player'; roleIn(c, promo)!.as = 'owner'; }
  else takeRole(c, promo, 'owner');
  co.owner = 'player';
  addEvent(activeWorld().history, { day: c.today, kind: 'hired', who: c.player, name: W(c.player)!.name, promo, what: `bought ${promoName(promo)}` });
  databaseChanged();
  return `${promoName(promo)} is yours: ${money(amount)}.`;
}

/** Sell up: a buyer takes it off you at a bit under what it's worth; someone else runs it from here. */
export function sellUp(c: Career, promo: string): string {
  const co = companyOf(promo);
  if (!co || roleIn(c, promo)?.as !== 'owner') return 'It isn’t yours to sell.';
  const price = r5(valuation(promo) * OWNER.sellFor);
  const rnd = seededRng(hashSeed(c.seed, 'buyer', promo, c.today));
  const buyer = makeOwner(rnd, P(), promo, co.home?.country ?? 'UK', `own_${promo.toLowerCase()}_${c.today.replace(/-/g, '')}`, c.today);
  co.owner = buyer.id;
  delete co.wage;
  spend(c, price, `Sold ${promoName(promo)}`, 'company');
  leaveRole(c, promo, 'sold');
  return `Sold to ${buyer.name} for ${money(price)}.`;
}

// ------------------------------------------------------------------ being hired, and applying

/** Your standing as a booker: your name in the business and how your shows have gone. */
export function bookerStanding(c: Career): number {
  const rep = c.people[c.player]?.rep ?? 30;
  const shows = Object.values(companies()).filter((co) => co.rep !== undefined && (roleIn(c, co.promo) || co.founded));
  const rated = shows.length ? shows.reduce((t, co) => t + (co.rep ?? 0), 0) / shows.length : 2.5;
  return Math.round(rep * 0.6 + (rated - 2) * 20);
}

/** Ask a promotion for its book. Its owner decides on your standing and whether they like you; ask once a quarter. */
export function applyFor(c: Career, promo: string): string {
  const no = canRun(c, promo);
  if (no) return no;
  const co = companyOf(promo)!;
  if (co.owner === 'player') return 'It’s yours.';
  const boss = ownerView(co);
  const last = boss.applied?.[c.player];
  if (last && daysBetween(last, c.today) < OWNER.applyGap) return 'You asked recently. Give it time.';
  boss.applied = { ...(boss.applied ?? {}), [c.player]: c.today };
  const o = ownerOf(promo);
  const need = OWNER.applyNeed[co.tier]!;
  const like = o ? likeOf(P(), o.id, c.player) : 0;
  const roll = seededRng(hashSeed(c.seed, 'apply', promo, c.today))();
  if (bookerStanding(c) + like / 5 + roll * 20 < need) return `${o?.name ?? 'The owner'}: “Not yet. Build a name.”`;
  takeRole(c, promo, 'booker');
  boss.patience = OWNER.probation;
  setGoals(c, co);
  return `${o?.name ?? 'The owner'}: “You’re on probation. Don’t make me regret it.”`;
}

/** Offers come to you: a promotion whose booker's just gone, or whose shows are flat, wants you. */
function jobOffers(c: Career, rnd: Rng): void {
  const standing = bookerStanding(c);
  for (const co of Object.values(companies())) {
    if (co.closed || co.owner === 'player' || co.booker === 'player' || canRun(c, co.promo)) continue;
    if (standing < OWNER.applyNeed[co.tier]! || rnd() >= OWNER.offerChance) continue;
    if (c.letters.some((l) => l.ctx?.job === co.promo && !l.replied && daysBetween(l.day, c.today) < 60)) continue;
    const o = ownerOf(co.promo);
    letter(c, { kind: 'contract', from: `${o?.name ?? 'The owner'} · ${co.promo}`, subject: `${promoName(co.promo)} want you to book it`,
      body: [`We’ve watched what you do. ${promoName(co.promo)} (${TIER_LABEL[co.tier].toLowerCase()}) needs a booker: ${money(BIZ.salary[co.tier]!)} a month, and you answer to me.`],
      replies: [{ id: 'job_yes', label: 'Take the job' }, { id: 'job_no', label: 'Not now' }], ctx: { job: co.promo } });
    return;
  }
}

// ------------------------------------------------------------------ the owner's goals and patience

function setGoals(c: Career, co: Company): void {
  const rnd = seededRng(hashSeed(c.seed, 'goals', co.promo, c.today));
  const boss = ownerView(co);
  const until = addDays(c.today, OWNER.quarter);
  const roster = rosterOf(co.promo).filter((w) => w.id !== c.player);
  const fav = roster.length ? roster[Math.floor(rnd() * Math.min(5, roster.length))]! : undefined;
  boss.favourite = fav?.id;
  const champ = TITLES.find((t) => PROMOTIONS.find((p) => p.initials === co.promo)?.titles.includes(t.id) && t.holder);
  const pool: Goal[] = [
    { kind: 'rating', target: OWNER.ratingGoal, until },
    { kind: 'profit', target: 0, until },
    { kind: 'crowd', target: Math.round(BIZ.venues[co.tier]![1]!.cap * OWNER.crowdShare), until },
    ...(fav ? [{ kind: 'push' as const, target: OWNER.pushWins, who: fav.id, until, got: 0 }] : []),
    ...(champ ? [{ kind: 'keep' as const, target: 1, title: champ.id, who: champ.holder!, until }] : []),
  ];
  boss.goals = [];
  while (boss.goals.length < OWNER.goals && pool.length) boss.goals.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]!);
  if (roleIn(c, co.promo)) letter(c, { kind: 'contract', from: `${ownerOf(co.promo)?.name ?? 'The owner'} · ${co.promo}`, subject: 'What I want this quarter', body: boss.goals.map(goalText) });
}

export function goalText(g: Goal): string {
  switch (g.kind) {
    case 'rating': return `Shows averaging ${g.target}★ or better.`;
    case 'profit': return 'No losses: the quarter in the black.';
    case 'crowd': return `Crowds of ${g.target.toLocaleString('en-GB')} a show.`;
    case 'push': return `${nameOf(g.who!)} winning: ${g.target} wins.`;
    default: return `${nameOf(g.who!)} keeps the ${TITLES.find((t) => t.id === g.title)?.name ?? 'title'}.`;
  }
}

/** The owner watches your shows: rated well, full, their favourite winning, their champion keeping it, under budget. */
function ownerSees(c: Career, show: Show): void {
  if (!FEATURES.booker || roleIn(c, show.promo)?.as !== 'booker') return;
  const co = companyOf(show.promo)!;
  const boss = ownerView(co);
  const rating = show.rating?.score ?? 0;
  if (rating && rating < OWNER.badShow) boss.patience += OWNER.badShowCost;
  if (show.books && show.books.out > show.books.in && (show.books.out - show.books.in) > BIZ.budget[co.tier]!) boss.patience += OWNER.overBudget;
  for (const g of boss.goals) {
    if (g.kind === 'push' && show.card?.some((b) => b.result?.winner === g.who)) g.got = (g.got ?? 0) + 1;
    if (g.kind === 'keep' && g.title && TITLES.find((t) => t.id === g.title)?.holder !== g.who) {
      if (!g.done) { boss.patience += OWNER.vetoed; letter(c, { kind: 'contract', from: `${ownerOf(co.promo)?.name ?? 'The owner'} · ${co.promo}`, subject: 'I told you to keep it on them', body: ['That wasn’t yours to change. Don’t do it again.'] }); }
      g.done = true;
    }
  }
  sacked(c, co);
}

/** Each month: a quarter's goals scored; the red costs patience; meddling; an old owner hands it on. */
function monthly(c: Career): void {
  if (!FEATURES.booker) return;
  const rnd = seededRng(hashSeed(c.seed, 'owners', c.today));
  for (const co of Object.values(companies())) {
    if (co.closed) continue;
    const role = roleIn(c, co.promo);
    if (role?.as === 'booker') {
      const boss = ownerView(co);
      if (!boss.goals.length) setGoals(c, co);
      if ((co.red ?? 0) > 0) boss.patience += OWNER.redMonth;
      if (boss.goals[0] && boss.goals[0].until <= addDays(c.today, 1)) scoreQuarter(c, co);
      if (rnd() < OWNER.meddle && boss.favourite) letter(c, { kind: 'contract', from: `${ownerOf(co.promo)?.name ?? 'The owner'} · ${co.promo}`, subject: `What about ${nameOf(boss.favourite)}?`, body: [`I like ${nameOf(boss.favourite)}. I want to see them on top. Make it happen.`],
        replies: [{ id: 'own_yes', label: 'I’ll see to it' }, { id: 'own_no', label: 'I book the shows' }], ctx: { promo: co.promo } });
      sacked(c, co);
    }
    // An old owner steps back (or dies): to you, if you're close and can take it; or a new face.
    const o = ownerOf(co.promo);
    if (o && !playerRuns(co.promo) && Math.floor(daysBetween(o.born, c.today) / 365.25) >= OWNER.oldAge && rnd() < OWNER.handOn) {
      if (likeOf(P(), o.id, c.player) >= OWNER.closeLike && !canRun(c, co.promo)) {
        letter(c, { kind: 'contract', from: o.name, subject: `I want you to have ${promoName(co.promo)}`, body: [`I’m done. I’d rather it went to someone I trust than to the suits. It’s yours if you want it.`],
          replies: [{ id: 'own_take', label: 'Take it on' }, { id: 'own_pass', label: 'I can’t' }], ctx: { promo: co.promo } });
      } else {
        leaveJob(o, c.today, 'retired');
        const next = makeOwner(rnd, P(), co.promo, o.country, `own_${co.promo.toLowerCase()}_${c.today.replace(/-/g, '')}`, c.today);
        co.owner = next.id;
        if (role) letter(c, { kind: 'news', from: 'The news desk', subject: `${promoName(co.promo)} has a new owner`, body: [`${o.name} has stepped back. ${next.name} owns ${promoName(co.promo)} now: your boss.`] });
      }
    }
    // A desperate owner: in the red and you've a name: theirs for a pound.
    if (o && !playerRuns(co.promo) && (co.red ?? 0) >= OWNER.desperateRed && !canRun(c, co.promo) && rnd() < OWNER.desperate && !c.letters.some((l) => l.ctx?.promo === co.promo && l.replies?.some((r) => r.id === 'own_take') && !l.replied)) {
      letter(c, { kind: 'contract', from: o.name, subject: `Take ${promoName(co.promo)} off my hands`, body: ['It’s sinking and I can’t bail it any more. Debts and all, it’s yours for a pound.'],
        replies: [{ id: 'own_take', label: 'Take it on' }, { id: 'own_pass', label: 'No chance' }], ctx: { promo: co.promo } });
    }
  }
  if (rolesOf(c).length < 2) jobOffers(c, rnd);
}

function scoreQuarter(c: Career, co: Company): void {
  const boss = ownerView(co);
  const months = bookSummary(co).months.slice(-3);
  const shows = Object.values(c.shows).filter((s) => s.promo === co.promo && s.done && s.date >= addDays(c.today, -OWNER.quarter));
  const rated = shows.filter((s) => s.rating);
  const lines: string[] = [];
  for (const g of boss.goals) {
    const met = g.kind === 'rating' ? (rated.length ? rated.reduce((t, s) => t + s.rating!.score, 0) / rated.length >= g.target : false)
      : g.kind === 'profit' ? months.reduce((t, m) => t + m.in - m.out, 0) >= 0
      : g.kind === 'crowd' ? (shows.length ? shows.reduce((t, s) => t + (s.books?.sold ?? 0), 0) / shows.length >= g.target : false)
      : g.kind === 'push' ? (g.got ?? 0) >= g.target
      : !g.done;
    boss.patience += met ? OWNER.goalMet : OWNER.goalMissed;
    lines.push(`${met ? '✓' : '✗'} ${goalText(g)}`);
  }
  boss.patience = Math.max(0, Math.min(100, boss.patience));
  letter(c, { kind: 'contract', from: `${ownerOf(co.promo)?.name ?? 'The owner'} · ${co.promo}`, subject: 'The quarter', body: [...lines, `Patience: ${boss.patience}/100.`] });
  setGoals(c, co);
}

function sacked(c: Career, co: Company): void {
  const boss = ownerView(co);
  boss.patience = Math.max(0, Math.min(100, boss.patience));
  if (boss.patience > 0 || roleIn(c, co.promo)?.as !== 'booker') return;
  leaveRole(c, co.promo, 'sacked');
  letter(c, { kind: 'contract', from: `${ownerOf(co.promo)?.name ?? 'The owner'} · ${co.promo}`, subject: 'You’re fired', body: ['Clear your desk. Someone else is booking it from Monday.'] });
}

/** Walk out of a booking job. */
export function resign(c: Career, promo: string): string {
  const r = roleIn(c, promo);
  if (!r) return 'You don’t run it.';
  if (r.as === 'owner') return 'It’s yours: sell it, or close it down.';
  leaveRole(c, promo, 'quit');
  return `You’ve quit ${promoName(promo)}.`;
}

registerReplies({
  job_yes: (c, l) => { const promo = l.ctx?.job ?? ''; const s = takeRole(c, promo, 'booker'); const co = companyOf(promo); if (co && roleIn(c, promo)) { ownerView(co).patience = OWNER.start; setGoals(c, co); } return s; },
  job_no: () => 'Maybe another time.',
  own_yes: (_c, l) => { const co = companyOf(l.ctx?.promo ?? ''); if (co) ownerView(co).patience += OWNER.agree; return 'They’re pleased. Now deliver.'; },
  own_no: (c, l) => { const co = companyOf(l.ctx?.promo ?? ''); if (co) { ownerView(co).patience += OWNER.defy; sacked(c, co); } return 'They didn’t like that.'; },
  own_take: (c, l) => {
    const promo = l.ctx?.promo ?? '';
    const co = companyOf(promo);
    if (!co || co.closed) return 'It’s gone.';
    const bookingIt = roleIn(c, promo)?.as === 'booker';
    if (!bookingIt) { const no = canRun(c, promo); if (no) return no; }
    const o = ownerOf(promo);
    if (o) leaveJob(o, c.today, 'retired');
    if (bookingIt) roleIn(c, promo)!.as = 'owner'; else takeRole(c, promo, 'owner');
    co.owner = 'player';
    addEvent(activeWorld().history, { day: c.today, kind: 'hired', who: c.player, name: W(c.player)!.name, promo, what: `was handed ${promoName(promo)}` });
    return `${promoName(promo)} is yours.`;
  },
  own_pass: () => 'You let it go.',
});

/** A new booking job: the owner tells you what they want straight away. */
function daily(c: Career): void {
  if (!FEATURES.booker) return;
  for (const r of rolesOf(c)) if (r.as === 'booker') { const co = companyOf(r.promo); if (co && !ownerView(co).goals.length) setGoals(c, co); }
}

setCareerHooks({ show: ownerSees, monthly, daily });

