// The career loop: starting one, a day at a time, and what every match changes in the world.
import { matchFans } from './fanGrowth';
import { poachMult, renewLean, retryAdjust } from './leans';
import {
  databaseChanged, fansTotal, findWrestler, fmtFans, globalScore, hasTrait, PROMOTIONS, shippedWomenShare, TITLES, type Wrestler, WRESTLERS,
} from '../data/rtr';
import { seededRng, type Rng } from '../engine/rng';
import type { MatchRulesConfig } from '../engine/types';
import { HARDCORE_STIPS, available, bookAhead, hashSeed, heated, isIndieTitle, promoRegion, regionalDates, regionalPop, titleRegion } from './booker';
import { bondOf } from '../world/people';
import { drawCalendar } from './calendar';
import { attitude, BUDGET, C, feeFloor, NO_CLAUSES } from './clauses';
import { makeRookie } from './create';
import { addDays, addMonths, type Day, daysBetween, fmtDay, weekday } from './dates';
import { baseRegion, contractFee, indieFee, isWeeklyFlagship, livingCost, matchPay, round5 } from './economy';
import { REGION_KEY, REGION_LABEL } from './places';
import type { SimJob, SimOut } from './sim';
import { activeWorld } from '../world/world';
import { addEvent, type ArchivedShow, type WorldHistory } from '../world/history';
import { bookerKey, movePatience, showBooker } from './patience';
import { remember } from './relations';
import {
  BOOK_AHEAD_DAYS, CIRCUIT_KEEP, CONTRACT_MONTHS, FAN_IDLE_LOSS, FATIGUE_HARDCORE_EXTRA, FATIGUE_PER_MATCH, FATIGUE_RECOVERY_PER_DAY, FATIGUE_STAMINA_DIVISOR, FEATURES, FRIEND_LOAN_REPAY, INJURY_BASE_PCT, INJURY_HARDCORE_MULT, INJURY_PER_FATIGUE, INJURY_SEVERITY, LIVING_GRACE_DAYS, LOSS_CUT_BY_TIER, MAIL_MAX, MEDICAL_BILL_COVER, MEDICAL_PAY_COVER, MEDICAL_PER_DAY, MERCH_PER_FAN_FREE, MERCH_PER_FAN_SIGNED, MERCH_SHARE, OFF_SCRIPT_TITLE_BAN_DAYS, PATIENCE_NO_SHOW, PLANNED_NUDGE, PLANNED_RETRIES, POACH_CHANCE, POP_IDLE_DAYS, RELEASE_MONTHLY_BOTTOM, RENEW_CHANCE_REST, RENEW_CHANCE_TOP, REP_FOUR_STAR, REP_OFF_SCRIPT, REP_PER_DATE, REP_START, ROOKIE_EVERY_DAYS, ROSTER_FLOOR, ROSTER_SCOUT_DAYS, ROSTER_TARGET, SLEEP_RECOVERY, SLEEP_RECOVERY_AFTER_MATCH, SOCIAL_PROMOTE_BOOST, START_CONTRACT_MONTHS_LEFT, START_MONEY_BASE, START_MONEY_CREATED, START_MONEY_PER_DECADE, TRAIT_BACKSTAGE, TRAIT_FX, TRYOUT_MIN_STARS,
} from './tuning';
import type { Bout, Career, Contract, Letter, Person, PlayerMatch, PopRegion, Show } from './types';

export const CALENDAR_AHEAD_DAYS = 70;
const POP_KEYS: PopRegion[] = ['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export const isSigned = (w: Wrestler): boolean => w.promotion !== 'TIS';
export const promoName = (initials: string): string => PROMOTIONS.find((p) => p.initials === initials)?.name ?? initials;
export const person = (c: Career, id: string): Person => (c.people[id] ??= newPerson(id, REP_START));

function newPerson(id: string, rep: number): Person {
  const h = hashSeed('birthday', id);
  const month = (h % 12) + 1, day = ((h >> 4) % 28) + 1;
  return { rep, fatigue: 0, injury: null, contract: null, birthday: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, last: null, recent: [] };
}

/** A contract for someone already on a roster when the world starts (or an AI signing). */
export function aiContract(rnd: Rng, w: Wrestler, promo: string, start: Day, months: number): Contract {
  const clauses = NO_CLAUSES();
  // Bigger names have a perk or two, in the areas the promotion doesn't mind giving.
  const roster = WRESTLERS.filter((x) => x.promotion === promo);
  const rank = roster.filter((x) => globalScore(x) > globalScore(w)).length / Math.max(1, roster.length);
  if (rank < 0.25) {
    const easy = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => attitude(promo, i) === 'flexible');
    for (const i of easy.slice(0, 1 + Math.floor(rnd() * 2))) clauses[i] = 1 + Math.floor(rnd() * 2);
  }
  return { promo, start, end: addMonths(start, months), fee: contractFee(w, promo), clauses };
}

export interface StartOptions {
  player: string;
  today: Day;
  seed: number;
  created?: boolean;
  /** Carrying on in a kept world: its show numbering and irregular schedules. */
  calendar?: { counters: Record<string, number>; nextIrregular: Record<string, Day> };
}

const history = () => activeWorld().history;

