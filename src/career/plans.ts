// Plans and activities (Lyra's relationships redesign, stage 3). Drinks, a meal, a night out, the gym together,
// running spots, going round someone's: made from the phone for a free half-day this week (Lyra's call: they take
// time like training does), when you'll both be in the same country. They say yes or no for real reasons (how they
// like you, a recent no, their wellbeing, being away), some flake on the day, it costs what it costs where you live,
// and it brings you closer than any message. People invite you too (part of the phone's weekly cap), including what
// the old event cards were: a friend introducing you to another major's booker over a drink, a colleague wanting to
// run spots before a big match, a training partner, your mentor over a coffee. On the road: sharing the drive to an
// indie show halves the travel. Money: gifts, borrowing from a friend, friends asking to borrow from you (and
// whether they ever pay it back).
import { findWrestler, hasTrait, PROMOTIONS } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondOf, bondsOf, feelPair, likeOf, respectOf, type People } from '../world/people';
import { person, setCareerHooks, showsOn, spend } from './career';
import { addDays, daysBetween, fmtDay, weekday, type Day } from './dates';
import { activityAt, baseCountry, trainSession } from './day';
import { baseRegion } from './economy';
import { registerReplies } from './mail';
import { add, capLeft, first, nameOf, phoneOn, pvoice, registerTopics, sendIn, state } from './phone';
import { AFTER, ASK, ASKED, FLAKE, INVITE_ANSWER, MEET_LABEL, pickLine, type MeetKind, type Tone } from './phoneLines';
import { moveRelation } from './relations';
import { introduce } from './scouting';
import { moodOf, whereIs } from './socialLife';
import { BORROW, COST_INDEX, GIFTS, LEND, MEET_RULES, MEETS, PLANS_IN, SHARE, TONE_FIT } from './tuning';
import type { Career, PhaseName } from './types';

/** Something you've arranged with someone: when, what, who asked, and how it went. */
export interface Meet {
  id: string; day: Day; ph: PhaseName; with: string; kind: MeetKind; by: 'me' | 'them';
  /** You're paying. */
  pay?: true;
  /** What it was really about (an old event card's): an introduction to a booker, your mentor's notes. */
  purpose?: 'intro' | 'mentor';
  promo?: string;
  status: 'on' | 'done' | 'flaked' | 'missed' | 'off';
}
/** Money you've lent: to whom, how much, when it's due, and whether they'll ever pay it. */
export interface Lent { who: string; amount: number; due: Day; repay: boolean; chased?: Day }

const P = (): People => activeWorld().people!;
const KINDS = Object.keys(MEETS) as MeetKind[];
const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const costOf = (c: Career, kind: MeetKind, pay?: boolean) => Math.round(MEETS[kind].cost * COST_INDEX[baseRegion(c)] * (pay ? 2 : 1));
const theirLike = (c: Career, id: string) => likeOf(P(), id, c.player);
const isFamily = (id: string) => P().folk?.[id]?.kind === 'family';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "tonight", "tomorrow morning", "Friday evening" (or a date, further off). */
export const slotLabel = (c: Career, day: Day, ph: PhaseName): string => {
  if (day === c.today) return ph === 'am' ? 'this morning' : 'tonight';
  if (day === addDays(c.today, 1)) return ph === 'am' ? 'tomorrow morning' : 'tomorrow night';
  const name = daysBetween(c.today, day) < 7 ? DAYS[weekday(day)]! : fmtDay(day, 'dm');
  return `${name} ${ph === 'am' ? 'morning' : 'evening'}`;
};
export const meetsOf = (c: Career): Meet[] => (c.meets ??= []);
/** What's on with someone, from today. */
export const upcoming = (c: Career, id?: string): Meet[] => meetsOf(c).filter((m) => m.status === 'on' && m.day >= c.today && (!id || m.with === id)).sort((a, b) => (a.day + a.ph < b.day + b.ph ? -1 : 1));

