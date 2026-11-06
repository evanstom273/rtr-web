// Social media (Lyra's brief): optional, light, between matches. Post, promote your next match,
// reply, call someone out, start a beef. It wins a few fans (where your fans already are), moves
// relationships and rivalries, makes a challenge easier to ask for, and nudges your personality.
// It never beats wrestling: one action a day, repeats wear thin, and there's a weekly cap. The AI posts
// too, a few times a week, so the feed has a world in it. No randomness outside its own seeds.
import { FAN_REGIONS, fansIn, fansTotal, findWrestler, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondsOf, kindOf, moveBond } from '../world/people';
import { letter, person, setCareerHooks } from './career';
import { calledOut } from './mail';
import { addDays, daysBetween, fmtDay, type Day } from './dates';
import { leanTo } from './leans';
import { moveRelation } from './relations';
import { SOCIAL_AMPLIFY,
  FEATURES, SOCIAL_AI_POSTS, SOCIAL_BACKLASH, SOCIAL_BACKLASH_LOSS, SOCIAL_BUZZ_GREAT, SOCIAL_BUZZ_MATCH, SOCIAL_CONV, SOCIAL_FEED_MAX,
  SOCIAL_REACH_BASE, SOCIAL_REACH_EXP, SOCIAL_REACH_MULT, SOCIAL_REL, SOCIAL_REPEAT_DAYS, SOCIAL_REPEAT_MULT, SOCIAL_WEEK_CAP_BASE,
  SOCIAL_WEEK_CAP_SHARE, MAIL_BACKFIRE_LOSS,
} from './tuning';
import { tierOf } from './clauses';
import { dealsOf } from './deals';
import type { Career, Show } from './types';

export type SocialKind = keyof typeof SOCIAL_CONV;
export interface SocialPost { id: string; day: Day; who: string; kind: SocialKind; text: string; target?: string }
export interface SocialState {
  last?: Day;
  recent: { day: Day; kind: SocialKind }[];
  /** Fans won from social media this week (Monday to Sunday), for the cap. */
  week?: Day;
  weekFans: number;
  /** The show you've promoted (its fans get the boost). */
  promoted?: string;
  /** Who you've called out, and when (a challenge is easier to ask for). */
  callouts: Record<string, Day>;
  feed: SocialPost[];
}

const state = (c: Career): SocialState => (c.social ??= { recent: [], weekFans: 0, callouts: {}, feed: [] });
const mondayOf = (d: Day) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return addDays(d, -((w + 6) % 7)); };

/** How many people a post of yours reaches: a floor for newcomers, growing slower than your fanbase. */
export const reach = (w: Wrestler): number => SOCIAL_REACH_BASE + SOCIAL_REACH_MULT * fansTotal(w) ** SOCIAL_REACH_EXP;
/** The most social media can win you in a week. */
export const weekCap = (w: Wrestler): number => SOCIAL_WEEK_CAP_BASE + SOCIAL_WEEK_CAP_SHARE * fansTotal(w);

/** Your next booked match (the one a promotion post is about). */
export function nextMatch(c: Career): Show | undefined {
  return Object.values(c.shows).filter((s) => s.date >= c.today && !s.done && s.card?.some((b) => (b.a === c.player || b.b === c.player) && !b.result))
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
}

/** Why you can't do this today (or null), and roughly how many fans it would win. */
export function socialPreview(c: Career, kind: SocialKind, target?: string): { blocked: string | null; fans: number } {
  const me = findWrestler(c.player)!;
  const s = state(c);
  const blocked = s.last === c.today ? 'You’ve already posted today.'
    : (kind === 'callout' || kind === 'beef' || kind === 'reply') && (!target || !findWrestler(target) || target === c.player) ? 'Pick someone.'
      : kind === 'promote' && !nextMatch(c) ? 'You’ve no match booked to promote.'
        : null;
  return { blocked, fans: Math.round(Math.max(0, Math.min(gainFor(c, me, kind), capLeft(c, me)))) };
}

function gainFor(c: Career, me: Wrestler, kind: SocialKind): number {
  const s = state(c);
  const repeats = s.recent.filter((x) => x.kind === kind && daysBetween(x.day, c.today) < SOCIAL_REPEAT_DAYS).length;
  const soon = nextMatch(c);
  const matchSoon = !!soon && daysBetween(c.today, soon.date) <= 7;
  const P0 = activeWorld().people;
  const rival = !!P0 && bondsOf(P0, c.player).some((b) => { const k = kindOf(b.bond, c.today); return k === 'rival' || k === 'enemy'; });
  const great = c.history.some((m) => m.stars >= 4 && daysBetween(m.day, c.today) <= 7);
  const buzz = (matchSoon || rival ? SOCIAL_BUZZ_MATCH : 1) * (great ? SOCIAL_BUZZ_GREAT : 1);
  // Social Media Policy Tier 3: their channels amplify you.
  const amp = dealsOf(c.people[c.player]).some((k) => tierOf(k, 'social') >= 3) ? SOCIAL_AMPLIFY : 1;
  return reach(me) * SOCIAL_CONV[kind] * SOCIAL_REPEAT_MULT ** repeats * buzz * amp;
}

