// Career events (career expansion, stage 3): the things that happen to a wrestler between matches.
//
// Events live in a library (eventLibrary.ts), each with its own conditions, cooldown, the people and
// places it's about, and its choices. This file is the engine: pacing (a daily chance shaped by your
// situation, a gap between events, at most a couple waiting on you), the effects every choice draws
// on, follow-ups that land weeks later, and the memory of what you chose.
import { TITLES, WRESTLERS, findWrestler, type Attributes, type Wrestler } from '../data/rtr';
import { seededRng, type Rng } from '../engine/rng';
import { hashSeed, regionalPop } from './booker';
import { letter, person, setCareerHooks, spend } from './career';
import { C } from './clauses';
import { ATTR_KEYS, ATTR_LONG } from './create';
import { addDays, daysBetween, type Day } from './dates';
import { indieFee } from './economy';
import { REGION_KEY } from './places';
import { movePatience, showBooker } from './patience';
import { moveRelation, remember } from './relations';
import {
  EVENT_BLOCKED_MULT, EVENT_BUSY_MULT, EVENT_CHAMP_MULT, EVENT_DAILY_BASE, EVENT_EXPIRES_DAYS, EVENT_FREE_AGENT_MULT, EVENT_MAX_OPEN, EVENT_MIN_GAP, EVENT_QUIET_MULT,
  EVENT_STAR_MULT, EVENT_UNKNOWN_MULT, OUTSIDE_T1_APPROVAL,
} from './tuning';
import type { Career, Contract, EventChoice, Letter, Person, PopRegion, RelKind, Show } from './types';

export type EventCat = 'training' | 'community' | 'media' | 'backstage' | 'career' | 'personal' | 'fun';
export type EvData = Record<string, string | number>;

/** What an event sees: you, your contract, today, and a seeded roll for its own choices. */
export interface EvCtx { c: Career; me: Wrestler; p: Person; k: Contract | null; rnd: Rng; day: Day }

export interface EvOption {
  id: string;
  label: string | ((x: EvCtx, d: EvData) => string);
  detail?: (x: EvCtx, d: EvData) => string;
  /** Why you can't pick it, if you can't (your contract, your bank balance...). */
  blocked?: (x: EvCtx, d: EvData) => string | null;
  /** Do it: apply the effects and say what happened. */
  run: (x: EvCtx, d: EvData) => string;
  /** Turning it down (counts as a decline in the letter). */
  decline?: boolean;
  /** Not offered at all here (a trait card's "Replace" for a slot you haven't filled). */
  hidden?: (x: EvCtx, d: EvData) => boolean;
}

export interface EventDef {
  id: string;
  cat: EventCat;
  /** Relative chance among the eligible ones (a function to make it depend on the situation). */
  weight: number | ((x: EvCtx) => number);
  /** Days before this event can come round again. */
  cooldown: number;
  when: (x: EvCtx) => boolean;
  /** Pick who and where it's about; null when it can't happen today. */
  setup?: (x: EvCtx) => EvData | null;
  from: (x: EvCtx, d: EvData) => string;
  subject: (x: EvCtx, d: EvData) => string;
  body: (x: EvCtx, d: EvData) => string[];
  options: EvOption[];
  /** Days to answer before it lapses. */
  expires?: number;
  /** What happens if you never answer (most: nothing). */
  ignored?: (x: EvCtx, d: EvData) => string | null;
}

/** A follow-up that lands later (the documentary airs, the sponsor pays, the mentor's second lesson). */
export interface FollowDef { id: string; run: (x: EvCtx, d: EvData) => void }

const LIBRARY: EventDef[] = [];
/** Others listening for your answers (personality: what you choose says something about you). */
const answerHooks: ((c: Career, event: string, option: string) => void)[] = [];
export const onAnswer = (f: (c: Career, event: string, option: string) => void): void => { answerHooks.push(f); };
const FOLLOWS = new Map<string, FollowDef>();
export function registerEvents(defs: EventDef[], follows: FollowDef[] = []): void {
  for (const d of defs) LIBRARY.push(d);
  for (const f of follows) FOLLOWS.set(f.id, f);
}
export const eventLibrary = (): readonly EventDef[] => LIBRARY;

// ------------------------------------------------------------------ helpers the library uses