/** Start a career in the active world (which the caller has just reset to the shipped database). */
export function startCareer(o: StartOptions): Career {
  const rnd = seededRng(o.seed);
  const c: Career = {
    v: 1, player: o.player, startedOn: o.today, today: o.today, drawnTo: '', counters: { ...(o.calendar?.counters ?? {}) }, nextIrregular: { ...(o.calendar?.nextIrregular ?? {}) }, shows: {},
    people: {}, titles: {}, feuds: [], letters: [], offers: [], money: 0, ledger: [], history: [], indie: {}, tryouts: {},
    nextRookie: addDays(o.today, ROOKIE_EVERY_DAYS), seq: 0, seed: o.seed,
  };
  for (const w of WRESTLERS) {
    const p = person(c, w.id);
    if (isSigned(w)) {
      const left = START_CONTRACT_MONTHS_LEFT[0] + Math.floor(rnd() * (START_CONTRACT_MONTHS_LEFT[1] - START_CONTRACT_MONTHS_LEFT[0] + 1));
      const months = CONTRACT_MONTHS.find((m) => m >= left) ?? 24;
      p.contract = aiContract(rnd, w, w.promotion, addMonths(o.today, left - months), months);
    }
  }
  const H = history();
  for (const t of TITLES) {
    const reigns = (H.reigns[t.id] ??= []);
    const open = reigns.find((r) => r.to === null);
    if (open && open.holder !== t.holder) open.to = o.today;
    if (t.holder && (!open || open.holder !== t.holder)) reigns.push({ holder: t.holder, name: findWrestler(t.holder)?.name ?? t.holder, from: o.today, to: null, defences: 0 });
    const current = reigns.find((r) => r.to === null);
    c.titles[t.id] = { since: current?.from ?? o.today, defences: current?.defences ?? 0, last: null };
  }
  activeWorld().day = o.today;
  const me = findWrestler(o.player)!;
  // A career started with living costs on pays from its first Monday (no notice needed).
  if (FEATURES.livingCosts) c.livingFrom = o.today;
  c.money = o.created ? START_MONEY_CREATED : round5(Math.max(START_MONEY_BASE, START_MONEY_BASE + START_MONEY_PER_DECADE * Math.log10(fansTotal(me) / 1000)));
  c.ledger.push({ day: o.today, text: 'Starting money', amount: c.money, kind: 'start' });
  extendCalendar(c);
  bookAhead(c, o.today, BOOK_AHEAD_DAYS, WRESTLERS);
  const deal = c.people[o.player]!.contract;
  letter(c, {
    kind: 'contract', from: deal ? promoName(deal.promo) : 'The Indie Scene', subject: deal ? 'Welcome to the career' : 'You’re on your own',
    body: deal
      ? [`You’re under contract to ${promoName(deal.promo)} until ${fmtDay(deal.end, 'long')}, at £${deal.fee.toLocaleString('en-GB')} a weekly-show match.`, 'The booker decides when you work. Keep an eye on the calendar.']
      : ['You’re a free agent on The Indie Scene. Indie promoters will write with bookings, and you can ask for a spot on any indie show on the calendar.', 'Get your name out there and the big promotions will come calling.'],
  });
  return c;
}

export function letter(c: Career, l: Omit<Letter, 'id' | 'day' | 'read'> & { day?: Day }): Letter {
  const full: Letter = { id: `l${++c.seq}`, day: l.day ?? c.today, read: false, ...l };
  // Mail can take a letter elsewhere (world news waits for Monday's digest).
  if (hooks.mail?.route(c, l)) return full;
  c.letters.unshift(full);
  if (c.letters.length > (FEATURES.mail ? MAIL_MAX : 200)) c.letters.length = FEATURES.mail ? MAIL_MAX : 200;
  return full;
}

export function spend(c: Career, amount: number, text: string, kind: Career['ledger'][number]['kind']): void {
  // Lifetime totals by kind (the ledger itself keeps the last 400 entries). Seeded from it the first time.
  if (!c.totals) {
    c.totals = {};
    for (const e of c.ledger) { const t = (c.totals[e.kind] ??= { amount: 0, n: 0 }); t.amount += e.amount; t.n++; }
  }
  const t = (c.totals[kind] ??= { amount: 0, n: 0 });
  t.amount += amount;
  t.n++;
  c.money += amount;
  c.ledger.unshift({ day: c.today, text, amount, kind });
  if (c.loan && kind === 'fee' && amount > 0) {
    const back = Math.min(c.loan.left, Math.round(amount * FRIEND_LOAN_REPAY));
    c.loan.left -= back;
    if (c.loan.left <= 0) delete c.loan;
    spend(c, -back, 'Paying back a friend', 'event');
  }
  if (c.ledger.length > 400) c.ledger.length = 400;
}

function extendCalendar(c: Career): void {
  const to = addDays(c.today, CALENDAR_AHEAD_DAYS);
  if (c.drawnTo && c.drawnTo >= to) return;
  const brands = Object.values(activeWorld().people?.brands ?? {});
  const pool = WRESTLERS.filter((w) => w.promotion === 'TIS' && !c.people[w.id]?.retired).length;
  const state = {
    seed: c.seed, counters: c.counters, nextIrregular: c.nextIrregular,
    ...(brands.length ? { indie: { brands, pool, last: (c.brandLast ??= {}), regionLast: (c.regionLast ??= {}) } } : {}),
  };
  const r = drawCalendar(state, c.drawnTo || null, c.startedOn, to);
  for (const s of r.shows) c.shows[s.id] = s;
  c.drawnTo = r.drawnTo;
}

export const showsOn = (c: Career, day: Day): Show[] => Object.values(c.shows).filter((s) => s.date === day);

/** Your match today, if you have one still to wrestle. */
export function myBoutToday(c: Career): { show: Show; bout: Bout; index: number } | null {
  for (const show of showsOn(c, c.today)) {
    const index = show.card?.findIndex((b) => (b.a === c.player || b.b === c.player) && !b.result) ?? -1;
    if (index >= 0) return { show, bout: show.card![index]!, index };
  }
  return null;
}

const freshness = (c: Career, id: string): number => 1 - (c.people[id]?.fatigue ?? 0) / FATIGUE_STAMINA_DIVISOR;

/** Engine rules for a career match. */
export function boutRules(c: Career, show: Show, bout: Bout, you: string, them: string, nudge: boolean): Partial<MatchRulesConfig> {
  const rules: Partial<MatchRulesConfig> = {
    eventName: show.name, venueName: `${show.city}, ${show.country}`, eventPromotion: show.promo === 'TIS' ? '' : show.promo,
    stipulation: bout.stip ?? 'standard', freshness: { you: freshness(c, you), them: freshness(c, them) },
  };
  if (bout.title) { rules.titleId = bout.title; rules.title = true; }
  if (nudge && bout.planned) rules.booked = { side: bout.planned === you ? 'you' : 'them', bonus: PLANNED_NUDGE };
  // A big occasion (Big-Match Performers rise to it): a flagship or special, a cup final, a farewell. Title matches count anyway.
  if (show.kind === 'flagship' || show.kind === 'special' || bout.farewell || (bout.tourney && bout.tourney.round === 2)) rules.big = true;
  return rules;
}

