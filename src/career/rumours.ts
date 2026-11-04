// Gossip and angles (Lyra's relationships redesign, stage 6). The rumour mill: true stories (a new couple, someone
// badmouthing someone, someone wanting out, the booker's pet) and false ones (liars about people they can't stand)
// spread through who knows whom, each week, friend to friend; people believe friends more; believing one moves how
// they feel (the one badmouthed, the one cheated on, a booker told someone's leaving). When one reaches you, a friend
// tells you: about you, deny it, confront whoever started it, or let it go; about someone else, believe it, pass it
// on, or dismiss it. You can start one yourself, but it can be traced back to you. Angles: a booker turns real heat
// into the storyline, and best friends are kept apart (on-screen allies).
import { findWrestler, hasTrait, PROMOTIONS } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondsOf, bookerOf, feelPair, kindOf, likeOf, together, type People } from '../world/people';
import { setAngles } from './booker';
import { letter, setCareerHooks } from './career';
import { daysBetween, weekday, type Day } from './dates';
import { dealsOf } from './deals';
import { leanTo } from './leans';
import { registerReplies } from './mail';
import { phoneOn, pvoice, registerTopics, sendIn } from './phone';
import { pickLine } from './phoneLines';
import { moveRelation } from './relations';
import { ANGLES, RUMOURS } from './tuning';
import { voiceOf } from './voice';
import type { Career } from './types';

export type RumourKind = 'dating' | 'cheating' | 'badmouth' | 'leaving' | 'favourite' | 'faking' | 'drunk';
/** A story going round: about whom (and who else), true or not, who started it, who's heard it. */
export interface Rumour { id: string; kind: RumourKind; a: string; b?: string; promo?: string; truth: boolean; by: string; day: Day; heard: string[]; dead?: true; traced?: true }

const P = (): People => activeWorld().people!;
const nameOf = (id: string) => findWrestler(id)?.name ?? P().staff[id]?.name ?? P().folk?.[id]?.name ?? id;
const R = RUMOURS;
export const rumoursOf = (c: Career): Rumour[] => (c.rumours ??= []);

/** What it says. */
export function claim(r: Rumour, c?: Career): string {
  const a = r.a === c?.player ? 'you' : nameOf(r.a), b = r.b ? (r.b === c?.player ? 'you' : nameOf(r.b)) : '';
  const own = a === 'you';
  switch (r.kind) {
    case 'dating': return `${own ? 'You’re' : `${a} is`} seeing ${b}`;
    case 'cheating': return `${own ? 'You’ve' : `${a} has`} been cheating on ${b}`;
    case 'badmouth': return `${own ? 'You’ve' : `${a} has`} been badmouthing ${b} to the office`;
    case 'leaving': return `${own ? 'You’re' : `${a} is`} trying to get out of ${r.promo}`;
    case 'favourite': return `${own ? 'You’re' : `${a} is`} the booker’s pet`;
    case 'faking': return `${own ? 'Your' : `${a}’s`} injury isn’t as bad as ${own ? 'you’re' : 'they’re'} making out`;
    default: return `${own ? 'You' : a} got thrown out of a bar after the show`;
  }
}

function start(c: Career, r: Omit<Rumour, 'id' | 'day' | 'heard'>, heard: string[]): Rumour | null {
  const all = rumoursOf(c);
  if (all.some((x) => !x.dead && x.kind === r.kind && x.a === r.a && x.b === r.b)) return null;
  const x: Rumour = { id: `r${++c.seq}`, day: c.today, heard: [...new Set(heard)], ...r };
  all.push(x);
  if (all.length > R.keep) all.splice(0, all.length - R.keep);
  return x;
}

// ------------------------------------------------------------------ where they come from

