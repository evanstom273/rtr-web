// Scouting (Lyra's redesign): how a major judges a wrestler. Twelve factors, each scored as where you'd rank on
// their roster, weighted by the promotion's taste and its booker's personality, make a grade. Standouts (their
// top 10% at something) lift you a step. The ladder: pass, on their radar, tryout, developmental deal, full deal.
// Promotions only look at people they've heard of: scouts at indie shows, news, word of mouth, or you getting in
// touch. AI signings use the same grade.
import { fansIn, fansTotal, findWrestler, hasTrait, PROMOTIONS, rosterOf, type Wrestler, worksFor, WRESTLERS } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bookerOf, kindOf, type BondKind } from '../world/people';
import { promoRegion, titleClass } from './booker';
import { formOf, letter, makeOffer, person, promoName, resultWorth, setCareerHooks, setSigningPick } from './career';
import { daysBetween, YEAR_DAYS, type Day } from './dates';
import { dealsOf, openToSecond } from './deals';
import { patienceOf } from './patience';
import { trust } from './relations';
import { reach } from './social';
import {
  MAX_MAJORS, NOTICE_CHANCE, SCOUT_BOOKER, SCOUT_EXPERIENCE, SCOUT_FANS_HOME, SCOUT_MEMORY_JUMP, SCOUT_NEWS, SCOUT_PRO, SCOUT_RADAR_MARGIN, SCOUT_RADAR_MATCHES, SCOUT_RADAR_STARS,
  SCOUT_ABSOLUTE, SCOUT_RADAR_WINS, SCOUT_RELATIONS, SCOUT_REPORT, SCOUT_RESULT, SCOUT_SEEN, SCOUT_STANDOUT, SCOUT_STANDOUT_WEIGHT, SCOUT_STYLE, SCOUT_TITLES, SCOUT_TRAITS, SCOUT_WEIGHTS, SCOUT_WORD, SCOUT_YOUTH, type ScoutFactor,
} from './tuning';
import type { Bout, Career, PlayerMatch, ScoutFile, Show } from './types';

