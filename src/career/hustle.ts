// Side earners (Lyra's calls). Ways to make money around the ring: a merch table at your shows, conventions,
// coaching, working other people's shows, content and subscribers, sponsors, a fundraiser when you're hurt, and
// putting on your own show. The ones that take time take half-days in your week; content, sponsors and
// fundraisers tick along in the background. Signed wrestlers need Outside Appearances; injured wrestlers can do
// the quiet ones (coaching, commentary, conventions, content). A real second income, never free money.
import { fansIn, fansTotal, findWrestler, WRESTLERS, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { letter, person, setCareerHooks, spend } from './career';
import { tierOf } from './clauses';
import { dealsOf, dealWith, sideWork } from './deals';
import { addDays, daysBetween, fmtDay, weekday, type Day } from './dates';
import { attributeTotal, indieFee, livingCost, baseRegion, travelCost } from './economy';
import { ctxFor, fire, registerEvents, type EventDef } from './events';
import { patienceOf } from './patience';
import { CITIES, REGION_LABEL, REGION_OF, regionOfCountry } from './places';
import { CONTENT, CONVENTION, COACHING, FEATURES, FUND, MEDICAL_PER_DAY, MERCH_ONLINE, MERCH_TABLE, OWN_SHOW, SHOW_WORK, SPONSOR } from './tuning';
import type { Bout, Career, PhaseName, PlayerMatch, PopRegion, Show } from './types';

export type GigKind = 'convention' | 'ref' | 'crew' | 'commentary';
export interface Gig { id: string; kind: GigKind; day: Day; phases: PhaseName[]; country: string; city: string; name: string; show?: string; travel: number }
export interface Sponsor { id: string; name: string; region: PopRegion; monthly: number; until: Day; renewed?: boolean }
export interface OwnShow { show: string; venue: string; cap: number; cost: number; fees: number; travel: number; price?: number; settled?: boolean }
export interface HustleState {
  stock: number;
  sold: number;
  coaching: { slots: [number, PhaseName][]; since: Day } | null;
  gigs: Record<string, Gig>;
  subs: number;
  contentAt?: Day;
  sponsors: Sponsor[];
  fund?: { until: Day; perDay: number; raised: number };
  fundAt?: Day;
  own: OwnShow[];
  /** Classes taught (experience raises the fee), content sessions lately, your shows' following. */
  taught?: number;
  sessions?: Day[];
  hype?: number;
}

export const hustleOf = (c: Career): HustleState => (c.hustle ??= { stock: 0, sold: 0, coaching: null, gigs: {}, subs: 0, sponsors: [], own: [] });
const me = (c: Career): Wrestler => findWrestler(c.player)!;
const injured = (c: Career): boolean => !!c.people[c.player]?.injury;
const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const r5 = (n: number) => Math.round(n / 5) * 5;

// ------------------------------------------------------------------ what you're allowed to do

export type HustleKind = 'merch' | 'convention' | 'coaching' | 'ref' | 'crew' | 'commentary' | 'own' | 'sponsor' | 'content' | 'fund';
const QUIET = new Set<HustleKind>(['merch', 'convention', 'coaching', 'commentary', 'sponsor', 'content', 'fund']);
/** Why you can't do this (or null): your contract's Outside Appearances, or your injury. */
export function blocked(c: Career, kind: HustleKind): string | null {
  if (!FEATURES.hustles) return 'Not yet.';
  if (injured(c) && !QUIET.has(kind)) return 'Not while you’re injured.';
  const p = c.people[c.player];
  const k = p?.contract;
  if (!k || kind === 'fund') return null;
  // Character & Image Rights: your face, your name. Content and conventions need Shared; sponsors and your own gear Licensed.
  const image = Math.max(...dealsOf(p).map((d) => tierOf(d, 'image')));
  const needs = kind === 'merch' || kind === 'sponsor' ? 2 : kind === 'content' || kind === 'convention' ? 1 : 0;
  if (image < needs) return `Your ${k.promo} deal owns your image: ${kind === 'merch' ? 'selling your own gear' : kind === 'sponsor' ? 'sponsors' : kind === 'content' ? 'paid content' : 'conventions'} need${kind === 'merch' || kind === 'sponsor' ? '' : 's'} ${needs >= 2 ? 'Licensed' : 'Shared'} Image Rights.`;
  if (kind === 'content' || kind === 'merch') return null;
  // Exclusivity (Lyra's call: stepped): free below Major Exclusive, their approval there, none at Total.
  const side = sideWork(p);
  if (side.rule === 'banned') return `Your ${side.promo} deal is totally exclusive: no outside work.`;
  if (side.rule === 'approval' && patienceOf(c, side.promo!) < 50) return `${side.promo} management won’t approve it right now (patience under 50).`;
  return null;
}

// ------------------------------------------------------------------ the merch table

export function buyStock(c: Career, n: number): string {
  const cost = n * MERCH_TABLE.cost;
  if (c.money < cost) return 'You can’t afford the stock.';
  spend(c, -cost, `Merch stock · ${n} shirts`, 'merch');
  hustleOf(c).stock += n;
  return `${n} shirts in the boot of the car.`;
}
/** What you'd sell at a show: more with fans where it is, a bigger show and a better match. */
export function merchUnits(w: Wrestler, show: Pick<Show, 'region' | 'kind'>, stars: number): number {
  const local = fansIn(w, show.region);
  const mult = MERCH_TABLE.stars.find(([s]) => stars >= s)![1] * (MERCH_TABLE.kind[show.kind] ?? 1);
  return Math.max(0, Math.round((MERCH_TABLE.base + MERCH_TABLE.perLog * Math.log10(local / 100 + 1)) * mult));
}
function sellAtShow(c: Career, show: Show, _bout: Bout, m: PlayerMatch): void {
  if (!FEATURES.hustles) return;
  const h = hustleOf(c);
  if (!h.stock) return;
  // Your own table at a promotion's show needs Merchandise Rights Tier 2 with them (Lyra's call).
  if (show.promo !== 'TIS' && !(show.promos ?? [show.promo]).some((x) => tierOf(dealWith(c.people[c.player], x), 'merch') >= 2)) return;
  const n = Math.min(h.stock, merchUnits(me(c), show, m.stars));
  if (!n) return;
  h.stock -= n; h.sold += n;
  spend(c, n * MERCH_TABLE.price, `Merch table · ${show.name} · ${n} sold`, 'merch');
}

// ------------------------------------------------------------------ conventions

export interface Convention { id: string; day: Day; country: string; city: string; name: string; region: PopRegion }
/** Weekend conventions in your region over the next few weeks (one a weekend, somewhere in the region). */
export function conventionsAhead(c: Career): Convention[] {
  const region = baseRegion(c);
  const countries = Object.keys(REGION_OF).filter((x) => REGION_OF[x] === region && CITIES[x]);
  const out: Convention[] = [];
  let d = addDays(c.today, 1);
  while (weekday(d) !== 6) d = addDays(d, 1);
  for (let i = 0; i < CONVENTION.weeksAhead; i++, d = addDays(d, 7)) {
    for (const day of [d, addDays(d, 1)]) {
      const rnd = seededRng(hashSeed(c.seed, 'con', region, day));
      const country = countries[Math.floor(rnd() * countries.length)]!;
      const city = CITIES[country]![Math.floor(rnd() * CITIES[country]!.length)]!;
      const name = `${city} ${['Comic & Wrestling Con', 'Fan Fest', 'Wrestling Expo', 'Collectors Fair'][Math.floor(rnd() * 4)]}`;
      if (day > c.today) out.push({ id: `con|${day}|${region}`, day, country, city, name, region });
    }
  }
  return out;
}
/** Photos and autographs, a guarantee if you're a name, less the table. */
export function conventionTake(c: Career, con: Pick<Convention, 'region' | 'country'>): { photos: number; price: number; pay: number; table: number; guarantee: number; travel: number } {
  const w = me(c);
  const local = fansIn(w, con.region);
  const photos = Math.round(CONVENTION.perFan * local ** CONVENTION.exp);
  // A bigger name charges more a photo.
  const price = Math.max(CONVENTION.photo, Math.round(CONVENTION.photo + CONVENTION.photoPerDecade * Math.log10(Math.max(1, fansTotal(w) / 1000))));
  const guarantee = fansTotal(w) >= CONVENTION.guaranteeFans ? r5(Math.min(CONVENTION.guaranteeMax, CONVENTION.guaranteeK * (fansTotal(w) / 1000) ** CONVENTION.guaranteeExp)) : 0;
  const table = guarantee ? 0 : CONVENTION.table;
  const travel = travelCost(c.base ?? w.country, con.country);
  return { photos, price, pay: photos * price + guarantee, table, guarantee, travel };
}

// ------------------------------------------------------------------ gigs: conventions and working shows

/** Would this gig fit around your bookings, travel, work and other gigs? */
let fitsHook: ((c: Career, g: Gig) => string | null) | null = null;
export const setGigFits = (f: (c: Career, g: Gig) => string | null) => { fitsHook = f; };

export function bookConvention(c: Career, id: string): string {
  const con = conventionsAhead(c).find((x) => x.id === id);
  if (!con) return 'That convention’s gone.';
  if (hustleOf(c).gigs[id]) return 'You’re already going.';
  const no = blocked(c, 'convention');
  if (no) return no;
  const t = conventionTake(c, con);
  const g: Gig = { id, kind: 'convention', day: con.day, phases: ['am', 'pm'], country: con.country, city: con.city, name: con.name, travel: t.travel };
  const why = fitsHook?.(c, g);
  if (why) return why;
  hustleOf(c).gigs[id] = g;
  return `Booked: ${con.name}, ${fmtDay(con.day, 'long')}.`;
}

export const showWorkPay = (c: Career, role: 'ref' | 'crew' | 'commentary', show: Pick<Show, 'region'>) => r5(SHOW_WORK[role] * (show.region === baseRegion(c) ? 1 : 1.2));
/** Referee, ring crew or commentary on an indie show. */
export function workShow(c: Career, show: Show, role: 'ref' | 'crew' | 'commentary'): string {
  const no = blocked(c, role);
  if (no) return no;
  if (show.promo !== 'TIS') return 'Only indie shows take outside help.';
  const id = `work|${show.id}`;
  if (hustleOf(c).gigs[id]) return 'You’re already working that show.';
  const g: Gig = { id, kind: role, day: show.date, phases: [show.phase ?? 'pm'], country: show.country, city: show.city, name: show.name, show: show.id, travel: travelCost(c.base ?? me(c).country, show.country) };
  const why = fitsHook?.(c, g);
  if (why) return why;
  hustleOf(c).gigs[id] = g;
  return `You’re on ${role === 'ref' ? 'refereeing' : role === 'crew' ? 'ring crew' : 'commentary'} for ${show.name}.`;
}
export function dropGig(c: Career, id: string): void { delete hustleOf(c).gigs[id]; }

// ------------------------------------------------------------------ coaching

/** A class: reputation and skill, and experience (classes taught) on top. */
export const classFee = (c: Career): number => r5((COACHING.base + person(c, c.player).rep * COACHING.perRep + Math.max(0, attributeTotal(me(c)) / 6 - COACHING.skillFrom) * COACHING.perSkill)
  * (1 + Math.min(COACHING.expMax, (c.hustle?.taught ?? 0) / COACHING.expPer)));
export function setCoaching(c: Career, slots: [number, PhaseName][] | null): string {
  const no = slots ? blocked(c, 'coaching') : null;
  if (no) return no;
  hustleOf(c).coaching = slots?.length ? { slots: slots.slice(0, COACHING.maxSlots), since: addDays(c.today, 1) } : null;
  return slots?.length ? `Coaching from tomorrow: ${money(classFee(c))} a class.` : 'You’ve stopped coaching.';
}
export const isCoaching = (c: Career, day: Day, ph: PhaseName): boolean => {
  const k = c.hustle?.coaching;
  return !!k && day >= k.since && k.slots.some(([d, p]) => d === weekday(day) && p === ph);
};

// ------------------------------------------------------------------ the phase: coaching and gigs pay out

/** Called for your phase when it's a side earner (coaching, or a gig's last half-day). */
function phase(c: Career, ph: PhaseName, a: string): void {
  if (!FEATURES.hustles || a !== 'hustle') return;
  const p = person(c, c.player);
  const g = Object.values(hustleOf(c).gigs).find((x) => x.day === c.today && x.phases.includes(ph));
  if (g) {
    if (g.phases[g.phases.length - 1] !== ph) return;
    delete hustleOf(c).gigs[g.id];
    if (g.travel) spend(c, -g.travel, `Travel · ${g.city}`, 'travel');
    if (g.kind === 'convention') {
      const t = conventionTake(c, { region: regionOfCountry(g.country), country: g.country });
      // Turnout varies: a quiet hall or a queue round the block.
      const rnd = seededRng(hashSeed(c.seed, 'con-day', g.id));
      const photos = Math.max(0, Math.round(t.photos * (1 - CONVENTION.swing + rnd() * 2 * CONVENTION.swing)));
      const pay = photos * t.price + t.guarantee;
      if (t.table) spend(c, -t.table, `Table · ${g.name}`, 'event');
      spend(c, pay, `${g.name} · ${photos} photos${t.guarantee ? ' and a guarantee' : ''}`, 'event');
      p.fatigue = Math.min(100, p.fatigue + CONVENTION.fatigue);
      letter(c, { kind: 'news', from: g.name, subject: `${photos} photos signed`, body: [`${photos >= t.photos ? 'A queue all day' : 'A quieter day than hoped'}: ${money(pay)}${t.table ? `, less ${money(t.table)} for the table` : ''}${g.travel ? ` and ${money(g.travel)} travel` : ''}.`] });
    } else {
      const pay = showWorkPay(c, g.kind, { region: regionOfCountry(g.country) });
      spend(c, pay, `${g.kind === 'ref' ? 'Refereeing' : g.kind === 'crew' ? 'Ring crew' : 'Commentary'} · ${g.name}`, 'event');
      p.fatigue = Math.min(100, p.fatigue + SHOW_WORK.fatigue[g.kind]);
    }
    return;
  }
  if (isCoaching(c, c.today, ph)) {
    spend(c, classFee(c), 'Coaching · a class', 'event');
    hustleOf(c).taught = (hustleOf(c).taught ?? 0) + 1;
    p.fatigue = Math.min(100, p.fatigue + COACHING.fatigue);
  }
}

// ------------------------------------------------------------------ content and subscribers

/** Where your subscribers are heading: a share of your fans (growing more slowly for big names). */
export function subsTarget(w: Wrestler): number {
  const f = fansTotal(w);
  const at = (x: number) => CONTENT.share * x ** CONTENT.exp;
  return Math.round(f <= CONTENT.bigFrom ? at(f) : at(CONTENT.bigFrom) * (f / CONTENT.bigFrom) ** CONTENT.bigExp);
}
/** Content sessions in the last 14 days (each a half-day in your week). */
export const recentSessions = (c: Career): number => (c.hustle?.sessions ?? []).filter((d) => daysBetween(d, c.today) <= CONTENT.idleDays).length;
/** Where subscribers are heading with the effort you're putting in. */
export const subsHeading = (c: Career): number => Math.round(subsTarget(me(c)) * (1 + CONTENT.perSession * Math.min(CONTENT.maxSessions, recentSessions(c))));
/** A half-day making content (your routine, or a plan). */
export function contentSession(c: Career): void {
  const h = hustleOf(c);
  h.sessions = [c.today, ...(h.sessions ?? []).filter((d) => daysBetween(d, c.today) <= CONTENT.idleDays)].slice(0, 20);
}
/** Mondays: subscribers move towards where your effort is taking them (posting and wrestling help too); pay varies. */
function contentWeek(c: Career): void {
  const h = hustleOf(c);
  const posted = c.social?.last && daysBetween(c.social.last, c.today) <= CONTENT.idleDays;
  const wrestled = c.history[0] && daysBetween(c.history[0].day, c.today) <= CONTENT.idleDays;
  const made = recentSessions(c);
  const push = made ? 1 : (posted ? 0.5 : 0) + (wrestled ? 0.5 : 0);
  if (push) h.subs = Math.round(h.subs + Math.max(0, subsHeading(c) - h.subs) * CONTENT.grow * push);
  if (!made) h.subs = Math.round(h.subs * (1 - CONTENT.decay));
  const rnd = seededRng(hashSeed(c.seed, 'content', c.today));
  const pay = r5(((h.subs * CONTENT.price * 7) / 30.4) * (1 - CONTENT.swing + rnd() * 2 * CONTENT.swing));
  if (pay > 0) spend(c, pay, `Subscribers · ${h.subs.toLocaleString('en-GB')}`, 'event');
  // The online shop: shirts from your stock to subscribers and fans.
  if (h.stock) {
    const want = (h.subs * MERCH_ONLINE.perSub + Math.sqrt(fansTotal(me(c))) * MERCH_ONLINE.perRootFan) * (1 - MERCH_ONLINE.swing + rnd() * 2 * MERCH_ONLINE.swing);
    const n = Math.min(h.stock, Math.round(want));
    if (n) { h.stock -= n; h.sold += n; spend(c, n * MERCH_TABLE.price, `Merch online · ${n} sold`, 'merch'); }
  }
}

// ------------------------------------------------------------------ sponsors

const BRANDS = ['Ironworks Gym', 'Turnbuckle Energy', 'Ringside Burgers', 'Main Event Barbers', 'Brawl Bros Supplements', 'The Corner Café', 'Heel Turn Brewing', 'Suplex Sportswear'];
const SPONSOR_OFFER: EventDef = {
  id: 'sponsor_offer', cat: 'career', weight: 0, cooldown: 0, when: () => false, expires: 10,
  from: (_x, d) => String(d.name), subject: (_x, d) => `${String(d.name)} want to sponsor you`,
  body: (_x, d) => [`${money(Number(d.monthly))} a month for ${String(d.months)} months. Wear the logo, mention us now and then.`, `They know you in ${REGION_LABEL[d.region as PopRegion]}.`],
  options: [
    { id: 'yes', label: 'Sign it', run: (x, d) => { const no = blocked(x.c, 'sponsor'); if (no) return no; hustleOf(x.c).sponsors.push({ id: String(d.name), name: String(d.name), region: d.region as PopRegion, monthly: Number(d.monthly), until: addDays(x.c.today, Number(d.months) * 30) }); return `${String(d.name)} are on board.`; } },
    { id: 'no', label: 'Turn it down', decline: true, run: () => 'Maybe another time.' },
  ],
};
function sponsorMonth(c: Career): void {
  const h = hustleOf(c);
  // Ending: renewed at more if you've kept posting, otherwise gone.
  const posted = c.social?.last && daysBetween(c.social.last, c.today) <= SPONSOR.postedDays;
  for (const s of h.sponsors.filter((x) => x.until <= c.today)) {
    if (posted && !blocked(c, 'sponsor')) {
      s.monthly = r5(s.monthly * SPONSOR.renew); s.until = addDays(c.today, SPONSOR.months[1] * 30); s.renewed = true;
      letter(c, { kind: 'news', from: s.name, subject: 'Same again?', body: [`You’ve kept our name out there. Renewed: ${money(s.monthly)} a month.`] });
    }
  }
  h.sponsors = h.sponsors.filter((s) => s.until > c.today);
  for (const s of h.sponsors) spend(c, s.monthly, `Sponsor · ${s.name}`, 'event');
  if (h.sponsors.length >= SPONSOR.max || blocked(c, 'sponsor')) return;
  const w = me(c);
  const rnd = seededRng(hashSeed(c.seed, 'sponsor', c.today));
  const regions = (['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'] as PopRegion[]).filter((r) => fansIn(w, r) >= SPONSOR.minFans && !h.sponsors.some((s) => s.region === r));
  if (!regions.length || rnd() >= SPONSOR.chance) return;
  const region = regions.sort((a, b) => fansIn(w, b) - fansIn(w, a))[0]!;
  const months = SPONSOR.months[0] + Math.floor(rnd() * (SPONSOR.months[1] - SPONSOR.months[0] + 1));
  fire(ctxFor(c), SPONSOR_OFFER, { name: BRANDS[Math.floor(rnd() * BRANDS.length)]!, monthly: r5(fansIn(w, region) * SPONSOR.perFan), months, region });
}

// ------------------------------------------------------------------ a fundraiser when you're hurt

export function fundTotal(c: Career, daysOut: number): number {
  const w = me(c);
  const raw = (FUND.base + FUND.k * fansTotal(w) ** FUND.exp) * (0.5 + person(c, c.player).rep / 100);
  const cap = daysOut * MEDICAL_PER_DAY + (livingCost(baseRegion(c)) * daysOut) / 7;
  const again = c.hustle?.fundAt && daysBetween(c.hustle.fundAt, c.today) < FUND.againDays ? FUND.againMult : 1;
  return r5(Math.min(cap, raw) * again);
}
const FUND_OFFER: EventDef = {
  id: 'fundraiser', cat: 'career', weight: 0, cooldown: 0, when: () => false, expires: 7,
  from: () => 'A friend', subject: () => 'Let people help?',
  body: (_x, d) => [`You’re out for ${String(d.days)} days and the bills are piling up. A fundraiser could bring in around ${money(Number(d.total))} over the next two weeks.`, 'Some people will think less of you for asking. Most won’t.'],
  options: [
    { id: 'yes', label: 'Start the fundraiser', run: (x, d) => { const h = hustleOf(x.c); h.fund = { until: addDays(x.c.today, FUND.overDays), perDay: Math.round(Number(d.total) / FUND.overDays), raised: 0 }; h.fundAt = x.c.today; return 'It’s up. People are sharing it.'; } },
    { id: 'no', label: 'No, I’ll manage', decline: true, run: () => 'Pride intact. Bank balance less so.' },
  ],
};
function fundDay(c: Career): void {
  const h = hustleOf(c);
  if (h.fund) {
    spend(c, h.fund.perDay, 'Fundraiser', 'event');
    h.fund.raised += h.fund.perDay;
    if (c.today >= h.fund.until) {
      letter(c, { kind: 'news', from: 'Your fundraiser', subject: `${money(h.fund.raised)} raised`, body: ['Thank you, everyone. You’ll be back soon.'] });
      delete h.fund;
    }
    return;
  }
  const inj = c.people[c.player]?.injury;
  const days = inj ? daysBetween(c.today, inj.until) : 0;
  const open = Object.values(c.events?.open ?? {}).some((o) => o.id === 'fundraiser');
  if (inj && days >= FUND.minDays && !open && (!h.fundAt || daysBetween(h.fundAt, c.today) > days) && c.events?.seen.fundraiser !== inj.until) {
    if (fire(ctxFor(c), FUND_OFFER, { days, total: fundTotal(c, days) })) c.events!.seen.fundraiser = inj.until;
  }
}

// ------------------------------------------------------------------ your own show

export const venues = OWN_SHOW.venues;
export interface OwnPlan { date: Day; country: string; city: string; venue: string; opp: string; hires: string[]; price?: number }
/** Who'd come: a floor, plus everyone's fans where the show is (square-rooted: a big name helps, but not linearly). */
export function ownDraw(c: Career, plan: Pick<OwnPlan, 'country' | 'opp' | 'hires' | 'price'>): number {
  const region = regionOfCountry(plan.country);
  const names = [c.player, plan.opp, ...plan.hires].map((id) => findWrestler(id)).filter((w): w is Wrestler => !!w);
  const base = OWN_SHOW.drawBase + OWN_SHOW.drawK * names.reduce((t, w) => t + Math.sqrt(fansIn(w, region)), 0);
  // Your following (hype from past shows), and dearer tickets put some off.
  return Math.round(base * (1 + (c.hustle?.hype ?? 0)) * (OWN_SHOW.ticket / (plan.price ?? OWN_SHOW.ticket)) ** OWN_SHOW.priceExp);
}
export const hireFee = (w: Wrestler, region: PopRegion): number => r5(indieFee(w, region) * OWN_SHOW.feeMult);
export function ownBudget(c: Career, plan: OwnPlan): { draw: number; cap: number; tickets: number; costs: number; fees: number; venue: number; travel: number; profit: number } {
  const v = OWN_SHOW.venues.find((x) => x.id === plan.venue)!;
  const region = regionOfCountry(plan.country);
  const fees = [plan.opp, ...plan.hires].reduce((t, id) => t + hireFee(findWrestler(id)!, region), 0);
  const draw = ownDraw(c, plan);
  const sold = Math.min(v.cap, draw);
  const tickets = sold * (plan.price ?? OWN_SHOW.ticket) + Math.round(sold * OWN_SHOW.merchPerHead);
  const travel = travelCost(c.base ?? me(c).country, plan.country);
  const costs = v.cost + OWN_SHOW.production + fees + travel;
  return { draw, cap: v.cap, tickets, costs, fees, venue: v.cost, travel, profit: tickets - costs };
}
/** Who you could hire: wrestlers in the region who aren't signed elsewhere (or whose deals let them), by fans. */
export function hireable(c: Career, country: string, date: Day): Wrestler[] {
  const region = regionOfCountry(country);
  const busy = new Set(Object.values(c.shows).filter((s) => s.date === date && s.card).flatMap((s) => s.card!.flatMap((b) => [b.a, b.b])));
  return WRESTLERS.filter((w) => w.id !== c.player && w.promotion === 'TIS' && !busy.has(w.id) && !c.people[w.id]?.injury && !c.people[w.id]?.retired && fansIn(w, region) > 0)
    .sort((a, b) => fansIn(b, region) - fansIn(a, region)).slice(0, 24);
}
/** Book it: a real indie show on the calendar, you in the main event, your hires in the undercard. */
export function putOnShow(c: Career, plan: OwnPlan): string {
  const no = blocked(c, 'own');
  if (no) return no;
  const lead = daysBetween(c.today, plan.date);
  if (lead < OWN_SHOW.minLead || lead > OWN_SHOW.maxLead) return `Pick a date ${OWN_SHOW.minLead}–${OWN_SHOW.maxLead} days out.`;
  const k = c.people[c.player]?.contract;
  if (k && Object.values(c.shows).some((s) => s.date === plan.date && s.promo === k.promo && s.region === regionOfCountry(plan.country))) return `${k.promo} has a show in the region that night: you can’t run against them.`;
  const b = ownBudget(c, plan);
  const v = OWN_SHOW.venues.find((x) => x.id === plan.venue)!;
  const w = me(c);
  const id = `own|${plan.date}|${c.seq + 1}`;
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < plan.hires.length; i += 2) pairs.push([plan.hires[i]!, plan.hires[i + 1]!]);
  const show: Show = {
    id, promo: 'TIS', name: `${w.name} Presents: ${v.name === 'Small arena' ? 'The Big One' : 'Fight Night'}`, kind: 'indie', date: plan.date, country: plan.country, city: plan.city,
    region: regionOfCountry(plan.country), card: [...pairs.map(([a, bb]) => ({ a, b: bb })), { a: c.player, b: plan.opp }], done: false, special: { kind: 'benefit', tag: 'Your show' } as Show['special'],
  } as Show;
  if (fitsHook?.(c, { id, kind: 'convention', day: plan.date, phases: ['pm'], country: plan.country, city: plan.city, name: show.name, travel: 0 })) return 'That date doesn’t fit around your other bookings.';
  c.shows[id] = show;
  c.indie[id] = { fee: 0, travel: 0 };
  hustleOf(c).own.push({ show: id, venue: v.id, cap: v.cap, cost: b.venue + OWN_SHOW.production, fees: b.fees, travel: b.travel, price: plan.price ?? OWN_SHOW.ticket });
  c.seq++;
  return `${show.name}: ${plan.city}, ${fmtDay(plan.date, 'long')}. Projected ${b.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(b.profit))}.`;
}
/** The morning after: the books. */
function settleOwn(c: Career): void {
  for (const o of hustleOf(c).own) {
    const s = c.shows[o.show];
    if (o.settled || !s || !s.done) continue;
    o.settled = true;
    const rnd = seededRng(hashSeed(c.seed, 'own', s.id));
    const names = (s.card ?? []).flatMap((b) => [b.a, b.b]).filter((id) => id !== c.player);
    const price = o.price ?? OWN_SHOW.ticket;
    const draw = ownDraw(c, { country: s.country, opp: names[names.length - 1] ?? '', hires: names.slice(0, -1), price }) * (1 - OWN_SHOW.swing + rnd() * 2 * OWN_SHOW.swing);
    const sold = Math.round(Math.min(o.cap, draw));
    const best = Math.max(0, ...(s.card ?? []).map((b) => b.result?.stars ?? 0));
    const merch = Math.round(sold * OWN_SHOW.merchPerHead * (best >= 4 ? 1.4 : best >= 3 ? 1 : 0.7));
    const tickets = sold * price;
    // The following: a full house and a good main event build it; empty seats or a dud cost it.
    const h = hustleOf(c);
    const full = sold >= o.cap * 0.9;
    h.hype = Math.max(0, Math.min(OWN_SHOW.hypeMax, (h.hype ?? 0) + (full && best >= 3.5 ? OWN_SHOW.hypeUp : full || best >= 3.5 ? OWN_SHOW.hypeUp / 2 : -OWN_SHOW.hypeDown)));
    spend(c, tickets + merch, `${s.name} · ${sold} tickets and merch`, 'event');
    spend(c, -(o.cost + o.fees + o.travel), `${s.name} · venue, ring, crew, wrestlers and travel`, 'event');
    const net = tickets + merch - o.cost - o.fees - o.travel;
    letter(c, {
      kind: 'news', from: s.name, subject: net >= 0 ? `Your show made ${money(net)}` : `Your show lost ${money(-net)}`,
      body: [`${sold} through the door in ${s.city}${sold >= o.cap ? ' (sold out)' : ''}. Best match ${best}★.`, `Your shows’ following: ${Math.round((1 + (h.hype ?? 0)) * 100)}% of a first show’s draw.`],
      terms: [['Tickets', money(tickets)], ['Merch', money(merch)], ['Venue, ring and crew', `−${money(o.cost)}`], ['Wrestlers', `−${money(o.fees)}`], ...(o.travel ? [['Travel', `−${money(o.travel)}`] as [string, string]] : []), ['Net', `${net >= 0 ? '' : '−'}${money(Math.abs(net))}`]],
    });
  }
}

// ------------------------------------------------------------------ the daily round

function daily(c: Career): void {
  if (!FEATURES.hustles || c.spectator) return;
  const h = hustleOf(c);
  // Injured: the physical gigs fall away.
  if (injured(c)) for (const g of Object.values(h.gigs)) if (!QUIET.has(g.kind)) { delete h.gigs[g.id]; letter(c, { kind: 'news', from: g.name, subject: 'You can’t work it injured', body: ['They’ve found someone else.'] }); }
  for (const g of Object.values(h.gigs)) if (g.day < c.today) delete h.gigs[g.id];
  settleOwn(c);
  fundDay(c);
  if (weekday(c.today) === 1) contentWeek(c);
  if (c.today.endsWith('-01')) { sponsorMonth(c); h.hype = Math.max(0, (h.hype ?? 0) - OWN_SHOW.hypeFade); }
}

registerEvents([SPONSOR_OFFER, FUND_OFFER]);
setCareerHooks({ daily, mine: sellAtShow, phase });
