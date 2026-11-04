// Politics (Lyra's relationships redesign, stage 5). How people get on decides how they work together:
// - in the ring: chemistry shows in the stars (mutual respect, friends, running spots together lately); enemies work
//   stiff (rougher, and the hated one's more likely to get hurt), and won't make it easy to be beaten;
// - the booker pairs rivals (heat sells) and friends who lobby to work together, and keeps enemies apart (they refuse);
// - your standing in each major's locker room: earned by putting people over and keeping to the plan, lost by going
//   off-script; it drifts towards what the room's leaders (its most respected) think of you; new faces take to you by
//   it; it lifts or weighs on your wellbeing;
// - cliques: friends on a roster band together under a leader, get a push when the booker likes the leader, and freeze
//   out whoever crosses one of them; you're asked in if you're close to a couple of them;
// - enemies all the way: badmouthing you to bookers who like them, provoking you backstage, fights (fines);
// - contracts and moves: signings lean towards friends and partners on the roster, and away from enemies;
// - bookers personally: every booker gives a little push to people they like, second chances, softer fines.
import { findWrestler, hasTrait, PROMOTIONS, rosterOf, worksFor, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondOf, bondsOf, bookerOf, feelPair, kindOf, likeOf, respectOf, together, type People } from '../world/people';
import { setPairBias } from './booker';
import { letter, person, setCareerHooks, setPolitics, showsOn, spend } from './career';
import { addDays, daysBetween, type Day } from './dates';
import { dealsOf } from './deals';
import { ctxFor, eventLibrary, fire, onAnswer } from './events';
import { setSigningPull } from './scouting';
import { registerReplies } from './mail';
import { phoneOn, sendIn } from './phone';
import { ANGLES, CHEM, CLIQUE, ENEMY, PAIRING, PULL, ROOM } from './tuning';
import type { Bout, Career, PlayerMatch, Show } from './types';

const P = (): People => activeWorld().people!;
const nameOf = (id: string) => findWrestler(id)?.name ?? P().staff[id]?.name ?? id;
const hates = (from: string, to: string) => likeOf(P(), from, to) <= -60;

// ------------------------------------------------------------------ in the ring

function chemistry(c: Career, a: string, b: string): number {
  const x = bondOf(P(), a, b);
  if (!x) return 0;
  let v = ((x.ra + x.rb) / 2) * CHEM.perRespect;
  if (Math.min(x.la, x.lb) >= CHEM.friendLike) v += CHEM.friends;
  if (hates(a, b) || hates(b, a)) v += CHEM.stiff;
  // Ran spots together lately (you and them, from plans).
  if ((a === c.player || b === c.player) && (c.meets ?? []).some((m) => m.kind === 'spots' && m.status === 'done' && (m.with === a || m.with === b) && daysBetween(m.day, c.today) <= CHEM.spotsDays)) v += CHEM.spots;
  return Math.round(Math.max(CHEM.min, Math.min(CHEM.max, v)) * 100) / 100;
}

setPolitics({
  chem: chemistry,
  stiff: (_c, victim, other) => (hates(other, victim) ? CHEM.stiffInjury : 1),
  refuse: (_c, loser, winner) => (hates(loser, winner) ? CHEM.refuseNudge : 0),
});

setPairBias((a, b) => {
  const x = bondOf(P(), a, b);
  if (!x) return 1;
  const k = kindOf(x);
  return k === 'enemy' ? PAIRING.enemies : k === 'rival' ? PAIRING.rival : k === 'best_friend' ? ANGLES.bestFriends : Math.min(x.la, x.lb) >= 50 ? PAIRING.friends : 1;
});

// ------------------------------------------------------------------ the locker room

export const standingOf = (c: Career, promo: string): number => c.room?.[promo]?.v ?? ROOM.start;
export function moveRoom(c: Career, promo: string, d: number): void {
  if (!d || promo === 'TIS') return;
  const r = ((c.room ??= {})[promo] ??= { v: ROOM.start });
  r.v = Math.max(0, Math.min(100, Math.round((r.v + d) * 10) / 10));
}
export function roomLabel(v: number): string {
  return v >= 80 ? 'One of the boys' : v >= ROOM.high ? 'Respected' : v >= 45 ? 'Accepted' : v > ROOM.low ? 'On thin ice' : 'Frozen out';
}
/** The room's leaders: its most respected (by the roster), old enough to carry it. */
export function leadersOf(c: Career, promo: string): string[] {
  return c.leaders?.[promo] ?? [];
}
function pickLeaders(c: Career, promo: string): string[] {
  const roster = rosterOf(promo).filter((w) => !c.people[w.id]?.retired && w.age >= ROOM.minAge && w.id !== c.player);
  const ids = new Set(rosterOf(promo).map((w) => w.id));
  const score = (w: Wrestler) => { const got = bondsOf(P(), w.id).filter((b) => ids.has(b.other)).map((b) => (b.bond.a === b.other ? b.bond.ra : b.bond.rb)); return got.length ? got.reduce((a, b) => a + b, 0) / Math.sqrt(got.length) : 0; };
  return roster.sort((a, b) => score(b) - score(a)).slice(0, ROOM.leaders).map((w) => w.id);
}