export const FACTORS = Object.keys(SCOUT_WEIGHTS) as ScoutFactor[];
export const FACTOR_NAME: Record<ScoutFactor, string> = {
  fans: 'Fanbase', online: 'Online following', rep: 'Reputation', attributes: 'Attributes', results: 'Results', performance: 'Match quality',
  titles: 'Championships', experience: 'Experience', relations: 'Relationships', pro: 'Professionalism', youth: 'Age & potential', traits: 'Personality',
};
export type Step = 'pass' | 'radar' | 'tryout' | 'offer';
const STEPS: Step[] = ['pass', 'radar', 'tryout', 'offer'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const log = (v: number) => Math.log10(Math.max(0, v) + 1);

// ------------------------------------------------------------------ what each promotion values

/** A promotion's weights: the base, its taste, then its booker's personality. */
export function weightsFor(promo: string): Record<ScoutFactor, number> {
  const style = SCOUT_STYLE[promo]?.w ?? {};
  const P = activeWorld().people;
  const traits = P ? bookerOf(P, promo)?.traits ?? [] : [];
  const out = {} as Record<ScoutFactor, number>;
  for (const f of FACTORS) {
    let w = SCOUT_WEIGHTS[f] * (style[f] ?? 1);
    for (const t of traits) w *= SCOUT_BOOKER[t]?.[f] ?? 1;
    out[f] = Math.round(w * 100) / 100;
  }
  return out;
}

// ------------------------------------------------------------------ the raw factors

/** Things worked out once a day for everyone: championship points, and who's friends or enemies with whom. */
interface Day0 { day: Day; c: Career; titles: Map<string, number>; bonds: Map<string, { other: string; kind?: BondKind | 'mentor'; v: number }[]> }
let day0: Day0 | null = null;
function today(c: Career): Day0 {
  // Keyed by the career too: another world on the same date (a new career, a test) mustn't reuse it.
  if (day0?.day === c.today && day0.c === c) return day0;
  const titles = new Map<string, number>();
  const T = SCOUT_TITLES;
  for (const [id, reigns] of Object.entries(activeWorld().history.reigns)) {
    const cls = titleClass(id);
    const base = cls === 'world' ? T.world : cls === 'secondary' || cls === 'alliance' ? T.secondary : cls === 'regional' ? T.regional : id.startsWith('WORLD_') ? T.indieWorld : T.indie;
    for (const r of reigns) {
      const years = Math.max(0, daysBetween(r.from, r.to ?? c.today)) / YEAR_DAYS;
      const pts = base * (r.to ? T.past : 1) + r.defences * T.perDefence + years * T.perYear;
      titles.set(r.holder, (titles.get(r.holder) ?? 0) + pts);
    }
  }
  // Each person's bonds: what it is (a mentorship counts as a friendship), and how the other one feels about them.
  const bonds = new Map<string, { other: string; kind?: BondKind | 'mentor'; v: number }[]>();
  for (const b of Object.values(activeWorld().people?.bonds ?? {})) {
    const kind = b.mentor ? 'mentor' : kindOf(b, c.today);
    (bonds.get(b.a) ?? bonds.set(b.a, []).get(b.a)!).push({ other: b.b, kind, v: b.lb });
    (bonds.get(b.b) ?? bonds.set(b.b, []).get(b.b)!).push({ other: b.a, kind, v: b.la });
  }
  day0 = { day: c.today, c, titles, bonds };
  rosterCache.clear();
  return day0;
}

/** Someone's twelve raw factors as one promotion would see them. */
export function rawFactors(c: Career, w: Wrestler, promo: string): Record<ScoutFactor, number> {
  const d = today(c);
  const p = person(c, w.id);
  // Your form, the first time: from the matches you've already had.
  if (w.id === c.player && !p.form && c.history.length) seedForm(c, p, w);
  const f = formOf(p, w);
  const me = w.id === c.player;
  const focus = SCOUT_STYLE[promo]?.focus;
  const total = w.stats.strength + w.stats.speed + w.stats.stamina + w.stats.skill + w.stats.striking + w.stats.charisma;
  const region = promoRegion(promo);
  // Relationships: their booker, friends and enemies on their roster, and an introduction.
  const P = activeWorld().people;
  const booker = P ? bookerOf(P, promo) : undefined;
  let rel = 0;
  for (const b of d.bonds.get(w.id) ?? []) {
    if (booker && b.other === booker.id) { rel += b.v / 2; continue; }
    const o = findWrestler(b.other);
    if (!o || !worksFor(o, promo)) continue;
    if (b.kind === 'friend' || b.kind === 'best_friend' || b.kind === 'mentor') rel += SCOUT_RELATIONS.perFriend;
    if (b.kind === 'rival' || b.kind === 'enemy') rel += SCOUT_RELATIONS.perEnemy;
  }
  if (me) {
    rel += trust(c, promo) - 50 + (patienceOf(c, promo) - 70) / 2;
    if (c.scout?.[promo]?.intro) rel += SCOUT_RELATIONS.intro;
  }
  // Professionalism: your record (no-shows, fines, the plan, reliability, what bookers think); for anyone else, their personality and standing.
  const PR = SCOUT_PRO;
  let pro = PR.base + (hasTrait(w, 'professional') ? PR.trait : 0) + (hasTrait(w, 'reliable') ? PR.trait : 0) + (hasTrait(w, 'hot_headed') ? -PR.trait : 0);
  if (me) {
    const year = (day: Day) => daysBetween(day, c.today) <= 365;
    pro += (p.noShows ?? []).filter(year).length * PR.noShow;
    pro += c.ledger.filter((e) => year(e.day) && e.text.startsWith('Fined by')).length * PR.fine;
    pro += c.history.filter((m) => year(m.day) && m.planned === 'off-script').length * PR.offScript;
    pro += c.history.filter((m) => year(m.day) && m.planned === 'botched').length * PR.botched;
    pro += c.ledger.filter((e) => year(e.day) && e.kind === 'medical' && e.amount < 0).length * PR.injury;
    pro += (p.daysOff ?? []).filter(year).length * PR.dayOff;
    const pats = Object.values(c.patience ?? {}).map((x) => x.v);
    if (pats.length) pro += (pats.reduce((a, b) => a + b, 0) / pats.length - 70) * PR.patience;
  } else pro += (p.rep - 50) / 5;
  const yearAgo = p.grew?.[0]?.t ?? total;
  const Y = SCOUT_YOUTH;
  return {
    fans: log(fansIn(w, region)) * SCOUT_FANS_HOME + log(fansTotal(w)) * (1 - SCOUT_FANS_HOME),
    online: log(reach(w) * (w.stats.charisma / 70) + (me ? c.hustle?.subs ?? 0 : 0)),
    rep: p.rep,
    attributes: total + (focus ? w.stats[focus] : 0),
    results: f.res,
    performance: f.stars,
    titles: d.titles.get(w.id) ?? 0,
    experience: Math.max(0, w.age - 19) * SCOUT_EXPERIENCE.perYear + f.n * SCOUT_EXPERIENCE.perMatch + f.big * SCOUT_EXPERIENCE.perBig,
    relations: rel,
    pro,
    youth: clamp((Y.old - w.age) / (Y.old - Y.young), 0, 1) * 100 + Math.max(0, total - yearAgo) * Y.perGrowth,
    traits: (w.traits ?? []).reduce((t, x) => t + (SCOUT_TRAITS[x] ?? 0), 0),
  };
}

/** Your form from your match history (for a career that began before form was tracked). */
function seedForm(c: Career, p: ReturnType<typeof person>, w: Wrestler): void {
  const f = formOf(p, w);
  const R = SCOUT_RESULT;
  for (const m of [...c.history].reverse()) {
    const res = resultWorth(findWrestler(m.opp), m.result === 'win', m.result === 'loss');
    f.res = f.res + R.alpha * (res - f.res);
    f.stars = f.stars + R.alpha * (m.stars - f.stars);
    f.n++;
    if (m.title || m.kind === 'special' || m.kind === 'flagship') f.big++;
  }
}

// ------------------------------------------------------------------ the grade

/** A promotion's roster, worked out once a day: every factor sorted (to rank anyone against), and their own grades. */
interface Roster { raws: Record<ScoutFactor, number[]>; grades: number[]; q1: number; median: number; weights: Record<ScoutFactor, number> }
const rosterCache = new Map<string, Roster>();
function rosterOfPromo(c: Career, promo: string): Roster {
  today(c);
  const hit = rosterCache.get(promo);
  if (hit) return hit;
  const ros = rosterOf(promo).filter((w) => !c.people[w.id]?.retired);
  const rows = ros.map((w) => rawFactors(c, w, promo));
  const raws = {} as Record<ScoutFactor, number[]>;
  for (const f of FACTORS) raws[f] = rows.map((r) => r[f]).sort((a, b) => a - b);
  const weights = weightsFor(promo);
  const r: Roster = { raws, grades: [], q1: 0, median: 0, weights };
  r.grades = rows.map((row) => gradeFrom(r, row).grade).sort((a, b) => a - b);
  r.q1 = r.grades[Math.floor(r.grades.length / 4)] ?? 0;
  r.median = r.grades[Math.floor(r.grades.length / 2)] ?? 0;
  rosterCache.set(promo, r);
  return r;
}

/** Where a value would rank among sorted values, 0–100 (ties count half). */
function rank(sorted: number[], v: number): number {
  if (!sorted.length) return 50;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m]! < v) lo = m + 1; else hi = m; }
  let eq = lo;
  while (eq < sorted.length && sorted[eq] === v) eq++;
  return ((lo + (eq - lo) / 2) / sorted.length) * 100;
}

