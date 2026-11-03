// Requests: what you can ask bookers and promotions for, and how they answer (balance sheet section 13).
// Every answer: hard noes first, then a yes chance from the request's factors and one roll, fixed per request
// and day. Under the yes chance: yes. In the next band: a counter. Anything else: no.
import { askLean, likesLine, promiseRollsBonus } from './bookerLeans';
import { leanFrom, playerHas } from './leans';
import { PROMOTIONS, TITLES, WRESTLERS, findWrestler, type Title, type Wrestler } from '../data/rtr';
import { seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { available, bookChance, contenders, datesThisMonth, hashSeed, isIndieTitle, playerBookable, promoRegion, regionalEligible, regionalPop, setIndieRoll, titleMinGap, titleRegion } from './booker';
import { REGION_LABEL } from './places';
import { letter, makeOffer, myBoutToday, person, promoName, setCareerHooks, spend } from './career';
import { C } from './clauses';
import { leaveContract, matchRival, payReview } from './contracts';
import { addDays, daysBetween, fmtDay, weekday, type Day } from './dates';
import { indieFee, travelCost } from './economy';
import { dayOff, indieAllowed, joinIndie } from './offers';
import { bookerKey, movePatience, patienceOf, patienceWeek, showBooker } from './patience';
import { trust, trustLabel } from './relations';
import {
  INDIE_PROMISE_ROLLS, REGIONAL_ELIGIBLE_DATES, REGIONAL_WINDOW_DAYS, TRAIT_BACKSTAGE,
  ASK_COUNTER_BAND, ASK_FORM_PER_RESULT, ASK_PATIENCE_DIVISOR, ASK_REP_DIVISOR, ASK_SPOT_BASE_PCT, ASK_SPOT_MAX_PCT, BOOK_AHEAD_DAYS,
  CAUGHT_CHANCE, CAUGHT_CHANCE_SAME_REGION, CAUGHT_DAYS, CHALLENGE_BASE, CHALLENGE_CHAMPION, CHALLENGE_IN_FEUD, CHALLENGE_PER_POP_ABOVE,
  COOLDOWN_CHALLENGE, COOLDOWN_MORE, COOLDOWN_PROMOTION, COOLDOWN_TITLE, CREATIVE_T1_CHANGE, CREATIVE_T2_COOLDOWN_DAYS, INDIE_CH_ALLOWED,
  INDIE_CH_PROMOTION, INDIE_T1_APPROVAL, MORE_BASE, MORE_MIN_DATES, PATIENCE_CAUGHT, PATIENCE_DECLINE_COUNTER, PATIENCE_FLOOR,
  PATIENCE_BOTCHED, PATIENCE_FOLLOWED_PLAN, PATIENCE_GOOD_MATCH, PATIENCE_GOOD_MATCH_STARS, PATIENCE_NAG, PATIENCE_OFF_SCRIPT, PATIENCE_START,
  PATIENCE_TOOK_COUNTER, REP_NAG, SHOW_ASK_BONUS, SHOW_ASK_FLAGSHIP, SHOW_ASK_SPECIAL, TITLE_ASK_BY_RANK, TITLE_ASK_CLAUSE, ASK_TRUST_DIVISOR,
} from './tuning';
import type { Ask, AskKind, Bout, Career, CounterKind, PlayerMatch, Pledge, Show } from './types';

// ------------------------------------------------------------------ shared pieces

/** The first day you can ask about: cards for the next week are already drawn. */
export const firstAskable = (c: Career): Day => addDays(c.today, BOOK_AHEAD_DAYS + 1);
export const myPromo = (c: Career): string | null => person(c, c.player).contract?.promo ?? null;
const me = (c: Career): Wrestler => findWrestler(c.player)!;

/** The shared factors, in points of yes chance. */
export const repPoints = (c: Career): number => (person(c, c.player).rep - 50) / ASK_REP_DIVISOR;
export const formPoints = (c: Career): number =>
  c.history.slice(0, 5).reduce((t, m) => t + (m.result === 'win' ? 1 : m.result === 'loss' ? -1 : 0), 0) * ASK_FORM_PER_RESULT;
export const patiencePoints = (c: Career, key: string): number => (patienceOf(c, key) - PATIENCE_START) / ASK_PATIENCE_DIVISOR;
/** Indie promoters remember: (trust − 50) ÷ 5. */
export const trustPoints = (c: Career, key: string): number => (trust(c, key) - 50) / ASK_TRUST_DIVISOR;
export const formLine = (c: Career): string => {
  const last = c.history.slice(0, 5);
  const w = last.filter((m) => m.result === 'win').length, l = last.filter((m) => m.result === 'loss').length;
  return last.length ? `${w}–${l}` : 'No matches yet';
};

const roll = (c: Career, key: string): number => {
  const r = seededRng(hashSeed(c.seed, 'ask', key, c.today));
  const base = r() * 100;
  // Unpredictable: how they take it is harder to call, either way.
  return playerHas(c, 'unpredictable') ? base + (r() * 2 - 1) * TRAIT_BACKSTAGE.unpredictable.askJitter : base;
};
/** Title asks: the ambitious and the egotistical push harder for them. */
const titleLean = (c: Career): number => (playerHas(c, 'ambitious') ? TRAIT_BACKSTAGE.ambitious.titleAsk : 0) + (playerHas(c, 'egotistical') ? TRAIT_BACKSTAGE.egotistical.titleAsk : 0);
const outcome = (chance: number, r: number): 'yes' | 'counter' | 'no' => (r < chance ? 'yes' : r < chance + ASK_COUNTER_BAND ? 'counter' : 'no');

/** Who a booker key is, for people: a booker's name and promotion, an indie promoter's show, or a promotion. */
export const bookerName = (key: string): string => {
  if (key.startsWith('TIS:')) return key.slice(4);
  const P = activeWorld().people;
  const s = P?.staff[key];
  if (s) return s.job?.kind === 'booker' ? `${s.name} (${s.job.promo})` : s.job?.kind === 'promoter' ? `${s.name} (${P!.brands[s.job.brand]?.name ?? 'indie'})` : s.name;
  return promoName(key);
};

function record(c: Career, a: Omit<Ask, 'id' | 'day' | 'status' | 'toName'> & { status?: Ask['status'] }): Ask {
  const full: Ask = { id: `q${++c.seq}`, day: c.today, toName: bookerName(a.to), status: a.status ?? (a.answer === 'counter' ? 'open' : 'closed'), ...a };
  (c.asks ??= []).unshift(full);
  if (a.kind === 'title') {
    leanFrom(c, 'title_ask');
    if (a.answer === 'no' && playerHas(c, 'ambitious')) movePatience(c, a.to, TRAIT_BACKSTAGE.ambitious.refused, 'Took the no badly');
  }
  if (a.kind === 'approach' || a.kind === 'tryout') leanFrom(c, 'approach');
  if (a.kind === 'release') leanFrom(c, 'release');
  if (c.asks.length > 100) c.asks.length = 100;
  return full;
}

/** Days until a request can be made again without nagging (0 when it can). */
export function cooldownLeft(c: Career, key: string, days: number): number {
  const last = c.asks?.find((a) => a.key === key);
  return last ? Math.max(0, days - daysBetween(last.day, c.today)) : 0;
}

/** Asking inside a cooldown is nagging: it costs patience and a little reputation. */
function nag(c: Career, key: string, days: number, booker: string): boolean {
  if (!cooldownLeft(c, key, days)) return false;
  movePatience(c, booker, PATIENCE_NAG, 'Asked again too soon');
  const p = person(c, c.player);
  p.rep = Math.max(0, p.rep + REP_NAG);
  return true;
}

function pledge(c: Career, p: Omit<Pledge, 'id'>): Pledge {
  // Who promised it: the promoter of that show, or the promotion's booker.
  const show = p.show ? c.shows[p.show] : undefined;
  const by = show ? (show.promo === 'TIS' ? showBooker(show) : bookerKey(show.promo)) : bookerKey(p.promo);
  const full: Pledge = { id: `p${++c.seq}`, by, status: 'open', ...p };
  (c.pledges ??= []).push(full);
  return full;
}

const promoShows = (c: Career, promo: string, from: Day): Show[] =>
  Object.values(c.shows).filter((s) => !s.done && s.date >= from && (s.promos ?? [s.promo]).includes(promo) && s.promo !== 'TIS').sort((a, b) => (a.date < b.date ? -1 : 1));
export const showLine = (s: Show): string => `${s.name} · ${fmtDay(s.date, 'dm')}`;
const busyThatNight = (c: Career, day: Day): boolean => !!person(c, c.player).daysOff?.includes(day) || Object.keys(c.indie).some((id) => c.shows[id]?.date === day);
const inFeud = (c: Career, id: string) => c.feuds.find((f) => !f.done && (f.a === id || f.b === id));
const holdsTitle = (id: string) => TITLES.some((t) => t.holder === id);

// ------------------------------------------------------------------ title shot

export interface Preview { hard: string | null; chance: number; stand: [string, string][]; weigh: { t: string; s: number }[]; nag: number }

/** Titles you could ask your booker about: your promotion's, your division. */
export function askableTitles(c: Career): Title[] {
  const promo = myPromo(c);
  const p = PROMOTIONS.find((x) => x.initials === promo);
  const g = me(c).gender;
  return p ? p.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t): t is Title => !!t && t.gender === g && !t.id.startsWith('ARISE_')) : [];
}