/** What your match said about you to the room. */
function afterMine(c: Career, show: Show, _b: Bout, m: PlayerMatch): void {
  const promo = show.promo;
  if (promo === 'TIS') return;
  if (m.planned === 'kept') moveRoom(c, promo, m.result === 'loss' ? ROOM.putOver : ROOM.kept);
  if (m.planned === 'off-script') moveRoom(c, promo, ROOM.offScript);
  if (m.planned === 'botched') moveRoom(c, promo, ROOM.botched);
  if (m.stars >= 4) moveRoom(c, promo, ROOM.great);
}

function roomMonth(c: Career): void {
  for (const k of dealsOf(c.people[c.player])) {
    const promo = k.promo;
    const leaders = (c.leaders ??= {})[promo] = pickLeaders(c, promo);
    const roster = rosterOf(promo).filter((w) => w.id !== c.player);
    let d = 0, f = 0, e = 0;
    for (const w of roster) {
      const x = bondOf(P(), c.player, w.id);
      if (!x) continue;
      const k2 = kindOf(x, c.today);
      if (k2 === 'friend' || k2 === 'best_friend') f++;
      if (k2 === 'enemy') e++;
    }
    d += Math.min(ROOM.friendMax, f * ROOM.friend) + Math.max(ROOM.enemyMax, e * ROOM.enemy);
    if (leaders.length) {
      const target = ROOM.start + leaders.reduce((t, id) => t + likeOf(P(), id, c.player), 0) / leaders.length / 2;
      d += (target - standingOf(c, promo)) * ROOM.toLeaders;
    }
    moveRoom(c, promo, d);
  }
}

// ------------------------------------------------------------------ cliques

export interface Clique { id: string; name: string; promo: string; members: string[]; leader: string; since: Day }
const NAMES = ['The Forge', 'Night Shift', 'Iron Circle', 'The Collective', 'Last Orders', 'The Lantern Club', 'The Old Guard', 'Northern Lights', 'Velvet Hammer', 'Back Row', 'The Lodge',
  'Graveyard Shift', 'Long Haul', 'Dead Ringers', 'Hard Yards', 'The Copper Pact', 'Blue Collar', 'The Wolves’ Table', 'Kitchen Cabinet', 'The Bus Crew', 'Second Floor', 'The Back Booth'];
export const cliquesOf = (c: Career, promo?: string): Clique[] => (c.cliques ?? []).filter((q) => !promo || q.promo === promo);
export const cliqueOf = (c: Career, id: string): Clique | undefined => (c.cliques ?? []).find((q) => q.members.includes(id));
const cohesion = (q: Clique) => { let t = 0, n = 0; for (const a of q.members) for (const b of q.members) if (a < b) { const x = bondOf(P(), a, b); t += x ? (x.la + x.lb) / 2 : 0; n++; } return n ? t / n : 0; };