/** A factor's score: most are where you'd rank on their roster; championships, professionalism and personality have their own scale. */
function score(r: Roster, f: ScoutFactor, v: number): number {
  if (f === 'titles') return clamp((v / SCOUT_ABSOLUTE.titlesFull) * 100, 0, 100);
  if (f === 'pro') return clamp(v, 0, 100);
  if (f === 'traits') return clamp(50 + v * SCOUT_ABSOLUTE.traitStep, 0, 100);
  return rank(r.raws[f], v);
}

function gradeFrom(r: Roster, raw: Record<ScoutFactor, number>): { grade: number; scores: Record<ScoutFactor, number> } {
  const scores = {} as Record<ScoutFactor, number>;
  let sum = 0, wsum = 0;
  for (const f of FACTORS) {
    scores[f] = Math.round(score(r, f, raw[f]));
    sum += scores[f] * r.weights[f];
    wsum += r.weights[f];
  }
  return { grade: Math.round((sum / Math.max(1, wsum)) * 10) / 10, scores };
}

export interface Grade {
  promo: string;
  grade: number;
  scores: Record<ScoutFactor, number>;
  weights: Record<ScoutFactor, number>;
  standouts: ScoutFactor[];
  /** What's holding you back most (weighted). */
  weakest: ScoutFactor[];
  /** Their roster's bottom quarter (the tryout bar) and median (the offer bar). */
  q1: number;
  median: number;
  step: Step;
}