function titleRank(c: Career, t: Title): number {
  const promo = myPromo(c)!;
  const pool = WRESTLERS.filter((w) => w.promotion === promo && (w.id === c.player || available(c.people[w.id], c.today)));
  const list = contenders(c, t, pool, promoRegion(promo), c.today);
  return list.findIndex((w) => w.id === c.player) + 1;
}

/** The first show a title is free for a shot: after its 30-day gap, beyond the drawn week, after any title feud. */
function titleShowFrom(c: Career, t: Title): Day {
  const ts = c.titles[t.id];
  const last = ts?.last ?? ts?.since ?? c.today;
  let from = [firstAskable(c), addDays(last, titleMinGap(t.id))].sort().pop()!;
  const feud = c.feuds.find((f) => f.title === t.id && !f.done);
  const payoff = feud?.payoff ? c.shows[feud.payoff]?.date : undefined;
  if (payoff && payoff >= from) from = addDays(payoff, 1);
  return from;
}

export function previewTitle(c: Career, titleId: string): Preview {
  const t = TITLES.find((x) => x.id === titleId)!;
  const promo = myPromo(c);
  const p = person(c, c.player);
  const tier = p.contract?.clauses[C.title] ?? 0;
  const rank = promo ? titleRank(c, t) : 0;
  const feud = c.feuds.find((f) => f.title === t.id && !f.done);
  const hard = !promo ? 'You’re not signed anywhere.'
    : TITLES.some((x) => x.holder === c.player && !isIndieTitle(x.id)) ? 'You already hold a title.'
      : p.titleBanUntil && p.titleBanUntil > c.today ? `No title matches until ${fmtDay(p.titleBanUntil, 'dm')} (off-script).`
        : patienceOf(c, promo) < PATIENCE_FLOOR ? `${promo}’s booker won’t hear it: patience too low.`
          : c.pledges?.some((x) => (x.kind === 'title' && x.title === t.id) || x.earn === t.id) ? 'You’ve already been promised a shot at this one.'
            : !t.holder ? 'The title’s vacant.'
              : !rank || rank > TITLE_ASK_BY_RANK.length ? `You’re not in the picture: ${rank ? `#${rank}` : 'not ranked'} in line.` : null;
  const base = rank ? TITLE_ASK_BY_RANK[rank - 1] ?? 0 : 0;
  const chance = base + repPoints(c) + formPoints(c) + (TITLE_ASK_CLAUSE[tier] ?? 0) + (promo ? patiencePoints(c, promo) + askLean(c, promo, 'title', `title:${titleId}`) : 0) + titleLean(c);
  return {
    hard, chance, nag: cooldownLeft(c, 'title', COOLDOWN_TITLE),
    stand: [['Contender', rank ? `#${rank}` : '—'], ['Popularity', `${Math.round(regionalPop(me(c), promoRegion(promo ?? 'VWF')))}`], ['Reputation', `${Math.round(p.rep)}`],
      ['Form', formLine(c)], ['Title feud', feud ? `${findWrestler(feud.a)?.name} v ${findWrestler(feud.b)?.name}` : 'None running'], ['Your clause', tier ? `Championship Opportunities T${tier}` : 'None']],
    weigh: [{ t: rank ? `#${rank} contender` : 'Not ranked', s: rank === 1 ? 1 : rank <= 3 ? 0 : -1 }, { t: `Form ${formLine(c)}`, s: Math.sign(formPoints(c)) },
      { t: feud ? 'Title feud running' : 'No title feud', s: feud ? -1 : 1 }, { t: `Reputation ${Math.round(p.rep)}`, s: Math.sign(repPoints(c)) },
      { t: tier ? `Clause T${tier}` : 'No clause', s: tier ? 1 : 0 }, { t: `Patience ${Math.round(promo ? patienceOf(c, promo) : PATIENCE_START)}`, s: Math.sign(promo ? patiencePoints(c, promo) : 0) },
      ...(promo && likesLine(c, promo) ? [likesLine(c, promo)!] : [])],
  };
}

export function askTitleShot(c: Career, titleId: string): Ask {
  const t = TITLES.find((x) => x.id === titleId)!;
  const promo = myPromo(c) ?? 'TIS';
  const pv = previewTitle(c, titleId);
  const what = `Title shot: ${t.name}`;
  if (pv.hard) return record(c, { kind: 'title', to: promo, what, key: 'title', answer: 'no', said: pv.hard });
  const nagged = nag(c, 'title', COOLDOWN_TITLE, promo);
  const chance = nagged ? previewTitle(c, titleId).chance : pv.chance;
  const champ = findWrestler(t.holder!)!;
  const from = titleShowFrom(c, t);
  const first = promoShows(c, promo, from)[0];
  const r = outcome(chance, roll(c, `title:${t.id}`));
  if (r === 'yes' && first) {
    const a = record(c, { kind: 'title', to: promo, what, key: 'title', answer: 'yes', said: `“You’ve earned it. ${champ.name}, ${showLine(first)}.”` });
    pledge(c, { promo, kind: 'title', title: t.id, show: first.id, ask: a.id });
    return a;
  }
  if (r !== 'no') {
    const rank = titleRank(c, t);
    const feud = c.feuds.find((f) => f.title === t.id && !f.done);
    if (rank > 1) {
      const top = contenders(c, t, WRESTLERS.filter((w) => w.promotion === promo && available(c.people[w.id], c.today)), promoRegion(promo), c.today).find((w) => w.id !== c.player)!;
      const show = promoShows(c, promo, firstAskable(c))[0];
      if (top && show) return record(c, { kind: 'title', to: promo, what, key: 'title', answer: 'counter', said: `“Earn it first. Beat ${top.name} on ${showLine(show)} and the shot’s yours.”`,
        counter: { kind: 'earn', pledge: { promo, kind: 'match', opp: top.id, show: show.id, earn: t.id } } });
    }
    if (feud && feud.payoff) {
      const payoff = c.shows[feud.payoff];
      const other = findWrestler(feud.a === champ.id ? feud.b : feud.a);
      return record(c, { kind: 'title', to: promo, what, key: 'title', answer: 'counter', said: `“${champ.name} has ${other?.name ?? 'someone'} first, at ${payoff ? showLine(payoff) : 'their next big show'}. You’re next after that.”`,
        counter: { kind: 'feud', pledge: { promo, kind: 'title', title: t.id, from: addDays(payoff?.date ?? c.today, 1) } } });
    }
    const big = promoShows(c, promo, from).find((s) => s.kind === 'special' || s.kind === 'flagship');
    if (big) return record(c, { kind: 'title', to: promo, what, key: 'title', answer: 'counter', said: `“Not on a ${weekdayName(first?.date ?? big.date)}. ${champ.name} at ${showLine(big)} is yours if you want it.”`,
      counter: { kind: 'show', pledge: { promo, kind: 'title', title: t.id, show: big.id } } });
  }
  const rank = titleRank(c, t);
  return record(c, { kind: 'title', to: promo, what, key: 'title', answer: 'no', said: rank > 1 ? `“Not yet. You’re #${rank} in line.”` : '“Not now.”' });
}

// ------------------------------------------------------------------ indie title shots (free agents)

