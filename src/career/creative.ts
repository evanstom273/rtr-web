// Creative Control in full (Lyra's design): finishes and title outcomes either way (you can ask to lose),
// opponents and card position, feuds and turns. Tier 1 asks (odds by the booker's patience), Tier 2 adds about
// a veto a month they can't refuse, Tier 3 controls everything and pitches its own storylines. It costs nothing.
// AI stars with it protect themselves: no losing to anyone below them, unless it's a title match.
import { findWrestler, globalScore, TITLES, type Wrestler, WRESTLERS } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { available, setCardHook, showRoster } from './booker';
import { person, promoName } from './career';
import { tierOf } from './clauses';
import { addDays, daysBetween, fmtDay, type Day } from './dates';
import { dealWith } from './deals';
import { patienceOf } from './patience';
import { record } from './requests';
import { BOOK_AHEAD_DAYS, CREATIVE, FEUD_WEEKS } from './tuning';
import type { Ask, Bout, Career, Show } from './types';
import { boutPeople, sideOf } from './bouts';

export type CreativeKind = 'win' | 'lose' | 'opponent' | 'position' | 'feud' | 'endFeud' | 'turn';
export interface CreativeReq { kind: CreativeKind; promo: string; show?: string; opp?: string }

export const CREATIVE_LABEL: Record<CreativeKind, string> = {
  win: 'Win this one', lose: 'Lose this one', opponent: 'A different opponent', position: 'Higher up the card',
  feud: 'A feud with…', endFeud: 'End my feud', turn: 'Turn',
};

/** Your Creative Control with a promotion (0 without a deal there). */
export const creativeTier = (c: Career, promo: string): number => tierOf(dealWith(person(c, c.player), promo), 'creative');

/** The odds a Tier 1 (or Tier 2, without its veto) ask comes off: by their booker's patience with you. */
export const creativeOdds = (c: Career, promo: string): number => Math.min(0.95, CREATIVE.askBase + patienceOf(c, promo) * CREATIVE.askPerPatience);

/** Tier 2's veto: one every `vetoDays`. When it's next free (null: now). */
export function vetoNext(c: Career, promo: string): Day | null {
  const k = dealWith(person(c, c.player), promo);
  const last = k?.vetoes?.at(-1);
  if (!last || daysBetween(last, c.today) >= CREATIVE.vetoDays) return null;
  return addDays(last, CREATIVE.vetoDays);
}

/** Your matches on cards already drawn (today and the week ahead) for promotions you have Creative Control with. */
export function creativeBouts(c: Career): { show: Show; bout: Bout; index: number; tier: number }[] {
  const out: { show: Show; bout: Bout; index: number; tier: number }[] = [];
  const until = addDays(c.today, BOOK_AHEAD_DAYS);
  for (const show of Object.values(c.shows)) {
    if (show.done || show.date < c.today || show.date > until || !show.card || show.promo === 'TIS') continue;
    const index = show.card.findIndex((b) => (b.a === c.player || b.b === c.player) && !b.result);
    if (index < 0) continue;
    const tier = Math.max(...(show.promos ?? [show.promo]).map((p) => creativeTier(c, p)));
    if (tier) out.push({ show, bout: show.card[index]!, index, tier });
  }
  return out.sort((a, b) => (a.show.date < b.show.date ? -1 : 1));
}

const opponentOf = (b: Bout, me: string): string => (b.a === me ? b.b : b.a);
const busyThatNight = (c: Career, day: Day): Set<string> => {
  const s = new Set<string>();
  for (const x of Object.values(c.shows)) if (x.date === day) for (const b of x.card ?? []) for (const id of boutPeople(b)) s.add(id);
  return s;
};

/** Who you could face instead on a show: on its roster, free that night, fit, your division unless it's open. */
export function opponentsFor(c: Career, show: Show, roster: readonly Wrestler[]): Wrestler[] {
  const busy = busyThatNight(c, show.date);
  const me = findWrestler(c.player)!;
  return showRoster(show, roster).filter((w) => w.id !== c.player && !busy.has(w.id) && available(c.people[w.id], show.date) && w.gender === me.gender)
    .sort((a, b) => globalScore(b) - globalScore(a));
}

