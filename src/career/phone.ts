// The phone (Lyra's relationships redesign, stage 2). A thread with each person in your life: what you've said to
// each other, and the moments you've had in person (their notes, their call-outs, someone catching you backstage),
// so a thread reads as the story of the two of you. You start conversations: pick what it's about, then how you say
// it; they answer in their own voice, and how it lands depends on who they are, how they feel about you, and how
// well you know them (you can only guess how someone will take it if you know them). People message you too, paced
// by how close you are and capped each week: friends and family checking in, someone sharing big news, a young one
// after your advice, an enemy having a dig. Anything that wants an answer is a letter underneath (so ignoring it,
// your standing orders while you skip, and stopping a skip all work as they do for mail); the rest lives here.
import { findWrestler, hasTrait, TITLES } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondOf, bondsOf, likeOf, respectOf, type People } from '../world/people';
import { letter, person, setCareerHooks } from './career';
import { addDays, daysBetween, weekday, type Day } from './dates';
import { dealsOf } from './deals';
import { leanTo } from './leans';
import { isPhoneLetter, registerReplies } from './mail';
import { ANSWER, pickLine, SAY, SENT, TOPIC_LABEL, VIEW_OF, type BaseTopic, type PVoice, type Reaction, type Tone, type Topic } from './phoneLines';
import { moveRelation, readOf, relationOf } from './relations';
import { heardOf } from './scouting';
import { FEATURES, GOAT_TONE, MAIL_IGNORE_DAYS, PHONE, PHONE_IN, PHONE_REPLY, TONE_FIT } from './tuning';
import { TIPS, voiceOf } from './voice';
import type { Career, Letter, MailReply } from './types';

export type { Tone, Topic } from './phoneLines';
export { TONE_LABEL, TOPIC_LABEL } from './phoneLines';

/** One line in a thread: yours or theirs, and (under a reply) what came of it; or a line from the phone itself (a reminder, a plan). */
export interface PhoneMsg { n: number; day: Day; me?: true; sys?: true; text: string; note?: string }
export interface PhoneThread { msgs: PhoneMsg[]; seen: number; sent?: Day[]; asked?: Record<string, Day> }
export interface PhoneState {
  threads: Record<string, PhoneThread>;
  /** What people have sent you this week (Monday to Sunday), for the cap. */
  week?: Day;
  incoming: number;
  /** News that happened to someone close (their injury), waiting to be sent. */
  q?: { who: string; kind: 'hurt' }[];
}