/** The indie titles a free agent can ask a promoter about: your division's. The worldwide ones first, then the regions you can challenge in. */
export function askableIndieTitles(c: Career): Title[] {
  if (myPromo(c)) return [];
  const p = PROMOTIONS.find((x) => x.initials === 'TIS');
  const mine = me(c);
  const list = p ? p.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t): t is Title => !!t && t.gender === mine.gender) : [];
  const rank = (t: Title) => { const r = titleRegion(t); return !r ? 0 : regionalEligible(c, mine, r, c.today) ? 1 : 2; };
  return list.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || a.i - b.i).map((x) => x.t);
}

function indieRank(c: Career, t: Title, show: Show): number {
  const pool = WRESTLERS.filter((w) => w.promotion === 'TIS' && (w.id === c.player || available(c.people[w.id], show.date)));
  return contenders(c, t, pool, show.region, c.today).findIndex((w) => w.id === c.player) + 1;
}

/** The day a title can next be defended: 30 days after its last defence (or the reign starting). */
function titleDueFrom(c: Career, t: Title): Day {
  const ts = c.titles[t.id];
  return addDays(ts?.last ?? ts?.since ?? c.today, titleMinGap(t.id));
}

/** Why the champion can't be on that show, if they can't. */
function champBusy(c: Career, t: Title, show: Show): string | null {
  const champ = t.holder ? findWrestler(t.holder) : undefined;
  if (!champ) return null;
  const inj = c.people[champ.id]?.injury;
  if (inj && inj.until > show.date) return `${champ.name} is injured until ${fmtDay(inj.until, 'dm')}.`;
  const promised = c.pledges?.find((p) => p.show && p.show !== show.id && c.shows[p.show]?.date === show.date
    && ((p.kind === 'title' && TITLES.find((x) => x.id === p.title)?.holder === champ.id) || (p.kind === 'match' && p.opp === champ.id)));
  return promised ? `${champ.name} is promised elsewhere that night.` : null;
}

/** The next indie show from a day where the champion's free and the title's due: same country first, then region. */
export function indieTitleShow(c: Career, t: Title, from: Day, near: Show): Show | undefined {
  const due = [from, firstAskable(c), titleDueFrom(c, t)].sort().pop()!;
  const region = titleRegion(t);
  const ok = (s: Show) => s.date >= due && (!region || s.region === region) && !s.special?.noTitles && !champBusy(c, t, s) && indieAllowed(c, s.date).ok && !c.asked?.[s.id];
  const shows = askableIndieShows(c).filter(ok);
  return shows.find((s) => s.country === near.country) ?? shows.find((s) => s.region === near.region) ?? shows[0];
}

export function previewIndieTitle(c: Career, titleId: string, showId: string): Preview {
  const t = TITLES.find((x) => x.id === titleId)!;
  const show = c.shows[showId];
  const p = person(c, c.player);
  const promoter = show ? showBooker(show) : '';
  const rank = show ? indieRank(c, t, show) : 0;
  const allowed = show ? indieAllowed(c, show.date) : { ok: false, why: '' };
  const due = titleDueFrom(c, t);
  const busy = show ? champBusy(c, t, show) : null;
  const region = titleRegion(t);
  const hard = myPromo(c) ? 'Indie title shots are for free agents.'
    : holdsTitle(c.player) ? 'You already hold a title.'
      : region && show && show.region !== region ? `The ${t.name} is only defended in ${REGION_LABEL[region]}.`
        : region && !regionalEligible(c, me(c), region, show?.date ?? c.today) ? `Work ${REGIONAL_ELIGIBLE_DATES} dates in ${REGION_LABEL[region]} within ${REGIONAL_WINDOW_DAYS} days first.`
      : p.titleBanUntil && p.titleBanUntil > c.today ? `No title matches until ${fmtDay(p.titleBanUntil, 'dm')} (off-script).`
        : !show || show.date < firstAskable(c) ? 'The next seven days’ cards are set.'
          : !allowed.ok ? allowed.why ?? 'You can’t take that date.'
            : c.asked?.[show.id] ? `${show.name} already gave you an answer.`
              : patienceOf(c, promoter) < PATIENCE_FLOOR ? `${show.name}’s promoter won’t hear it: patience too low.`
                : c.pledges?.some((x) => (x.kind === 'title' && x.title === t.id) || x.earn === t.id) ? 'You’ve already been promised a shot at this one.'
                  : !t.holder ? 'The title’s vacant.'
                    : show.date < due ? `Not due again until ${fmtDay(due, 'dm')}: pick a show from then.`
                      : !rank || rank > TITLE_ASK_BY_RANK.length ? `You’re not in the picture: ${rank ? `#${rank}` : 'not ranked'} in line.` : null;
  const chance = (rank ? TITLE_ASK_BY_RANK[rank - 1] ?? 0 : 0) + repPoints(c) + formPoints(c) + patiencePoints(c, promoter) + trustPoints(c, promoter) + titleLean(c)
    + (promoter ? askLean(c, promoter, 'title', `title:${titleId}`) : 0);
  return {
    hard, chance, nag: cooldownLeft(c, 'title', COOLDOWN_TITLE),
    stand: [['Contender', rank ? `#${rank}` : '—'], ['Popularity', show ? `${Math.round(regionalPop(me(c), show.region))}` : '—'], ['Reputation', `${Math.round(p.rep)}`],
      ['Form', formLine(c)], ['Champion’s night', busy ?? 'Free'], ['Title due', show && show.date >= due ? 'Yes' : `From ${fmtDay(due, 'dm')}`]],
    weigh: [{ t: rank ? `#${rank} contender` : 'Not ranked', s: rank === 1 ? 1 : rank <= 3 ? 0 : -1 }, { t: `Form ${formLine(c)}`, s: Math.sign(formPoints(c)) },
      { t: `Reputation ${Math.round(p.rep)}`, s: Math.sign(repPoints(c)) }, { t: busy ? 'Champion not free' : 'Champion free', s: busy ? -1 : 1 },
      { t: `Promoter patience ${Math.round(patienceOf(c, promoter))}`, s: Math.sign(patiencePoints(c, promoter)) }, { t: trustLabel(trust(c, promoter)), s: Math.sign(trustPoints(c, promoter)) },
      ...(promoter && likesLine(c, promoter) ? [likesLine(c, promoter)!] : [])],
  };
}

export function askIndieTitleShot(c: Career, titleId: string, showId: string): Ask {
  const t = TITLES.find((x) => x.id === titleId)!;
  const show = c.shows[showId]!;
  const promoter = showBooker(show);
  const what = `Title shot: ${t.name} on ${show.name}`;
  const pv = previewIndieTitle(c, titleId, showId);
  if (pv.hard) return record(c, { kind: 'title', to: promoter, what, key: 'title', answer: 'no', said: pv.hard });
  const chance = nag(c, 'title', COOLDOWN_TITLE, promoter) ? previewIndieTitle(c, titleId, showId).chance : pv.chance;
  (c.asked ??= {})[show.id] = true;
  const champ = findWrestler(t.holder!)!;
  const mine = me(c);
  const fee = indieFee(mine, show.region), travel = travelCost(mine.country, show.country);
  const busy = champBusy(c, t, show);
  const r = busy ? (roll(c, `title:${t.id}:${show.id}`) < chance + ASK_COUNTER_BAND ? 'counter' : 'no') : outcome(chance, roll(c, `title:${t.id}:${show.id}`));
  if (r === 'yes') {
    const a = record(c, { kind: 'title', to: promoter, what, key: 'title', answer: 'yes', said: `“You’re on. ${champ.name} for the ${t.name}, ${showLine(show)}: £${fee.toLocaleString('en-GB')}${travel ? `, travel £${travel}` : ''}.”` });
    joinIndie(c, show, fee, travel);
    pledge(c, { promo: 'TIS', kind: 'title', title: t.id, show: show.id, ask: a.id });
    return a;
  }
  if (r === 'counter') {
    if (busy) {
      const alt = indieTitleShow(c, t, addDays(show.date, 1), show);
      if (alt) return record(c, { kind: 'title', to: promoter, what, key: 'title', answer: 'counter', said: `“${busy} ${showLine(alt)} in ${alt.city} instead?”`,
        counter: { kind: 'show', pledge: { promo: 'TIS', kind: 'title', title: t.id, show: alt.id } } });
    } else if (indieRank(c, t, show) > 1) {
      const top = contenders(c, t, WRESTLERS.filter((w) => w.promotion === 'TIS' && available(c.people[w.id], show.date)), show.region, c.today).find((w) => w.id !== c.player);
      if (top) return record(c, { kind: 'title', to: promoter, what, key: 'title', answer: 'counter', said: `“Earn it first. Beat ${top.name} on ${showLine(show)} and the shot’s yours on a later show.”`,
        counter: { kind: 'earn', pledge: { promo: 'TIS', kind: 'match', opp: top.id, show: show.id, earn: t.id } } });
    }
  }
  const rank = indieRank(c, t, show);
  return record(c, { kind: 'title', to: promoter, what, key: 'title', answer: 'no', said: rank > 1 ? `“Not on my show. You’re #${rank} in line.”` : '“Not on my show.”' });
}

