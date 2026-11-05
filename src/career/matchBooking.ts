// AI booking for the match overhaul (stage 9, behind FEATURES.matches). After a card's drawn up in singles,
// each promotion's taste reshapes it: tag title defences and tag matches (Japan most), SLN's trios and lucha
// multi-mans, END and IVW's hardcore matches (only for those willing), the odd triple threat and four-way,
// and on a flagship its big gimmick match — a Rumble, a battle royal, the Chamber, WarGames, the Cell or
// Money in the Bank. A briefcase holder may cash in on the night. You're in it if you're on the show.
import { findWrestler, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import type { StipulationId } from '../engine/types';
import { activeWorld } from '../world/world';
import { activeTeams, briefcaseOf, teamOf, willing, type Team } from '../world/matchWorld';
import { available, setCardHook, showRoster, sinceLastDefence, titlePending } from './booker';
import { boutPeople, inBout, multiBout } from './bouts';
import { daysBetween } from './dates';
import { FEATURES } from './tuning';
import type { Bout, Career, Show } from './types';

type Big = 'rumble' | 'battle_royal' | 'chamber' | 'wargames' | 'cell' | 'mitb';
interface Style { tag: number; multi: number; hardcore: number; trios?: number; big: Big }

/** Each promotion's taste (Lyra's calls: SLN trios and lucha multi-mans; END and IVW hardcore; Japan tags; a flagship's gimmick match). */
export const STYLE: Record<string, Style> = {
  VWF: { tag: 0.5, multi: 0.15, hardcore: 0.08, big: 'rumble' },
  TCG: { tag: 0.45, multi: 0.12, hardcore: 0.06, big: 'cell' },
  SLN: { tag: 0.35, multi: 0.25, hardcore: 0.05, trios: 0.6, big: 'battle_royal' },
  END: { tag: 0.45, multi: 0.1, hardcore: 0.35, big: 'wargames' },
  IVW: { tag: 0.35, multi: 0.1, hardcore: 0.4, big: 'mitb' },
  NWGP: { tag: 0.7, multi: 0.1, hardcore: 0.04, big: 'chamber' },
  ZWA: { tag: 0.65, multi: 0.1, hardcore: 0.05, big: 'mitb' },
  UFC: { tag: 0.4, multi: 0.1, hardcore: 0.1, big: 'battle_royal' },
  SSWC: { tag: 0.45, multi: 0.15, hardcore: 0.08, big: 'cell' },
  AAWA: { tag: 0.45, multi: 0.12, hardcore: 0.06, big: 'chamber' },
};
const HARDCORE_STIPS: StipulationId[] = ['street_fight', 'no_holds_barred', 'falls_count_anywhere', 'tables'];
const DEATHMATCH_PROMOS = new Set(['END', 'IVW']);

const big = (show: Show) => show.kind === 'flagship' || show.kind === 'special';
/** Bouts that can be broken up and re-booked: nothing promised, no titles, no cup, no farewell, nobody's feud, not yours. */
const loose = (c: Career, b: Bout) => !b.title && !b.tourney && !b.farewell && !b.feud && !b.earn && !b.tryout && !b.sides && !inBout(b, c.player);
const pick = <T,>(rnd: Rng, xs: readonly T[]): T | undefined => xs[Math.floor(rnd() * xs.length)];

/** The pool for reshaping: wrestlers in loose bouts, and anyone on the roster who isn't booked yet. */
function freePool(c: Career, show: Show, card: Bout[]): { free: Set<string>; loose: Bout[] } {
  const busyElsewhere = new Set<string>();
  for (const s of Object.values(c.shows)) if (s.id !== show.id && s.date === show.date && s.card) for (const b of s.card) for (const id of boutPeople(b)) busyElsewhere.add(id);
  const onCard = new Set(card.flatMap(boutPeople));
  const ls = card.filter((b) => loose(c, b));
  const free = new Set<string>(ls.flatMap(boutPeople));
  for (const w of showRoster(show, WRESTLERS)) {
    if (w.id === c.player || onCard.has(w.id) || busyElsewhere.has(w.id) || !available(c.people[w.id], show.date)) continue;
    free.add(w.id);
  }
  return { free, loose: ls };
}

/** Take people out of the free pool, breaking up the loose bouts they were in (their opponents go back in the pool). */
function claim(card: Bout[], pool: { free: Set<string>; loose: Bout[] }, ids: string[]): void {
  for (const id of ids) {
    pool.free.delete(id);
    const b = pool.loose.find((x) => x.a === id || x.b === id);
    if (b) {
      pool.loose = pool.loose.filter((x) => x !== b);
      const i = card.indexOf(b);
      if (i >= 0) card.splice(i, 1);
    }
  }
}

/** Put the pool's leftovers back into singles bouts (whoever's left alone sits it out). */
function repair(card: Bout[], pool: { free: Set<string>; loose: Bout[] }, at: number): void {
  const onCard = new Set(card.flatMap(boutPeople));
  const left = [...pool.free].filter((id) => !onCard.has(id)).map((id) => findWrestler(id)!).filter(Boolean);
  for (const g of ['MALE', 'FEMALE'] as const) {
    const xs = left.filter((w) => w.gender === g);
    for (let i = 0; i + 1 < xs.length && card.length < at; i += 2) card.splice(Math.max(0, card.length - 2), 0, { a: xs[i]!.id, b: xs[i + 1]!.id });
  }
}

const teamFree = (t: Team, free: Set<string>) => t.members.every((id) => free.has(id));
const fans = (id: string) => { const w = findWrestler(id); return w ? Object.values(w.fans).reduce((a, b) => a + b, 0) : 0; };

/**
 * A tag (or trios) title on the line: the champions against the best free team, or — vacant — the two best
 * teams for it. Your own team defends when you're on the show (you've no say in who you face).
 */
function teamTitle(c: Career, show: Show, card: Bout[], pool: ReturnType<typeof freePool>, rnd: Rng, kind: 'tag' | 'trios', chance: number): void {
  const title = TITLES.find((t) => t.kind === kind && (show.promos ?? [show.promo]).some((p) => t.id.startsWith(`${p}_`)));
  if (!title || titlePending(c, title.id, show)) return;
  const W = activeWorld(), champs = title.team ? W.teams?.[title.team] : undefined;
  const mine = champs?.members.includes(c.player);
  const myBout = mine ? card.find((b) => inBout(b, c.player) && !b.title && !b.feud && !b.earn && !b.tourney && !b.sides && !b.tryout) : undefined;
  if (mine && !myBout) return;
  const overdue = sinceLastDefence(c, title.id, show) > 42;
  if (rnd() > (overdue || !champs ? Math.max(chance, 0.6) : chance)) return;
  const free = (t: Team) => t.members.every((id) => id === c.player ? !!myBout : pool.free.has(id));
  const gender = (t: Team) => findWrestler(t.members[0]!)?.gender;
  const size = kind === 'trios' ? 3 : 2;
  const teams = activeTeams(W).filter((t) => t.promo === show.promo && t.members.length === size && !!t.trios === (kind === 'trios') && free(t)
    && (!champs || (t !== champs && gender(t) === gender(champs)))).sort((a, b) => b.chemistry + sumFans(b) / 1e5 - a.chemistry - sumFans(a) / 1e5);
  let sides: string[][], planned: string;
  if (champs) {
    if (champs.split || !free(champs)) return;
    const rival = teams[0];
    if (!rival) return;
    sides = [champs.members, rival.members];
    planned = rnd() < 0.6 ? champs.members[0]! : rival.members[0]!;
  } else {
    const [x, y] = teams.filter((t) => gender(t) === gender(teams[0]!));
    if (!x || !y) return;
    sides = [x.members, y.members];
    planned = rnd() < 0.5 ? x.members[0]! : y.members[0]!;
  }
  if (myBout) {
    const opp = myBout.a === c.player ? myBout.b : myBout.a;
    card.splice(card.indexOf(myBout), 1);
    pool.free.add(opp);
  }
  claim(card, pool, sides.flat().filter((id) => id !== c.player));
  const b = multiBout(sides, { title: title.id, tag: true, type: 'tag' }, mine ? c.player : undefined);
  // The planned winner, by side lead (a or b) so the booked nudge lands on the right team.
  b.planned = b.sides!.find((s) => s.includes(planned))![0]!;
  card.splice(Math.max(0, card.length - 1), 0, b);
}
const sumFans = (t: Team) => t.members.reduce((s, id) => s + fans(id), 0);

/** Two free teams in a tag match (or trios). */
function teamMatch(card: Bout[], pool: ReturnType<typeof freePool>, promo: string, trios: boolean): boolean {
  const ts = activeTeams(activeWorld()).filter((t) => t.promo === promo && !!t.trios === trios && teamFree(t, pool.free));
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const a = ts[i]!, b = ts[j]!;
    if (findWrestler(a.members[0]!)?.gender !== findWrestler(b.members[0]!)?.gender) continue;
    claim(card, pool, [...a.members, ...b.members]);
    card.splice(Math.max(0, card.length - 2), 0, multiBout([a.members, b.members], { tag: true, type: 'tag' }));
    return true;
  }
  return false;
}

