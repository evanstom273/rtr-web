// Romance and family (Lyra's relationships redesign, stage 4: full life; romance fades to black). Attraction is
// orientation and gender, the spark between two people, and how they feel; you flirt, ask someone out (a date in your
// week), make it official, move in (your living costs split), propose (a ring) and marry (the wedding, a day in your
// week). Partners want your time: neglect them and they cool, and below a point they end it. Two at once, and each
// month a partner might find out. The rest of the world falls in love, moves in, marries, splits and strays, and the
// news reaches you when you'd care; you're invited to friends' weddings. Life happens: babies, illness and deaths in
// families, people moving house, and, rarely, the death of a wrestler or a booker, with grief through their friends.
// At work it's "a little" (Lyra's call): gossip, never bookings.
import { findWrestler, TITLES, type Wrestler, WRESTLERS } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { bondOf, bondsOf, bookerOf, feelPair, leaveJob, likeOf, together, type Bond, type LoveStage, type People } from '../world/people';
import { genderOf, into, orientationOf, seedCouples, spark } from '../world/social';
import { personName } from '../data/rtr/names';
import { letter, person, setCareerHooks, spend } from './career';
import { addDays, daysBetween, weekday, type Day } from './dates';
import { baseRegion } from './economy';
import { registerReplies } from './mail';
import { add, capLeft, nameOf, phoneOn, pvoice, registerTopics, sendIn, state } from './phone';
import { LOVE_ANSWER, LOVE_SAY, LOVE_SENT, FAMILY_SENT, pickLine, type Tone } from './phoneLines';
import { freeSlots, makeMeet, onMeet, slotLabel, type Meet } from './plans';
import { moveRelation, readOf, relationOf } from './relations';
import { handover } from './staff';
import { COST_INDEX, LIFE, ROMANCE, SOCIAL_NEWS_MAX } from './tuning';
import type { Career } from './types';
import { CITIES } from './places';

const P = (): People => activeWorld().people!;
const seed = () => activeWorld().seed;
const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const ci = (c: Career) => COST_INDEX[baseRegion(c)];
const lifeOf = (id: string) => ((P().lives ??= {})[id] ??= {});
const dead = (c: Career, id: string) => !!P().lives?.[id]?.died || !!P().folk?.[id]?.died || !!c.people[id]?.retired && !!P().lives?.[id]?.died;
const isKin = (id: string) => { const f = P().folk?.[id]; return !!f && (f.kind === 'family' || f.kind === 'trainer'); };

/** How old someone is. */
function ageOf(c: Career, id: string): number {
  const w = findWrestler(id);
  if (w) return w.age;
  const born = P().staff[id]?.born ?? P().folk?.[id]?.born;
  return born ? Math.floor(daysBetween(born, c.today) / 365.25) : 30;
}
/** Their orientation (yours only once you've set it). */
const orient = (c: Career, id: string) => (id === c.player ? P().lives?.[id]?.orient : orientationOf(seed(), id, P().lives?.[id]));
const gender = (id: string) => genderOf(P(), WRESTLERS, id);
/** Could `a` fall for `b`: orientation, the age gap, nobody under 18, never family. */
export function couldFall(c: Career, a: string, b: string): boolean {
  if (isKin(a) || isKin(b) || a === b) return false;
  if (ageOf(c, a) < 18 || ageOf(c, b) < 18 || Math.abs(ageOf(c, a) - ageOf(c, b)) > ROMANCE.ageGap) return false;
  return into(orient(c, a), gender(a), gender(b));
}
/** How drawn `a` is to `b`, 0–1: the spark, warmed (or cooled) by how they feel. */
export function attraction(c: Career, a: string, b: string): number {
  if (!couldFall(c, a, b)) return 0;
  const s = spark(seed(), a, b);
  return Math.max(0, Math.min(1, s * (0.6 + likeOf(P(), a, b) / 250)));
}
/** Everyone someone's with (one, unless someone's cheating). */
export const loversOf = (id: string): { other: string; bond: Bond }[] => bondsOf(P(), id).filter((b) => together(b.bond));
export const partnerOf = (id: string): { other: string; bond: Bond } | undefined => loversOf(id).sort((a, b) => STAGE_ORDER.indexOf(b.bond.love!.st) - STAGE_ORDER.indexOf(a.bond.love!.st))[0];
const STAGE_ORDER: LoveStage[] = ['crush', 'dating', 'partner', 'living', 'engaged', 'married'];
export const LOVE_LABEL: Record<LoveStage, string> = { crush: 'Crush', dating: 'Dating', partner: 'Partner', living: 'Living together', engaged: 'Engaged', married: 'Married', ex: 'Ex' };