/** Each week: true stories arise from what's going on; liars make some up about people they can't stand. */
function arise(c: Career, rnd: Rng): void {
  const P0 = P();
  const recent = (d: Day) => daysBetween(d, c.today) <= 7;
  for (const x of Object.values(P0.bonds)) {
    // A new couple.
    if (x.love?.st === 'dating' && recent(x.love.since) && findWrestler(x.a) && findWrestler(x.b) && rnd() < R.arise) start(c, { kind: 'dating', a: x.a, b: x.b, truth: true, by: x.a }, [x.a]);
  }
  for (const p of PROMOTIONS.filter((y) => !y.indie)) {
    const bk = bookerOf(P0, p.initials);
    if (!bk) continue;
    for (const { other, bond } of bondsOf(P0, bk.id)) {
      const w = findWrestler(other);
      if (!w || w.promotion !== p.initials) continue;
      const fond = bond.a === bk.id ? bond.la : bond.lb;
      if (fond >= 60 && rnd() < R.arise / 10) start(c, { kind: 'favourite', a: other, promo: p.initials, truth: true, by: other }, [other]);
    }
  }
  // Someone wanting out; someone badmouthing an enemy to their booker.
  for (const [id, life] of Object.entries(P0.lives ?? {})) {
    const w = findWrestler(id);
    if (!w || w.promotion === 'TIS') continue;
    if (life.goal?.kind === 'move' && rnd() < R.arise / 8) start(c, { kind: 'leaving', a: id, promo: w.promotion, truth: true, by: id }, [id]);
  }
  // Liars: people who can't stand someone make something up.
  for (const x of Object.values(P0.bonds)) {
    for (const [liar, target, l] of [[x.a, x.b, x.la], [x.b, x.a, x.lb]] as [string, string, number][]) {
      if (l > R.liarHate) continue;
      const w = findWrestler(liar);
      if (!w || !(['sly', 'hot'].includes(voiceOf(liar)) || hasTrait(w, 'politician')) || rnd() >= R.liars / 4) continue;
      const t = findWrestler(target);
      if (!t) continue;
      const partner = bondsOf(P0, target).find((b) => together(b.bond));
      const kinds: RumourKind[] = [partner ? 'cheating' : 'drunk', 'badmouth', t.promotion !== 'TIS' ? 'leaving' : 'drunk', c.people[target]?.injury ? 'faking' : 'favourite'];
      const kind = kinds[Math.floor(rnd() * kinds.length)]!;
      const friendOfTarget = bondsOf(P0, target).filter((b) => Math.min(b.bond.la, b.bond.lb) >= 40).map((b) => b.other)[0];
      if (kind === 'badmouth' && !friendOfTarget) continue;
      start(c, { kind, a: target, ...(kind === 'cheating' && partner ? { b: partner.other } : kind === 'badmouth' ? { b: friendOfTarget! } : {}), ...(kind === 'leaving' ? { promo: t.promotion } : {}), truth: false, by: liar }, [liar]);
    }
  }
}

// ------------------------------------------------------------------ how they spread, and what believing one does

function believes(listener: string, teller: string, rnd: Rng): boolean {
  return rnd() < (likeOf(P(), listener, teller) >= R.believe.friendLike ? R.believe.friend : R.believe.other);
}

/** Someone believed it: how they feel moves. */
function land(c: Career, r: Rumour, listener: string): void {
  const E = R.effect;
  const keep = listener === c.player || r.a === c.player ? 5 : 0;
  const why = `Heard ${r.a === listener ? 'a rumour about themselves' : 'a rumour'}`;
  if (r.kind === 'badmouth' && listener === r.b) feelPair(P(), listener, r.a, [E.badmouth, 0], [0, 0], why, c.today, { keep });
  else if (r.kind === 'cheating' && listener === r.b) feelPair(P(), listener, r.a, [E.cheating, 0], [0, 0], 'Heard they’d been cheating', c.today, { keep });
  else if (r.kind === 'cheating' && likeOf(P(), listener, r.b ?? '') >= 30) feelPair(P(), listener, r.a, [E.cheatingOthers, 0], [0, 0], why, c.today, { keep });
  else if (r.kind === 'leaving' && r.promo && bookerOf(P(), r.promo)?.id === listener) feelPair(P(), listener, r.a, [E.leaving, 0], [0, 0], 'Heard they want out', c.today, { keep });
  else if (r.kind === 'favourite' && findWrestler(listener)?.promotion === r.promo) feelPair(P(), listener, r.a, [E.favourite, 0], [0, 0], why, c.today, { keep });
  else if (r.kind === 'faking') feelPair(P(), listener, r.a, [0, E.faking], [0, 0], why, c.today, { keep });
  else if (r.kind === 'drunk' && P().staff[listener]) feelPair(P(), listener, r.a, [E.drunk, 0], [0, 0], why, c.today, { keep });
}

