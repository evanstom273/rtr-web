// Feud segments, played (Lyra's design). A promo is built beat by beat (the open, the dig, the hook, the closer) from
// four kinds of material: going after them, hyping yourself, real life (things that actually happened in the game: an
// ex, money trouble, a losing run, a lost title), and working the crowd. Each beat is delivered on the timing bar
// (charisma widens the sweet spot; risky lines narrow it), the crowd meter moves, and your rival comes back at you.
// A great promo wins you the crowd (the edge in your next match with them); a botched one turns it, hands them the
// exchange, gets the office's attention and can go round online. Attacks and brawls are a mini match: a few exchanges
// on the dice (strike beats grapple, grapple beats a weapon, a weapon beats a strike), and someone's left laying.
import { fansTotal, findWrestler, FAN_REGIONS, TITLES, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondsOf, likeOf } from '../world/people';
import { wrestlerHistory } from '../world/history';
import { lifeWorld } from '../world/lifeWorld';
import { letter as post, person } from './career';
import { segmentDone, nameOf, rivalOf, setSimMine, stageOf } from './feuds';
import { moveRelation } from './relations';
import { postToFeed } from './social';
import { FEUD_PLAY as FP } from './tuning';
import type { Career, Feud, SegKind, Segment, Show } from './types';

/** A storyline beat (Lyra's call: a skip with "Sim them" on carries on past it). */
const letter = (c: Career, l: Parameters<typeof post>[1]) => post(c, { ...l, story: true });

const W = (id: string): Wrestler | undefined => findWrestler(id);
const first = (id: string) => nameOf(id).split(' ').slice(-1)[0]!;

// ------------------------------------------------------------------ what a segment is, played

export type Beat = 'open' | 'dig' | 'hook' | 'closer';
export const BEAT_LABEL: Record<Beat, string> = { open: 'The open', dig: 'The dig', hook: 'The hook', closer: 'The closer' };
export type Angle = 'them' | 'self' | 'real' | 'crowd';
export const ANGLE_LABEL: Record<Angle, string> = { them: 'Go after them', self: 'Hype yourself', real: 'Real life', crowd: 'Work the crowd' };

/** The steps of each kind of segment: promo beats, then (maybe) a brawl or a choice. */
export interface Plan { beats: Beat[]; rival: boolean; brawl?: 'always' | 'choice'; signing?: boolean; start?: number }
export function planFor(c: Career, g: Segment): Plan {
  const victim = g.who[1] === c.player;
  switch (g.kind) {
    case 'promo': return { beats: ['open', 'dig', 'hook', 'closer'], rival: true };
    case 'interview': return { beats: ['open', 'dig', 'closer'], rival: false };
    case 'faceoff': return { beats: ['open', 'dig'], rival: true, brawl: 'choice', start: 50 };
    case 'backstage': return { beats: ['dig', 'closer'], rival: true, brawl: 'choice', start: 50 };
    case 'signing': return { beats: ['hook'], rival: true, signing: true, start: 55 };
    case 'beatdown': case 'runin': return { beats: [], rival: false, brawl: 'always', start: victim ? FP.brawl.victim : FP.brawl.attacker };
    default: return { beats: ['open', 'closer'], rival: false };
  }
}

// ------------------------------------------------------------------ the promo

export interface Line { angle: Angle; text: string; value: number; risk: number; real?: boolean }
export interface PromoBeat { beat: Beat; line: Line; hit: number; d: number; rival?: string; rd?: number }
export interface Promo { meter: number; beats: PromoBeat[]; fluffs: number }
export const newPromo = (): Promo => ({ meter: 50, beats: [], fluffs: 0 });

interface Ctx { c: Career; show: Show; g: Segment; f?: Feud; me: Wrestler; them?: Wrestler; city: string; payoff?: Show; r: Rng }
function ctxOf(c: Career, show: Show, g: Segment, salt: string): Ctx {
  const f = g.feud ? c.feuds.find((x) => x.id === g.feud) : undefined;
  const them = W(f ? rivalOf(c, f) : g.who.find((x) => x !== c.player) ?? '');
  return { c, show, g, f, me: W(c.player)!, them, city: show.city, payoff: f?.payoff ? c.shows[f.payoff] : undefined, r: seededRng(hashSeed(c.seed, 'promo', show.id, g.kind, salt)) };
}
const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