function setStage(c: Career, a: string, b: string, st: LoveStage): Bond {
  const x = bondOf(P(), a, b) ?? feelPair(P(), a, b, [0, 0], [0, 0], '', c.today);
  x.love = { ...(x.love?.wedding && st === 'engaged' ? { wedding: x.love.wedding } : {}), st, since: c.today };
  return x;
}
function shock(id: string, k: keyof typeof LIFE.shock, c: Career): void {
  const [d, days] = LIFE.shock[k] as [number, number];
  const L = lifeOf(id);
  L.shocks = [...(L.shocks ?? []).filter((s) => s.until > c.today && s.k !== k), { k, d, until: addDays(c.today, days) }];
}

// ------------------------------------------------------------------ you: the phone

const stageOf = (c: Career, id: string): LoveStage | undefined => bondOf(P(), c.player, id)?.love?.st;
const daysAt = (c: Career, id: string) => { const l = bondOf(P(), c.player, id)?.love; return l ? daysBetween(l.since, c.today) : 0; };
const theirLike = (c: Career, id: string) => likeOf(P(), id, c.player);
const sayLove = (k: keyof typeof LOVE_SAY) => (_c: Career, _id: string, tone: Tone, _a: string | undefined, rnd: () => number) => pickLine({ plain: LOVE_SAY[k][tone] }, 'plain', rnd);
const fit = (tone: Tone) => (tone === 'warm' ? 1.1 : tone === 'blunt' ? 0.9 : 1);

