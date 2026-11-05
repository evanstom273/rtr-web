// Social life (Lyra's relationships redesign, stage 1). Everyone has one, not just you:
// - backstage at every show, people on the card get talking, and take to each other by chemistry (their traits,
//   where they're from and trained, their ages, and the click between them); bookers and promoters too;
// - in the ring, a good match earns respect both ways, a poor one costs a little, and a feud spills over into
//   real feelings by personality (hot-heads and egotists take it personally, professionals respect the work);
// - out of touch, feelings drift and people forget each other; the weakest, stalest bonds go, so the save stays lean;
// - when a friendship turns into a best friendship, or sours into enmity, it makes the backstage news if you'd care;
// - wellbeing (0–100) for everyone, from friends and enemies, family, form, titles, goals, injuries, being idle,
//   and (for you) fatigue and money: it moves weekly for the people around you and monthly for everyone else, and
//   it matters (every roll in the ring, training, recovery, retiring);
// - everyone else has a goal, from their situation and personality.
// It's tiered (Lyra's call): your circle in detail, the rest of the world in broad strokes.
import { findWrestler, hasTrait, TITLES, type Wrestler, WRESTLERS, worksFor, holds } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondOf, bondsOf, bookerOf, dropBond, feelPair, freshPeople, kindOf, likeOf, promoterOf, together, type Bond, type BondKind, type Goal, type Life, type People } from '../world/people';
import { chemistry, ensureCircle, firstRespect, gauss, homeOf, personaOf, seedWorld, staffPersona, type Persona } from '../world/social';
import { letter, setCareerHooks, setMod, setMoodDice, showsOn } from './career';
import { addDays, daysBetween, weekday, type Day } from './dates';
import { dealsOf } from './deals';
import {
  BOND_KIND, ROMANCE, ROOM, BOND_LOG, GOALS, MOOD, MOOD_FX, SOCIAL_DRIFT, SOCIAL_ENCOUNTER, SOCIAL_MATCH, SOCIAL_NEWS_MAX, SOCIAL_PRUNE, SOCIAL_READ, SOCIAL_SEEK, SOCIAL_SPILL,
} from './tuning';
import type { Bout, Career, Show } from './types';
import { boutPeople } from './bouts';

const people = (): People => (activeWorld().people ??= freshPeople());
/** Not really in the world: retired, or a placeholder (Nobody, while history runs). */
const gone = (c: Career, id: string): boolean => id.startsWith('__') || !!c.people[id]?.retired;
const keepFor = (c: Career, ...ids: string[]) => (ids.includes(c.player) ? BOND_LOG.mine : BOND_LOG.theirs);
const nameOf = (id: string): string => findWrestler(id)?.name ?? people().staff[id]?.name ?? people().folk?.[id]?.name ?? id;

// ------------------------------------------------------------------ the world gets its relationships

/** A career starts: a fresh world is given its relationships, and you your circle. */
function onStart(c: Career): void {
  const w = activeWorld();
  seedWorld({ seed: w.seed, day: c.today, wrestlers: WRESTLERS, people: people(), out: (id) => gone(c, id) });
  const me = findWrestler(c.player);
  if (me && !c.player.startsWith('__')) ensureCircle({ seed: w.seed, day: c.today, player: me, wrestlers: WRESTLERS, people: people(), out: (id) => gone(c, id) });
  // Everyone's wellbeing starts where their life puts it (not all at the same middling number).
  for (const x of WRESTLERS) if (!gone(c, x.id) && people().lives?.[x.id]?.mood === undefined) updateMood(c, x.id, 1);
  goals(c, seededRng(hashSeed(c.seed, 'goals', c.today)));
}

// ------------------------------------------------------------------ backstage

function personaFor(id: string, day: Day): Persona | undefined {
  const w = findWrestler(id);
  if (w) return personaOf(w);
  const s = people().staff[id];
  return s ? staffPersona(s, day) : undefined;
}