/** Can you ask this at all (and what's in the way)? */
export function creativeBlock(c: Career, r: CreativeReq): string | null {
  const tier = creativeTier(c, r.promo);
  if (!tier) return `Your ${r.promo} deal has no Creative Control.`;
  const show = r.show ? c.shows[r.show] : undefined;
  const bout = show?.card?.find((b) => (b.a === c.player || b.b === c.player) && !b.result);
  if (['win', 'lose', 'opponent', 'position'].includes(r.kind)) {
    if (!show || !bout) return 'You’re not on that card.';
    if (show.date < c.today) return 'That’s been and gone.';
    const opp = opponentOf(bout, c.player);
    if (r.kind === 'win' && bout.planned === c.player) return 'You’re already booked to win.';
    if (r.kind === 'lose' && bout.planned === opp) return 'You’re already booked to lose.';
    if (r.kind === 'opponent') {
      if (bout.title && tier < 3) return 'Title matches have their own challengers: only Full Creative Control changes them.';
      if (bout.tourney || bout.farewell) return 'Not this one: it’s part of something bigger.';
      if (!r.opp) return 'Pick an opponent.';
    }
    if (r.kind === 'position' && show.card!.indexOf(bout) === show.card!.length - 1) return 'You’re already the main event.';
  }
  if (r.kind === 'feud' && !r.opp) return 'Pick a rival.';
  if (r.kind === 'feud' && c.feuds.some((f) => !f.done && (f.a === c.player || f.b === c.player))) return 'You’re already in a feud. End it first.';
  if (r.kind === 'endFeud' && !c.feuds.some((f) => !f.done && f.promo === r.promo && (f.a === c.player || f.b === c.player))) return `You’re not in a ${r.promo} feud.`;
  return null;
}

/**
 * Ask (Tier 1, or Tier 2 without spending the veto), veto (Tier 2, about once a month), or decide (Tier 3).
 * Lyra's call: using it costs nothing. Returns the answer, kept with your other requests.
 */
export function creativeAsk(c: Career, r: CreativeReq, useVeto = false): Ask {
  const tier = creativeTier(c, r.promo);
  const what = describe(c, r);
  const block = creativeBlock(c, r);
  const key = `creative:${r.kind}:${r.show ?? r.opp ?? c.today}`;
  if (block) return record(c, { kind: 'creative', to: r.promo, what, key, answer: 'no', said: block });
  const k = dealWith(person(c, c.player), r.promo)!;
  if (useVeto) {
    if (tier !== 2) return record(c, { kind: 'creative', to: r.promo, what, key, answer: 'no', said: tier >= 3 ? 'You don’t need a veto: it’s your call.' : 'Vetoes need Protected Booking.' });
    const next = vetoNext(c, r.promo);
    if (next) return record(c, { kind: 'creative', to: r.promo, what, key, answer: 'no', said: `Your veto’s used: the next one’s from ${fmtDay(next, 'dm')}.` });
  }
  const granted = tier >= 3 || useVeto || seededRng(hashSeed(c.seed, 'creative', key))() < creativeOdds(c, r.promo);
  if (!granted) return record(c, { kind: 'creative', to: r.promo, what, key, answer: 'no', said: '“We hear you. We’re keeping it as it is.”' });
  if (useVeto) (k.vetoes ??= []).push(c.today);
  const said = apply(c, r);
  return record(c, { kind: 'creative', to: r.promo, what, key, answer: 'yes', said: tier >= 3 ? `Your call: ${said}` : useVeto ? `Vetoed: ${said}` : `They’ve listened: ${said}` });
}

function describe(c: Career, r: CreativeReq): string {
  const show = r.show ? c.shows[r.show] : undefined;
  const opp = r.opp ? findWrestler(r.opp)?.name : undefined;
  switch (r.kind) {
    case 'win': return `Win on ${show?.name ?? 'the show'}`;
    case 'lose': return `Lose on ${show?.name ?? 'the show'}`;
    case 'opponent': return `Face ${opp ?? 'someone else'} on ${show?.name ?? 'the show'}`;
    case 'position': return `Main event ${show?.name ?? 'the show'}`;
    case 'feud': return `A feud with ${opp ?? 'someone'}`;
    case 'endFeud': return 'End my feud';
    case 'turn': return findWrestler(c.player)?.disposition === 'HEEL' ? 'Turn face' : 'Turn heel';
  }
}