registerTopics(
  {
    topic: 'flirt',
    option: (c, id) => (isKin(id) || ageOf(c, id) < 18 || stageOf(c, id) === 'ex' ? null : { topic: 'flirt', label: 'Flirt' }),
    say: sayLove('flirt'),
    guess: (c, id) => (attraction(c, id, c.player) >= 0.35 ? 3 : -1),
    run: (c, id, tone, _a, rnd) => {
      const att = attraction(c, id, c.player) * fit(tone);
      const taken = partnerOf(id) && partnerOf(id)!.other !== c.player;
      const mine = together(bondOf(P(), c.player, id) ?? ({} as Bond));
      const yes = mine || (att >= 0.35 && (!taken || rnd() < 0.15));
      const v = pvoice(id);
      if (!yes) {
        moveRelation(c, id, taken ? ROMANCE.flirt.taken : ROMANCE.flirt.no, 'You flirted with them');
        const read = readOf(relationOf(c, id));
        return { reply: pickLine(LOVE_ANSWER.flirt.no, v, rnd), note: [taken ? 'They’re with someone' : 'Not interested', read !== 'none' && !couldFall(c, id, c.player) ? 'You don’t think you’re their type' : ''].filter(Boolean).join(' · ') };
      }
      moveRelation(c, id, ROMANCE.flirt.yes, 'Flirting');
      const b = bondOf(P(), c.player, id)!;
      if (!b.love && theirLike(c, id) >= 35) b.love = { st: 'crush', since: c.today, by: id };
      return { reply: pickLine(LOVE_ANSWER.flirt.yes, v, rnd), note: mine ? 'They loved that' : 'They flirted back' };
    },
  },
  {
    topic: 'date',
    option: (c, id) => {
      if (isKin(id) || ageOf(c, id) < 18) return null;
      const st = stageOf(c, id);
      const slots = freeSlots(c, id, 'date');
      const r = relationOf(c, id);
      if (st && st !== 'crush' && st !== 'ex') return slots.length ? { topic: 'date', label: 'Date night', groups: [{ name: 'When', options: slots.map((s) => ({ id: `${s.day}@${s.ph}`, label: slotLabel(c, s.day, s.ph) })) }] } : null;
      if ((r?.v ?? 0) < ROMANCE.date.minLike || (r?.fam ?? 0) < ROMANCE.date.minFam) return null;
      return { topic: 'date', label: 'Ask them out', ...(slots.length ? { groups: [{ name: 'When', options: slots.map((s) => ({ id: `${s.day}@${s.ph}`, label: slotLabel(c, s.day, s.ph) })) }] } : { blocked: 'You’re not both free this week.' }) };
    },
    say: (c, id, tone, about, rnd) => (stageOf(c, id) && stageOf(c, id) !== 'crush' ? 'Date night? Just us.' : sayLove('date')(c, id, tone, about, rnd)),
    guess: (c, id) => (together(bondOf(P(), c.player, id) ?? ({} as Bond)) ? 5 : attraction(c, id, c.player) * (0.5 + theirLike(c, id) / 100) >= 0.4 ? 3 : -2),
    run: (c, id, tone, about, rnd) => {
      const [day, ph] = (about ?? '').split('@') as [Day, 'am' | 'pm'];
      const v = pvoice(id);
      const mine = together(bondOf(P(), c.player, id) ?? ({} as Bond));
      const taken = partnerOf(id) && partnerOf(id)!.other !== c.player;
      const p = mine ? 0.9 : attraction(c, id, c.player) * (0.5 + theirLike(c, id) / 100) * fit(tone) - (taken ? 0.5 : 0);
      if (rnd() >= p) { moveRelation(c, id, -2, 'You asked them out'); return { reply: pickLine(LOVE_ANSWER.date.no, v, rnd), note: taken ? 'They’re with someone' : 'They said no' }; }
      makeMeet(c, { day, ph, with: id, kind: 'date', by: 'me' });
      return { reply: pickLine(LOVE_ANSWER.date.yes, v, rnd), note: `A date, ${slotLabel(c, day, ph)}: it’s in your week` };
    },
  },
  ...(['commit', 'movein', 'propose'] as const).map((k) => ({
    topic: k,
    option: (c: Career, id: string) => {
      const st = stageOf(c, id);
      const need: Record<typeof k, LoveStage[]> = { commit: ['dating'], movein: ['partner'], propose: ['partner', 'living'] };
      if (!st || !need[k].includes(st)) return null;
      const R = ROMANCE[k];
      const label = { commit: 'Make it official', movein: 'Ask them to move in', propose: 'Propose' }[k];
      const blocked = daysAt(c, id) < R.days ? 'It’s a bit soon for that.' : k === 'movein' && c.home ? 'You already live with someone.' : k === 'movein' && P().folk?.[id] === undefined && findWrestler(id)?.country !== (c.base ?? findWrestler(c.player)!.country) ? 'You don’t live in the same country.'
        : k === 'propose' && c.money < ROMANCE.ring * ci(c) ? `A ring costs about ${money(ROMANCE.ring * ci(c))}.` : undefined;
      return { topic: k, label, ...(blocked ? { blocked } : {}) };
    },
    say: sayLove(k),
    guess: (c: Career, id: string) => (theirLike(c, id) >= ROMANCE[k].like ? 4 : -3),
    run: (c: Career, id: string, tone: Tone, _a: string | undefined, rnd: () => number) => {
      const v = pvoice(id);
      if (k === 'propose') spend(c, -Math.round(ROMANCE.ring * ci(c)), 'An engagement ring', 'event');
      const yes = theirLike(c, id) * fit(tone) >= ROMANCE[k].like || rnd() < 0.1;
      if (!yes) { moveRelation(c, id, -3, k === 'propose' ? 'You proposed too soon' : 'You rushed them'); return { reply: pickLine(LOVE_ANSWER[k].no, v, rnd), note: 'Not yet' }; }
      if (k === 'commit') { setStage(c, c.player, id, 'partner'); moveRelation(c, id, 5, 'Made it official'); return { reply: pickLine(LOVE_ANSWER.commit.yes, v, rnd), note: 'You’re together. Officially.' }; }
      if (k === 'movein') { setStage(c, c.player, id, 'living'); c.home = { with: id, since: c.today }; moveRelation(c, id, 5, 'Moved in together'); return { reply: pickLine(LOVE_ANSWER.movein.yes, v, rnd), note: 'Living together: your living costs are shared' }; }
      const b = setStage(c, c.player, id, 'engaged');
      const [lo, hi] = ROMANCE.wedding.days as [number, number];
      const day = addDays(c.today, lo + Math.floor(rnd() * (hi - lo + 1)));
      b.love!.wedding = day;
      makeMeet(c, { day, ph: 'pm', with: id, kind: 'wedding', by: 'me' });
      moveRelation(c, id, 8, 'Engaged');
      shock(c.player, 'wedding', c); shock(id, 'wedding', c);
      return { reply: pickLine(LOVE_ANSWER.propose.yes, v, rnd), note: `Engaged. The wedding: ${slotLabel(c, day, 'pm')}` };
    },
  })),
  {
    topic: 'split',
    option: (c, id) => (together(bondOf(P(), c.player, id) ?? ({} as Bond)) ? { topic: 'split', label: 'End it' } : null),
    say: sayLove('split'),
    guess: () => -10,
    run: (c, id, _t, _a, rnd) => { breakUp(c, c.player, id, 'You ended it'); return { reply: pickLine({ plain: ['Right. Okay.', 'If that’s what you want.'], hot: ['Fine. Get out.'], warm: ['I don’t understand. But okay.'] }, pvoice(id), rnd), note: 'It’s over' }; },
  },
);

