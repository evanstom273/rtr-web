// Booker mode, stage 6 (Lyra's design): a living war. Rival promotions poach your roster (harder if their booker can't
// stand you), run shows against yours (the crowd splits), outbid you for TV; brands on the indies grow into promotions,
// struggling promotions merge, and the broke go bust (the books handle that).
import { databaseChanged, findWrestler, PROMOTIONS, rosterOf, type Promotion } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { bookerOf, likeOf, takeJob } from '../world/people';
import { closeCompany } from './books';
import { letter, person, promoName, release, setCareerHooks } from './career';
import { companies, companyOf, playerRuns, redraw, roleIn } from './company';
import { aiContract } from './deals';
import { addDays } from './dates';
import { registerReplies } from './mail';
import { PROMO_COUNTRIES } from './places';
import { REGION_DATA } from '../world/populate';
import { contractWith } from './signing';
import { openBrand } from './staff';
import { moodToward } from './morale';
import { FEATURES, WAR } from './tuning';
import type { Career, Show } from './types';
export type { Show };

const W = (id: string) => findWrestler(id);
const nameOf = (id: string) => W(id)?.name ?? id;
const P = () => activeWorld().people!;

/** Rival shows the same night in the same region: the crowd splits (your shows). */
export function counterProgrammed(c: Career, show: Pick<Show, 'id' | 'date' | 'region' | 'promo'>): Show[] {
  return Object.values(c.shows).filter((s) => s.id !== show.id && s.date === show.date && s.region === show.region && s.promo !== show.promo && s.promo !== 'TIS' && !s.promos);
}

/** Each month: rivals come for your roster. Stars and the unhappy first; a booker who can't stand you tries harder. */
function poach(c: Career, rnd: Rng): void {
  for (const co of Object.values(companies())) {
    if (co.closed || !playerRuns(co.promo)) continue;
    const rivals = PROMOTIONS.filter((p) => !p.indie && !p.closed && p.initials !== co.promo && !playerRuns(p.initials));
    for (const w of rosterOf(co.promo)) {
      if (w.id === c.player) continue;
      const k = contractWith(c, w.id, co.promo);
      if (!k || k.walk) continue;
      const rival = rivals[Math.floor(rnd() * rivals.length)];
      if (!rival) break;
      const hate = Math.max(0, -likeOf(P(), bookerOf(P(), rival.initials)?.id ?? '', c.player)) / 100;
      const unhappy = moodToward(c, w.id) <= -30 ? WAR.unhappy : 1;
      const star = (rival.popularity ?? 50) >= (PROMOTIONS.find((p) => p.initials === co.promo)?.popularity ?? 0) ? WAR.bigger : 1;
      if (rnd() >= WAR.poach * unhappy * star * (1 + hate)) continue;
      if (c.letters.some((l) => l.ctx?.poached === w.id && !l.replied)) continue;
      letter(c, { kind: 'contract', from: `${co.promo} · the office`, subject: `${rival.initials} want ${w.name}`,
        body: [`${promoName(rival.initials)} have offered ${w.name} a deal. Match it (${Math.round((WAR.match - 1) * 100)}% more a date) or they’re off when their contract’s up.`],
        replies: [{ id: 'war_match', label: 'Match it' }, { id: 'war_let', label: 'Let them go now' }], ctx: { poached: w.id, promo: co.promo, rival: rival.initials }, ignore: { by: addDays(c.today, 14), kind: 'friend' } });
    }
  }
}

/** Your TV deal's up: a bigger rival in your region might take the slot. */
function tvWar(c: Career, rnd: Rng): void {
  for (const co of Object.values(companies())) {
    if (co.closed || !playerRuns(co.promo) || !co.tv || co.tv.until > addDays(c.today, 31)) continue;
    const pop = PROMOTIONS.find((p) => p.initials === co.promo)?.popularity ?? 0;
    const bigger = PROMOTIONS.find((p) => !p.indie && !p.closed && p.initials !== co.promo && (p.popularity ?? 0) > pop + 5);
    if (bigger && rnd() < WAR.tvOutbid) {
      co.tvBlocked = addDays(c.today, 90);
      if (roleIn(c, co.promo)) letter(c, { kind: 'news', from: co.tv.network, subject: `${co.tv.network} won’t renew`, body: [`${promoName(bigger.initials)} offered more for the slot. Your deal runs out on ${co.tv.until}.`] });
    }
  }
}