/** Two loose bouts become a four-way (or one and a spare a triple threat). */
function multiMan(card: Bout[], pool: ReturnType<typeof freePool>, rnd: Rng): void {
  const ls = pool.loose.filter((b) => findWrestler(b.a)?.gender === findWrestler(b.b)?.gender);
  const [x, y] = ls;
  if (!x) return;
  if (y && findWrestler(y.a)?.gender === findWrestler(x.a)?.gender && rnd() < 0.6) {
    const ids = [x.a, x.b, y.a, y.b];
    claim(card, pool, ids);
    card.splice(Math.max(0, card.length - 2), 0, multiBout(ids.map((id) => [id]), { type: 'fourway' }));
    return;
  }
  const spare = [...pool.free].find((id) => !inBout(x, id) && findWrestler(id)?.gender === findWrestler(x.a)?.gender && !pool.loose.some((b) => inBout(b, id)));
  if (!spare) return;
  const ids = [x.a, x.b, spare];
  claim(card, pool, ids);
  card.splice(Math.max(0, card.length - 2), 0, multiBout(ids.map((id) => [id]), { type: 'triple' }));
}

/** Hardcore matches for those who'll have them (deathmatches only where they love them). */
function hardcore(card: Bout[], show: Show, rnd: Rng, chance: number): void {
  for (const b of card) {
    if (b.sides || b.stip) continue;
    const ws = boutPeople(b).map((id) => findWrestler(id)).filter((w): w is Wrestler => !!w);
    if (ws.some((w) => willing(w) < 0)) continue;
    // The hardcore title is always defended under hardcore rules.
    const hcTitle = b.title && TITLES.find((t) => t.id === b.title)?.kind === 'hardcore';
    if (!hcTitle && rnd() > chance) continue;
    const loves = ws.every((w) => willing(w) > 0);
    b.stip = loves && DEATHMATCH_PROMOS.has(show.promo) && rnd() < 0.4 ? 'deathmatch' : pick(rnd, HARDCORE_STIPS)!;
  }
}

