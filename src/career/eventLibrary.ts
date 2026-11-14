// The career event library (career expansion, stage 3). Each event says when it can happen, who and
// where it's about (drawn from the live world), its choices and what they do. Add one by appending an
// EventDef to the right list; the engine (events.ts) handles pacing, letters, follow-ups and memory.
import { findWrestler, globalScore, PROMOTIONS, TITLES, type Wrestler, WRESTLERS, worksFor } from '../data/rtr';
import { contenders, isIndieTitle, promoRegion } from './booker';
import { makeOffer, promoName } from './career';
import { C } from './clauses';
import { sideWork } from './deals';
import { gradeOf, introduce } from './scouting';
import { ATTR_KEYS } from './create';
import { addDays, daysBetween, fmtDay } from './dates';
import { indieFee } from './economy';
import {
  type EvCtx, type EvData, type EventDef, type FollowDef, feeBase, fx, homeRegion, join, merchBlocked, money, nearbyCity, outsideApproved,
  outsideBlocked, pick, recentOpp, registerEvents, round5, scene, tallyOf, titlesHeld,
} from './events';
import { indieAllowed, joinIndie } from './offers';
import { indieKey, patienceOf, showBooker } from './patience';
import { affinity, relationOf, relationsList, trust } from './relations';
import { askChallenge, askableIndieShows, askableShows, bookerName, maybeCaught, myPromo, standingWith } from './requests';
import type { Show } from './types';
import { FEATURES } from './tuning';
import { boutPeople } from './bouts';
import { tripCost } from './life/travel';

// ------------------------------------------------------------------ who and where

const who = (d: EvData, k = 'who'): Wrestler | undefined => findWrestler(String(d[k] ?? ''));
const nameOf = (d: EvData, k = 'who'): string => who(d, k)?.name ?? 'Someone';
const first = (d: EvData, k = 'who'): string => nameOf(d, k).replace(/"[^"]*"\s*/g, '').split(' ')[0]!;
const booker = (x: EvCtx): string => x.k?.promo ?? 'TIS';
const fee = (x: EvCtx, m: number): number => round5(feeBase(x) * m);
const stated = (_x: EvCtx, d: EvData) => `${money(Number(d.amount))}`;
const healthy = (w: Wrestler, x: EvCtx) => !(x.c.people[w.id]?.injury && x.c.people[w.id]!.injury!.until > x.day) && !x.c.people[w.id]?.retired;
/** Whoever runs the indie show an event is about. */
const promoterOf = (x: EvCtx, d: Record<string, string | number>) => { const s = x.c.shows[String(d.show)]; return s ? showBooker(s) : indieKey(String(d.name)); };
/** Real people with real reasons (Lyra's relationships redesign): people who know you first, anyone around if nobody does. */
const known = (x: EvCtx, ws: Wrestler[]) => { const k = ws.filter((w) => (relationOf(x.c, w.id)?.fam ?? 0) >= 10); return k.length ? k : ws; };
const veteran = (x: EvCtx) => known(x, scene(x).filter((w) => w.age >= 35 && healthy(w, x) && !(relationOf(x.c, w.id)?.kind === 'mentor')));
const youngster = (x: EvCtx) => known(x, scene(x).filter((w) => w.age <= 24 && globalScore(w) < globalScore(x.me) - 3 && healthy(w, x)));
const colleague = (x: EvCtx) => known(x, scene(x).filter((w) => healthy(w, x)));
const rivals = (x: EvCtx) => relationsList(x.c).filter((r) => r.r.v <= -25 || r.r.kind === 'rival' || r.r.kind === 'enemy' || r.r.tie === 'rival').map((r) => findWrestler(r.id)!).filter((w) => w && healthy(w, x));
const friendly = (x: EvCtx, min = 15) => relationsList(x.c).filter((r) => r.r.v >= min).map((r) => findWrestler(r.id)!).filter((w) => w && healthy(w, x));
const withKind = (x: EvCtx, kind: string) => relationsList(x.c).filter((r) => r.r.kind === kind).map((r) => findWrestler(r.id)!).filter(Boolean);
const lowestAttr = (x: EvCtx) => [...ATTR_KEYS].sort((a, b) => x.me.stats[a] - x.me.stats[b])[Math.floor(x.rnd() * 2)]!;
const ATTR_NAME: Record<string, string> = { strength: 'strength', speed: 'speed', stamina: 'stamina', skill: 'technique', striking: 'striking', charisma: 'mic work' };
const randomAttr = (x: EvCtx) => ATTR_KEYS[Math.floor(x.rnd() * ATTR_KEYS.length)]!;
const chance = (x: EvCtx, p: number) => x.rnd() < p;
/** Your promotion's next show between two days from now (not yet on a card you're in). */
function promoShowIn(x: EvCtx, from: number, to: number): Show | undefined {
  if (!x.k) return undefined;
  const a = addDays(x.day, from), b = addDays(x.day, to);
  return Object.values(x.c.shows).filter((s) => !s.done && s.date >= a && s.date <= b && (s.promos ?? [s.promo]).includes(x.k!.promo) && s.promo !== 'TIS')
    .sort((p, q) => (p.date < q.date ? -1 : 1))[0];
}
/** A show you're booked on in the next few days. */
function bookedSoon(x: EvCtx, within: number): Show | undefined {
  return Object.values(x.c.shows).filter((s) => !s.done && s.date > x.day && s.date <= addDays(x.day, within)
    && (s.card?.some((b) => b.a === x.c.player || b.b === x.c.player) || !!x.c.indie[s.id])).sort((p, q) => (p.date < q.date ? -1 : 1))[0];
}
const appearance = (x: EvCtx) => outsideBlocked(x);
/** Appearances under Outside Appearances Tier 1 need management's say-so. */
const cleared = (x: EvCtx, salt: string): string | null => (outsideApproved(x, salt) ? null : `${x.k?.promo} said no to this one. Management’s call.`);

// ------------------------------------------------------------------ training and schools