/** Real life: something that actually happened to them, if there's anything (an ex, money, a losing run, a lost title). */
function realLife(x: Ctx): string[] {
  const out: string[] = [];
  const them = x.them;
  if (!them) return out;
  const P = activeWorld().people;
  const ex = P ? bondsOf(P, them.id).find((b) => b.bond.love?.st === 'ex') : undefined;
  if (ex) out.push(`How’s ${nameOf(ex.other).split(' ')[0]}, ${first(them.id)}? Oh, that’s right. Even they got sick of you.`);
  if (lifeWorld().wealth?.[them.id]?.broke) out.push(`Heard the bank came for your house, ${first(them.id)}. Hard times. Shame.`);
  const H = activeWorld().history;
  const last = wrestlerHistory(H, them.id).slice(0, 6);
  const losses = last.filter((m) => m.result === 'loss').length;
  if (last.length >= 4 && losses >= 4) out.push(`${losses} losses in your last ${last.length}, ${first(them.id)}. That’s not a slump. That’s who you are now.`);
  const lost = Object.values(H.reigns).flat().find((rg) => rg.holder === them.id && rg.to && rg.to > x.c.today.slice(0, 4));
  if (lost) out.push(`You used to be somebody, ${first(them.id)}. You used to have a belt. Used to.`);
  const beat = wrestlerHistory(H, x.c.player).find((m) => m.opp === them.id && m.result === 'win');
  if (beat) out.push(`Last time we were in that ring, ${first(them.id)}, you were staring at the lights. I was there. I remember.`);
  if (P && (likeOf(P, them.id, x.c.player) ?? 0) <= -40) out.push(`Everyone in the back knows what you’re like, ${first(them.id)}. They just don’t say it to your face. I will.`);
  return out;
}

/** The lines on offer for a beat: one of each kind of material (where there's something to say). */
export function promoOptions(c: Career, show: Show, g: Segment, beat: Beat, used: Angle[]): Line[] {
  const x = ctxOf(c, show, g, beat);
  const r = x.r, heel = x.me.disposition === 'HEEL';
  const them = x.them ? first(x.them.id) : 'all of you';
  const pay = x.payoff ? x.payoff.name : 'the big one';
  const myTitle = TITLES.find((t) => t.holder === c.player)?.name;
  const wins = wrestlerHistory(activeWorld().history, c.player).slice(0, 20).filter((m) => m.result === 'win').length;
  const real = realLife(x);
  const T: Record<Angle, Record<Beat, string[]>> = {
    them: {
      open: [`Let’s not pretend anyone came here tonight for ${them}.`, `I’m out here because ${them} won’t shut up. So let’s settle it.`],
      dig: [`${them}, you couldn’t lace my boots.`, `You’ve coasted on a reputation for years, ${them}. I’m the one who sees through it.`, `Look at the state of you, ${them}.`],
      hook: [`At ${pay}, ${them}, it ends. And it ends with you on your back.`, `You wanted my attention, ${them}. Now you’ve got all of it.`],
      closer: [`See you at ${pay}, ${them}. Bring a stretcher.`, `Run, ${them}. It won’t help, but run.`],
    },
    self: {
      open: [myTitle ? `Your ${myTitle} is here.` : 'Look who it is. The best thing on this show all year.', 'You know who I am. Everyone does.'],
      dig: [`${wins} wins in my last twenty. ${them}? Ask them.`, `Nobody in this building works harder than me. Nobody.`],
      hook: [`When this is over, they’ll be chanting my name, not yours.`, `This is my time. ${them} is in the way.`],
      closer: ['Remember this night. You’ll be telling people you were here.', 'That’s all I’ve got to say. The rest, I’ll say in the ring.'],
    },
    real: {
      open: [`I’ve been asking around about you, ${them}. You’d be amazed what people tell you.`],
      dig: real.length ? real : [`I know what you did, ${them}. Everyone in the back knows.`],
      hook: [`This stopped being business a while ago, ${them}. This is personal.`],
      closer: [real.length ? `Go home and ask yourself why nobody likes you, ${them}.` : `Sleep well, ${them}. If you can.`],
    },
    crowd: {
      open: heel ? [`${x.city}. I’d say it’s good to be back, but I’ve been to better places on fire.`] : [`${x.city}! Make some noise!`, `${x.city}, I’ve missed you!`],
      dig: heel ? [`These people paid good money to watch you lose, ${them}. Don’t let them down.`, `${x.city} and ${them}: two things nobody asked for.`] : [`${x.city} deserves better than ${them}. Tonight, they get it.`],
      hook: heel ? [`Shut up, ${x.city}. I’m talking.`] : [`At ${pay}, I’m doing this for every one of you.`],
      closer: heel ? [`Good night, ${x.city}. Get home safe. Or don’t.`] : [`Good night, ${x.city}! I love you!`],
    },
  };
  // What each kind is worth from you (a heel's cheap heat and digs, a face's crowd and self), and how risky.
  const base: Record<Angle, number> = heel ? { them: 1.05, self: 0.85, real: 1.35, crowd: 1.1 } : { them: 0.85, self: 1.05, real: 1.3, crowd: 1.05 };
  const risk: Record<Angle, number> = { them: 0.15, self: 0.1, real: real.length ? 0.45 : 0.3, crowd: 0.1 };
  const fit: Record<Beat, Partial<Record<Angle, number>>> = { open: { crowd: 1.15, self: 1.1 }, dig: { them: 1.15, real: 1.2 }, hook: { them: 1.1, self: 1.05 }, closer: { crowd: 1.05, self: 1.05 } };
  const last = used.at(-1);
  return (['them', 'self', 'real', 'crowd'] as Angle[]).map((a) => ({
    angle: a, text: pick(r, T[a][beat]), risk: risk[a], ...(a === 'real' && real.length ? { real: true } : {}),
    value: Math.round(base[a] * (fit[beat][a] ?? 1) * (last === a ? FP.repeat : 1) * (a === 'real' && !real.length ? 0.8 : 1) * 100) / 100,
  }));
}