export function boutJob(c: Career, show: Show, bout: Bout, index: number): SimJob {
  return { key: `${show.id}#${index}`, seed: hashSeed(c.seed, show.id, index), you: bout.a, them: bout.b, rules: boutRules(c, show, bout, bout.a, bout.b, true) };
}

/** Every unplayed match today except yours. */
export function worldJobs(c: Career): SimJob[] {
  const jobs: SimJob[] = [];
  for (const show of showsOn(c, c.today)) {
    show.card?.forEach((b, i) => {
      if (!b.result && b.a !== c.player && b.b !== c.player) jobs.push(boutJob(c, show, b, i));
    });
  }
  return jobs;
}


/** Apply a finished match to the world: popularity, fatigue, injuries, titles, feuds, and your pay. */
export function applyBout(c: Career, show: Show, index: number, out: SimOut, aIsYou = true, how: 'played' | 'simmed' = 'played'): void {
  const bout = show.card![index]!;
  if (bout.result) return; // a match is settled once, however many times the night gets run
  dropStaleTitle(bout);
  const rnd = seededRng(hashSeed(c.seed, 'after', show.id, index));
  const sideId = (s: 'you' | 'them' | null) => (s === null ? null : (s === 'you') === aIsYou ? bout.a : bout.b);
  const winner = sideId(out.winner);
  bout.result = { winner, finish: out.finish, t: out.t, stars: out.stars, ...(out.move ? { move: out.move } : {}) };
  const hardcore = !!bout.stip && HARDCORE_STIPS.has(bout.stip);
  const changes: Record<string, number> = {};
  const mineHere = bout.a === c.player || bout.b === c.player;
  const was = mineHere && FEATURES.mail ? hooks.mail?.before(c, show, bout.a === c.player ? bout.b : bout.a) : undefined;
  let titleChanged = false;

  // Titles change hands on a pinfall, submission or the like, not a DQ or count-out.
  if (bout.title && winner) {
    const t = TITLES.find((x) => x.id === bout.title)!;
    const ts = (c.titles[t.id] ??= { since: show.date, defences: 0, last: null });
    const reigns = (history().reigns[t.id] ??= []);
    const nonTitleFinish = out.finish === 'DISQUALIFICATION' || out.finish === 'COUNT_OUT' || out.finish === 'DOUBLE_COUNT_OUT';
    if (winner !== t.holder && !nonTitleFinish) {
      const reign = reigns.find((r) => r.to === null);
      if (reign) reign.to = show.date;
      const w = findWrestler(winner)!;
      const before = t.holder ? findWrestler(t.holder) : undefined;
      reigns.push({ holder: winner, name: w.name, from: show.date, to: null, defences: 0, won: { show: show.name, from: before?.id ?? null, fromName: before?.name ?? null } });
      addEvent(history(), { day: show.date, kind: 'title', who: winner, name: w.name, promo: show.promo, title: t.id, show: show.name });
      ts.since = show.date; ts.defences = 0;
      t.holder = winner;
      titleChanged = true;
      if (w.age <= 24) person(c, winner).breakthrough = show.date;
      bout.result.newChamp = true;
      const loser = findWrestler(winner === bout.a ? bout.b : bout.a)!;
      // A regional indie title only makes your news if it's your region, you've worked there lately, or you know someone in it.
      const region = titleRegion(t);
      const P = activeWorld().people;
      const knows = (id: string) => !!P && !!bondOf(P, c.player, id);
      const mine = findWrestler(c.player);
      const cares = !region || (mine && REGION_KEY[mine.region] === region) || regionalDates(c, c.player, region, show.date) > 0 || knows(winner) || knows(loser.id);
      if ((show.promo === mine?.promotion && cares) || show.kind === 'flagship' || PROMOTIONS.find((p) => p.titles[0] === t.id)) {
        letter(c, { kind: 'news', from: 'The news desk', subject: `New ${t.name} champion`, body: [`${w.name} beat ${loser.name} at ${show.name} to win the ${t.name}.`] });
      }
    } else {
      ts.defences++;
      const reign = reigns.find((r) => r.to === null);
      if (reign) reign.defences++;
    }
    ts.last = show.date;
    if (c.people[c.player]?.contract?.titleShotBy && (bout.a === c.player || bout.b === c.player)) delete c.people[c.player]!.contract!.titleShotBy;
  }

  for (const id of [bout.a, bout.b]) {
    const w = findWrestler(id);
    if (!w) continue;
    const p = person(c, id);
    const won = winner === id, lost = winner !== null && !won;
    // You promoted this one online: a few more people tuned in.
    const promoted = id === c.player && c.social?.promoted === show.id ? 1 + SOCIAL_PROMOTE_BOOST : 1;
    changes[id] = matchFans(w, show, out.stars, won, lost, won && titleChanged, promoted);
    p.rep = r1(clamp(p.rep + REP_PER_DATE + (out.stars >= 4 ? REP_FOUR_STAR : 0), 0, 100));
    // Resilient wrestlers take more punishment; Reliable ones look after themselves.
    const injuryPct = (INJURY_BASE_PCT + p.fatigue / INJURY_PER_FATIGUE) * (hardcore ? INJURY_HARDCORE_MULT : 1)
      * (hasTrait(w, 'resilient') ? TRAIT_FX.resilient.injury : 1) * (hasTrait(w, 'reliable') ? TRAIT_FX.reliable.injury : 1);
    p.fatigue = clamp(p.fatigue + FATIGUE_PER_MATCH + (hardcore ? FATIGUE_HARDCORE_EXTRA : 0), 0, 100);
    p.last = show.date;
    p.circuit = [{ r: show.region, d: show.date }, ...(p.circuit ?? [])].slice(0, CIRCUIT_KEEP);
    p.recent = [...(p.recent ?? []), won ? 1 : 0].slice(-5);
    if (rnd() * 100 < injuryPct) injure(c, id, show, rnd);
  }

  const feud = bout.feud ? c.feuds.find((f) => f.id === bout.feud) : undefined;
  if (feud) {
    feud.matches++;
    if (feud.payoff === show.id) feud.done = true;
  }

  if (mineHere) settleMine(c, show, bout, out, aIsYou, changes[c.player] ?? 0, titleChanged, how, was);
}