/** A promotion's grade of someone, against their roster, and the step it puts them on. */
export function gradeOf(c: Career, w: Wrestler, promo: string): Grade {
  const r = rosterOfPromo(c, promo);
  const g = gradeFrom(r, rawFactors(c, w, promo));
  // A tryout on file moves it, either way.
  const rep = w.id === c.player ? c.scout?.[promo]?.report : undefined;
  const grade = Math.round((g.grade + (rep ? (rep.score - 50) * SCOUT_REPORT.gradeShift : 0)) * 10) / 10;
  const standouts = FACTORS.filter((f) => g.scores[f] >= SCOUT_STANDOUT && r.weights[f] >= SCOUT_STANDOUT_WEIGHT);
  const weakest = [...FACTORS].sort((a, b) => r.weights[b] * (100 - g.scores[b]) - r.weights[a] * (100 - g.scores[a])).slice(0, 3);
  let i = grade >= r.median ? 3 : grade >= r.q1 ? 2 : grade >= r.q1 - SCOUT_RADAR_MARGIN ? 1 : 0;
  if (standouts.length) i = Math.min(3, i + 1);
  return { promo, grade, scores: g.scores, weights: r.weights, standouts, weakest, q1: r.q1, median: r.median, step: STEPS[i]! };
}

// ------------------------------------------------------------------ your file with each major

const fileOf = (c: Career, promo: string): ScoutFile => ((c.scout ??= {})[promo] ??= { stage: 'pass' });

/** They've heard of you now (and how): word of mouth, a friend putting a word in (the phone). */
export const heardOf = (c: Career, promo: string, how: string): void => know(c, promo, how);
function know(c: Career, promo: string, how: string): void {
  const f = fileOf(c, promo);
  if (!f.known) { f.known = c.today; f.how = how; }
}

/** Do they know who you are? On a major's roster, everyone does; a draw in their region, they do; otherwise only if you've been seen. */
export function knows(c: Career, promo: string): boolean {
  const me = findWrestler(c.player)!;
  if (c.scout?.[promo]?.known) return true;
  if (me.promotion !== 'TIS') return true;
  const r = promoRegion(promo);
  const fans = rosterOf(promo).map((w) => fansIn(w, r)).sort((a, b) => a - b);
  return fansIn(me, r) >= (fans[Math.floor(fans.length / 4)] ?? Infinity);
}

/** Can they sign you right now (free, near the end of a deal, or non-exclusive)? */
function signable(c: Career, promo: string): boolean {
  const p = person(c, c.player);
  if (p.next || dealsOf(p).some((k) => k.promo === promo)) return false;
  if (!p.contract) return true;
  return daysBetween(c.today, p.contract.end) <= 183 || openToSecond(p, promo, MAX_MAJORS).ok;
}

/**
 * They look at you, and act on what they see (memory, Lyra's call: after a pass or a failed tryout they only look
 * again once your grade's up a good deal). Returns the step they took, or null if they didn't act.
 */
export function evaluate(c: Career, promo: string, why: string, force = false): Step | null {
  if (!signable(c, promo)) return null;
  const f = fileOf(c, promo);
  const g = gradeOf(c, findWrestler(c.player)!, promo);
  if (!force && f.last !== undefined && (f.stage === 'pass') && g.grade < f.last + SCOUT_MEMORY_JUMP) return null;
  if (f.stage === 'radar' && f.watch && g.step !== 'offer') return null;
  if (f.stage === 'tryout' && g.step !== 'offer' && Object.values(c.tryouts).includes(promo)) return null;
  f.last = g.grade;
  f.lastAt = c.today;
  if (g.step === 'offer') { f.stage = 'offer'; makeOffer(c, promo, why); return 'offer'; }
  if (g.step === 'tryout') { f.stage = 'tryout'; if (!inviteTryout(c, promo)) startWatching(c, promo); return 'tryout'; }
  if (g.step === 'radar') { startWatching(c, promo); return 'radar'; }
  f.stage = 'pass';
  return 'pass';
}

/** You got in touch: they know who you are now. */
export const getInTouch = (c: Career, promo: string): void => know(c, promo, 'you got in touch');
/** What's holding you back with them, in words. */
export const holdingBack = (g: Grade): string => g.weakest.slice(0, 2).map((f) => FACTOR_NAME[f].toLowerCase()).join(' and ');

/** On their radar (Lyra's call): they watch your next few matches, wherever they are. */
export function startWatching(c: Career, promo: string): void {
  const f = fileOf(c, promo);
  f.stage = 'radar';
  f.watch = { stars: [], wins: 0, since: c.today };
  letter(c, { kind: 'news', from: promoName(promo), subject: `${promo} are watching`, body: [`You’re on ${promoName(promo)}’s radar. They’ll be watching your next ${SCOUT_RADAR_MATCHES} matches.`] });
}