const KEEP = 40;
const P = (): People => activeWorld().people!;
export const phoneOn = (): boolean => FEATURES.phone;
export const state = (c: Career): PhoneState => (c.phone ??= { threads: {}, incoming: 0 });
const thread = (c: Career, id: string): PhoneThread => (state(c).threads[id] ??= { msgs: [], seen: 0 });
export const nameOf = (id: string): string => findWrestler(id)?.name ?? P().staff[id]?.name ?? P().folk?.[id]?.name ?? id;
export const first = (id: string): string => { const n = nameOf(id).replace(/"[^"]*"\s*/g, ''); return P().folk?.[id] ? n.split(' ')[0]! : n.split(' ')[0]!; };
/** The number in a letter's id (they share the counter with phone lines, so a thread can be put in order). */
const seqOf = (l: Letter): number => Number(l.id.slice(1)) || 0;
const mondayOf = (d: Day) => addDays(d, -((weekday(d) + 6) % 7));

/** Their voice on the phone: family have their own; a trainer talks like a pro. */
export function pvoice(id: string): PVoice {
  const f = P().folk?.[id];
  if (f) return f.kind === 'family' ? 'fam' : 'pro';
  return voiceOf(id);
}

// ------------------------------------------------------------------ threads

/** People you can message: anyone you know at least a little. */
export function contacts(c: Career): string[] {
  const out = bondsOf(P(), c.player).filter((b) => b.bond.f >= PHONE.knowAt && !P().lives?.[b.other]?.died && !P().folk?.[b.other]?.died && (findWrestler(b.other) || P().staff[b.other] || P().folk?.[b.other]));
  const close = (b: (typeof out)[number]) => (b.bond.a === c.player ? b.bond.lb : b.bond.la) + b.bond.f;
  return out.sort((a, b) => close(b) - close(a)).map((b) => b.other);
}

export type ThreadItem = { n: number; day: Day; msg?: PhoneMsg; letter?: Letter };

/** Everything between you and someone, oldest first. */
export function threadOf(c: Career, id: string): ThreadItem[] {
  const t = state(c).threads[id];
  const items: ThreadItem[] = (t?.msgs ?? []).map((m) => ({ n: m.n, day: m.day, msg: m }));
  for (const l of c.letters) if (l.fromId === id && isPhoneLetter(l)) items.push({ n: seqOf(l), day: l.day, letter: l });
  return items.sort((a, b) => a.n - b.n);
}

/** Threads with something in them, latest first, with how many unread. */
export function threadList(c: Career): { id: string; last: ThreadItem; unread: number; waiting: boolean }[] {
  const ids = new Set(Object.keys(state(c).threads));
  for (const l of c.letters) if (l.fromId && isPhoneLetter(l)) ids.add(l.fromId);
  return [...ids].map((id) => {
    const items = threadOf(c, id);
    const t = state(c).threads[id];
    const unread = items.filter((x) => (x.msg ? !x.msg.me && x.n > (t?.seen ?? 0) : !x.letter!.read)).length;
    const waiting = items.some((x) => x.letter && ((x.letter.replies?.length && !x.letter.replied && !x.letter.done) || (x.letter.action && !x.letter.done)));
    return { id, last: items[items.length - 1]!, unread, waiting };
  }).filter((x) => x.last).sort((a, b) => b.last.n - a.last.n);
}

export const phoneUnread = (c: Career): number => (phoneOn() ? threadList(c).reduce((t, x) => t + x.unread, 0) : 0);

/** You've opened their thread: it's all read. */
export function markRead(c: Career, id: string): void {
  const items = threadOf(c, id);
  const t = thread(c, id);
  t.seen = Math.max(t.seen, ...items.map((x) => x.n), 0);
  for (const x of items) if (x.letter) x.letter.read = true;
}

export function add(c: Career, id: string, m: Omit<PhoneMsg, 'n' | 'day'>): PhoneMsg {
  const t = thread(c, id);
  const msg: PhoneMsg = { n: ++c.seq, day: c.today, ...m };
  t.msgs.push(msg);
  if (t.msgs.length > KEEP) t.msgs.splice(0, t.msgs.length - KEEP);
  return msg;
}

// ------------------------------------------------------------------ what you can talk about

export interface TopicOption {
  topic: Topic; label: string; blocked?: string;
  /** Ask about someone: who. Put a word in: where. */
  about?: string[];
  /** Topics with more to pick (plans: what, when, who pays): one from each group, joined with '|' as the `about`. */
  groups?: { name: string; options: { id: string; label: string }[] }[];
}

/** A topic another stage adds (plans, romance, rumours): whether it's on, what you'd say, how it might land, and doing it. */
export interface TopicHandler {
  topic: Topic;
  option: (c: Career, id: string) => TopicOption | null;
  say: (c: Career, id: string, tone: Tone, about: string | undefined, rnd: () => number) => string;
  /** Roughly how far it'd move how they feel about you (for the guess). */
  guess: (c: Career, id: string, tone: Tone, about: string | undefined) => number;
  run: (c: Career, id: string, tone: Tone, about: string | undefined, rnd: () => number) => { reply: string; note: string };
}
const HANDLERS: TopicHandler[] = [];
export const registerTopics = (...h: TopicHandler[]): void => { HANDLERS.push(...h); };
const handlerOf = (t: Topic) => HANDLERS.find((h) => h.topic === t);

/** Someone you both know (for asking what they make of someone). */
function sharedPeople(c: Career, id: string): string[] {
  const mine = new Set(bondsOf(P(), c.player).filter((b) => b.bond.f >= PHONE.knowAt && findWrestler(b.other)).map((b) => b.other));
  return bondsOf(P(), id).filter((b) => b.other !== c.player && mine.has(b.other) && b.bond.f >= PHONE.knowAt).sort((a, b) => b.bond.f - a.bond.f).slice(0, 8).map((b) => b.other);
}

/** Their good news lately (a title, a move, a win), and their bad (an injury, a loss). */
function newsOf(c: Career, id: string): { good?: string; bad?: string } {
  const p = c.people[id];
  const w = findWrestler(id);
  const sh = (P().lives?.[id]?.shocks ?? []).filter((s) => s.until > c.today);
  const life = { good: sh.find((s) => s.k === 'baby' || s.k === 'wedding'), bad: sh.find((s) => ['grief', 'ill', 'heartbreak', 'death'].includes(s.k)) };
  if (!p || !w) return { ...(life.good ? { good: 'their news' } : {}), ...(life.bad ? { bad: 'what they’re going through' } : {}) };
  const title = TITLES.find((t) => t.holder === id && daysBetween(c.titles[t.id]?.since ?? '1900-01-01', c.today) <= 14);
  const moved = (p.moves ?? []).some((d) => daysBetween(d, c.today) <= 14) && w.promotion !== 'TIS';
  const won = p.last && daysBetween(p.last, c.today) <= 3 && p.recent?.at(-1) === 1;
  const lost = p.last && daysBetween(p.last, c.today) <= 3 && p.recent?.at(-1) === 0;
  return {
    ...(title ? { good: `winning the ${title.name}` } : moved ? { good: `signing with ${w.promotion}` } : won ? { good: 'the win' } : {}),
    ...(p.injury ? { bad: 'the injury' } : lost ? { bad: 'the loss' } : life.bad ? { bad: 'what they’re going through' } : {}),
    ...(!title && !moved && !won && life.good ? { good: 'their news' } : {}),
  };
}

/** What you could message someone about right now, and why not where you can't. */
export function topicsFor(c: Career, id: string): TopicOption[] {
  const r = relationOf(c, id);
  const folk = P().folk?.[id];
  const news = newsOf(c, id);
  const t = state(c).threads[id];
  const out: TopicOption[] = [{ topic: 'catchup', label: TOPIC_LABEL.catchup }];
  out.push({ topic: 'congrats', label: TOPIC_LABEL.congrats, ...(news.good ? {} : { blocked: 'Nothing to congratulate them on lately.' }) });
  out.push({ topic: 'console', label: TOPIC_LABEL.console, ...(news.bad ? {} : { blocked: 'Nothing’s gone wrong for them lately.' }) });
  if (!folk || folk.kind === 'trainer') out.push({ topic: 'advice', label: TOPIC_LABEL.advice });
  if (!folk) {
    const who = sharedPeople(c, id);
    out.push({ topic: 'gossip', label: TOPIC_LABEL.gossip, about: who, ...(who.length ? {} : { blocked: 'You don’t know anyone in common.' }) });
    const w = findWrestler(id);
    const mine = dealsOf(c.people[c.player]).map((k) => k.promo);
    const promos = w ? [w.promotion, ...(w.also ?? [])].filter((x) => x !== 'TIS' && !mine.includes(x)) : [];
    const asked = promos.filter((x) => !t?.asked?.[x] || daysBetween(t.asked[x]!, c.today) >= PHONE.favourDays);
    out.push({ topic: 'word', label: TOPIC_LABEL.word, about: asked, ...(!promos.length ? { blocked: 'They’re not on a roster you could use a word with.' } : !asked.length ? { blocked: 'You’ve asked them lately.' } : {}) });
  }
  const sour = (r?.v ?? 0) < 0 || (r?.log ?? []).some((l) => (l.d ?? 0) < 0 && daysBetween(l.day, c.today) <= 60);
  out.push({ topic: 'sorry', label: TOPIC_LABEL.sorry, ...(sour ? {} : { blocked: 'Nothing to apologise for.' }) });
  if (!folk) out.push({ topic: 'goat', label: TOPIC_LABEL.goat });
  for (const h of HANDLERS) { const o = h.option(c, id); if (o) out.push(o); }
  return out;
}

// ------------------------------------------------------------------ how it lands

/** How a tone lands with them (−1 to +1 or so). */
function fit(c: Career, id: string, tone: Tone): number {
  const v = pvoice(id);
  const F = TONE_FIT[tone] as Record<string, number>;
  let f = F[v] ?? 0;
  const theirs = likeOf(P(), id, c.player);
  if (tone === 'cocky' && theirs >= 40) f += F.friends ?? 0;
  if (theirs < 0) f += F.dislikes ?? 0;
  return f;
}

/** How much a message would move how they feel about you (before chance), and what it does besides. */
function outcome(c: Career, id: string, topic: BaseTopic, tone: Tone): { like: number; respect: number } {
  const T = PHONE.topic[topic];
  const theirs = likeOf(P(), id, c.player);
  const w = findWrestler(id);
  const f = fit(c, id, tone);
  let like = T.like, respect = T.respect;
  if (topic === 'goat') return { like: Math.round(T.like * GOAT_TONE[tone]), respect: T.respect };
  if (topic === 'sorry') {
    if (theirs >= 0) return { like: 1, respect: 0 };
    const grudge = w ? (hasTrait(w, 'hot_headed') ? 0.6 : 1) * (hasTrait(w, 'egotistical') ? 0.7 : 1) * (hasTrait(w, 'team_player') ? 1.3 : 1) * (hasTrait(w, 'professional') ? 1.1 : 1) : 1;
    like = (-theirs * PHONE.sorryShare + T.like) * grudge;
  }
  if (topic === 'advice' && w && hasTrait(w, 'mentor')) like += 3;
  if (topic === 'gossip') { const v = pvoice(id); like = v === 'sly' ? 3 : v === 'pro' ? -1 : T.like; }
  // Pestering: a second message today counts for less; a third and more is too much.
  const today = (state(c).threads[id]?.sent ?? []).filter((d) => d === c.today).length;
  if (today >= PHONE.pester - 1) return { like: PHONE.pesterLike, respect: 0 };
  const mult = today ? PHONE.again : 1;
  return { like: like * (1 + f) * mult, respect: respect * mult };
}

export type Guess = 'unknown' | 'good' | 'fine' | 'risky' | 'bad';
export const GUESS_TEXT: Record<Guess, string> = {
  unknown: 'You don’t know them well enough to guess how they’ll take it.', good: 'They’ll like that.', fine: 'Should be fine.', risky: 'Could go either way.', bad: 'They won’t like that.',
};

/** What you'd say, and your guess at how it'll land (as good as how well you know them). */
export function preview(c: Career, id: string, topic: Topic, tone: Tone, about?: string): { text: string; guess: Guess } {
  const rnd = seededRng(hashSeed(c.seed, 'say', id, topic, tone, c.today));
  const h = handlerOf(topic);
  const text = h ? h.say(c, id, tone, about, rnd) : pickLine({ plain: SAY[topic as BaseTopic][tone] }, 'plain', rnd, vars(c, id, about));
  const read = readOf(relationOf(c, id));
  const o = h ? h.guess(c, id, tone, about) : outcome(c, id, topic as BaseTopic, tone).like;
  const guess: Guess = read === 'none' ? 'unknown' : o >= 4 ? 'good' : o >= 1 ? 'fine' : o > -3 ? 'risky' : 'bad';
  // A rough read is only a rough read.
  return { text, guess: read === 'rough' && (guess === 'good' || guess === 'bad') ? (guess === 'good' ? 'fine' : 'risky') : guess };
}

const vars = (c: Career, id: string, about?: string) => ({ them: first(id), who: about ? nameOf(about) : 'them', promo: about ?? '', you: findWrestler(c.player)?.name ?? '' });

/** Send it: you say it, they answer in their voice, and how they feel moves. Returns their reply. */
export function send(c: Career, id: string, topic: Topic, tone: Tone, about?: string): PhoneMsg | null {
  const opt = topicsFor(c, id).find((x) => x.topic === topic);
  if (!opt || opt.blocked) return null;
  if ((topic === 'gossip' || topic === 'word') && (!about || !opt.about?.includes(about))) return null;
  if (opt.groups && (!about || about.split('|').length < opt.groups.length || opt.groups.some((g, i) => !g.options.some((x) => x.id === about.split('|')[i])))) return null;
  const t = thread(c, id);
  const rnd = seededRng(hashSeed(c.seed, 'send', id, topic, tone, c.today, t.msgs.length));
  const { text } = preview(c, id, topic, tone, about);
  add(c, id, { me: true, text });
  const h = handlerOf(topic);
  if (h) {
    t.sent = [...(t.sent ?? []), c.today].slice(-5);
    const r = h.run(c, id, tone, about, rnd);
    return add(c, id, { text: r.reply, note: r.note });
  }
  const o = outcome(c, id, topic as BaseTopic, tone);
  const like = Math.round(o.like + rnd() * PHONE.noise * 2 - PHONE.noise);
  const respect = Math.round(o.respect);
  t.sent = [...(t.sent ?? []), c.today].slice(-5);
  const v = pvoice(id);
  const vv = vars(c, id, about);
  const reaction: Reaction = topic === 'goat' ? goatReaction(id) : like >= PHONE.good ? 'good' : like <= PHONE.bad ? 'bad' : 'meh';
  let reply: string;
  const extra: string[] = [];
  if (topic === 'gossip' && about) {
    if (reaction === 'bad') reply = pickLine(ANSWER.gossip.bad!, v, rnd, vv);
    else {
      const l = likeOf(P(), id, about);
      reply = pickLine(VIEW_OF[l >= 25 ? 'fond' : l <= -25 ? 'cold' : 'neutral'], v, rnd, vv);
      extra.push(l >= 25 ? `They like ${nameOf(about)}` : l <= -25 ? `They can’t stand ${nameOf(about)}` : `They’re not bothered about ${nameOf(about)}`);
    }
  } else if (topic === 'word' && about) {
    const p = Math.max(PHONE.word.min, Math.min(PHONE.word.max, ((likeOf(P(), id, c.player) + respectOf(P(), id, c.player) / 2) / PHONE.word.per) * (1 + fit(c, id, tone))));
    const yes = rnd() < p;
    reply = pickLine(ANSWER.word[yes ? 'good' : 'bad']!, v, rnd, vv);
    t.asked = { ...(t.asked ?? {}), [about]: c.today };
    if (yes) { heardOf(c, about, `${nameOf(id)} put a word in`); extra.push(`${about} have heard about you now`); }
  } else if (topic === 'advice' && reaction !== 'bad') {
    reply = `${pickLine(ANSWER.advice.good!, v, rnd, vv)} ${pvoice(id) === 'fam' ? '' : tip(c)}`.trim();
    leanTo(c, 'team_player', 2);
  } else {
    const A = ANSWER[topic as BaseTopic];
    const bank = A[reaction] ?? A.meh ?? A.good!;
    reply = pickLine(bank, v, rnd, vv);
  }
  // How they feel about you moves (and you a little about them); what they say back is what it was.
  const why = topic === 'goat' ? 'You had a go at them' : topic === 'sorry' ? 'You apologised' : `Messaged: ${TOPIC_LABEL[topic].toLowerCase()}`;
  if (like) moveRelation(c, id, like, why, topic === 'goat' ? 'rival' : undefined);
  if (respect) { const b = bondOf(P(), c.player, id); if (b) { if (b.a === id) b.ra = clamp(b.ra + respect); else b.rb = clamp(b.rb + respect); } }
  if (topic === 'goat') { leanTo(c, 'hot_headed', 4); if (reaction === 'bad' && findWrestler(id) && hasTrait(findWrestler(id)!, 'hot_headed')) moveRelation(c, id, -4, 'It escalated'); }
  if (tone === 'cocky') leanTo(c, 'showboat', 1);
  if (tone === 'warm') leanTo(c, 'team_player', 1);
  const read = readOf(relationOf(c, id));
  const felt = read === 'none' ? 'Hard to tell how that landed.' : like >= PHONE.good ? 'They warmed to you.' : like <= PHONE.bad ? 'They cooled on you.' : 'No real change.';
  return add(c, id, { text: reply, note: [felt, ...extra].join(' · ') });
}
const clamp = (v: number) => Math.max(-100, Math.min(100, Math.round(v)));

/** Having a go: hot-heads come back at you, egotists sneer, the decent ones take it on board. */
function goatReaction(id: string): Reaction {
  const w = findWrestler(id);
  if (!w) return 'meh';
  if (hasTrait(w, 'hot_headed') || hasTrait(w, 'politician') || hasTrait(w, 'dirty_fighter')) return 'bad';
  if (hasTrait(w, 'team_player') || hasTrait(w, 'professional')) return 'good';
  return 'meh';
}

/** Something to work on, from your recent matches (the weakest part of them). */
function tip(c: Career): string {
  const graded = c.history.filter((x) => x.grades?.length).slice(0, 6);
  if (!graded.length) return TIPS[0]!;
  const sums = [0, 1, 2, 3, 4].map((i) => graded.reduce((t, x) => t + (x.grades![i] ?? 0), 0));
  return TIPS[sums.indexOf(Math.min(...sums))]!;
}

// ------------------------------------------------------------------ what people send you

const R = (id: string, label: string, detail: string): MailReply => ({ id, label, detail });

/** A message from someone that wants an answer (a letter underneath: ignoring it, standing orders and skip stops just work). */
export function sendIn(c: Career, who: string, text: string, replies: MailReply[], ignore?: 'friend' | 'rival', ctx?: Record<string, string>): void {
  letter(c, {
    kind: 'person', from: nameOf(who), fromId: who, subject: text.length > 48 ? `${text.slice(0, 46)}…` : text, body: [text], ctx: { who, ...(ctx ?? {}) }, replies,
    ...(ignore ? { ignore: { by: addDays(c.today, MAIL_IGNORE_DAYS[ignore]), kind: ignore } } : {}),
  });
  state(c).incoming++;
}

const theirLike = (c: Career, id: string) => likeOf(P(), id, c.player);
/** Room left under this week's cap for what people send you. */
export function capLeft(c: Career): number {
  const S = state(c);
  if (S.week !== mondayOf(c.today)) { S.week = mondayOf(c.today); S.incoming = 0; }
  return PHONE_IN.weekCap - S.incoming;
}

/** Today's messages: news first (theirs), then whoever's moved to get in touch. Paced by closeness, capped weekly. */
function incoming(c: Career): void {
  if (!phoneOn() || c.spectator || c.people[c.player]?.retired) return;
  const S = state(c);
  if (S.week !== mondayOf(c.today)) { S.week = mondayOf(c.today); S.incoming = 0; }
  const rnd = seededRng(hashSeed(c.seed, 'phone-in', c.today));
  const I = PHONE_IN;
  const mine = bondsOf(P(), c.player).filter((b) => findWrestler(b.other) || P().staff[b.other] || P().folk?.[b.other]);
  const close = mine.filter((b) => theirLike(c, b.other) >= I.closeLike && b.bond.f >= I.closeFam).map((b) => b.other);
  // Their news, from someone close: a title, a move, an injury (these don't wait on the cap).
  const yesterday = addDays(c.today, -1);
  const H = activeWorld().history.events;
  for (let i = H.length - 1; i >= 0 && H[i]!.day >= yesterday; i--) {
    const e = H[i]!;
    if (!e.who || !close.includes(e.who) || e.day !== yesterday) continue;
    if (e.kind === 'title') sendIn(c, e.who, pickLine(SENT.title, pvoice(e.who), rnd), [R('happy', 'So happy for you', 'Closer'), R('jealous', 'About time someone gave you one', 'Cocky · they cool on you')]);
    if (e.kind === 'signed' || e.kind === 'poached') sendIn(c, e.who, pickLine(SENT.signed, pvoice(e.who), rnd, { promo: e.promo ?? '' }), [R('happy', 'Brilliant news', 'Closer'), R('brief', 'Nice one', 'A little closer')]);
  }
  for (const q of S.q ?? []) if (close.includes(q.who)) sendIn(c, q.who, pickLine(SENT.hurt, pvoice(q.who), rnd), [R('there', 'Anything you need, I’m here', 'Closer · loyal'), R('brief', 'Heal up quick', 'A little closer')]);
  S.q = [];
  if (S.incoming >= I.weekCap) return;
  // Otherwise: a chance today, more the more close people you have.
  if (rnd() >= I.daily + I.perFriend * Math.min(I.friendsMax, close.length)) return;
  const me = findWrestler(c.player)!;
  const pool: { who: string; kind: 'checkin' | 'advice' | 'dig'; w: number }[] = [];
  for (const b of mine) {
    const id = b.other;
    const like = theirLike(c, id);
    const w = findWrestler(id);
    if (like >= I.closeLike && b.bond.f >= I.closeFam) pool.push({ who: id, kind: 'checkin', w: 1 + like / 30 + (P().folk?.[id]?.kind === 'family' ? 1 : 0) + (w && (hasTrait(w, 'team_player') || hasTrait(w, 'showboat')) ? 0.5 : 0) });
    if (w && like <= I.digLike && b.bond.f >= 20 && ['hot', 'cocky', 'sly'].includes(voiceOf(id))) pool.push({ who: id, kind: 'dig', w: 1 + (-like - 50) / 25 });
    if (w && w.age <= I.askAge && w.age < me.age - 3 && respectOf(P(), id, c.player) >= I.askRespect && b.bond.f >= 15) pool.push({ who: id, kind: 'advice', w: 0.7 });
  }
  if (!pool.length) return;
  let r = rnd() * pool.reduce((t, x) => t + x.w, 0);
  const pick = pool.find((x) => (r -= x.w) <= 0) ?? pool[pool.length - 1]!;
  const v = pvoice(pick.who);
  if (pick.kind === 'checkin') {
    const fam = P().folk?.[pick.who]?.kind === 'family';
    sendIn(c, pick.who, pickLine(SENT.checkin, v, rnd), [R('chat', fam ? 'Ring them back for a proper chat' : 'Have a proper chat', 'Closer'), R('brief', 'All good, ta', 'A little closer'), ...(fam ? [] : [R('tease', 'Wind them up', 'Friends laugh; others don’t')])],
      fam || theirLike(c, pick.who) >= 60 ? 'friend' : undefined);
  } else if (pick.kind === 'dig') {
    sendIn(c, pick.who, pickLine(SENT.dig, v, rnd), [R('rise', 'Rise above it', 'Professional'), R('fire_back', 'Fire back', 'It gets worse · hot-headed'), R('laugh_off', 'Laugh at them', 'Showboat · they cool further')], 'rival');
  } else {
    sendIn(c, pick.who, pickLine(SENT.advice, v, rnd), [R('help', 'Sit down with them properly', 'Closer · mentor'), R('tip', 'A quick tip', 'A little closer'), R('brush', 'Figure it out yourself', 'They cool on you')]);
  }
}

// Answers to what people send you.
const rel = (c: Career, l: Letter, d: number, why: string, kind?: 'rival' | 'protege') => { if (l.ctx?.who) moveRelation(c, l.ctx.who, d, why, kind); };
registerReplies({
  chat: (c, l) => { rel(c, l, PHONE_REPLY.chat, 'A proper chat'); leanTo(c, 'team_player', 2); return 'A good catch-up.'; },
  brief: (c, l) => { rel(c, l, PHONE_REPLY.brief, 'A quick reply'); return 'Short and sweet.'; },
  tease: (c, l) => { const friends = theirLike(c, l.ctx?.who ?? '') >= 40; rel(c, l, friends ? PHONE_REPLY.tease : PHONE_REPLY.teaseCold, 'You wound them up'); leanTo(c, 'showboat', 2); return friends ? 'They gave as good as they got.' : 'That didn’t land.'; },
  happy: (c, l) => { rel(c, l, PHONE_REPLY.happy, 'Happy for them'); leanTo(c, 'team_player', 2); return 'They loved that.'; },
  jealous: (c, l) => { rel(c, l, PHONE_REPLY.jealous, 'A dig at their news'); leanTo(c, 'egotistical', 3); return 'That stung.'; },
  there: (c, l) => { rel(c, l, PHONE_REPLY.there, 'There for them'); leanTo(c, 'loyal', 2); return 'It meant a lot.'; },
  help: (c, l) => {
    const who = l.ctx?.who;
    const close = who ? (bondOf(P(), c.player, who)?.f ?? 0) >= 30 : false;
    rel(c, l, PHONE_REPLY.help, 'You gave them real advice', close ? 'protege' : undefined); leanTo(c, 'mentor', 10);
    return close ? 'An hour on the phone. You’re their mentor now.' : 'An hour on the phone. They’ll remember it.';
  },
  tip: (c, l) => { rel(c, l, PHONE_REPLY.tip, 'You gave them a tip'); leanTo(c, 'mentor', 4); return 'A quick word.'; },
  brush: (c, l) => { rel(c, l, PHONE_REPLY.brush, 'You brushed them off'); leanTo(c, 'egotistical', 3); return 'They won’t ask again.'; },
  rise: (c) => { leanTo(c, 'professional', 3); person(c, c.player).rep = Math.min(100, person(c, c.player).rep + 0.5); return 'You didn’t bite. People noticed.'; },
  fire_back: (c, l) => { rel(c, l, PHONE_REPLY.fireBack, 'You fired back', 'rival'); leanTo(c, 'hot_headed', 4); return 'It’s nasty now.'; },
  laugh_off: (c, l) => { rel(c, l, PHONE_REPLY.laughOff, 'You laughed at them'); leanTo(c, 'showboat', 2); return 'They hated that.'; },
});

setCareerHooks({
  daily: incoming,
  // Someone close getting hurt: they'll tell you.
  injured: (c, id) => { if (phoneOn() && id !== c.player && theirLike(c, id) >= PHONE_IN.closeLike) (state(c).q ??= []).push({ who: id, kind: 'hurt' }); },
});