/** The sweet spot on the timing bar (0–1): wider with charisma, narrower for risky lines; where it sits moves. */
export function sweetSpot(c: Career, show: Show, g: Segment, beat: Beat, line: Line): { from: number; width: number } {
  const me = W(c.player)!;
  const width = Math.max(0.06, (FP.zone.base + (me.stats.charisma - 50) / 100 * FP.zone.perCharisma) * (1 - line.risk * FP.zone.risk));
  const r = seededRng(hashSeed(c.seed, 'zone', show.id, g.kind, beat));
  return { from: Math.round((0.15 + r() * (0.7 - width)) * 1000) / 1000, width: Math.round(width * 1000) / 1000 };
}
/** Where the marker stopped: in the sweet spot (1), close (0.5), or fluffed (0). */
export const hitOf = (at: number, z: { from: number; width: number }): number => (at >= z.from && at <= z.from + z.width ? 1 : Math.abs(at - (z.from + z.width / 2)) <= z.width / 2 + FP.zone.close ? 0.5 : 0);

const COMEBACKS = [
  '“Big words from someone who’s never beaten me when it counted.”', '“Are you finished? Because nobody was listening.”',
  '“You talk a lot for someone who taps out.”', '“I’ve heard better promos from the ring announcer.”',
  '“Keep talking. It’s all you’ve got.”', '“Say that again in the ring. I dare you.”',
];