/** A tryout invitation (offers.ts sends the letter). False if there's no date for one. */
let tryoutLetter: ((c: Career, promo: string, why?: string) => boolean) | null = null;
export const setTryoutLetter = (f: typeof tryoutLetter): void => { tryoutLetter = f; };
function inviteTryout(c: Career, promo: string, why?: string): boolean {
  const ok = tryoutLetter?.(c, promo, why) ?? false;
  if (ok) fileOf(c, promo).stage = 'tryout';
  return ok;
}

/**
 * An introduction (Lyra's call: a guaranteed look, and the look is a tryout). They know you, the relationship's
 * on file, and the invitation comes in.
 */
export function introduce(c: Career, promo: string, who: string): string {
  const f = fileOf(c, promo);
  know(c, promo, 'introduction');
  f.intro = { who, day: c.today };
  if (!signable(c, promo)) return `${promo} know who you are now.`;
  if (inviteTryout(c, promo, `${findWrestler(who)?.name ?? 'A friend'} put in a word`)) return `${promo} want a tryout: it’s in your mail.`;
  startWatching(c, promo);
  return `${promo} have no date for a tryout yet, so they’re watching your matches.`;
}

// ------------------------------------------------------------------ the tryout's scout report

/** A tryout (Lyra's call): a scout's report on the match. It decides the verdict and stays on file in your grade. */
export function tryoutReport(c: Career, show: Show, m: PlayerMatch): void {
  const promo = show.promo;
  const f = fileOf(c, promo);
  know(c, promo, 'tryout');
  const R = SCOUT_REPORT;
  const me = findWrestler(c.player)!;
  const exec = m.stats && m.stats.movesTried ? (m.stats.movesLanded / m.stats.movesTried) * 100 : 60;
  const crowd = clamp(me.stats.charisma + (m.result === 'win' ? 10 : 0), 0, 100);
  const plan = m.planned === 'kept' ? 100 : m.planned === 'upset' ? 60 : m.planned === 'off-script' ? 20 : m.planned === 'botched' ? 30 : 70;
  const score = Math.round(R.stars * (m.stars / 5) * 100 + R.execution * exec + R.crowd * crowd + R.plan * plan);
  const verdict = score >= R.pass ? 'pass' : score >= R.again ? 'again' : 'no';
  f.report = { score, day: c.today, stars: m.stars, verdict };
  f.last = undefined;
  if (verdict === 'pass') {
    const g = gradeOf(c, me, promo);
    f.stage = g.grade >= g.median || g.standouts.length ? 'offer' : 'dev';
    makeOffer(c, promo, 'After your tryout', f.stage === 'dev' ? 'developmental' : undefined);
    return;
  }
  if (verdict === 'again') {
    letter(c, { kind: 'offer', from: promoName(promo), subject: 'Not yet, but we’re interested', body: [`The scout’s report: ${score}/100. Some of it we liked. We’ll keep watching.`] });
    startWatching(c, promo);
    return;
  }
  f.stage = 'pass';
  f.last = gradeOf(c, me, promo).grade;
  letter(c, { kind: 'offer', from: promoName(promo), subject: 'Thanks, but not yet', body: [`The scout’s report: ${score}/100. Keep working, and we’ll look again when you’ve come on.`] });
}

// ------------------------------------------------------------------ being seen, and their radar