function cliqueMonth(c: Career, rnd: Rng): void {
  const all = (c.cliques ??= []);
  // Who's left the roster, who's drifted off; cliques that fall apart.
  for (const q of all) q.members = q.members.filter((id) => { const w = findWrestler(id); return !!w && worksFor(w, q.promo) && !c.people[id]?.retired; });
  c.cliques = all.filter((q) => q.members.length >= CLIQUE.size[0]! && cohesion(q) >= CLIQUE.dissolve);
  for (const q of c.cliques) if (!q.members.includes(q.leader)) q.leader = mostRespected(q.members);
  // New ones: friends who band together.
  for (const p of PROMOTIONS.filter((x) => !x.indie)) {
    if (cliquesOf(c, p.initials).length >= CLIQUE.perPromo) continue;
    const roster = rosterOf(p.initials).filter((w) => !c.people[w.id]?.retired && w.id !== c.player && !cliqueOf(c, w.id));
    const ids = new Set(roster.map((w) => w.id));
    const founder = roster.map((w) => ({ w, n: bondsOf(P(), w.id).filter((b) => ids.has(b.other) && Math.min(b.bond.la, b.bond.lb) >= CLIQUE.friendLike).length })).sort((a, b) => b.n - a.n)[0];
    if (!founder || founder.n < CLIQUE.size[0]! - 1) continue;
    const members = [founder.w.id];
    for (const b of bondsOf(P(), founder.w.id).filter((x) => ids.has(x.other) && Math.min(x.bond.la, x.bond.lb) >= CLIQUE.friendLike).sort((a, b) => Math.min(b.bond.la, b.bond.lb) - Math.min(a.bond.la, a.bond.lb))) {
      if (members.length >= CLIQUE.size[1]!) break;
      if (members.every((m) => likeOf(P(), m, b.other) >= CLIQUE.mutual && likeOf(P(), b.other, m) >= CLIQUE.mutual)) members.push(b.other);
    }
    if (members.length < CLIQUE.size[0]!) continue;
    const used = new Set(all.map((q) => q.name));
    const name = NAMES.filter((n) => !used.has(n))[Math.floor(rnd() * NAMES.filter((n) => !used.has(n)).length)] ?? `The ${p.initials} Crew`;
    const q: Clique = { id: `q${++c.seq}`, name, promo: p.initials, members, leader: mostRespected(members), since: c.today };
    c.cliques.push(q);
    if (!c.spectator && dealsOf(c.people[c.player]).some((k) => k.promo === p.initials)) letter(c, { kind: 'news', from: 'Backstage', subject: `${name}: a new clique in the ${p.initials} locker room`, body: [`${members.map(nameOf).join(', ')} have been sticking together. ${nameOf(q.leader)} calls the shots.`] });
  }
  // Freezing out whoever crosses a member; asking you in.
  for (const q of c.cliques) {
    for (const m of q.members) for (const { other } of bondsOf(P(), m)) {
      if (q.members.includes(other) || !(hates(m, other) || hates(other, m))) continue;
      for (const n of q.members) if (n !== m) feelPair(P(), n, other, [CLIQUE.freeze, 0], [0, 0], `Crossed ${nameOf(m)}`, c.today, { keep: other === c.player ? 5 : 0 });
      if (other === c.player) moveRoom(c, q.promo, CLIQUE.frozenRoom);
    }
    const me = findWrestler(c.player);
    if (!me || !worksFor(me, q.promo) || cliqueOf(c, c.player) || !phoneOn() || c.spectator || c.asked?.[`clique:${q.id}`]) continue;
    const close = q.members.filter((m) => Math.min(likeOf(P(), m, c.player), likeOf(P(), c.player, m)) >= CLIQUE.friendLike).length;
    if (close < CLIQUE.inviteFriends) continue;
    (c.asked ??= {})[`clique:${q.id}`] = true;
    sendIn(c, q.leader, `You’ve been running with us anyway. Want in? ${q.name} looks after its own.`, [{ id: 'clique_yes', label: `Join ${q.name}`, detail: 'They’ll look after you; their enemies are yours' }, { id: 'clique_no', label: 'I’ll stay my own person', detail: 'No hard feelings. Probably.' }], undefined, { clique: q.id });
  }
}
const mostRespected = (ids: string[]) => [...ids].sort((a, b) => ids.reduce((t, x) => t + respectOf(P(), x, b), 0) - ids.reduce((t, x) => t + respectOf(P(), x, a), 0))[0]!;

registerReplies({
  clique_yes: (c, l) => {
    const q = (c.cliques ?? []).find((x) => x.id === l.ctx?.clique);
    if (!q) return 'It’s gone.';
    q.members.push(c.player);
    for (const m of q.members) if (m !== c.player) feelPair(P(), m, c.player, [CLIQUE.joinLike, 0], [CLIQUE.joinLike, 0], `Joined ${q.name}`, c.today, { keep: 5 });
    moveRoom(c, q.promo, CLIQUE.joinRoom);
    return `You’re in ${q.name}.`;
  },
  clique_no: (c, l) => { if (l.ctx?.who) feelPair(P(), l.ctx.who, c.player, [-2, 0], [0, 0], 'Turned down their clique', c.today, { keep: 5 }); return 'Your own person.'; },
});