/** A move that shrinks as feelings in that direction get stronger (friendships and grudges settle). */
const settle = (d: number, cur: number): number => (Math.sign(d) === Math.sign(cur) ? d * (1 - (SOCIAL_ENCOUNTER.settle * Math.abs(cur)) / 100) : d);

/** Two people get talking: each takes to the other by chemistry, and they know each other a bit better. */
export function encounter(c: Career, x: string, y: string, where: string, rnd: Rng): Bond | undefined {
  const E = SOCIAL_ENCOUNTER;
  const P = people();
  const seed = activeWorld().seed;
  const px = personaFor(x, c.today), py = personaFor(y, c.today);
  if (!px || !py) return undefined;
  const fresh = !bondOf(P, x, y);
  const lx = likeOf(P, x, y), ly = likeOf(P, y, x);
  // Time together warms people (unless they clash): chemistry decides which way, and how far.
  const dx = Math.round(settle(E.warmth + chemistry(seed, px, py) * E.like + gauss(rnd) * E.noise, lx));
  const dy = Math.round(settle(E.warmth + chemistry(seed, py, px) * E.like + gauss(rnd) * E.noise, ly));
  const r = rnd() < E.respect ? 1 : 0;
  // A new face on your roster takes to you by your standing in that locker room (stage 5).
  let first = 0;
  if (fresh && (x === c.player || y === c.player)) {
    const other = findWrestler(x === c.player ? y : x);
    const promo = other && other.promotion !== 'TIS' && dealsOf(c.people[c.player]).some((k) => worksFor(other, k.promo)) ? other.promotion : undefined;
    if (promo) first = Math.round(((c.room?.[promo]?.v ?? ROOM.start) - ROOM.start) * ROOM.firstImpression);
  }
  // First impressions of each other's work, the first time they meet.
  const rx = fresh ? firstRespect(px, py, rnd) : r, ry = fresh ? firstRespect(py, px, rnd) : r;
  return feelPair(P, x, y, [dx + (y === c.player ? first : 0), rx], [dy + (x === c.player ? first : 0), ry], `Got talking at ${where}`, c.today, { keep: keepFor(c, x, y), fam: E.fam });
}

/** Who someone seeks out backstage: friends and people they know, rarely anyone they dislike. */
function seek(P: People, x: string, y: string): number {
  const S = SOCIAL_SEEK;
  const b = bondOf(P, x, y);
  if (!b) return 1;
  const l = b.a === x ? b.la : b.lb;
  if (l <= S.avoid) return S.avoidMult;
  return 1 + Math.max(0, l - S.likeOver) * S.perLike + b.f * S.perFam;
}

/** Yesterday's shows: everyone on each card had the chance to get talking to someone, and the booker did the rounds. */
function backstage(c: Career, rnd: Rng): void {
  const day = addDays(c.today, -1);
  const P = people();
  for (const show of showsOn(c, day)) {
    if (!show.card?.some((b) => b.result)) continue;
    const here = [...new Set(show.card.flatMap((b) => boutPeople(b)))].filter((id) => !!findWrestler(id) && !gone(c, id));
    if (here.length < 2) continue;
    const where = show.name;
    for (const x of here) {
      const talks = (rnd() < SOCIAL_ENCOUNTER.chance ? 1 : 0) + (rnd() < SOCIAL_ENCOUNTER.second ? 1 : 0);
      if (!talks) continue;
      const others = here.filter((y) => y !== x);
      for (let t = 0; t < talks; t++) {
        const ws = others.map((y) => seek(P, x, y));
        let r = rnd() * ws.reduce((a, b) => a + b, 0);
        let y = others[others.length - 1]!;
        for (let i = 0; i < others.length; i++) { r -= ws[i]!; if (r <= 0) { y = others[i]!; break; } }
        encounter(c, x, y, where, rnd);
      }
    }
    const boss = show.promo === 'TIS' ? (show.brand ? promoterOf(P, show.brand)?.id : undefined) : bookerOf(P, show.promo)?.id;
    if (boss) for (let i = 0; i < SOCIAL_ENCOUNTER.booker; i++) encounter(c, boss, here[Math.floor(rnd() * here.length)]!, where, rnd);
  }
}