const weekdayName = (d: Day): string => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(d)]!;

// ------------------------------------------------------------------ challenges

/** Your promotion's shows you can ask about. */
export const askableShows = (c: Career): Show[] => (myPromo(c) ? promoShows(c, myPromo(c)!, firstAskable(c)) : []);
export const askableIndieShows = (c: Career): Show[] =>
  Object.values(c.shows).filter((s) => s.promo === 'TIS' && !s.done && s.date >= firstAskable(c)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name < b.name ? -1 : 1));

export function previewChallenge(c: Career, targetId: string, showId: string): Preview {
  const promo = myPromo(c);
  const show = c.shows[showId];
  const them = findWrestler(targetId);
  const mine = me(c);
  const region = show?.region ?? promoRegion(promo ?? 'VWF');
  const gap = them ? regionalPop(them, region) - regionalPop(mine, region) : 0;
  const feud = them ? inFeud(c, them.id) : undefined;
  const champ = them ? holdsTitle(them.id) : false;
  const hard = !promo ? 'You’re not signed anywhere: challenge someone on an indie show.'
    : !them || them.id === c.player ? 'Pick someone to challenge.'
      : them.promotion !== promo ? `${them.name} isn’t on the ${promo} roster: challenge them on an indie show.`
        : !show || show.date < firstAskable(c) ? 'The next seven days’ cards are set.'
          : busyThatNight(c, show.date) ? 'You’re not free that night.'
            : patienceOf(c, promo) < PATIENCE_FLOOR ? `${promo}’s booker won’t hear it: patience too low.`
              : c.people[them.id]?.injury && c.people[them.id]!.injury!.until > (show?.date ?? c.today) ? `${them.name} is injured.` : null;
  const chance = CHALLENGE_BASE - CHALLENGE_PER_POP_ABOVE * Math.max(0, gap) + repPoints(c) + formPoints(c) + (promo ? patiencePoints(c, promo) + askLean(c, promo, 'challenge', `ch:${targetId}`) : 0)
    + (champ ? CHALLENGE_CHAMPION : 0) + (feud ? CHALLENGE_IN_FEUD : 0);
  const nightLine = [champ ? 'champion' : 'not a champion', feud ? `in a feud with ${findWrestler(feud.a === targetId ? feud.b : feud.a)?.name}` : 'no feud'].join(' · ');
  return {
    hard, chance, nag: cooldownLeft(c, 'challenge', COOLDOWN_CHALLENGE),
    stand: [['Popularity', them ? `You ${Math.round(regionalPop(mine, region))} · ${them.name.split(' ')[0]} ${Math.round(regionalPop(them, region))}` : '—'], ['Reputation', `${Math.round(person(c, c.player).rep)}`],
      ['Form', formLine(c)], ['Their night', nightLine]],
    weigh: [{ t: gap > 0 ? `${Math.round(gap)} above you` : 'Not above you', s: gap > 0 ? -1 : 1 }, { t: `Reputation ${Math.round(person(c, c.player).rep)}`, s: Math.sign(repPoints(c)) },
      { t: `Form ${formLine(c)}`, s: Math.sign(formPoints(c)) }, { t: champ ? 'A champion' : feud ? 'In a feud' : 'Free that night', s: champ || feud ? -1 : 1 },
      { t: `Patience ${Math.round(promo ? patienceOf(c, promo) : PATIENCE_START)}`, s: Math.sign(promo ? patiencePoints(c, promo) : 0) }],
  };
}

/** The closest in standing to someone, on a roster, who's free that night. */
function stand_in(c: Career, them: Wrestler, roster: Wrestler[], show: Show, not: string[]): Wrestler | undefined {
  const region = show.region;
  return roster.filter((w) => !not.includes(w.id) && w.gender === them.gender && !holdsTitle(w.id) && !inFeud(c, w.id) && available(c.people[w.id], show.date))
    .sort((a, b) => Math.abs(regionalPop(a, region) - regionalPop(them, region)) - Math.abs(regionalPop(b, region) - regionalPop(them, region)))[0];
}

export function askChallenge(c: Career, targetId: string, showId: string): Ask {
  const promo = myPromo(c) ?? 'TIS';
  const them = findWrestler(targetId)!;
  const show = c.shows[showId]!;
  const what = `Challenge ${them.name}`;
  const pv = previewChallenge(c, targetId, showId);
  if (pv.hard) return record(c, { kind: 'challenge', to: promo, what, key: 'challenge', answer: 'no', said: pv.hard });
  const chance = nag(c, 'challenge', COOLDOWN_CHALLENGE, promo) ? previewChallenge(c, targetId, showId).chance : pv.chance;
  const r = outcome(chance, roll(c, `challenge:${targetId}:${showId}`));
  if (r === 'yes') {
    const a = record(c, { kind: 'challenge', to: promo, what, key: 'challenge', answer: 'yes', said: `“You’re on. ${them.name}, ${showLine(show)}.”` });
    pledge(c, { promo, kind: 'match', opp: them.id, show: show.id, ask: a.id });
    return a;
  }
  if (r === 'counter') {
    const feud = inFeud(c, them.id);
    const payoff = feud?.payoff ? c.shows[feud.payoff] : undefined;
    if (feud && payoff) return record(c, { kind: 'challenge', to: promo, what, key: 'challenge', answer: 'counter',
      said: `“${them.name}’s busy with ${findWrestler(feud.a === them.id ? feud.b : feud.a)?.name} until ${showLine(payoff)}. You can have him after that.”`,
      counter: { kind: 'feud', pledge: { promo, kind: 'match', opp: them.id, from: addDays(payoff.date, 1) } } });
    const promised = c.pledges?.some((p) => p.kind === 'match' && p.opp === them.id && p.show && c.shows[p.show]?.date === show.date);
    if (promised) {
      const next = promoShows(c, promo, addDays(show.date, 1))[0];
      if (next) return record(c, { kind: 'challenge', to: promo, what, key: 'challenge', answer: 'counter', said: `“He’s booked that night. ${showLine(next)} instead?”`,
        counter: { kind: 'show', pledge: { promo, kind: 'match', opp: them.id, show: next.id } } });
    }
    const alt = stand_in(c, me(c), WRESTLERS.filter((w) => w.promotion === promo), show, [c.player, them.id]);
    if (alt) return record(c, { kind: 'challenge', to: promo, what, key: 'challenge', answer: 'counter',
      said: `“Not ${them.name.split(' ').slice(-1)[0]}. ${alt.name} on ${showLine(show)}: the closest to your standing who’s free that night.”`,
      counter: { kind: 'opponent', pledge: { promo, kind: 'match', opp: alt.id, show: show.id } } });
  }
  return record(c, { kind: 'challenge', to: promo, what, key: 'challenge', answer: 'no', said: '“Not that one.”' });
}

