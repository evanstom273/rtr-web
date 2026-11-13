// Feuds, rebuilt (Lyra's design, five rounds of questions). A feud is a story that runs as long as it's hot: the
// spark, building it, escalation, the blow-off. You start one yourself (a call-out, an attack, a promo), the booker
// hands you one, one grows out of a bad loss or a real grudge, or a rival comes for you. One at a time for you. The
// booker plans its matches as a story (trading wins, the right one going over at the end), each nastier than the last,
// allies bringing tag and handicap matches, stakes on the blow-off, which you can call yourself. Its segments are
// played (promos as a minigame, brawls as a mini match: segments.ts). Your rival acts between shows by who they are and
// how they really feel about you. It can go wrong: cold feuds die, people get hurt, real fights, the office pulls it.
// A feud pays: better matches, fans, money, a push. Everyone else's are on the Feuds screen, and you can get involved.
import { findWrestler, globalScore, PROMOTIONS, TITLES, WRESTLERS, hasTrait, type Title, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { stipulation } from '../engine/stipulations';
import type { StipulationId } from '../engine/types';
import { willing } from '../world/matchWorld';
import { activeWorld } from '../world/world';
import { bondOf, likeOf } from '../world/people';
import { moveRelation } from './relations';
import { letter as post, person, setCareerHooks, setFeudRulesHook, spend } from './career';
import { dealWith } from './deals';
import { HARDCORE_STIPS, setCardHook, setFeudBoutHook, setFeudTitleHook } from './booker';
import { tierOf } from './clauses';
import { multiBout } from './bouts';
import { playerRuns } from './company';
import { rateSegment, SEG_LABEL } from './card';
import { addDays, daysBetween, fmtDay, weekday } from './dates';
import { registerReplies, replyTo } from './mail';
import { setSegStop, setStoryAnswer } from './skip';
import { routineOf } from './day';
import { likeOf as likeIn } from '../world/people';
import { playerHas } from './leans';
import { postToFeed, setCalloutHook } from './social';
import { STAKE_LABEL, type StakeKind } from './stakes';
import { FEATURES, FEUD, SEGMENT, STORY } from './tuning';
import type { Bout, Career, Feud, SegKind, Segment, Show } from './types';

const W = (id: string): Wrestler | undefined => findWrestler(id);
export const nameOf = (id: string) => W(id)?.name ?? id;
const clampHeat = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const on = () => FEATURES.feuds2;
const rngOf = (c: Career, ...k: (string | number)[]): Rng => seededRng(hashSeed(c.seed, 'feud2', ...k));
/** Every feud letter is a storyline beat: with "Sim them" on, a skip carries on past it (Lyra's call). */
const letter = (c: Career, l: Parameters<typeof post>[1]) => post(c, { ...l, story: true });

// ------------------------------------------------------------------ heat, stages, the story so far

export type FeudStage = NonNullable<Feud['stage']>;
export const STAGES: FeudStage[] = ['spark', 'building', 'escalation', 'blowoff'];
export const STAGE_LABEL: Record<FeudStage, string> = { spark: 'The spark', building: 'Building', escalation: 'Escalation', blowoff: 'The blow-off' };
export const STAGE_HINT: Record<FeudStage, string> = {
  spark: 'Words first: promos, a confrontation. Get them talking about it.',
  building: 'Matches start: they trade wins. Every segment adds to it.',
  escalation: 'It’s personal now: attacks, nastier stipulations, friends getting involved. The blow-off’s set.',
  blowoff: 'The big one. Everything it’s built to.',
};
export const stageOf = (f: Feud): FeudStage => f.stage ?? (f.payoff ? 'building' : 'spark');

/** A feud's heat: set the first time it's needed (a title, real bad blood, an old rivalry start it hotter). */
export function feudHeat(f: Feud): number {
  if (f.heat === undefined) f.heat = clampHeat(STORY.start + (f.title ? STORY.title : 0) + (f.real ? STORY.grudge : 0) + (f.how === 'reignited' ? FEUD.reignite : 0));
  return f.heat;
}
/** Move a feud's heat, with a line for its story (the last ones kept). */
export function feudBeat(c: Career, f: Feud, t: string, d: number): void {
  f.heat = clampHeat(feudHeat(f) + d);
  f.peak = Math.max(f.peak ?? 0, f.heat);
  f.beats = [{ day: c.today, t, d: Math.round(d) }, ...(f.beats ?? [])].slice(0, FEUD.keepBeats);
}
/** Something that moves a feud on (the first match, an attack, a stipulation agreed, a betrayal). */
export function moment(c: Career, f: Feud, key: string, t: string, d: number): void {
  if (!(f.moments ??= []).includes(key)) f.moments.push(key);
  feudBeat(c, f, t, d);
}
export const feudWord = (h: number): string => (h >= 80 ? 'White hot' : h >= 60 ? 'Hot' : h >= 40 ? 'Warm' : h >= 20 ? 'Simmering' : 'Cold');
export const liveFeuds = (c: Career): Feud[] => c.feuds.filter((f) => !f.done);
export const myFeud = (c: Career): Feud | undefined => liveFeuds(c).find((f) => f.a === c.player || f.b === c.player);
export const myFeuds = (c: Career): Feud[] => liveFeuds(c).filter((f) => f.a === c.player || f.b === c.player);
export function feudBetween(c: Career, x: string, y: string): Feud | undefined {
  return c.feuds.find((f) => !f.done && ((f.a === x && f.b === y) || (f.a === y && f.b === x)));
}
export const rivalOf = (c: Career, f: Feud): string => (f.a === c.player ? f.b : f.a);
const mine = (c: Career, f: Feud) => f.a === c.player || f.b === c.player;
const office = (promo: string) => `${promo} · the office`;
const myPromo = (c: Career): string | undefined => person(c, c.player).contract?.promo;

/** The promotion's next shows (not played), soonest first. */
const ahead = (c: Career, promo: string, from = c.today) => Object.values(c.shows).filter((s) => s.promo === promo && s.date > from && !s.done).sort((a, b) => (a.date < b.date ? -1 : 1));
const big = (s: Show) => s.kind === 'special' || s.kind === 'flagship';

// ------------------------------------------------------------------ title feuds (Lyra: a feud with a champion is for the title)

const T = (id?: string): Title | undefined => (id ? TITLES.find((t) => t.id === id) : undefined);
export const titleName = (f: Feud): string | undefined => T(f.title)?.name;
/**
 * The title a feud's over: one of them holds a singles title in its promotion (the biggest, if both do) that no other
 * live feud is about, and the other could hold it (the same division). The belt goes on the line at the blow-off.
 */
export function titleAtStake(c: Career, f: Pick<Feud, 'id' | 'a' | 'b' | 'promo'>): string | undefined {
  const p = PROMOTIONS.find((x) => x.initials === f.promo);
  if (!p || f.promo === 'TIS') return undefined;
  for (const id of p.titles) {
    const t = T(id);
    if (!t || t.retired || t.kind === 'tag' || t.kind === 'trios' || !t.holder || (t.holder !== f.a && t.holder !== f.b)) continue;
    if (W(t.holder === f.a ? f.b : f.a)?.gender !== t.gender) continue;
    if (c.feuds.some((x) => !x.done && x.id !== f.id && x.title === t.id)) continue;
    return t.id;
  }
  return undefined;
}
/** Each day: a feud whose champion lost the belt elsewhere goes back to personal; one where someone's won a belt takes it on. */
function syncTitle(c: Career, f: Feud): void {
  if (f.title) {
    const t = T(f.title);
    if (t && (t.holder === f.a || t.holder === f.b)) return;
    delete f.title;
    feudBeat(c, f, `The ${t?.name ?? 'title'} is out of it now: it’s just personal`, 0);
    if (mine(c, f)) letter(c, { kind: 'news', from: office(f.promo), subject: `You and ${nameOf(rivalOf(c, f))}: the title’s off the table`, body: [`The ${t?.name ?? 'title'} isn’t part of it any more. The feud carries on: it’s just personal now.`] });
  }
  const id = titleAtStake(c, f);
  if (!id) return;
  f.title = id;
  const t = T(id)!;
  feudBeat(c, f, `The ${t.name} is on the line at the blow-off`, STORY.title / 2);
  if (mine(c, f)) letter(c, { kind: 'news', from: office(f.promo), subject: `You and ${nameOf(rivalOf(c, f))}: for the ${t.name}`, body: [`${t.holder === c.player ? 'You’re the champion now, so' : `${nameOf(t.holder!)} is the champion now, so`} the ${t.name} goes on the line when it blows off.`] });
}
/**
 * A title feud's blow-off (the title match the booker books): the story picks the winner, and the title's own rhythm
 * has a say (a new champion tends to keep it, a long reign tends to end), more the story's the hotter it is.
 * Your contract's protection for a new champion stands.
 */
function feudTitle(c: Career, f: Feud, show: Show, champ: string, challenger: string, retain: number): Pick<Bout, 'planned' | 'stip' | 'stakes'> | undefined {
  if (!on()) return undefined;
  const r = rngOf(c, 'title', f.id, show.id);
  const w = Math.min(0.9, FEUD.titleStory + feudHeat(f) / FEUD.titleHeatDiv);
  const keep = retain >= 0.98 ? retain : w * (blowoffWinner(c, f) === champ ? 1 : 0) + (1 - w) * retain;
  const stip = stipFor(f, true, r);
  const stakes = f.called?.stakes && f.called.stakes !== 'contendership' ? f.called.stakes : undefined;
  return { planned: r() < keep ? champ : challenger, ...(stip ? { stip } : {}), ...(stakes ? { stakes: { kind: stakes } } : {}) };
}

/** Set (or move) the blow-off: the first big show at least `days` out, else any show that far out. */
export function setPayoff(c: Career, f: Feud, days: number = FEUD.payoffWeeks * 7, why = 'Building to'): Show | undefined {
  const far = (s: Show) => daysBetween(c.today, s.date) >= days;
  const pay = ahead(c, f.promo).find((s) => big(s) && far(s)) ?? ahead(c, f.promo).find(far);
  if (!pay) return undefined;
  f.payoff = pay.id;
  feudBeat(c, f, `${why} ${pay.name}`, 0);
  return pay;
}

/** Each day: a feud moves on by its heat, what's happened, and time; a hot one's blow-off can be put back. */
function advance(c: Career, f: Feud): void {
  const st = stageOf(f), heat = feudHeat(f), age = daysBetween(f.start, c.today);
  const has = (k: string) => (f.moments ?? []).includes(k);
  const pay = f.payoff ? c.shows[f.payoff] : undefined;
  if (st === 'spark' && (heat >= FEUD.stage.build || (f.moments?.length ?? 0) >= 1 || age >= FEUD.stage.sparkDays)) {
    f.stage = 'building';
    feudBeat(c, f, 'It’s building', 0);
    if (mine(c, f)) letter(c, { kind: 'news', from: office(f.promo), subject: `You and ${nameOf(rivalOf(c, f))}: it’s building`, body: ['The matches start now. Win the crowd over in the segments and it’ll get hotter.'] });
  } else if (st === 'building' && (heat >= FEUD.stage.escalate || has('attack') || has('stip') || has('betrayal') || (age >= FEUD.stage.buildDays && heat >= 35))) {
    f.stage = 'escalation';
    // The blow-off gets its date now (unless it's set already and far enough off).
    if (!pay || daysBetween(c.today, pay.date) < 14) setPayoff(c, f, FEUD.payoffWeeks * 7, 'The blow-off: ');
    feudBeat(c, f, 'It’s personal now', 5);
    const p = f.payoff ? c.shows[f.payoff] : undefined;
    const tn = titleName(f);
    if (mine(c, f)) letter(c, { kind: 'news', from: office(f.promo), subject: `You and ${nameOf(rivalOf(c, f))}: it’s personal now`, body: [p ? `The blow-off is set for ${p.name}${tn ? `, with the ${tn} on the line` : ''}. Until then: nastier matches, and anything goes.` : `The blow-off goes on a big show as soon as there’s one far enough off${tn ? `, with the ${tn} on the line` : ''}.`] });
  } else if (st === 'escalation' && pay && daysBetween(c.today, pay.date) <= 7) {
    // Too hot to end: the booker puts it back to the next big show (a couple of times at most), unless you called it.
    if (heat >= FEUD.extendAt && (f.ext ?? 0) < FEUD.extendMax && !f.called) {
      const later = ahead(c, f.promo, pay.date).find((s) => big(s) && daysBetween(pay.date, s.date) >= 21);
      if (later) {
        f.payoff = later.id; f.ext = (f.ext ?? 0) + 1;
        feudBeat(c, f, `Too hot to end: the blow-off moves to ${later.name}`, 0);
        if (mine(c, f)) letter(c, { kind: 'news', from: office(f.promo), subject: 'It’s too hot to end', body: [`The crowd can’t get enough of you and ${nameOf(rivalOf(c, f))}. The blow-off moves to ${later.name}.`] });
        return;
      }
    }
    f.stage = 'blowoff';
    feudBeat(c, f, `Blow-off week: ${pay.name}`, 0);
  }
}

// ------------------------------------------------------------------ starting one (yours: one at a time)

export type StartHow = 'callout' | 'attack' | 'promo';
export const START_LABEL: Record<StartHow, string> = { callout: 'Call them out', attack: 'Jump them', promo: 'Cut a promo on them' };
export const START_HINT: Record<StartHow, string> = {
  callout: 'Online and on the mic: words first',
  attack: 'Backstage, out of nowhere: a brawl on the next show',
  promo: 'Take the mic on the next show and start it properly',
};

/** Who you could start a feud with: your promotion's roster (anyone not tied up in one of their own). */
export function rivalsFor(c: Career): Wrestler[] {
  const promo = myPromo(c);
  if (!promo) return [];
  const busy = new Set(liveFeuds(c).flatMap((f) => [f.a, f.b]));
  const me = W(c.player)!;
  return WRESTLERS.filter((w) => w.id !== c.player && !c.people[w.id]?.retired && (w.promotion === promo || !!w.also?.includes(promo)) && !busy.has(w.id))
    .sort((a, b) => Math.abs(globalScore(a) - globalScore(me)) - Math.abs(globalScore(b) - globalScore(me)));
}
/** An old feud between you two (it can reignite). */
export const oldFeud = (c: Career, id: string) => (activeWorld().history.feuds ?? []).find((x) => (x.a === c.player && x.b === id) || (x.b === c.player && x.a === id));

function makeFeud(c: Career, promo: string, rival: string, how: NonNullable<Feud['how']>, heat = 0): Feud {
  const old = oldFeud(c, rival);
  const f: Feud = { id: `f${++c.seq}`, promo, a: c.player, b: rival, start: c.today, payoff: null, matches: 0, done: false, stage: 'spark', how: old && how === 'organic' ? 'reignited' : how, moments: [], wins: {} };
  const title = titleAtStake(c, f);
  if (title) f.title = title;
  feudHeat(f);
  if (heat) f.heat = clampHeat(f.heat! + heat);
  if (old) feudBeat(c, f, `It started back in ${old.start.slice(0, 4)}, and it never really ended`, FEUD.reignite);
  c.feuds.push(f);
  return f;
}

/** You start it: a call-out, an attack (a brawl on the next show), or a promo on the next show. */
export function startFeud(c: Career, rival: string, how: StartHow): string {
  if (!on()) return '';
  if (myFeud(c)) return 'You’re in a feud already: one at a time.';
  const promo = myPromo(c);
  if (!promo) return 'You need a promotion to feud in.';
  const r = W(rival);
  if (!r || !rivalsFor(c).some((w) => w.id === rival)) return 'They’re not available.';
  const f = makeFeud(c, promo, rival, 'player', FEUD.startHeat[how]);
  const next = ahead(c, promo, addDays(c.today, -1))[0];
  if (how === 'callout') {
    postToFeed(c, `${r.name}. You and me. Any time you like.`);
    moment(c, f, 'callout', `You called ${r.name} out`, 0);
  } else {
    (c.segAsks ??= {});
    if (next) c.segAsks[next.id] = { kind: how === 'attack' ? 'beatdown' : 'promo', ok: true };
    if (next?.card) placeAsk(c, next, next.card, f, how === 'attack' ? 'beatdown' : 'promo');
    feudBeat(c, f, how === 'attack' ? `You’re going to jump ${r.name}` : `You’re taking the mic on ${r.name}`, 0);
  }
  moveRelation(c, rival, -3, 'You started a feud with them');
  const tn = titleName(f);
  return `It’s on: you and ${r.name}.${how !== 'callout' && next ? ` ${how === 'attack' ? 'You jump them' : 'You cut the promo'} on ${next.name}.` : ''}${tn ? ` The ${tn} is on the line at the blow-off.` : ''}`;
}

/** The ways a feud comes to you: the booker hands you one, one grows out of something, or a rival comes for you. */
function comesToYou(c: Career): void {
  if (myFeud(c)) return;
  const promo = myPromo(c);
  const p = person(c, c.player);
  if (!promo || p.injury || p.retired || playerRuns(promo)) return;
  const r = rngOf(c, 'comes', c.today);
  const pool = rivalsFor(c).slice(0, 12);
  if (!pool.length) return;
  // The booker: about one a month when you're not in one.
  if (r() < FEUD.assignDaily) {
    const rival = pool[Math.floor(r() * Math.min(5, pool.length))]!;
    makeFeud(c, promo, rival.id, 'booker');
    letter(c, { kind: 'news', from: office(promo), subject: `A storyline: you and ${rival.name}`, body: [`The office has you in a feud with ${rival.name}. It starts on the next show.`, 'Make it worth watching.'] });
    return;
  }
  // A rival comes for you (hot-heads and egos, mostly): bite or don't.
  const hungry = pool.filter((w) => hasTrait(w, 'hot_headed') || hasTrait(w, 'egotistical') || hasTrait(w, 'showboat'));
  if (hungry.length && r() < FEUD.rivalComesDaily) {
    const w = hungry[Math.floor(r() * hungry.length)]!;
    letter(c, {
      kind: 'news', from: w.name, fromId: w.id, subject: 'You and me',
      body: [`${w.name} has been running their mouth about you all week: you’re overrated, you’re scared, you’ve been handed everything. Now they want you.`],
      replies: [{ id: 'feud_bite', label: 'Bite', detail: 'It’s on' }, { id: 'feud_ignore', label: 'Ignore them', detail: 'Rise above it (they’ll call you scared)' }],
      ctx: { who: w.id, promo },
    });
  }
}

registerReplies({
  feud_bite: (c, l) => {
    const who = l.ctx!.who!, promo = l.ctx!.promo!;
    if (myFeud(c)) return 'You’re in a feud already.';
    const f = makeFeud(c, promo, who, 'rival', 10);
    moment(c, f, 'callout', `${nameOf(who)} came for you, and you bit`, 0);
    return `It’s on: you and ${nameOf(who)}.`;
  },
  feud_ignore: (c, l) => {
    const p = person(c, c.player);
    p.rep = Math.max(0, p.rep - 1);
    moveRelation(c, l.ctx!.who!, -3, 'You ignored them');
    return 'You rise above it. They tell everyone you’re scared.';
  },
});

/** A feud that grows on its own: a bad loss to someone who can't stand you, or a beef online. */
function grows(c: Career, rival: string, why: string): void {
  if (!on() || myFeud(c)) return;
  const promo = myPromo(c);
  const w = W(rival);
  if (!promo || !w || !(w.promotion === promo || w.also?.includes(promo)) || liveFeuds(c).some((f) => f.a === rival || f.b === rival)) return;
  const f = makeFeud(c, promo, rival, 'organic', 8);
  moment(c, f, 'grudge', why, 0);
  letter(c, { kind: 'news', from: office(promo), subject: `You and ${w.name}: it’s a thing now`, body: [`${why}. The crowd’s picked up on it, and so has the office: it’s a feud.`] });
}

// ------------------------------------------------------------------ the matches: a story

/** Who goes over at the blow-off: the face over the heel; else the bigger star (or the one with a say in it). */
function blowoffWinner(c: Career, f: Feud): string {
  const a = W(f.a)!, b = W(f.b)!;
  if (a.disposition !== b.disposition && (a.disposition === 'FACE' || b.disposition === 'FACE')) return a.disposition === 'FACE' ? a.id : b.id;
  const say = (w: Wrestler) => (w.id === c.player ? 0 : Math.max(0, ...[f.promo].map((p) => (dealWith(c.people[w.id], p)?.clauses?.[0] ?? 0))));
  void say;
  return globalScore(a) >= globalScore(b) ? a.id : b.id;
}
/** The nastier the further it's gone: each match a step up the ladder, the blow-off the nastiest (or the one you called). */
function stipFor(f: Feud, payoff: boolean, r: Rng): StipulationId | undefined {
  const heat = feudHeat(f);
  // Weapons only with people who'll have them (anyone who won't do hardcore gets the cage, I quit or a straight match).
  const clean = [f.a, f.b].some((id) => { const w = W(id); return !!w && willing(w) < 0; });
  if (payoff) {
    if (f.called?.stip) return f.called.stip;
    const top = clean ? (heat >= 55 ? FEUD.cleanBlowoff : []) : heat >= 80 ? FEUD.blowoffStips.hot : heat >= 55 ? FEUD.blowoffStips.warm : FEUD.blowoffStips.cool;
    const s = top[Math.floor(r() * top.length)];
    return s && s !== 'standard' ? (s as StipulationId) : undefined;
  }
  const ladder = clean ? FEUD.cleanLadder : FEUD.ladder;
  const s = ladder[Math.min(ladder.length - 1, (f.matches ?? 0) + (heat >= 70 ? 1 : 0) + (stageOf(f) === 'escalation' ? 1 : 0))]!;
  return s === 'standard' ? undefined : (s as StipulationId);
}
/** Weapons legal and no DQ: only for people who'll do hardcore. */
export const hardcoreStip = (s: StipulationId): boolean => { const d = stipulation(s); return d.weapons && !d.dq; };
/** Someone's closest friend on the roster (for tag and handicap matches, and run-ins). */
export function allyOf(c: Career, id: string, promo: string, not: string[] = []): string | undefined {
  const P = activeWorld().people;
  if (!P) return undefined;
  let best: string | undefined, score = FEUD.allyLike;
  for (const w of WRESTLERS) {
    if (w.id === id || not.includes(w.id) || c.people[w.id]?.retired || !(w.promotion === promo || w.also?.includes(promo))) continue;
    const b = bondOf(P, id, w.id);
    if (!b) continue;
    const like = likeOf(P, id, w.id) ?? 0;
    if (like > score) { score = like; best = w.id; }
  }
  return best;
}

/** A feud's match on this show (or null: not tonight). The booker's story: when, the stipulation, allies, the stakes, who wins. */
export function bookFeudBout(c: Career, f: Feud, show: Show, free: (id: string) => boolean): Bout | null | undefined {
  if (!on()) return undefined;
  const r = rngOf(c, 'bout', f.id, show.id);
  const payoff = f.payoff === show.id, st = stageOf(f);
  if (!payoff) {
    if (st === 'spark') return null;
    if (f.lastMatch && daysBetween(f.lastMatch, show.date) < FEUD.matchGap) return null;
    if (show.kind === 'weekly' && r() < FEUD.weeklySkip) return null;
    if (show.kind !== 'weekly' && !big(show) && r() < 0.6) return null;
  }
  const wins = f.wins ?? {};
  const wa = wins[f.a] ?? 0, wb = wins[f.b] ?? 0;
  const heel = W(f.a)?.disposition === 'HEEL' ? f.a : W(f.b)?.disposition === 'HEEL' ? f.b : undefined;
  // The story: the blow-off goes to the right one; before that they trade (the heel first, by cheating).
  const planned = payoff ? blowoffWinner(c, f) : wa === wb ? (heel && wa === 0 ? heel : (f.beats ?? []).some((b) => b.t.startsWith(nameOf(f.a))) ? f.b : f.a) : wa < wb ? f.a : f.b;
  const stip = stipFor(f, payoff, r);
  const stakes: StakeKind | undefined = payoff ? f.called?.stakes ?? (feudHeat(f) >= 85 && !f.title && r() < 0.25 ? 'loser_leaves' : undefined) : undefined;
  // Friends get involved: a tag match, or two on one, from escalation on.
  if (FEATURES.matches && (st === 'escalation' || (payoff && r() < 0.3)) && !stakes && r() < FEUD.allyChance) {
    const xa = allyOf(c, f.a, f.promo, [f.b]), xb = allyOf(c, f.b, f.promo, [f.a]);
    const okA = xa && free(xa), okB = xb && free(xb) && xb !== xa;
    if (okA && okB) return { ...multiBout([[f.a, xa!], [f.b, xb!]], { tag: true, type: 'tag' }, mine(c, f) ? c.player : undefined), feud: f.id, planned: planned === f.a ? f.a : f.b };
    if (okA || okB) {
      const sides = okA ? [[f.a, xa!], [f.b]] : [[f.a], [f.b, xb!]];
      return { ...multiBout(sides, { type: 'handicap' }, mine(c, f) ? c.player : undefined), feud: f.id, planned };
    }
  }
  return {
    a: f.a, b: f.b, feud: f.id, planned,
    ...(!payoff && planned === heel && wa + wb === 0 ? { finish: 'cheat' as const } : {}),
    ...(stip ? { stip } : {}),
    ...(stakes ? { stakes: { kind: stakes } } : {}),
  };
}
setFeudBoutHook(bookFeudBout);
setFeudTitleHook(feudTitle);

/** You call the blow-off: the next big show at least two weeks off, with the stakes and stipulation you want. */
export const CALL_STAKES: StakeKind[] = ['loser_leaves', 'hair', 'mask', 'contendership'];
export const CALL_STIPS: StipulationId[] = ['street_fight', 'last_man_standing', 'steel_cage', 'i_quit', 'falls_count_anywhere', 'no_dq', 'iron_man', 'two_out_of_three', 'submission'];
export function callBlowoff(c: Career, stakes?: StakeKind, stip?: StipulationId): string {
  const f = myFeud(c);
  if (!f) return 'You’re not in a feud.';
  if (stageOf(f) === 'spark') return 'It hasn’t got going yet: the crowd needs a reason to care first.';
  if (f.called) return 'You’ve called it already.';
  if (stakes === 'mask' && !(W(c.player)?.masked && W(rivalOf(c, f))?.masked)) return 'Mask against mask needs two masks.';
  if (stakes === 'contendership' && f.title) return `The ${titleName(f) ?? 'title'}’s already on the line.`;
  const them = W(rivalOf(c, f));
  // Match Conditions (no hardcore stipulations) in either contract rules it out.
  if (stip && HARDCORE_STIPS.has(stip)) {
    const no = [c.player, rivalOf(c, f)].find((id) => tierOf(dealWith(c.people[id], f.promo), 'conditions') >= 1);
    if (no) return `${no === c.player ? 'Your' : `${nameOf(no)}’s`} contract rules out a ${stipulation(stip).name.toLowerCase()}. Pick another way to settle it.`;
  }
  if (stip && hardcoreStip(stip) && them && willing(them) < 0) return `${them.name} won’t do a ${stipulation(stip).name.toLowerCase()}. Pick another way to settle it.`;
  f.called = { ...(stakes ? { stakes } : {}), ...(stip ? { stip } : {}) };
  const pay = setPayoff(c, f, 14, 'You called it: the blow-off at');
  if (!pay) { delete f.called; return 'There’s no show far enough off yet.'; }
  f.stage = 'escalation';
  if (stip) moment(c, f, 'stip', 'The stipulation’s agreed', 6);
  return `Done: ${pay.name}, ${fmtDay(pay.date, 'dm')}${stip ? `, ${stipulation(stip).name.toLowerCase()}` : ''}${stakes ? `, ${STAKE_LABEL[stakes].toLowerCase()}` : ''}.`;
}

// ------------------------------------------------------------------ segments on the card

/** What a feud's segment is, by where it's at: early on words, then hands, then (near the payoff) a signing. */
function kindFor(f: Feud, payoffIn: number, r: () => number): SegKind {
  const st = stageOf(f);
  if (payoffIn >= 0 && payoffIn <= 14 && r() < 0.35) return 'signing';
  if (st === 'spark') return r() < 0.5 ? 'promo' : r() < 0.5 ? 'faceoff' : 'interview';
  const x = r();
  if (st === 'building') return x < 0.4 ? 'promo' : x < 0.6 ? 'faceoff' : x < 0.8 ? 'backstage' : 'beatdown';
  return x < 0.3 ? 'promo' : x < 0.55 ? 'beatdown' : x < 0.75 ? 'runin' : x < 0.9 ? 'faceoff' : 'backstage';
}

/** A card the AI's drawn: its feuds get their segments (TV and big shows; yours only when you're on the show). */
export function feudSegments(c: Career, show: Show, card: Bout[]): void {
  if (!on() || show.promo === 'TIS' || playerRuns(show.promo)) return;
  const tv = ['weekly', 'flagship', 'special'].includes(show.kind);
  const r = seededRng(hashSeed(c.seed, 'feudseg', show.id));
  const here = (id: string) => card.some((b) => b.a === id || b.b === id || !!b.sides?.flat().includes(id));
  // One you asked for (or a rival's, or your start): on it goes, if you're on the show.
  const ask = c.segAsks?.[show.id];
  if (ask?.ok) {
    const f = myFeud(c);
    if (f && f.promo === show.promo && here(c.player) && !(show.segments ?? []).some((g) => g.feud === f.id && g.who.includes(c.player))) placeAsk(c, show, card, f, ask.kind);
  }
  const segs: Segment[] = [...(show.segments ?? [])];
  const feuds = liveFeuds(c).filter((f) => f.promo === show.promo && f.by !== 'player').sort((x, y) => feudHeat(y) - feudHeat(x));
  for (const f of tv ? feuds : []) {
    if (segs.filter((g) => g.feud).length >= FEUD.segsPerShow) break;
    if (segs.some((g) => g.feud === f.id)) continue;
    const isMine = mine(c, f);
    if (isMine && !here(c.player)) continue;
    if (r() > (isMine ? FEUD.segMine : FEUD.segChance)) continue;
    const pay = f.payoff ? c.shows[f.payoff] : undefined;
    if (f.payoff === show.id) continue;
    const kind = kindFor(f, pay ? daysBetween(show.date, pay.date) : -1, r);
    const [x, y] = r() < 0.5 ? [f.b, f.a] : [f.a, f.b];
    const theirs = card.findIndex((b) => b.a === y || b.b === y);
    const who = kind === 'interview' ? [isMine ? c.player : x] : [x, y];
    const k: SegKind = kind === 'runin' && theirs < 0 ? 'beatdown' : kind;
    const after = k === 'runin' ? theirs : Math.floor(r() * Math.max(1, card.length - 1));
    segs.push({ kind: k, who, after: Math.max(-1, after), feud: f.id });
  }
  if (segs.length) show.segments = segs;
}
setCardHook(feudSegments);

/** Your segments on a show (the index on the show's list with them). */
export const mySegments = (c: Career, show: Show): [number, Segment][] => (show.segments ?? []).map((g, i) => [i, g] as [number, Segment]).filter(([, g]) => g.who.includes(c.player));
/** Your segment tonight that's still to be done. */
export function segmentToday(c: Career): { show: Show; i: number; g: Segment } | undefined {
  for (const s of Object.values(c.shows)) {
    if (s.date !== c.today || s.done) continue;
    for (const [i, g] of mySegments(c, s)) if (g.score === undefined) return { show: s, i, g };
  }
  return undefined;
}

/** What you can ask for, and what the booker makes of it (the chance on top of the base). */
export const ASKABLE: SegKind[] = ['promo', 'faceoff', 'beatdown', 'runin', 'signing', 'backstage', 'interview'];
const ASK_EASE: Partial<Record<SegKind, number>> = { promo: 0.05, interview: 0.15, backstage: 0.1, faceoff: 0, beatdown: -0.05, runin: -0.05, signing: -0.15 };

/** Your next show for your feud's promotion (today or later, not played), that you're on (or whose card isn't drawn). */
export function nextFeudShow(c: Career, f: Feud): Show | undefined {
  return Object.values(c.shows).filter((s) => !s.done && s.date >= c.today && (s.promos ?? [s.promo]).includes(f.promo) && s.promo !== 'TIS')
    .filter((s) => !s.card || s.card.some((b) => b.a === c.player || b.b === c.player || !!b.sides?.flat().includes(c.player)))
    .sort((x, y) => (x.date < y.date ? -1 : 1))[0];
}

/** Whether you can ask for a segment on a show, and why not. */
export function canAsk(c: Career, show: Show): { f?: Feud; why?: string } {
  if (!on()) return { why: 'Off.' };
  if (show.done || show.date < c.today) return { why: 'That show’s been and gone.' };
  if (playerRuns(show.promo)) return { why: 'You book this show: put the segment on the card yourself.' };
  const f = myFeud(c);
  if (!f || !(show.promos ?? [show.promo]).includes(f.promo)) return { why: 'You’re not in a feud with anyone here.' };
  if (mySegments(c, show).length) return { f, why: 'You’ve got a segment on this show already.' };
  if (c.segAsks?.[show.id]) return { f, why: c.segAsks[show.id]!.ok ? 'Agreed: it goes on when the card’s drawn up.' : 'You asked already: they said no.' };
  if (show.card && !show.card.some((b) => b.a === c.player || b.b === c.player || !!b.sides?.flat().includes(c.player))) return { f, why: 'You’re not on this show.' };
  return { f };
}

/** Ask for a segment with your rival on a show. The booker answers now; agreed, it goes on the card (now or when drawn). */
export function askForSegment(c: Career, show: Show, kind: SegKind = 'promo'): string {
  const { f, why } = canAsk(c, show);
  if (why || !f) return why ?? 'No.';
  const p = person(c, c.player);
  const yes = rngOf(c, 'ask', show.id, kind)() < FEUD.askBase + (ASK_EASE[kind] ?? 0) + p.rep / 250 + feudHeat(f) / 400;
  (c.segAsks ??= {})[show.id] = { kind, ok: yes };
  if (!yes) return `They’ve said no to a ${SEG_LABEL[kind].toLowerCase()} on ${show.name}.`;
  if (show.card) { placeAsk(c, show, show.card, f, kind); return `Agreed: a ${SEG_LABEL[kind].toLowerCase()} with ${nameOf(rivalOf(c, f))} on ${show.name}.`; }
  return `Agreed: a ${SEG_LABEL[kind].toLowerCase()} with ${nameOf(rivalOf(c, f))} on ${show.name}, once the card’s drawn up.`;
}
export const askForPromo = (c: Career, show: Show): string => askForSegment(c, show, 'promo');

/** Put an agreed segment on the card: before your match (a run-in after theirs, if they're on it). */
function placeAsk(c: Career, show: Show, card: Bout[], f: Feud, kind: SegKind): void {
  const rival = rivalOf(c, f);
  const me = card.findIndex((b) => b.a === c.player || b.b === c.player || !!b.sides?.flat().includes(c.player));
  const theirs = card.findIndex((b) => b.a === rival || b.b === rival);
  const after = kind === 'runin' && theirs >= 0 ? theirs : Math.max(-1, me - 1);
  (show.segments ??= []).push({ kind, who: kind === 'interview' ? [c.player] : [c.player, rival], after, feud: f.id });
}

/**
 * A segment's done (played, or simmed with the booker's scoring): the heat it built, the fans it won, and what a bad
 * one costs (the office watches yours). `edge`: who has the crowd after it (the next match, a nudge on every roll).
 */
export function segmentDone(c: Career, show: Show, g: Segment, score: number, note: string, o: { heatMult?: number; fanMult?: number; edge?: string; line?: string } = {}): void {
  g.score = Math.max(0, Math.min(5, Math.round(score * 4) / 4));
  g.note = note;
  for (const id of g.who) {
    const w = W(id);
    if (w?.fans) w.fans[show.region] = Math.max(0, Math.round(w.fans[show.region] * (1 + (g.score - 2.5) * SEGMENT.fans * (o.fanMult ?? 1))));
  }
  const f = g.feud ? c.feuds.find((x) => x.id === g.feud) : undefined;
  if (!f) return;
  const d = (g.score - 2) * STORY.segHeat * (o.heatMult ?? 1);
  g.heat = Math.round(d);
  feudBeat(c, f, o.line ?? `${SEG_LABEL[g.kind]} on ${show.name}: ${g.score}★`, d);
  if (o.edge) f.edge = o.edge;
  if (g.who.includes(c.player) && mine(c, f)) {
    f.segs = [g.score, ...(f.segs ?? [])].slice(0, 4);
    if (g.kind === 'beatdown' || g.kind === 'runin') moment(c, f, 'attack', 'Hands have been laid', 0);
  }
}

/** One of yours nobody played (skipped, or simmed): segments.ts plays it for you. */
let simMine: ((c: Career, show: Show, i: number) => unknown) | null = null;
export const setSimMine = (f: typeof simMine): void => { simMine = f; };
/** A segment nobody played: the booker's scoring. */
function simSegment(c: Career, show: Show, g: Segment): void {
  const base = rateSegment(c, show, g);
  segmentDone(c, show, g, base.score, base.note);
}

// ------------------------------------------------------------------ the night: segments, matches, the blow-off

function afterShow(c: Career, show: Show): void {
  if (!on() || playerRuns(show.promo)) return;
  const card = (show.card ?? []).filter((b) => b.result);
  if (!card.length) return;
  (show.segments ?? []).forEach((g, i) => { if (g.score === undefined && g.feud) (g.who.includes(c.player) && simMine ? simMine(c, show, i) : simSegment(c, show, g)); });
  for (const b of card) {
    // You ran in on someone else's feud: the one you cost remembers.
    if (b.runIn === c.player) ranIn(c, show, b);
    const f = b.feud ? c.feuds.find((x) => x.id === b.feud) : c.feuds.find((x) => !b.sides && x.by !== 'player' && ((x.a === b.a && x.b === b.b) || (x.a === b.b && x.b === b.a)) && (!x.done || x.payoff === show.id));
    if (!f || f.by === 'player') continue;
    const stars = b.result!.stars, win = b.result!.winner ?? undefined;
    const side = win ? (b.sides ? b.sides.find((s) => s.includes(win)) : [win]) : undefined;
    const victor = side?.includes(f.a) ? f.a : side?.includes(f.b) ? f.b : undefined;
    if (victor) (f.wins ??= {})[victor] = (f.wins[victor] ?? 0) + 1;
    f.lastMatch = show.date;
    if (b.stip) (f.stips ??= []).push(b.stip);
    if (f.edge) delete f.edge;
    if (f.payoff === show.id) { blowoff(c, f, show, b, victor); continue; }
    if (f.matches <= 1) moment(c, f, 'first_match', `The first match: ${victor ? nameOf(victor) : 'nobody'} won, ${stars}★`, (stars - 2.5) * STORY.matchHeat);
    else {
      const worn = f.matches > FEUD.repeatFrom ? STORY.repeat : 0;
      feudBeat(c, f, `${victor ? nameOf(victor) : 'Nobody'} won at ${show.name}${b.stip ? ` (${b.stip.replace(/_/g, ' ')})` : ''}, ${stars}★${worn ? ' (they’ve seen it before)' : ''}`, (stars - 2.5) * STORY.matchHeat - worn);
    }
  }
}

/** The blow-off: fans for both (the winner more), and if it's yours: a bonus, a push, maybe a title shot. */
function blowoff(c: Career, f: Feud, show: Show, b: Bout, victor?: string): void {
  const heat = feudHeat(f), stars = b.result!.stars;
  for (const id of [f.a, f.b]) {
    const w = W(id);
    if (w?.fans) w.fans[show.region] = Math.round(w.fans[show.region] * (1 + (heat / 100) * (id === victor ? FEUD.blowoffWin : FEUD.blowoffLose)));
  }
  feudBeat(c, f, `The blow-off at ${show.name}${b.title ? ` for the ${T(b.title)?.name ?? 'title'}` : ''}: ${victor ? nameOf(victor) : 'nobody'} won, ${stars}★`, 0);
  f.ended = 'blowoff'; f.done = true;
  if (!mine(c, f)) return;
  const k = dealWith(person(c, c.player), f.promo);
  const bonus = k ? Math.round((k.fee * (heat / 100) * FEUD.bonus) / 50) * 50 : 0;
  if (bonus) spend(c, bonus, `Feud bonus · you and ${nameOf(rivalOf(c, f))}`, 'bonus');
  const p = person(c, c.player);
  const won = victor === c.player;
  p.rep = Math.min(100, p.rep + Math.round((heat / 100) * (won ? FEUD.pushWin : FEUD.pushLose)));
  const tn = b.title ? T(b.title)?.name : undefined;
  const shot = won && heat >= FEUD.shotAt && !tn ? titleShot(c, f.promo) : undefined;
  letter(c, {
    kind: 'news', from: office(f.promo), subject: `That’s the end of you and ${nameOf(rivalOf(c, f))}`,
    body: [
      `${feudWord(heat)} by the end: the blow-off went ${stars}★. ${won ? `You went over${tn ? `, and the ${tn} is yours` : ''}.` : `${nameOf(rivalOf(c, f))} went over${tn ? ` with the ${tn}` : ''}.`}`,
      ...(bonus ? [`There’s a feud bonus of £${bonus.toLocaleString('en-GB')} for drawing the way it did.`] : []),
      ...(shot ? [`The office wants you in the title picture: a shot at the ${shot} is coming.`] : [won && heat >= 50 ? 'You’ve moved up the card.' : '']),
    ].filter(Boolean),
  });
}

/** A shot at the promotion's secondary title (or its top one), promised for the next big show. */
let promiseShot: ((c: Career, promo: string, title: string) => boolean) | null = null;
export const setPromiseShot = (f: typeof promiseShot): void => { promiseShot = f; };
function titleShot(c: Career, promo: string): string | undefined {
  const p = PROMOTIONS.find((x) => x.initials === promo);
  const ts = (p?.titles ?? []).map((id) => TITLES.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t && t.holder !== c.player && !t.kind?.includes('tag'));
  const t = ts[1] ?? ts[0];
  if (!t || !promiseShot?.(c, promo, t.id)) return undefined;
  return t.name;
}

/** The heat for a match between two (the engine's `rules.feud`), and who has the crowd after the last segment. */
export function feudRules(c: Career, show: Show, a: string, b: string): { heat: number; payoff?: boolean; edge?: 'you' | 'them' } | undefined {
  if (!on()) return undefined;
  const f = c.feuds.find((x) => ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && (!x.done || x.payoff === show.id));
  if (!f) return undefined;
  const heat = feudHeat(f);
  if (heat <= 0) return undefined;
  return { heat, ...(f.payoff === show.id ? { payoff: true } : {}), ...(f.edge === a ? { edge: 'you' as const } : f.edge === b ? { edge: 'them' as const } : {}) };
}
setFeudRulesHook(feudRules);
// Playing segments went in the big cut (Lyra's call): then they're always simmed, and a skip never stops for one.
setSegStop((c) => { if (!on() || !FEATURES.playSegments || routineOf(c).simMine) return null; const t = segmentToday(c); return t ? `Your ${SEG_LABEL[t.g.kind].toLowerCase()} is up` : null; });

/**
 * Skipping with "Sim them" on (Lyra's call: all of it, answers too): a rival's call-out is answered for you, by who you
 * are. Hot-heads, the aggressive, egos and showboats bite, and so does anyone who can't stand them already; the
 * professional, the methodical and the cowardly ignore it; anyone else bites.
 */
export function answerStory(c: Career): string[] {
  if (!on()) return [];
  const out: string[] = [];
  for (const l of [...c.letters]) {
    if (!l.story || l.done || l.replied || !l.replies?.some((r) => r.id === 'feud_bite')) continue;
    const who = l.ctx?.who ?? '';
    const P = activeWorld().people;
    const like = P && who ? likeIn(P, c.player, who) ?? 0 : 0;
    const bite = playerHas(c, 'hot_headed') || playerHas(c, 'aggressive') || playerHas(c, 'egotistical') || playerHas(c, 'showboat') || like <= -10
      || !(playerHas(c, 'professional') || playerHas(c, 'methodical') || playerHas(c, 'defensive'));
    replyTo(c, l.id, bite ? 'feud_bite' : 'feud_ignore');
    out.push(bite ? `You bit back at ${nameOf(who)}’s call-out: it’s on.` : `You ignored ${nameOf(who)}’s call-out.`);
  }
  return out;
}
setStoryAnswer(answerStory);

// ------------------------------------------------------------------ your rival, between shows

/** What your rival does about you, by who they are: hot-heads attack, egos post, schemers interfere, the cerebral ones talk. */
function rivalMoves(c: Career, f: Feud): void {
  if (stageOf(f) === 'spark') return;
  const rival = W(rivalOf(c, f));
  if (!rival || c.people[rival.id]?.injury) return;
  const r = rngOf(c, 'rival', f.id, c.today);
  if (r() > FEUD.rivalDaily * (0.4 + feudHeat(f) / 100)) return;
  const P = activeWorld().people;
  const like = P ? likeOf(P, rival.id, c.player) ?? 0 : 0;
  const kind = hasTrait(rival, 'hot_headed') || hasTrait(rival, 'aggressive') ? (r() < 0.6 ? 'attack' : 'post')
    : hasTrait(rival, 'showboat') || hasTrait(rival, 'egotistical') ? (r() < 0.6 ? 'post' : 'interfere')
      : hasTrait(rival, 'methodical') || hasTrait(rival, 'professional') ? (r() < 0.6 ? 'talk' : 'post')
        : (['attack', 'post', 'interfere', 'talk'] as const)[Math.floor(r() * 4)]!;
  const p = person(c, c.player);
  if (kind === 'attack') {
    // Friends pull it; real enemies go too far.
    const hurt = like <= FEUD.enemyLike && r() < FEUD.attackHurt;
    p.fatigue = Math.min(100, p.fatigue + 12);
    if (hurt && !p.injury) p.injury = { what: `jumped by ${rival.name}`, until: addDays(c.today, 4 + Math.floor(r() * 10)) };
    moment(c, f, 'attack', `${rival.name} jumped you in the car park`, 8);
    letter(c, { kind: hurt ? 'injury' : 'news', from: office(f.promo), subject: `${rival.name} jumped you`, body: [`In the car park, out of nowhere.${like >= FEUD.friendLike ? ' They pulled it, mind: it looked worse than it was.' : hurt ? ' That wasn’t a work: you’re hurt.' : ''}`, 'The crowd will have seen it on the screens. It’s hotter for it.'] });
  } else if (kind === 'post') {
    feudBeat(c, f, `${rival.name} went after you online`, 4);
    letter(c, { kind: 'news', from: `${rival.name} (online)`, fromId: rival.id, subject: `${rival.name} is posting about you`, body: [r() < 0.5 ? `“Everyone knows ${nameOf(c.player).split(' ')[0]} is overrated. I’m just the one saying it.”` : `“Keep hiding, ${nameOf(c.player).split(' ')[0]}. I’ll find you.”`] });
  } else if (kind === 'interfere') {
    // They'll cost you your next match (if you've one before your next with them).
    const next = Object.values(c.shows).filter((s) => !s.done && s.date > c.today && s.card).sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((s) => ({ s, b: s.card!.find((x) => (x.a === c.player || x.b === c.player) && !x.feud && !x.title) })).find((x) => x.b);
    if (!next?.b) return;
    next.b.planned = next.b.a === c.player ? next.b.b : next.b.a;
    next.b.runIn = rival.id;
    feudBeat(c, f, `${rival.name} is plotting something for ${next.s.name}`, 3);
  } else {
    // The cerebral one: a promo on you on the next show you're both on.
    const s = nextFeudShow(c, f);
    if (s && !(c.segAsks ?? {})[s.id]) { (c.segAsks ??= {})[s.id] = { kind: 'faceoff', ok: true }; if (s.card) placeAsk(c, s, s.card, f, 'faceoff'); }
    feudBeat(c, f, `${rival.name} wants a word, face to face`, 2);
  }
}

/** It can go wrong: a cold feud gets pulled, an injury ends it, a real fight backstage, bombing segments get it dropped. */
function goingWrong(c: Career, f: Feud): void {
  const heat = feudHeat(f), age = daysBetween(f.start, c.today);
  const end = (why: NonNullable<Feud['ended']>, subject: string, body: string) => {
    f.done = true; f.ended = why;
    if (mine(c, f)) letter(c, { kind: 'news', from: office(f.promo), subject, body: [body] });
  };
  if (heat <= FEUD.coldAt && age >= 21) return end('cold', `The office has pulled the plug on you and ${nameOf(mine(c, f) ? rivalOf(c, f) : f.b)}`, 'Nobody cared. It’s over: you’ll be in something else soon.');
  for (const id of [f.a, f.b]) {
    const inj = c.people[id]?.injury;
    if (inj && daysBetween(c.today, inj.until) >= FEUD.injuryEnds) return end('dropped', `${nameOf(id)}’s hurt: the feud’s off`, `With ${nameOf(id)} out that long, the office has dropped it. It might come back one day.`);
  }
  if (mine(c, f) && (f.segs?.length ?? 0) >= 3 && f.segs!.slice(0, 3).reduce((t, x) => t + x, 0) / 3 < FEUD.bombAt) return end('dropped', 'The office has pulled your feud', 'Three segments that died on their arse. They’re not putting it on TV any more.');
  // A real fight backstage: hot, and they genuinely can't stand each other.
  const P = activeWorld().people;
  const like = P ? likeOf(P, f.a, f.b) ?? 0 : 0;
  if (heat >= FEUD.realFightAt && like <= FEUD.realFightLike && rngOf(c, 'realfight', f.id, c.today)() < FEUD.realFightDaily) {
    moment(c, f, 'real_fight', 'A real fight backstage', 6);
    if (mine(c, f)) {
      const p = person(c, c.player), r = rngOf(c, 'realfight2', f.id, c.today);
      p.rep = Math.max(0, p.rep - 3);
      if (r() < 0.25 && !p.injury) p.injury = { what: 'a real fight backstage', until: addDays(c.today, 3 + Math.floor(r() * 8)) };
      const k = dealWith(p, f.promo);
      if (k) spend(c, -Math.round(k.fee / 2), 'Fined: fighting backstage', 'event');
      letter(c, { kind: 'news', from: office(f.promo), subject: 'A real fight backstage', body: [`You and ${nameOf(rivalOf(c, f))} went at it for real in catering. It took four of the crew to pull you apart.`, 'You’ve both been fined. The crowd doesn’t know, but the locker room does: it’s hotter than ever.'] });
    }
  }
}

// ------------------------------------------------------------------ other people's feuds: get involved

/** Run in on someone else's feud match tonight (you're on the show), helping one of them: they win, the other remembers. */
export function runIn(c: Career, showId: string, index: number, help: string): string {
  const s = c.shows[showId], b = s?.card?.[index];
  if (!s || !b || b.result || !b.feud) return 'Not that match.';
  if (!s.card!.some((x) => x.a === c.player || x.b === c.player)) return 'You’re not on that show.';
  if (b.a === c.player || b.b === c.player) return 'That’s your own match.';
  if (b.runIn) return 'Someone’s already running in on it.';
  b.runIn = c.player;
  b.planned = help;
  return `You’ll run in on ${nameOf(b.a)} and ${nameOf(b.b)}, for ${nameOf(help)}.`;
}
function ranIn(c: Career, show: Show, b: Bout): void {
  const help = b.planned!, cost = help === b.a ? b.b : b.a;
  moveRelation(c, help, 8, 'You had their back');
  moveRelation(c, cost, -12, 'You cost them a match');
  const f = b.feud ? c.feuds.find((x) => x.id === b.feud) : undefined;
  if (f) feudBeat(c, f, `${nameOf(c.player)} ran in at ${show.name}`, 6);
  if (!myFeud(c)) grows(c, cost, `You cost ${nameOf(cost)} their match at ${show.name}`);
}

// ------------------------------------------------------------------ the days

setCareerHooks({
  show: afterShow,
  daily: (c) => {
    if (!on()) return;
    for (const f of liveFeuds(c)) {
      if (f.by === 'player') continue;
      // A feud the booker put you in (a title feud, a random one): yours now, and you hear about it.
      if (mine(c, f) && !f.how) {
        f.how = 'booker'; f.stage ??= f.payoff ? 'building' : 'spark';
        letter(c, { kind: 'news', from: office(f.promo), subject: `A storyline: you and ${nameOf(rivalOf(c, f))}`, body: [`The office has you in a feud with ${nameOf(rivalOf(c, f))}${f.title ? ` over the ${TITLES.find((t) => t.id === f.title)?.name}` : ''}.`] });
      }
      syncTitle(c, f);
      advance(c, f);
      if (mine(c, f)) rivalMoves(c, f);
      goingWrong(c, f);
    }
    comesToYou(c);
    if (c.segAsks) for (const id of Object.keys(c.segAsks)) if (!c.shows[id] || c.shows[id]!.done) delete c.segAsks[id];
    if (weekday(c.today) === 1) {
      for (const f of liveFeuds(c)) {
        if (f.by === 'player') continue;
        const last = f.beats?.[0]?.day ?? f.start;
        if (daysBetween(last, c.today) >= 7) feudBeat(c, f, 'A week with nothing', -FEUD.cool);
      }
    }
    const H = activeWorld().history;
    for (const f of c.feuds) {
      if (!f.done || f.logged) continue;
      f.logged = true;
      if (!f.matches && (f.peak ?? feudHeat(f)) < 30) continue;
      (H.feuds ??= []).push({ id: f.id, promo: f.promo, a: f.a, b: f.b, an: nameOf(f.a), bn: nameOf(f.b), start: f.start, end: c.today, peak: f.peak ?? feudHeat(f), matches: f.matches, ...(f.ended ? { ended: f.ended } : {}), ...(f.title ? { title: f.title } : {}) });
      if (H.feuds.length > FEUD.keepLog) H.feuds.splice(0, H.feuds.length - FEUD.keepLog);
    }
  },
  // After your match: a bad loss to someone who can't stand you can start something.
  bout: (c, show, b) => {
    if (!on() || b.sides || (b.a !== c.player && b.b !== c.player) || !b.result || b.feud) return;
    const them = b.a === c.player ? b.b : b.a;
    if (b.result.winner !== them) return;
    const P = activeWorld().people;
    const like = P ? likeOf(P, them, c.player) ?? 0 : 0;
    if (like <= FEUD.grudgeLike && rngOf(c, 'grows', show.id)() < FEUD.growChance) grows(c, them, `${nameOf(them)} beat you at ${show.name}, and rubbed it in`);
    if (b.runIn && b.runIn !== c.player) {
      const f = myFeud(c);
      if (f && rivalOf(c, f) === b.runIn) moment(c, f, 'interfered', `${nameOf(b.runIn)} cost you your match at ${show.name}`, 10);
    }
  },
});

// Calling them out online (or starting a beef) stokes it, or (a beef) starts one.
setCalloutHook((c, id, kind) => {
  if (!on()) return;
  const f = feudBetween(c, c.player, id);
  if (f) feudBeat(c, f, kind === 'beef' ? 'Your online beef' : 'You called them out online', kind === 'beef' ? FEUD.beef : FEUD.callout);
  else if (kind === 'beef' && rngOf(c, 'beefgrows', id, c.today)() < FEUD.beefGrows) grows(c, id, `Your online beef with ${nameOf(id)} spilled over`);
});

/** For the screens: your feud's rival, heat and where it pays off. */
export function feudLine(c: Career, f: Feud): string {
  const pay = f.payoff ? c.shows[f.payoff] : undefined;
  const tn = titleName(f);
  return `${nameOf(mine(c, f) ? rivalOf(c, f) : f.a)}${mine(c, f) ? '' : ` vs ${nameOf(f.b)}`}${tn ? ` · for the ${tn}` : ''} · ${feudWord(feudHeat(f))} (${feudHeat(f)})${pay ? ` · blow-off: ${pay.name}` : ''}`;
}
/** Each side's record over the feud. */
export const record = (f: Feud): string => `${nameOf(f.a)} ${f.wins?.[f.a] ?? 0}, ${nameOf(f.b)} ${f.wins?.[f.b] ?? 0}`;
