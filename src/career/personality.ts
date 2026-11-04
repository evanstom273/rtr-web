// Personality in a career: backstage traits shape contracts, finishes, patience and relationships;
// wrestlers' personalities drift slowly with what happens to them; veterans mentor the young; and you
// grow traits by how you play (always confirmed on a card) or buy them in Training.
//
// Traits shift chances. They never decide anything outright.
import { canAdd, conflictOf, globalScore, hasTrait, TITLES, type TraitId, traitName, TRAITS, type Wrestler, type WrestlerClass, WRESTLERS } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { bondOf, bondsOf, freshPeople, moveBond, type People } from '../world/people';
import { letter, person, setCareerHooks, spend } from './career';
import { addDays, daysBetween, type Day } from './dates';
import { ctxFor, fire, onAnswer, registerEvents, type EvCtx, type EvData, type EventDef } from './events';
import {
  TRAIT_BACKSTAGE as BX, TRAIT_BUY_COOLDOWN, TRAIT_DECLINE_COOLDOWN, TRAIT_DRIFT, TRAIT_DRIFT_CHECK, TRAIT_DRIFT_MIN_DAYS,
  TRAIT_LEAN_DECAY, TRAIT_OFFER_AT, TRAIT_OFFER_EXPIRES, TRAIT_OFFER_GAP_DAYS, TRAIT_OFFER_PER_HELD, TRAIT_PRICE, TRAIT_PRICE_PREMIUM,
} from './tuning';
import type { Bout, Career, Person, PlayerMatch, Show } from './types';

const P = (): People => (activeWorld().people ??= freshPeople());
const me = (c: Career): Wrestler => WRESTLERS.find((w) => w.id === c.player)!;

export { contenderLean, leanFrom, patienceMult, poachMult, relationMult, renewLean, retryAdjust } from './leans';
import { leanTo } from './leans';

// ------------------------------------------------------------------ the player: leanings and offers

/** Points towards a trait from what you've done, decaying each month (Person.leanings). */
export const lean = leanTo;
const reset = (c: Career, t: TraitId) => { const l = person(c, c.player).leanings; if (l) delete l[t]; };

/** What your matches say about you (matches you played, not ones the game simmed). */
function afterMine(c: Career, show: Show, bout: Bout, m: PlayerMatch): void {
  void bout;
  const s = m.stats;
  const won = m.result === 'win';
  // Every 20 dates without a no-show: reliable.
  if (c.history.length % 20 === 0) lean(c, 'reliable', 20);
  // Everything else only counts in matches you played yourself (a simmed match says nothing about you).
  if (!m.played) return;
  if (m.planned === 'kept') lean(c, 'professional', 10);
  if (m.planned === 'off-script') { lean(c, 'rebellious', 40); reset(c, 'professional'); }
  if (won && (show.kind === 'special' || show.kind === 'flagship' || m.title) && m.stars >= 3.5) lean(c, 'big_match', m.wonTitle ? 35 : 25);
  // 4★ is rarer since the rating recalibration (about 12% of matches), so a strong 3.75★ counts too.
  if (m.stars >= 3.75) lean(c, 'crowd_pleaser', m.stars >= 4 ? 15 : 8);
  if (won && m.finish === 'SUBMISSION') lean(c, 'submission_specialist', 30);
  if (won && m.finish === 'DISQUALIFICATION') lean(c, 'dirty_fighter', 20);
  if (!s) return;
  if ((s.highTried ?? 0) >= 3) lean(c, 'risk_taker', 15);
  if ((s.taunts ?? 0) >= 3) lean(c, 'showboat', 15);
  if ((s.dirty ?? 0) >= 2) lean(c, 'dirty_fighter', 15);
  if (s.movesTried >= 20 && (s.rests ?? 0) <= 1) lean(c, 'aggressive', 12);
  if (s.reversalWins >= 4) lean(c, 'defensive', 12);
  if (s.kickouts >= 3) lean(c, 'resilient', 12);
  if ((s.fk ?? 0) >= 1) lean(c, 'resilient', 20);
  if ((s.holds ?? 0) >= 3) lean(c, 'submission_specialist', 10);
  if (m.t >= 720 && (s.highTried ?? 0) === 0 && (s.holds ?? 0) >= 2) lean(c, 'methodical', 12);
  if (won && m.finish === 'PINFALL' && m.t < 300) lean(c, 'opportunist', 20);
}