// ------------------------------------------------------------------ when you're both free and around

/** Where you'll be that day: at a show you're on, else home. */
function myCountry(c: Career, day: Day): string {
  for (const s of showsOn(c, day)) if (s.card?.some((b) => b.a === c.player || b.b === c.player) || c.indie[s.id]) return s.country;
  return baseCountry(c);
}

/** Half-days this week you're free (resting, training or making content, nothing arranged) and they're around. */
export function freeSlots(c: Career, id: string, kind?: MeetKind): { day: Day; ph: PhaseName }[] {
  const out: { day: Day; ph: PhaseName }[] = [];
  const now = c.phase ?? 'am';
  for (let i = 0; i < MEET_RULES.ahead; i++) {
    const day = addDays(c.today, i);
    const them = whereIs(c, id, day);
    if (them.country !== myCountry(c, day)) continue;
    for (const ph of ['am', 'pm'] as PhaseName[]) {
      if (i === 0 && (ph === 'am' || now === 'pm')) continue;
      if (kind && !(MEETS[kind].ph as readonly string[]).includes(ph)) continue;
      if (meetsOf(c).some((m) => m.status === 'on' && m.day === day && m.ph === ph)) continue;
      if (!['rest', 'train', 'content'].includes(activityAt(c, day, ph))) continue;
      // They're on a show that night.
      if (them.at && ph === 'pm') continue;
      out.push({ day, ph });
    }
  }
  return out;
}

/** Whether they'll say yes, 0–1. */
function acceptChance(c: Career, id: string, kind: MeetKind, tone: Tone): number {
  const A = MEET_RULES.accept;
  const like = theirLike(c, id);
  let p = Math.max(A.min, Math.min(A.max, A.base + like * A.perLike));
  if (isFamily(id)) p = Math.max(p, A.family);
  if ((kind === 'gym' || kind === 'spots') && findWrestler(id)) p += respectOf(P(), id, c.player) / 300;
  if (kind === 'night' && moodOf(id) < 40) p *= A.lowMood;
  const recentNo = state(c).threads[id]?.msgs.some((m) => m.note?.startsWith('They said no') && daysBetween(m.day, c.today) <= A.declinedDays);
  if (recentNo) p *= A.declined;
  p *= 1 + ((TONE_FIT[tone] as Record<string, number>)[pvoice(id)] ?? 0) * A.tone;
  return Math.max(0, Math.min(1, p));
}

// ------------------------------------------------------------------ making plans (the phone)