function capLeft(c: Career, me: Wrestler): number {
  const s = state(c);
  if (s.week !== mondayOf(c.today)) { s.week = mondayOf(c.today); s.weekFans = 0; }
  return Math.max(0, weekCap(me) - s.weekFans);
}

/** Spread new fans where you already have them. */
function addFans(me: Wrestler, n: number): void {
  const total = FAN_REGIONS.reduce((t, r) => t + fansIn(me, r) + 1, 0);
  for (const r of FAN_REGIONS) me.fans[r] = Math.max(0, me.fans[r] + Math.round((n * (fansIn(me, r) + 1)) / total));
}

/**
 * Something you say in public (to the press, to fans, online, in a reply): fans from your reach, inside this
 * week's social cap so replies can't out-earn wrestling; it can backfire. Seeded per day and what it was.
 */
export function publicSay(c: Career, share: number, backfire: number, salt: string): { fans: number; backfired: boolean } {
  const me = findWrestler(c.player)!;
  const s = state(c);
  const rnd = seededRng(hashSeed(c.seed, 'public', c.today, salt));
  if (backfire && rnd() < backfire) {
    const loss = -Math.round(reach(me) * MAIL_BACKFIRE_LOSS);
    addFans(me, loss);
    person(c, c.player).rep = Math.max(0, person(c, c.player).rep - 1);
    return { fans: loss, backfired: true };
  }
  const fans = Math.round(Math.max(0, Math.min(reach(me) * share, capLeft(c, me))));
  addFans(me, fans);
  s.weekFans += fans;
  return { fans, backfired: false };
}
/** A post of yours in the feed that isn't one of the usual kinds (Life: showing off). */
export function postToFeed(c: Career, text: string): void {
  const s = state(c);
  s.feed = [{ id: `sp${c.today}x${s.feed.length}`, day: c.today, who: c.player, kind: 'post' as const, text }, ...s.feed].slice(0, SOCIAL_FEED_MAX);
}
/** Social Media Policy's fines (conduct.ts plugs in here, so social doesn't depend on it). */
let socialFineHook: ((c: Career, kind: 'callout' | 'beef', target: string) => string | null) | null = null;
export const setSocialFine = (f: typeof socialFineHook): void => { socialFineHook = f; };
/** You've called someone out (online or in a reply): a challenge against them is easier to ask for. */
export function noteCallout(c: Career, id: string): void { state(c).callouts[id] = c.today; }

/**
 * Post something. Returns what happened (fans won or lost, and a line for the screen). Call-outs and
 * beefs can backfire. Nothing happens if you've already posted today.
 */
export function socialAct(c: Career, kind: SocialKind, target?: string): { fans: number; text: string; backfired: boolean } {
  const me = findWrestler(c.player)!;
  const s = state(c);
  const pv = socialPreview(c, kind, target);
  if (pv.blocked) return { fans: 0, text: pv.blocked, backfired: false };
  const rnd = seededRng(hashSeed(c.seed, 'social', c.today, kind));
  const them = target ? findWrestler(target) : undefined;
  const backfired = rnd() < SOCIAL_BACKLASH[kind];
  let fans: number;
  if (backfired) {
    fans = -Math.round(reach(me) * SOCIAL_BACKLASH_LOSS);
    addFans(me, fans);
    person(c, c.player).rep = Math.max(0, person(c, c.player).rep - 1);
  } else {
    fans = Math.round(Math.min(gainFor(c, me, kind), capLeft(c, me)));
    addFans(me, fans);
    s.weekFans += fans;
  }
  s.last = c.today;
  s.recent = [{ day: c.today, kind }, ...s.recent.filter((x) => daysBetween(x.day, c.today) < SOCIAL_REPEAT_DAYS)].slice(0, 10);
  // What it does besides fans: relationships, rivalries, a challenge, and who you are.
  if (kind === 'promote') { const m = nextMatch(c); if (m) s.promoted = m.id; leanTo(c, 'professional', 3); leanTo(c, 'crowd_pleaser', 3); }
  if (kind === 'post') leanTo(c, 'showboat', 2);
  if (them && kind === 'reply') moveRelation(c, them.id, SOCIAL_REL.reply, 'Replied to them online');
  if (them && kind === 'callout') {
    s.callouts[them.id] = c.today;
    moveRelation(c, them.id, SOCIAL_REL.callout, 'You called them out online');
    leanTo(c, 'showboat', 4); leanTo(c, 'egotistical', 3);
  }
  if (them && kind === 'beef') {
    moveRelation(c, them.id, SOCIAL_REL.beef, 'Your online beef', 'rival');
    leanTo(c, 'hot_headed', 8); leanTo(c, 'egotistical', 4);
  }
  const text = writePost(kind, them, nextMatch(c), rnd);
  s.feed = [{ id: `sp${c.today}${kind}`, day: c.today, who: me.id, kind, text, ...(them ? { target: them.id } : {}) }, ...s.feed].slice(0, SOCIAL_FEED_MAX);
  // Social Media Policy: going after their roster can cost you (conduct.ts, set at load).
  const fined = them && (kind === 'callout' || kind === 'beef') ? socialFineHook?.(c, kind, them.id) : null;
  return { fans, text: fined ? `${text} (${fined})` : text, backfired };
}