/** Challenges on indie shows: the promoter gives you a spot, and the other side has to agree. */
export function previewIndieChallenge(c: Career, targetId: string, showId: string): Preview {
  const show = c.shows[showId];
  const them = findWrestler(targetId);
  const mine = me(c);
  const allowed = show ? indieAllowed(c, show.date) : { ok: false, why: '' };
  const gap = them ? them.popularity.global - mine.popularity.global : 0;
  const k = them ? c.people[them.id]?.contract : null;
  const theirClash = !!k && !!show && Object.values(c.shows).some((s) => s.date === show.date && (s.promos ?? [s.promo]).includes(k.promo) && s.promo !== 'TIS');
  const clauseOk = !k || ((k.clauses[C.indie] ?? 0) >= 1 && (!theirClash || (k.clauses[C.indie] ?? 0) >= 3));
  const side = clauseOk ? INDIE_CH_ALLOWED - CHALLENGE_PER_POP_ABOVE * Math.max(0, gap) + repPoints(c)
    : INDIE_CH_PROMOTION - CHALLENGE_PER_POP_ABOVE * Math.max(0, gap) + repPoints(c) + patiencePoints(c, k!.promo);
  const promoter = show ? showBooker(show) : '';
  const hard = !them || them.id === c.player ? 'Pick someone to challenge.'
    : !show || show.date < firstAskable(c) ? 'The next seven days’ cards are set.'
      : !allowed.ok ? allowed.why ?? 'You can’t take that date.'
        : c.asked?.[show.id] ? `${show.name} already gave you an answer.`
          : patienceOf(c, promoter) < PATIENCE_FLOOR ? `${show.name}’s promoter won’t hear it: patience too low.`
            : c.people[them.id]?.injury && c.people[them.id]!.injury!.until > show.date ? `${them.name} is injured.` : null;
  return {
    hard, chance: side, nag: cooldownLeft(c, 'challenge', COOLDOWN_CHALLENGE),
    stand: [['Popularity', them ? `You ${Math.round(mine.popularity.global)} · ${them.name.split(' ')[0]} ${Math.round(them.popularity.global)} (global)` : '—'], ['Reputation', `${Math.round(person(c, c.player).rep)}`],
      ['Their deal', !k ? 'Indie Scene' : clauseOk ? `${k.promo}: indie dates allowed` : `${k.promo}: their promotion decides`]],
    weigh: [{ t: gap > 0 ? `${Math.round(gap)} above you` : 'Not above you', s: gap > 0 ? -1 : 1 }, { t: `Reputation ${Math.round(person(c, c.player).rep)}`, s: Math.sign(repPoints(c)) },
      { t: clauseOk ? 'Their deal allows it' : `${k?.promo} decides`, s: clauseOk ? 1 : -1 }, { t: `Promoter patience ${Math.round(patienceOf(c, promoter))}`, s: Math.sign(patiencePoints(c, promoter)) }],
  };
}

export function askIndieChallenge(c: Career, targetId: string, showId: string): Ask {
  const show = c.shows[showId]!;
  const them = findWrestler(targetId)!;
  const promoter = showBooker(show);
  const what = `Challenge ${them.name} on ${show.name}`;
  const pv = previewIndieChallenge(c, targetId, showId);
  if (pv.hard) return record(c, { kind: 'indieChallenge', to: promoter, what, key: 'challenge', answer: 'no', said: pv.hard });
  const nagged = nag(c, 'challenge', COOLDOWN_CHALLENGE, promoter);
  (c.asked ??= {})[show.id] = true;
  const mine = me(c);
  const spot = Math.min(ASK_SPOT_MAX_PCT, ASK_SPOT_BASE_PCT + mine.popularity.global) + patiencePoints(c, promoter) + trustPoints(c, promoter);
  if (roll(c, `spot:${show.id}`) >= spot) return record(c, { kind: 'indieChallenge', to: promoter, what, key: 'challenge', answer: 'no', said: '“We’re full. Maybe next time.”' });
  const side = nagged ? previewIndieChallenge(c, targetId, showId).chance : pv.chance;
  const r = outcome(side, roll(c, `indie-ch:${targetId}:${showId}`));
  const fee = indieFee(mine, show.region), travel = travelCost(mine.country, show.country);
  const terms = { fee, travel };
  if (r === 'yes') {
    const a = record(c, { kind: 'indieChallenge', to: promoter, what, key: 'challenge', answer: 'yes', said: `“${them.name}’s up for it. ${showLine(show)}: £${fee.toLocaleString('en-GB')}${travel ? `, travel £${travel}` : ''}.”` });
    joinIndie(c, show, terms.fee, terms.travel);
    pledge(c, { promo: 'TIS', kind: 'match', opp: them.id, show: show.id, ask: a.id });
    return a;
  }
  if (r === 'counter') {
    const alt = stand_in(c, mine, WRESTLERS.filter((w) => w.promotion === 'TIS' && w.id !== them.id), show, [c.player, them.id]);
    if (alt) return record(c, { kind: 'indieChallenge', to: promoter, what, key: 'challenge', answer: 'counter',
      said: `“${them.name}’s not coming. ${alt.name} is, if you want them: ${showLine(show)}.”`,
      counter: { kind: 'opponent', pledge: { promo: 'TIS', kind: 'match', opp: alt.id, show: show.id } } });
  }
  return record(c, { kind: 'indieChallenge', to: promoter, what, key: 'challenge', answer: 'no', said: `“${them.name}’s side said no.”` });
}

// ------------------------------------------------------------------ bookings

export function previewShow(c: Career, showId: string): Preview {
  const promo = myPromo(c);
  const show = c.shows[showId];
  const mine = me(c);
  const usual = show ? bookChance(mine, show, WRESTLERS) * 100 : 0;
  const big = show?.kind === 'special' ? SHOW_ASK_SPECIAL : show?.kind === 'flagship' ? SHOW_ASK_FLAGSHIP : 0;
  const hard = !promo ? 'You’re not signed anywhere.'
    : !show || show.date < firstAskable(c) ? 'The next seven days’ cards are set.'
      : !playerBookable(c, show) || busyThatNight(c, show.date) ? 'You’re not free that night.'
        : c.asks?.some((a) => a.key === `show:${showId}`) ? `You’ve already asked about ${show.name}.`
          : c.pledges?.some((p) => p.show === showId) ? 'You’re already promised that one.'
            : patienceOf(c, promo) < PATIENCE_FLOOR ? `${promo}’s booker won’t hear it: patience too low.` : null;
  return {
    hard, chance: usual + SHOW_ASK_BONUS + big + repPoints(c) + (promo ? patiencePoints(c, promo) : 0), nag: 0,
    stand: [['Usual chance', `${Math.round(usual)}%`], ['Reputation', `${Math.round(person(c, c.player).rep)}`]],
    weigh: [{ t: 'Your usual chance on this show', s: usual >= 70 ? 1 : 0 }, ...(big ? [{ t: 'Big show: harder', s: -1 }] : []),
      { t: `Reputation ${Math.round(person(c, c.player).rep)}`, s: Math.sign(repPoints(c)) }, { t: `Patience ${Math.round(promo ? patienceOf(c, promo) : PATIENCE_START)}`, s: Math.sign(promo ? patiencePoints(c, promo) : 0) }],
  };
}

export function askShow(c: Career, showId: string): Ask {
  const promo = myPromo(c) ?? 'TIS';
  const show = c.shows[showId]!;
  const what = `Be on ${show.name} (${fmtDay(show.date, 'dm')})`;
  const key = `show:${showId}`;
  const pv = previewShow(c, showId);
  if (pv.hard) return record(c, { kind: 'show', to: promo, what, key, answer: 'no', said: pv.hard });
  const r = outcome(pv.chance, roll(c, key));
  if (r === 'yes') {
    const a = record(c, { kind: 'show', to: promo, what, key, answer: 'yes', said: '“You’re on.”' });
    pledge(c, { promo, kind: 'show', show: show.id, ask: a.id });
    return a;
  }
  if (r === 'counter') {
    const near = promoShows(c, promo, firstAskable(c)).filter((s) => s.id !== showId && s.kind !== 'special' && s.kind !== 'flagship' && playerBookable(c, s) && !busyThatNight(c, s.date))
      .sort((a, b) => Math.abs(daysBetween(a.date, show.date)) - Math.abs(daysBetween(b.date, show.date)))[0];
    if (near) return record(c, { kind: 'show', to: promo, what, key, answer: 'counter', said: `“Not that one. ${showLine(near)}?”`,
      counter: { kind: 'show', pledge: { promo, kind: 'show', show: near.id } } });
  }
  return record(c, { kind: 'show', to: promo, what, key, answer: 'no', said: '“The card’s spoken for.”' });
}