// ------------------------------------------------------------------ enemies, all the way

/** Each month: enemies badmouth you to bookers who like them. */
function badmouthing(c: Career): void {
  for (const { other } of bondsOf(P(), c.player)) {
    const w = findWrestler(other);
    if (!w || w.promotion === 'TIS' || !hates(other, c.player)) continue;
    const bk = bookerOf(P(), w.promotion);
    if (!bk || likeOf(P(), bk.id, other) < ENEMY.badmouthLike) continue;
    feelPair(P(), bk.id, c.player, [ENEMY.badmouth, 0], [0, 0], `${w.name} has been badmouthing you`, c.today, { keep: 5 });
  }
}

/** Yesterday's shows: enemies on the same card. A hot-head and someone they can't stand come to blows; you get provoked. */
function backstageTrouble(c: Career, rnd: Rng): void {
  const day = addDays(c.today, -1);
  for (const show of showsOn(c, day)) {
    if (!show.card?.some((b) => b.result)) continue;
    const here = [...new Set(show.card.flatMap((b) => [b.a, b.b]))];
    for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) {
      const a = here[i]!, b = here[j]!;
      if (!(hates(a, b) || hates(b, a))) continue;
      if (a === c.player || b === c.player) {
        const them = a === c.player ? b : a;
        if (rnd() < ENEMY.provoke && !c.spectator) { const def = eventLibrary().find((d) => d.id === 'provoked'); if (def && (c.events?.seen.provoked ?? '0') < addDays(c.today, -30)) fire(ctxFor(c), def, { who: them }); }
        continue;
      }
      const wa = findWrestler(a), wb = findWrestler(b);
      if (!wa || !wb || !(hasTrait(wa, 'hot_headed') || hasTrait(wb, 'hot_headed')) || rnd() >= ENEMY.fight) continue;
      feelPair(P(), a, b, [ENEMY.fightLike, 0], [ENEMY.fightLike, 0], `A fight at ${show.name}`, day);
      for (const id of [a, b]) person(c, id).rep = Math.max(0, person(c, id).rep + ENEMY.fightRep);
      if (!c.spectator && dealsOf(c.people[c.player]).some((k) => worksFor(wa, k.promo) || worksFor(wb, k.promo))) letter(c, { kind: 'news', from: 'Backstage', subject: `${wa.name} and ${wb.name} came to blows`, body: [`It took half the locker room to pull them apart after ${show.name}. The office isn’t happy.`] });
    }
  }
}

/** You bit back: a fine (by your deal), and the room's view of you. */
export function foughtBack(c: Career, who: string): string {
  const k = c.people[c.player]?.contract;
  const fine = k ? Math.round(k.fee * ENEMY.fineWeeks) : 0;
  if (fine) spend(c, -fine, `Fined for fighting with ${nameOf(who)}`, 'event');
  if (k) moveRoom(c, k.promo, ENEMY.fightRoom);
  return fine ? `Fined £${fine.toLocaleString('en-GB')}` : '';
}

// ------------------------------------------------------------------ contracts and moves

/** A signing leans towards friends and a partner on the roster, away from enemies there (points on their grade). */
export function pull(_c: Career, w: Wrestler, promo: string): number {
  let friends = 0, v = 0;
  for (const { other, bond } of bondsOf(P(), w.id)) {
    const o = findWrestler(other);
    if (!o || !worksFor(o, promo)) continue;
    if (together(bond)) v += PULL.partner;
    else if (Math.min(bond.la, bond.lb) >= 50) friends++;
    if (hates(w.id, other) || hates(other, w.id)) v += PULL.enemy;
  }
  return v + Math.min(PULL.friendMax, friends * PULL.friend);
}

// ------------------------------------------------------------------ hooks

setSigningPull(pull);
// You bit back when they provoked you: a fine, and the room's view of you.
onAnswer((c, ev, opt) => { if (ev !== 'provoked' || opt !== 'bite') return; const l = c.letters.find((x) => x.action?.type === 'event' && x.action.event === 'provoked' && x.picked); if (l?.fromId) foughtBack(c, l.fromId); });

setCareerHooks({
  mine: afterMine,
  daily: (c) => backstageTrouble(c, seededRng(hashSeed(c.seed, 'politics', c.today))),
  monthly: (c) => { const rnd = seededRng(hashSeed(c.seed, 'politics-month', c.today)); roomMonth(c); cliqueMonth(c, rnd); badmouthing(c); },
});