/** It's over: they're exes, it hurts, and whoever moved in moves out. */
function breakUp(c: Career, a: string, b: string, why: string): void {
  const x = setStage(c, a, b, 'ex');
  x.la = Math.max(-100, x.la + ROMANCE.split.like); x.lb = Math.max(-100, x.lb + ROMANCE.split.like);
  (x.log ??= []).unshift({ day: c.today, t: why });
  shock(a, 'heartbreak', c); shock(b, 'heartbreak', c);
  if (c.home && (a === c.player || b === c.player) && (c.home.with === a || c.home.with === b)) {
    delete c.home;
    spend(c, -Math.round(ROMANCE.split.moveOut * ci(c)), 'Moving out', 'event');
  }
  for (const m of c.meets ?? []) if (m.status === 'on' && (m.kind === 'date' || m.kind === 'wedding') && (m.with === a || m.with === b)) m.status = 'off';
}

// A date: you're dating now. The wedding: married. A night out: you might meet someone.
onMeet((c, m: Meet, rnd: Rng) => {
  if (m.kind === 'date') {
    const st = stageOf(c, m.with);
    if (!st || st === 'crush' || st === 'ex') { setStage(c, c.player, m.with, 'dating'); return 'You’re seeing each other now'; }
    return undefined;
  }
  if (m.kind === 'wedding' && stageOf(c, m.with) === 'engaged') {
    spend(c, -Math.round(ROMANCE.wedding.cost * ci(c)), 'Your wedding', 'event');
    setStage(c, c.player, m.with, 'married');
    shock(c.player, 'wedding', c); shock(m.with, 'wedding', c);
    for (const { other, bond } of bondsOf(P(), c.player)) if (P().folk?.[other]?.kind === 'family') { if (bond.a === other) bond.la = Math.min(100, bond.la + 5); else bond.lb = Math.min(100, bond.lb + 5); }
    addEvent(activeWorld().history, { day: c.today, kind: 'married', who: c.player, name: findWrestler(c.player)!.name, what: nameOf(m.with) });
    return 'Married';
  }
  if (m.kind === 'night' && rnd() < ROMANCE.meetSomeone) {
    const me = findWrestler(c.player)!;
    const o = P().lives?.[c.player]?.orient;
    const g = o === 'gay' ? me.gender : o === 'straight' ? (me.gender === 'MALE' ? 'FEMALE' : 'MALE') : rnd() < 0.5 ? 'MALE' : 'FEMALE';
    const id = `folk_met_${c.seq + 1}`;
    const country = c.base ?? me.country;
    const city = CITIES[country]?.[Math.floor(rnd() * (CITIES[country]?.length ?? 1))];
    (P().folk ??= {})[id] = { id, name: personName(rnd, country, g), kind: 'outsider', gender: g, country, ...(city ? { city } : {}), born: `${Number(c.today.slice(0, 4)) - Math.max(20, me.age + Math.round((rnd() - 0.5) * 8))}${c.today.slice(4)}` };
    const x = feelPair(P(), id, c.player, [35, 0], [35, 0], 'Met on a night out', c.today, { keep: 5, fam: 20 });
    void x;
    return `You met ${P().folk![id]!.name}: they’re in your phone`;
  }
  return undefined;
});

// ------------------------------------------------------------------ your love life, day to day

