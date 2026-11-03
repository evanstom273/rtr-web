// The career loop: starting one, a day at a time, and what every match changes in the world.
import { PROMOTIONS, TITLES, WRESTLERS, databaseChanged, findWrestler, type Wrestler } from '../data/rtr';
import { seededRng, type Rng } from '../engine/rng';
import type { MatchRulesConfig } from '../engine/types';
import { HARDCORE_STIPS, available, bookAhead, hashSeed, promoRegion, regionalPop } from './booker';
import { drawCalendar } from './calendar';
import { BUDGET, C, NO_CLAUSES, attitude } from './clauses';
import { makeRookie } from './create';
import { addDays, addMonths, daysBetween, fmtDay, type Day } from './dates';
import { contractFee, indieFee, matchPay, round5 } from './economy';
import { REGION_LABEL } from './places';
import type { SimJob, SimOut } from './sim';
import {
  BOOK_AHEAD_DAYS, CONTRACT_MONTHS, FATIGUE_HARDCORE_EXTRA, FATIGUE_PER_MATCH, FATIGUE_RECOVERY_PER_DAY, FATIGUE_STAMINA_DIVISOR,
  INJURY_BASE_PCT, INJURY_HARDCORE_MULT, INJURY_PER_FATIGUE, INJURY_SEVERITY, MEDICAL_BILL_COVER, MEDICAL_PER_DAY, MERCH_INDIE,
  MERCH_SHARE, MERCH_SIGNED, OFF_SCRIPT_TITLE_BAN_DAYS, PLANNED_NUDGE, POACH_CHANCE, POP_CEILING, POP_GLOBAL_SHARE, POP_IDLE_DAYS,
  POP_IDLE_DECAY, POP_LOSS, POP_PER_STAR, POP_STAR_PIVOT, POP_TITLE_WIN, POP_WIN, RELEASE_MONTHLY_BOTTOM, RENEW_CHANCE_REST,
  RENEW_CHANCE_TOP, REP_FOUR_STAR, REP_OFF_SCRIPT, REP_PER_DATE, REP_START, ROOKIE_EVERY_DAYS, ROSTER_MAX, ROSTER_SIGN_BELOW,
  START_CONTRACT_MONTHS_LEFT, START_MONEY_CREATED, START_MONEY_PER_POP, TRYOUT_MIN_STARS,
} from './tuning';
import type { Bout, Career, Contract, Letter, Person, PopRegion, Show } from './types';

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
  const rank = roster.filter((x) => x.popularity.global > w.popularity.global).length / Math.max(1, roster.length);
  if (rank < 0.25) {
    const easy = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => attitude(promo, i) === 'flexible');
    for (const i of easy.slice(0, 1 + Math.floor(rnd() * 2))) clauses[i] = 1 + Math.floor(rnd() * 2);
  }
  return { promo, start, end: addMonths(start, months), fee: contractFee(w, promo), clauses };
}

export interface StartOptions { player: string; today: Day; seed: number; created?: boolean }

