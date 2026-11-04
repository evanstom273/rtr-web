// Booker mode, stage 3 (Lyra's design): storylines you write and the game keeps score of. A storyline is a feud with
// heat: segments and matches between the two build it (by how good they were), the same match over and over wears it
// out, a week with nothing cools it, and face against face makes less sense. It pays off on the show you set, by its
// heat. Turns (face, heel, in between) land when they're shown; flip-flopping doesn't. Alliances can end in betrayal.
import { findWrestler, PROMOTIONS, rosterOf, TITLES, type Disposition, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { likeOf } from '../world/people';
import { letter, promoName, setCareerHooks } from './career';
import { officeOf, playerRuns, roleIn } from './company';
import { addDays, daysBetween, weekday, type Day } from './dates';
import { FEATURES, STORY } from './tuning';
import type { Career, Feud, Show } from './types';

export interface Turn { who: string; to: Disposition; day: Day; promo: string; landed?: boolean }
export interface Alliance { id: string; promo: string; a: string; b: string; since: Day; broke?: Day }

const W = (id: string): Wrestler | undefined => findWrestler(id);
const nameOf = (id: string): string => W(id)?.name ?? id;
const clampHeat = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export const storiesOf = (c: Career, promo: string): Feud[] => c.feuds.filter((f) => f.promo === promo && f.by === 'player' && !f.done);
export const turnsOf = (c: Career): Turn[] => ((officeOf(c) as { turns?: Turn[] }).turns ??= []);
export const alliancesOf = (c: Career, promo?: string): Alliance[] => ((officeOf(c) as { alliances?: Alliance[] }).alliances ??= []).filter((x) => !promo || x.promo === promo);
const between = (f: Pick<Feud, 'a' | 'b'>, x: string, y: string) => (f.a === x && f.b === y) || (f.a === y && f.b === x);
export const storyLabel = (f: Feud): string => `${nameOf(f.a)} vs ${nameOf(f.b)}`;

/** Someone you can use on a promotion's shows: its roster, or (a small one) anyone free. */
function onShows(promo: string, id: string): boolean {
  const w = W(id);
  if (!w) return false;
  return w.promotion === promo || !!w.also?.includes(promo) || w.promotion === 'TIS';
}

/** Start a storyline between two people (what's at stake, and the show it pays off on, optional). */
export function startStory(c: Career, promo: string, a: string, b: string, o: { title?: string; payoff?: string } = {}): string {
  if (!FEATURES.booker || !roleIn(c, promo)) return 'You don’t book it.';
  if (a === b) return 'Pick two people.';
  if (!onShows(promo, a) || !onShows(promo, b)) return 'They both have to be working your shows.';
  if (W(a)?.gender !== W(b)?.gender) return 'They’d never get a match to settle it: same division only.';
  if (c.feuds.some((f) => !f.done && between(f, a, b))) return 'They’re already in a storyline.';
  const P = activeWorld().people;
  const grudge = P && Math.min(likeOf(P, a, b), likeOf(P, b, a)) <= -40 ? STORY.grudge : 0;
  const f: Feud = {
    id: `st${++c.seq}`, promo, a, b, start: c.today, payoff: o.payoff ?? null, matches: 0, done: false, by: 'player',
    heat: clampHeat(STORY.start + grudge + (o.title ? STORY.title : 0)), beats: [{ day: c.today, t: grudge ? 'There’s real bad blood here' : 'It begins', d: 0 }],
    ...(o.title ? { title: o.title } : {}),
  };
  c.feuds.push(f);
  return `${storyLabel(f)}: it’s on.`;
}

/** Set (or clear) the show a storyline pays off on. */
export function setPayoff(c: Career, id: string, show: string | null): string {
  const f = c.feuds.find((x) => x.id === id && x.by === 'player' && !x.done);
  if (!f || !roleIn(c, f.promo)) return 'There’s no such storyline.';
  if (show && (!c.shows[show] || c.shows[show]!.promo !== f.promo || c.shows[show]!.done)) return 'Pick one of your shows still to come.';
  f.payoff = show;
  return show ? `It pays off at ${c.shows[show]!.name}.` : 'No payoff set.';
}

/** Drop a storyline: it just stops. */
export function dropStory(c: Career, id: string): string {
  const f = c.feuds.find((x) => x.id === id && x.by === 'player' && !x.done);
  if (!f || !roleIn(c, f.promo)) return 'There’s no such storyline.';
  f.done = true; f.ended = 'dropped';
  return 'Dropped.';
}

function beat(c: Career, f: Feud, t: string, d: number): void {
  f.heat = clampHeat((f.heat ?? 0) + d);
  f.beats = [{ day: c.today, t, d: Math.round(d) }, ...(f.beats ?? [])].slice(0, STORY.keepBeats);
}

/** Face against face (or heel against heel) makes less sense: it builds slower. */
const sense = (f: Feud): number => {
  const x = W(f.a)?.disposition, y = W(f.b)?.disposition;
  return x && y && x !== 'NONE' && x === y ? STORY.sameSide : 1;
};

// ------------------------------------------------------------------ turns and alliances

/** Turn someone (face, heel, or somewhere in between). It lands if the next show shows it. */
export function turn(c: Career, promo: string, who: string, to: Disposition): string {
  if (!FEATURES.booker || !roleIn(c, promo)) return 'You don’t book it.';
  const w = W(who);
  if (!w || !onShows(promo, who)) return 'They’re not on your shows.';
  if (w.disposition === to) return `${w.name} is already ${to === 'NONE' ? 'neither' : to.toLowerCase()}.`;
  const flip = turnsOf(c).some((t) => t.who === who && daysBetween(t.day, c.today) <= STORY.flipFlopDays);
  w.disposition = to;
  turnsOf(c).push({ who, to, day: c.today, promo });
  return `${w.name} turns ${to === 'NONE' ? 'tweener' : to.toLowerCase()}.${flip ? ' Again. People might not buy it.' : ' Show it on the next show and it’ll land.'}`;
}

export function formAlliance(c: Career, promo: string, a: string, b: string): string {
  if (!FEATURES.booker || !roleIn(c, promo)) return 'You don’t book it.';
  if (a === b || !onShows(promo, a) || !onShows(promo, b)) return 'Pick two people on your shows.';
  if (alliancesOf(c, promo).some((x) => !x.broke && (between(x, a, b)))) return 'They’re already together.';
  if (c.feuds.some((f) => !f.done && between(f, a, b))) return 'They’re feuding.';
  alliancesOf(c).push({ id: `al${++c.seq}`, promo, a, b, since: c.today });
  return `${nameOf(a)} and ${nameOf(b)} are a team.`;
}

// ------------------------------------------------------------------ the show's over: keeping score

function scoreShow(c: Career, show: Show): void {
  if (!FEATURES.booker || !playerRuns(show.promo)) return;
  const card = (show.card ?? []).filter((b) => b.result);
  const segs = (show.segments ?? []).filter((g) => g.score !== undefined);
  for (const f of storiesOf(c, show.promo)) {
    const m = sense(f);
    for (const g of segs) {
      if (g.kind === 'betrayal') continue;
      const both = g.who.includes(f.a) && g.who.includes(f.b);
      const one = g.who.includes(f.a) || g.who.includes(f.b);
      // A run-in or beat-down by one of them on the other's match counts too.
      const onTheirMatch = one && (g.kind === 'runin' || g.kind === 'beatdown') && card[g.after] && [card[g.after]!.a, card[g.after]!.b].some((x) => x === f.a || x === f.b);
      if (both || onTheirMatch) beat(c, f, `${g.kind === 'promo' ? 'A promo' : g.kind === 'runin' ? 'A run-in' : g.kind === 'beatdown' ? 'A beat-down' : g.kind === 'signing' ? 'The contract signing' : 'A segment'} on ${show.name}`, (g.score! - 2) * STORY.segHeat * m);
    }
    const bout = card.find((b) => between(f, b.a, b.b));
    if (bout) {
      if (f.payoff === show.id) {
        // The blow-off: the winner rides the heat.
        const w = bout.result!.winner ? W(bout.result!.winner) : undefined;
        if (w?.fans) w.fans[show.region] = Math.round(w.fans[show.region] * (1 + ((f.heat ?? 0) / 100) * STORY.blowoffFans));
        beat(c, f, `The blow-off at ${show.name}`, 0);
        f.done = true; f.ended = 'blowoff';
        continue;
      }
      const worn = f.matches > STORY.repeatFrom ? STORY.repeat : 0;
      beat(c, f, `${bout.result!.winner ? nameOf(bout.result!.winner) : 'Nobody'} won at ${show.name}${worn ? ' (they’ve seen it before)' : ''}`, (bout.result!.stars - 2.5) * STORY.matchHeat * m - worn);
    } else if (f.payoff === show.id) {
      beat(c, f, `The payoff at ${show.name} never happened`, -STORY.missedPayoff);
      f.payoff = null;
      letter(c, { kind: 'news', from: `${show.promo} · the office`, subject: `No blow-off for ${storyLabel(f)}`, body: ['You had it paying off tonight and they weren’t in a match. The crowd noticed. Set it again.'] });
    }
  }
  // Betrayals: an alliance ends, and a storyline starts hot.
  for (const g of segs.filter((x) => x.kind === 'betrayal' && x.who.length === 2)) {
    const [traitor, victim] = g.who as [string, string];
    const al = alliancesOf(c, show.promo).find((x) => !x.broke && between(x, traitor, victim));
    if (al) al.broke = c.today;
    let f = c.feuds.find((x) => !x.done && between(x, traitor, victim));
    if (!f) { startStory(c, show.promo, traitor, victim); f = c.feuds.find((x) => !x.done && between(x, traitor, victim)); }
    if (f) beat(c, f, `${nameOf(traitor)} turned on ${nameOf(victim)} at ${show.name}`, STORY.betrayalHeat * (al ? 1 : 0.5) + (g.score! - 2.5) * STORY.segHeat - (f.heat ?? 0) / 2);
  }
  // Turns: shown on the first show after, they land; not shown, people don't buy it.
  const seen = new Set(segs.flatMap((g) => g.who));
  const on = new Set(card.flatMap((b) => [b.a, b.b]));
  for (const t of turnsOf(c)) {
    if (t.landed !== undefined || t.promo !== show.promo || t.day > show.date || (!seen.has(t.who) && !on.has(t.who))) continue;
    const w = W(t.who);
    if (!w?.fans) continue;
    const hot = c.feuds.find((f) => !f.done && f.promo === show.promo && (f.a === t.who || f.b === t.who) && (f.heat ?? 0) >= STORY.turnHot);
    const flip = turnsOf(c).some((x) => x !== t && x.who === t.who && x.day < t.day && daysBetween(x.day, t.day) <= STORY.flipFlopDays);
    t.landed = seen.has(t.who);
    const mult = flip ? STORY.flipFlop : !t.landed ? STORY.turnUnseen : hot ? STORY.turnLanded[1] : STORY.turnLanded[0];
    w.fans[show.region] = Math.round(w.fans[show.region] * mult);
    if (hot && t.landed && !flip) beat(c, hot, `${w.name}’s turn`, STORY.turnHotHeat);
    letter(c, { kind: 'news', from: `${show.promo} · the office`, subject: `${w.name}’s turn ${flip ? 'fell flat' : t.landed ? 'landed' : 'went unseen'}`,
      body: [flip ? 'They’ve turned too often lately: the crowd’s stopped caring which side they’re on.' : t.landed ? `The crowd bought it${hot ? ', and the feud’s hotter for it' : ''}.` : 'They turned off-screen and nobody saw why. It’ll take a while to sink in.'] });
  }
}

const QUIET = 'A week with nothing';
/** Each Monday: a storyline that went a week with nothing cools; one that's gone cold ends. */
function weekly(c: Career): void {
  if (!FEATURES.booker || weekday(c.today) !== 1) return;
  const weekAgo = addDays(c.today, -7);
  for (const f of c.feuds.filter((x) => x.by === 'player' && !x.done)) {
    // The last thing that actually happened in it (a quiet week isn't something happening).
    if ((f.beats?.find((b) => b.t !== QUIET)?.day ?? f.start) >= weekAgo) continue;
    beat(c, f, QUIET, -STORY.cold);
    if ((f.heat ?? 0) <= 0) {
      f.done = true; f.ended = 'cold';
      if (roleIn(c, f.promo)) letter(c, { kind: 'news', from: `${f.promo} · the office`, subject: `${storyLabel(f)} has gone cold`, body: ['Nobody cares any more. It’s over.'] });
    }
  }
}

/** The AI bookers turn someone now and then: a stale mid-carder looking for something new. */
function aiTurns(c: Career, rnd: Rng): void {
  if (!FEATURES.booker) return;
  for (const p of PROMOTIONS.filter((x) => !x.indie && !x.closed && !playerRuns(x.initials))) {
    if (rnd() >= STORY.aiTurn) continue;
    const roster = rosterOf(p.initials).filter((w) => w.id !== c.player && !TITLES.some((t) => t.holder === w.id) && !c.feuds.some((f) => !f.done && (f.a === w.id || f.b === w.id)));
    const w = roster[Math.floor(rnd() * roster.length)];
    if (!w) continue;
    w.disposition = w.disposition === 'HEEL' ? 'FACE' : 'HEEL';
    if (findWrestler(c.player)?.promotion === p.initials) c.mailBox?.push({ day: c.today, subject: `${w.name} turns ${w.disposition.toLowerCase()}`, body: `${promoName(p.initials)} has turned ${w.name} ${w.disposition.toLowerCase()}.` });
  }
}

setCareerHooks({
  show: scoreShow,
  daily: weekly,
  monthly: (c) => aiTurns(c, seededRng(hashSeed(c.seed, 'turns', c.today))),
});

export const dispositionLabel = (d: Disposition | undefined): string => (d === 'HEEL' ? 'Heel' : d === 'FACE' ? 'Face' : 'Tweener');