/** A flagship's gimmick match, out of whoever's free (you too, if you're on the show and not in anything that matters). */
function bigMatch(c: Career, show: Show, card: Bout[], pool: ReturnType<typeof freePool>, rnd: Rng, kind: Big): void {
  // The marquee ones are once a year; a battle royal or the Cell, now and then (two months apart at least:
  // some promotions' weekly show is their flagship).
  const last = c.bigMatches?.[show.promo];
  const since = last ? daysBetween(last, show.date) : Infinity;
  if (ANNUAL.has(kind) ? since < 300 : since < 56 || rnd() > 0.5) return;
  const mineLoose = card.find((b) => inBout(b, c.player) && !b.title && !b.feud && !b.earn && !b.tourney && !b.sides);
  const youIn = !!mineLoose && rnd() < 0.5;
  const me = findWrestler(c.player);
  const gender = 'MALE';
  const field = [...pool.free].filter((id) => findWrestler(id)?.gender === gender).sort((a, b) => fans(b) - fans(a));
  const want = kind === 'rumble' ? 20 : kind === 'battle_royal' ? 12 : kind === 'chamber' ? 6 : kind === 'wargames' ? 8 : kind === 'mitb' ? 6 : 0;
  const top = TITLES.find((t) => t.promotionId && (show.promos ?? [show.promo]).some((p) => t.id.startsWith(`${p}_`)) && (t.kind ?? 'singles') === 'singles' && t.gender === 'MALE');
  if (kind === 'cell') {
    // The Cell: the hottest feud's match goes inside it.
    const f = card.find((b) => b.feud && !b.title && !b.sides);
    if (f) { f.stip = 'hell_in_a_cell'; (c.bigMatches ??= {})[show.promo] = show.date; }
    return;
  }
  const need = youIn && me?.gender === gender ? want - 1 : want;
  if (field.length < Math.max(4, Math.floor(need * 0.6))) return;
  const ids = field.slice(0, need);
  if (youIn && me?.gender === gender && mineLoose) {
    // Out of your singles match and into this one (your opponent goes back in the pool).
    const opp = mineLoose.a === c.player ? mineLoose.b : mineLoose.a;
    card.splice(card.indexOf(mineLoose), 1);
    pool.free.add(opp);
    ids.unshift(c.player);
  }
  claim(card, pool, ids.filter((id) => id !== c.player));
  let b: Bout;
  if (kind === 'wargames') {
    const half = Math.floor(ids.length / 2);
    b = multiBout([ids.slice(0, half), ids.slice(half, half * 2)], { stip: 'wargames', type: 'tornado' }, c.player);
  } else {
    const type = kind === 'rumble' ? 'rumble' : kind === 'battle_royal' ? 'battle_royal' : 'multi';
    b = multiBout(ids.map((id) => [id]), {
      type, ...(kind === 'chamber' ? { stip: 'elimination_chamber' as StipulationId, elimination: true } : {}),
      ...(kind === 'mitb' ? { stip: 'money_in_the_bank' as StipulationId, stakes: { kind: 'briefcase' as const } } : {}),
      ...((kind === 'rumble' || kind === 'battle_royal') && top ? { stakes: { kind: 'contendership' as const, title: top.id } } : {}),
    }, c.player);
  }
  card.splice(Math.max(0, card.length - 1), 0, b);
  (c.bigMatches ??= {})[show.promo] = show.date;
}
const ANNUAL = new Set<Big>(['rumble', 'chamber', 'wargames', 'mitb']);