// ------------------------------------------------------------------ in the ring

const takesItPersonally = (w: Wrestler) => hasTrait(w, 'hot_headed') || hasTrait(w, 'egotistical');
const respectsTheWork = (w: Wrestler) => hasTrait(w, 'professional') || hasTrait(w, 'team_player');

/** Every match: respect from how good it was, familiarity, and a feud spilling over by personality. */
function afterBout(c: Career, show: Show, bout: Bout): void {
  const res = bout.result;
  const a = findWrestler(bout.a), b = findWrestler(bout.b);
  if (!res || !a || !b) return;
  const M = SOCIAL_MATCH;
  const r = res.stars >= 3 ? Math.round((res.stars - 3) * M.respectPerStar) : res.stars < M.poor ? M.poorRespect : 0;
  let la = 0, lb = 0;
  const feud = !!bout.feud;
  if (feud) {
    const rnd = seededRng(hashSeed(c.seed, 'spill', show.id, bout.a, bout.b));
    if (rnd() < SOCIAL_SPILL.chance) {
      la = (takesItPersonally(a) ? SOCIAL_SPILL.personal : 0) + (respectsTheWork(a) ? SOCIAL_SPILL.work : 0);
      lb = (takesItPersonally(b) ? SOCIAL_SPILL.personal : 0) + (respectsTheWork(b) ? SOCIAL_SPILL.work : 0);
    }
  }
  const x = feelPair(people(), a.id, b.id, [la, r], [lb, r], feud ? `Feuding: ${show.name}` : `In the ring at ${show.name}`, c.today, { keep: keepFor(c, a.id, b.id), fam: M.fam });
  if (feud) x.riv = c.today;
}

// ------------------------------------------------------------------ the months: drift, kinds, news, a lean save

const isFamily = (id: string) => { const f = people().folk?.[id]; return !!f && (f.kind === 'family' || f.kind === 'trainer'); };

/** People the player would care to hear about: on a roster with them, or people they know. */
function cares(c: Career, id: string): boolean {
  const me = findWrestler(c.player), w = findWrestler(id);
  if (!me || !w) return false;
  if (me.promotion !== 'TIS' && dealsOf(c.people[c.player]).some((k) => worksFor(w, k.promo))) return true;
  return (bondOf(people(), c.player, id)?.f ?? 0) >= SOCIAL_READ.rough + 10;
}

const KIND_NEWS: Partial<Record<BondKind, (a: string, b: string) => [string, string]>> = {
  best_friend: (a, b) => [`${a} and ${b} are inseparable`, `${a} and ${b} have become the best of friends: they travel together, room together and back each other up.`],
  enemy: (a, b) => [`${a} and ${b} have fallen out`, `Things between ${a} and ${b} have turned ugly. Nobody wants to be in the room when they’re both in it.`],
};
const MY_NEWS: Partial<Record<BondKind, (them: string) => [string, string]>> = {
  friend: (t) => [`You and ${t} are friends now`, `Somewhere along the way, ${t} stopped being someone you work with and became a friend.`],
  best_friend: (t) => [`${t}: one of your best friends`, `You and ${t} have become proper close. The kind of friend you’d drive across the country for.`],
  enemy: (t) => [`You and ${t} can’t stand each other`, `There’s no pretending any more: you and ${t} are enemies.`],
};