registerTopics(
  {
    topic: 'invite',
    option: (c, id) => {
      const kinds = KINDS.filter((k) => (k !== 'gym' && k !== 'spots') || !!findWrestler(id) || P().folk?.[id]?.kind === 'trainer').filter((k) => k !== 'visit' || isFamily(id) || theirLike(c, id) >= 40);
      const slots = freeSlots(c, id);
      const label = 'Make plans';
      if (!slots.length) return { topic: 'invite', label, blocked: 'You’re not both free and around this week.' };
      return {
        topic: 'invite', label, groups: [
          { name: 'What', options: kinds.map((k) => ({ id: k, label: `${MEET_LABEL[k]}${MEETS[k].cost ? ` · ${money(costOf(c, k))}` : ''}` })) },
          { name: 'When', options: slots.map((s) => ({ id: `${s.day}@${s.ph}`, label: slotLabel(c, s.day, s.ph) })) },
          { name: 'Who pays', options: [{ id: 'split', label: 'Each their own' }, { id: 'me', label: 'My treat' }] },
        ],
      };
    },
    say: (c, _id, _tone, about, rnd) => { const [k, when] = (about ?? '').split('|'); const [day, ph] = (when ?? '').split('@'); return pickLine({ plain: ASK[(k as MeetKind) ?? 'drinks'] ?? ASK.drinks }, 'plain', rnd, { when: day ? slotLabel(c, day, ph as PhaseName) : 'soon' }); },
    guess: (c, id, tone, about) => { const k = ((about ?? '').split('|')[0] as MeetKind) || 'drinks'; return acceptChance(c, id, MEETS[k] ? k : 'drinks', tone) >= 0.7 ? 4 : acceptChance(c, id, MEETS[k] ? k : 'drinks', tone) >= 0.4 ? 1 : -3; },
    run: (c, id, tone, about, rnd) => {
      const [k, when, who] = (about ?? '').split('|') as [MeetKind, string, string];
      const [day, ph] = when.split('@') as [Day, PhaseName];
      const v = pvoice(id);
      if (!freeSlots(c, id, k).some((s) => s.day === day && s.ph === ph)) return { reply: pickLine(INVITE_ANSWER.busy, v, rnd, { where: whereIs(c, id, day).city ?? whereIs(c, id, day).country }), note: 'They said no: they’re busy then' };
      if (rnd() >= acceptChance(c, id, k, tone)) return { reply: pickLine(INVITE_ANSWER.no, v, rnd), note: 'They said no' };
      meetsOf(c).push({ id: `m${++c.seq}`, day, ph, with: id, kind: k, by: 'me', status: 'on', ...(who === 'me' ? { pay: true as const } : {}) });
      return { reply: pickLine(INVITE_ANSWER.yes, v, rnd), note: `${MEET_LABEL[k]}, ${slotLabel(c, day, ph)}: it’s in your week` };
    },
  },
  {
    topic: 'share',
    option: (c, id) => {
      const shows = shareable(c, id);
      return shows.length ? { topic: 'share', label: 'Share the drive', groups: [{ name: 'To', options: shows.map((s) => ({ id: s, label: `${c.shows[s]!.name} · ${fmtDay(c.shows[s]!.date, 'dm')}` })) }] } : null;
    },
    say: (c, _id, _t, about, rnd) => pickLine({ plain: ['We’re both on {show}. Share the drive? Halves on fuel.', 'Driving to {show}? Let’s go together.'] }, 'plain', rnd, { show: c.shows[about ?? '']?.name ?? 'the show' }),
    guess: (c, id) => (theirLike(c, id) >= 10 ? 4 : 0),
    run: (c, id, _t, about, rnd) => {
      const v = pvoice(id);
      if (theirLike(c, id) < 0 && rnd() < 0.7) return { reply: pickLine(INVITE_ANSWER.no, v, rnd), note: 'They said no' };
      share(c, about!, id);
      return { reply: pickLine(INVITE_ANSWER.yes, v, rnd), note: `Sharing the drive to ${c.shows[about!]?.name}: travel halved` };
    },
  },
  {
    topic: 'gift',
    option: (c, id) => (theirLike(c, id) >= 0 || isFamily(id) ? { topic: 'gift', label: 'Send them something', groups: [{ name: 'How much', options: GIFTS.amounts.map((a) => ({ id: String(a), label: money(a * COST_INDEX[baseRegion(c)]) })) }], ...(c.money < GIFTS.amounts[0]! ? { blocked: 'You can’t afford it.' } : {}) } : null),
    say: (c, id) => (birthdaySoon(c, id) ? `Happy birthday, ${first(id)}! Got you a little something.` : `Saw this and thought of you, ${first(id)}.`),
    guess: () => 6,
    run: (c, id, _t, about, rnd) => {
      const i = GIFTS.amounts.indexOf(Number(about));
      const cost = Math.round(Number(about) * COST_INDEX[baseRegion(c)]);
      if (c.money < cost) return { reply: '…', note: 'You couldn’t afford it' };
      spend(c, -cost, `A gift for ${nameOf(id)}`, 'event');
      const t = state(c).threads[id];
      const again = t?.msgs.some((m) => m.note?.includes('A gift') && daysBetween(m.day, c.today) < GIFTS.againDays);
      const like = Math.round((GIFTS.like[i] ?? 5) * (again ? GIFTS.again : 1) * (birthdaySoon(c, id) ? GIFTS.birthday : 1));
      moveRelation(c, id, like, birthdaySoon(c, id) ? 'A birthday present' : 'A gift');
      return { reply: pickLine(ASKED.gift_thanks, pvoice(id), rnd), note: `A gift (${money(cost)}) · they warmed to you` };
    },
  },
  {
    topic: 'borrow',
    option: (c, id) => {
      const b = bondOf(P(), c.player, id);
      if (!b || (theirLike(c, id) < BORROW.minLike && !isFamily(id))) return null;
      return { topic: 'borrow', label: 'Ask to borrow money', groups: [{ name: 'How much', options: BORROW.amounts.map((a) => ({ id: String(a), label: money(a) })) }], ...(c.loan ? { blocked: `You still owe ${nameOf(c.loan.from)}.` } : b.f < BORROW.minFam && !isFamily(id) ? { blocked: 'You don’t know them well enough to ask.' } : {}) };
    },
    say: (_c, _id, _t, about) => `This is awkward, but could you lend me ${money(Number(about))}? I’ll pay you back from my next fees.`,
    guess: () => 0,
    run: (c, id, _t, about, rnd) => {
      const amount = Number(about);
      const p = isFamily(id) ? BORROW.family : Math.min(0.95, BORROW.base + theirLike(c, id) * BORROW.perLike - amount / 5000);
      if (rnd() >= p) { moveRelation(c, id, -1, 'You asked to borrow money'); return { reply: pickLine(ASKED.borrow_no, pvoice(id), rnd), note: 'They said no' }; }
      spend(c, amount, `Borrowed from ${nameOf(id)}`, 'event');
      c.loan = { from: id, left: amount };
      return { reply: pickLine(ASKED.borrow_yes, pvoice(id), rnd), note: `+${money(amount)} · paid back from your fees` };
    },
  },
  {
    topic: 'payback',
    option: (c, id) => (c.lent?.some((l) => l.who === id) ? { topic: 'payback', label: 'Ask for your money back', ...(c.lent.some((l) => l.who === id && l.due <= c.today) ? {} : { blocked: 'It’s not due yet.' }) } : null),
    say: (c, id) => `Hey, about that ${money(c.lent!.find((l) => l.who === id)!.amount)}. Any chance?`,
    guess: () => -1,
    run: (c, id, _t, _a, rnd) => {
      const l = c.lent!.find((x) => x.who === id)!;
      l.chased = c.today;
      if (l.repay || rnd() < LEND.chaseYes * (theirLike(c, id) / 100 + 0.5)) { repaid(c, l); return { reply: pickLine(ASKED.pay_yes, pvoice(id), rnd), note: `+${money(l.amount)} back` }; }
      moveRelation(c, id, LEND.chaseLike, 'You chased them for money');
      return { reply: pickLine(ASKED.pay_no, pvoice(id), rnd), note: 'Still waiting' };
    },
  },
);