/** Partners want your time; cheating gets found out; admirers make a move. */
function yourLife(c: Career, rnd: Rng): void {
  if (c.spectator || c.people[c.player]?.retired) return;
  const mine = loversOf(c.player);
  // Mondays: a partner you've neglected cools; one who's gone cold ends it.
  if (weekday(c.today) === 1) for (const { other } of mine) {
    const t = state(c).threads[other];
    const seen = (c.meets ?? []).some((m) => m.with === other && m.status === 'done' && daysBetween(m.day, c.today) <= ROMANCE.neglect.days) || c.home?.with === other;
    const texted = (t?.sent ?? []).some((d) => daysBetween(d, c.today) <= 14);
    if (!seen && !texted) moveRelation(c, other, ROMANCE.neglect.like, 'You’ve hardly seen them');
    if (theirLike(c, other) < ROMANCE.dumpAt) {
      sendIn(c, other, pickLine(LOVE_SENT.dump, pvoice(other), rnd), [{ id: 'brief', label: 'Okay', detail: '' }]);
      breakUp(c, c.player, other, 'They ended it');
    } else if (theirLike(c, other) < 45 && capLeft(c) > 0 && rnd() < 0.3) sendIn(c, other, pickLine(LOVE_SENT.talk, pvoice(other), rnd), [{ id: 'chat', label: 'Talk it through', detail: 'Closer' }, { id: 'brief', label: 'We’re fine', detail: '' }], 'friend');
  }
  // Two at once: each month a partner might find out.
  if (c.today.endsWith('-01') && mine.length >= 2) for (const { other } of mine) {
    if (rnd() >= ROMANCE.cheatFound) continue;
    sendIn(c, other, pickLine(LOVE_SENT.found, pvoice(other), rnd), [{ id: 'brief', label: 'I’m sorry', detail: '' }]);
    moveRelation(c, other, -40, 'You cheated on them');
    breakUp(c, c.player, other, 'You cheated');
    break;
  }
  // A partner misses you now and then.
  const p = partnerOf(c.player);
  if (p && capLeft(c) > 0 && rnd() < 0.08) sendIn(c, p.other, pickLine(LOVE_SENT.miss, pvoice(p.other), rnd), [{ id: 'chat', label: 'Miss you too', detail: 'Closer' }, { id: 'brief', label: 'x', detail: '' }]);
  // Admirers (only if you've set your orientation): a crush, a flirt, then they ask you out.
  if (!phoneOn() || !P().lives?.[c.player]?.orient || capLeft(c) <= 0 || rnd() >= 0.04) return;
  for (const { other, bond } of bondsOf(P(), c.player)) {
    if (together(bond) || bond.love?.st === 'ex' || dead(c, other) || partnerOf(other)) continue;
    if (theirLike(c, other) < 50 || bond.f < 30 || attraction(c, other, c.player) < ROMANCE.spark || !couldFall(c, c.player, other)) continue;
    const crush = bond.love?.st === 'crush' && bond.love.by === other;
    if (!crush) { bond.love = { st: 'crush', since: c.today, by: other }; sendIn(c, other, pickLine(LOVE_SENT.flirt, pvoice(other), rnd), [{ id: 'flirt_back', label: 'Flirt back', detail: 'They’ll take that as a yes' }, { id: 'let_down', label: 'Let them down gently', detail: 'They cool a little' }]); return; }
    if (daysBetween(bond.love!.since, c.today) >= 14) {
      const slot = freeSlots(c, other, 'date').filter((s) => s.day > c.today)[0];
      if (!slot) continue;
      sendIn(c, other, `${pickLine(LOVE_SENT.ask, pvoice(other), rnd)} (${slotLabel(c, slot.day, slot.ph)})`, [{ id: 'date_yes', label: 'Yes', detail: 'A date in your week' }, { id: 'date_no', label: 'No, sorry', detail: 'They’ll be hurt' }], undefined, { day: slot.day, ph: slot.ph });
      return;
    }
  }
}

registerReplies({
  flirt_back: (c, l) => { moveRelation(c, l.ctx!.who!, 5, 'You flirted back'); return 'They’re smiling at their phone.'; },
  let_down: (c, l) => { const b = bondOf(P(), c.player, l.ctx!.who!); if (b?.love?.st === 'crush') delete b.love; moveRelation(c, l.ctx!.who!, -3, 'You let them down gently'); return 'Kindly done.'; },
  date_yes: (c, l) => {
    const x = l.ctx!;
    if (!freeSlots(c, x.who!, 'date').some((s) => s.day === x.day && s.ph === x.ph)) return 'You’re not free then any more.';
    makeMeet(c, { day: x.day!, ph: x.ph as 'am' | 'pm', with: x.who!, kind: 'date', by: 'them' });
    return `A date, ${slotLabel(c, x.day!, x.ph as 'am' | 'pm')}: it’s in your week.`;
  },
  date_no: (c, l) => { const b = bondOf(P(), c.player, l.ctx!.who!); if (b?.love?.st === 'crush') delete b.love; moveRelation(c, l.ctx!.who!, -6, 'You turned them down'); return 'They took it on the chin. Mostly.'; },
  wed_yes: (c, l) => {
    const x = l.ctx!;
    makeMeet(c, { day: x.day!, ph: 'pm', with: x.who!, kind: 'wedding', by: 'them' });
    moveRelation(c, x.who!, 3, 'You’re coming to their wedding');
    return `Their wedding is in your week on ${x.day}.`;
  },
  wed_no: (c, l) => { moveRelation(c, l.ctx!.who!, -4, 'You couldn’t come to their wedding'); return 'They understood. They said.'; },
});