/** What your choices in career events say about you: 'event:option' → traits. */
const EVENT_LEANINGS: Record<string, [TraitId, number][]> = {
  'protege_ask:help': [['mentor', 30]], 'school_guest:free': [['mentor', 15]], 'seminar:free': [['mentor', 15]],
  'meet_fans:stay': [['crowd_pleaser', 15]], 'convention:go': [['crowd_pleaser', 10]],
  'podcast:spicy': [['egotistical', 10], ['unpredictable', 10]],
  'journalist_finish:own': [['rebellious', 15]], 'journalist_finish:down': [['professional', 15]],
  'contract_question:hint': [['mercenary', 20]], 'contract_question:happy': [['loyal', 15]],
  'help_prepare:help': [['team_player', 15]], 'alliance:yes': [['team_player', 15], ['politician', 10]], 'alliance:no': [['egotistical', 15]],
  'provoked:bite': [['hot_headed', 30]], 'provoked:walk': [['professional', 15]],
  'olive_branch:no': [['hot_headed', 15]], 'prank:revenge': [['hot_headed', 15]],
};
onAnswer((c, event, option) => {
  for (const [t, pts] of EVENT_LEANINGS[`${event}:${option}`] ?? []) lean(c, t, pts);
});

/** The bar for an offer rises as your personality settles: 100, then 150, 200, 250. */
export const offerAt = (held: number): number => TRAIT_OFFER_AT * (1 + TRAIT_OFFER_PER_HELD * held);

/** The trait you're closest to being offered right now, if any (never one you hold, or declined this year). */
export function offerDue(c: Career): TraitId | null {
  const p = person(c, c.player);
  const held = me(c)?.traits ?? [];
  if (p.lastOfferAt && daysBetween(p.lastOfferAt, c.today) < TRAIT_OFFER_GAP_DAYS) return null;
  const bar = offerAt(held.length);
  const ready = Object.entries(p.leanings ?? {})
    .filter(([t, v]) => v >= bar && !held.includes(t as TraitId) && !(p.declined?.[t as TraitId] && daysBetween(p.declined[t as TraitId]!, c.today) < TRAIT_DECLINE_COOLDOWN))
    .sort((a, b) => b[1] - a[1]);
  return (ready[0]?.[0] as TraitId | undefined) ?? null;
}

const slotLabel = (x: EvCtx, i: number) => { const t = x.me.traits?.[i]; return t ? `Replace ${traitName(t)}` : ''; };
const OFFER: EventDef = {
  id: 'trait_offer', cat: 'career', weight: 0, cooldown: 0, when: () => false, expires: TRAIT_OFFER_EXPIRES,
  from: () => 'Your reputation', subject: (_x, d) => `You’re becoming a ${traitName(d.trait as TraitId)}`,
  body: (x, d) => {
    const t = d.trait as TraitId;
    const def = TRAITS.find((y) => y.id === t)!;
    const full = (x.me.traits?.length ?? 0) >= 3;
    return [`People have started to say it: the way you’ve been going about things, you’re a ${def.name}.`, def.blurb,
      full ? 'You hold three traits already: take this one and something has to give.' : 'Take it on, or say it isn’t you. Nothing changes unless you choose.'];
  },
  options: [
    { id: 'take', label: (_x, d) => `Take it: ${traitName(d.trait as TraitId)}`, hidden: (x, d) => canAdd(x.me.traits ?? [], d.trait as TraitId) !== 'ok', run: (x, d) => takeTrait(x.c, d.trait as TraitId) },
    ...[0, 1, 2].map((i) => ({
      id: `r${i}`, label: (x: EvCtx) => slotLabel(x, i),
      hidden: (x: EvCtx, d: EvData) => { const old = x.me.traits?.[i]; return !old || canAdd(x.me.traits ?? [], d.trait as TraitId, old) !== 'ok' || canAdd(x.me.traits ?? [], d.trait as TraitId) === 'ok'; },
      run: (x: EvCtx, d: EvData) => takeTrait(x.c, d.trait as TraitId, x.me.traits![i]),
    })),
    { id: 'no', label: 'That isn’t me', decline: true, run: (x, d) => { declineTrait(x.c, d.trait as TraitId); return 'You let it pass. It won’t come up again for a good while.'; } },
  ],
  ignored: (x, d) => { declineTrait(x.c, d.trait as TraitId); return 'You never answered, so it passed you by.'; },
};
registerEvents([OFFER]);

function declineTrait(c: Career, t: TraitId): void {
  const p = person(c, c.player);
  (p.declined ??= {})[t] = c.today;
  reset(c, t);
}