/** Shows in the next week you're both on (and you're paying your own way). */
function shareable(c: Career, id: string): string[] {
  return Object.values(c.shows).filter((s) => !s.done && s.date > c.today && s.date <= addDays(c.today, 7) && c.indie[s.id] && c.indie[s.id]!.travel > 0 && !c.shares?.[s.id]
    && s.card?.some((b) => b.a === id || b.b === id)).map((s) => s.id);
}
function share(c: Career, show: string, id: string): void {
  (c.shares ??= {})[show] = id;
  const d = c.indie[show];
  if (d) d.travel = Math.round(d.travel * (1 - SHARE.cut));
}
function birthdaySoon(c: Career, id: string): boolean {
  const md = c.people[id]?.birthday ?? P().folk?.[id]?.born?.slice(5);
  if (!md) return false;
  for (let i = -1; i <= 3; i++) if (addDays(c.today, i).slice(5) === md) return true;
  return false;
}

/** Call off plans. */
export function cancelMeet(c: Career, meetId: string): string {
  const m = meetsOf(c).find((x) => x.id === meetId && x.status === 'on');
  if (!m) return '';
  m.status = 'off';
  const late = daysBetween(c.today, m.day) < 1;
  moveRelation(c, m.with, late ? MEET_RULES.cancelLate : MEET_RULES.cancel, late ? 'You cancelled at the last minute' : 'You cancelled plans');
  add(c, m.with, { me: true, text: `Sorry, I’m going to have to cancel ${slotLabel(c, m.day, m.ph)}.` });
  return late ? 'Cancelled. Last minute, so they weren’t thrilled.' : 'Cancelled.';
}