export const ctxFor = (c: Career, rnd: Rng = seededRng(hashSeed(c.seed, 'ev', c.today))): EvCtx => {
  const p = person(c, c.player);
  return { c, me: findWrestler(c.player)!, p, k: p.contract, rnd, day: c.today };
};
export const pick = <T>(rnd: Rng, xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(rnd() * xs.length)] : undefined);
export const money = (n: number): string => `£${Math.round(n).toLocaleString('en-GB')}`;
export const round5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);
/** Your usual indie fee in your home region: the yardstick for appearance money. */
export const homeRegion = (x: EvCtx): PopRegion => REGION_KEY[x.me.region] ?? 'europe';
export const feeBase = (x: EvCtx): number => indieFee(x.me, homeRegion(x));
/** The titles you hold right now. */
export const titlesHeld = (x: EvCtx): string[] => TITLES.filter((t) => t.holder === x.c.player).map((t) => t.id);

/** A city you'd plausibly be in: one of your recent shows', or one in your home country. */
export function nearbyCity(x: EvCtx): { city: string; country: string } {
  const shows = Object.values(x.c.shows);
  const recent = x.c.history.slice(0, 6).map((m) => x.c.shows[m.show]).filter((s): s is Show => !!s);
  const home = shows.filter((s) => s.country === x.me.country);
  const s = pick(x.rnd, recent.length ? recent : home.length ? home : shows);
  return s ? { city: s.city, country: s.country } : { city: x.me.country, country: x.me.country };
}

/** Wrestlers on your scene: your promotion's roster, or the Indie Scene if you're a free agent. */
export function scene(x: EvCtx): Wrestler[] {
  const promo = x.k?.promo ?? 'TIS';
  return WRESTLERS.filter((w) => w.id !== x.c.player && w.promotion === promo && !x.c.people[w.id]?.retired);
}
export const recentOpp = (x: EvCtx): Wrestler | undefined => (x.c.history[0] ? findWrestler(x.c.history[0].opp) : undefined);

// ------------------------------------------------------------------ effects (every choice is built from these)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export const fx = {
  money(x: EvCtx, n: number, why: string): string {
    if (!n) return '';
    spend(x.c, Math.round(n), why, n > 0 ? 'bonus' : 'training');
    return n > 0 ? `+${money(n)}` : `−${money(-n)}`;
  },
  rep(x: EvCtx, n: number): string {
    x.p.rep = r1(clamp(x.p.rep + n, 0, 100));
    return `reputation ${n > 0 ? '+' : ''}${n}`;
  },
  pop(x: EvCtx, n: number, region: PopRegion | 'home' = 'home'): string {
    const r: PopRegion = region === 'home' ? homeRegion(x) : region;
    const before = regionalPop(x.me, r);
    x.me.popularity[r] = r1(clamp(before + n, 0, 100));
    x.me.popularity.global = r1(clamp(x.me.popularity.global + n * 0.3, 0, 100));
    return `popularity ${n > 0 ? '+' : ''}${n}`;
  },
  fatigue(x: EvCtx, n: number): string {
    x.p.fatigue = clamp(x.p.fatigue + n, 0, 100);
    return `fatigue ${n > 0 ? '+' : ''}${n}`;
  },
  stat(x: EvCtx, key: keyof Attributes, n: number): string {
    const st = x.me.stats as unknown as Record<string, number>;
    const k = String(key);
    st[k] = clamp((st[k] ?? 0) + n, 1, 100);
    return `${ATTR_LONG[ATTR_KEYS.indexOf(key)]} ${n > 0 ? '+' : ''}${n}`;
  },
  patience(x: EvCtx, key: string, n: number, why: string): string {
    movePatience(x.c, key, n, why);
    return '';
  },
  favour(x: EvCtx, key: string): string { remember(x.c, key, 'favours'); return ''; },
  snub(x: EvCtx, key: string): string { remember(x.c, key, 'snubs'); return ''; },
  rel(x: EvCtx, id: string, n: number, why: string, kind?: RelKind): string {
    moveRelation(x.c, id, n, why, kind);
    return '';
  },
  follow(x: EvCtx, inDays: number, id: string, d: EvData): string {
    ((x.c.events ??= blankEvents()).follow ??= []).push({ day: addDays(x.c.today, inDays), id, d });
    return '';
  },
  tally(x: EvCtx, key: string, n = 1): void {
    const t = ((x.c.events ??= blankEvents()).tally ??= {});
    t[key] = (t[key] ?? 0) + n;
  },
};
export const tallyOf = (c: Career, key: string): number => c.events?.tally?.[key] ?? 0;
export const join = (...xs: string[]): string => xs.filter(Boolean).join(' · ');