// ------------------------------------------------------------------ the rest of the world in love

let newsThisMonth = 0;
function cares(c: Career, ...ids: string[]): boolean {
  const me = findWrestler(c.player);
  return ids.some((id) => { const w = findWrestler(id); return (!!w && !!me && me.promotion !== 'TIS' && w.promotion === me.promotion) || (bondOf(P(), c.player, id)?.f ?? 0) >= 30; });
}
function news(c: Career, subject: string, body: string, ...ids: string[]): void {
  if (c.spectator || newsThisMonth >= SOCIAL_NEWS_MAX || !cares(c, ...ids)) return;
  newsThisMonth++;
  letter(c, { kind: 'news', from: 'Backstage', subject, body: [body] });
}

/** Each month: couples form, move on, marry, split and stray. */
function worldInLove(c: Career, rnd: Rng): void {
  const A = ROMANCE.ai;
  const P0 = P();
  const busy = new Set<string>();
  for (const x of Object.values(P0.bonds)) {
    if (!together(x) || x.a === c.player || x.b === c.player) { if (x.love && together(x)) { busy.add(x.a); busy.add(x.b); } continue; }
    busy.add(x.a); busy.add(x.b);
    const l = x.love!;
    const days = daysBetween(l.since, c.today);
    const cold = Math.min(x.la, x.lb) < 30;
    if (rnd() < (A.split[l.st as keyof typeof A.split] ?? 0.01) + (cold ? A.splitCold : 0) || rnd() < A.cheat) {
      const strayed = !cold;
      const a = x.a, b = x.b;
      breakUp(c, a, b, strayed ? 'Someone strayed' : 'Drifted apart');
      news(c, `${nameOf(a)} and ${nameOf(b)} have split`, strayed ? 'Word is, someone strayed. Nobody’s saying who.' : 'It had been coming for a while, apparently.', a, b);
      continue;
    }
    const next = [['dating', 'partner', A.partner], ['partner', 'living', A.living], ['living', 'engaged', A.engaged], ['engaged', 'married', A.married]] as [LoveStage, LoveStage, number[]][];
    const step = next.find(([from]) => from === l.st);
    if (step && days >= step[2][0]! && rnd() < step[2][1]! && Math.min(x.la, x.lb) >= 45) {
      x.love = { st: step[1], since: c.today };
      if (step[1] === 'engaged') news(c, `${nameOf(x.a)} and ${nameOf(x.b)} are engaged`, 'Ring and everything.', x.a, x.b);
      if (step[1] === 'married') {
        addEvent(activeWorld().history, { day: c.today, kind: 'married', who: x.a, name: nameOf(x.a), what: nameOf(x.b) });
        shock(x.a, 'wedding', c); shock(x.b, 'wedding', c);
        news(c, `${nameOf(x.a)} and ${nameOf(x.b)} got married`, 'A big do, by all accounts.', x.a, x.b);
        // You're invited, if you're close to either.
        const friend = [x.a, x.b].find((id) => findWrestler(id) && theirLike(c, id) >= 40 && (bondOf(P0, c.player, id)?.f ?? 0) >= 40);
        if (friend && !c.spectator && phoneOn()) {
          const day = addDays(c.today, 21 + Math.floor(rnd() * 14));
          x.love = { st: 'engaged', since: c.today, wedding: day };
          sendIn(c, friend, `We’re getting married on ${day}! Will you come?`, [{ id: 'wed_yes', label: 'Wouldn’t miss it', detail: 'A present, and an evening' }, { id: 'wed_no', label: 'I can’t, I’m so sorry', detail: 'They’ll be disappointed' }], undefined, { day });
        }
      }
    }
  }
  // Singles get together: people who know each other, like each other, fit each other, and have the spark.
  for (const x of Object.values(P0.bonds)) {
    if (x.love || busy.has(x.a) || busy.has(x.b) || x.a === c.player || x.b === c.player) continue;
    if (Math.min(x.la, x.lb) < A.minLike || x.f < A.minFam || dead(c, x.a) || dead(c, x.b)) continue;
    if (!findWrestler(x.a) && !P0.staff[x.a]) continue;
    if (!findWrestler(x.b) && !P0.staff[x.b]) continue;
    if (!couldFall(c, x.a, x.b) || !couldFall(c, x.b, x.a) || spark(seed(), x.a, x.b) < A.spark) continue;
    if (rnd() >= A.start) continue;
    x.love = { st: 'dating', since: c.today };
    busy.add(x.a); busy.add(x.b);
    news(c, `${nameOf(x.a)} and ${nameOf(x.b)} are seeing each other`, 'They’re not hiding it very well.', x.a, x.b);
  }
}