const TRAINING: EventDef[] = [
  {
    id: 'school_guest', cat: 'training', weight: 3, cooldown: 75, when: () => true,
    setup: (x) => { const p = nearbyCity(x); return { city: p.city, school: `${p.city} ${pick(x.rnd, ['Wrestling Academy', 'Pro Wrestling School', 'Grappling Club', 'Wrestling Dojo', 'Mat Club'])}`, amount: fee(x, 0.6) }; },
    from: (_x, d) => String(d.school), subject: () => 'Come and guest-train our students?',
    body: (_x, d) => [`The kids at ${d.school} watch your matches on their phones between drills. Would you come in for an afternoon and run a session?`, 'We can’t pay much. We’d make it worth your while in other ways.'],
    options: [
      { id: 'free', label: 'Go, no fee', detail: () => 'Goodwill; a long afternoon', run: (x) => { fx.tally(x, 'schools'); return join('You spent the afternoon on the mats with them', fx.rep(x, 1), fx.fatigue(x, 6), chance(x, 0.35) ? fx.stat(x, 'skill', 1) : ''); } },
      { id: 'fee', label: 'Go, for a fee', detail: (x, d) => `Ask for ${stated(x, d)}; they might not run to it`, run: (x, d) => (chance(x, 0.6) ? join('They found the money', fx.money(x, Number(d.amount), `Guest-training at ${d.school}`), fx.fatigue(x, 6)) : 'They couldn’t stretch to a fee. It’s off, no hard feelings.') },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You passed. Maybe another time.' },
    ],
  },
  {
    id: 'seminar', cat: 'training', weight: 2, cooldown: 60, when: (x) => globalScore(x.me) >= 35 || x.p.rep >= 60,
    setup: (x) => ({ city: nearbyCity(x).city, amount: fee(x, 1.5) }),
    from: (_x, d) => `Seminar organiser · ${d.city}`, subject: () => 'Teach a seminar?',
    body: (x, d) => [`We’re putting on a weekend seminar in ${d.city} and want you to lead it: two sessions, Q&A, photos.`, `We pay ${stated(x, d)}.`],
    options: [
      { id: 'paid', label: 'Teach it', detail: (x, d) => `${stated(x, d)} · a tiring weekend`, run: (x, d) => join('A full room both days', fx.money(x, Number(d.amount), `Seminar in ${d.city}`), fx.rep(x, 1), fx.fatigue(x, 8)) },
      { id: 'free', label: 'Teach it for free', detail: () => 'Reputation and goodwill instead', run: (x) => join('You waived the fee. Word gets round', fx.rep(x, 2), fx.pop(x, 0.5), fx.fatigue(x, 8)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You turned it down.' },
    ],
  },
  {
    id: 'veteran_mentor', cat: 'training', weight: 2, cooldown: 120, when: (x) => veteran(x).length > 0 && withKind(x, 'mentor').length === 0,
    setup: (x) => { const w = pick(x.rnd, veteran(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'A word, if you’ve got a minute',
    body: (_x, d) => [`${nameOf(d)} has been around long enough to have wrestled in front of forty people and forty thousand. They’ve been watching you.`, '“You’ve got something. You’re also making the same three mistakes every match. Want me to show you?”'],
    options: [
      { id: 'yes', label: 'Take them up on it', detail: () => 'A mentor; costs you time', run: (x, d) => { fx.follow(x, 21, 'mentor_lesson', d); return join(`${first(d)} is going to keep an eye on you`, fx.rel(x, String(d.who), 20, 'Took you under their wing', 'mentor'), fx.stat(x, lowestAttr(x), 1), fx.fatigue(x, 5)); } },
      { id: 'no', label: 'Thank them, not now', decline: true, run: (x, d) => join('“Suit yourself, kid.”', fx.rel(x, String(d.who), -2, 'You turned down their help')) },
    ],
  },
  {
    id: 'protege_ask', cat: 'training', weight: 2, cooldown: 60, when: (x) => !FEATURES.phone && youngster(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, youngster(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'Can I ask you something?',
    body: (_x, d) => [`${nameOf(d)} is ${who(d)?.age}, keen, and clearly nervous about asking. “How do you pace a match when the crowd’s dead? Everything I try falls flat.”`],
    options: [
      { id: 'help', label: 'Sit down with them properly', detail: () => 'A protégé; a bit of your evening', run: (x, d) => join(`You went through it with ${first(d)} for an hour`, fx.rel(x, String(d.who), 15, 'You gave them real advice', 'protege'), fx.rep(x, 1), fx.fatigue(x, 3)) },
      { id: 'quick', label: 'Five minutes and a tip', run: (x, d) => join('A quick word in the corridor', fx.rel(x, String(d.who), 5, 'You gave them a tip')) },
      { id: 'no', label: 'Brush them off', decline: true, run: (x, d) => join('“Figure it out like I did.”', fx.rel(x, String(d.who), -10, 'You brushed them off'), fx.rep(x, -0.5)) },
    ],
  },
  {
    id: 'specialist_coach', cat: 'training', weight: 2, cooldown: 50, when: () => true,
    setup: (x) => { const a = lowestAttr(x); return { attr: a, amount: round5(feeBase(x) * 1.2 + 50) }; },
    from: () => 'A specialist coach', subject: (_x, d) => `Work on your ${ATTR_NAME[String(d.attr)]}?`,
    body: (x, d) => [`A coach who works with fighters and wrestlers has a block of sessions free. They reckon your ${ATTR_NAME[String(d.attr)]} is holding you back.`, `${stated(x, d)} for the block.`],
    options: [
      { id: 'pay', label: (x, d) => `Book it (${stated(x, d)})`, blocked: (x, d) => (x.c.money < Number(d.amount) ? 'You can’t afford it right now.' : null), run: (x, d) => join('Hard sessions. It shows', fx.money(x, -Number(d.amount), 'Specialist coaching'), fx.stat(x, String(d.attr) as never, 2), fx.fatigue(x, 6)) },
      { id: 'haggle', label: 'Try to haggle', detail: () => 'They might not budge', run: (x, d) => (chance(x, 0.6) && x.c.money >= Number(d.amount) * 0.6 ? join('Met in the middle', fx.money(x, -round5(Number(d.amount) * 0.6), 'Specialist coaching'), fx.stat(x, String(d.attr) as never, 2), fx.fatigue(x, 6)) : 'They wouldn’t budge. You walked away.') },
      { id: 'no', label: 'Decline', decline: true, run: () => 'Not now.' },
    ],
  },
  {
    id: 'private_session', cat: 'training', weight: 2, cooldown: 40, when: (x) => !FEATURES.phone && friendly(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, friendly(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'Ring’s free Thursday. You in?',
    body: (_x, d) => [`${first(d)} has a ring booked for a couple of hours and wants someone good to bump with.`],
    options: [
      { id: 'yes', label: 'Get in the ring with them', detail: () => 'Tiring; you might pick something up', run: (x, d) => join('Two hours, a lot of bumps', fx.fatigue(x, 8), fx.rel(x, String(d.who), 6, 'Trained together'), chance(x, 0.5) ? fx.stat(x, randomAttr(x), 1) : '') },
      { id: 'no', label: 'Not this week', decline: true, run: (x, d) => join('Another time', fx.rel(x, String(d.who), -2, 'You couldn’t make it')) },
    ],
  },
  {
    id: 'gym_block', cat: 'training', weight: 1, cooldown: 150, when: (x) => x.c.money > feeBase(x) * 2,
    setup: (x) => ({ amount: round5(feeBase(x) * 1.6 + 60), gym: `${nearbyCity(x).city} ${pick(x.rnd, ['Strength Club', 'Iron Works', 'Fight Gym', 'Barbell Club'])}` }),
    from: (_x, d) => String(d.gym), subject: () => 'Three-month block, half price for athletes',
    body: (x, d) => [`A proper strength-and-conditioning block with a coach who knows what wrestling does to a body. ${stated(x, d)}.`],
    options: [
      { id: 'buy', label: (x, d) => `Sign up (${stated(x, d)})`, blocked: (x, d) => (x.c.money < Number(d.amount) ? 'You can’t afford it right now.' : null), run: (x, d) => join('You’re in there four mornings a week', fx.money(x, -Number(d.amount), String(d.gym)), fx.stat(x, 'strength', 1), fx.stat(x, 'stamina', 1)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You’ll keep doing it your way.' },
    ],
  },
];

// ------------------------------------------------------------------ charity and community

const COMMUNITY: EventDef[] = [
  {
    id: 'charity_appearance', cat: 'community', weight: (x) => 2 * (1 + 0.2 * Math.min(5, tallyOf(x.c, 'charity'))), cooldown: 40, when: () => true,
    setup: (x) => ({ cause: pick(x.rnd, ['a children’s hospice', 'a homeless shelter', 'a food bank', 'a youth boxing and wrestling club', 'a mental health charity', 'an animal rescue'])!, city: nearbyCity(x).city, amount: fee(x, 0.5) }),
    from: (_x, d) => `Fundraiser · ${d.city}`, subject: () => 'Would you make an appearance?',
    body: (_x, d) => [`We’re raising money for ${d.cause} in ${d.city}. Having you there for photos and a few words would bring people in.`],
    options: [
      { id: 'go', label: 'Make the appearance', blocked: (x) => appearance(x), run: (x) => cleared(x, 'charity') ?? (fx.tally(x, 'charity'), join('You stayed till the last photo', fx.rep(x, 1), fx.pop(x, 1), fx.fatigue(x, 3))) },
      { id: 'donate', label: (x, d) => `Send a donation (${stated(x, d)})`, blocked: (x, d) => (x.c.money < Number(d.amount) ? 'You can’t afford it right now.' : null), run: (x, d) => { fx.tally(x, 'charity'); return join('They were very grateful', fx.money(x, -Number(d.amount), `Donation: ${d.cause}`), fx.rep(x, 1)); } },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You couldn’t make it work.' },
    ],
  },
  {
    id: 'community_event', cat: 'community', weight: 2, cooldown: 35, when: () => true,
    setup: (x) => ({ what: pick(x.rnd, ['a school assembly about staying active', 'a charity fun run', 'a local fete', 'a youth club open day', 'a library reading morning'])!, city: nearbyCity(x).city }),
    from: (_x, d) => `${d.city} council`, subject: (_x, d) => `Come along to ${d.what}?`,
    body: (_x, d) => [`It’s ${d.what} in ${d.city}. Nothing fancy, but the kids would love it.`],
    options: [
      { id: 'go', label: 'Go along', blocked: (x) => appearance(x), run: (x) => cleared(x, 'community') ?? join('It went down a storm', fx.rep(x, 0.5), fx.pop(x, 1), fx.fatigue(x, 2)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'Maybe next year.' },
    ],
  },
  {
    id: 'benefit_injured', cat: 'community', weight: 3, cooldown: 60,
    when: (x) => WRESTLERS.some((w) => w.id !== x.c.player && (x.c.people[w.id]?.injury?.until ?? '') > addDays(x.day, 21)),
    setup: (x) => {
      const hurt = WRESTLERS.filter((w) => w.id !== x.c.player && (x.c.people[w.id]?.injury?.until ?? '') > addDays(x.day, 21));
      const near = hurt.filter((w) => worksFor(w, x.k?.promo ?? 'TIS'));
      const w = pick(x.rnd, near.length ? near : hurt);
      return w ? { who: w.id, what: x.c.people[w.id]!.injury!.what, amount: fee(x, 0.4) } : null;
    },
    from: (_x, d) => `Friends of ${nameOf(d)}`, subject: (_x, d) => `Helping ${first(d)} through it`,
    body: (_x, d) => [`${nameOf(d)} is out a long while with a ${d.what} injury and the bills are piling up. We’re raising money to keep them going.`],
    options: [
      { id: 'donate', label: (x, d) => `Donate (${stated(x, d)})`, blocked: (x, d) => (x.c.money < Number(d.amount) ? 'You can’t afford it right now.' : null), run: (x, d) => join(`${first(d)} sent a voice note to say thanks`, fx.money(x, -Number(d.amount), `Donation for ${nameOf(d)}`), fx.rel(x, String(d.who), 12, 'You helped when they were hurt'), fx.rep(x, 1)) },
      { id: 'appear', label: 'Turn up to the fundraiser', blocked: (x) => appearance(x), run: (x, d) => cleared(x, 'benefit') ?? join('You signed everything put in front of you', fx.rel(x, String(d.who), 8, 'You turned up for them'), fx.pop(x, 0.5), fx.fatigue(x, 3)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You couldn’t this time.' },
    ],
  },
  {
    id: 'hospital_visit', cat: 'community', weight: 1.5, cooldown: 75, when: (x) => globalScore(x.me) >= 25,
    setup: (x) => ({ city: nearbyCity(x).city }),
    from: (_x, d) => `Children’s ward · ${d.city}`, subject: () => 'A visit, if you can spare an afternoon',
    body: () => ['A few of the children on the ward are big fans. No cameras, no press. Just an afternoon.'],
    options: [
      { id: 'go', label: 'Go', run: (x) => join('You won’t forget that afternoon', fx.rep(x, 1), fx.pop(x, 1), fx.fatigue(x, 2)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You couldn’t fit it in.' },
    ],
  },
  {
    id: 'welfare_campaign', cat: 'community', weight: 1, cooldown: 150, when: (x) => !!x.k && colleague(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, colleague(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'Will you put your name to this?',
    body: (_x, d) => [`${first(d)} is organising wrestlers to push for better medical cover and travel rules across the business. Management won’t love it.`],
    options: [
      { id: 'sign', label: 'Put your name to it', detail: () => 'The locker room respects it; management won’t', run: (x, d) => join('Your name’s on the letter', fx.rep(x, 1.5), fx.rel(x, String(d.who), 8, 'Backed their campaign'), fx.patience(x, booker(x), -4, 'Backed the welfare campaign')) },
      { id: 'no', label: 'Stay out of it', decline: true, run: (x, d) => join('You kept your head down', fx.rel(x, String(d.who), -3, 'Wouldn’t back their campaign')) },
    ],
  },
];

// ------------------------------------------------------------------ media and publicity

const MEDIA: EventDef[] = [
  {
    id: 'podcast', cat: 'media', weight: 3, cooldown: 30, when: (x) => globalScore(x.me) >= 15,
    setup: (x) => ({ show: pick(x.rnd, ['Bumps & Bruises', 'The Turnbuckle Tapes', 'Kayfabe Kitchen', 'Three Count', 'Behind the Curtain', 'The Hot Tag', 'Dead Crowd Radio'])! }),
    from: (_x, d) => String(d.show), subject: () => 'Come on the podcast?',
    body: (_x, d) => [`${d.show} want you on for an hour: your career so far, your matches, the business.`],
    options: [
      { id: 'straight', label: 'Do it, keep it professional', blocked: (x) => appearance(x), run: (x) => cleared(x, 'podcast') ?? join('A good listen', fx.pop(x, 0.8)) },
      { id: 'spicy', label: 'Do it and stir things up', detail: () => 'More attention; some people won’t like it', blocked: (x) => appearance(x), run: (x) => {
        const r = pick(x.rnd, rivals(x));
        return cleared(x, 'podcast') ?? join('The clips went everywhere', fx.pop(x, 1.5), fx.rep(x, -1), fx.patience(x, booker(x), -2, 'Mouthed off on a podcast'), r ? fx.rel(x, r.id, -8, 'You buried them on a podcast') : '');
      } },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You passed.' },
    ],
  },
  {
    id: 'documentary', cat: 'media', weight: 1, cooldown: 240, when: (x) => globalScore(x.me) >= 35,
    setup: (x) => ({ amount: fee(x, 2.5) }),
    from: () => 'An independent film crew', subject: () => 'Can we follow you for a month?',
    body: () => ['We’re making a documentary about life on the road in wrestling and want you at the heart of it: the travel, the locker rooms, the matches.'],
    options: [
      { id: 'yes', label: 'Let them follow you', detail: () => 'Tiring; it airs in a month', blocked: (x) => appearance(x), run: (x, d) => cleared(x, 'doc') ?? (fx.follow(x, 30, 'documentary_airs', d), join('Cameras everywhere for a month', fx.fatigue(x, 6))) },
      { id: 'fee', label: (x, d) => `Ask for a fee (${stated(x, d)})`, detail: () => 'They might find someone cheaper', blocked: (x) => appearance(x), run: (x, d) => (chance(x, 0.55) ? (fx.follow(x, 30, 'documentary_airs', d), join('They paid up', fx.money(x, Number(d.amount), 'Documentary fee'), fx.fatigue(x, 6))) : 'They found someone cheaper.') },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You’d rather keep the curtain closed.' },
    ],
  },
  {
    id: 'journalist_finish', cat: 'media', weight: 4, cooldown: 60,
    when: (x) => x.c.history.slice(0, 6).some((m) => (m.planned === 'off-script' || m.planned === 'upset') && daysBetween(m.day, x.day) <= 30),
    setup: (x) => { const m = x.c.history.find((y) => y.planned === 'off-script' || y.planned === 'upset')!; const s = x.c.shows[m.show]; return { show: m.showName, key: s ? showBooker(s) : m.promo, opp: m.opp }; },
    from: () => 'A wrestling journalist', subject: (_x, d) => `About that finish at ${d.show}…`,
    body: (_x, d) => [`Everyone’s talking about the finish at ${d.show}. Was that the plan? People backstage are saying it wasn’t.`],
    options: [
      { id: 'own', label: 'Own it', detail: () => 'Fans love it; the promoter won’t', run: (x, d) => join('“I saw an opening. I took it.”', fx.pop(x, 1.5), fx.rep(x, -1), fx.patience(x, String(d.key), -5, 'Bragged about the finish'), fx.rel(x, String(d.opp), -5, 'You bragged about beating them')) },
      { id: 'down', label: 'Play it down', detail: () => 'Smooths things over', run: (x, d) => join('“Things happen in the ring. Respect to everyone involved.”', fx.patience(x, String(d.key), 4, 'Kept it professional with the press'), fx.rep(x, 0.5)) },
      { id: 'none', label: 'No comment', decline: true, run: () => '“No comment.”' },
    ],
  },
  {
    id: 'newspaper_profile', cat: 'media', weight: 2, cooldown: 90,
    when: (x) => globalScore(x.me) >= 20 && globalScore(x.me) <= 60 && x.c.history.slice(0, 5).filter((m) => m.result === 'win').length >= 3,
    setup: (x) => ({ paper: `The ${nearbyCity(x).city} ${pick(x.rnd, ['Gazette', 'Echo', 'Evening Post', 'Herald', 'Chronicle'])}` }),
    from: (_x, d) => String(d.paper), subject: () => 'A profile: “the rising star”',
    body: (_x, d) => [`${d.paper} wants to run a feature on you. A photographer, an hour’s interview, your story.`],
    options: [
      { id: 'yes', label: 'Do the interview', blocked: (x) => appearance(x), run: (x) => cleared(x, 'paper') ?? join('Half a page and a photo', fx.pop(x, 1.5)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'Not yet.' },
    ],
  },
  {
    id: 'show_publicity', cat: 'media', weight: 3, cooldown: 30, when: (x) => !!promoShowIn(x, 3, 14),
    setup: (x) => { const s = promoShowIn(x, 3, 14)!; return { show: s.id, name: s.name, city: s.city }; },
    from: (x) => `${promoName(x.k!.promo)} · media`, subject: (_x, d) => `Publicity for ${d.name}`,
    body: (_x, d) => [`We’re pushing ${d.name} in ${d.city}: local radio, a signing, a photo op. Can we count on you?`],
    options: [
      { id: 'yes', label: 'Do the rounds', run: (x, d) => join('Radio at seven in the morning, but you were great', fx.patience(x, booker(x), 5, `Publicity for ${d.name}`), fx.favour(x, booker(x)), fx.fatigue(x, 3), fx.pop(x, 0.5)) },
      { id: 'no', label: 'Decline', decline: true, run: (x) => join('They’ll find someone else', fx.patience(x, booker(x), -2, 'Turned down publicity'), fx.snub(x, booker(x))) },
    ],
  },
  {
    id: 'rival_callout', cat: 'media', weight: 3, cooldown: 45,
    when: (x) => rivals(x).length > 0 || (x.c.history[0]?.result === 'loss' && daysBetween(x.c.history[0].day, x.day) <= 7),
    setup: (x) => { const w = pick(x.rnd, rivals(x)) ?? recentOpp(x); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: (_x, d) => `${first(d)} has something to say about you`,
    body: (_x, d) => [`${nameOf(d)} has gone public: you’re overrated, you got lucky, and they want you again. Everyone’s waiting to see what you say.`],
    options: [
      { id: 'fire', label: 'Fire back', detail: () => 'Attention, and it gets personal', run: (x, d) => join('You didn’t hold back', fx.pop(x, 1), fx.rep(x, -0.5), fx.rel(x, String(d.who), -8, 'Traded insults in public', 'rival')) },
      { id: 'challenge', label: 'Challenge them properly', detail: () => 'Asks your booker for the match', run: (x, d) => {
        const w = who(d);
        const s = askableShows(x.c)[0];
        if (!w || !s || !worksFor(w, myPromo(x.c) ?? 'TIS')) return join('“Name the place.” They’re not on your roster: ask an indie promoter in Requests', fx.pop(x, 0.5), fx.rel(x, String(d.who), -4, 'You called them out', 'rival'));
        const a = askChallenge(x.c, w.id, s.id);
        return join(`You asked for ${w.name} on ${s.name}. ${a.said}`, fx.rel(x, String(d.who), -4, 'You called them out', 'rival'));
      } },
      { id: 'quiet', label: 'Let your wrestling do the talking', decline: true, run: (x) => join('You said nothing. Some people noticed', fx.rep(x, 1)) },
    ],
  },
  {
    id: 'contract_question', cat: 'media', weight: 2, cooldown: 60,
    when: (x) => !!x.k && (daysBetween(x.day, x.k.end) <= 60 || x.c.offers.some((o) => o.status === 'open' && o.promo !== x.k!.promo)),
    from: () => 'A wrestling journalist', subject: () => 'What happens when your deal’s up?',
    body: (x) => [`Your ${x.k!.promo} contract runs out ${fmtDay(x.k!.end, 'long')}. Are you staying?`],
    options: [
      { id: 'hint', label: 'Hint you’re listening to offers', detail: () => 'Might bring an offer; your promotion won’t like it', run: (x) => {
        const others = PROMOTIONS.filter((p) => !p.indie && !p.closed && p.initials !== x.k!.promo && gradeOf(x.c, x.me, p.initials).step === 'offer');
        const o = chance(x, 0.4) ? pick(x.rnd, others) : undefined;
        if (o) makeOffer(x.c, o.initials, 'We read the interview');
        return join('“I’m keeping my options open.”', fx.pop(x, 0.5), fx.patience(x, x.k!.promo, -5, 'Talked up other offers in the press'), o ? `${o.initials} got in touch: it’s in your mail` : '');
      } },
      { id: 'happy', label: 'Say you’re happy where you are', run: (x) => join('“This is home.”', fx.patience(x, x.k!.promo, 4, 'Backed them in the press'), fx.favour(x, x.k!.promo)) },
      { id: 'none', label: 'No comment', decline: true, run: () => '“No comment.”' },
    ],
  },
  {
    id: 'convention', cat: 'media', weight: 2, cooldown: 90, when: (x) => globalScore(x.me) >= 25,
    setup: (x) => ({ city: nearbyCity(x).city, amount: round5(feeBase(x) * (1 + globalScore(x.me) / 50)) }),
    from: (_x, d) => `${d.city} Wrestling Con`, subject: () => 'A signing table at the con?',
    body: (x, d) => [`We’d like you at the ${d.city} convention: a signing table, a Q&A panel and photos. ${stated(x, d)} plus a cut of the photos.`],
    options: [
      { id: 'go', label: 'Book the table', blocked: (x) => appearance(x), run: (x, d) => cleared(x, 'con') ?? join('A queue round the hall', fx.money(x, Number(d.amount), `Convention in ${d.city}`), fx.pop(x, 0.5), fx.fatigue(x, 5)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'You passed.' },
    ],
  },
  {
    id: 'meet_fans', cat: 'media', weight: 3, cooldown: 20, when: (x) => !!x.c.history[0] && daysBetween(x.c.history[0].day, x.day) <= 7,
    setup: (x) => ({ show: x.c.history[0]!.showName, region: x.c.shows[x.c.history[0]!.show]?.region ?? homeRegion(x) }),
    from: (_x, d) => String(d.show), subject: () => 'There’s a queue at the merch table',
    body: () => ['After the show a line of fans has formed by the merch table. You’re aching and the hotel’s calling.'],
    options: [
      { id: 'stay', label: 'Stay for every one of them', run: (x, d) => join('An hour of selfies and handshakes', fx.pop(x, 1, d.region as never), fx.fatigue(x, 3)) },
      { id: 'go', label: 'Head back to the hotel', decline: true, run: (x) => join('A proper night’s sleep', fx.fatigue(x, -3)) },
    ],
  },
  {
    id: 'sponsor', cat: 'media', weight: 1.5, cooldown: 150, when: (x) => globalScore(x.me) >= 30,
    setup: (x) => ({ brand: pick(x.rnd, ['a local gym chain', 'an energy drink', 'a protein shake company', 'a tattoo studio', 'a barber shop chain', 'a car dealership'])!, amount: fee(x, 3) }),
    from: (_x, d) => `Marketing at ${d.brand}`, subject: () => 'A sponsorship deal',
    body: (x, d) => [`${String(d.brand).replace(/^an? /, (m) => m[0]!.toUpperCase() + m.slice(1))} want you in their ads for the next few months: ${stated(x, d)}.`],
    options: [
      { id: 'sign', label: 'Sign it', blocked: (x) => appearance(x), run: (x, d) => cleared(x, 'sponsor') ?? join('Your face on their posters', fx.money(x, Number(d.amount), `Sponsorship: ${d.brand}`), fx.pop(x, 0.5)) },
      { id: 'more', label: 'Push for more', detail: () => 'They might walk', blocked: (x) => appearance(x), run: (x, d) => (chance(x, 0.5) ? cleared(x, 'sponsor') ?? join('They paid up', fx.money(x, round5(Number(d.amount) * 1.6), `Sponsorship: ${d.brand}`), fx.pop(x, 0.5)) : 'They walked away.') },
      { id: 'no', label: 'Decline', decline: true, run: () => 'Not your sort of thing.' },
    ],
  },
  {
    id: 'merch_design', cat: 'media', weight: 1.5, cooldown: 120, when: (x) => globalScore(x.me) >= 20,
    setup: (x) => ({ amount: round5(globalScore(x.me) * globalScore(x.me) * 0.6 + 50) }),
    from: () => 'An independent merch company', subject: () => 'A new T-shirt design?',
    body: () => ['We’ve mocked up a shirt with your catchphrase on it and reckon it’ll sell. You get a cut of every one.'],
    options: [
      { id: 'yes', label: 'Approve it', blocked: (x) => merchBlocked(x), run: (x, d) => { fx.follow(x, 30, 'merch_sales', d); return 'It goes on sale next week.'; } },
      { id: 'no', label: 'Pass', decline: true, run: () => 'You didn’t love the design.' },
    ],
  },
  {
    id: 'video_game', cat: 'media', weight: 0.5, cooldown: 365, when: (x) => globalScore(x.me) >= 70,
    setup: (x) => ({ amount: fee(x, 10) }),
    from: () => 'A video game studio', subject: () => 'You, in our next game',
    body: (x, d) => ['We want to put you in our next wrestling game: motion capture, your moves, your voice.', `${stated(x, d)} for the rights.`],
    options: [
      { id: 'yes', label: 'Do it', blocked: (x) => appearance(x), run: (x, d) => cleared(x, 'game') ?? join('A week in a mocap suit', fx.money(x, Number(d.amount), 'Video game rights'), fx.pop(x, 2), fx.fatigue(x, 4)) },
      { id: 'more', label: 'Hold out for more', detail: () => 'They might go elsewhere', blocked: (x) => appearance(x), run: (x, d) => (chance(x, 0.6) ? cleared(x, 'game') ?? join('They met your price', fx.money(x, round5(Number(d.amount) * 1.5), 'Video game rights'), fx.pop(x, 2)) : 'They went with someone else.') },
      { id: 'no', label: 'Decline', decline: true, run: () => 'Not interested.' },
    ],
  },
];

// ------------------------------------------------------------------ backstage

const BACKSTAGE: EventDef[] = [
  {
    id: 'veteran_advice', cat: 'backstage', weight: 3, cooldown: 45, when: (x) => veteran(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, veteran(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'A bit of advice',
    body: (_x, d) => [`${first(d)} catches you in catering. “You’re rushing your comebacks. Let them breathe and the crowd will do the work for you.”`],
    options: [
      { id: 'listen', label: 'Listen properly', run: (x, d) => join('It makes sense', fx.rel(x, String(d.who), 5, 'You listened to their advice'), chance(x, 0.4) ? fx.stat(x, 'skill', 1) : '') },
      { id: 'nod', label: 'Nod politely', decline: true, run: (x, d) => join('“Sure. Thanks.”', fx.rel(x, String(d.who), -1, 'You humoured them')) },
    ],
  },
  {
    id: 'help_prepare', cat: 'backstage', weight: 2, cooldown: 30, when: (x) => !FEATURES.phone && colleague(x).length > 0,
    setup: (x) => {
      const big = Object.values(x.c.shows).filter((s) => !s.done && s.date > x.day && s.card).flatMap((s) => s.card!.filter((b) => b.title || b.feud).flatMap((b) => boutPeople(b)));
      const w = pick(x.rnd, colleague(x).filter((y) => big.includes(y.id))) ?? pick(x.rnd, colleague(x));
      return w ? { who: w.id } : null;
    },
    from: (_x, d) => nameOf(d), subject: () => 'Help me get ready?',
    body: (_x, d) => [`${first(d)} has a big one coming up and wants to run spots with someone who’ll be honest about what’s not working.`],
    options: [
      { id: 'help', label: 'Help them get ready', run: (x, d) => join('You ran it till it was right', fx.fatigue(x, 5), fx.rel(x, String(d.who), 10, 'Helped them get ready for a big match')) },
      { id: 'no', label: 'You’ve got your own match to think about', decline: true, run: (x, d) => join('They found someone else', fx.rel(x, String(d.who), -4, 'Wouldn’t help them prepare')) },
    ],
  },
  {
    id: 'card_complaint', cat: 'backstage', weight: 2, cooldown: 45, when: (x) => !!x.k && colleague(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, colleague(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'Am I wrong?',
    body: (_x, d) => [`${first(d)} is fuming about their spot on the card and wants you to back them up when they take it to the office.`],
    options: [
      { id: 'back', label: 'Back them', detail: () => 'They’ll remember; so will the booker', run: (x, d) => join('You went in with them', fx.rel(x, String(d.who), 8, 'Backed them with the office'), fx.patience(x, booker(x), -4, 'Joined a complaint about the card')) },
      { id: 'no', label: 'Stay out of it', decline: true, run: (x, d) => join('“Leave me out of this one.”', fx.rel(x, String(d.who), -3, 'Wouldn’t back them')) },
    ],
  },
  {
    id: 'alliance', cat: 'backstage', weight: 1.5, cooldown: 90, when: (x) => colleague(x).some((w) => affinity(x.c, w.id) >= 0),
    setup: (x) => { const w = pick(x.rnd, colleague(x).filter((y) => affinity(x.c, y.id) >= 0)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'We should look out for each other',
    body: (_x, d) => [`${first(d)} reckons the two of you should stick together back here: share rides, watch each other’s backs, put each other forward.`],
    options: [
      { id: 'yes', label: 'Shake on it', run: (x, d) => join('You’ve got a friend in there', fx.rel(x, String(d.who), 15, 'Agreed to look out for each other', 'friend')) },
      { id: 'no', label: 'You work alone', decline: true, run: (x, d) => join('“Fair enough.”', fx.rel(x, String(d.who), -5, 'Turned down their friendship')) },
    ],
  },
  {
    id: 'provoked', cat: 'backstage', weight: 2, cooldown: 30, when: (x) => rivals(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, rivals(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'In your face in the corridor',
    body: (_x, d) => [`${first(d)} blocks the corridor, says something about you loud enough for half the locker room to hear, and waits.`],
    options: [
      { id: 'bite', label: 'Bite back', detail: () => 'Satisfying; it gets around', run: (x, d) => join('It took three people to separate you', fx.rel(x, String(d.who), -10, 'Squared up backstage', 'rival'), fx.rep(x, -1), fx.pop(x, 0.5)) },
      { id: 'walk', label: 'Walk away', decline: true, run: (x) => join('You stepped round them', fx.rep(x, 1)) },
    ],
  },
  {
    id: 'introduction', cat: 'backstage', weight: 1.5, cooldown: 120, when: (x) => !FEATURES.phone && friendly(x, 25).length > 0 && PROMOTIONS.some((p) => !p.indie && p.initials !== (x.k?.promo ?? '')),
    setup: (x) => {
      const w = pick(x.rnd, friendly(x, 25));
      const p = pick(x.rnd, PROMOTIONS.filter((y) => !y.indie && !y.closed && y.initials !== (x.k?.promo ?? '') && y.initials !== w?.promotion));
      return w && p ? { who: w.id, promo: p.initials } : null;
    },
    from: (_x, d) => nameOf(d), subject: (_x, d) => `I know someone at ${d.promo}`,
    body: (_x, d) => [`${first(d)} knows the booker at ${promoName(String(d.promo))} and offers to put a word in for you over a drink.`],
    options: [
      { id: 'go', label: 'Go along', detail: (x) => (x.k ? `${x.k.promo} might hear about it` : 'A useful contact'), run: (x, d) => {
        const promo = String(d.promo);
        const caught = x.k ? maybeCaught(x.c, promo) : false;
        // Lyra's call: an introduction is a guaranteed look, and the look is a tryout.
        const look = introduce(x.c, promo, String(d.who));
        return join(`You met the ${promo} booker`, fx.patience(x, promo, 10, `${first(d)} introduced you`), fx.rel(x, String(d.who), 4, 'Introduced you to a booker'), look, caught ? `${x.k!.promo} heard about it` : '');
      } },
      { id: 'no', label: 'Not now', decline: true, run: () => 'Maybe another time.' },
    ],
  },
  {
    id: 'booker_favour', cat: 'backstage', weight: 2, cooldown: 40,
    when: (x) => !!promoShowIn(x, 8, 21) && !x.c.pledges?.some((p) => p.show === promoShowIn(x, 8, 21)!.id),
    setup: (x) => { const s = promoShowIn(x, 8, 21)!; return { show: s.id, name: s.name, date: s.date }; },
    from: (x) => `${promoName(x.k!.promo)} · the booker`, subject: () => 'I need a favour',
    body: (_x, d) => [`Someone’s pulled out of ${d.name} on ${fmtDay(String(d.date), 'long')}. Can you fill in? I won’t forget it.`],
    options: [
      { id: 'yes', label: 'Fill in', run: (x, d) => {
        (x.c.pledges ??= []).push({ id: `p${++x.c.seq}`, promo: x.k!.promo, kind: 'show', show: String(d.show) });
        return join(`You’re on ${d.name}`, fx.patience(x, booker(x), 6, 'Filled in at short notice'), fx.favour(x, booker(x)));
      } },
      { id: 'no', label: 'You can’t', decline: true, run: (x) => join('“Right. Fine.”', fx.patience(x, booker(x), -3, 'Couldn’t fill in'), fx.snub(x, booker(x))) },
    ],
  },
  {
    id: 'favouritism', cat: 'backstage', weight: 1.5, cooldown: 60,
    when: (x) => colleague(x).length > 0 && (patienceOf(x.c, booker(x)) >= 78 || x.c.history.slice(0, 5).some((m) => m.title)),
    setup: (x) => { const w = pick(x.rnd, colleague(x)); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'Must be nice',
    body: (_x, d) => [`${first(d)} has been telling anyone who’ll listen that you’re the booker’s pet and everyone else is fighting over scraps.`],
    options: [
      { id: 'talk', label: 'Talk it out with them', run: (x, d) => join('You cleared the air', fx.rel(x, String(d.who), 6, 'Cleared the air')) },
      { id: 'shrug', label: 'Shrug it off', run: (x, d) => join('Let them talk', fx.rel(x, String(d.who), -8, 'Ignored their grumbling')) },
      { id: 'booker', label: 'Take it to the booker', detail: () => 'They won’t forgive you', run: (x, d) => join('The booker had a word', fx.rel(x, String(d.who), -15, 'Went to the booker about them'), fx.patience(x, booker(x), -3, 'Brought locker-room drama to the office')) },
    ],
  },
  {
    id: 'olive_branch', cat: 'backstage', weight: 3, cooldown: 90,
    when: (x) => Object.keys(x.c.bookers ?? {}).some((k) => trust(x.c, k) < 45 || patienceOf(x.c, k) < 50),
    setup: (x) => { const k = pick(x.rnd, Object.keys(x.c.bookers ?? {}).filter((y) => trust(x.c, y) < 45 || patienceOf(x.c, y) < 50)); return k ? { key: k } : null; },
    from: (_x, d) => bookerName(String(d.key)), subject: () => 'Water under the bridge?',
    body: (_x, d) => [`Things haven’t been great between you and ${String(d.key).startsWith('TIS:') ? `the promoter of ${String(d.key).slice(4)}` : bookerName(String(d.key))}. They’d like to put it behind you both.`],
    options: [
      { id: 'yes', label: 'Accept the olive branch', run: (x, d) => join('Handshake, fresh start', fx.patience(x, String(d.key), 15, 'Made peace'), fx.favour(x, String(d.key))) },
      { id: 'no', label: 'Hold the grudge', decline: true, run: (x, d) => join('You’re not ready to forget', fx.patience(x, String(d.key), -5, 'Rejected their olive branch')) },
    ],
  },
  {
    id: 'great_match_praise', cat: 'backstage', weight: 3, cooldown: 20, when: (x) => !!x.c.history[0] && x.c.history[0].stars >= 4 && daysBetween(x.c.history[0].day, x.day) <= 7,
    setup: (x) => ({ who: x.c.history[0]!.opp, show: x.c.history[0]!.showName }),
    from: (_x, d) => nameOf(d), subject: () => 'That was something',
    body: (_x, d) => [`${first(d)} finds you after ${d.show}. “That’s the best match I’ve had in years. We should do it again.”`],
    options: [
      { id: 'thanks', label: 'Take the compliment', run: (x, d) => join('You both meant it', fx.rel(x, String(d.who), 8, 'Mutual respect after a great match')) },
      { id: 'rematch', label: 'Pitch a rematch', detail: () => 'Asks the booker if you’re on the same roster', run: (x, d) => {
        const w = who(d);
        const s = askableShows(x.c)[0];
        fx.rel(x, String(d.who), 5, 'You both want the rematch');
        if (!w || !s || !worksFor(w, myPromo(x.c) ?? 'TIS')) return 'You’ll have to find a promoter who wants it: try Requests.';
        return `You asked for ${w.name} on ${s.name}. ${askChallenge(x.c, w.id, s.id).said}`;
      } },
    ],
  },
  {
    id: 'mentor_checkin', cat: 'backstage', weight: 2, cooldown: 60, when: (x) => !FEATURES.phone && withKind(x, 'mentor').length > 0,
    setup: (x) => { const w = pick(x.rnd, withKind(x, 'mentor')); return w ? { who: w.id } : null; },
    from: (_x, d) => nameOf(d), subject: () => 'How’s it going, kid?',
    body: (_x, d) => [`${first(d)} wants to go through your last few matches with you over a coffee.`],
    options: [
      { id: 'go', label: 'Go and see them', run: (x, d) => join('An hour of honest notes', fx.rel(x, String(d.who), 6, 'Went through your matches together'), fx.stat(x, randomAttr(x), 1)) },
      { id: 'no', label: 'Too busy this week', decline: true, run: (x, d) => join('“Another time, then.”', fx.rel(x, String(d.who), -2, 'Too busy for them')) },
    ],
  },
  {
    id: 'prank', cat: 'backstage', weight: 1, cooldown: 90, when: (x) => colleague(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, colleague(x)); return w ? { who: w.id, prank: pick(x.rnd, ['filled your boots with talcum powder', 'swapped your entrance music for a nursery rhyme at rehearsal', 'cling-filmed your car', 'replaced your protein powder with custard powder', 'put your photo up as “Employee of the Month”'])! } : null; },
    from: (_x, _d) => 'The locker room', subject: () => 'Someone’s been busy',
    body: (_x, d) => [`Someone ${d.prank}. Everyone’s pretending not to know who. (It was ${nameOf(d)}.)`],
    options: [
      { id: 'laugh', label: 'Laugh it off', run: (x, d) => join('Fair play', fx.rel(x, String(d.who), 5, 'Took a prank well')) },
      { id: 'revenge', label: 'Plan your revenge', run: (x, d) => { fx.follow(x, 7, 'prank_back', d); return 'You’ve got an idea.'; } },
      { id: 'report', label: 'Report it', decline: true, run: (x, d) => join('Nobody’s laughing now', fx.rel(x, String(d.who), -12, 'Reported their prank')) },
    ],
  },
];

// ------------------------------------------------------------------ career and contract

const CAREER: EventDef[] = [
  {
    id: 'guest_role', cat: 'career', weight: 1.5, cooldown: 60, when: (x) => !!promoShowIn(x, 3, 20),
    setup: (x) => { const s = promoShowIn(x, 3, 20)!; return { show: s.id, name: s.name, date: s.date, role: pick(x.rnd, ['guest commentary', 'special guest referee', 'ring announcer for the night', 'a manager in someone’s corner'])!, amount: round5((x.k?.fee ?? 200) * 0.4) }; },
    from: (x) => `${promoName(x.k!.promo)} · the booker`, subject: (_x, d) => `${String(d.role)[0]!.toUpperCase()}${String(d.role).slice(1)} on ${d.name}?`,
    body: (x, d) => [`We want you on ${d.name} (${fmtDay(String(d.date), 'long')}) as ${d.role}. Not a match: a night in a different role. ${stated(x, d)}.`],
    options: [
      { id: 'yes', label: 'Do it', run: (x, d) => join('Something different', fx.money(x, Number(d.amount), `${d.role} on ${d.name}`), fx.patience(x, booker(x), 4, `Did ${d.role}`), fx.favour(x, booker(x)), fx.pop(x, 0.5)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'They’ll ask someone else.' },
    ],
  },
  {
    id: 'work_hurt', cat: 'career', weight: 3, cooldown: 30, when: (x) => x.p.fatigue >= 55 && !!bookedSoon(x, 7) && bookedSoon(x, 7)!.promo !== 'TIS',
    setup: (x) => { const s = bookedSoon(x, 7)!; return { show: s.id, name: s.name, key: showBooker(s) }; },
    from: (_x, d) => `${promoName(String(d.key))} · the booker`, subject: () => 'I need you this week',
    body: (_x, d) => [`I know you’re banged up. I need you on ${d.name} anyway. Can you go?`],
    options: [
      { id: 'work', label: 'Work through it', detail: () => 'They’ll remember; your body will too', run: (x, d) => join('You’ll be there', fx.patience(x, String(d.key), 6, 'Worked hurt'), fx.favour(x, String(d.key)), fx.rep(x, 0.5)) },
      { id: 'rest', label: 'Ask to be rested', detail: () => 'They might say no', run: (x, d) => {
        if (!chance(x, 0.6)) return '“Sorry. You’re working.”';
        const s = x.c.shows[String(d.show)];
        if (s?.card) s.card = s.card.filter((b) => b.a !== x.c.player && b.b !== x.c.player);
        return join('They took you off the card', fx.patience(x, String(d.key), -3, 'Asked to be rested'), fx.fatigue(x, -10));
      } },
    ],
  },
  {
    id: 'presentation', cat: 'career', weight: 1, cooldown: 180, when: (x) => !!x.k,
    setup: (x) => ({ to: x.me.disposition === 'HEEL' ? 'face' : 'heel' }),
    from: (x) => `${promoName(x.k!.promo)} · creative`, subject: (_x, d) => `We want to turn you ${d.to}`,
    body: (_x, d) => [`Creative think you’d be more interesting as a ${d.to}. New attitude, new music, the works.`],
    options: [
      { id: 'yes', label: (_x, d) => `Turn ${d.to}`, detail: () => 'A reset with the crowd', run: (x, d) => { x.me.disposition = d.to === 'heel' ? 'HEEL' : 'FACE'; return join(`You’re a ${d.to} now`, fx.patience(x, booker(x), 6, 'Went along with creative'), fx.favour(x, booker(x)), fx.pop(x, -1)); } },
      { id: 'tweak', label: 'Offer a tweak instead', run: (x) => join('A new look, same you', fx.patience(x, booker(x), 2, 'Met creative halfway')) },
      { id: 'no', label: 'Refuse', decline: true, detail: (x) => ((x.k?.clauses[C.creative] ?? 0) >= 2 ? 'Your Creative Control covers it' : 'They won’t like it'), run: (x) => ((x.k?.clauses[C.creative] ?? 0) >= 2 ? 'Your Creative Control covers it. Nothing changes.' : join('Creative are annoyed', fx.patience(x, booker(x), -5, 'Refused creative'), fx.snub(x, booker(x)))) },
    ],
  },
  {
    id: 'rival_interest', cat: 'career', weight: 1.5, cooldown: 120, when: (x) => !!x.k && globalScore(x.me) >= 35 && daysBetween(x.day, x.k.end) <= 150 && !x.p.next,
    setup: (x) => { const p = pick(x.rnd, PROMOTIONS.filter((y) => !y.indie && !y.closed && y.initials !== x.k!.promo && standingWith(x.c, y.initials).mine >= standingWith(x.c, y.initials).q1)); return p ? { promo: p.initials } : null; },
    from: (_x, d) => promoName(String(d.promo)), subject: () => 'Off the record…',
    body: (_x, d) => [`${promoName(String(d.promo))} have been watching. Nothing official while you’re under contract, but they’d like to talk about when it ends.`],
    options: [
      { id: 'listen', label: 'Listen', detail: (x) => `${x.k!.promo} might hear about it`, run: (x, d) => { const promo = String(d.promo); const caught = maybeCaught(x.c, promo); makeOffer(x.c, promo, 'We said we’d be in touch'); return join(`${promo} made you an offer: it’s in your mail`, caught ? `${x.k!.promo} heard about it` : ''); } },
      { id: 'no', label: 'Not interested', decline: true, run: (x) => join('You said you’re happy where you are', fx.patience(x, x.k!.promo, 3, 'Turned down a rival’s approach'), fx.favour(x, x.k!.promo)) },
    ],
  },
  {
    id: 'publicity_campaign', cat: 'career', weight: 2, cooldown: 60, when: (x) => !!x.k,
    from: (x) => `${promoName(x.k!.promo)} · marketing`, subject: () => 'Photo shoot and video package',
    body: () => ['We’re shooting new promotional material and want you front and centre: photos, a video package, some social media.'],
    options: [
      { id: 'yes', label: 'Do the shoot', run: (x) => join('You look great on the posters', fx.patience(x, booker(x), 4, 'Did the promo shoot'), fx.favour(x, booker(x)), fx.pop(x, 1), fx.fatigue(x, 2)) },
      { id: 'no', label: 'Decline', decline: true, run: (x) => join('They used someone else', fx.patience(x, booker(x), -2, 'Skipped the promo shoot')) },
    ],
  },
  {
    id: 'far_booking', cat: 'career', weight: 1.5, cooldown: 60,
    when: (x) => sideWork(x.c.people[x.c.player]).rule !== 'banned' && askableIndieShows(x.c).some((s) => s.region !== homeRegion(x) && indieAllowed(x.c, s).ok),
    setup: (x) => {
      const s = pick(x.rnd, askableIndieShows(x.c).filter((y) => y.region !== homeRegion(x) && indieAllowed(x.c, y).ok && !x.c.asked?.[y.id]).slice(0, 30));
      return s ? { show: s.id, name: s.name, city: s.city, country: s.country, date: s.date, amount: round5(indieFee(x.me, s) * 1.3) } : null;
    },
    from: (_x, d) => `${d.name} · ${d.city}, ${d.country}`, subject: () => 'We’ll fly you out',
    body: (x, d) => [`We’re running ${d.name} in ${d.city} on ${fmtDay(String(d.date), 'long')} and want you on it. ${stated(x, d)}, and we cover the travel.`],
    options: [
      { id: 'yes', label: 'Accept', run: (x, d) => { const s = x.c.shows[String(d.show)]; if (!s || !indieAllowed(x.c, s).ok) return 'The date doesn’t work any more.'; joinIndie(x.c, s, Number(d.amount), 0); return `You’re booked: ${d.name}, ${fmtDay(String(d.date), 'dm')}. Travel’s on them.`; } },
      { id: 'no', label: 'Decline', decline: true, run: (x, d) => join('Maybe next time', fx.snub(x, promoterOf(x, d))) },
    ],
  },
  {
    id: 'champion_wanted', cat: 'career', weight: 3, cooldown: 45,
    when: (x) => titlesHeld(x).some(isIndieTitle) && sideWork(x.c.people[x.c.player]).rule !== 'banned',
    setup: (x) => {
      const indieTitle = titlesHeld(x).find(isIndieTitle);
      const s = pick(x.rnd, askableIndieShows(x.c).filter((y) => indieAllowed(x.c, y).ok && trust(x.c, showBooker(y)) >= 45 && !x.c.asked?.[y.id]).slice(0, 25));
      return indieTitle && s ? { show: s.id, name: s.name, city: s.city, country: s.country, date: s.date, title: indieTitle, amount: round5(indieFee(x.me, s) * 1.5), travel: tripCost(x.c, s) } : null;
    },
    from: (_x, d) => `${d.name} · ${d.city}, ${d.country}`, subject: () => 'We want the champion',
    body: (x, d) => [`We want the ${TITLES.find((t) => t.id === d.title)?.name} on ${d.name} (${fmtDay(String(d.date), 'long')}), and we want you defending it. ${stated(x, d)}${Number(d.travel) ? `, plus travel` : ''}.`],
    options: [
      { id: 'yes', label: 'Put the title on the line', run: (x, d) => {
        const s = x.c.shows[String(d.show)];
        if (!s || !indieAllowed(x.c, s).ok) return 'The date doesn’t work any more.';
        joinIndie(x.c, s, Number(d.amount), Number(d.travel));
        (x.c.pledges ??= []).push({ id: `p${++x.c.seq}`, promo: 'TIS', kind: 'defence', title: String(d.title), show: s.id });
        return `You’re defending on ${d.name}, ${fmtDay(String(d.date), 'dm')}.`;
      } },
      { id: 'no', label: 'Decline', decline: true, run: (x, d) => join('They’ll get someone else to headline', fx.snub(x, promoterOf(x, d))) },
    ],
  },
  {
    id: 'controversy_billing', cat: 'career', weight: 4, cooldown: 90,
    when: (x) => {
      const m = x.c.history.find((y) => y.planned === 'off-script' && y.wonTitle && daysBetween(y.day, x.day) <= 60);
      return !!m && sideWork(x.c.people[x.c.player]).rule !== 'banned' && titlesHeld(x).includes(m.title ?? '');
    },
    setup: (x) => {
      const m = x.c.history.find((y) => y.planned === 'off-script' && y.wonTitle)!;
      const crossed = x.c.shows[m.show] ? showBooker(x.c.shows[m.show]!) : '';
      const s = pick(x.rnd, askableIndieShows(x.c).filter((y) => showBooker(y) !== crossed && indieAllowed(x.c, y).ok && !x.c.asked?.[y.id]).slice(0, 25));
      return s ? { show: s.id, name: s.name, city: s.city, date: s.date, title: m.title!, opp: m.opp, amount: round5(indieFee(x.me, s) * 1.4), travel: tripCost(x.c, s) } : null;
    },
    from: (_x, d) => `${d.name} · ${d.city}`, subject: () => '“The Stolen Title”',
    body: (x, d) => [`Everyone’s still arguing about how you won the ${TITLES.find((t) => t.id === d.title)?.name}. We want to sell it: you against ${nameOf(d, 'opp')}, the rematch, on ${d.name}. ${stated(x, d)}.`],
    options: [
      { id: 'yes', label: 'Give them the rematch', run: (x, d) => {
        const s = x.c.shows[String(d.show)];
        if (!s || !indieAllowed(x.c, s).ok) return 'The date doesn’t work any more.';
        joinIndie(x.c, s, Number(d.amount), Number(d.travel));
        (x.c.pledges ??= []).push({ id: `p${++x.c.seq}`, promo: 'TIS', kind: 'defence', title: String(d.title), show: s.id, opp: String(d.opp) });
        return join(`The rematch is on: ${d.name}, ${fmtDay(String(d.date), 'dm')}`, fx.pop(x, 1));
      } },
      { id: 'no', label: 'You’ve proved your point', decline: true, run: () => 'You don’t need to prove anything.' },
    ],
  },
  {
    id: 'title_challenge', cat: 'career', weight: 3, cooldown: 45, when: (x) => titlesHeld(x).length > 0,
    setup: (x) => {
      const t = TITLES.find((y) => y.id === titlesHeld(x)[0])!;
      const owner = isIndieTitle(t.id) ? 'TIS' : PROMOTIONS.find((p) => p.titles.includes(t.id))?.initials ?? 'TIS';
      const pool = WRESTLERS.filter((w) => w.id !== x.c.player && healthy(w, x) && !!owner && worksFor(w, owner));
      const top = contenders(x.c, t, pool, owner === 'TIS' ? homeRegion(x) : promoRegion(owner), x.day)[0];
      return top ? { who: top.id, title: t.id } : null;
    },
    from: (_x, d) => nameOf(d), subject: () => '“Paper champion”',
    body: (_x, d) => [`${nameOf(d)} says your ${TITLES.find((t) => t.id === d.title)?.name} reign is a fraud and wants a shot to prove it.`],
    options: [
      { id: 'accept', label: 'Tell them they’re next', detail: () => 'Raises the stakes between you', run: (x, d) => join('You told the world: they can have it', fx.pop(x, 1), fx.rel(x, String(d.who), -8, 'Accepted their challenge', 'rival')) },
      { id: 'dismiss', label: 'Dismiss them', decline: true, run: (x, d) => join('“Get in line.”', fx.rep(x, 0.5), fx.rel(x, String(d.who), -4, 'You dismissed them')) },
    ],
  },
];

// ------------------------------------------------------------------ personal, money and the daft stuff

const PERSONAL: EventDef[] = [
  {
    id: 'travel_trouble', cat: 'personal', weight: 3, cooldown: 60,
    when: (x) => { const s = bookedSoon(x, 3); return !!s && s.country !== x.me.country; },
    setup: (x) => { const s = bookedSoon(x, 3)!; return { show: s.id, name: s.name, city: s.city, key: showBooker(s), amount: round5(tripCost(x.c, s) * 0.8 + 80) }; },
    from: () => 'The airline', subject: () => 'Your flight’s been cancelled',
    body: (_x, d) => [`Your flight for ${d.name} in ${d.city} has been cancelled. The next one with seats lands an hour before bell time.`],
    options: [
      { id: 'pay', label: (x, d) => `Book another flight (${stated(x, d)})`, blocked: (x, d) => (x.c.money < Number(d.amount) ? 'You can’t afford it right now.' : null), run: (x, d) => join('You’ll make it', fx.money(x, -Number(d.amount), 'Replacement flight')) },
      { id: 'drive', label: 'Go overland overnight', detail: () => 'You’ll arrive wrecked', run: (x) => join('Trains, a bus and a lot of coffee', fx.fatigue(x, 15)) },
      { id: 'pull', label: 'Pull out', decline: true, detail: () => 'A no-show: the promoter won’t forget', run: (x, d) => {
        const s = x.c.shows[String(d.show)];
        if (s) { delete x.c.indie[s.id]; if (s.card) s.card = s.card.filter((b) => b.a !== x.c.player && b.b !== x.c.player); }
        fx.patience(x, String(d.key), -20, 'Pulled out of their show');
        x.c.bookers = x.c.bookers ?? {};
        return join('You pulled out', fx.rep(x, -5));
      } },
    ],
  },
  {
    id: 'unexpected_bill', cat: 'personal', weight: 1, cooldown: 120, when: (x) => x.c.money > 100,
    setup: (x) => ({ what: pick(x.rnd, ['your car’s gearbox has gone', 'your ring gear tore beyond repair', 'your phone died in a hotel bath', 'your landlord wants the boiler money'])!, amount: round5(40 + feeBase(x) * 0.3) }),
    from: () => 'Life', subject: () => 'Of course it is',
    body: (x, d) => [`Bad news: ${d.what}. Fixing it properly is ${stated(x, d)}.`],
    options: [
      { id: 'pay', label: (x, d) => `Pay for it (${stated(x, d)})`, run: (x, d) => join('Sorted', fx.money(x, -Number(d.amount), 'An unexpected bill')) },
      { id: 'patch', label: 'Patch it up', detail: () => 'Might hold, might not', run: (x, d) => (chance(x, 0.5) ? 'Held together with tape. Good enough.' : (fx.follow(x, 10, 'patch_failed', d), 'It’ll do for now…')) },
    ],
  },
  {
    id: 'paid_appearance', cat: 'personal', weight: 2, cooldown: 45, when: (x) => globalScore(x.me) >= 15,
    setup: (x) => ({ venue: `${pick(x.rnd, ['a sports bar', 'a nightclub', 'a comic shop', 'a gym opening', 'a car show'])} in ${nearbyCity(x).city}`, amount: fee(x, 0.8) }),
    from: (_x, d) => `Bookings · ${d.venue}`, subject: () => 'A paid meet-and-greet',
    body: (x, d) => [`${String(d.venue)[0]!.toUpperCase()}${String(d.venue).slice(1)} would pay ${stated(x, d)} for two hours of photos and signings.`],
    options: [
      { id: 'yes', label: 'Take the money', blocked: (x) => appearance(x), run: (x, d) => cleared(x, 'paid') ?? join('Easy money', fx.money(x, Number(d.amount), `Appearance at ${d.venue}`), fx.fatigue(x, 2)) },
      { id: 'no', label: 'Decline', decline: true, run: () => 'Not tonight.' },
    ],
  },
  {
    id: 'fan_gift', cat: 'fun', weight: 1, cooldown: 90, when: (x) => globalScore(x.me) >= 20,
    setup: (x) => ({ gift: pick(x.rnd, ['a hand-made replica title belt', 'a painting of your finisher', 'a knitted version of you, finisher and all', 'a scrapbook of every match you’ve had'])! }),
    from: () => 'A fan', subject: () => 'For you',
    body: (_x, d) => [`A parcel arrives: ${d.gift}, with a note saying your matches got them through a hard year.`],
    options: [
      { id: 'post', label: 'Post a thank-you', run: (x) => join('It went a long way', fx.pop(x, 0.5)) },
      { id: 'keep', label: 'Keep it to yourself', decline: true, run: () => 'It’s on your shelf.' },
    ],
  },
  {
    id: 'wrong_music', cat: 'fun', weight: 0.7, cooldown: 180, when: (x) => !!x.c.history[0] && daysBetween(x.c.history[0].day, x.day) <= 7,
    setup: (x) => { const m = x.c.history[0]!; const s = x.c.shows[m.show]; return { show: m.showName, key: s ? showBooker(s) : m.promo, song: pick(x.rnd, ['a boy band’s greatest hit', 'the theme from a children’s cartoon', 'your opponent’s music', 'a hold-music loop'])! }; },
    from: (_x, d) => String(d.show), subject: () => 'About your entrance…',
    body: (_x, d) => [`At ${d.show} the sound desk played ${d.song} for your entrance. You walked out to it anyway. Someone filmed it.`],
    options: [
      { id: 'roll', label: 'Lean into it', run: (x) => join('The clip went everywhere; people loved it', fx.pop(x, 1)) },
      { id: 'words', label: 'Have words with the sound guy', decline: true, run: (x, d) => join('He won’t do it again', fx.patience(x, String(d.key), -1, 'Shouted at the sound desk')) },
    ],
  },
  {
    id: 'airport', cat: 'fun', weight: 1, cooldown: 120, when: (x) => globalScore(x.me) >= 50,
    from: () => 'Departures', subject: () => 'Recognised at the gate',
    body: () => ['A family spots you at the gate. The kid is shaking. Your flight’s boarding.'],
    options: [
      { id: 'stop', label: 'Stop for photos', run: (x) => join('You made the flight. Just', fx.pop(x, 0.5), fx.fatigue(x, 2)) },
      { id: 'wave', label: 'Wave and run', decline: true, run: () => 'A wave and a sprint.' },
    ],
  },
  {
    id: 'lost_luggage', cat: 'fun', weight: 0.8, cooldown: 150, when: (x) => !!bookedSoon(x, 2) && colleague(x).length > 0,
    setup: (x) => { const w = pick(x.rnd, colleague(x)); return { amount: round5(60 + feeBase(x) * 0.2), ...(w ? { who: w.id } : {}) }; },
    from: () => 'Baggage reclaim', subject: () => 'Your gear’s in another country',
    body: () => ['Your bag, with your boots and gear in it, is somewhere that isn’t here.'],
    options: [
      { id: 'borrow', label: 'Borrow gear', blocked: (_x, d) => (d.who ? null : 'Nobody to borrow from.'), run: (x, d) => join(`${first(d)} lent you a spare pair of everything`, fx.rel(x, String(d.who), 5, 'Lent you their gear')) },
      { id: 'buy', label: (x, d) => `Buy new gear (${stated(x, d)})`, run: (x, d) => join('Brand new and stiff as a board', fx.money(x, -Number(d.amount), 'Replacement gear')) },
    ],
  },
];

// ------------------------------------------------------------------ follow-ups

const FOLLOWS: FollowDef[] = [
  { id: 'mentor_lesson', run: (x, d) => {
    const w = who(d);
    if (!w || relationOf(x.c, w.id)?.kind !== 'mentor') return;
    const said = join(fx.stat(x, randomAttr(x), 1), fx.rel(x, w.id, 5, 'Another lesson'));
    x.c.letters.unshift({ id: `l${++x.c.seq}`, day: x.day, read: false, kind: 'news', from: w.name, subject: 'Same time next month?', body: [`${w.name.split(' ')[0]} spent another afternoon on your mistakes. ${said}.`] });
  } },
  { id: 'documentary_airs', run: (x) => {
    const said = join(fx.pop(x, 2), fx.rep(x, 1));
    x.c.letters.unshift({ id: `l${++x.c.seq}`, day: x.day, read: false, kind: 'news', from: 'The film crew', subject: 'The documentary is out', body: [`It’s out, and people are talking about it. ${said}.`] });
  } },
  { id: 'merch_sales', run: (x, d) => {
    const said = fx.money(x, Number(d.amount), 'Your T-shirt sales');
    x.c.letters.unshift({ id: `l${++x.c.seq}`, day: x.day, read: false, kind: 'news', from: 'The merch company', subject: 'First month’s sales', body: [`The shirts sold. Your cut: ${said}.`] });
  } },
  { id: 'patch_failed', run: (x, d) => {
    const said = fx.money(x, -round5(Number(d.amount) * 1.5), 'The patch-up didn’t hold');
    x.c.letters.unshift({ id: `l${++x.c.seq}`, day: x.day, read: false, kind: 'news', from: 'Life', subject: 'It didn’t hold', body: [`The patch-up gave way. Fixing it properly now costs more: ${said}.`] });
  } },
  { id: 'prank_back', run: (x, d) => {
    const w = who(d);
    if (!w) return;
    fx.rel(x, w.id, 6, 'You got them back; you’re even');
    x.c.letters.unshift({ id: `l${++x.c.seq}`, day: x.day, read: false, kind: 'news', from: 'The locker room', subject: 'Revenge served', body: [`You got ${w.name} back. Even they laughed. You’re square.`] });
  } },
];

registerEvents([...TRAINING, ...COMMUNITY, ...MEDIA, ...BACKSTAGE, ...CAREER, ...PERSONAL], FOLLOWS);
export const EVENT_IDS = [...TRAINING, ...COMMUNITY, ...MEDIA, ...BACKSTAGE, ...CAREER, ...PERSONAL].map((d) => d.id);