/** Deliver a beat: the crowd meter moves by the line and how you said it; after the dig and the closer, they answer. */
export function deliver(c: Career, show: Show, g: Segment, st: Promo, beat: Beat, line: Line, hit: number): PromoBeat {
  const me = W(c.player)!;
  const swing = line.value * FP.beat * (1 + line.risk);
  let d = hit === 1 ? swing : hit === 0.5 ? swing * 0.4 : -swing * (0.6 + line.risk);
  d += (me.stats.charisma - 50) / FP.charismaPer;
  if (hit === 0) st.fluffs++;
  const pb: PromoBeat = { beat, line, hit, d: Math.round(d) };
  const plan = planFor(c, g);
  const them = g.who.find((x) => x !== c.player);
  if (plan.rival && them && (beat === 'dig' || beat === 'closer' || (beat === 'hook' && plan.beats.length === 1))) {
    const t = W(them)!;
    const r = seededRng(hashSeed(c.seed, 'comeback', show.id, beat));
    pb.rival = `${first(them)}: ${pick(r, COMEBACKS)}`;
    pb.rd = -Math.round(FP.comeback + (t.stats.charisma - 50) / FP.charismaPer + r() * 4);
  }
  st.meter = Math.max(0, Math.min(100, st.meter + pb.d + (pb.rd ?? 0)));
  st.beats.push(pb);
  return pb;
}
/** The promo's score (0–5) from where the meter ended. */
export const promoScore = (st: Promo): number => Math.max(0, Math.min(5, st.meter / 20));

// ------------------------------------------------------------------ the brawl (a mini match)

export type BrawlMove = 'strike' | 'grapple' | 'weapon' | 'back_off';
export const BRAWL_LABEL: Record<BrawlMove, string> = { strike: 'Strike', grapple: 'Grapple', weapon: 'Grab a weapon', back_off: 'Back off' };
export const BRAWL_HINT: Record<BrawlMove, string> = {
  strike: 'Beats a grapple (catch them coming in)', grapple: 'Beats a weapon (take it off them)', weapon: 'Beats a strike, and the crowd loves it; security notices',
  back_off: 'Live to fight another day (the crowd boos)',
};
export interface Exchange { you: BrawlMove; them: BrawlMove; rolls: [number, number]; d: number; text: string }
export interface Brawl { meter: number; rounds: Exchange[]; weapons: number; over?: 'laid' | 'standing' | 'walked' }
export const newBrawl = (start = 50): Brawl => ({ meter: start, rounds: [], weapons: 0 });

const BEATS_MOVE: Record<BrawlMove, BrawlMove | null> = { strike: 'grapple', grapple: 'weapon', weapon: 'strike', back_off: null };
const statFor = (w: Wrestler, m: BrawlMove) => (m === 'strike' ? w.stats.striking / 10 + w.stats.strength / 25 : m === 'grapple' ? w.stats.strength / 10 + w.stats.skill / 25 : m === 'weapon' ? 3 + w.stats.skill / 30 : 0);

/** Their move, by who they are: hot-heads and the aggressive swing, technicians grapple, cheats grab a chair. */
function theirMove(t: Wrestler, r: Rng, round: number): BrawlMove {
  const tr = t.traits ?? [];
  const w: Record<BrawlMove, number> = { strike: 1, grapple: 1, weapon: 0.4, back_off: 0.05 };
  if (tr.includes('hot_headed') || tr.includes('aggressive')) w.strike += 1;
  if (tr.includes('methodical') || tr.includes('submission_specialist')) w.grapple += 1;
  if (tr.includes('dirty_fighter') || t.disposition === 'HEEL') w.weapon += 0.6;
  if (round >= 2 && t.disposition === 'HEEL') w.back_off += 0.3;
  let x = r() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(w) as BrawlMove[]) { x -= w[k]; if (x <= 0) return k; }
  return 'strike';
}