function injure(c: Career, id: string, show: Show, rnd: Rng): void {
  let roll = rnd(), sev = INJURY_SEVERITY[0]!;
  for (const s of INJURY_SEVERITY) { if (roll < s.share) { sev = s; break; } roll -= s.share; }
  const days = sev.days[0] + Math.floor(rnd() * (sev.days[1] - sev.days[0] + 1));
  const p = person(c, id);
  p.injury = { until: addDays(show.date, days), what: sev.label };
  const w = findWrestler(id)!;
  const mine = id === c.player;
  if (mine) {
    const cover = MEDICAL_BILL_COVER[p.contract?.clauses[C.medical] ?? 0] ?? 0;
    const bill = round5(days * MEDICAL_PER_DAY * (1 - cover));
    if (bill) spend(c, -bill, `Medical bills (${days} days)`, 'medical');
    const payCover = MEDICAL_PAY_COVER[p.contract?.clauses[C.medical] ?? 0] ?? 0;
    if (payCover && p.contract) {
      // Your usual earnings: your average fee times how often you've worked lately, for the days out.
      const recent = c.history.filter((m) => !m.indie && daysBetween(m.day, show.date) <= 56);
      const perDay = recent.length ? recent.reduce((t, m) => t + m.fee, 0) / 56 : 0;
      const owed = round5(perDay * days * payCover);
      if (owed) spend(c, owed, `Medical Pay: earnings while injured (${days} days)`, 'medical');
    }
    letter(c, { kind: 'injury', from: 'The doctor', subject: `You’re out for ${days} days`, body: [`A ${sev.label} injury at ${show.name}. You can’t be booked until ${fmtDay(p.injury.until, 'long')}.`, bill ? `Medical bills: £${bill.toLocaleString('en-GB')}${cover ? ' after your Medical Pay cover' : ''}.` : 'Your contract covers the medical bills.'] });
  } else if (w.promotion === findWrestler(c.player)?.promotion && w.promotion !== 'TIS') {
    letter(c, { kind: 'injury', from: `${w.promotion} medical`, subject: `${w.name} out for ${days} days`, body: [`A ${sev.label} injury at ${show.name}.`] });
  }
  // Pull them from any card they were on.
  for (const s of Object.values(c.shows)) {
    if (s.done || s.date <= show.date || s.date >= p.injury.until || !s.card) continue;
    s.card = s.card.filter((b) => b.a !== id && b.b !== id);
    // Still in your promotion's doghouse (Requests): a shorter card mustn't make you the main event.
    const last = s.card[s.card.length - 1];
    if (heated(c, s) && s.card.length > 1 && last && (last.a === c.player || last.b === c.player)) s.card.splice(s.card.length - 2, 0, s.card.pop()!);
  }
}

/** Your side of a match: pay, history, the planned finish, tryouts, letters. */
function settleMine(c: Career, show: Show, bout: Bout, out: SimOut, aIsYou: boolean, popDelta: number, titleChanged: boolean, how: 'played' | 'simmed' = 'played', was?: MailBefore): void {
  const me = person(c, c.player);
  const oppId = bout.a === c.player ? bout.b : bout.a;
  const opp = findWrestler(oppId)!;
  const winner = bout.result!.winner;
  const result = winner === null ? 'draw' : winner === c.player ? 'win' : 'loss';
  let fee = 0, bonus = 0, travel = 0;
  // Against the plan isn't always sabotage: winning when booked to lose, in a match you played, is going
  // off-script; losing when booked to win is failing to deliver; a simmed match going the other way is an upset.
  let planned: PlayerMatch['planned'] = null;
  if (bout.planned) {
    planned = bout.planned === winner ? 'kept' : bout.planned === c.player ? 'botched' : winner === c.player && how === 'played' ? 'off-script' : 'upset';
  }
  const indie = show.promo === 'TIS';
  if (indie) {
    const deal = c.indie[show.id] ?? { fee: indieFee(findWrestler(c.player)!, show), travel: 0 };
    travel = deal.travel;
    fee = result === 'loss' ? round5(deal.fee * (1 - LOSS_CUT_BY_TIER[0]!)) : deal.fee;
    if (deal.travel) spend(c, -deal.travel, `Travel · ${show.city}`, 'travel');
    delete c.indie[show.id];
  } else if (me.contract) {
    const p = matchPay(me.contract, show.kind, result === 'loss', isWeeklyFlagship(show));
    fee = p.pay; bonus = p.bonus;
  } else if (bout.tryout) {
    fee = indieFee(findWrestler(c.player)!, show);
  }
  if (planned === 'off-script' && (me.contract?.clauses[C.creative] ?? 0) < 3) {
    fee = 0; bonus = 0;
    me.rep = r1(clamp(me.rep + REP_OFF_SCRIPT, 0, 100));
    me.titleBanUntil = addDays(show.date, OFF_SCRIPT_TITLE_BAN_DAYS);
  }
  if (fee) spend(c, fee, `${show.name} · ${result === 'win' ? 'beat' : result === 'loss' ? 'lost to' : 'drew with'} ${opp.name}`, 'fee');
  if (bonus) spend(c, bonus, `${show.name} · appearance bonus`, 'bonus');
  const stats = aIsYou === (bout.a === c.player) ? out.stats.you : out.stats.them;
  c.history.unshift({
    day: show.date, show: show.id, showName: show.name, promo: show.promo, kind: show.kind, opp: oppId, oppName: opp.name, result,
    finish: out.finish, t: out.t, stars: out.stars, ...(bout.title ? { title: bout.title } : {}), ...(titleChanged && winner === c.player ? { wonTitle: true } : {}),
    planned, fee: fee + bonus, indie, stats, ...(out.move ? { move: out.move } : {}), ...(how === 'played' ? { played: true } : {}),
    ...(out.report ? { grades: out.report.grades.map((g) => g.v) } : {}),
  });
  if (was) {
    // Mail on: the full letter, written once the match's knock-on effects (relationships, patience) have landed.
    if (bout.tryout) tryoutVerdict(c, show, result === 'win' || out.stars >= TRYOUT_MIN_STARS);
    for (const f of hooks.mine) f(c, show, bout, c.history[0]!);
    hooks.mail?.result(c, show, bout, c.history[0]!, out, was, fee + bonus, travel);
    hooks.mail?.after(c, show, c.history[0]!);
    return;
  }
  const region = REGION_LABEL[show.region];
  letter(c, {
    kind: 'result', from: show.name, subject: `${result === 'win' ? 'You beat' : result === 'loss' ? 'You lost to' : 'A draw with'} ${opp.name}`,
    body: [`${out.stars}★${out.move ? ` · ${out.move}` : ''}.${planned === 'off-script' ? ' You went off-script.' : planned === 'botched' ? ' You were booked to win.' : planned === 'upset' ? ' Not the finish they planned, but no one’s blaming you.' : ''}`],
    terms: [['Paid', `£${(fee + bonus).toLocaleString('en-GB')}`], ['Fans', `${popDelta >= 0 ? '+' : '−'}${fmtFans(Math.abs(popDelta))} in ${region}`], ['Reputation', `${r1(me.rep)}`]],
    read: false,
  } as Omit<Letter, 'id' | 'day'>);
  if (bout.tryout) tryoutVerdict(c, show, result === 'win' || out.stars >= TRYOUT_MIN_STARS);
  for (const f of hooks.mine) f(c, show, bout, c.history[0]!);
}

