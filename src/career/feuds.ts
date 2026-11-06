// Feuds that matter (Lyra's call): booker mode's segments come over to the wrestling side. Every feud has heat now,
// not just the storylines you write as a booker: segments between the two (promos, run-ins, beat-downs, contract
// signings, interviews) and their matches build it, the same match over and over wears it out, and a week with
// nothing cools it. When you're in one, you're booked into its segments and choose how to play them. The heat goes
// into the match (a louder crowd, more stars), and the blow-off pays both in fans. Feuds are remembered once they end.
import { fansIn, findWrestler, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { moveRelation } from './relations';
import { letter, person, setCareerHooks, setFeudRulesHook } from './career';
import { setCardHook } from './booker';
import { playerRuns } from './company';
import { rateSegment, SEG_LABEL } from './card';
import { daysBetween, weekday } from './dates';
import { setCalloutHook } from './social';
import { FEATURES, FEUD, SEGMENT, STORY } from './tuning';
import type { Bout, Career, Feud, SegKind, Segment, Show } from './types';

const W = (id: string): Wrestler | undefined => findWrestler(id);
const nameOf = (id: string) => W(id)?.name ?? id;
const clampHeat = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const on = () => FEATURES.feuds2;

/** A feud's heat: set the first time it's needed (a title, real bad blood start it hotter). */
export function feudHeat(f: Feud): number {
  if (f.heat === undefined) f.heat = clampHeat(STORY.start + (f.title ? STORY.title : 0) + (f.real ? STORY.grudge : 0));
  return f.heat;
}
/** Move a feud's heat, with a line for its story (the last few kept). */
export function feudBeat(c: Career, f: Feud, t: string, d: number): void {
  f.heat = clampHeat(feudHeat(f) + d);
  f.peak = Math.max(f.peak ?? 0, f.heat);
  f.beats = [{ day: c.today, t, d: Math.round(d) }, ...(f.beats ?? [])].slice(0, STORY.keepBeats);
}
export const feudWord = (h: number): string => (h >= 80 ? 'White hot' : h >= 60 ? 'Hot' : h >= 40 ? 'Warm' : h >= 20 ? 'Simmering' : 'Cold');
export const liveFeuds = (c: Career): Feud[] => c.feuds.filter((f) => !f.done);
export const myFeuds = (c: Career): Feud[] => liveFeuds(c).filter((f) => f.a === c.player || f.b === c.player);
export function feudBetween(c: Career, x: string, y: string): Feud | undefined {
  return c.feuds.find((f) => !f.done && ((f.a === x && f.b === y) || (f.a === y && f.b === x)));
}
export const rivalOf = (c: Career, f: Feud): string => (f.a === c.player ? f.b : f.a);

// ------------------------------------------------------------------ segments on the card

/** What a feud's segment is, by where it's at: early on words, then hands, then (near the payoff) a signing. */
function kindFor(f: Feud, show: Show, payoffIn: number, r: () => number): SegKind {
  if (payoffIn >= 0 && payoffIn <= 14 && (show.kind === 'weekly' || show.kind === 'flagship') && r() < 0.35) return 'signing';
  if (f.matches === 0 && feudHeat(f) < 40) return r() < 0.7 ? 'promo' : 'interview';
  const x = r();
  return x < 0.45 ? 'promo' : x < 0.7 ? 'beatdown' : x < 0.9 ? 'runin' : 'interview';
}

/** A card the AI's drawn: its feuds get their segments (TV and the big shows; yours only if you're on the show). */
export function feudSegments(c: Career, show: Show, card: Bout[]): void {
  if (!on() || show.promo === 'TIS' || playerRuns(show.promo) || !['weekly', 'flagship', 'special'].includes(show.kind)) return;
  const r = seededRng(hashSeed(c.seed, 'feudseg', show.id));
  const onCard = new Set(card.flatMap((b) => [b.a, b.b, ...(b.sides?.flat() ?? [])]));
  const segs: Segment[] = [...(show.segments ?? [])];
  const feuds = liveFeuds(c).filter((f) => f.promo === show.promo && f.payoff !== show.id && f.by !== 'player')
    .sort((x, y) => feudHeat(y) - feudHeat(x));
  for (const f of feuds) {
    if (segs.filter((g) => g.feud).length >= FEUD.segsPerShow) break;
    const mine = f.a === c.player || f.b === c.player;
    if (mine && !onCard.has(c.player)) continue;
    if (r() > (mine ? FEUD.segMine : FEUD.segChance)) continue;
    const pay = f.payoff ? c.shows[f.payoff] : undefined;
    const kind = kindFor(f, show, pay ? daysBetween(show.date, pay.date) : -1, r);
    // A run-in follows the other one's match (if they've one tonight); otherwise it's a beat-down after the opener.
    const victimFirst = r() < 0.5;
    const [x, y] = victimFirst ? [f.b, f.a] : [f.a, f.b];
    const theirs = card.findIndex((b) => b.a === y || b.b === y);
    const who = kind === 'interview' ? [mine ? c.player : x] : [x, y];
    const after = kind === 'runin' ? (theirs >= 0 ? theirs : Math.min(0, card.length - 1)) : Math.floor(r() * Math.max(1, card.length - 1)) - (kind === 'signing' ? 0 : 0);
    segs.push({ kind: kind === 'runin' && theirs < 0 ? 'beatdown' : kind, who, after: Math.max(-1, after), feud: f.id });
  }
  if (segs.length) show.segments = segs;
}
setCardHook(feudSegments);

// ------------------------------------------------------------------ how you play yours

export type SegStyle = 'fiery' | 'cold' | 'personal' | 'comedy' | 'brutal' | 'quick' | 'sign' | 'attack' | 'flip';
/** The ways to play a segment, by kind. */
export const STYLES: Record<SegKind, SegStyle[]> = {
  promo: ['fiery', 'cold', 'personal', 'comedy'], interview: ['fiery', 'cold', 'personal', 'comedy'],
  beatdown: ['brutal', 'quick'], runin: ['brutal', 'quick'], signing: ['sign', 'attack', 'flip'],
  debut: [], celebration: [], betrayal: [],
};
export const STYLE_LABEL: Record<SegStyle, string> = {
  fiery: 'Fiery', cold: 'Cold and calm', personal: 'Get personal', comedy: 'Make them laugh',
  brutal: 'Leave them laying', quick: 'In and out', sign: 'Sign and leave', attack: 'Sign, then attack', flip: 'Flip the table',
};
export const STYLE_HINT: Record<SegStyle, string> = {
  fiery: 'Loud and angry: big heat if you’ve the charisma, ugly if not',
  cold: 'Safe: never great, never a disaster',
  personal: 'Real-life stuff: the most heat, the biggest risk, and they won’t forget it',
  comedy: 'Plays best as a face; fans love it, the heat less so',
  brutal: 'Heat for days; the office might think it went too far',
  quick: 'Does the job',
  sign: 'A tease: the crowd wanted more',
  attack: 'What everyone came for',
  flip: 'A classic for a reason',
};

/** You choose how to play a segment you're in (before the show). */
export function setSegStyle(c: Career, showId: string, i: number, style: SegStyle): string {
  const g = c.shows[showId]?.segments?.[i];
  if (!g || !g.who.includes(c.player) || g.score !== undefined) return 'Too late for that.';
  if (!STYLES[g.kind].includes(style)) return 'Not for that segment.';
  g.style = style;
  return `${STYLE_LABEL[style]}: ${STYLE_HINT[style].toLowerCase()}.`;
}

/** Your segments on a show (the index on the show's list with them). */
export const mySegments = (c: Career, show: Show): [number, Segment][] => (show.segments ?? []).map((g, i) => [i, g] as [number, Segment]).filter(([, g]) => g.who.includes(c.player));

/** Ask for a promo slot: in a feud with someone on the show, once a show; the booker may say yes. */
export function askForPromo(c: Career, show: Show): string {
  if (!on()) return '';
  const f = myFeuds(c).find((x) => x.promo === show.promo);
  if (!f) return 'You’re not in a feud here.';
  if (mySegments(c, show).length) return 'You’ve already got a segment tonight.';
  if (!(show.card ?? []).some((b) => b.a === c.player || b.b === c.player)) return 'You’re not on the show.';
  const asked = ((show as Show & { asked?: string[] }).asked ??= []);
  if (asked.includes(c.player)) return 'You’ve asked already.';
  asked.push(c.player);
  const p = person(c, c.player);
  const yes = seededRng(hashSeed(c.seed, 'askpromo', show.id))() < FEUD.askBase + p.rep / 250 + feudHeat(f) / 400;
  if (!yes) return 'Not tonight: the show’s full.';
  const mineIdx = (show.card ?? []).findIndex((b) => b.a === c.player || b.b === c.player);
  (show.segments ??= []).push({ kind: 'promo', who: [c.player, rivalOf(c, f)], after: Math.max(-1, mineIdx - 1), feud: f.id });
  return `You’ve got the mic tonight, before your match. Choose how you play it.`;
}

/** How a chosen style lands: a bonus and how much it can swing, what it does to the heat (and the fans). */
const STYLE_FX: Record<SegStyle, { bonus: number; swing: number; heat: number; fans?: number; charisma?: number }> = {
  fiery: { bonus: 0.2, swing: 0.6, heat: 1.2, charisma: 60 }, cold: { bonus: 0.1, swing: 0.2, heat: 1 },
  personal: { bonus: 0.4, swing: 1, heat: 1.5 }, comedy: { bonus: 0.2, swing: 0.5, heat: 0.7, fans: 1.4 },
  brutal: { bonus: 0.3, swing: 0.5, heat: 1.4 }, quick: { bonus: 0, swing: 0.2, heat: 1 },
  sign: { bonus: -0.2, swing: 0.1, heat: 0.8 }, attack: { bonus: 0.35, swing: 0.5, heat: 1.3 }, flip: { bonus: 0.2, swing: 0.4, heat: 1.2 },
};

/** Score a feud segment: the booker's scoring, your choice on top, the heat it built and the fans it won. */
function scoreFeudSegment(c: Career, show: Show, g: Segment, f: Feud | undefined): void {
  const base = rateSegment(c, show, g);
  let score = base.score, heatMult = 1, fanMult = 1;
  if (g.style) {
    const fx = STYLE_FX[g.style as SegStyle];
    const me = W(c.player)!;
    const r = seededRng(hashSeed(c.seed, 'segstyle', show.id, g.kind, g.style));
    let bonus = fx.bonus + (r() * 2 - 1) * fx.swing;
    if (fx.charisma) bonus += (me.stats.charisma - fx.charisma) / 40;
    if (g.style === 'comedy') bonus += me.disposition === 'FACE' ? 0.2 : -0.3;
    score = Math.max(0, Math.min(5, Math.round((score + bonus) * 4) / 4));
    heatMult = fx.heat; fanMult = fx.fans ?? 1;
    // Getting personal: they don't forget. Too brutal: the office notices.
    const rival = g.who.find((x) => x !== c.player);
    if (g.style === 'personal' && rival) moveRelation(c, rival, -5, 'It got personal on the mic');
    if (g.style === 'brutal' && score < 2) person(c, c.player).rep = Math.max(0, person(c, c.player).rep - 1);
  }
  g.score = score;
  g.note = score >= 4 ? 'The building came unglued.' : score >= 3.25 ? 'Went down a storm.' : score >= 2.5 ? 'Did its job.' : score >= 1.5 ? 'The crowd went for a drink.' : 'Died on its arse.';
  for (const id of g.who) {
    const w = W(id);
    if (w?.fans) w.fans[show.region] = Math.max(0, Math.round(w.fans[show.region] * (1 + (score - 2.5) * SEGMENT.fans * fanMult)));
  }
  if (f) {
    const d = (score - 2) * STORY.segHeat * heatMult;
    g.heat = Math.round(d);
    feudBeat(c, f, `${SEG_LABEL[g.kind]} on ${show.name}${g.style ? ` (${STYLE_LABEL[g.style as SegStyle].toLowerCase()})` : ''}: ${score}★`, d);
  }
}

// ------------------------------------------------------------------ the night: segments scored, matches build it, blow-offs pay

/** After a show (not one you book: booker mode has its own): feud segments and matches move the heat; blow-offs pay. */
function afterShow(c: Career, show: Show): void {
  if (!on() || playerRuns(show.promo)) return;
  const card = (show.card ?? []).filter((b) => b.result);
  if (!card.length) return;
  for (const g of show.segments ?? []) {
    if (g.score !== undefined || !g.feud) continue;
    scoreFeudSegment(c, show, g, c.feuds.find((f) => f.id === g.feud));
  }
  for (const b of card) {
    if (b.sides) continue;
    const f = c.feuds.find((x) => x.by !== 'player' && ((x.a === b.a && x.b === b.b) || (x.a === b.b && x.b === b.a)) && (!x.done || x.payoff === show.id));
    if (!f) continue;
    const stars = b.result!.stars;
    if (f.payoff === show.id) {
      // The blow-off: both ride the heat, the winner more.
      const heat = feudHeat(f), win = b.result!.winner;
      for (const id of [b.a, b.b]) {
        const w = W(id);
        if (w?.fans) w.fans[show.region] = Math.round(w.fans[show.region] * (1 + (heat / 100) * (id === win ? FEUD.blowoffWin : FEUD.blowoffLose)));
      }
      feudBeat(c, f, `The blow-off at ${show.name}: ${win ? nameOf(win) : 'nobody'} won, ${stars}★`, 0);
      f.ended = 'blowoff';
      if (b.a === c.player || b.b === c.player) letter(c, { kind: 'news', from: `${show.promo} · the office`, subject: `That’s the end of you and ${nameOf(b.a === c.player ? b.b : b.a)}`, body: [`${feudWord(heat)} by the end: the blow-off went ${stars}★, and the fans who came for it are yours now.`] });
      continue;
    }
    const worn = f.matches > STORY.repeatFrom ? STORY.repeat : 0;
    feudBeat(c, f, `${b.result!.winner ? nameOf(b.result!.winner) : 'Nobody'} won at ${show.name}, ${stars}★${worn ? ' (they’ve seen it before)' : ''}`, (stars - 2.5) * STORY.matchHeat - worn);
  }
}

/** The heat for a match between two (the engine's `rules.feud`), if they're feuding. */
export function feudRules(c: Career, show: Show, a: string, b: string): { heat: number; payoff?: boolean } | undefined {
  if (!on()) return undefined;
  const f = c.feuds.find((x) => ((x.a === a && x.b === b) || (x.a === b && x.b === a)) && (!x.done || x.payoff === show.id));
  if (!f) return undefined;
  const heat = feudHeat(f);
  return heat > 0 ? { heat, ...(f.payoff === show.id ? { payoff: true } : {}) } : undefined;
}

// Mondays: a week with nothing cools a feud. Every day: feuds that have ended go into the world's history.
setCareerHooks({
  show: afterShow,
  daily: (c) => {
    if (!on()) return;
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
});

setFeudRulesHook(feudRules);

// Calling them out online (or starting a beef) stokes it.
setCalloutHook((c, id, kind) => {
  if (!on()) return;
  const f = feudBetween(c, c.player, id);
  if (f) feudBeat(c, f, kind === 'beef' ? 'Your online beef' : 'You called them out online', kind === 'beef' ? FEUD.beef : FEUD.callout);
});

/** For the screens: your feud's rival, heat and where it pays off. */
export function feudLine(c: Career, f: Feud): string {
  const pay = f.payoff ? c.shows[f.payoff] : undefined;
  return `${nameOf(rivalOf(c, f))} · ${feudWord(feudHeat(f))} (${feudHeat(f)})${pay ? ` · pays off at ${pay.name}` : ''}`;
}
void fansIn;