// ------------------------------------------------------------------ life

/** Each month: babies, illness and deaths in families, moving house, and (rarely) someone's death. */
function lifeEvents(c: Career, rnd: Rng): void {
  const L = LIFE;
  for (const w of WRESTLERS) {
    if (c.people[w.id]?.retired || w.id.startsWith('__') || w.id === c.player) continue;
    const p = partnerOf(w.id);
    if (p && ['living', 'married'].includes(p.bond.love!.st) && w.age >= 22 && w.age <= 42 && rnd() < L.baby) { shock(w.id, 'baby', c); if (findWrestler(p.other)) shock(p.other, 'baby', c); closeNews(c, w, 'baby'); }
    if (rnd() < L.ill) { shock(w.id, 'ill', c); closeNews(c, w, 'ill'); }
    if (rnd() < L.died) { shock(w.id, 'grief', c); closeNews(c, w, 'died'); }
    if (rnd() < L.move) { const cs = CITIES[w.country]; if (cs?.length) lifeOf(w.id).home = cs[Math.floor(rnd() * cs.length)]; }
    const death = L.death.base + Math.max(0, w.age - L.death.from) * L.death.perYear;
    if (rnd() < death) die(c, w.id, rnd);
  }
  for (const s of Object.values(P().staff)) {
    if (s.retired || P().lives?.[s.id]?.died) continue;
    const age = Math.floor(daysBetween(s.born, c.today) / 365.25);
    if (rnd() < L.death.base + Math.max(0, age - L.death.from) * L.death.perYear) die(c, s.id, rnd);
  }
  familyOf(c, rnd);
}

/** Someone close tells you their news (a baby, a parent ill, a death in the family). */
function closeNews(c: Career, w: Wrestler, k: 'baby' | 'ill' | 'died'): void {
  if (c.spectator || !phoneOn() || theirLike(c, w.id) < 40 || (bondOf(P(), c.player, w.id)?.f ?? 0) < 40) return;
  const rnd = seededRng(hashSeed(c.seed, 'close-news', w.id, c.today));
  const text = k === 'baby' ? pickLine(FAMILY_SENT.baby, pvoice(w.id), rnd, { kid: rnd() < 0.5 ? 'girl' : 'boy', KID: rnd() < 0.5 ? 'GIRL' : 'BOY' })
    : k === 'ill' ? `My ${rnd() < 0.5 ? 'mum' : 'dad'}’s not well. They’ve taken them into hospital.` : `Lost my ${rnd() < 0.5 ? 'mum' : 'dad'} last night. Don’t really know what to say.`;
  sendIn(c, w.id, text, k === 'baby' ? [{ id: 'happy', label: 'Congratulations!', detail: 'Closer' }, { id: 'brief', label: 'Nice one', detail: '' }] : [{ id: 'there', label: 'I’m here for you', detail: 'Closer · loyal' }, { id: 'brief', label: 'So sorry', detail: '' }]);
}

/** Your own family: illness, a death, a baby of your own. */
function familyOf(c: Career, rnd: Rng): void {
  if (c.spectator || c.people[c.player]?.retired) return;
  const F = P().folk ?? {};
  const kin = Object.values(F).filter((f) => f.kind === 'family' && f.of === c.player && !f.died);
  const sender = (not: string) => kin.find((f) => f.id !== not)?.id;
  for (const f of kin) {
    const age = f.born ? Math.floor(daysBetween(f.born, c.today) / 365.25) : 50;
    const rel = f.rel ?? 'family';
    if (rnd() < LIFE.ill * 2 * (age > 55 ? 2 : 1)) {
      shock(c.player, 'ill', c);
      const from = sender(f.id) ?? f.id;
      add(c, from, { text: pickLine(FAMILY_SENT.ill, 'fam', rnd, { rel: from === f.id ? 'other half' : rel }) });
    }
    if (rnd() < LIFE.died * (age > 60 ? 4 : age > 50 ? 1.5 : 0.3)) {
      f.died = c.today;
      shock(c.player, 'death', c);
      const from = sender(f.id);
      if (from) add(c, from, { text: pickLine(FAMILY_SENT.died, 'fam', rnd, { rel }) });
      add(c, f.id, { sys: true, text: `${f.name} died on ${c.today}.` });
      letter(c, { kind: 'news', from: 'Family', subject: `Your ${rel} has died`, body: [`${f.name} died. Everyone who knows you is thinking of you.`] });
    }
  }
  // A baby of your own.
  const p = partnerOf(c.player);
  const me = findWrestler(c.player)!;
  if (p && ['living', 'married'].includes(p.bond.love!.st) && me.age >= 20 && me.age <= 45 && rnd() < LIFE.baby) {
    const g = rnd() < 0.5 ? 'FEMALE' : 'MALE';
    const id = `folk_${c.player}_child_${c.today.replace(/-/g, '')}`;
    (P().folk ??= {})[id] = { id, name: `${personName(rnd, me.country, g).split(' ')[0]} ${me.name.split(' ').slice(-1)[0]}`, kind: 'family', rel: g === 'FEMALE' ? 'daughter' : 'son', of: c.player, gender: g, country: me.country, born: c.today };
    const x = feelPair(P(), id, c.player, [100, 0], [100, 0], 'Born', c.today, { keep: 5 });
    x.f = 100;
    shock(c.player, 'baby', c); shock(p.other, 'baby', c);
    add(c, p.other, { text: `It’s a ${g === 'FEMALE' ? 'girl' : 'boy'}. ${P().folk![id]!.name.split(' ')[0]}. I can’t stop crying x` });
  }
}