let toldYouThisWeek = 0;
/** Each week: holders tell their friends; when it reaches someone who'd tell you, they do. */
function spread(c: Career, rnd: Rng): void {
  toldYouThisWeek = 0;
  for (const r of rumoursOf(c)) {
    if (r.dead || daysBetween(r.day, c.today) > R.days) continue;
    const now = [...r.heard];
    for (const holder of now) {
      if (holder === c.player) continue;
      const w = findWrestler(holder);
      const mult = w ? (hasTrait(w, 'politician') || voiceOf(holder) === 'sly' || hasTrait(w, 'showboat') ? R.gossip : hasTrait(w, 'professional') || hasTrait(w, 'reliable') ? R.discreet : 1) : 1;
      for (const { other, bond } of bondsOf(P(), holder)) {
        if (r.heard.includes(other)) continue;
        const fond = bond.a === holder ? bond.la : bond.lb;
        if (fond < R.tellLike || bond.f < R.tellFam || rnd() >= R.spread * mult) continue;
        // You can always be told (the cap only stops it going everywhere).
        if (other === c.player) { tellYou(c, r, holder, rnd); continue; }
        if (r.heard.length >= R.maxHeard) continue;
        r.heard.push(other);
        if (believes(other, holder, rnd)) land(c, r, other);
      }
    }
    // A rumour you started can be traced back to you.
    if (r.by === c.player && !r.truth && !r.traced && rnd() < R.you.traced) traced(c, r);
  }
}

function tellYou(c: Career, r: Rumour, holder: string, rnd: Rng): void {
  if (c.spectator || !phoneOn() || toldYouThisWeek >= R.you.perWeek || rnd() >= R.you.tellChance) return;
  toldYouThisWeek++;
  r.heard.push(c.player);
  const aboutYou = r.a === c.player;
  const text = `${pickLine({ plain: ['Heard something. ', 'Don’t shoot the messenger, but… ', 'Word is… '], hot: ['People are saying… '], sly: ['Between us… ', 'You didn’t hear it from me… '], warm: ['I thought you should know… '] }, pvoice(holder), rnd)}${claim(r, c).replace(/^./, (m) => m.toLowerCase())}.`;
  sendIn(c, holder, text, aboutYou
    ? [{ id: 'r_deny', label: 'Deny it', detail: r.truth ? 'It’s true, though' : 'Works more often than not' }, { id: 'r_confront', label: 'Find out who started it', detail: 'And have it out with them' }, { id: 'r_ignore', label: 'Let it go', detail: '' }]
    : [{ id: 'r_believe', label: 'Really?', detail: `You’ll think less of ${nameOf(r.a)}` }, { id: 'r_pass', label: 'Pass it on', detail: 'Politician · it might come back to you' }, { id: 'r_dismiss', label: 'Don’t believe a word', detail: '' }], undefined, { rumour: r.id });
}

function traced(c: Career, r: Rumour): void {
  r.traced = true; r.dead = true;
  moveRelation(c, r.a, R.you.tracedLike, 'You started a rumour about them');
  for (const k of dealsOf(c.people[c.player])) { const room = ((c.room ??= {})[k.promo] ??= { v: 50 }); room.v = Math.max(0, room.v + R.you.tracedRoom); }
  if (!c.spectator) letter(c, { kind: 'news', from: 'Backstage', subject: 'Everyone knows it came from you', body: [`The story about ${nameOf(r.a)} has been traced back to you. They know. So does everyone else.`] });
}