/** A briefcase holder on the show cashes in right after the top title's been defended. */
function cashIn(c: Career, show: Show, card: Bout[], pool: ReturnType<typeof freePool>, rnd: Rng): void {
  const W = activeWorld();
  const holders = (W.briefcases ?? []).filter((b) => !b.cashed && b.until > show.date && (show.promos ?? [show.promo]).includes(b.promo) && b.holder !== c.player);
  for (const bc of holders) {
    const tb = card.find((b) => b.title && !b.sides && (TITLES.find((t) => t.id === b.title)?.kind ?? 'singles') === 'singles');
    if (!tb || !pool.free.has(bc.holder) || rnd() > 0.25 || !briefcaseOf(W, bc.holder)) continue;
    const champ = TITLES.find((t) => t.id === tb.title)!.holder;
    if (!champ) continue;
    claim(card, pool, [bc.holder]);
    card.splice(card.indexOf(tb) + 1, 0, { a: bc.holder, b: champ, title: tb.title, cashIn: true, planned: rnd() < 0.8 ? bc.holder : champ });
    return;
  }
}

/** You and your partner in a tag match, now and then (if you've a team and they're here). */
function yourTeam(c: Career, show: Show, card: Bout[], pool: ReturnType<typeof freePool>, rnd: Rng): void {
  const W = activeWorld(), t = teamOf(W, c.player);
  if (!t || rnd() > 0.35) return;
  const mine = card.find((b) => inBout(b, c.player) && !b.title && !b.feud && !b.earn && !b.tourney && !b.sides && !b.tryout);
  const partners = t.members.filter((id) => id !== c.player);
  if (!mine || !partners.every((id) => pool.free.has(id))) return;
  const rival = activeTeams(W).find((x) => x !== t && x.promo === show.promo && x.members.length === t.members.length && teamFree(x, pool.free));
  if (!rival) return;
  const opp = mine.a === c.player ? mine.b : mine.a;
  card.splice(card.indexOf(mine), 1);
  pool.free.add(opp);
  claim(card, pool, [...partners, ...rival.members]);
  card.splice(Math.max(0, card.length - 2), 0, multiBout([t.members, rival.members], { tag: true, type: 'tag' }, c.player));
}

/** The card hook: a promotion's taste, over a card that's been drawn up in singles. */
export function styleCard(c: Career, show: Show, card: Bout[]): void {
  if (!FEATURES.matches || show.promo === 'TIS' || !activeWorld().teams) return;
  const style = STYLE[show.promo];
  if (!style) return;
  const rnd = seededRng(hashSeed(c.seq, 'style', show.id));
  const size = card.length;
  const pool = freePool(c, show, card);
  teamTitle(c, show, card, pool, rnd, 'tag', big(show) ? 0.9 : 0.3);
  if (style.trios) teamTitle(c, show, card, pool, rnd, 'trios', big(show) ? 0.8 : 0.25);
  yourTeam(c, show, card, pool, rnd);
  // A tag match (sometimes two, where tag wrestling's the thing).
  if (rnd() < style.tag && teamMatch(card, pool, show.promo, false) && rnd() < style.tag / 2) teamMatch(card, pool, show.promo, false);
  if (style.trios && rnd() < style.trios) teamMatch(card, pool, show.promo, true);
  if (rnd() < style.multi) multiMan(card, pool, rnd);
  if (show.kind === 'flagship') bigMatch(c, show, card, pool, rnd, style.big);
  cashIn(c, show, card, pool, rnd);
  hardcore(card, show, rnd, style.hardcore * (big(show) ? 1.5 : 1));
  repair(card, pool, size);
}

setCardHook(styleCard);