/** One exchange: your move against theirs on the dice; whoever wins it swings the brawl their way. */
export function exchange(c: Career, show: Show, g: Segment, b: Brawl, you: BrawlMove): Exchange {
  const me = W(c.player)!, t = W(g.who.find((x) => x !== c.player) ?? '') ?? me;
  const r = seededRng(hashSeed(c.seed, 'brawl', show.id, g.kind, b.rounds.length, you));
  if (you === 'back_off') {
    const ex: Exchange = { you, them: 'strike', rolls: [0, 0], d: -6, text: 'You back off up the ramp. The crowd lets you hear it.' };
    b.meter = Math.max(0, b.meter - 6); b.rounds.push(ex); b.over = 'walked';
    return ex;
  }
  const them = theirMove(t, r, b.rounds.length);
  if (them === 'back_off') {
    const ex: Exchange = { you, them, rolls: [0, 0], d: 10, text: `${first(t.id)} bails out of the ring and up the ramp. You’re left standing tall.` };
    b.meter = Math.min(100, b.meter + 10); b.rounds.push(ex); b.over = 'standing';
    return ex;
  }
  const ry = 1 + Math.floor(r() * 20), rt = 1 + Math.floor(r() * 20);
  let sy = ry + statFor(me, you), stt = rt + statFor(t, them);
  if (BEATS_MOVE[you] === them) sy += FP.brawl.beats; else if (BEATS_MOVE[them] === you) stt += FP.brawl.beats;
  const won = sy >= stt, d = Math.round((won ? 1 : -1) * (FP.brawl.swing + Math.abs(sy - stt) * 1.2) * (you === 'weapon' || them === 'weapon' ? 1.25 : 1));
  if (you === 'weapon') b.weapons++;
  const verbs: Record<BrawlMove, string> = { strike: 'throws hands', grapple: 'goes for a takedown', weapon: 'grabs a chair', back_off: 'backs off' };
  const text = `You ${verbs[you].replace('throws', 'throw').replace('goes', 'go').replace('grabs', 'grab')}; ${first(t.id)} ${verbs[them]}. ${won ? 'You get the better of it.' : `${first(t.id)} gets the better of it.`}`;
  const ex: Exchange = { you, them, rolls: [ry, rt], d, text };
  b.meter = Math.max(0, Math.min(100, b.meter + d));
  b.rounds.push(ex);
  if (b.rounds.length >= FP.brawl.rounds || b.meter >= 92 || b.meter <= 8) b.over = b.meter >= 50 ? 'standing' : 'laid';
  return ex;
}
/** The brawl's score (0–5): a decisive one's good TV either way; standing tall's better. */
export function brawlScore(b: Brawl): number {
  // The same thing over and over is dull TV, however it goes.
  const moves = b.rounds.map((x) => x.you);
  const samey = moves.length >= 3 && new Set(moves).size === 1 ? FP.brawl.samey : 0;
  return Math.max(0.5, Math.min(FP.brawl.max, 1.75 + Math.abs(b.meter - 50) / 25 + (b.over === 'standing' ? 0.35 : b.over === 'walked' ? -0.75 : 0) + Math.min(2, b.weapons) * 0.15 + new Set(moves).size * 0.1 - samey));
}

// ------------------------------------------------------------------ finishing (played or simmed)

export type SigningChoice = 'sign' | 'attack' | 'flip';
export const SIGNING_LABEL: Record<SigningChoice, string> = { sign: 'Sign and leave', attack: 'Sign, then attack', flip: 'Flip the table' };

/**
 * The segment's over: its score from the promo and/or the brawl, the heat and fans it's worth (segmentDone), and what a
 * great or a botched one does: the crowd's edge, real life's cost, the office, going round online.
 */