/** An indie brand that's made a name becomes a promotion (an AI startup, local to begin with). */
function startups(c: Career, rnd: Rng): void {
  const P0 = P();
  for (const b of Object.values(P0.brands)) {
    if (b.closed || (b.popularity ?? 0) < WAR.startupPop || !b.promoter || rnd() >= WAR.startup) continue;
    const pr = P0.staff[b.promoter];
    if (!pr || pr.rep < WAR.startupRep) continue;
    const ini = initialsFor(b.name);
    if (!ini) continue;
    const p: Promotion = { id: Math.max(0, ...PROMOTIONS.map((x) => x.id)) + 1, name: b.name, initials: ini, indie: false, region: REGION_DATA[b.region], titles: [], popularity: Math.round((b.popularity ?? 20) * 0.6) };
    PROMOTIONS.push(p);
    PROMO_COUNTRIES[ini] = [b.country];
    const city = b.city ?? 'Leeds';
    companies()[ini] = { promo: ini, owner: pr.id, tier: 'local', bank: WAR.startupBank, founded: c.today, home: { country: b.country, city }, schedule: [{ name: b.name, kind: 'weekly', when: { weeks: [1, 2, 3, 4] } } as never] };
    b.closed = c.today;
    // The indie scene keeps its shape: a new brand opens in the region.
    openBrand(c, b.region, rnd);
    takeJob(P0, pr, { kind: 'booker', promo: ini }, c.today, 'founded');
    addEvent(activeWorld().history, { day: c.today, kind: 'founded', who: pr.id, name: pr.name, promo: ini, what: `${b.name} goes from indie brand to promotion` });
    redraw(c, ini, addDays(c.today, 7));
    c.mailBox?.push({ day: c.today, subject: `${b.name} becomes a promotion`, body: `${pr.name}’s ${b.name} has gone from running indie shows to a promotion of its own (${ini}).` });
    databaseChanged();
    return;
  }
}
function initialsFor(name: string): string | null {
  const words = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  let base = words.map((x) => x[0]!.toUpperCase()).join('').slice(0, 4);
  if (base.length < 2) base = (words[0] ?? 'NEW').slice(0, 3).toUpperCase();
  let ini = base, n = 2;
  while (PROMOTIONS.some((p) => p.initials === ini) || ini === 'TIS') { ini = `${base}${n++}`; if (n > 9) return null; }
  return ini;
}

/** Two struggling promotions in the same region merge: the bigger takes the smaller's roster, the smaller closes. */
function merges(c: Career, rnd: Rng): void {
  const sick = Object.values(companies()).filter((co) => !co.closed && !playerRuns(co.promo) && (co.red ?? 0) >= WAR.mergeRed);
  for (const a of sick) {
    const pa = PROMOTIONS.find((p) => p.initials === a.promo)!;
    const b = sick.find((x) => x !== a && !x.closed && PROMOTIONS.find((p) => p.initials === x.promo)?.region === pa.region);
    if (!b || rnd() >= WAR.merge) continue;
    const [keep, fold] = (pa.popularity ?? 0) >= (PROMOTIONS.find((p) => p.initials === b.promo)?.popularity ?? 0) ? [a, b] : [b, a];
    const movers = rosterOf(fold.promo);
    for (const w of movers) {
      release(c, w, 'released', fold.promo);
      w.promotion = keep.promo;
      person(c, w.id).contract = aiContract(rnd, w, keep.promo, c.today, 12);
    }
    keep.bank += Math.max(0, fold.bank);
    closeCompany(c, fold.promo, `merged into ${promoName(keep.promo)}`);
    return;
  }
}

function monthly(c: Career): void {
  if (!FEATURES.booker) return;
  const rnd = seededRng(hashSeed(c.seed, 'war', c.today));
  poach(c, rnd);
  tvWar(c, rnd);
  startups(c, rnd);
  merges(c, rnd);
}

registerReplies({
  war_match: (c, l) => {
    const k = contractWith(c, l.ctx?.poached ?? '', l.ctx?.promo ?? '');
    if (!k || !roleIn(c, l.ctx?.promo ?? '')) return 'Too late.';
    k.fee = Math.round((k.fee * WAR.match) / 5) * 5;
    return `${nameOf(l.ctx!.poached!)} stays: £${k.fee.toLocaleString('en-GB')} a date.`;
  },
  war_let: (c, l) => {
    const who = l.ctx?.poached ?? '', promo = l.ctx?.promo ?? '', rival = l.ctx?.rival ?? '';
    const w = W(who);
    if (!w || !contractWith(c, who, promo)) return 'They’ve gone already.';
    release(c, w, 'released', promo);
    if (companyOf(rival) && !companyOf(rival)!.closed) { w.promotion = rival; person(c, who).contract = aiContract(seededRng(hashSeed(c.seed, 'poached', who)), w, rival, c.today, 12); }
    return `${w.name} is off to ${rival}.`;
  },
});
// Ignored: they go when their deal's up.
setCareerHooks({
  monthly,
  daily: (c) => {
    if (!FEATURES.booker) return;
    for (const l of c.letters) {
      if (!l.ctx?.poached || l.replied || !l.ignore || l.ignore.by !== c.today) continue;
      const k = contractWith(c, l.ctx.poached, l.ctx.promo ?? '');
      if (k) k.walk = true;
    }
  },
});