const rumourOf = (c: Career, id?: string) => rumoursOf(c).find((x) => x.id === id);
registerReplies({
  r_deny: (c, l) => {
    const r = rumourOf(c, l.ctx?.rumour);
    if (!r) return 'It’s died down anyway.';
    const works = seededRng(hashSeed(c.seed, 'deny', r.id))() < (r.truth ? R.you.denyTrue : R.you.denyFalse);
    if (works) { r.dead = true; for (const k of dealsOf(c.people[c.player])) { const room = ((c.room ??= {})[k.promo] ??= { v: 50 }); room.v = Math.min(100, room.v + R.you.denyRoom); } return 'People believed you. It’s died down.'; }
    for (const k of dealsOf(c.people[c.player])) { const room = ((c.room ??= {})[k.promo] ??= { v: 50 }); room.v = Math.max(0, room.v + R.you.denyBackfire); }
    return 'Nobody bought it.';
  },
  r_confront: (c, l) => {
    const r = rumourOf(c, l.ctx?.rumour);
    if (!r || r.by === c.player) return 'Nobody’s sure where it came from.';
    r.dead = true;
    if (r.truth) { for (const k of dealsOf(c.people[c.player])) { const room = ((c.room ??= {})[k.promo] ??= { v: 50 }); room.v = Math.max(0, room.v + R.you.confrontRoom); } return `It came from ${nameOf(r.by)}. Trouble is, it’s true. That didn’t go well.`; }
    moveRelation(c, r.by, R.you.confront, 'You had it out with them about a rumour');
    feelPair(P(), r.by, c.player, [R.you.confront, 0], [0, 0], 'You confronted them', c.today, { keep: 5 });
    return `It came from ${nameOf(r.by)}. You had it out with them. It’s dead now.`;
  },
  r_ignore: () => 'You let it go.',
  r_believe: (c, l) => { const r = rumourOf(c, l.ctx?.rumour); if (r) feelPair(P(), c.player, r.a, [-4, 0], [0, 0], 'A rumour about them', c.today, { keep: 5 }); return 'You’ll be wary of them.'; },
  r_pass: (c, l) => {
    const r = rumourOf(c, l.ctx?.rumour);
    if (!r) return 'It’s old news.';
    leanTo(c, 'politician', R.you.spreadLean);
    for (const { other, bond } of bondsOf(P(), c.player)) if (!r.heard.includes(other) && bond.f >= R.tellFam && r.heard.length < R.maxHeard) r.heard.push(other);
    if (!r.truth && seededRng(hashSeed(c.seed, 'pass', r.id))() < R.you.traced) { moveRelation(c, r.a, R.you.tracedLike / 2, 'You spread a rumour about them'); return 'You passed it on. Word got back to them.'; }
    return 'You passed it on.';
  },
  r_dismiss: () => 'You don’t believe a word of it.',
});