function apply(c: Career, r: CreativeReq): string {
  const show = r.show ? c.shows[r.show] : undefined;
  const bout = show?.card?.find((b) => (b.a === c.player || b.b === c.player) && !b.result);
  const me = findWrestler(c.player)!;
  switch (r.kind) {
    case 'win': bout!.planned = c.player; return 'you’re going over.';
    case 'lose': bout!.planned = opponentOf(bout!, c.player); return `you’re putting ${findWrestler(bout!.planned)?.name} over.`;
    case 'opponent': {
      const opp = findWrestler(r.opp!);
      const ok = !!opp && opponentsFor(c, show!, WRESTLERS).some((w) => w.id === opp.id);
      if (!opp || !ok) return 'they’d have done it, but that opponent isn’t free that night.';
      if (bout!.a === c.player) bout!.b = opp.id; else bout!.a = opp.id;
      delete bout!.planned;
      if (bout!.feud) delete bout!.feud;
      return `you’re facing ${opp.name} instead.`;
    }
    case 'position': {
      const card = show!.card!;
      card.splice(card.indexOf(bout!), 1);
      card.push(bout!);
      return `you’re in the main event of ${show!.name}.`;
    }
    case 'feud': {
      const opp = findWrestler(r.opp!)!;
      const upcoming = Object.values(c.shows).filter((s) => s.promo === r.promo && s.date > c.today).sort((a, b) => (a.date < b.date ? -1 : 1));
      const payoff = upcoming.find((s) => (s.kind === 'special' || s.kind === 'flagship') && daysBetween(c.today, s.date) >= FEUD_WEEKS[0] * 7)
        ?? upcoming.find((s) => daysBetween(c.today, s.date) >= FEUD_WEEKS[0] * 7);
      c.feuds.push({ id: `f${++c.seq}`, promo: r.promo, a: c.player, b: opp.id, start: c.today, payoff: payoff?.id ?? null, matches: 0, done: false });
      return `you and ${opp.name} are feuding${payoff ? `, building to ${payoff.name}` : ''}.`;
    }
    case 'endFeud': {
      const f = c.feuds.find((x) => !x.done && x.promo === r.promo && (x.a === c.player || x.b === c.player))!;
      f.done = true;
      return 'the feud’s over.';
    }
    case 'turn': {
      me.disposition = me.disposition === 'HEEL' ? 'FACE' : 'HEEL';
      return `you’re a ${me.disposition === 'HEEL' ? 'heel' : 'face'} now.`;
    }
  }
}

/**
 * AI stars with Creative Control protect themselves (Lyra's call): on a non-title match against someone ranked
 * below them, the booker plans for them to win. Beating one means something. You count as anyone else: once
 * you've overtaken them, they've no say over you.
 */
export function protectStars(c: Career, show: Show, card: Bout[]): void {
  if (show.promo === 'TIS') return;
  const promos = show.promos ?? [show.promo];
  const say = (id: string): number => (id === c.player ? 0 : Math.max(0, ...promos.map((p) => tierOf(dealWith(c.people[id], p), 'creative'))));
  for (const b of card) {
    if (b.title || b.planned || b.tourney || b.farewell || b.tryout) continue;
    // Everyone in it (a tag match, a multi-man): the biggest star, and if they've the say, their side wins.
    const ws = boutPeople(b).map((id) => findWrestler(id)).filter((w): w is NonNullable<typeof w> => !!w);
    if (ws.length < 2) continue;
    const top = ws.reduce((x, y) => (globalScore(y) > globalScore(x) ? y : x));
    if (say(top.id) >= 1) b.planned = b.sides ? sideOf(b, top.id)?.[0] ?? top.id : top.id;
  }
}

setCardHook(protectStars);
export { promoName, TITLES };