/** A tryout match went well (or didn't): the promotion writes either way. */
function tryoutVerdict(c: Career, show: Show, passed: boolean): void {
  if (!passed) {
    letter(c, { kind: 'offer', from: promoName(show.promo), subject: 'Thanks, but not yet', body: ['We liked some of what we saw. Keep working and we’ll keep watching.'] });
    return;
  }
  makeOffer(c, show.promo, 'After your tryout');
}

/** A promotion offers you a contract (it opens a negotiation). */
export function makeOffer(c: Career, promo: string, why: string): void {
  const me = findWrestler(c.player)!;
  const mine = c.people[c.player]!.contract;
  const start = mine ? addDays(mine.end, 1) : c.today;
  // Opening offers start at the promotion's floor at least (Lyra's call: about £2,500 at the bottom).
  const fee = round5(Math.max(feeFloor(promo), contractFee(me, promo) * 0.85));
  const id = `o${++c.seq}`;
  c.offers.push({ id, promo, day: c.today, fee, months: 12, clauses: NO_CLAUSES(), start, rounds: 0, said: `£${fee.toLocaleString('en-GB')} a match for 12 months. No extras.`, status: 'open' });
  letter(c, {
    kind: 'offer', from: promoName(promo), subject: `${promo} want to sign you`,
    body: [`${why}: we’d like to bring you to ${promoName(promo)} on a 12-month deal at £${fee.toLocaleString('en-GB')} a match.`, mine ? `Your current deal runs to ${fmtDay(mine.end, 'long')}, so this would start the day after.` : 'It would start straight away. The terms are open to negotiation.'],
    terms: [['Fee', `£${fee.toLocaleString('en-GB')} a match`], ['Length', '12 months'], ['Starts', fmtDay(start, 'dm')]],
    action: { type: 'negotiate', offer: id },
  });
}

/**
 * A title match drawn before its title changed hands, without the new champion in it, goes ahead as an
 * ordinary match. Titles are only booked onto one card at a time now, so only older saves have these.
 */
function dropStaleTitle(b: Bout): void {
  if (!b.title || b.result) return;
  const holder = TITLES.find((t) => t.id === b.title)?.holder;
  if (holder && holder !== b.a && holder !== b.b) { delete b.title; delete b.planned; }
}

const nights = new WeakMap<Career, Promise<void>>();

/**
 * Run every remaining match today except yours, and mark today's shows done if nothing's left.
 * One run at a time: after your match the night runs in the background, and moving the day on
 * meanwhile waits for it rather than running the night a second time.
 */
export function runToday(c: Career, run: (jobs: SimJob[]) => Promise<SimOut[]>): Promise<void> {
  const next = (nights.get(c) ?? Promise.resolve()).then(() => runNight(c, run));
  nights.set(c, next.catch(() => undefined));
  return next;
}

async function runNight(c: Career, run: (jobs: SimJob[]) => Promise<SimOut[]>): Promise<void> {
  const jobs = worldJobs(c);
  const outs = await run(jobs);
  const byKey = new Map(outs.map((o) => [o.key, o]));
  // Title matches usually go the way the booker planned: one that doesn't gets wrestled again.
  const plannedSide = (j: SimJob) => {
    const [showId, i] = j.key.split('#');
    const b = c.shows[showId!]?.card?.[Number(i)];
    return b?.planned ? (b.planned === j.you ? 'you' : 'them') : null;
  };
  // The would-be loser's personality: professionals do the job, the rebellious push back (fewer re-runs).
  const allowed = (j: SimJob) => { const want = plannedSide(j); return PLANNED_RETRIES + retryAdjust(findWrestler(want === 'you' ? j.them : j.you)); };
  for (let attempt = 1; attempt <= PLANNED_RETRIES + 2; attempt++) {
    const again = jobs.filter((j) => { const want = plannedSide(j); return want && attempt <= allowed(j) && byKey.get(j.key)?.winner !== want; })
      .map((j) => ({ ...j, seed: hashSeed(j.seed, 'again', attempt) }));
    if (!again.length) break;
    for (const o of await run(again)) byKey.set(o.key, o);
  }
  for (const show of showsOn(c, c.today)) {
    show.card?.forEach((_, i) => {
      const o = byKey.get(`${show.id}#${i}`);
      if (o) applyBout(c, show, i, o, true);
    });
    if (show.card?.every((b) => b.result) ?? true) show.done = true;
  }
  databaseChanged();
}

/** Run every remaining match today (yours must be done first), then move the world on a day. */
export async function finishDay(c: Career, run: (jobs: SimJob[]) => Promise<SimOut[]>): Promise<void> {
  await runToday(c, run);
  // Anything still unplayed today (your match, if you walked away from it) is lost, and the booker remembers.
  const missed = myBoutToday(c);
  if (missed) {
    movePatience(c, showBooker(missed.show), PATIENCE_NO_SHOW, `Missed your match on ${missed.show.name}`);
    remember(c, showBooker(missed.show), 'noShows');
    // A no-show undoes whatever was building towards Reliable.
    delete c.people[c.player]?.leanings?.reliable;
  }
  for (const show of showsOn(c, c.today)) show.done = true;
  endOfDay(c);
  databaseChanged();
}