/** Outside Appearances: media, signings and appearances. Free agents please themselves. */
export function outsideBlocked(x: EvCtx): string | null {
  if (!x.k) return null;
  return (x.k.clauses[C.outside] ?? 0) === 0 ? `Your ${x.k.promo} deal has no Outside Appearances.` : null;
}
/** Tier 1 needs management's say-so: some you just don't get. */
export function outsideApproved(x: EvCtx, salt: string): boolean {
  if (!x.k || (x.k.clauses[C.outside] ?? 0) >= 2) return true;
  return seededRng(hashSeed(x.c.seed, 'outside', salt, x.c.today))() < OUTSIDE_T1_APPROVAL;
}
/** Merchandise Rights: off-brand merch money only reaches you if your deal lets it. */
export function merchBlocked(x: EvCtx): string | null {
  if (!x.k) return null;
  return (x.k.clauses[C.merch] ?? 0) === 0 ? `Your ${x.k.promo} deal has no Merchandise Rights: they keep it.` : null;
}

// ------------------------------------------------------------------ pacing and the daily round

const blankEvents = (): NonNullable<Career['events']> => ({ seen: {}, log: [], open: {} });

/** How likely an event is today, from your situation: quiet spells get more, busy weeks fewer, big names more. */
export function eventChance(x: EvCtx): number {
  const { c } = x;
  const recent = c.history.filter((m) => daysBetween(m.day, c.today) <= 10).length;
  const lastMatch = c.history[0]?.day;
  const quiet = !lastMatch || daysBetween(lastMatch, c.today) >= 7;
  let m = EVENT_DAILY_BASE;
  if (quiet) m *= EVENT_QUIET_MULT;
  if (recent >= 4) m *= EVENT_BUSY_MULT;
  if (!x.k) m *= EVENT_FREE_AGENT_MULT;
  if (titlesHeld(x).length) m *= EVENT_CHAMP_MULT;
  if (x.me.popularity.global >= 60) m *= EVENT_STAR_MULT;
  if (x.me.popularity.global < 15) m *= EVENT_UNKNOWN_MULT;
  return m;
}

const weightOf = (d: EventDef, x: EvCtx) => (typeof d.weight === 'function' ? d.weight(x) : d.weight);

/** The events that could happen today, with their weights. */
export function eligible(x: EvCtx): { d: EventDef; w: number }[] {
  const ev = x.c.events ?? blankEvents();
  const lastCats = ev.log.slice(0, 2).map((l) => LIBRARY.find((d) => d.id === l.id)?.cat);
  return LIBRARY.filter((d) => {
    const seen = ev.seen[d.id];
    if (seen && daysBetween(seen, x.day) < d.cooldown) return false;
    return d.when(x);
  }).map((d) => {
    // Everything but no blocked by your contract (no Outside Appearances, say): rarer, not gone.
    const shut = d.options.filter((o) => !o.decline).every((o) => !!o.blocked?.(x, {}) && /deal/.test(o.blocked(x, {}) ?? ''));
    return { d, w: weightOf(d, x) * (lastCats.includes(d.cat) ? 0.35 : 1) * (shut ? EVENT_BLOCKED_MULT : 1) };
  }).filter((e) => e.w > 0);
}

/** Make an event happen now: it arrives as a letter with its choices. */
export function fire(x: EvCtx, d: EventDef, data?: EvData): Letter | null {
  const dd = data ?? (d.setup ? d.setup(x) : {});
  if (!dd) return null;
  const ev = (x.c.events ??= blankEvents());
  const options: EventChoice[] = d.options.filter((o) => !o.hidden?.(x, dd)).map((o) => ({ id: o.id, label: typeof o.label === 'function' ? o.label(x, dd) : o.label, ...(o.detail ? { detail: o.detail(x, dd) } : {}), ...(o.blocked?.(x, dd) ? { blocked: o.blocked(x, dd)! } : {}) }));
  const l = letter(x.c, {
    kind: 'event', from: d.from(x, dd), subject: d.subject(x, dd), body: d.body(x, dd),
    action: { type: 'event', event: d.id, options, expires: addDays(x.day, d.expires ?? EVENT_EXPIRES_DAYS) },
  });
  ev.seen[d.id] = x.day;
  ev.lastAt = x.day;
  ev.open[l.id] = { id: d.id, d: dd };
  return l;
}