// ------------------------------------------------------------------ on the day

/** Your half-day is someone's: go (or they flake, or you can't make it). */
function onPhase(c: Career, ph: PhaseName, activity: string): void {
  for (const m of meetsOf(c)) {
    if (m.status !== 'on' || m.day !== c.today || m.ph !== ph) continue;
    if (activity !== 'social') { stoodUp(c, m); continue; }
    happen(c, m);
  }
}

function stoodUp(c: Career, m: Meet): void {
  m.status = 'missed';
  moveRelation(c, m.with, MEET_RULES.missed, `You didn’t turn up for ${MEET_LABEL[m.kind].toLowerCase()}`);
  add(c, m.with, { sys: true, text: `You missed ${MEET_LABEL[m.kind].toLowerCase()} with ${first(m.with)}.` });
}

function happen(c: Career, m: Meet): void {
  const rnd = seededRng(hashSeed(c.seed, 'meet', m.id));
  const w = findWrestler(m.with);
  const F = MEET_RULES.flake;
  const flake = F.base + (w ? (hasTrait(w, 'unpredictable') ? F.unpredictable : 0) + (hasTrait(w, 'rebellious') ? F.rebellious : 0) + (hasTrait(w, 'hot_headed') ? F.hot_headed : 0) + (hasTrait(w, 'reliable') ? F.reliable : 0) + (hasTrait(w, 'professional') ? F.professional : 0) : 0);
  const hurt = !!c.people[m.with]?.injury;
  if (rnd() < flake || (hurt && (m.kind === 'gym' || m.kind === 'spots'))) {
    m.status = 'flaked';
    add(c, m.with, { text: pickLine(FLAKE, pvoice(m.with), rnd) });
    feelPair(P(), c.player, m.with, [MEET_RULES.flakeLike, 0], [0, 0], `${first(m.with)} pulled out`, c.today, { keep: 5 });
    bump(c.player, MEET_RULES.flakeMood);
    return;
  }
  m.status = 'done';
  const M = MEETS[m.kind];
  const cost = costOf(c, m.kind, m.pay);
  if (cost) spend(c, -cost, `${MEET_LABEL[m.kind]} with ${nameOf(m.with)}`, 'event');
  const like = M.like + (m.pay ? MEET_RULES.payLike : 0) + (hurt && m.kind === 'visit' ? MEET_RULES.hurt : 0);
  const where = whereIs(c, m.with, c.today).city ?? baseCountry(c);
  feelPair(P(), c.player, m.with, [Math.round(like * 0.7), M.respect], [like, M.respect], `${MEET_LABEL[m.kind]} in ${where}`, c.today, { keep: 5, fam: M.fam });
  const p = person(c, c.player);
  p.fatigue = Math.max(0, Math.min(100, p.fatigue + M.fatigue));
  bump(c.player, M.mood); bump(m.with, M.mood);
  const extra: string[] = [];
  if (m.kind === 'gym' || m.kind === 'spots') extra.push(`Training: ${trainSession(c)}`);
  if (m.purpose === 'intro' && m.promo) extra.push(introduce(c, m.promo, m.with));
  if (m.purpose === 'mentor') { const me = findWrestler(c.player)!; const k = (['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'] as const).reduce((a, b) => (me.stats[b] < me.stats[a] ? b : a)); me.stats[k] = Math.min(100, me.stats[k] + 1); extra.push(`+1 ${k} from their notes`); }
  add(c, m.with, { text: pickLine(AFTER[m.kind], pvoice(m.with), rnd) });
  add(c, m.with, { sys: true, text: [`${MEET_LABEL[m.kind]} in ${where}`, 'closer', cost ? `−${money(cost)}` : '', ...extra].filter(Boolean).join(' · ') });
}