/** Everything that happens overnight. */
export function endOfDay(c: Career): void {
  const day = c.today;
  const rnd = seededRng(hashSeed(c.seed, 'night', day));
  const worked = new Set<string>();
  for (const s of showsOn(c, day)) for (const b of s.card ?? []) if (b.result) { worked.add(b.a); worked.add(b.b); }
  for (const s of Object.values(c.shows)) if (!s.done) for (const b of s.card ?? []) dropStaleTitle(b);
  // Indie dates you agreed to but couldn't wrestle (injured, say) fall away.
  for (const id of Object.keys(c.indie)) if ((c.shows[id]?.date ?? '') <= day) delete c.indie[id];
  for (const id of Object.keys(c.tryouts)) if ((c.shows[id]?.date ?? '') <= day) delete c.tryouts[id];
  const tomorrow = addDays(day, 1);
  const mmdd = tomorrow.slice(5);
  for (const w of WRESTLERS) {
    const p = person(c, w.id);
    if (FEATURES.days && w.id === c.player) p.fatigue = Math.max(0, p.fatigue - (worked.has(w.id) ? SLEEP_RECOVERY_AFTER_MATCH : SLEEP_RECOVERY));
    else if (!worked.has(w.id)) p.fatigue = Math.max(0, p.fatigue - FATIGUE_RECOVERY_PER_DAY);
    if (p.injury && p.injury.until <= tomorrow) {
      p.injury = null;
      if (w.id === c.player) letter(c, { kind: 'injury', from: 'The doctor', subject: 'You’re fit again', body: ['Cleared to wrestle.'] });
    }
    if (p.birthday === mmdd) w.age++;
  }
  if (tomorrow.endsWith('-01')) monthly(c, tomorrow, rnd);
  contractsEnding(c, tomorrow, rnd);
  if (FEATURES.livingCosts) livingCosts(c, tomorrow);
  if (tomorrow >= c.nextRookie) {
    const rookie = makeRookie(rnd, WRESTLERS, `rookie_${tomorrow.replace(/-/g, '')}`);
    WRESTLERS.push(rookie);
    addEvent(history(), { day: tomorrow, kind: 'debut', who: rookie.id, name: rookie.name, promo: 'TIS' });
    c.people[rookie.id] = newPerson(rookie.id, REP_START);
    c.nextRookie = addDays(tomorrow, Math.round(ROOKIE_EVERY_DAYS * (0.6 + rnd() * 0.8)));
    letter(c, { kind: 'news', from: 'The news desk', subject: 'New face on The Indie Scene', body: [`Rookie ${rookie.name} (${rookie.country}) is out of training and taking indie bookings.`] });
  }
  for (const f of c.feuds) {
    if (f.done) continue;
    const pay = f.payoff ? c.shows[f.payoff] : undefined;
    const a = findWrestler(f.a), b = findWrestler(f.b);
    if (!pay || pay.done || !a || !b || a.promotion !== f.promo || b.promotion !== f.promo) f.done = true;
  }
  // The world remembers every show for good; the career only keeps the last month.
  for (const s of showsOn(c, day)) if (s.card?.some((b) => b.result)) archive(s);
  // Keep the save small: shows more than a month gone, and finished feuds, go.
  const cutoff = addDays(day, -35);
  for (const [id, s] of Object.entries(c.shows)) if (s.date < cutoff) delete c.shows[id];
  c.feuds = c.feuds.filter((f) => !f.done || daysBetween(f.start, day) < 60);
  c.today = tomorrow;
  activeWorld().day = tomorrow;
  extendCalendar(c);
  bookAhead(c, tomorrow, BOOK_AHEAD_DAYS, WRESTLERS);
  dailyPlayer(c, rnd);
  // Last thing at night, after every way someone can leave (retirements included): rosters back to 38–40.
  scoutRosters(c, tomorrow);
}

/** Put a finished show into the world's history. */
/** Shows already in the record, per history (so archiving stays quick however long the world runs). */
const archivedIds = new WeakMap<WorldHistory, Set<string>>();

function archive(s: Show): void {
  const H = history();
  let ids = archivedIds.get(H);
  if (!ids) archivedIds.set(H, (ids = new Set(H.shows.map((x) => x.id))));
  if (ids.has(s.id)) return;
  ids.add(s.id);
  const booker = s.promo === 'TIS' && !s.promos ? showBooker(s) : bookerKey(s.promo);
  const entry: ArchivedShow = {
    id: s.id, date: s.date, promo: s.promo, ...(s.promos ? { promos: s.promos } : {}), ...(s.special ? { tag: s.special.tag } : {}), name: s.name, kind: s.kind, city: s.city, country: s.country,
    ...(s.brand ? { brand: s.brand } : {}), ...(booker ? { booker } : {}),
    bouts: (s.card ?? []).filter((b) => b.result).map((b) => ({
      a: b.a, b: b.b, an: findWrestler(b.a)?.name ?? b.a, bn: findWrestler(b.b)?.name ?? b.b,
      ...(b.title ? { title: b.title } : {}), ...(b.stip ? { stip: b.stip } : {}),
      w: b.result!.winner === null ? null : b.result!.winner === b.a ? 'a' : 'b',
      finish: b.result!.finish, t: b.result!.t, stars: b.result!.stars, ...(b.result!.move ? { move: b.result!.move } : {}), ...(b.result!.newChamp ? { newChamp: true } : {}),
    })),
  };
  H.shows.push(entry);
}

