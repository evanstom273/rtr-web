// Life stage 6: status. What you own only counts when you show it off (Lyra's call): post the new car, turn up in the
// jet, throw the party. A heel showing off gets heat; a face loses a few fans; the locker room is envious or impressed,
// and someone always asks to borrow. The booker likes a star who looks like one, until it looks like you've stopped
// being hungry. A megastar who never shows off is respected for it. Your partner has views on your home either way.
import { seededRng, hashSeed } from '../../engine/rng';
import { findWrestler, WRESTLERS } from '../../data/rtr';
import { activeWorld } from '../../world/world';
import { bondOf } from '../../world/people';
import { letter, person, spend } from '../career';
import { daysBetween } from '../dates';
import { capLeft, sendIn } from '../phone';
import { moveRelation } from '../relations';
import { partnerOf } from '../romance';
import { postToFeed, publicSay } from '../social';
import { COST_INDEX, PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { worthOf } from './aiMoney';
import { lifeWorld } from '../../world/lifeWorld';
import { liveHome, life, regionOfCity } from './state';
import { tierName } from './homes';
import { netWorth } from './worth';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
export type FlauntKind = 'home' | 'car' | 'jet' | 'luxury' | 'party';
export const FLAUNTS: FlauntKind[] = ['home', 'car', 'jet', 'luxury', 'party'];

const HOME_RANK = { room: 0, flat: 1, house: 2, penthouse: 3, mansion: 4 } as Record<string, number>;
const partyCost = (c: Career) => Math.round(PB.status.party * COST_INDEX[regionOfCity(life(c).city)]);

/** What you'd be showing off (or why you can't). */
export function flauntWhat(c: Career, kind: FlauntKind): string | null {
  const L = life(c);
  switch (kind) {
    case 'home': { const h = L.homes.find((x) => x.own && (HOME_RANK[x.tier] ?? 0) >= 2); return h ? `your ${tierName(h).toLowerCase()} in ${h.city}` : null; }
    case 'car': return L.cars.some((v) => v.tier === 'luxury_car') ? 'the new car' : null;
    case 'jet': return L.cars.some((v) => v.tier === 'jet_share' || v.tier === 'jet') ? 'the jet' : null;
    case 'luxury': { const x = [...(L.luxury ?? [])].sort((a, b) => b.v - a.v)[0]; return x ? `the ${PB.luxury[x.kind].name.toLowerCase()}` : null; }
    case 'party': return c.money >= partyCost(c) ? `a party (${money(partyCost(c))})` : null;
  }
}

/** How much you've shown off lately (flaunts in the last 90 days). */
export const flauntCount = (c: Career): number => (c.life?.flaunts ?? []).filter((d) => daysBetween(d, c.today) <= 90).length;

/** Show it off. Once a week. */
export function flaunt(c: Career, kind: FlauntKind): string {
  const L = life(c);
  const what = flauntWhat(c, kind);
  if (!what) return kind === 'party' ? `A party costs ${money(partyCost(c))}.` : 'You’ve nothing like that to show off.';
  const last = L.flaunts?.[0];
  if (last && daysBetween(last, c.today) < 7) return 'You showed off this week already.';
  const me = findWrestler(c.player)!;
  const rnd = seededRng(hashSeed(c.seed, 'flaunt', c.today, kind));
  if (kind === 'party') spend(c, -partyCost(c), 'A party', 'luxury');
  L.flaunts = [c.today, ...(L.flaunts ?? [])].slice(0, 12);
  const out: string[] = [];
  // The fans: a heel gets heat for it, a face looks out of touch.
  const big = kind === 'jet' || kind === 'party' ? 1.5 : 1;
  if (me.disposition === 'HEEL') {
    const r = publicSay(c, PB.status.heelFans * big, 0, `flaunt${kind}`);
    if (r.fans) out.push(`${r.fans.toLocaleString('en-GB')} more fans love to hate you for it`);
  } else {
    const r = publicSay(c, 0, PB.status.faceLoss, `flaunt${kind}`);
    if (r.backfired) out.push(`${Math.abs(r.fans).toLocaleString('en-GB')} fans think you’ve lost touch`);
  }
  postToFeed(c, kind === 'party' ? 'Last night. No notes. 🥂' : kind === 'jet' ? 'Wheels up. See you tonight.' : kind === 'car' ? 'New toy.' : kind === 'home' ? 'Home.' : 'Treated myself.');
  // The locker room: envy or respect, and a hand out.
  const k = person(c, c.player).contract;
  const mates = WRESTLERS.filter((w) => w.id !== c.player && !c.people[w.id]?.retired && k && (w.promotion === k.promo || w.also?.includes(k.promo))).slice(0, 40);
  const P = activeWorld().people, W = lifeWorld().wealth, mine = netWorth(c);
  let envy = 0, respect = 0;
  for (const w of mates) {
    if (!P || !bondOf(P, c.player, w.id) || rnd() > 0.35) continue;
    const theirs = worthOf(W?.[w.id]);
    if (theirs < mine / 4 && rnd() < PB.status.envy) { moveRelation(c, w.id, -3, 'Envious of how you live'); envy++; }
    else { moveRelation(c, w.id, 2, 'Impressed by how you live'); respect++; }
  }
  if (envy || respect) out.push(`${envy ? `${envy} in the locker room are envious` : ''}${envy && respect ? ', ' : ''}${respect ? `${respect} impressed` : ''}`);
  const skint = mates.find((w) => P && bondOf(P, c.player, w.id) && W?.[w.id] && worthOf(W[w.id]) < 20_000 && !c.lent?.some((l) => l.who === w.id));
  if (skint && capLeft(c) > 0 && rnd() < PB.status.ask) {
    const amount = [1_000, 2_500, 5_000][Math.floor(rnd() * 3)]!;
    sendIn(c, skint.id, `Saw the post. Looking good! Listen… any chance you could lend me ${money(amount)}? I’m a bit stuck.`, [{ id: 'lend_yes', label: `Lend them ${money(amount)}`, detail: 'Closer · if they pay it back' }, { id: 'lend_no', label: 'Can’t, sorry', detail: 'They cool on you a little' }], undefined, { amount: String(amount) });
    out.push(`${skint.name} has asked to borrow some`);
  }
  // The booker: a star who looks like one, until it's every week and you're not winning.
  const p = person(c, c.player);
  const recent = c.history.slice(-8), wins = recent.filter((m) => m.result === 'win').length;
  if (flauntCount(c) > 3 && wins < recent.length / 2) { p.rep = Math.max(0, p.rep - 2); out.push('the office wonders if you’re still hungry'); }
  else if (flauntCount(c) <= 2) p.rep = Math.min(100, p.rep + 1);
  return `You showed off ${what}${out.length ? `: ${out.join('; ')}.` : '.'}`;
}

/**
 * The 1st: the humble megastar (rich, never shows it, once a year the locker room notices) and your partner on your
 * home (a rich wrestler in a poky flat hears about it; a lovely home keeps them happy).
 */
export function monthlyStatus(c: Career, month: string): void {
  const L = life(c), mine = netWorth(c);
  if (month.endsWith('-06') && mine >= PB.status.humbleAt && !flauntCount(c) && !(L.flaunts ?? []).some((d) => daysBetween(d, c.today) <= 365)) {
    const k = person(c, c.player).contract;
    let n = 0;
    for (const w of WRESTLERS) if (k && w.promotion === k.promo && w.id !== c.player && n < 12) { moveRelation(c, w.id, 2, 'Rich, and never shows it'); n++; }
    person(c, c.player).rep = Math.min(100, person(c, c.player).rep + 2);
    letter(c, { kind: 'news', from: 'The locker room', subject: 'Still one of the lads', body: ['Word is you’re worth a fortune and you still drive yourself to shows and buy your round. People notice that.'] });
  }
  const p = partnerOf(c.player);
  if (!p || !['living', 'married'].includes(p.bond.love!.st)) return;
  const rank = HOME_RANK[liveHome(c).tier] ?? 0;
  const ought = mine >= 3_000_000 ? 3 : mine >= 750_000 ? 2 : mine >= 150_000 ? 1 : 0;
  if (rank < ought) moveRelation(c, p.other, -2, rank === 0 ? 'Still sharing a room, with what you earn' : 'Why are we still living here?');
  else if (rank >= 2) moveRelation(c, p.other, 1, 'Loves the house');
  void seededRng;
}