/** Take a trait (into a free slot, or in place of one). Returns what happened, for the card. */
function takeTrait(c: Career, t: TraitId, replacing?: TraitId): string {
  const w = me(c);
  const list = w.traits ?? [];
  const ok = canAdd(list, t, replacing);
  if (ok !== 'ok') return ok === 'full' ? 'You’d have to give one up first.' : ok === 'conflict' ? `That clashes with ${traitName(conflictOf(t)!)}.` : 'You already have it.';
  w.traits = [...list.filter((x) => x !== replacing), t];
  const p = person(c, c.player);
  p.traitAt = c.today;
  reset(c, t);
  addEvent(activeWorld().history, { day: c.today, kind: 'trait', who: w.id, name: w.name, what: replacing ? `became a ${traitName(t)} (no longer ${traitName(replacing)})` : `became a ${traitName(t)}` });
  return replacing ? `You’re a ${traitName(t)} now, and no longer ${traitName(replacing)}.` : `You’re a ${traitName(t)} now.`;
}

/** Once a day: decay at the turn of the month, and an offer card when your behaviour has earned one. */
function daily(c: Career): void {
  const p = person(c, c.player);
  if (c.today.endsWith('-01') && p.leanings) for (const t of Object.keys(p.leanings) as TraitId[]) {
    p.leanings[t] = Math.round(p.leanings[t]! * TRAIT_LEAN_DECAY * 10) / 10;
    if (p.leanings[t]! < 1) delete p.leanings[t];
  }
  if (p.retired) return;
  if (Object.values(c.events?.open ?? {}).some((o) => o.id === 'trait_offer')) return;
  const t = offerDue(c);
  if (!t) return;
  const l = fire(ctxFor(c), OFFER, { trait: t });
  if (l) p.lastOfferAt = c.today;
}

// ------------------------------------------------------------------ buying a trait (Training)

export const traitPrice = (t: TraitId): number => (TRAITS.find((x) => x.id === t)?.premium ? TRAIT_PRICE_PREMIUM : TRAIT_PRICE);

/** Why you can't buy it right now, or null if you can. */
export function buyBlock(c: Career, t: TraitId, replacing?: TraitId): string | null {
  const p = person(c, c.player);
  const list = me(c).traits ?? [];
  const ok = canAdd(list, t, replacing);
  if (ok === 'have') return 'You already have it.';
  if (ok === 'conflict') return `It clashes with ${traitName(conflictOf(t)!)}: replace that one.`;
  if (ok === 'full') return 'You have three: choose one to give up.';
  if (p.boughtAt && daysBetween(p.boughtAt, c.today) < TRAIT_BUY_COOLDOWN) return `One trait every ${TRAIT_BUY_COOLDOWN} days: next from ${addDays(p.boughtAt, TRAIT_BUY_COOLDOWN)}.`;
  if (c.money < traitPrice(t)) return `It costs £${traitPrice(t).toLocaleString('en-GB')}.`;
  return null;
}

/** Buy a trait: the same as earning it, for money (and the trait it replaces, if you're full). */
export function buyTrait(c: Career, t: TraitId, replacing?: TraitId): string {
  const block = buyBlock(c, t, replacing);
  if (block) return block;
  const price = traitPrice(t);
  spend(c, -price, `Training · ${traitName(t)}${replacing ? ` (instead of ${traitName(replacing)})` : ''}`, 'training');
  person(c, c.player).boughtAt = c.today;
  return takeTrait(c, t, replacing);
}

// ------------------------------------------------------------------ the world: drift and mentorship

/** A young wrestler's breakthrough brings out a trait that fits their style. */
const STYLE: Record<WrestlerClass, TraitId[]> = {
  HIGH_FLYER: ['risk_taker', 'crowd_pleaser'], TECHNICIAN: ['methodical', 'submission_specialist'], STRIKER: ['aggressive', 'opportunist'],
  POWERHOUSE: ['resilient', 'aggressive'], HARDCORE: ['dirty_fighter', 'resilient'],
};

/** Change an AI wrestler's traits: add one, dropping the one it contradicts (or the oldest) when they're full. */
function shift(c: Career, w: Wrestler, add: TraitId, drop?: TraitId): boolean {
  const list = w.traits ?? [];
  if (list.includes(add)) return false;
  const clash = conflictOf(add);
  let out = list.filter((t) => t !== drop && t !== clash);
  if (out.length >= 3) out = out.slice(1);
  w.traits = [...out, add];
  person(c, w.id).traitAt = c.today;
  const gone = list.filter((t) => !w.traits!.includes(t));
  addEvent(activeWorld().history, { day: c.today, kind: 'trait', who: w.id, name: w.name, ...(w.promotion !== 'TIS' ? { promo: w.promotion } : {}), what: `became ${traitName(add)}${gone.length ? ` (no longer ${gone.map(traitName).join(', ')})` : ''}` });
  return true;
}