/** The first of the month: merch, idle wrestlers fading, roster moves, getting noticed. */
function monthly(c: Career, day: Day, rnd: Rng): void {
  for (const w of WRESTLERS) {
    const p = c.people[w.id];
    if (p?.last && daysBetween(p.last, day) > POP_IDLE_DAYS) {
      // Out of sight: a gentle drift away (0.5% a month).
      for (const k of POP_KEYS) w.fans[k] = Math.round(w.fans[k] * (1 - FAN_IDLE_LOSS));
    }
  }
  const me = findWrestler(c.player)!;
  const mine = c.people[c.player]!;
  const pleaser = hasTrait(findWrestler(c.player), 'crowd_pleaser') ? TRAIT_FX.crowd_pleaser.merch : 1;
  // Merch follows your fans: signed, your Merchandise Rights share of it; a free agent sells their own, at a lower rate.
  const merch = mine.contract ? round5(fansTotal(me) * MERCH_PER_FAN_SIGNED * (MERCH_SHARE[mine.contract.clauses[C.merch] ?? 0] ?? 0) * pleaser) : round5(fansTotal(me) * MERCH_PER_FAN_FREE * pleaser);
  spend(c, merch, mine.contract && !(mine.contract.clauses[C.merch] ?? 0) ? 'Merch (no Merchandise Rights)' : 'Merch', 'merch');
  // Mid-contract releases at the bottom of each roster.
  for (const p of PROMOTIONS.filter((x) => !x.indie)) {
    const roster = WRESTLERS.filter((w) => w.promotion === p.initials).sort((a, b) => globalScore(a) - globalScore(b));
    for (const w of roster.slice(0, Math.floor(roster.length / 4))) {
      if (w.id === c.player || TITLES.some((t) => t.holder === w.id)) continue;
      if (rnd() < RELEASE_MONTHLY_BOTTOM) release(c, w, 'released');
    }
  }
  noticePlayer(c, rnd);
  for (const f of hooks.monthly) f(c, rnd);
}

function release(c: Career, w: Wrestler, how: 'released' | 'expired'): void {
  const from = w.promotion;
  addEvent(history(), { day: c.today, kind: how, who: w.id, name: w.name, promo: from });
  w.promotion = 'TIS';
  c.people[w.id]!.contract = null;
  if (from === findWrestler(c.player)?.promotion) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} leaves ${from}`, body: [how === 'released' ? `${from} have released ${w.name}.` : `${w.name}’s contract ran out and they’re a free agent.`] });
}

function sign(c: Career, w: Wrestler, promo: string, day: Day, rnd: Rng): void {
  const from = w.promotion;
  addEvent(history(), { day, kind: from === 'TIS' ? 'signed' : 'poached', who: w.id, name: w.name, promo, ...(from !== 'TIS' ? { from } : {}) });
  w.promotion = promo;
  const pp = person(c, w.id);
  pp.contract = aiContract(rnd, w, promo, day, CONTRACT_MONTHS[1 + Math.floor(rnd() * 2)]!);
  pp.moves = [...(pp.moves ?? []), day].slice(-4);
  pp.renewals = 0;
  // Indie dates already on the cards are honoured, but not with an indie title on the line: they're signed now.
  for (const s of Object.values(c.shows)) {
    if (s.done || s.promo !== 'TIS' || !s.card) continue;
    for (const b of s.card) if (!b.result && b.title && isIndieTitle(b.title) && (b.a === w.id || b.b === w.id)) { delete b.title; delete b.planned; }
  }
  const myPromo = findWrestler(c.player)?.promotion;
  if (promo === myPromo || (from === myPromo && from !== 'TIS')) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} signs with ${promo}`, body: [from === 'TIS' ? `${promo} have signed ${w.name} from The Indie Scene.` : `${w.name} leaves ${from} for ${promo}.`] });
}

/**
 * Rent and food (Lyra's call), every Monday where you live. A career that was running before living
 * costs existed gets four weeks' notice first; one started since pays from its first Monday. Keyed to
 * the Monday, so a replayed night can never charge twice.
 */
export function livingCosts(c: Career, day: Day): void {
  if (weekday(day) !== 1 || c.people[c.player]?.retired) return;
  if (!c.livingFrom) {
    c.livingFrom = addDays(day, LIVING_GRACE_DAYS);
    const region = baseRegion(c);
    letter(c, { kind: 'news', from: 'Your landlord', subject: 'Rent and food from now on', body: [`From ${fmtDay(c.livingFrom, 'long')}, living costs come out every Monday: about £${livingCost(region).toLocaleString('en-GB')} a week in ${REGION_LABEL[region]}.`] });
    return;
  }
  if (day < c.livingFrom || (c.livingPaidThrough && c.livingPaidThrough >= day)) return;
  const region = baseRegion(c);
  spend(c, -livingCost(region), `Living costs · ${REGION_LABEL[region]}`, 'living');
  c.livingPaidThrough = day;
}

/**
 * Rosters stay 38–40 (Lyra's call). Someone leaves and the promotion goes scouting: the replacement
 * signs from the indie scene a week to three later. Under 38 they sign straight away. The division
 * that's short against how the promotion ships gets the signing, so neither one drains away.
 * Rolls with its own seed.
 */
function scoutRosters(c: Career, day: Day): void {
  const rnd = seededRng(hashSeed(c.seed, 'scout', day));
  const scouting = (c.scouting ??= {});
  let pool: Wrestler[] | null = null;
  for (const p of PROMOTIONS.filter((x) => !x.indie)) {
    const roster = WRESTLERS.filter((w) => w.promotion === p.initials);
    let n = roster.length;
    if (n >= ROSTER_TARGET) { delete scouting[p.initials]; continue; }
    const due = (scouting[p.initials] ??= addDays(day, between(rnd, ROSTER_SCOUT_DAYS)));
    const want = due <= day ? Math.max(ROSTER_FLOOR, n + 1) : ROSTER_FLOOR;
    if (n >= want) continue;
    pool ??= WRESTLERS.filter((w) => {
      const q = c.people[w.id];
      return w.promotion === 'TIS' && w.id !== c.player && !q?.retired && !q?.retiring && !q?.injury && !TITLES.some((t) => t.holder === w.id);
    });
    const region = promoRegion(p.initials);
    const wantWomen = Math.round(ROSTER_TARGET * shippedWomenShare(p.initials));
    let women = roster.filter((w) => w.gender === 'FEMALE').length;
    while (n < want) {
      const free = pool.filter((w) => w.promotion === 'TIS');
      const short = women / Math.max(1, wantWomen) < (n - women) / Math.max(1, ROSTER_TARGET - wantWomen) ? 'FEMALE' : 'MALE';
      const fits = free.some((w) => w.gender === short) ? free.filter((w) => w.gender === short) : free;
      const best = fits.sort((a, b) => regionalPop(b, region) - regionalPop(a, region) || (a.id < b.id ? -1 : 1))[0];
      if (!best) break;
      sign(c, best, p.initials, day, rnd);
      n++;
      if (best.gender === 'FEMALE') women++;
    }
    if (due <= day) {
      if (n < ROSTER_TARGET) scouting[p.initials] = addDays(day, between(rnd, ROSTER_SCOUT_DAYS));
      else delete scouting[p.initials];
    }
  }
}