function monthlyBonds(c: Career): void {
  const P = people();
  const day = c.today;
  const D = SOCIAL_DRIFT, X = SOCIAL_PRUNE;
  let news = 0;
  for (const [k, x] of Object.entries(P.bonds)) {
    const idle = daysBetween(x.last, day);
    const kin = isFamily(x.a) || isFamily(x.b);
    // Out of touch: feelings fade towards nothing, and they know each other less (family stays family).
    if (idle > D.after && !kin) {
      const fade = (v: number) => Math.round(v * (1 - D.like * (v < 0 ? D.grudge : 1)));
      x.la = fade(x.la); x.lb = fade(x.lb);
      x.ra = Math.round(x.ra * (1 - D.respect)); x.rb = Math.round(x.rb * (1 - D.respect));
      x.f = Math.max(0, x.f - D.fam);
    }
    if (x.riv && daysBetween(x.riv, day) > BOND_KIND.rivalDays) delete x.riv;
    // Weak, little known and long since: they've forgotten each other.
    if (!kin && !x.mentor && !x.riv && Math.abs(x.la) < X.like && Math.abs(x.lb) < X.like && x.f < X.fam && idle > X.days) { dropBond(P, k); continue; }
    const now = kindOf(x, day);
    if (now === x.k) continue;
    const was = x.k;
    if (now) x.k = now; else delete x.k;
    if (news >= SOCIAL_NEWS_MAX || !now || c.spectator) continue;
    // What it's become, if it's news: yours (when you can tell), or people you'd care about.
    if (x.a === c.player || x.b === c.player) {
      const them = x.a === c.player ? x.b : x.a;
      const f = MY_NEWS[now];
      if (!f || isFamily(them) || (now === 'enemy' && x.f < SOCIAL_READ.clear && (x.a === c.player ? x.la : x.lb) > BOND_KIND.enemy)) continue;
      const [subject, body] = f(nameOf(them));
      letter(c, { kind: 'news', from: 'Backstage', subject, body: [body] });
      news++;
    } else if (KIND_NEWS[now] && (now !== 'enemy' || was !== 'enemy') && (cares(c, x.a) || cares(c, x.b))) {
      const [subject, body] = KIND_NEWS[now]!(nameOf(x.a), nameOf(x.b));
      letter(c, { kind: 'news', from: 'Backstage', subject, body: [body] });
      news++;
    }
  }
  // Nobody keeps more than so many: the closest (and the strongest feelings) stay.
  const counted = new Map<string, number>();
  for (const x of Object.values(P.bonds)) { counted.set(x.a, (counted.get(x.a) ?? 0) + 1); counted.set(x.b, (counted.get(x.b) ?? 0) + 1); }
  for (const [id, n] of counted) {
    if (n <= X.max || id === c.player) continue;
    const mine = bondsOf(P, id).filter((y) => !y.bond.mentor && !isFamily(y.other) && y.other !== c.player)
      .sort((p, q) => strength(p.bond) - strength(q.bond));
    for (const y of mine.slice(0, n - X.max)) dropBond(P, `${y.bond.a}|${y.bond.b}`);
  }
}
const strength = (x: Bond) => Math.abs(x.la) + Math.abs(x.lb) + x.f + (x.riv ? 50 : 0);

// ------------------------------------------------------------------ wellbeing

const lifeOf = (id: string): Life => ((people().lives ??= {})[id] ??= {});
/** Someone's wellbeing, 0–100 (where it settles for anyone it hasn't been worked out for yet). */
export const moodOf = (id: string): number => people().lives?.[id]?.mood ?? MOOD.base;
export function moodLabel(v: number): string {
  return v >= 80 ? 'Flying' : v >= 65 ? 'In a good place' : v >= 45 ? 'Doing fine' : v >= 30 ? 'Struggling' : 'In a bad way';
}

/** What wellbeing reasons say (the profile shows the biggest few). */
export const MOOD_WHY: Record<string, string> = {
  friends: 'Good friends around them', best: 'A best friend in their corner', enemies: 'Enemies backstage', alone: 'Nobody in their corner',
  mentor: 'A mentorship', family: 'Family behind them', form_up: 'Winning', form_down: 'Losing', great: 'A great match lately', champ: 'Holding a title',
  goal_met: 'Got what they were after', goal_stuck: 'Getting nowhere', injured: 'Injured', idle: 'Not getting booked', tired: 'Worn out', broke: 'Money worries',
  dating: 'Seeing someone', partner: 'In love', apart: 'Apart from their partner a lot', grief: 'Grieving', death: 'A death in the family', ill: 'Someone they love is ill',
  baby: 'A new baby', heartbreak: 'Heartbroken', wedding: 'Just married (or about to be)', room_up: 'Respected in the locker room', room_down: 'Frozen out in the locker room',
};
const LOVE_RANK = ['crush', 'dating', 'partner', 'living', 'engaged', 'married'];