/** Circumstances that change someone (Lyra's call: only these, never at random). */
function drift(c: Career, w: Wrestler, p: Person, rnd: Rng): boolean {
  const D = TRAIT_DRIFT;
  const reign = TITLES.filter((t) => t.holder === w.id).map((t) => c.titles[t.id]?.since).filter(Boolean) as Day[];
  const moves = (p.moves ?? []).filter((d) => daysBetween(d, c.today) <= D.mercenaryMoves.days);
  if (hasTrait(w, 'risk_taker') && w.age >= D.ageMethodical.age && rnd() < D.ageMethodical.p) return shift(c, w, 'methodical', 'risk_taker');
  if (w.age >= D.ageMentor.age && !hasTrait(w, 'mentor') && rnd() < D.ageMentor.p) return shift(c, w, 'mentor');
  if ((p.renewals ?? 0) >= D.loyalRenewals.n && !hasTrait(w, 'loyal') && rnd() < D.loyalRenewals.p) return shift(c, w, 'loyal');
  if (moves.length >= D.mercenaryMoves.n && !hasTrait(w, 'mercenary') && rnd() < D.mercenaryMoves.p) return shift(c, w, 'mercenary');
  if (reign.some((d) => daysBetween(d, c.today) >= D.egoReign.days) && !hasTrait(w, 'egotistical') && rnd() < D.egoReign.p) return shift(c, w, 'egotistical');
  const lately = (p.breakthrough && daysBetween(p.breakthrough, c.today) <= D.youngStar.days);
  if (w.age <= D.youngStar.age && lately && rnd() < D.youngStar.p) {
    const options = w.classes.flatMap((k) => STYLE[k]).filter((t) => !hasTrait(w, t));
    if (options.length) return shift(c, w, options[Math.floor(rnd() * options.length)]!);
  }
  return false;
}

/** Veterans who mentor bring on a young wrestler near them: +1 to their weakest attribute a month, up to +4, and a bond. */
function mentorship(c: Career, rnd: Rng): void {
  const M = BX.mentor;
  const people = P();
  const mentors = WRESTLERS.filter((w) => w.id !== c.player && hasTrait(w, 'mentor') && w.age >= M.minAge && !c.people[w.id]?.retired);
  for (const m of mentors) {
    if (rnd() >= M.monthly) continue;
    // Their protégé: one they're already teaching, else a young one near them (same promotion; on the indies, same region).
    const current = bondsOf(people, m.id).find((b) => b.bond.kind === 'mentor' && b.bond.mentor === m.id && (b.bond.given ?? 0) < M.max);
    const young = current ? WRESTLERS.find((w) => w.id === current.other) : WRESTLERS.filter((w) => w.id !== c.player && w.age <= M.protegeMaxAge && !c.people[w.id]?.retired
      && (m.promotion === 'TIS' ? w.promotion === 'TIS' && w.region === m.region : w.promotion === m.promotion) && !bondsOf(people, w.id).some((b) => b.bond.kind === 'mentor'))
      .sort((a, b) => globalScore(a) - globalScore(b))[0];
    if (!young) continue;
    const keys = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'] as const;
    const low = keys.reduce((a, b) => (young.stats[b] < young.stats[a] ? b : a));
    young.stats[low] = Math.min(100, young.stats[low] + M.gain);
    const b = moveBond(people, m.id, young.id, 5, `${m.name} has been teaching ${young.name}`, c.today, 'mentor', m.id);
    b.given = (b.given ?? 0) + M.gain;
  }
}

function monthly(c: Career): void {
  const rnd = seededRng(hashSeed(c.seed, 'personality', c.today));
  for (const w of WRESTLERS) {
    if (w.id === c.player) continue;
    const p = c.people[w.id];
    if (!p || p.retired || rnd() >= TRAIT_DRIFT_CHECK) continue;
    if (p.traitAt && daysBetween(p.traitAt, c.today) < TRAIT_DRIFT_MIN_DAYS) continue;
    drift(c, w, p, rnd);
  }
  mentorship(c, rnd);
}

/** You were mentored or you mentor: the trait follows from the bond (for the card, see EVENT_LEANINGS). */
export const isMentorOf = (a: string, b: string): boolean => bondOf(P(), a, b)?.mentor === a;

setCareerHooks({ daily, monthly, mine: afterMine });
void letter;