/** A lift (or knock) to someone's wellbeing, there and then. */
function bump(id: string, d: number): void {
  if (!d) return;
  const L = ((P().lives ??= {})[id] ??= {});
  L.mood = Math.max(0, Math.min(100, (L.mood ?? 55) + d));
}

// ------------------------------------------------------------------ what people invite you to, and ask of you

const R = (id: string, label: string, detail: string) => ({ id, label, detail });

function invitations(c: Career): void {
  if (!phoneOn() || c.spectator || c.people[c.player]?.retired) return;
  const rnd = seededRng(hashSeed(c.seed, 'plans-in', c.today));
  repayments(c, rnd);
  birthdays(c);
  shareOffers(c, rnd);
  if (capLeft(c) <= 0 || rnd() >= PLANS_IN.daily) return;
  const me = findWrestler(c.player)!;
  const pool: { who: string; kind: MeetKind; purpose?: 'intro' | 'mentor'; promo?: string; text: string; w: number }[] = [];
  for (const b of bondsOf(P(), c.player)) {
    const id = b.other;
    const like = theirLike(c, id);
    if (like < 30 || b.bond.f < 25) continue;
    const w = findWrestler(id);
    const v = pvoice(id);
    if (isFamily(id)) { pool.push({ who: id, kind: 'visit', text: 'Come round for your tea this week, love. We never see you.', w: 1.5 }); continue; }
    if (P().folk?.[id]?.kind === 'trainer') { pool.push({ who: id, kind: 'spots', text: 'Come down the school, I’ll put you through your paces.', w: 0.6 }); continue; }
    if (!w) continue;
    // Your mentor, over a coffee (the old mentor check-in card).
    if (b.bond.mentor === id) pool.push({ who: id, kind: 'meal', purpose: 'mentor', text: 'Coffee this week? Want to go through your last few matches.', w: 1.2 });
    // A friend on another major can introduce you to their booker, over a drink (the old introduction card).
    const promo = w.promotion !== 'TIS' && w.promotion !== me.promotion ? w.promotion : undefined;
    const lastIntro = state(c).threads[id]?.msgs.some((m) => m.note?.includes('booker') && daysBetween(m.day, c.today) < PLANS_IN.introDays);
    if (promo && like >= 40 && !lastIntro && !c.scout?.[promo]?.intro && PROMOTIONS.some((p) => p.initials === promo && !p.indie)) pool.push({ who: id, kind: 'drinks', purpose: 'intro', promo, text: `Drinks this week? The ${promo} booker’s coming along. I’ll introduce you.`, w: 0.5 });
    // A friend fancies a night, a drink, a meal, the gym (the old training-partner card), running spots (help me get ready).
    const k: MeetKind = rnd() < 0.3 ? 'drinks' : rnd() < 0.5 ? 'meal' : rnd() < 0.6 ? 'night' : rnd() < 0.8 ? 'gym' : 'spots';
    pool.push({ who: id, kind: k, text: pickLine({ plain: ASK[k] }, v, rnd, { when: 'this week' }), w: 1 + like / 40 });
  }
  if (!pool.length) return;
  let r = rnd() * pool.reduce((t, x) => t + x.w, 0);
  const pick = pool.find((x) => (r -= x.w) <= 0) ?? pool[pool.length - 1]!;
  const slot = freeSlots(c, pick.who, pick.kind).filter((s) => s.day > c.today)[0];
  if (!slot) return;
  sendIn(c, pick.who, `${pick.text} (${slotLabel(c, slot.day, slot.ph)})`, [R('meet_yes', 'I’m in', `${MEET_LABEL[pick.kind]}${MEETS[pick.kind].cost ? ` · about ${money(costOf(c, pick.kind))}` : ''}`), R('meet_no', 'Can’t, sorry', 'They’ll be a bit put out')],
    undefined, { kind: pick.kind, day: slot.day, ph: slot.ph, ...(pick.purpose ? { purpose: pick.purpose } : {}), ...(pick.promo ? { promo: pick.promo } : {}) });
}