/** Where someone's wellbeing is heading, and the biggest reasons. */
export function moodTarget(c: Career, id: string): { v: number; why: string[] } {
  const M = MOOD;
  const P = people();
  const p = c.people[id];
  const parts: [string, number][] = [];
  let friends = 0, best = 0, enemies = 0, family = 0, mentor = false;
  for (const { other, bond } of bondsOf(P, id)) {
    const k = kindOf(bond, c.today);
    if (k === 'best_friend') best++;
    else if (k === 'friend') friends++;
    else if (k === 'enemy') enemies++;
    if (bond.mentor) mentor = true;
    if (P.folk?.[other]?.kind === 'family' && !P.folk[other]!.died && (bond.a === id ? bond.lb : bond.la) >= BOND_KIND.friend) family++;
  }
  // Love (stage 4): a partner lifts it, by how far you've come; being apart a lot drags it.
  const lover = bondsOf(P, id).filter((b) => together(b.bond)).sort((a, b) => LOVE_RANK.indexOf(b.bond.love!.st) - LOVE_RANK.indexOf(a.bond.love!.st))[0];
  if (lover) {
    const st = lover.bond.love!.st as keyof typeof ROMANCE.mood;
    parts.push([st === 'dating' ? 'dating' : 'partner', ROMANCE.mood[st] ?? 0]);
    const them = findWrestler(lover.other), me = findWrestler(id);
    // Where you live now, not where you were born (you can move to be with them); living together isn't apart.
    const mine = id === c.player ? c.base ?? me?.country : me?.country, theirs = lover.other === c.player ? c.base ?? them?.country : them?.country;
    const together = id === c.player ? c.home?.with === lover.other : lover.other === c.player && c.home?.with === id;
    if (them && me && !together && (theirs !== mine || (them.promotion !== me.promotion && them.promotion !== 'TIS' && me.promotion !== 'TIS'))) parts.push(['apart', ROMANCE.mood.apart]);
  }
  // What's happened lately: a death, a wedding, a baby, a break-up.
  for (const s of P.lives?.[id]?.shocks ?? []) if (s.until > c.today) parts.push([s.k, s.d]);
  if (friends) parts.push(['friends', Math.min(M.friendMax, friends * M.friend)]);
  if (best) parts.push(['best', Math.min(M.bestMax, best * M.best)]);
  if (enemies) parts.push(['enemies', Math.max(M.enemyMax, enemies * M.enemy)]);
  if (!friends && !best && !family) parts.push(['alone', M.alone]);
  if (mentor) parts.push(['mentor', M.mentor]);
  if (family) parts.push(['family', M.family]);
  const recent = p?.recent ?? [];
  if (recent.length >= 3) {
    const f = (recent.reduce((a, b) => a + b, 0) / recent.length - 0.5) * M.form;
    if (Math.round(f)) parts.push([f > 0 ? 'form_up' : 'form_down', Math.round(f)]);
  }
  const great = id === c.player ? c.history.some((m) => m.stars >= 4 && daysBetween(m.day, c.today) <= 30) : (p?.form?.stars ?? 0) >= 3.75 && !!p?.last && daysBetween(p.last, c.today) <= 30;
  if (great) parts.push(['great', M.great]);
  if (TITLES.some((t) => holds(t, id))) parts.push(['champ', M.champ]);
  const life = P.lives?.[id];
  if (life?.met && daysBetween(life.met, c.today) <= 90) parts.push(['goal_met', M.goalMet]);
  else if (life?.goal && STRIVING.has(life.goal.kind) && daysBetween(life.goal.since, c.today) > M.stuckDays) parts.push(['goal_stuck', M.goalStuck]);
  if (p?.injury) parts.push(['injured', M.injured]);
  // Not getting booked (or never yet, since the career began).
  else if (p && daysBetween(p.last ?? c.startedOn, c.today) > M.idleDays) parts.push(['idle', M.idle]);
  if (id === c.player) {
    // Your standing in your locker room (stage 5).
    const k = c.people[c.player]?.contract;
    const room = k ? c.room?.[k.promo]?.v : undefined;
    if (room !== undefined && room >= ROOM.high) parts.push(['room_up', ROOM.moodHigh]);
    if (room !== undefined && room <= ROOM.low) parts.push(['room_down', ROOM.moodLow]);
    if ((p?.fatigue ?? 0) >= M.tiredAt) parts.push(['tired', M.tired]);
    if (c.money < 0) parts.push(['broke', M.broke]);
  }
  const v = Math.max(0, Math.min(100, M.base + parts.reduce((t, [, d]) => t + d, 0)));
  return { v, why: parts.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 3).map(([k, d]) => `${d >= 0 ? '+' : '-'}${k}`) };
}