/** Start a career in the active world (which the caller has just reset to the shipped database). */
export function startCareer(o: StartOptions): Career {
  const rnd = seededRng(o.seed);
  const c: Career = {
    v: 1, player: o.player, startedOn: o.today, today: o.today, drawnTo: '', counters: {}, nextIrregular: {}, shows: {},
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
  for (const t of TITLES) c.titles[t.id] = { since: o.today, defences: 0, last: null, reigns: t.holder ? [{ holder: t.holder, from: o.today, to: null, defences: 0 }] : [] };
  const me = findWrestler(o.player)!;
  c.money = o.created ? START_MONEY_CREATED : START_MONEY_PER_POP * me.popularity.global;
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
  c.letters.unshift(full);
  if (c.letters.length > 200) c.letters.length = 200;
  return full;
}

export function spend(c: Career, amount: number, text: string, kind: Career['ledger'][number]['kind']): void {
  c.money += amount;
  c.ledger.unshift({ day: c.today, text, amount, kind });
  if (c.ledger.length > 400) c.ledger.length = 400;
}

function extendCalendar(c: Career): void {
  const to = addDays(c.today, CALENDAR_AHEAD_DAYS);
  if (c.drawnTo && c.drawnTo >= to) return;
  const state = { seed: c.seed, counters: c.counters, nextIrregular: c.nextIrregular };
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

function popChange(w: Wrestler, region: PopRegion, delta: number): number {
  const before = w.popularity[region];
  const scaled = delta > 0 ? delta * (1 - before / POP_CEILING) : delta;
  w.popularity[region] = r1(clamp(before + scaled, 0, 100));
  w.popularity.global = r1(clamp(w.popularity.global + scaled * POP_GLOBAL_SHARE, 0, 100));
  return w.popularity[region] - before;
}

/** Apply a finished match to the world: popularity, fatigue, injuries, titles, feuds, and your pay. */
export function applyBout(c: Career, show: Show, index: number, out: SimOut, aIsYou = true): void {
  const bout = show.card![index]!;
  const rnd = seededRng(hashSeed(c.seed, 'after', show.id, index));
  const sideId = (s: 'you' | 'them' | null) => (s === null ? null : (s === 'you') === aIsYou ? bout.a : bout.b);
  const winner = sideId(out.winner);
  bout.result = { winner, finish: out.finish, t: out.t, stars: out.stars, ...(out.move ? { move: out.move } : {}) };
  const hardcore = !!bout.stip && HARDCORE_STIPS.has(bout.stip);
  const changes: Record<string, number> = {};
  let titleChanged = false;

  // Titles change hands on a pinfall, submission or the like, not a DQ or count-out.
  if (bout.title && winner) {
    const t = TITLES.find((x) => x.id === bout.title)!;
    const ts = (c.titles[t.id] ??= { since: show.date, defences: 0, last: null, reigns: [] });
    const nonTitleFinish = out.finish === 'DISQUALIFICATION' || out.finish === 'COUNT_OUT' || out.finish === 'DOUBLE_COUNT_OUT';
    if (winner !== t.holder && !nonTitleFinish) {
      const reign = ts.reigns.find((r) => r.to === null);
      if (reign) reign.to = show.date;
      ts.reigns.push({ holder: winner, from: show.date, to: null, defences: 0 });
      ts.since = show.date; ts.defences = 0;
      t.holder = winner;
      titleChanged = true;
      const w = findWrestler(winner)!;
      const loser = findWrestler(winner === bout.a ? bout.b : bout.a)!;
      if (show.promo === findWrestler(c.player)?.promotion || show.kind === 'flagship' || PROMOTIONS.find((p) => p.titles[0] === t.id)) {
        letter(c, { kind: 'news', from: 'The news desk', subject: `New ${t.name} champion`, body: [`${w.name} beat ${loser.name} at ${show.name} to win the ${t.name}.`] });
      }
    } else {
      ts.defences++;
      const reign = ts.reigns.find((r) => r.to === null);
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
    const delta = (out.stars - POP_STAR_PIVOT) * POP_PER_STAR + (won ? POP_WIN : lost ? POP_LOSS : 0) + (won && titleChanged ? POP_TITLE_WIN : 0);
    changes[id] = popChange(w, show.region, delta);
    p.rep = r1(clamp(p.rep + REP_PER_DATE + (out.stars >= 4 ? REP_FOUR_STAR : 0), 0, 100));
    const injuryPct = (INJURY_BASE_PCT + p.fatigue / INJURY_PER_FATIGUE) * (hardcore ? INJURY_HARDCORE_MULT : 1);
    p.fatigue = clamp(p.fatigue + FATIGUE_PER_MATCH + (hardcore ? FATIGUE_HARDCORE_EXTRA : 0), 0, 100);
    p.last = show.date;
    p.recent = [...(p.recent ?? []), won ? 1 : 0].slice(-5);
    if (rnd() * 100 < injuryPct) injure(c, id, show, rnd);
  }

  const feud = bout.feud ? c.feuds.find((f) => f.id === bout.feud) : undefined;
  if (feud) {
    feud.matches++;
    if (feud.payoff === show.id) feud.done = true;
  }

  if (bout.a === c.player || bout.b === c.player) settleMine(c, show, bout, out, aIsYou, changes[c.player] ?? 0, titleChanged);
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
    letter(c, { kind: 'injury', from: 'The doctor', subject: `You’re out for ${days} days`, body: [`A ${sev.label} injury at ${show.name}. You can’t be booked until ${fmtDay(p.injury.until, 'long')}.`, bill ? `Medical bills: £${bill.toLocaleString('en-GB')}${cover ? ' after your Medical Pay cover' : ''}.` : 'Your contract covers the medical bills.'] });
  } else if (w.promotion === findWrestler(c.player)?.promotion && w.promotion !== 'TIS') {
    letter(c, { kind: 'injury', from: `${w.promotion} medical`, subject: `${w.name} out for ${days} days`, body: [`A ${sev.label} injury at ${show.name}.`] });
  }
  // Pull them from any card they were on.
  for (const s of Object.values(c.shows)) if (!s.done && s.date > show.date && s.date < p.injury.until && s.card) s.card = s.card.filter((b) => b.a !== id && b.b !== id);
}

/** Your side of a match: pay, history, the planned finish, tryouts, letters. */
function settleMine(c: Career, show: Show, bout: Bout, out: SimOut, aIsYou: boolean, popDelta: number, titleChanged: boolean): void {
  const me = person(c, c.player);
  const oppId = bout.a === c.player ? bout.b : bout.a;
  const opp = findWrestler(oppId)!;
  const winner = bout.result!.winner;
  const result = winner === null ? 'draw' : winner === c.player ? 'win' : 'loss';
  let fee = 0, bonus = 0;
  let planned: 'kept' | 'off-script' | null = null;
  if (bout.planned) planned = bout.planned === winner ? 'kept' : 'off-script';
  const indie = show.promo === 'TIS';
  if (indie) {
    const deal = c.indie[show.id] ?? { fee: indieFee(findWrestler(c.player)!, show.region), travel: 0 };
    fee = result === 'loss' ? round5(deal.fee * 0.75) : deal.fee;
    if (deal.travel) spend(c, -deal.travel, `Travel · ${show.city}`, 'travel');
    delete c.indie[show.id];
  } else if (me.contract) {
    const p = matchPay(me.contract, show.kind, result === 'loss');
    fee = p.pay; bonus = p.bonus;
  } else if (bout.tryout) {
    fee = indieFee(findWrestler(c.player)!, show.region);
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
    planned, fee: fee + bonus, indie, stats, ...(out.move ? { move: out.move } : {}),
  });
  const region = REGION_LABEL[show.region];
  letter(c, {
    kind: 'result', from: show.name, subject: `${result === 'win' ? 'You beat' : result === 'loss' ? 'You lost to' : 'A draw with'} ${opp.name}`,
    body: [`${out.stars}★${out.move ? ` · ${out.move}` : ''}.${planned === 'off-script' ? ' You went off-script.' : ''}`],
    terms: [['Paid', `£${(fee + bonus).toLocaleString('en-GB')}`], ['Popularity', `${popDelta >= 0 ? '+' : ''}${r1(popDelta)} ${region}`], ['Reputation', `${r1(me.rep)}`]],
    read: false,
  } as Omit<Letter, 'id' | 'day'>);
  if (bout.tryout) tryoutVerdict(c, show, result === 'win' || out.stars >= TRYOUT_MIN_STARS);
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
  const fee = round5(contractFee(me, promo) * 0.85);
  const id = `o${++c.seq}`;
  c.offers.push({ id, promo, day: c.today, fee, months: 12, clauses: NO_CLAUSES(), start, rounds: 0, said: `£${fee.toLocaleString('en-GB')} a match for 12 months. No extras.`, status: 'open' });
  letter(c, {
    kind: 'offer', from: promoName(promo), subject: `${promo} want to sign you`,
    body: [`${why}: we’d like to bring you to ${promoName(promo)} on a 12-month deal at £${fee.toLocaleString('en-GB')} a match.`, mine ? `Your current deal runs to ${fmtDay(mine.end, 'long')}, so this would start the day after.` : 'It would start straight away. The terms are open to negotiation.'],
    terms: [['Fee', `£${fee.toLocaleString('en-GB')} a match`], ['Length', '12 months'], ['Starts', fmtDay(start, 'dm')]],
    action: { type: 'negotiate', offer: id },
  });
}

/** Run every remaining match today (yours must be done first), then move the world on a day. */
export async function finishDay(c: Career, run: (jobs: SimJob[]) => Promise<SimOut[]>): Promise<void> {
  const jobs = worldJobs(c);
  const outs = await run(jobs);
  const byKey = new Map(outs.map((o) => [o.key, o]));
  for (const show of showsOn(c, c.today)) {
    show.card?.forEach((_, i) => {
      const o = byKey.get(`${show.id}#${i}`);
      if (o) applyBout(c, show, i, o, true);
    });
    show.done = true;
  }
  endOfDay(c);
  databaseChanged();
}

/** Everything that happens overnight. */
export function endOfDay(c: Career): void {
  const day = c.today;
  const rnd = seededRng(hashSeed(c.seed, 'night', day));
  const worked = new Set<string>();
  for (const s of showsOn(c, day)) for (const b of s.card ?? []) if (b.result) { worked.add(b.a); worked.add(b.b); }
  // Indie dates you agreed to but couldn't wrestle (injured, say) fall away.
  for (const id of Object.keys(c.indie)) if ((c.shows[id]?.date ?? '') <= day) delete c.indie[id];
  for (const id of Object.keys(c.tryouts)) if ((c.shows[id]?.date ?? '') <= day) delete c.tryouts[id];
  const tomorrow = addDays(day, 1);
  const mmdd = tomorrow.slice(5);
  for (const w of WRESTLERS) {
    const p = person(c, w.id);
    if (!worked.has(w.id)) p.fatigue = Math.max(0, p.fatigue - FATIGUE_RECOVERY_PER_DAY);
    if (p.injury && p.injury.until <= tomorrow) {
      p.injury = null;
      if (w.id === c.player) letter(c, { kind: 'injury', from: 'The doctor', subject: 'You’re fit again', body: ['Cleared to wrestle.'] });
    }
    if (p.birthday === mmdd) w.age++;
  }
  if (tomorrow.endsWith('-01')) monthly(c, tomorrow, rnd);
  contractsEnding(c, tomorrow, rnd);
  if (tomorrow >= c.nextRookie) {
    const rookie = makeRookie(rnd, WRESTLERS, `rookie_${++c.seq}`);
    WRESTLERS.push(rookie);
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
  // Keep the save small: shows more than a month gone, and finished feuds, go.
  const cutoff = addDays(day, -35);
  for (const [id, s] of Object.entries(c.shows)) if (s.date < cutoff) delete c.shows[id];
  c.feuds = c.feuds.filter((f) => !f.done || daysBetween(f.start, day) < 60);
  c.today = tomorrow;
  extendCalendar(c);
  bookAhead(c, tomorrow, BOOK_AHEAD_DAYS, WRESTLERS);
  dailyPlayer(c, rnd);
}

/** The first of the month: merch, idle wrestlers fading, roster moves, getting noticed. */
function monthly(c: Career, day: Day, rnd: Rng): void {
  for (const w of WRESTLERS) {
    const p = c.people[w.id];
    if (p?.last && daysBetween(p.last, day) > POP_IDLE_DAYS) {
      for (const k of POP_KEYS) w.popularity[k] = Math.max(0, r1(w.popularity[k] - POP_IDLE_DECAY));
      w.popularity.global = Math.max(0, r1(w.popularity.global - POP_IDLE_DECAY));
    }
  }
  const me = findWrestler(c.player)!;
  const mine = c.people[c.player]!;
  const pop = me.popularity.global;
  const merch = mine.contract ? round5(pop * pop * MERCH_SIGNED * (MERCH_SHARE[mine.contract.clauses[C.merch] ?? 0] ?? 0)) : round5(pop * pop * MERCH_INDIE);
  spend(c, merch, mine.contract && !(mine.contract.clauses[C.merch] ?? 0) ? 'Merch (no Merchandise Rights)' : 'Merch', 'merch');
  // Mid-contract releases at the bottom of each roster.
  for (const p of PROMOTIONS.filter((x) => !x.indie)) {
    const roster = WRESTLERS.filter((w) => w.promotion === p.initials).sort((a, b) => a.popularity.global - b.popularity.global);
    for (const w of roster.slice(0, Math.floor(roster.length / 4))) {
      if (w.id === c.player || TITLES.some((t) => t.holder === w.id)) continue;
      if (rnd() < RELEASE_MONTHLY_BOTTOM) release(c, w, 'released');
    }
  }
  topUpRosters(c, day, rnd);
  noticePlayer(c, rnd);
}

function release(c: Career, w: Wrestler, how: 'released' | 'expired'): void {
  const from = w.promotion;
  w.promotion = 'TIS';
  c.people[w.id]!.contract = null;
  if (from === findWrestler(c.player)?.promotion) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} leaves ${from}`, body: [how === 'released' ? `${from} have released ${w.name}.` : `${w.name}’s contract ran out and they’re a free agent.`] });
}

function sign(c: Career, w: Wrestler, promo: string, day: Day, rnd: Rng): void {
  const from = w.promotion;
  w.promotion = promo;
  c.people[w.id]!.contract = aiContract(rnd, w, promo, day, CONTRACT_MONTHS[1 + Math.floor(rnd() * 2)]!);
  const myPromo = findWrestler(c.player)?.promotion;
  if (promo === myPromo || (from === myPromo && from !== 'TIS')) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} signs with ${promo}`, body: [from === 'TIS' ? `${promo} have signed ${w.name} from The Indie Scene.` : `${w.name} leaves ${from} for ${promo}.`] });
}