/** A friend on the same indie card offers to share the drive. */
function shareOffers(c: Career, rnd: () => number): void {
  for (const s of Object.values(c.shows)) {
    if (s.done || s.date <= c.today || s.date > addDays(c.today, 3) || !c.indie[s.id] || !(c.indie[s.id]!.travel > 0) || c.shares?.[s.id] || c.offered?.[s.id]) continue;
    const mate = s.card?.flatMap((b) => [b.a, b.b]).find((id) => id !== c.player && theirLike(c, id) >= SHARE.offerLike && (bondOf(P(), c.player, id)?.f ?? 0) >= SHARE.offerFam);
    if (!mate) continue;
    (c.offered ??= {})[s.id] = c.today;
    if (rnd() >= SHARE.offer) continue;
    sendIn(c, mate, pickLine(ASKED.share, pvoice(mate), rnd, { show: s.name }), [R('share_yes', 'Go on then', 'Travel halved · closer'), R('share_no', 'I’ll make my own way', '')], undefined, { show: s.id });
  }
}

/** Money you lent coming back (or not). Friends in trouble asking for some. */
function repayments(c: Career, rnd: () => number): void {
  for (const l of [...(c.lent ?? [])]) {
    if (l.due > c.today) continue;
    if (l.repay) { repaid(c, l); add(c, l.who, { text: pickLine(ASKED.pay_yes, pvoice(l.who), rnd) }); add(c, l.who, { sys: true, text: `${first(l.who)} paid you back ${money(l.amount)}.` }); }
    else if (!l.chased && daysBetween(l.due, c.today) === 0) add(c, l.who, { sys: true, text: `${first(l.who)} was meant to pay you back ${money(l.amount)} today.` });
  }
  // A friend in a hole asks to borrow (now and then, if there's room this week).
  if (capLeft(c) <= 0 || rnd() >= LEND.ask / 7) return;
  const friend = bondsOf(P(), c.player).find((b) => findWrestler(b.other) && theirLike(c, b.other) >= 40 && b.bond.f >= 40 && !c.lent?.some((l) => l.who === b.other)
    && (moodOf(b.other) < 45 || P().lives?.[b.other]?.goal?.kind === 'money' || c.people[b.other]?.injury));
  if (!friend) return;
  const amount = LEND.amounts[Math.floor(rnd() * LEND.amounts.length)]!;
  sendIn(c, friend.other, pickLine(ASKED.lend, pvoice(friend.other), rnd, { amount: money(amount) }), [R('lend_yes', `Lend them ${money(amount)}`, 'Closer · if they pay it back'), R('lend_no', 'Can’t, sorry', 'They cool on you a little')], undefined, { amount: String(amount) });
}
function repaid(c: Career, l: Lent): void {
  spend(c, l.amount, `${nameOf(l.who)} paid you back`, 'event');
  c.lent = (c.lent ?? []).filter((x) => x !== l);
}