/** Wellbeing moves part of the way towards where it's heading. */
export function updateMood(c: Career, id: string, step: number): void {
  const t = moodTarget(c, id);
  const life = lifeOf(id);
  const now = life.mood ?? MOOD.base;
  life.mood = Math.round(now + (t.v - now) * step);
  life.moodAt = c.today;
  life.why = t.why;
}

/** The people around you (your circle in detail): you, people you know, your roster. */
function circleTier(c: Career): string[] {
  const ids = new Set<string>([c.player]);
  const me = findWrestler(c.player);
  for (const { other, bond } of bondsOf(people(), c.player)) if (bond.f >= SOCIAL_READ.rough + 10 && findWrestler(other)) ids.add(other);
  const promos = dealsOf(c.people[c.player]).map((k) => k.promo);
  if (me && promos.length) for (const w of WRESTLERS) if (promos.some((x) => worksFor(w, x))) ids.add(w.id);
  return [...ids].filter((id) => !gone(c, id));
}

// ------------------------------------------------------------------ goals

const STRIVING = new Set<Goal['kind']>(['title', 'top', 'signed', 'move', 'even']);
export const GOAL_TEXT: Record<Goal['kind'], string> = {
  title: 'Wants a title', top: 'Wants to break through', signed: 'Wants to get signed by a major', money: 'Wants to get paid', move: 'Wants out of their promotion',
  stay: 'Happy where they are', even: 'Wants to get even', teach: 'Bringing the young ones on', wind_down: 'Winding down',
};

/** What someone's after, from their situation and who they are. */
function goalFor(c: Career, w: Wrestler, rnd: Rng): { kind: Goal['kind']; on?: string } {
  const G = GOALS;
  const p = c.people[w.id];
  const P = people();
  if (w.age >= G.windDown || p?.retiring) return { kind: 'wind_down' };
  if (w.promotion === 'TIS' && w.age <= 32) return { kind: 'signed' };
  const enemy = bondsOf(P, w.id).find((x) => kindOf(x.bond, c.today) === 'enemy' && (x.bond.a === w.id ? x.bond.la : x.bond.lb) <= BOND_KIND.enemy);
  const was = P.lives?.[w.id]?.goal;
  if (enemy && takesItPersonally(w) && (was?.kind === 'even' || rnd() < G.evenChance)) return { kind: 'even', on: enemy.other };
  if (hasTrait(w, 'mentor') && w.age >= G.teach) return { kind: 'teach' };
  const booker = w.promotion !== 'TIS' ? bookerOf(P, w.promotion) : undefined;
  if (w.promotion !== 'TIS' && !hasTrait(w, 'loyal') && (moodOf(w.id) <= G.moveMood || (booker && likeOf(P, booker.id, w.id) <= G.moveBooker))) return { kind: 'move', on: w.promotion };
  if (hasTrait(w, 'mercenary')) return { kind: 'money' };
  if (TITLES.some((t) => t.holder === w.id)) return { kind: 'stay' };
  if (hasTrait(w, 'ambitious')) return { kind: 'title' };
  if (w.age <= G.young) return { kind: 'top' };
  return { kind: 'stay' };
}

