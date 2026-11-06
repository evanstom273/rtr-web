// Booker mode, stage 4 (Lyra's design): full books for every company. Each show is settled the night after: who
// came (the card's draw, the promotion's size and reputation, the price), the venue, the takings, the wages and fees,
// production and travel. Each month: sponsors, insurance, your wage and salary, the loan; the month's accounts close;
// the tier moves with popularity, money and roster; and a company that's spent too long past its overdraft is gone.
// The company's money is its own (Lyra's call): you can put yours in, take a wage or dividends out, or borrow.
import { databaseChanged, fansIn, findWrestler, PROMOTIONS, rosterOf, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { leaveJob } from '../world/people';
import { TIER_LABEL, TIERS, type Company, type Tier } from '../world/companies';
import { letter, promoName, release, setCareerHooks, spend } from './career';
import { companies, companyOf, leaveRole, playerRuns, roleIn } from './company';
import { addDays, monthOf, MONTHS } from './dates';
import { hireFee } from './hustle';
import { isWeeklyFlagship, matchPay, monthlySalary, promoDates, yearlyWorth } from './economy';
import { PAY } from './tuning';
import { registerReplies } from './mail';
import { regionOfCountry } from './places';
import { BIZ, FEATURES, STAFF, WAR } from './tuning';
import type { Career, Show } from './types';
import { boutPeople } from './bouts';

export const IN_LINES = ['gate', 'merch', 'ppv', 'tv', 'sponsors', 'invest', 'loan'] as const;
export const OUT_LINES = ['wages', 'fees', 'venue', 'production', 'travel', 'insurance', 'staff', 'salary', 'drawings', 'repay'] as const;
export type Line = (typeof IN_LINES)[number] | (typeof OUT_LINES)[number];
export const LINE_LABEL: Record<Line, string> = {
  gate: 'Tickets', merch: 'Merch', ppv: 'Pay-per-view', tv: 'TV', sponsors: 'Sponsors', invest: 'Put in', loan: 'Borrowed',
  wages: 'Wages', fees: 'Free agents', venue: 'Venues', production: 'Production', travel: 'Travel', insurance: 'Insurance', staff: 'Staff', salary: 'Booker’s salary', drawings: 'Owner’s wage', repay: 'Loan repayments',
};
const isIn = (l: Line) => (IN_LINES as readonly string[]).includes(l);
const r5 = (v: number) => Math.round(v / 5) * 5;
const W = (id: string): Wrestler | undefined => findWrestler(id);
const promotion = (promo: string) => PROMOTIONS.find((p) => p.initials === promo);

/** Money in or out of a company's books, on a line. */
export function post(co: Company, line: Line, amount: number): void {
  if (!amount) return;
  const a = Math.round(amount);
  (co.month ??= {})[line] = (co.month[line] ?? 0) + a;
  co.bank = Math.round(co.bank + (isIn(line) ? a : -a));
}

// ------------------------------------------------------------------ a show

export const priceLevel = (co: Company): number => BIZ.price[co.price ?? 1] ?? 1;
export const ticketPrice = (co: Company): number => Math.max(1, Math.round(BIZ.ticket[co.tier]! * priceLevel(co)));

/** Who'd come to a show with this card: the tier's base plus everyone's fans where it is, × size, kind, reputation, price. */
export function showDraw(co: Company, show: Pick<Show, 'region' | 'kind'>, ids: string[]): number {
  const pop = promotion(co.promo)?.popularity ?? 10;
  const names = [...new Set(ids)].map(W).filter((w): w is Wrestler => !!w);
  const base = BIZ.drawBase[co.tier]! + BIZ.drawK[co.tier]! * names.reduce((t, w) => t + Math.sqrt(fansIn(w, show.region)), 0);
  const rep = co.rep === undefined ? 1 : Math.max(0.6, Math.min(1.4, Math.sqrt(co.rep / 3)));
  return Math.round(base * (0.6 + pop / 100) * (BIZ.kind[show.kind] ?? 1) * rep * priceLevel(co) ** -BIZ.priceExp);
}
/** The smallest of the tier's venues that holds the crowd (the biggest, if none does). */
export function venueFor(co: Company, draw: number): { name: string; cap: number; cost: number } {
  const vs = BIZ.venues[co.tier]!;
  return vs.find((v) => v.cap >= draw) ?? vs[vs.length - 1]!;
}

/** Who was on the show: the card and the segments. */
const onShow = (show: Show): string[] => [...new Set([...(show.card ?? []).flatMap((b) => boutPeople(b)), ...(show.segments ?? []).flatMap((g) => g.who)])];

/** The night's books: the gate, merch, TV and pay-per-view in; wages, fees, venue, production and travel out. */
export function settleShow(c: Career, show: Show): void {
  if (!FEATURES.booker || show.books || show.promo === 'TIS' || show.promos) return;
  const co = companyOf(show.promo);
  if (!co || co.closed || !show.card?.some((b) => b.result)) return;
  const rnd = seededRng(hashSeed(c.seed, 'gate', show.id));
  const ids = onShow(show).filter((id) => id !== c.player || !playerRuns(show.promo));
  // Booker mode's war: a rival show the same night in the same region splits your crowd.
  const rivals = playerRuns(show.promo) ? Object.values(c.shows).filter((s) => s.id !== show.id && s.date === show.date && s.region === show.region && s.promo !== show.promo && s.promo !== 'TIS' && !s.promos).length : 0;
  const draw = showDraw(co, show, onShow(show)) * (1 - BIZ.swing + rnd() * 2 * BIZ.swing) * Math.max(0.6, 1 - WAR.counter * rivals);
  const v = venueFor(co, draw);
  const sold = Math.round(Math.min(v.cap, draw));
  // The pay rework: takings raised with the wage bills (Lyra's call), by tier.
  const up = BIZ.takings[co.tier] ?? 1;
  const gate = sold * ticketPrice(co) * up, merch = sold * BIZ.merchPerHead[co.tier]! * up;
  let wages = 0, fees = 0;
  for (const id of ids) {
    const w = W(id);
    if (!w) continue;
    const k = c.people[id]?.contract;
    const deal = k?.promo === show.promo ? k : c.people[id]?.deals?.find((d) => d.promo === show.promo);
    // On the night: PPA deals' fees and Both's per-show part (salaries go out at the end of the month).
    if (deal) wages += matchPay(deal, show.kind, false, isWeeklyFlagship(show)).pay;
    else fees += hireFee(w, show.region);
  }
  const home = co.home?.country ?? undefined;
  const away = home && show.country !== home ? BIZ.production[co.tier]! * BIZ.away * (regionOfCountry(home) === show.region ? 1 : 2) : 0;
  // A producer gets more out of the TV deal.
  const producer = (co as { staff?: { role: string; id: string }[] }).staff?.find((h) => h.role === 'producer');
  const prodQ = producer ? (activeWorld().people?.staff[producer.id]?.rep ?? 50) / 100 : 0;
  const tv = (co.tv && show.kind === 'weekly' && show.date <= co.tv.until ? Math.round(co.tv.fee * (1 + prodQ * STAFF.producerTv)) : !playerRuns(show.promo) && show.kind === 'weekly' ? aiTv(co) : 0) * up;
  const big = show.kind === 'special' || show.kind === 'flagship';
  const ppv = big ? Math.round(sold * BIZ.ppv[co.tier]! * Math.max(0.5, (show.rating?.score ?? co.rep ?? 3) / 3) * BIZ.ppvPrice * Math.min(1, BIZ.ppvPerMonth / bigNights(show)) * up) : 0;
  const prod = BIZ.production[co.tier]! * (BIZ.productionKind[show.kind] ?? 1);
  post(co, 'gate', gate); post(co, 'merch', merch); post(co, 'tv', tv); post(co, 'ppv', ppv);
  post(co, 'wages', wages); post(co, 'fees', fees); post(co, 'venue', v.cost); post(co, 'production', prod); post(co, 'travel', away);
  const inn = gate + merch + tv + ppv, out = Math.round(wages + fees + v.cost + prod + away);
  show.books = { sold, cap: v.cap, venue: v.name, in: Math.round(inn), out };
  if (show.rating) co.rep = Math.round(((co.rep ?? show.rating.score) * (1 - BIZ.repWeight) + show.rating.score * BIZ.repWeight) * 100) / 100;
}
/** How many big nights (specials, flagships) a promotion's run in the last month, this one included. */
function bigNights(show: Show): number {
  const since = addDays(show.date, -30);
  const H = activeWorld().history.shows;
  let n = 1;
  for (let i = H.length - 1; i >= 0 && H[i]!.date >= since; i--) if (H[i]!.promo === show.promo && H[i]!.id !== show.id && (H[i]!.kind === 'special' || H[i]!.kind === 'flagship')) n++;
  return n;
}
/** An AI promotion's TV money (it has its deals; you have to win yours). */
const aiTv = (co: Company): number => Math.round(BIZ.tv[co.tier]! * ((promotion(co.promo)?.popularity ?? 50) / 50));

// ------------------------------------------------------------------ your money and the company's

const yourRole = (c: Career, promo: string) => roleIn(c, promo);
/** Put your own money into a company you own. */
export function invest(c: Career, promo: string, amount: number): string {
  const co = companyOf(promo);
  if (!co || yourRole(c, promo)?.as !== 'owner') return 'It isn’t yours.';
  const a = Math.round(amount);
  if (a <= 0) return 'How much?';
  if (a > c.money) return 'You haven’t got that much.';
  spend(c, -a, `Into ${promoName(promo)}`, 'company');
  post(co, 'invest', a);
  return `${money(a)} into ${promoName(promo)}.`;
}
/** Take money out of a company you own (dividends: it has to have it). */
export function withdraw(c: Career, promo: string, amount: number): string {
  const co = companyOf(promo);
  if (!co || yourRole(c, promo)?.as !== 'owner') return 'It isn’t yours.';
  const a = Math.round(amount);
  if (a <= 0) return 'How much?';
  if (a > co.bank) return 'The company hasn’t got that much.';
  post(co, 'drawings', a);
  spend(c, a, `Out of ${promoName(promo)}`, 'company');
  return `${money(a)} out of ${promoName(promo)}.`;
}
/** Pay yourself a wage each month as owner (0 to stop). */
export function setWage(c: Career, promo: string, monthly: number): string {
  const co = companyOf(promo);
  if (!co || yourRole(c, promo)?.as !== 'owner') return 'It isn’t yours.';
  co.wage = Math.max(0, Math.round(monthly));
  return co.wage ? `You’ll take ${money(co.wage)} a month.` : 'No wage.';
}
/** Borrow from the bank: paid back over two years with interest. */
export function borrow(c: Career, promo: string, amount: number): string {
  const co = companyOf(promo);
  if (!co || yourRole(c, promo)?.as !== 'owner') return 'It isn’t yours.';
  const a = Math.round(amount);
  if (co.loan && co.loan.left > 0) return 'Pay off the loan you’ve got first.';
  if (a <= 0 || a > BIZ.loan.max[co.tier]!) return `The bank will lend a ${co.tier} promotion up to ${money(BIZ.loan.max[co.tier]!)}.`;
  if ((co.red ?? 0) > 0) return 'The bank won’t lend to a company in the red.';
  const total = Math.round(a * (1 + BIZ.loan.rate * (BIZ.loan.months / 12)));
  co.loan = { left: total, monthly: Math.ceil(total / BIZ.loan.months) };
  post(co, 'loan', a);
  return `${money(a)} borrowed: ${money(co.loan.monthly)} a month for ${BIZ.loan.months} months.`;
}
export function setPrice(c: Career, promo: string, level: number): string {
  const co = companyOf(promo);
  if (!co || !yourRole(c, promo)) return 'You don’t run it.';
  co.price = Math.max(0, Math.min(BIZ.price.length - 1, Math.round(level)));
  return `Tickets ${['cheap', 'at the usual price', 'dear'][co.price]}: ${money(ticketPrice(co))}.`;
}

// ------------------------------------------------------------------ the month

const money = (v: number): string => `${v < 0 ? '−' : ''}£${Math.abs(Math.round(v)).toLocaleString('en-GB')}`;
const tierIndex = (t: Tier) => TIERS.indexOf(t);

/** Where a company stands against the next tier up (for the Office). */
export function nextTier(co: Company): { tier: Tier; pop: number; bank: number; roster: number } | null {
  const up = TIERS[tierIndex(co.tier) + 1];
  if (!up) return null;
  const need = BIZ.up[up]!;
  return { tier: up, pop: need.pop, bank: need.bank, roster: need.roster };
}

/** Tiers move with popularity, money and a roster (up), or popularity falling well short (down). */
function retier(c: Career, co: Company): void {
  const pop = promotion(co.promo)?.popularity ?? 0;
  const up = nextTier(co);
  const roster = rosterOf(co.promo).length;
  let to: Tier | null = null;
  if (up && pop >= up.pop && co.bank >= up.bank && roster >= up.roster) to = up.tier;
  else if (tierIndex(co.tier) > 0 && pop < BIZ.up[co.tier]!.pop - BIZ.downBy) to = TIERS[tierIndex(co.tier) - 1]!;
  if (!to) return;
  const was = co.tier;
  co.tier = to;
  co.moved = c.today;
  const climb = tierIndex(to) > tierIndex(was);
  if (roleIn(c, co.promo)) letter(c, { kind: 'news', from: `${co.promo} · the office`, subject: climb ? `${promoName(co.promo)} goes ${TIER_LABEL[to].toLowerCase()}` : `${promoName(co.promo)} drops to ${TIER_LABEL[to].toLowerCase()}`,
    body: [climb ? `Bigger venues, more shows a week, room for a bigger roster${to !== 'local' ? ', and TV wants to talk' : ''}. More office time too.` : 'Smaller venues, fewer shows. It happens. It can come back.'] });
  else if (to === 'global' || was === 'global' || to === 'national' && climb) c.mailBox?.push({ day: c.today, subject: `${promoName(co.promo)} ${climb ? 'goes' : 'drops to'} ${TIER_LABEL[to].toLowerCase()}`, body: `${promoName(co.promo)} is ${TIER_LABEL[to].toLowerCase()} now.` });
}

/** It's over: the roster goes free, the titles are retired, the shows are off. The history stays. */
export function closeCompany(c: Career, promo: string, why: string): void {
  const co = companyOf(promo);
  const p = promotion(promo);
  if (!co || co.closed || !p) return;
  co.closed = c.today;
  p.closed = c.today;
  for (const w of WRESTLERS.filter((x) => x.promotion === promo || x.also?.includes(promo))) release(c, w, 'released', promo);
  for (const t of TITLES.filter((x) => p.titles.includes(x.id))) { const open = activeWorld().history.reigns[t.id]?.find((r) => r.to === null); if (open) open.to = c.today; t.holder = null; t.retired = c.today; }
  p.titles = [];
  for (const [id, s] of Object.entries(c.shows)) if (s.promo === promo && !s.done) delete c.shows[id];
  const P = activeWorld().people!;
  for (const s of Object.values(P.staff)) if (s.job && 'promo' in s.job && s.job.promo === promo) leaveJob(s, c.today, 'closed');
  const yours = !!roleIn(c, promo);
  if (yours) leaveRole(c, promo, 'closed');
  addEvent(activeWorld().history, { day: c.today, kind: 'closed', who: '', name: p.name, promo, what: `${p.name} closed: ${why}` });
  letter(c, { kind: 'news', from: yours ? `${promo} · the office` : 'The news desk', subject: `${p.name} has closed`, body: [`${p.name} (${promo}) is gone: ${why}. ${yours ? 'It’s over. The history stays.' : 'Its roster are free agents.'}`] });
  databaseChanged();
}

function monthEnd(c: Career): void {
  if (!FEATURES.booker) return;
  // The monthly round runs on the last night of the month.
  const last = c.today.slice(0, 7);
  const payroll = new Map<string, number>();
  for (const p of Object.values(c.people)) for (const k of [p.contract, ...(p.deals ?? [])]) if (k && k.start <= c.today) { const m = monthlySalary(k); if (m) payroll.set(k.promo, (payroll.get(k.promo) ?? 0) + m); }
  for (const co of Object.values(companies())) {
    if (co.closed) continue;
    const mine = roleIn(c, co.promo);
    const pop = promotion(co.promo)?.popularity ?? 10;
    // Sponsors: yours are deals you've signed; the AI's come with its size.
    const up = BIZ.takings[co.tier] ?? 1;
    if (playerRuns(co.promo)) for (const s of (co.sponsors ?? []).filter((x) => x.until >= c.today)) post(co, 'sponsors', s.monthly);
    else post(co, 'sponsors', BIZ.sponsors[co.tier]! * (pop / 50) * up);
    // Salaries (the pay rework): everyone on a Monthly deal, and Both's base, every month whatever happened.
    const salaries = payroll.get(co.promo) ?? 0;
    if (salaries) post(co, 'wages', salaries);
    // The bigger money in the business: TV rights and sponsors in line with what the roster's worth (the salary curve).
    const worth = rosterOf(co.promo).reduce((t, w) => t + yearlyWorth(w, co.promo), 0) / 12 * (promoDates(co.promo) / PAY.datesPerMonth);
    if (worth > 0) post(co, 'tv', Math.round(worth * BIZ.talentCover));
    co.sponsors = (co.sponsors ?? []).filter((x) => x.until >= c.today);
    post(co, 'insurance', rosterOf(co.promo).length * BIZ.insurance[co.tier]!);
    for (const h of co.staff ?? []) post(co, 'staff', h.wage);
    // You: a booker's salary from someone else's company; an owner's wage from your own.
    if (mine?.as === 'booker') { const sal = BIZ.salary[co.tier]!; post(co, 'salary', sal); spend(c, sal, `${co.promo} booker’s salary`, 'wage'); }
    if (mine?.as === 'owner' && co.wage) { const w = Math.min(co.wage, Math.max(0, co.bank)); if (w > 0) { post(co, 'drawings', w); spend(c, w, `${co.promo} owner’s wage`, 'company'); } }
    if (co.loan && co.loan.left > 0) { const pay = Math.min(co.loan.left, co.loan.monthly); post(co, 'repay', pay); co.loan.left -= pay; if (co.loan.left <= 0) delete co.loan; }
    if (co.tv && co.tv.until < c.today) delete co.tv;
    // Close the month.
    const lines = co.month ?? {};
    co.books = [...(co.books ?? []), { m: last, lines, bank: co.bank }].slice(-24);
    co.month = {};
    const limit = BIZ.overdraft[co.tier]!;
    co.red = co.bank < -limit ? (co.red ?? 0) + 1 : 0;
    if (mine) accounts(c, co, last, lines);
    const redMax = playerRuns(co.promo) ? BIZ.redMonths.player : BIZ.redMonths.ai;
    if (co.red >= redMax) { closeCompany(c, co.promo, 'it ran out of money'); continue; }
    if (mine && co.red) letter(c, { kind: 'news', from: `${co.promo} · the bank`, subject: `${promoName(co.promo)} is past its overdraft`, body: [`The account’s at ${money(co.bank)}: past the ${money(-limit)} limit for ${co.red} month${co.red === 1 ? '' : 's'}. ${redMax - co.red} more and it’s finished.`, mine.as === 'owner' ? 'Put money in, cut costs, or sell up.' : 'The owner’s noticed.'] });
    retier(c, co);
    offers(c, co);
  }
}

/** The month's accounts, to whoever runs it. */
function accounts(c: Career, co: Company, m: string, lines: Record<string, number>): void {
  const inn = IN_LINES.filter((l) => l !== 'invest' && l !== 'loan').reduce((t, l) => t + (lines[l] ?? 0), 0);
  const out = OUT_LINES.filter((l) => l !== 'drawings').reduce((t, l) => t + (lines[l] ?? 0), 0);
  const [y, mm] = m.split('-').map(Number) as [number, number];
  const terms = [...IN_LINES, ...OUT_LINES].filter((l) => lines[l]).map((l) => [LINE_LABEL[l], `${isIn(l) ? '' : '−'}${money(lines[l]!)}`] as [string, string]);
  letter(c, { kind: 'news', from: `${co.promo} · the accounts`, subject: `${MONTHS[monthOf(`${y}-${String(mm).padStart(2, '0')}-01`)]}: ${inn - out >= 0 ? 'profit' : 'loss'} ${money(Math.abs(inn - out))}`,
    body: [`${promoName(co.promo)} took ${money(inn)} and spent ${money(out)}. In the bank: ${money(co.bank)}.`], terms: [...terms, ['Bank', money(co.bank)]] });
}

const NETWORKS = ['Channel 8', 'SportsNet', 'FightTV', 'Ringside+', 'Northstar Media', 'Arena One', 'Velocity'];
/** TV and sponsors want your promotion once it's regional and its shows are good. */
function offers(c: Career, co: Company): void {
  if (!playerRuns(co.promo) || co.tier === 'local' || (co.rep ?? 0) < BIZ.offerFrom) return;
  const rnd = seededRng(hashSeed(c.seed, 'biz', co.promo, c.today));
  const pop = promotion(co.promo)?.popularity ?? 20;
  if (!co.tv && !(co.tvBlocked && co.tvBlocked > c.today) && !c.letters.some((l) => l.ctx?.tvFor === co.promo && !l.replied && l.day > addDays(c.today, -60)) && rnd() < 0.5) {
    const fee = r5(BIZ.tv[co.tier]! * (pop / 50) * (0.8 + rnd() * 0.4));
    const network = NETWORKS[Math.floor(rnd() * NETWORKS.length)]!;
    letter(c, { kind: 'news', from: network, subject: `${network} wants ${promoName(co.promo)}`, body: [`We’d air your weekly show: ${money(fee)} an episode, for a year.`],
      replies: [{ id: 'tv_yes', label: 'Take it' }, { id: 'tv_more', label: 'Ask for more', detail: 'They might walk' }, { id: 'tv_no', label: 'No thanks' }], ctx: { tvFor: co.promo, fee: String(fee), network } });
  }
  if ((co.sponsors ?? []).length < 2 && rnd() < 0.4) {
    const monthly = r5(BIZ.sponsors[co.tier]! * (pop / 50) * (0.4 + rnd() * 0.4));
    const name = ['Ironclad Energy', 'Brewster’s Lager', 'Apex Gyms', 'Kinetic Gaming', 'Redline Auto', 'Coastline Bank'][Math.floor(rnd() * 6)]!;
    letter(c, { kind: 'news', from: name, subject: `${name} would sponsor ${promoName(co.promo)}`, body: [`${money(monthly)} a month for a year, with our name on the ring apron.`],
      replies: [{ id: 'spons_yes', label: 'Deal' }, { id: 'spons_no', label: 'Not for us' }], ctx: { sponsorFor: co.promo, monthly: String(monthly), name } });
  }
}

registerReplies({
  tv_yes: (c, l) => { const co = companyOf(l.ctx?.tvFor ?? ''); if (!co || !roleIn(c, co.promo)) return 'It’s not yours to sign now.'; co.tv = { network: l.ctx!.network!, fee: Number(l.ctx!.fee), until: addDays(c.today, 365 * BIZ.tvYears) }; return `You’re on ${l.ctx!.network}.`; },
  tv_more: (c, l) => {
    const co = companyOf(l.ctx?.tvFor ?? '');
    if (!co || !roleIn(c, co.promo)) return 'It’s not yours to sign now.';
    if (seededRng(hashSeed(c.seed, 'tvmore', l.id))() < 0.5) return `${l.ctx!.network} walked.`;
    co.tv = { network: l.ctx!.network!, fee: r5(Number(l.ctx!.fee) * 1.2), until: addDays(c.today, 365 * BIZ.tvYears) };
    return `They went to ${money(co.tv.fee)} an episode.`;
  },
  tv_no: () => 'Not now.',
  spons_yes: (c, l) => { const co = companyOf(l.ctx?.sponsorFor ?? ''); if (!co || !roleIn(c, co.promo)) return 'It’s not yours to sign now.'; (co.sponsors ??= []).push({ name: l.ctx!.name!, monthly: Number(l.ctx!.monthly), until: addDays(c.today, 365) }); return 'Their name’s on the apron.'; },
  spons_no: () => 'Fair enough.',
});

/** The month so far and the year before, in and out, for the Office's Books tab. */
export function bookSummary(co: Company): { month: Record<string, number>; months: { m: string; in: number; out: number; bank: number }[] } {
  const sum = (lines: Record<string, number>, which: readonly string[]) => which.reduce((t, l) => t + (lines[l] ?? 0), 0);
  return {
    month: co.month ?? {},
    months: (co.books ?? []).slice(-12).map((b) => ({ m: b.m, in: sum(b.lines, IN_LINES.filter((l) => l !== 'invest' && l !== 'loan')), out: sum(b.lines, OUT_LINES.filter((l) => l !== 'drawings')), bank: b.bank })),
  };
}

setCareerHooks({
  // Your shows are settled once they've been judged (card.ts); everyone else's here.
  show: (c, s) => { if (!playerRuns(s.promo)) settleShow(c, s); },
  monthly: monthEnd,
});