const pickOne = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

function writePost(kind: SocialKind, them: Wrestler | undefined, show: Show | undefined, rnd: () => number): string {
  const t = them?.name ?? 'someone';
  switch (kind) {
    case 'promote': return show ? pickOne(rnd, [`${show.name}, ${fmtDay(show.date, 'dm')}. Be there.`, `${show.city}, ${fmtDay(show.date, 'dm')}. I’m not saving anything.`]) : 'Big things coming.';
    case 'callout': return pickOne(rnd, [`${t}, you’ve been ducking me. Name the night.`, `Every week I hear about ${t}. Every week I’m still waiting.`]);
    case 'beef': return pickOne(rnd, [`${t} talks a lot for someone who can’t hold a crowd.`, `Funny how ${t} only gets brave online.`]);
    case 'reply': return pickOne(rnd, [`Respect to ${t}. Earned it.`, `${t} knows. We’ll see.`]);
    default: return pickOne(rnd, ['Back in the gym. Someone’s getting hurt this weekend.', 'Thank you to everyone who came out. Loud from bell to bell.', 'Long drive, short sleep, worth it.']);
  }
}

/** The AI's week online: champions brag, feuds spill over, hot-heads start things. Nudges their bonds. */
function aiWeek(c: Career): void {
  const s = state(c);
  const rnd = seededRng(hashSeed(c.seed, 'social-ai', c.today));
  const n = SOCIAL_AI_POSTS[0] + Math.floor(rnd() * (SOCIAL_AI_POSTS[1] - SOCIAL_AI_POSTS[0] + 1));
  const live = WRESTLERS.filter((w) => w.id !== c.player && !c.people[w.id]?.retired);
  const P = activeWorld().people;
  for (let i = 0; i < n; i++) {
    const champ = TITLES.filter((t) => t.holder && t.holder !== c.player);
    const roll = rnd();
    let post: SocialPost | null = null;
    if (roll < 0.35 && champ.length) {
      const t = pickOne(rnd, champ), w = findWrestler(t.holder!)!;
      post = { id: `ai${c.today}${i}`, day: c.today, who: w.id, kind: 'post', text: pickOne(rnd, [`Still ${t.name} champion. Next.`, `Another one. The ${t.name} isn’t going anywhere.`]) };
    } else if (roll < 0.7 && c.feuds.some((f) => !f.done)) {
      const f = pickOne(rnd, c.feuds.filter((x) => !x.done));
      const a = findWrestler(f.a), b = findWrestler(f.b);
      if (a && b && a.id !== c.player && b.id !== c.player) post = { id: `ai${c.today}${i}`, day: c.today, who: a.id, kind: 'callout', target: b.id, text: `${b.name}, you’ve been ducking me. Name the night.` };
    } else {
      const hot = live.filter((w) => w.traits?.includes('hot_headed'));
      const a = hot.length ? pickOne(rnd, hot) : pickOne(rnd, live);
      const peers = live.filter((w) => w.id !== a.id && w.promotion === a.promotion);
      if (peers.length) {
        const b = pickOne(rnd, peers);
        post = { id: `ai${c.today}${i}`, day: c.today, who: a.id, kind: 'beef', target: b.id, text: `${b.name} talks a lot for someone who can’t hold a crowd.` };
        if (P) moveBond(P, a.id, b.id, -3, 'An online beef', c.today);
      }
    }
    if (post) s.feed = [post, ...s.feed].slice(0, SOCIAL_FEED_MAX);
  }
  // Someone calling you out is worth knowing about.
  const atMe = s.feed.find((p) => p.day === c.today && p.target === c.player);
  if (atMe && FEATURES.mail) calledOut(c, atMe.who, atMe.text);
  else if (atMe) letter(c, { kind: 'news', from: findWrestler(atMe.who)?.name ?? 'Online', subject: 'You’re being called out online', body: [atMe.text] });
}

function daily(c: Career): void {
  if (!FEATURES.social) return;
  if (new Date(`${c.today}T12:00:00Z`).getUTCDay() === 1) aiWeek(c);
}

setCareerHooks({ daily });