/** Did they get what they were after? */
function met(c: Career, w: Wrestler, g: Goal): boolean {
  const p = c.people[w.id];
  if (g.kind === 'title') return TITLES.some((t) => t.holder === w.id) && (c.titles[TITLES.find((t) => t.holder === w.id)!.id]?.since ?? '') >= g.since;
  if (g.kind === 'signed') return w.promotion !== 'TIS';
  if (g.kind === 'move') return !!g.on && !worksFor(w, g.on);
  if (g.kind === 'top') return !!p?.breakthrough && p.breakthrough >= g.since;
  if (g.kind === 'even') return !!g.on && likeOf(people(), w.id, g.on) > BOND_KIND.enemy;
  return false;
}

function goals(c: Career, rnd: Rng): void {
  for (const w of WRESTLERS) {
    if (w.id === c.player || gone(c, w.id)) continue;
    const life = lifeOf(w.id);
    if (life.goal && STRIVING.has(life.goal.kind) && met(c, w, life.goal)) { life.met = c.today; delete life.goal; }
    const g = goalFor(c, w, rnd);
    if (life.goal?.kind === g.kind && life.goal.on === g.on) continue;
    life.goal = { kind: g.kind, since: c.today, ...(g.on ? { on: g.on } : {}) };
  }
}

// ------------------------------------------------------------------ where people are

/** Where someone is on a day: at a show they're on, else at home. */
export function whereIs(c: Career, id: string, day: Day): { city?: string; country: string; at?: string } {
  for (const s of showsOn(c, day)) if (s.card?.some((b) => b.a === id || b.b === id)) return { city: s.city, country: s.country, at: s.name };
  const w = findWrestler(id);
  const country = w?.country ?? people().staff[id]?.country ?? people().folk?.[id]?.country ?? 'UK';
  const home = id === c.player ? undefined : homeOf(activeWorld().seed, id, country, people().lives?.[id]);
  return { ...(home ? { city: home } : {}), country: id === c.player ? (c.base ?? country) : country };
}

// ------------------------------------------------------------------ hooks

function daily(c: Career): void {
  const rnd = seededRng(hashSeed(c.seed, 'social', c.today));
  // An older save given its relationships on load can still need its circle (a career made before this existed).
  if (!people().lived) onStart(c);
  backstage(c, rnd);
  // Your circle in detail: wellbeing every Monday.
  if (weekday(c.today) === 1) for (const id of circleTier(c)) updateMood(c, id, MOOD.step);
}

function monthly(c: Career): void {
  monthlyBonds(c);
  // Its own seeded roll (the month's shared one depends on what every other system drew first).
  goals(c, seededRng(hashSeed(c.seed, 'goals', c.today)));
  const tier = new Set(circleTier(c));
  for (const w of WRESTLERS) if (!tier.has(w.id) && !gone(c, w.id)) updateMood(c, w.id, MOOD.stepMonthly);
}

// Wellbeing's effects (Lyra's call: it matters).
const fx = (id: string, low: number, high: number) => { const m = moodOf(id); return m <= MOOD_FX.low ? low : m >= MOOD_FX.high ? high : 1; };
setMoodDice((_c, id) => { const m = moodOf(id); return m <= MOOD_FX.low ? -MOOD_FX.dice : m >= MOOD_FX.high ? MOOD_FX.dice : 0; });
setMod('trainGain', (_c, id) => fx(id, MOOD_FX.trainLow, MOOD_FX.trainHigh));
setMod('recovery', (_c, id) => fx(id, MOOD_FX.recoverLow, MOOD_FX.recoverHigh));
setMod('retire', (_c, id) => fx(id, MOOD_FX.retireLow, 1));

setCareerHooks({ start: onStart, daily, monthly, bout: afterBout });