/** After each of your matches: scouts in the crowd, news travelling, and anyone watching you from their radar. */
function afterMatch(c: Career, show: Show, _bout: Bout, m: PlayerMatch): void {
  if (c.spectator) return;
  const rnd = seededRng(hashSeed(c.seed, 'scouts', show.id));
  const big = !!show.special || show.kind === 'special' || show.kind === 'flagship' || (show.brand && (activeWorld().people?.brands[show.brand]?.popularity ?? 0) >= 20);
  const news = !!m.wonTitle || m.stars >= 4;
  for (const p of PROMOTIONS.filter((x) => !x.indie && !x.closed)) {
    const promo = p.initials;
    if (dealsOf(person(c, c.player)).some((k) => k.promo === promo)) continue;
    const home = promoRegion(promo) === show.region;
    // A scout at an indie show.
    if (show.promo === 'TIS' && rnd() < (home ? SCOUT_SEEN.home : SCOUT_SEEN.away) + (big ? SCOUT_SEEN.bigNight : 0)) {
      know(c, promo, `a scout at ${show.name}`);
      if (m.stars >= SCOUT_SEEN.impress) {
        const step = evaluate(c, promo, 'Our scout saw you');
        if (step && step !== 'pass') letter(c, { kind: 'news', from: promoName(promo), subject: `A ${promo} scout was watching`, body: [`A ${promoName(promo)} scout was at ${show.name} and liked what they saw.`] });
      }
    }
    // News travels: a title, a great match.
    if (news && rnd() < (home ? SCOUT_NEWS.home : SCOUT_NEWS.away)) know(c, promo, m.wonTitle ? 'your title win' : 'a great match');
    // Their radar.
    const f = c.scout?.[promo];
    if (f?.stage === 'radar' && f.watch) {
      f.watch.stars.push(m.stars);
      if (m.result === 'win') f.watch.wins++;
      if (f.watch.stars.length >= SCOUT_RADAR_MATCHES) {
        const avg = f.watch.stars.reduce((a, b) => a + b, 0) / f.watch.stars.length;
        const ok = avg >= SCOUT_RADAR_STARS || f.watch.wins >= SCOUT_RADAR_WINS;
        delete f.watch;
        if (ok && signable(c, promo)) {
          if (!inviteTryout(c, promo, 'We liked what we saw')) { f.stage = 'tryout'; makeOffer(c, promo, 'We’ve been watching you', 'developmental'); }
        } else {
          f.stage = 'pass';
          f.last = gradeOf(c, findWrestler(c.player)!, promo).grade;
          letter(c, { kind: 'news', from: promoName(promo), subject: `${promo} have seen enough, for now`, body: [`They watched ${SCOUT_RADAR_MATCHES} of your matches (${avg.toFixed(1)}★ on average). Not yet.`] });
        }
      }
    }
  }
}

/** The first of the month: word of mouth, then every major that knows you takes a look (the monthly round). */
function monthly(c: Career, rnd: Rng): void {
  if (c.spectator) return;
  const P = activeWorld().people;
  if (P) {
    for (const b of today(c).bonds.get(c.player) ?? []) {
      if (!(b.kind === 'friend' || b.kind === 'best_friend' || b.kind === 'mentor') || b.v < 25) continue;
      const o = findWrestler(b.other);
      if (!o || o.promotion === 'TIS') continue;
      for (const promo of [o.promotion, ...(o.also ?? [])]) if (rnd() < SCOUT_WORD) know(c, promo, `${o.name} mentioned you`);
    }
  }
  for (const p of PROMOTIONS.filter((x) => !x.indie && !x.closed)) {
    if (!knows(c, p.initials) || rnd() >= NOTICE_CHANCE) continue;
    evaluate(c, p.initials, 'We’ve been watching you');
  }
}

/** Monthly for everyone: attribute totals for a year back (growth reads as potential). */
function growth(c: Career): void {
  const m = c.today.slice(0, 7);
  for (const w of WRESTLERS) {
    const p = c.people[w.id];
    if (!p || p.retired) continue;
    const t = w.stats.strength + w.stats.speed + w.stats.stamina + w.stats.skill + w.stats.striking + w.stats.charisma;
    const g = (p.grew ??= []);
    if (g.at(-1)?.m === m) continue;
    g.push({ m, t });
    if (g.length > 13) g.splice(0, g.length - 13);
  }
}

// ------------------------------------------------------------------ AI signings

/**
 * The AI's signings use the same grade (Lyra's call): from the free pool, the one this promotion rates highest,
 * each promotion to its own taste.
 */
/** Relationships pull on signings (politics plugs in: friends and a partner on the roster, enemies there). */
let signingPull: (c: Career, w: Wrestler, promo: string) => number = () => 0;
export const setSigningPull = (f: typeof signingPull): void => { signingPull = f; };

export function bestSigning(c: Career, promo: string, pool: Wrestler[]): Wrestler | undefined {
  let best: Wrestler | undefined, top = -1;
  for (const w of pool) {
    const g = gradeOf(c, w, promo).grade + signingPull(c, w, promo);
    if (g > top || (g === top && best && w.id < best.id)) { top = g; best = w; }
  }
  return best;
}

setSigningPick(bestSigning);
setCareerHooks({ mine: afterMatch, monthly: (c, rnd) => { growth(c); monthly(c, rnd); }, tryout: tryoutReport });