/** Family and best friends' birthdays: a reminder two days out. */
function birthdays(c: Career): void {
  const soon = addDays(c.today, 2).slice(5);
  for (const b of bondsOf(P(), c.player)) {
    const id = b.other;
    if (!(isFamily(id) || (theirLike(c, id) >= 60 && b.bond.f >= 60))) continue;
    const md = c.people[id]?.birthday ?? P().folk?.[id]?.born?.slice(5);
    if (md === soon) add(c, id, { sys: true, text: `It’s ${first(id)}’s birthday on ${fmtDay(addDays(c.today, 2), 'long')}.` });
  }
}

// Answers.
registerReplies({
  meet_yes: (c, l) => {
    const x = l.ctx ?? {};
    const kind = x.kind as MeetKind;
    if (!freeSlots(c, x.who!, kind).some((s) => s.day === x.day && s.ph === x.ph)) { moveRelation(c, x.who!, -1, 'You couldn’t make it'); return 'You’re not free then any more.'; }
    meetsOf(c).push({ id: `m${++c.seq}`, day: x.day!, ph: x.ph as PhaseName, with: x.who!, kind, by: 'them', status: 'on', ...(x.purpose ? { purpose: x.purpose as 'intro' | 'mentor' } : {}), ...(x.promo ? { promo: x.promo } : {}) });
    moveRelation(c, x.who!, 1, 'You said yes');
    return `${MEET_LABEL[kind]}, ${slotLabel(c, x.day!, x.ph as PhaseName)}: it’s in your week.`;
  },
  meet_no: (c, l) => { moveRelation(c, l.ctx!.who!, -1, 'You said no'); return 'Another time.'; },
  share_yes: (c, l) => { share(c, l.ctx!.show!, l.ctx!.who!); moveRelation(c, l.ctx!.who!, 2, 'Sharing the drive'); return 'Travel halved.'; },
  share_no: () => 'You’ll make your own way.',
  lend_yes: (c, l) => {
    const who = l.ctx!.who!, amount = Number(l.ctx!.amount);
    if (c.money < amount) return 'You don’t have it to lend.';
    spend(c, -amount, `Lent to ${nameOf(who)}`, 'event');
    const w = findWrestler(who);
    const rnd = seededRng(hashSeed(c.seed, 'lend', who, c.today));
    const repay = rnd() < (w && hasTrait(w, 'reliable') ? LEND.reliable : w && hasTrait(w, 'mercenary') ? LEND.mercenary : LEND.repay);
    const weeks = LEND.weeks[0]! + Math.floor(rnd() * (LEND.weeks[1]! - LEND.weeks[0]! + 1));
    (c.lent ??= []).push({ who, amount, due: addDays(c.today, weeks * 7), repay });
    moveRelation(c, who, LEND.yesLike, 'You lent them money when they needed it');
    return `Lent. They say they’ll pay you back in ${weeks} weeks.`;
  },
  lend_no: (c, l) => { moveRelation(c, l.ctx!.who!, LEND.noLike, 'You wouldn’t lend them money'); return 'They understood. Sort of.'; },
});

/** After a show you shared the drive to: closer. */
function afterShow(c: Career, show: import('./types').Show): void {
  const who = c.shares?.[show.id];
  if (!who || !show.card?.some((b) => b.a === c.player || b.b === c.player)) return;
  if (show.card.some((b) => (b.a === c.player || b.b === c.player) && !b.result)) return;
  feelPair(P(), c.player, who, [SHARE.like, 0], [SHARE.like, 0], `Shared the drive to ${show.name}`, c.today, { keep: 5, fam: SHARE.fam });
  delete c.shares![show.id];
}

setCareerHooks({
  phase: onPhase,
  daily: (c) => {
    invitations(c);
    // Old plans and offers tidy themselves away.
    if (c.meets) c.meets = c.meets.filter((m) => m.status === 'on' || daysBetween(m.day, c.today) <= 30);
    if (c.offered) for (const [k, d] of Object.entries(c.offered)) if (daysBetween(d, c.today) > 10) delete c.offered[k];
  },
  bout: (c, show) => afterShow(c, show),
});