export function finishSegment(c: Career, show: Show, i: number, o: { promo?: Promo; brawl?: Brawl; signing?: SigningChoice }): { score: number; lines: string[] } {
  const g = show.segments![i]!;
  const rival = g.who.find((x) => x !== c.player);
  const lines: string[] = [];
  const ps = o.promo ? promoScore(o.promo) : undefined, bs = o.brawl ? brawlScore(o.brawl) : undefined;
  let score = ps !== undefined && bs !== undefined ? ps * 0.5 + bs * 0.5 + 0.25 : ps ?? bs ?? 2.25;
  if (o.signing === 'sign') score = Math.min(score, 2.5);
  if (o.signing === 'flip') score += 0.25;
  const usedReal = !!o.promo?.beats.some((b) => b.line.real);
  const botched = ps !== undefined && (ps < FP.botch || (o.promo!.fluffs >= 2 && ps < 2.5));
  const great = score >= FP.great;
  let edge: string | undefined;
  if (great && !botched) edge = c.player; else if (botched || (o.brawl?.over === 'laid' && (bs ?? 0) >= 2.5)) edge = rival;
  const note = botched ? 'It died. The crowd turned on you.' : score >= 4 ? 'The building came unglued.' : score >= 3.25 ? 'Went down a storm.' : score >= 2.5 ? 'Did its job.' : score >= 1.5 ? 'The crowd went for a drink.' : 'Died on its arse.';
  segmentDone(c, show, g, score, note, { heatMult: (usedReal ? FP.realHeat : 1) * (o.brawl?.weapons ? 1.15 : 1), edge, line: `${g.kind === 'promo' ? 'Your promo' : 'Your segment'} on ${show.name}: ${Math.round(score * 4) / 4}★${botched ? ' (botched)' : ''}` });
  lines.push(`${Math.round(score * 4) / 4}★ · ${note}`);
  if (edge === c.player) lines.push('You’ve got the crowd: you’ll have the edge in your next match with them.');
  if (edge && edge === rival) lines.push(`${nameOf(rival!)} won that exchange: they’ve got the crowd going into your next match.`);
  if (usedReal && rival) { moveRelation(c, rival, FP.realLike, 'You brought real life into it'); lines.push(`${first(rival)} won’t forget what you said.`); }
  const p = person(c, c.player);
  if (botched) {
    p.rep = Math.max(0, p.rep - FP.botchRep);
    lines.push('The office noticed.');
    if (rival) { const t = W(rival); if (t?.fans) t.fans[show.region] = Math.round(t.fans[show.region] * 1.01); }
  }
  if (o.brawl?.over === 'laid' && rival) lines.push(`${first(rival)} left you laying.`);
  if (o.brawl?.over === 'standing') lines.push('You’re the one left standing.');
  // Going round online: a great line or an awful one.
  const r = seededRng(hashSeed(c.seed, 'viral', show.id, i));
  if ((great || botched) && r() < FP.viral) {
    const me = W(c.player)!;
    const mult = great ? 1 + FP.viralFans : 1 - FP.viralFans / 2;
    for (const reg of FAN_REGIONS) me.fans[reg] = Math.max(0, Math.round(me.fans[reg] * mult));
    const best = o.promo?.beats.slice().sort((a, b) => b.d - a.d)[0]?.line.text;
    postToFeed(c, great ? (best ?? 'That one’s going round.') : 'Well, that went round for the wrong reasons.');
    letter(c, { kind: 'news', from: 'Online', subject: great ? 'You’ve gone viral' : 'You’ve gone viral (not in a good way)', body: [great ? `${best ? `“${best}”` : 'Your segment'} is everywhere. Your following is up.` : 'The clip of your promo is everywhere, and the locker room won’t let you forget it.'] });
    lines.push(great ? 'It’s going round online.' : 'It’s going round online, for all the wrong reasons.');
    void fansTotal;
  }
  void stageOf;
  return { score: g.score!, lines };
}

/** A segment of yours, simmed: sensible picks and delivery by charisma (skipping or "sim it"). */
export function simSegment(c: Career, show: Show, i: number): { score: number; lines: string[] } {
  const g = show.segments![i]!;
  const plan = planFor(c, g);
  const me = W(c.player)!;
  const r = seededRng(hashSeed(c.seed, 'simseg', show.id, i));
  let promo: Promo | undefined, brawl: Brawl | undefined, signing: SigningChoice | undefined;
  if (plan.beats.length) {
    promo = newPromo();
    for (const beat of plan.beats) {
      const opts = promoOptions(c, show, g, beat, promo.beats.map((b) => b.line.angle)).filter((l) => l.angle !== 'real');
      const line = opts.sort((a, b) => b.value - a.value)[0]!;
      const p = 0.35 + me.stats.charisma / 200;
      const x = r();
      deliver(c, show, g, promo, beat, line, x < p ? 1 : x < p + 0.3 ? 0.5 : 0);
    }
  }
  if (plan.signing) signing = 'sign';
  if (plan.brawl === 'always') {
    brawl = newBrawl(plan.start);
    while (!brawl.over) exchange(c, show, g, brawl, (['strike', 'grapple', 'weapon'] as BrawlMove[])[Math.floor(r() * 3)]!);
  }
  return finishSegment(c, show, i, { ...(promo ? { promo } : {}), ...(brawl ? { brawl } : {}), ...(signing ? { signing } : {}) });
}

setSimMine(simSegment);

export type { SegKind };