// You start one.
registerTopics({
  topic: 'rumour',
  option: (c, id) => {
    if (!findWrestler(id) && !P().staff[id]) return null;
    const targets = bondsOf(P(), c.player).filter((b) => b.other !== id && findWrestler(b.other) && (b.bond.a === c.player ? b.bond.la : b.bond.lb) <= -20).map((b) => b.other);
    if (!targets.length) return null;
    return { topic: 'rumour', label: 'Spread a rumour', groups: [
      { name: 'About', options: targets.slice(0, 8).map((t) => ({ id: t, label: nameOf(t) })) },
      { name: 'Saying', options: [{ id: 'badmouth', label: 'They’ve been badmouthing people' }, { id: 'leaving', label: 'They want out' }, { id: 'favourite', label: 'They’re the booker’s pet' }, { id: 'drunk', label: 'They got thrown out of a bar' }, { id: 'cheating', label: 'They’re cheating' }] },
    ] };
  },
  say: (_c, _id, _t, about) => { const [who, kind] = (about ?? '').split('|'); return `Have you heard about ${nameOf(who ?? '')}? ${({ badmouth: 'They’ve been slagging people off to the office.', leaving: 'They’re trying to get out.', favourite: 'Total booker’s pet.', drunk: 'Got thrown out of a bar after the show.', cheating: 'Cheating on their other half.' } as Record<string, string>)[kind ?? ''] ?? ''}`; },
  guess: () => 0,
  run: (c, id, _t, about, rnd) => {
    const [who, kind] = (about ?? '').split('|') as [string, RumourKind];
    const t = findWrestler(who);
    const partner = bondsOf(P(), who).find((b) => together(b.bond));
    const truth = kind === 'cheating' ? bondsOf(P(), who).filter((b) => together(b.bond)).length > 1 : kind === 'leaving' ? P().lives?.[who]?.goal?.kind === 'move' : kind === 'favourite' ? !!t && likeOf(P(), bookerOf(P(), t.promotion)?.id ?? '', who) >= 60 : false;
    const r = start(c, { kind, a: who, ...(kind === 'cheating' && partner ? { b: partner.other } : kind === 'badmouth' ? { b: id } : {}), ...(t && t.promotion !== 'TIS' ? { promo: t.promotion } : {}), truth, by: c.player }, [c.player, id]);
    leanTo(c, 'politician', R.you.spreadLean);
    if (r && believes(id, c.player, rnd)) { land(c, r, id); return { reply: pickLine({ plain: ['No way. Really?', 'Wow. I had no idea.'], sly: ['Interesting. Very interesting.'], pro: ['I’d rather not know.'], warm: ['That’s awful, if it’s true.'] }, pvoice(id), rnd), note: 'They believed you. It’ll spread.' }; }
    return { reply: pickLine({ plain: ['I don’t believe that.', 'Come off it.'], hot: ['Bollocks.'], pro: ['Let’s not.'] }, pvoice(id), rnd), note: 'They didn’t buy it. It might still spread.' };
  },
});

// ------------------------------------------------------------------ angles from real life

setAngles(
  (c, ids, rnd) => {
    if (rnd() >= ANGLES.chance) return null;
    const set = new Set(ids);
    let best: [string, string] | null = null, worst = 0;
    for (const id of ids) for (const { other, bond } of bondsOf(P(), id)) {
      if (!set.has(other) || id >= other) continue;
      const k = kindOf(bond, c.today);
      if (k !== 'enemy' && k !== 'rival') continue;
      if (findWrestler(id)?.gender !== findWrestler(other)?.gender) continue;
      const heat = Math.min(bond.la, bond.lb) - (k === 'rival' ? 0 : 50);
      if (heat < worst || !best) { worst = heat; best = [id, other]; }
    }
    return best;
  },
  (c, promo, [a, b]) => {
    if (c.spectator || !dealsOf(c.people[c.player]).some((k) => k.promo === promo)) return;
    const mine = a === c.player || b === c.player;
    const them = a === c.player ? b : a;
    letter(c, { kind: 'news', from: `${promo} · the booker`, subject: mine ? `They’re using your real-life heat with ${nameOf(them)}` : `${promo} turns real heat into a storyline`, body: [mine ? `The booker’s built a feud around you and ${nameOf(them)}. Every match will be personal.` : `Everyone knows ${nameOf(a)} and ${nameOf(b)} can’t stand each other. Now it’s on television.`] });
  },
);

// ------------------------------------------------------------------ hooks

function daily(c: Career): void {
  if (weekday(c.today) !== 3) return; // Wednesdays: the week's gossip.
  const rnd = seededRng(hashSeed(c.seed, 'rumours', c.today));
  arise(c, rnd);
  spread(c, rnd);
  c.rumours = rumoursOf(c).filter((r) => !r.dead && daysBetween(r.day, c.today) <= R.days);
}

setCareerHooks({ daily });