function topUpRosters(c: Career, day: Day, rnd: Rng): void {
  for (const p of PROMOTIONS.filter((x) => !x.indie)) {
    let n = WRESTLERS.filter((w) => w.promotion === p.initials).length;
    const region = promoRegion(p.initials);
    while (n < ROSTER_SIGN_BELOW) {
      const best = WRESTLERS.filter((w) => w.promotion === 'TIS' && w.id !== c.player && !TITLES.some((t) => t.holder === w.id))
        .sort((a, b) => regionalPop(b, region) - regionalPop(a, region))[0];
      if (!best) break;
      sign(c, best, p.initials, day, rnd);
      n++;
    }
  }
}

function contractsEnding(c: Career, day: Day, rnd: Rng): void {
  for (const w of [...WRESTLERS]) {
    const p = c.people[w.id];
    const k = p?.contract;
    if (!p || !k || k.end >= day) continue;
    if (w.id === c.player) { playerContractEnds(c, w, day); continue; }
    const roster = WRESTLERS.filter((x) => x.promotion === w.promotion);
    const median = [...roster].sort((a, b) => a.popularity.global - b.popularity.global)[Math.floor(roster.length / 2)]?.popularity.global ?? 0;
    const champ = TITLES.some((t) => t.holder === w.id);
    if (champ || rnd() < (w.popularity.global >= median ? RENEW_CHANCE_TOP : RENEW_CHANCE_REST)) {
      p.contract = aiContract(rnd, w, w.promotion, day, CONTRACT_MONTHS[1]!);
      continue;
    }
    const others = PROMOTIONS.filter((x) => !x.indie && x.initials !== w.promotion && WRESTLERS.filter((y) => y.promotion === x.initials).length < ROSTER_MAX);
    if (others.length && rnd() < POACH_CHANCE) sign(c, w, others[Math.floor(rnd() * others.length)]!.initials, day, rnd);
    else release(c, w, 'expired');
  }
}