/** Someone dies (Lyra's call: rarely, anyone): titles vacated, cards cleared, the news, and grief through their friends. */
export function die(c: Career, id: string, rnd: Rng): void {
  if (id === c.player) return;
  const L = lifeOf(id);
  if (L.died) return;
  L.died = c.today;
  const w = findWrestler(id);
  const name = nameOf(id);
  const age = ageOf(c, id);
  if (w) {
    const p = person(c, id);
    p.retired = true; p.retiredOn = c.today; p.contract = null; delete p.retiring;
    const from = w.promotion;
    for (const t of TITLES) if (t.holder === id) {
      t.holder = null;
      const open = activeWorld().history.reigns[t.id]?.find((r) => r.to === null);
      if (open) open.to = c.today;
    }
    w.promotion = 'TIS';
    for (const s of Object.values(c.shows)) if (!s.done && s.card) s.card = s.card.filter((b) => b.result || (b.a !== id && b.b !== id));
    for (const f of c.feuds) if (!f.done && (f.a === id || f.b === id)) f.done = true;
    addEvent(activeWorld().history, { day: c.today, kind: 'died', who: id, name, promo: from, what: `aged ${age}` });
  } else {
    const s = P().staff[id];
    if (s) {
      const job = s.job;
      leaveJob(s, c.today, 'retired');
      if (job?.kind === 'booker' && bookerOf(P(), job.promo) === undefined) handover(c, job.promo, s, 'retired', rnd);
    }
  }
  // Grief: everyone who cared about them.
  for (const { other } of bondsOf(P(), id)) if (likeOf(P(), other, id) >= 40) shock(other, 'grief', c);
  if (!c.spectator) {
    const close = theirLike(c, id) >= 30 || likeOf(P(), c.player, id) >= 30;
    letter(c, { kind: 'news', from: 'Tributes', subject: `${name} has died, aged ${age}`, body: [`The wrestling world is mourning ${name}. Tributes have been pouring in from across the business.`] });
    if (close) { shock(c.player, 'grief', c); add(c, id, { sys: true, text: `${name} died on ${c.today}.` }); }
  }
}

// ------------------------------------------------------------------ hooks

function daily(c: Career): void {
  // A lived-in world's couples (once): for a world made before romance existed, today.
  if (!P().loves) seedCouplesSync(c, activeWorld().seed);
  yourLife(c, seededRng(hashSeed(c.seed, 'love', c.today)));
}
function seedCouplesSync(c: Career, s: number): void {
  seedCouples({ seed: s, day: c.today, wrestlers: WRESTLERS, people: P(), out: (id) => id.startsWith('__') || !!c.people[id]?.retired, orient: (id) => orient(c, id), age: (id) => ageOf(c, id) });
}

function monthly(c: Career): void {
  newsThisMonth = 0;
  const rnd = seededRng(hashSeed(c.seed, 'love-month', c.today));
  worldInLove(c, rnd);
  lifeEvents(c, rnd);
  // Old shocks fade out of the record.
  for (const L of Object.values(P().lives ?? {})) if (L.shocks) { L.shocks = L.shocks.filter((s) => s.until > c.today); if (!L.shocks.length) delete L.shocks; }
}

setCareerHooks({ daily, monthly, start: (c) => { if (!P().loves) seedCouplesSync(c, activeWorld().seed); } });