/** An event letter's choices as they stand now (what you can afford changes after the letter arrives). */
export function eventChoices(c: Career, letterId: string): EventChoice[] {
  const l = c.letters.find((y) => y.id === letterId);
  const open = c.events?.open[letterId];
  const stored = l?.action?.type === 'event' ? l.action.options : [];
  const def = open && LIBRARY.find((d) => d.id === open.id);
  if (!def || !open) return stored;
  const x = ctxFor(c, seededRng(hashSeed(c.seed, 'choices', letterId)));
  return def.options.filter((o) => !o.hidden?.(x, open.d)).map((o) => {
    const b = o.blocked?.(x, open.d);
    return { id: o.id, label: typeof o.label === 'function' ? o.label(x, open.d) : o.label, ...(o.detail ? { detail: o.detail(x, open.d) } : {}), ...(b ? { blocked: b } : {}) };
  });
}

/** Your answer to an event letter: the choice's effects, and what came of it (also written on the letter). */
export function answerEvent(c: Career, letterId: string, optionId: string): string {
  const l = c.letters.find((x) => x.id === letterId);
  const ev = c.events;
  const open = ev?.open[letterId];
  if (!l || !ev || !open || l.done) return 'That’s been dealt with.';
  const def = LIBRARY.find((d) => d.id === open.id);
  const opt = def?.options.find((o) => o.id === optionId);
  if (!def || !opt) return 'That’s been dealt with.';
  const x = ctxFor(c, seededRng(hashSeed(c.seed, 'answer', letterId, optionId)));
  const block = opt.blocked?.(x, open.d) ?? (opt.hidden?.(x, open.d) ? 'That isn’t an option.' : null);
  if (block) return block;
  const said = opt.run(x, open.d);
  for (const f of answerHooks) f(c, def.id, opt.id);
  l.done = opt.decline ? 'declined' : 'accepted';
  l.outcome = said;
  l.picked = typeof opt.label === 'function' ? opt.label(x, open.d) : opt.label;
  delete ev.open[letterId];
  ev.log.unshift({ id: def.id, day: c.today, pick: opt.id });
  if (ev.log.length > 200) ev.log.length = 200;
  return said;
}

function daily(c: Career): void {
  const x = ctxFor(c, seededRng(hashSeed(c.seed, 'events', c.today)));
  // Its own roll, so other overnight rules never shift which events you get.
  const rnd = seededRng(hashSeed(c.seed, 'ev-pace', c.today));
  const ev = (c.events ??= blankEvents());
  // Follow-ups that are due.
  for (const f of (ev.follow ?? []).filter((y) => y.day <= c.today)) FOLLOWS.get(f.id)?.run(x, f.d);
  ev.follow = (ev.follow ?? []).filter((y) => y.day > c.today);
  // Letters you never answered lapse.
  for (const [id, o] of Object.entries(ev.open)) {
    const l = c.letters.find((y) => y.id === id);
    const exp = l?.action?.type === 'event' ? l.action.expires : c.today;
    if (!l || l.done || exp > c.today) { if (!l || l.done) delete ev.open[id]; continue; }
    const def = LIBRARY.find((d) => d.id === o.id);
    const said = def?.ignored?.(x, o.d) ?? null;
    l.done = 'expired';
    if (said) l.outcome = said;
    ev.log.unshift({ id: o.id, day: c.today, pick: null });
    delete ev.open[id];
  }
  if (person(c, c.player).retired) return;
  // Pacing: not too close together, not too many waiting, and a chance shaped by your situation.
  if (Object.keys(ev.open).length >= EVENT_MAX_OPEN) return;
  if (ev.lastAt && daysBetween(ev.lastAt, c.today) < EVENT_MIN_GAP) return;
  if (rnd() >= eventChance(x)) return;
  const pool = eligible(x);
  const total = pool.reduce((t, e) => t + e.w, 0);
  let r = rnd() * total;
  for (const e of pool) {
    r -= e.w;
    if (r <= 0) { fire(x, e.d); return; }
  }
}

setCareerHooks({ daily });

/** Promoters' keys for a show, so events can talk about the right booker. */
export { showBooker };
export type { Rng };