const between = (rnd: Rng, [lo, hi]: readonly [number, number]) => lo + Math.floor(rnd() * (hi - lo + 1));

function contractsEnding(c: Career, day: Day, rnd: Rng): void {
  for (const w of [...WRESTLERS]) {
    const p = c.people[w.id];
    const k = p?.contract;
    if (!p || !k || k.end >= day) continue;
    if (w.id === c.player) { playerContractEnds(c, w, day); continue; }
    const roster = WRESTLERS.filter((x) => x.promotion === w.promotion);
    const byPop = [...roster].sort((a, b) => globalScore(a) - globalScore(b));
    const median = byPop.length ? globalScore(byPop[Math.floor(byPop.length / 2)]!) : 0;
    const champ = TITLES.some((t) => t.holder === w.id);
    // Personality: Loyal stays more, Mercenary less; the Ambitious leave if they're stuck below the top third.
    const third = byPop.length ? globalScore(byPop[byPop.length - 1 - Math.floor(byPop.length / 3)]!) : 0;
    const restless = hasTrait(w, 'ambitious') && globalScore(w) < third && rnd() < TRAIT_BACKSTAGE.ambitious.leave;
    if (champ || (!restless && rnd() < (globalScore(w) >= median ? RENEW_CHANCE_TOP : RENEW_CHANCE_REST) + renewLean(w))) {
      p.contract = aiContract(rnd, w, w.promotion, day, CONTRACT_MONTHS[1]!);
      p.renewals = (p.renewals ?? 0) + 1;
      continue;
    }
    const others = PROMOTIONS.filter((x) => !x.indie && x.initials !== w.promotion && WRESTLERS.filter((y) => y.promotion === x.initials).length < ROSTER_TARGET);
    if (others.length && rnd() < Math.min(0.95, POACH_CHANCE * poachMult(w))) sign(c, w, others[Math.floor(rnd() * others.length)]!.initials, day, rnd);
    else release(c, w, 'expired');
  }
}

/**
 * Your contract starts: an indie title you hold stays yours only if the deal has Indie Bookings
 * (you defend it on indie dates). Without, it's vacated and the indie scene wrestles for it.
 */
export function indieBeltOnSigning(c: Career, day: Day): void {
  const k = c.people[c.player]?.contract;
  if (!k || (k.clauses[C.indie] ?? 0) >= 1) return;
  for (const t of TITLES.filter((x) => x.holder === c.player && isIndieTitle(x.id))) {
    t.holder = null;
    const open = history().reigns[t.id]?.find((r) => r.to === null);
    if (open) open.to = day;
    c.titles[t.id] = { since: day, defences: 0, last: null };
    for (const s of Object.values(c.shows)) if (!s.done && s.card) for (const b of s.card) if (b.title === t.id && !b.result) { delete b.title; delete b.planned; }
    letter(c, { kind: 'contract', from: 'The Indie Scene', subject: `You’ve vacated the ${t.name}`, body: [`Your ${k.promo} deal has no Indie Bookings, so you can’t defend it. The indie scene will crown a new champion.`] });
  }
}

function playerContractEnds(c: Career, w: Wrestler, day: Day): void {
  const p = c.people[c.player]!;
  const was = p.contract!.promo;
  if (p.next) {
    p.contract = p.next;
    delete p.next;
    addEvent(history(), { day, kind: 'signed', who: w.id, name: w.name, promo: p.contract.promo, ...(was !== p.contract.promo ? { from: was } : {}) });
    w.promotion = p.contract.promo;
    letter(c, { kind: 'contract', from: promoName(p.contract.promo), subject: `Welcome to ${p.contract.promo}`, body: [`Your new deal starts today and runs to ${fmtDay(p.contract.end, 'long')}.`] });
    indieBeltOnSigning(c, day);
  } else {
    p.contract = null;
    w.promotion = 'TIS';
    addEvent(history(), { day, kind: 'expired', who: w.id, name: w.name, promo: was });
    letter(c, { kind: 'contract', from: promoName(was), subject: 'Your contract has ended', body: ['You’re a free agent on The Indie Scene from today.'] });
  }
  // Their cards no longer have you on them.
  for (const s of Object.values(c.shows)) if (!s.done && s.date >= day && s.promo === was && s.card) s.card = s.card.filter((b) => b.a !== c.player && b.b !== c.player);
}

/** Promotions noticing you (and players near the end of a deal). Filled in by the offers rules. */
type Hook = (c: Career, rnd: Rng) => void;
/** Mail plugs in here too: where a letter goes, and the full result letter (mail.ts). */
export interface MailHooks {
  route: (c: Career, l: Omit<Letter, 'id' | 'day' | 'read'>) => boolean;
  before: (c: Career, show: Show, opp: string) => MailBefore;
  result: (c: Career, show: Show, bout: Bout, m: PlayerMatch, out: SimOut, b: MailBefore, paid: number, travel: number) => void;
  after: (c: Career, show: Show, m: PlayerMatch) => void;
}
export interface MailBefore { fans: Record<string, number>; rep: number; patience: number; bond: number; label: string }
const hooks: { notice: Hook[]; daily: Hook[]; monthly: Hook[]; mine: ((c: Career, show: Show, bout: Bout, m: PlayerMatch) => void)[]; mail: MailHooks | null } = { notice: [], daily: [], monthly: [], mine: [], mail: null };
/** Other career modules (offers, requests) plug in here; each adds to the list. */
export function setCareerHooks(h: { notice?: Hook; daily?: Hook; monthly?: Hook; mine?: (c: Career, show: Show, bout: Bout, m: PlayerMatch) => void; mail?: MailHooks }): void {
  if (h.notice) hooks.notice.push(h.notice);
  if (h.daily) hooks.daily.push(h.daily);
  if (h.monthly) hooks.monthly.push(h.monthly);
  if (h.mine) hooks.mine.push(h.mine);
  if (h.mail) hooks.mail = h.mail;
}
const noticePlayer = (c: Career, rnd: Rng) => { for (const f of hooks.notice) f(c, rnd); };
const dailyPlayer = (c: Career, rnd: Rng) => { for (const f of hooks.daily) f(c, rnd); };

export { available, BUDGET };