const nextMonth = (c: Career): string => { const d = new Date(`${c.today}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1, 1); return d.toISOString().slice(0, 7); };
const monthName = (m: string): string => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m.slice(5, 7)) - 1]!;

export function previewMore(c: Career): Preview {
  const promo = myPromo(c);
  const last28 = c.history.filter((m) => !m.indie && daysBetween(m.day, c.today) <= 28).length;
  const hard = !promo ? 'You’re not signed anywhere.'
    : c.pledges?.some((p) => p.kind === 'dates' && p.month === nextMonth(c)) ? `You’ve already got ${MORE_MIN_DATES} dates promised in ${monthName(nextMonth(c))}.`
      : patienceOf(c, promo) < PATIENCE_FLOOR ? `${promo}’s booker won’t hear it: patience too low.` : null;
  return {
    hard, chance: MORE_BASE + repPoints(c) + formPoints(c) + (promo ? patiencePoints(c, promo) : 0), nag: cooldownLeft(c, 'more', COOLDOWN_MORE),
    stand: [['Last 28 days', `${last28} dates`], ['Reputation', `${Math.round(person(c, c.player).rep)}`], ['Form', formLine(c)],
      ['A yes means', `At least ${MORE_MIN_DATES} dates in ${monthName(nextMonth(c))}`], ['If they fall short', 'They pay your fee for each missing date']],
    weigh: [{ t: `Reputation ${Math.round(person(c, c.player).rep)}`, s: Math.sign(repPoints(c)) }, { t: `Form ${formLine(c)}`, s: Math.sign(formPoints(c)) },
      { t: `Patience ${Math.round(promo ? patienceOf(c, promo) : PATIENCE_START)}`, s: Math.sign(promo ? patiencePoints(c, promo) : 0) }],
  };
}

export function askMore(c: Career): Ask {
  const promo = myPromo(c) ?? 'TIS';
  const month = nextMonth(c);
  const what = `More matches in ${monthName(month)}`;
  const pv = previewMore(c);
  if (pv.hard) return record(c, { kind: 'more', to: promo, what, key: 'more', answer: 'no', said: pv.hard });
  const chance = nag(c, 'more', COOLDOWN_MORE, promo) ? previewMore(c).chance : pv.chance;
  if (outcome(chance, roll(c, `more:${month}`)) === 'yes') {
    const a = record(c, { kind: 'more', to: promo, what, key: 'more', answer: 'yes', said: `“You’ll get at least ${MORE_MIN_DATES} dates in ${monthName(month)}.”` });
    pledge(c, { promo, kind: 'dates', month, min: MORE_MIN_DATES, ask: a.id });
    return a;
  }
  return record(c, { kind: 'more', to: promo, what, key: 'more', answer: 'no', said: '“We’ve got the dates covered.”' });
}

// ------------------------------------------------------------------ other promotions

export interface Standing { mine: number; q1: number; median: number; roster: number; region: string }
export function standingWith(c: Career, promo: string): Standing {
  const region = promoRegion(promo);
  const pops = WRESTLERS.filter((w) => w.promotion === promo).map((w) => regionalPop(w, region)).sort((a, b) => a - b);
  return { mine: regionalPop(me(c), region), q1: pops[Math.floor(pops.length / 4)] ?? 0, median: pops[Math.floor(pops.length / 2)] ?? 0, roster: pops.length, region };
}
export const otherPromotions = (c: Career): string[] => PROMOTIONS.filter((p) => !p.indie && p.initials !== myPromo(c)).map((p) => p.initials);

/** The chance your own promotion hears you've been talking to another. */
export function caughtChance(c: Career, promo: string): number {
  const mine = myPromo(c);
  if (!mine) return 0;
  return promoRegion(promo) === promoRegion(mine) ? CAUGHT_CHANCE_SAME_REGION : CAUGHT_CHANCE;
}

export function maybeCaught(c: Career, promo: string): boolean {
  const mine = myPromo(c);
  if (!mine) return false;
  if (seededRng(hashSeed(c.seed, 'caught', promo, c.today))() >= caughtChance(c, promo)) return false;
  c.heat = { promo: mine, until: addDays(c.today, CAUGHT_DAYS) };
  movePatience(c, mine, PATIENCE_CAUGHT * (playerHas(c, 'loyal') ? TRAIT_BACKSTAGE.loyal.caught : 1), `Heard you’d been talking to ${promo}`);
  letter(c, { kind: 'contract', from: promoName(mine), subject: `We hear you’ve been talking to ${promo}`,
    body: [`Word gets around. For the next ${CAUGHT_DAYS} days you’ll get fewer dates, and you’ll be lower on the card.`] });
  return true;
}

function tryoutShow(c: Career, promo: string): Show | undefined {
  return promoShows(c, promo, firstAskable(c)).find((s) => (s.kind === 'weekly' || s.kind === 'tour' || s.kind === 'special') && s.promo === promo);
}

export function askApproach(c: Career, promo: string): Ask {
  const what = `Approach ${promoName(promo)}`;
  const key = `promo:${promo}`;
  if (patienceOf(c, promo) < PATIENCE_FLOOR) return record(c, { kind: 'approach', to: promo, what, key, answer: 'no', said: '“We’ve heard enough from you for now.”' });
  if (c.offers.some((o) => o.promo === promo && o.status === 'open')) return record(c, { kind: 'approach', to: promo, what, key, answer: 'no', said: '“You’ve already got an offer from us.”' });
  nag(c, key, COOLDOWN_PROMOTION, promo);
  const caught = maybeCaught(c, promo);
  const st = standingWith(c, promo);
  const then = caught ? `${myPromo(c)} heard about it.` : myPromo(c) ? `${myPromo(c)} didn’t hear about it.` : undefined;
  if (st.mine >= st.median) {
    makeOffer(c, promo, 'You got in touch');
    const o = c.offers.find((x) => x.promo === promo && x.status === 'open');
    return record(c, { kind: 'approach', to: promo, what, key, answer: 'yes', said: `“We’d have you.”${o ? ` £${o.fee.toLocaleString('en-GB')} a match, ${o.months} months, from ${fmtDay(o.start, 'dm')}${o.start.slice(0, 4) !== c.today.slice(0, 4) ? ` ${o.start.slice(0, 4)}` : ''}. It’s in your mail.` : ''}`, then });
  }
  const show = st.mine >= st.q1 ? tryoutShow(c, promo) : undefined;
  if (show) return record(c, { kind: 'approach', to: promo, what, key, answer: 'counter', said: `“Not a contract yet. Come and have a tryout: ${showLine(show)}.”`, then,
    counter: { kind: 'tryout', tryout: { show: show.id, promo } } });
  return record(c, { kind: 'approach', to: promo, what, key, answer: 'no', said: '“Not yet. We’ll keep an eye on you.”', then });
}

export function askTryout(c: Career, promo: string): Ask {
  const what = `Tryout with ${promoName(promo)}`;
  const key = `promo:${promo}`;
  if (patienceOf(c, promo) < PATIENCE_FLOOR) return record(c, { kind: 'tryout', to: promo, what, key, answer: 'no', said: '“We’ve heard enough from you for now.”' });
  nag(c, key, COOLDOWN_PROMOTION, promo);
  const caught = maybeCaught(c, promo);
  const then = caught ? `${myPromo(c)} heard about it.` : myPromo(c) ? `${myPromo(c)} didn’t hear about it.` : undefined;
  const st = standingWith(c, promo);
  if (st.mine >= st.median) {
    makeOffer(c, promo, 'You asked for a tryout; you don’t need one');
    return record(c, { kind: 'tryout', to: promo, what, key, answer: 'yes', said: '“You don’t need a tryout. We’ll make you an offer: it’s in your mail.”', then });
  }
  const show = st.mine >= st.q1 ? tryoutShow(c, promo) : undefined;
  if (!show) return record(c, { kind: 'tryout', to: promo, what, key, answer: 'no', said: '“Not yet. We’ll keep an eye on you.”', then });
  const ok = !myPromo(c) || indieAllowed(c, show.date).ok;
  if (!ok) return record(c, { kind: 'tryout', to: promo, what, key, answer: 'no', said: `“Come in for ${showLine(show)}.”`, then: `You couldn’t take the date: your ${myPromo(c)} deal doesn’t allow it.` });
  c.tryouts[show.id] = promo;
  return record(c, { kind: 'tryout', to: promo, what, key, answer: 'yes', said: `“Come in for ${showLine(show)}. Win, or put on a good match, and we’ll talk.”`, then });
}

// ------------------------------------------------------------------ indie spots

export function previewSpot(c: Career, showId: string): Preview {
  const show = c.shows[showId];
  const promoter = show ? showBooker(show) : '';
  const allowed = show ? indieAllowed(c, show.date) : { ok: false, why: '' };
  const hard = !show || show.date < firstAskable(c) ? 'The next seven days’ cards are set.'
    : !allowed.ok ? allowed.why ?? 'You can’t take that date.'
      : c.indie[showId] ? 'You’re already on it.'
        : c.asked?.[showId] ? `${show.name} already gave you an answer.`
          : patienceOf(c, promoter) < PATIENCE_FLOOR ? `${show.name}’s promoter won’t hear it: patience too low.` : null;
  const base = Math.min(ASK_SPOT_MAX_PCT, ASK_SPOT_BASE_PCT + me(c).popularity.global);
  return {
    hard, chance: base + patiencePoints(c, promoter) + trustPoints(c, promoter), nag: 0,
    stand: [['Popularity', `${Math.round(me(c).popularity.global)} (global)`], ['Fee', show ? `£${indieFee(me(c), show.region).toLocaleString('en-GB')}` : '—'], ['Travel', show ? (travelCost(me(c).country, show.country) ? `£${travelCost(me(c).country, show.country)}` : 'None') : '—']],
    weigh: [{ t: `Popularity ${Math.round(me(c).popularity.global)}`, s: 1 }, { t: `Promoter patience ${Math.round(patienceOf(c, promoter))}`, s: Math.sign(patiencePoints(c, promoter)) },
      { t: trustLabel(trust(c, promoter)), s: Math.sign(trustPoints(c, promoter)) }],
  };
}

export function askSpot(c: Career, showId: string): Ask {
  const show = c.shows[showId]!;
  const promoter = showBooker(show);
  const what = `A spot on ${show.name} (${fmtDay(show.date, 'dm')})`;
  const pv = previewSpot(c, showId);
  if (pv.hard) return record(c, { kind: 'spot', to: promoter, what, key: `spot:${showId}`, answer: 'no', said: pv.hard });
  const ok = indieAllowed(c, show.date);
  if (ok.needsApproval && seededRng(hashSeed(c.seed, 'approve', show.id))() >= INDIE_T1_APPROVAL) {
    return record(c, { kind: 'spot', to: promoter, what, key: `spot:${showId}`, answer: 'no', said: `${myPromo(c)} said no to this one.` });
  }
  (c.asked ??= {})[show.id] = true;
  if (roll(c, `spot:${show.id}`) >= pv.chance) return record(c, { kind: 'spot', to: promoter, what, key: `spot:${showId}`, answer: 'no', said: '“We’re full. Maybe next time.”' });
  const fee = indieFee(me(c), show.region), travel = travelCost(me(c).country, show.country);
  joinIndie(c, show, fee, travel);
  return record(c, { kind: 'spot', to: promoter, what, key: `spot:${showId}`, answer: 'yes', said: `“You’re on: £${fee.toLocaleString('en-GB')}${travel ? `, travel £${travel}` : ''}.”` });
}

// ------------------------------------------------------------------ the ones moved here from other screens

export function askReview(c: Career): Ask {
  const k = person(c, c.player).contract;
  const before = k?.fee ?? 0;
  const said = payReview(c);
  return record(c, { kind: 'review', to: k?.promo ?? 'TIS', what: 'Pay review', key: 'review', answer: (k?.fee ?? 0) > before ? 'yes' : 'no', said });
}

export function askRival(c: Career, offerId: string): Ask {
  const k = person(c, c.player).contract;
  const o = c.offers.find((x) => x.id === offerId);
  const said = matchRival(c, offerId);
  return record(c, { kind: 'rival', to: k?.promo ?? 'TIS', what: `Match ${o?.promo ?? 'a rival'}’s offer`, key: 'rival', answer: o?.status === 'declined' ? 'yes' : 'no', said });
}

export function askRelease(c: Career): Ask {
  const k = person(c, c.player).contract;
  const promo = k?.promo ?? 'TIS';
  if (k && (k.clauses[C.exit] ?? 0) === 0 && patienceOf(c, promo) < PATIENCE_FLOOR) return record(c, { kind: 'release', to: promo, what: 'Release', key: 'release', answer: 'no', said: `${promo}’s booker won’t hear it: patience too low.` });
  const said = leaveContract(c);
  const p = person(c, c.player);
  return record(c, { kind: 'release', to: promo, what: 'Release', key: 'release', answer: !p.contract || !!p.contract.leaving ? 'yes' : 'no', said });
}

export function askDayOff(c: Career, day: Day): Ask {
  const k = person(c, c.player).contract;
  const before = person(c, c.player).daysOff?.length ?? 0;
  const said = dayOff(c, day);
  return record(c, { kind: 'dayoff', to: k?.promo ?? 'TIS', what: `Day off: ${fmtDay(day, 'dm')}`, key: `dayoff:${day}`, answer: (person(c, c.player).daysOff?.length ?? 0) > before ? 'yes' : 'no', said });
}

/** Creative Control: tonight's planned finish goes against you, and your clause lets you push back. */
export function finishAskable(c: Career): { ok: boolean; why: string; label: string } {
  const p = person(c, c.player);
  const creative = p.contract?.clauses[C.creative] ?? 0;
  const mine = myBoutToday(c);
  const bout = mine?.bout;
  if (!creative) return { ok: false, why: 'Needs Creative Control', label: 'Change tonight’s finish' };
  if (!bout?.planned) return { ok: false, why: 'No planned finish tonight', label: 'Change tonight’s finish' };
  if (bout.planned === c.player) return { ok: false, why: 'You’re already booked to win', label: 'Change tonight’s finish' };
  if (p.creativeAsked?.includes(mine!.show.id)) return { ok: false, why: 'Already asked tonight', label: 'Change tonight’s finish' };
  const lastUse = p.creativeUsed ? daysBetween(p.creativeUsed, c.today) : 999;
  if (creative === 2 && lastUse < CREATIVE_T2_COOLDOWN_DAYS) return { ok: false, why: `Protected Booking: again from ${fmtDay(addDays(p.creativeUsed!, CREATIVE_T2_COOLDOWN_DAYS), 'dm')}`, label: 'Refuse this finish' };
  return { ok: true, why: '', label: creative >= 3 ? 'Veto tonight’s finish' : creative === 2 ? 'Refuse tonight’s finish' : 'Ask for the other finish' };
}

export function askFinish(c: Career): Ask {
  const p = person(c, c.player);
  const promo = p.contract?.promo ?? 'TIS';
  const can = finishAskable(c);
  if (!can.ok) return record(c, { kind: 'finish', to: promo, what: 'Tonight’s finish', key: 'finish', answer: 'no', said: can.why });
  const mine = myBoutToday(c)!;
  const creative = p.contract!.clauses[C.creative] ?? 0;
  (p.creativeAsked ??= []).push(mine.show.id);
  const granted = creative >= 2 || seededRng(hashSeed(c.seed, 'creative', mine.show.id))() < CREATIVE_T1_CHANGE;
  if (!granted) return record(c, { kind: 'finish', to: promo, what: 'Tonight’s finish', key: 'finish', answer: 'no', said: 'They heard you out. The finish stands.' });
  mine.bout.planned = c.player;
  if (creative === 2) p.creativeUsed = c.today;
  return record(c, { kind: 'finish', to: promo, what: 'Tonight’s finish', key: 'finish', answer: 'yes',
    said: creative >= 3 ? 'Vetoed. You’re booked to win.' : creative === 2 ? 'Refused. They’ve changed it: you win.' : 'They listened. You’re going over.' });
}

// ------------------------------------------------------------------ counters

/** Take or turn down a counter. Taking it gives patience back; turning it down costs some. */
export function answerCounter(c: Career, askId: string, accept: boolean): string {
  const a = c.asks?.find((x) => x.id === askId);
  if (!a || a.status !== 'open' || !a.counter) return 'That’s been dealt with.';
  a.status = 'closed';
  if (!accept) {
    leanFrom(c, 'declined_counter');
    movePatience(c, a.to, PATIENCE_DECLINE_COUNTER, `Turned down their counter (${a.what})`);
    a.then = `You turned it down: ${bookerName(a.to)} patience ${PATIENCE_DECLINE_COUNTER}.`;
    return 'Turned down.';
  }
  const k = a.counter;
  if (k.tryout) {
    const show = c.shows[k.tryout.show];
    if (!show || show.date < firstAskable(c)) { a.then = 'It lapsed: the card’s been drawn.'; return a.then; }
    if (myPromo(c) && !indieAllowed(c, show.date).ok) { a.then = `It lapsed: your ${myPromo(c)} deal has no room for the date.`; return a.then; }
    c.tryouts[show.id] = k.tryout.promo;
  }
  if (k.pledge) {
    const show = k.pledge.show ? c.shows[k.pledge.show] : undefined;
    if (show && show.date < firstAskable(c)) { a.then = 'It lapsed: the card’s been drawn.'; return a.then; }
    if (show && show.promo === 'TIS' && !c.indie[show.id]) joinIndie(c, show, indieFee(me(c), show.region), travelCost(me(c).country, show.country));
    pledge(c, { ...k.pledge, ask: a.id });
  }
  leanFrom(c, 'took_counter');
  movePatience(c, a.to, PATIENCE_TOOK_COUNTER + (playerHas(c, 'team_player') ? TRAIT_BACKSTAGE.team_player.tookCounter : 0), `Took their counter (${a.what})`);
  a.then = k.kind === 'tryout' ? 'You took the tryout.' : 'You took it.';
  return 'Done. It’s booked.';
}

export const countersWaiting = (c: Career): Ask[] => (c.asks ?? []).filter((a) => a.status === 'open');
export const counterLabel = (k: CounterKind): string => ({ show: 'A different show', opponent: 'A different opponent', earn: 'Earn it first', feud: 'Wait for the feud', tryout: 'A tryout' })[k];

// ------------------------------------------------------------------ the daily and monthly round

function daily(c: Career): void {
  if (weekday(c.today) === 1) patienceWeek(c);
  // Counters you never answered lapse once their show's card is drawn.
  for (const a of c.asks ?? []) {
    if (a.status !== 'open' || !a.counter) continue;
    const showId = a.counter.pledge?.show ?? a.counter.tryout?.show;
    if (showId && (c.shows[showId]?.date ?? '') < firstAskable(c)) { a.status = 'closed'; a.then = 'It lapsed: you didn’t answer before the card was drawn.'; }
  }
  if (c.heat && c.heat.until <= c.today) delete c.heat;
}

/** The 1st: a promise of dates that fell short pays your weekly fee for each one missing. */
function monthly(c: Career): void {
  // Runs the night before the 1st: every promised month before tomorrow's is over.
  const now = addDays(c.today, 1).slice(0, 7);
  for (const p of (c.pledges ?? []).filter((x) => x.kind === 'dates' && x.month! < now)) {
    c.pledges = c.pledges!.filter((x) => x !== p);
    const day = `${p.month}-15`;
    const got = datesThisMonth(c, c.player, day);
    const shows = Object.values(c.shows).filter((s) => s.date.startsWith(p.month!) && (s.promos ?? [s.promo]).includes(p.promo) && s.promo !== 'TIS').length;
    const short = Math.max(0, Math.min(p.min ?? 0, shows) - got);
    const a = c.asks?.find((x) => x.id === p.ask);
    const fee = person(c, c.player).contract?.fee ?? 0;
    if (short && fee) {
      spend(c, short * fee, `${p.promo} fell short of the dates they promised (${short})`, 'bonus');
      letter(c, { kind: 'contract', from: promoName(p.promo), subject: 'We owe you some dates', body: [`We promised you ${p.min} dates in ${monthName(p.month!)} and gave you ${got}. That’s £${(short * fee).toLocaleString('en-GB')} for the ones we missed.`] });
      if (a) a.then = `${got} of ${p.min} dates: they paid £${(short * fee).toLocaleString('en-GB')} for the rest.`;
    } else if (a) a.then = `${got} dates in ${monthName(p.month!)}.`;
  }
}

/** After your match: their patience moves, and an "earn it first" match pays off (or doesn't). */
function afterMine(c: Career, show: Show, bout: Bout, m: PlayerMatch): void {
  const key = showBooker(show);
  if (m.planned === 'off-script') movePatience(c, key, PATIENCE_OFF_SCRIPT, `Went off-script on ${show.name}`);
  else if (m.planned === 'botched') movePatience(c, key, PATIENCE_BOTCHED, `Didn’t deliver the planned finish on ${show.name}`);
  else if (m.planned === 'kept' && bout.title) movePatience(c, key, PATIENCE_FOLLOWED_PLAN * (playerHas(c, 'professional') ? TRAIT_BACKSTAGE.professional.followedPlan : 1), `Followed the plan on ${show.name}`);
  // Reliable: every few dates worked, the booker notices you always turn up.
  if (playerHas(c, 'reliable') && c.history.length % TRAIT_BACKSTAGE.reliable.datesPerPatience === 0) movePatience(c, key, 1, 'Always turns up');
  if (m.stars >= PATIENCE_GOOD_MATCH_STARS) movePatience(c, key, PATIENCE_GOOD_MATCH, `${m.stars}★ on ${show.name}`);
  if (bout.earn) {
    const t = TITLES.find((x) => x.id === bout.earn);
    const a = c.asks?.find((x) => x.counter?.kind === 'earn' && x.counter.pledge?.earn === bout.earn && x.counter.pledge?.opp === (bout.a === c.player ? bout.b : bout.a));
    if (m.result === 'win' && t && show.promo === 'TIS') {
      const later = indieTitleShow(c, t, addDays(show.date, 1), show);
      if (later) {
        const mine = me(c);
        joinIndie(c, later, indieFee(mine, later.region), travelCost(mine.country, later.country));
        pledge(c, { promo: 'TIS', kind: 'title', title: t.id, show: later.id, ...(a ? { ask: a.id } : {}) });
        letter(c, { kind: 'news', from: show.name, subject: `You’ve earned your ${t.name} shot`, body: [`You beat ${m.oppName}. Your shot: ${showLine(later)} in ${later.city}, ${later.country}.`] });
        if (a) a.then = `You beat ${m.oppName}: your shot is on ${showLine(later)}.`;
      } else if (a) a.then = `You beat ${m.oppName}, but there’s no indie show to put the title on yet.`;
    } else if (m.result === 'win' && t) {
      pledge(c, { promo: show.promo, kind: 'title', title: t.id, from: addDays(show.date, 1), ...(a ? { ask: a.id } : {}) });
      letter(c, { kind: 'contract', from: promoName(show.promo), subject: `You’ve earned your ${t.name} shot`, body: [`You beat ${m.oppName}. The shot’s yours: we’ll book it as soon as the title’s free.`] });
      if (a) a.then = `You beat ${m.oppName}: the shot’s booked when the title’s free.`;
    } else if (a) a.then = `You didn’t beat ${m.oppName}: no shot this time.`;
  }
}

setCareerHooks({ daily, monthly, mine: afterMine });

export const ASK_KINDS: AskKind[] = ['title', 'challenge', 'indieChallenge', 'show', 'more', 'approach', 'tryout', 'spot', 'review', 'rival', 'release', 'dayoff', 'finish'];
export { PATIENCE_FLOOR, PATIENCE_START };

/** Lyra's call: an indie promise that can't happen on the night rolls on to that promoter's next show (same brand),
 * booking you on it, up to INDIE_PROMISE_ROLLS times. */
function rollIndiePromise(c: Career, p: Pledge, show: Show): boolean {
  if ((p.rolls ?? 0) >= INDIE_PROMISE_ROLLS + promiseRollsBonus(showBooker(show))) return false;
  const next = Object.values(c.shows).filter((s) => s.promo === 'TIS' && (show.brand ? s.brand === show.brand : s.name === show.name) && s.date > show.date && !s.card && !s.done)
    .sort((a, b) => (a.date < b.date ? -1 : 1)).find((s) => indieAllowed(c, s.date).ok);
  if (!next) return false;
  const mine = me(c);
  joinIndie(c, next, c.indie[show.id]?.fee ?? indieFee(mine, next.region), travelCost(mine.country, next.country));
  p.show = next.id;
  p.rolls = (p.rolls ?? 0) + 1;
  const a = c.asks?.find((x) => x.id === p.ask);
  if (a) a.then = `Moved to ${next.name}, ${fmtDay(next.date, 'dm')}.`;
  letter(c, { kind: 'news', from: show.name, subject: 'Same promise, next show', body: [`It can’t happen on ${show.name} on ${fmtDay(show.date, 'dm')}. We’ll do it at our next show instead: ${fmtDay(next.date, 'long')}, ${next.city}. You’re booked.`] });
  return true;
}
setIndieRoll(rollIndiePromise);
