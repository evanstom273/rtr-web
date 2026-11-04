// One-off shows (career expansion, stage 4): charity nights, benefits for injured wrestlers, tributes to
// retired ones, crossover showcases between two promotions, cups over three fortnightly shows, and
// farewells. They're announced weeks ahead, go on the calendar like any other show, and are booked by the
// same booker (see the special handling in bookShow). You hear about the ones in reach and can take part.
import { findWrestler, fmtFans, globalScore, PROMOTIONS, shiftFans, type Title, TITLES, type Wrestler, WRESTLERS } from '../data/rtr';
import { seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { hashSeed } from './booker';
import { letter, person, setCareerHooks, spend } from './career';
import { C } from './clauses';
import { addDays, daysBetween, fmtDay, weekStart, type Day } from './dates';
import { indieFee, travelCost } from './economy';
import { type EvCtx, type EvData, type EventDef, type FollowDef, ctxFor, fire, fx, homeRegion, join, money, registerEvents, round5 } from './events';
import { indieAllowed, joinIndie } from './offers';
import { CITIES, PROMO_COUNTRIES, REGION_KEY, REGION_LABEL, REGION_OF } from './places';
import { affinity } from './relations';
import { indieTitleShow } from './requests';
import { roundName, tourneyPairs } from './tourney';
import {
  BENEFIT_MIN_INJURY_DAYS, BENEFIT_MIN_POP, CHARITY_REP_FREE, CUP_SHOT_DAYS, CHARITY_REP_PAID, CUP_PRIZE_MULT, CUP_ROUND_GAP, CUP_WIN_POP, CUP_WIN_REP,
  INDIE_SHOWS_MAX_WEEK, INDIE_T1_APPROVAL, SPECIAL_DAILY, SPECIAL_GAP, SPECIAL_LEAD, SPECIAL_MIN_GAP, TRIBUTE_MIN_POP,
} from './tuning';
import type { Career, PopRegion, Show, SpecialKind, Tourney } from './types';

const world = (c: Career) => (c.world ??= { last: {}, seen: {} });
const pickOf = <T>(rnd: Rng, xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);
const between = (rnd: Rng, [lo, hi]: readonly [number, number]) => lo + Math.floor(rnd() * (hi - lo + 1));
const first = (name: string) => name.replace(/"[^"]*"\s*/g, '').split(' ')[0]!;

/** Somewhere to hold it: a city in that country, or in that region. */
function venue(rnd: Rng, where: { country?: string; region?: PopRegion }): { city: string; country: string; region: PopRegion } {
  const countries = where.country && CITIES[where.country] ? [where.country]
    : Object.keys(REGION_OF).filter((k) => REGION_OF[k] === where.region && CITIES[k]);
  const country = pickOf(rnd, countries.length ? countries : ['UK'])!;
  return { country, city: pickOf(rnd, CITIES[country] ?? ['London'])!, region: REGION_OF[country] ?? 'europe' };
}

function addShow(c: Career, s: Omit<Show, 'id' | 'card' | 'done'>): Show {
  const show: Show = { id: `sp${++c.seq}`, card: null, done: false, ...s };
  // An indie one-off is put on by a local brand (its promoter books it): the same country if there's one.
  if (show.promo === 'TIS' && !show.promos && !show.brand) {
    const brands = Object.values(activeWorld().people?.brands ?? {}).filter((b) => !b.closed && b.region === show.region);
    const here = brands.filter((b) => b.country === show.country);
    const pickFrom = here.length ? here : brands;
    if (pickFrom.length) show.brand = pickFrom[hashSeed(c.seed, show.id) % pickFrom.length]!.id;
  }
  c.shows[show.id] = show;
  return show;
}

const indieWeek = (c: Career, ws: Day) => Object.values(c.shows).filter((s) => s.promo === 'TIS' && !s.promos && weekStart(s.date) === ws);
/** A regular indie show in that week a one-off could take the place of: not drawn up, nobody's counting on it. */
function spareIn(c: Career, ws: Day, region: PopRegion): Show | undefined {
  return indieWeek(c, ws).filter((s) => !s.special && !s.card && !s.done && s.date > c.today && !c.indie[s.id] && !c.asked?.[s.id] && !(c.pledges ?? []).some((p) => p.show === s.id))
    .sort((a, b) => Number(b.region === region) - Number(a.region === region) || (a.date < b.date ? -1 : 1))[0];
}
const roomIn = (c: Career, ws: Day, region: PopRegion) => indieWeek(c, ws).length < INDIE_SHOWS_MAX_WEEK || !!spareIn(c, ws, region);
/** Make room in a week: if it's full, the spare regular show gives way to the one-off. */
function makeRoom(c: Career, ws: Day, region: PopRegion): void {
  if (indieWeek(c, ws).length < INDIE_SHOWS_MAX_WEEK) return;
  const spare = spareIn(c, ws, region);
  if (spare) delete c.shows[spare.id];
}

/**
 * Lyra's call: never more than INDIE_SHOWS_MAX_WEEK indie shows in a calendar week, one-offs and cups
 * included. The first date from `date` (a week later each time) where every night in `offsets` fits:
 * a full week gives up a regular show; if it can't, the one-off moves on a week.
 */
export function indieDates(c: Career, date: Day, region: PopRegion, offsets: number[] = [0]): Day[] | null {
  for (let wk = 0; wk < 12; wk++) {
    const d0 = addDays(date, wk * 7);
    const days = offsets.map((o) => addDays(d0, o));
    if (!days.every((d) => roomIn(c, weekStart(d), region))) continue;
    for (const d of days) makeRoom(c, weekStart(d), region);
    return days;
  }
  return null;
}

/** Your region, more often than not: the one-offs you'd plausibly hear about. */
function regionFor(c: Career, rnd: Rng): PopRegion {
  const me = findWrestler(c.player)!;
  if (rnd() < 0.6) return REGION_KEY[me.region] ?? 'europe';
  return pickOf(rnd, ['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'] as PopRegion[])!;
}

const near = (c: Career, region: PopRegion) => homeRegion(ctxFor(c)) === region;
const indieShut = (c: Career) => { const k = person(c, c.player).contract; return !!k && (k.clauses[C.indie] ?? 0) === 0; };
const relOf = (c: Career, id: string) => affinity(c, id);

// ------------------------------------------------------------------ invitations (event letters, fired directly)

/** Whether you can take an indie date on that show's night, and why not. */
function indieBlock(x: EvCtx, d: EvData): string | null {
  const s = x.c.shows[String(d.show)];
  if (!s || s.date <= x.day) return 'That show’s been and gone.';
  if (s.promo !== 'TIS') return null;
  const ok = indieAllowed(x.c, s.date);
  return ok.ok ? null : ok.why ?? 'You can’t make that date.';
}
/** Indie Bookings Tier 1: management has to say yes. */
function approved(x: EvCtx, d: EvData): string | null {
  const s = x.c.shows[String(d.show)];
  if (!s || s.promo !== 'TIS' || !indieAllowed(x.c, s.date).needsApproval) return null;
  return seededRng(hashSeed(x.c.seed, 'approve', s.id))() < INDIE_T1_APPROVAL ? null : `${x.k?.promo} said no to this one.`;
}
const booked = (x: EvCtx, d: EvData, fee: number) => { const s = x.c.shows[String(d.show)]!; if (s.promo === 'TIS') joinIndie(x.c, s, fee, Number(d.travel ?? 0)); return s; };
const after = (x: EvCtx, d: EvData) => Math.max(1, daysBetween(x.day, String(d.date)) + 1);

const INVITES: EventDef[] = [
  {
    id: 'invite_charity', cat: 'community', weight: 0, cooldown: 0, when: () => false,
    from: (_x, d) => `${d.name} · ${d.city}`, subject: (_x, d) => `Wrestle for ${d.cause}?`,
    body: (_x, d) => [`${d.name} is a charity show in ${d.city} on ${fmtDay(String(d.date), 'long')}, raising money for ${d.cause}. We’d love you on the card.`, 'Wrestle for free and your fee goes to the cause; or take your usual fee, no hard feelings.'],
    options: [
      { id: 'free', label: 'Wrestle for free', detail: () => 'Your fee goes to the cause · reputation after the show', blocked: indieBlock, run: (x, d) => approved(x, d) ?? (booked(x, d, 0), fx.follow(x, after(x, d), 'special_worked', { show: String(d.show), rep: CHARITY_REP_FREE, tally: 'charity' }), `You’re on ${d.name}, ${fmtDay(String(d.date), 'dm')}.`) },
      { id: 'fee', label: (_x, d) => `Wrestle for your fee (${money(Number(d.fee))})`, blocked: indieBlock, run: (x, d) => approved(x, d) ?? (booked(x, d, Number(d.fee)), fx.follow(x, after(x, d), 'special_worked', { show: String(d.show), rep: CHARITY_REP_PAID }), `You’re on ${d.name}, ${fmtDay(String(d.date), 'dm')}.`) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You couldn’t make it.' },
    ],
  },
  {
    id: 'invite_benefit', cat: 'community', weight: 0, cooldown: 0, when: () => false,
    from: (_x, d) => `Friends of ${d.whoName}`, subject: (_x, d) => `${d.name}: will you be there?`,
    body: (_x, d) => [`${d.whoName} is out for months with a ${d.what} injury. ${d.name} in ${d.city} on ${fmtDay(String(d.date), 'long')} is raising money to keep them going.`, 'Everyone’s wrestling for free. If you can’t make it, a donation would mean a lot.'],
    options: [
      { id: 'yes', label: 'Wrestle on it, no fee', detail: (_x, d) => `${first(String(d.whoName))} won’t forget it`, blocked: indieBlock, run: (x, d) => approved(x, d) ?? (booked(x, d, 0), fx.follow(x, after(x, d), 'special_worked', { show: String(d.show), rep: CHARITY_REP_FREE, tally: 'charity' }), join(`You’re on ${d.name}`, fx.rel(x, String(d.who), 12, 'Wrestled on their benefit night'))) },
      { id: 'donate', label: (_x, d) => `Send a donation (${money(Number(d.amount))})`, blocked: (x, d) => (x.c.money < Number(d.amount) ? 'You can’t afford it right now.' : null), run: (x, d) => join('They were very grateful', fx.money(x, -Number(d.amount), `Donation: ${d.name}`), fx.rel(x, String(d.who), 8, 'Donated to their benefit'), fx.rep(x, 0.5)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You couldn’t this time.' },
    ],
  },
  {
    id: 'invite_tribute', cat: 'community', weight: 0, cooldown: 0, when: () => false,
    from: (_x, d) => `${d.name} · ${d.city}`, subject: (_x, d) => `A night for ${d.whoName}`,
    body: (_x, d) => [`${d.whoName} hung up their boots this year. ${d.name} in ${d.city} on ${fmtDay(String(d.date), 'long')} is a night to celebrate their career, and they’ll be there.`, `We’d like you on the card: ${money(Number(d.fee))}.`],
    options: [
      { id: 'yes', label: 'Be part of it', blocked: indieBlock, run: (x, d) => approved(x, d) ?? (booked(x, d, Number(d.fee)), join(`You’re on ${d.name}`, fx.rel(x, String(d.who), 8, 'Wrestled on their tribute night'))) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You couldn’t make it.' },
    ],
  },
  {
    id: 'invite_cup', cat: 'career', weight: 0, cooldown: 0, when: () => false,
    from: (_x, d) => `${d.name} · ${d.city}`, subject: (_x, d) => `Enter ${d.name}?`,
    body: (_x, d) => [`Eight wrestlers, three rounds, a fortnight apart in ${d.city}: quarter-finals ${fmtDay(String(d.date), 'dm')}, semi-finals ${fmtDay(String(d.d2), 'dm')}, the final ${fmtDay(String(d.d3), 'dm')}.`, `${money(Number(d.fee))} a round, and ${money(Number(d.prize))} to whoever wins it.`],
    options: [
      { id: 'yes', label: 'Enter the cup', detail: () => 'Win and you’re booked for the next round', blocked: indieBlock, run: (x, d) => {
        const no = approved(x, d);
        if (no) return no;
        const t = x.c.tourneys?.find((y) => y.id === String(d.tourney));
        if (!t || t.entrants.length) return 'The field’s already set.';
        booked(x, d, Number(d.fee));
        t.player = true;
        t.fee = Number(d.fee);
        return `You’re in. Quarter-finals ${fmtDay(String(d.date), 'dm')}.`;
      } },
      { id: 'no', label: 'Decline', decline: true, run: () => 'Maybe next time.' },
    ],
  },
  {
    id: 'invite_farewell', cat: 'backstage', weight: 0, cooldown: 0, when: () => false,
    from: (_x, d) => String(d.whoName), subject: () => 'One last time?',
    body: (_x, d) => [`${d.whoName} is retiring. Their last match is ${d.name} on ${fmtDay(String(d.date), 'long')}.`, '“I want it to be you across the ring. Will you do it?”'],
    options: [
      { id: 'yes', label: 'Be their last opponent', blocked: indieBlock, run: (x, d) => {
        const no = approved(x, d);
        if (no) return no;
        const s = booked(x, d, Number(d.fee));
        (x.c.pledges ??= []).push({ id: `p${++x.c.seq}`, promo: s.promo, kind: 'match', show: s.id, opp: String(d.who) });
        return join(`You’ll be there: ${d.name}, ${fmtDay(String(d.date), 'dm')}`, fx.rel(x, String(d.who), 10, 'Agreed to be their last opponent'));
      } },
      { id: 'no', label: 'Say you can’t', decline: true, run: (x, d) => join('“I understand.”', fx.rel(x, String(d.who), -5, 'Couldn’t be their last opponent')) },
    ],
  },
];

const FOLLOWS: FollowDef[] = [
  { id: 'special_worked', run: (x, d) => {
    const worked = x.c.history.some((m) => m.show === String(d.show));
    if (!worked) return;
    if (d.tally) fx.tally(x, String(d.tally));
    fx.rep(x, Number(d.rep));
  } },
];
registerEvents(INVITES, FOLLOWS);

const invite = (c: Career, id: string, d: EvData) => { const def = INVITES.find((e) => e.id === id)!; return fire(ctxFor(c), def, d); };

// ------------------------------------------------------------------ the one-offs

const CAUSES = [
  ['a children’s hospice', 'children’s hospice'], ['the local food bank', 'food bank'], ['a homeless shelter', 'homeless shelter'],
  ['a mental health charity', 'mental health'], ['a youth wrestling club', 'youth club'], ['an animal rescue', 'animal rescue'], ['cancer research', 'cancer research'],
] as const;
const CHARITY_NAMES = ['Fighting Chance', 'Big Heart Brawl', 'Ropes for Hope', 'Main Event for Good', 'Hold the Line', 'Bodyslams for Charity', 'One Night, One Cause'];
const CROSS_NAMES = ['Crossroads', 'Common Ground', 'Borderlines', 'Two Rings', 'The Summit', 'Open Doors'];
/** Promotions in A.R.I.S.E. run their own joint shows; a crossover is never between them. */
const ARISE = ['ZWA', 'NWGP'];

function charity(c: Career, rnd: Rng): boolean {
  const v = venue(rnd, { region: regionFor(c, rnd) });
  const [cause, short] = pickOf(rnd, CAUSES)!;
  const name = pickOf(rnd, CHARITY_NAMES)!;
  const date = indieDates(c, addDays(c.today, between(rnd, SPECIAL_LEAD)), v.region)?.[0];
  if (!date) return false;
  const s = addShow(c, { promo: 'TIS', name, kind: 'indie', date, ...v, special: { kind: 'charity', tag: `Charity: ${short}` } });
  const me = findWrestler(c.player)!;
  if (!indieShut(c) && (near(c, v.region) || globalScore(me) >= 45) && rnd() < 0.7) {
    invite(c, 'invite_charity', { show: s.id, name, cause, city: s.city, date: s.date, fee: indieFee(me, s), travel: travelCost(me.country, s.country) });
  }
  return true;
}

function benefit(c: Career, rnd: Rng): boolean {
  const w = world(c);
  const hurt = WRESTLERS.filter((x) => x.id !== c.player && globalScore(x) >= BENEFIT_MIN_POP && !c.people[x.id]?.retired
    && (c.people[x.id]?.injury?.until ?? '') >= addDays(c.today, BENEFIT_MIN_INJURY_DAYS) && !w.seen[`benefit:${x.id}`])
    .sort((a, b) => globalScore(b) - globalScore(a));
  const who = hurt[0];
  if (!who) return false;
  w.seen[`benefit:${who.id}`] = c.today;
  const v = venue(rnd, { country: who.country });
  const name = `A Night for ${first(who.name)}`;
  const date = indieDates(c, addDays(c.today, between(rnd, SPECIAL_LEAD)), v.region)?.[0];
  if (!date) return false;
  const s = addShow(c, { promo: 'TIS', name, kind: 'indie', date, ...v, special: { kind: 'benefit', tag: `Benefit: ${who.name}`, for: who.id } });
  const me = findWrestler(c.player)!;
  if (relOf(c, who.id) >= 10 || (near(c, v.region) && rnd() < 0.6)) {
    invite(c, 'invite_benefit', { show: s.id, name, who: who.id, whoName: who.name, what: c.people[who.id]!.injury!.what, city: s.city, date: s.date, travel: travelCost(me.country, s.country), amount: round5(indieFee(me, s.region) * 0.5) });
  }
  return true;
}

function tribute(c: Career, rnd: Rng): boolean {
  const w = world(c);
  const gone = WRESTLERS.filter((x) => {
    const p = c.people[x.id];
    return p?.retired && p.retiredOn && daysBetween(p.retiredOn, c.today) >= 30 && daysBetween(p.retiredOn, c.today) <= 90 && globalScore(x) >= TRIBUTE_MIN_POP && !w.seen[`tribute:${x.id}`];
  }).sort((a, b) => globalScore(b) - globalScore(a));
  const who = gone[0];
  if (!who) return false;
  w.seen[`tribute:${who.id}`] = c.today;
  const v = venue(rnd, { country: who.country });
  const name = `Thank You, ${first(who.name)}`;
  const date = indieDates(c, addDays(c.today, between(rnd, SPECIAL_LEAD)), v.region)?.[0];
  if (!date) return false;
  const s = addShow(c, { promo: 'TIS', name, kind: 'indie', date, ...v, special: { kind: 'tribute', tag: `Tribute: ${who.name}`, for: who.id } });
  const me = findWrestler(c.player)!;
  if (relOf(c, who.id) >= 10 || (near(c, v.region) && rnd() < 0.5)) {
    invite(c, 'invite_tribute', { show: s.id, name, who: who.id, whoName: who.name, city: s.city, date: s.date, fee: indieFee(me, s), travel: travelCost(me.country, s.country) });
  }
  return true;
}

function crossover(c: Career, rnd: Rng): boolean {
  const majors = PROMOTIONS.filter((p) => !p.indie);
  const pairs: [string, string][] = [];
  for (const a of majors) for (const b of majors) {
    if (a.initials >= b.initials || a.region !== b.region) continue;
    if (ARISE.includes(a.initials) && ARISE.includes(b.initials)) continue;
    pairs.push([a.initials, b.initials]);
  }
  const pair = pickOf(rnd, pairs);
  if (!pair) return false;
  const busy = (d: Day) => Object.values(c.shows).some((s) => s.date === d && (s.promos ?? [s.promo]).some((p) => pair.includes(p)));
  let date: Day | null = null;
  for (let i = 0; i < 20 && !date; i++) { const d = addDays(c.today, between(rnd, [28, 56])); if (!busy(d)) date = d; }
  if (!date) return false;
  const home = PROMO_COUNTRIES[pickOf(rnd, pair)!]?.[0];
  const v = venue(rnd, { country: home });
  const name = `${pair[0]} × ${pair[1]}: ${pickOf(rnd, CROSS_NAMES)}`;
  addShow(c, { promo: pair[0], promos: [...pair], name, kind: 'special', date, ...v, special: { kind: 'crossover', tag: 'Crossover', noTitles: true } });
  const mine = person(c, c.player).contract?.promo;
  if (mine && pair.includes(mine)) {
    letter(c, { kind: 'news', from: 'The news desk', subject: `Crossover: ${name}`, body: [`${pair[0]} and ${pair[1]} are putting on a one-off show together in ${v.city} on ${fmtDay(date, 'long')}. No titles on the line: just the two rosters against each other.`] });
  }
  return true;
}

function tournament(c: Career, rnd: Rng): boolean {
  const v = venue(rnd, { region: regionFor(c, rnd) });
  // A city's second cup carries the year, so Records can tell them apart.
  const base = `The ${v.city} Cup`;
  const used = (c.tourneys ?? []).some((t) => t.name.startsWith(base)) || activeWorld().history.events.some((e) => e.kind === 'tournament' && e.what?.startsWith(base));
  const name = used ? `${base} ${c.today.slice(0, 4)}` : base;
  const nights = indieDates(c, addDays(c.today, between(rnd, SPECIAL_LEAD)), v.region, [0, CUP_ROUND_GAP, 2 * CUP_ROUND_GAP]);
  if (!nights) return false;
  const d1 = nights[0]!;
  const me0 = findWrestler(c.player)!;
  // One division per cup: yours when it's near you (so you can enter), otherwise either.
  const gender = near(c, v.region) || globalScore(me0) >= 45 ? me0.gender : rnd() < 0.6 ? 'MALE' : 'FEMALE';
  const t: Tourney = { id: `cup${++c.seq}`, name, shows: [], entrants: [], won: [], fee: 0, prize: 0, gender };
  for (let r = 0; r < 3; r++) {
    const s = addShow(c, { promo: 'TIS', name: `${name}: ${['Quarter-finals', 'Semi-finals', 'Final'][r]}`, kind: 'indie', date: addDays(d1, r * CUP_ROUND_GAP), ...v, special: { kind: 'tournament', tag: `Cup ${['quarter-finals', 'semi-finals', 'final'][r]}`, noTitles: true, tourney: t.id, round: r } });
    t.shows.push(s.id);
  }
  (c.tourneys ??= []).push(t);
  const me = findWrestler(c.player)!;
  t.prize = round5(indieFee(me, c.shows[t.shows[0]!]!) * CUP_PRIZE_MULT);
  if (!indieShut(c) && gender === me.gender && (near(c, v.region) || globalScore(me) >= 45)) {
    invite(c, 'invite_cup', { tourney: t.id, show: t.shows[0]!, name, city: v.city, date: d1, d2: addDays(d1, CUP_ROUND_GAP), d3: addDays(d1, 2 * CUP_ROUND_GAP), fee: indieFee(me, v.region), travel: travelCost(me.country, v.country), prize: t.prize });
  }
  return true;
}

/** A retiring wrestler's last match: their promotion's next big show, or a send-off on the indies. Returns the day. */
export function arrangeFarewell(c: Career, w: Wrestler, rnd: Rng): Day {
  const promo = w.promotion;
  const from = addDays(c.today, 21), to = addDays(c.today, 60);
  const theirs = promo === 'TIS' ? [] : Object.values(c.shows)
    .filter((s) => !s.done && !s.card && !s.special && s.date >= from && s.date <= to && (s.promos ?? [s.promo]).includes(promo) && !s.promos)
    .sort((a, b) => Number(b.kind === 'special' || b.kind === 'flagship') - Number(a.kind === 'special' || a.kind === 'flagship') || (a.date < b.date ? -1 : 1));
  let s = theirs[0];
  if (s) s.special = { kind: 'farewell', tag: `Farewell: ${w.name}`, for: w.id };
  else {
    const v = venue(rnd, { country: w.country });
    const want = addDays(c.today, between(rnd, [21, 35]));
    const date = indieDates(c, want, v.region)?.[0] ?? want;
    s = addShow(c, { promo: 'TIS', name: `${first(w.name)}: One Last Time`, kind: 'indie', date, ...v, special: { kind: 'farewell', tag: `Farewell: ${w.name}`, for: w.id } });
  }
  world(c).last.farewell = c.today;
  // Someone close to you wants you there.
  const me = findWrestler(c.player)!;
  const onRoster = s.promo === 'TIS' || me.promotion === s.promo;
  if (relOf(c, w.id) >= 15 && onRoster) {
    invite(c, 'invite_farewell', { show: s.id, name: s.name, who: w.id, whoName: w.name, date: s.date, fee: s.promo === 'TIS' ? indieFee(me, s) : 0, travel: s.promo === 'TIS' ? travelCost(me.country, s.country) : 0 });
  }
  return s.date;
}

// ------------------------------------------------------------------ cups: results, the next round, the winner

function settleCups(c: Career): void {
  const me = c.player;
  for (const t of c.tourneys ?? []) {
    for (let r = t.settled ?? 0; r < 3 && !t.winner; r++) {
      const show = c.shows[t.shows[r]!];
      if (!show?.done) break;
      // Walkovers were settled when the card was drawn; the rest from tonight's results.
      const won = (t.won[r] ??= []);
      tourneyPairs(t, r).forEach(([x, y], slot) => {
        if (won[slot]) return;
        const b = show.card?.find((z) => z.tourney?.round === r && z.tourney.slot === slot);
        const pop = (id: string) => { const w = findWrestler(id); return w ? globalScore(w) : 0; };
        if (b?.result) won[slot] = b.result.winner ?? (pop(b.a) >= pop(b.b) ? b.a : b.b);
        else if (b) won[slot] = b.a === me ? b.b : b.b === me ? b.a : b.a; // you didn't wrestle it: they go through
        else won[slot] = x || y || null;
      });
      t.settled = r + 1;
      if (t.player) cupLetters(c, t, r);
      if (r === 2 && won[0]) crown(c, t, won[0], show);
    }
  }
  // Finished cups stay a couple of months, for the calendar's sake.
  c.tourneys = (c.tourneys ?? []).filter((t) => !t.winner || daysBetween(c.shows[t.shows[2]!]?.date ?? c.today, c.today) < 60);
}

/** You in a cup: through to the next round (and booked for it), out, or never made the draw. */
function cupLetters(c: Career, t: Tourney, r: number): void {
  const me = c.player;
  const slot = tourneyPairs(t, r).findIndex(([x, y]) => x === me || y === me);
  if (r === 0 && slot < 0) { letter(c, { kind: 'news', from: t.name, subject: 'You weren’t in the draw', body: ['You couldn’t take your place in the cup, so someone else did.'] }); return; }
  if (slot < 0) return;
  const winner = t.won[r]![slot];
  if (winner !== me) {
    letter(c, { kind: 'news', from: t.name, subject: `Out in the ${roundName(r).toLowerCase()}`, body: [`${findWrestler(winner ?? '')?.name ?? 'Your opponent'} goes through. Better luck next time.`] });
    return;
  }
  if (r === 2) return;
  const next = c.shows[t.shows[r + 1]!];
  const ok = next ? indieAllowed(c, next.date) : { ok: false, why: 'the show’s gone' };
  if (next && ok.ok) joinIndie(c, next, t.fee, travelCost(findWrestler(me)!.country, next.country));
  letter(c, {
    kind: 'news', from: t.name, subject: ok.ok ? `Through to the ${roundName(r + 1).toLowerCase()}` : 'You’ll have to forfeit',
    body: [ok.ok ? `You’re through. ${roundName(r + 1)} on ${fmtDay(next!.date, 'long')}.` : `You won, but you can’t make the ${roundName(r + 1).toLowerCase()}: ${ok.why ?? 'the date doesn’t work'}. Your opponent goes through.`],
  });
}

/** The cup winner's prize shot: the top indie title in their division (not one they hold). */
function cupTitle(w: Wrestler): Title | undefined {
  const ids = PROMOTIONS.find((p) => p.initials === 'TIS')?.titles ?? [];
  const order = ['WORLD_INDEPENDENT_CHAMPIONSHIP', ...ids];
  return order.map((id) => TITLES.find((t) => t.id === id)).find((t): t is Title => !!t && ids.includes(t.id) && t.gender === w.gender && !!t.holder && t.holder !== w.id);
}

function crown(c: Career, t: Tourney, id: string, final: Show): void {
  t.winner = id;
  const w = findWrestler(id);
  if (!w) return;
  addEvent(activeWorld().history, { day: c.today, kind: 'tournament', who: id, name: w.name, promo: 'TIS', show: final.name, what: t.name });
  // The prize includes a shot at the division's top indie title.
  const title = cupTitle(w);
  let shotLine = '';
  if (title && id === c.player) {
    const s = indieTitleShow(c, title, addDays(c.today, 1), final);
    if (s) {
      joinIndie(c, s, indieFee(w, s), travelCost(w.country, s.country));
      (c.pledges ??= []).push({ id: `p${++c.seq}`, promo: 'TIS', kind: 'title', title: title.id, show: s.id });
      shotLine = ` And your shot at the ${title.name}: ${s.name}, ${fmtDay(s.date, 'long')}.`;
    } else {
      (c.pledges ??= []).push({ id: `p${++c.seq}`, promo: 'TIS', kind: 'title', title: title.id, from: addDays(c.today, 1) });
      shotLine = ` And a shot at the ${title.name} on the next indie show you’re on when it’s due.`;
    }
  } else if (title) {
    (c.cupShots ??= []).push({ title: title.id, who: id, until: addDays(c.today, CUP_SHOT_DAYS) });
  }
  if (id === c.player) {
    spend(c, t.prize, `Winning ${t.name}`, 'bonus');
    const p = person(c, id);
    p.rep = Math.min(100, p.rep + CUP_WIN_REP);
    const r = final.region;
    const gained = shiftFans(w, r, CUP_WIN_POP);
    letter(c, { kind: 'result', from: t.name, subject: `You won ${t.name}!`, body: [`Three rounds, three wins. ${money(t.prize)} prize money, and the trophy’s yours.${shotLine}`], terms: [['Prize', money(t.prize)], ['Fans', `+${fmtFans(gained)} in ${REGION_LABEL[r]}`], ['Reputation', `+${CUP_WIN_REP}`]] });
  } else if (t.player || near(c, final.region)) {
    letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} wins ${t.name}`, body: [`${w.name} won ${t.name} in ${final.city}${title ? `, and a shot at the ${title.name}` : ''}.`] });
  }
}

// ------------------------------------------------------------------ the daily round

const MAKERS: Record<Exclude<SpecialKind, 'farewell'>, (c: Career, rnd: Rng) => boolean> = { charity, benefit, tribute, crossover, tournament };

function daily(c: Career): void {
  settleCups(c);
  if (c.cupShots?.length) c.cupShots = c.cupShots.filter((x) => x.until >= c.today);
  if (person(c, c.player).retired) return;
  const w = world(c);
  const rnd = seededRng(hashSeed(c.seed, 'specials', c.today));
  const lastAny = Object.values(w.last).filter((d): d is Day => !!d).sort().pop();
  if (lastAny && daysBetween(lastAny, c.today) < SPECIAL_MIN_GAP) return;
  const kinds = (Object.keys(MAKERS) as (keyof typeof MAKERS)[]).sort(() => rnd() - 0.5);
  for (const k of kinds) {
    const last = w.last[k];
    if (last && daysBetween(last, c.today) < SPECIAL_GAP[k]) continue;
    if (rnd() >= SPECIAL_DAILY) continue;
    if (MAKERS[k](c, rnd)) { w.last[k] = c.today; return; }
  }
}

setCareerHooks({ daily });

/** Put on a one-off of this kind now (tests, and the dev console). */
export function makeSpecial(c: Career, kind: keyof typeof MAKERS, salt = ''): boolean {
  const ok = MAKERS[kind](c, seededRng(hashSeed(c.seed, 'make', kind, c.today, salt)));
  if (ok) world(c).last[kind] = c.today;
  return ok;
}

/** The cup a show belongs to, and its round's name (for the calendar). */
export function cupLabel(_c: Career, show: Show): string | null {
  if (show.special?.kind !== 'tournament') return null;
  const r = show.special.round ?? 0;
  return `Cup · ${roundName(r).toLowerCase()}, round ${r + 1} of 3`;
}