function playerContractEnds(c: Career, w: Wrestler, day: Day): void {
  const p = c.people[c.player]!;
  const was = p.contract!.promo;
  if (p.next) {
    p.contract = p.next;
    delete p.next;
    w.promotion = p.contract.promo;
    letter(c, { kind: 'contract', from: promoName(p.contract.promo), subject: `Welcome to ${p.contract.promo}`, body: [`Your new deal starts today and runs to ${fmtDay(p.contract.end, 'long')}.`] });
  } else {
    p.contract = null;
    w.promotion = 'TIS';
    letter(c, { kind: 'contract', from: promoName(was), subject: 'Your contract has ended', body: ['You’re a free agent on The Indie Scene from today.'] });
  }
  // Their cards no longer have you on them.
  for (const s of Object.values(c.shows)) if (!s.done && s.date >= day && s.promo === was && s.card) s.card = s.card.filter((b) => b.a !== c.player && b.b !== c.player);
}

/** Promotions noticing you (and players near the end of a deal). Filled in by the offers rules. */
let noticeHook: (c: Career, rnd: Rng) => void = () => {};
let dailyHook: (c: Career, rnd: Rng) => void = () => {};
export function setCareerHooks(h: { notice?: typeof noticeHook; daily?: typeof dailyHook }): void {
  if (h.notice) noticeHook = h.notice;
  if (h.daily) dailyHook = h.daily;
}
const noticePlayer = (c: Career, rnd: Rng) => noticeHook(c, rnd);
const dailyPlayer = (c: Career, rnd: Rng) => dailyHook(c, rnd);

export { available, BUDGET };
