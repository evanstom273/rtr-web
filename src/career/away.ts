// While you're away (Lyra's call): during a skip your character answers mail by your standing orders, so
// an indie wrestler skipping a month still takes bookings. Indie offers, career events, people and press,
// and contract offers each have their own order; anything the orders don't cover waits for you.
import { findWrestler } from '../data/rtr';
import { person } from './career';
import { signOffer } from './contracts';
import { fmtDay } from './dates';
import { baseCountry, routineOf } from './day';
import { answerEvent, eventChoices, eventLibrary } from './events';
import { acceptLetter, declineLetter, indieAllowed } from './offers';
import { regionOfCountry } from './places';
import { replyTo } from './mail';
import type { AwayOrders, Career } from './types';

export const defaultOrders = (): AwayOrders => ({
  on: true, indie: { on: true, minFee: 0, reach: 'region', maxFatigue: 70 }, events: 'leave', people: 'leave', contracts: { on: false, same: true, minFee: 0 },
});
export const ordersOf = (c: Career): AwayOrders => (routineOf(c).away ??= defaultOrders());

const TONE: Record<Exclude<AwayOrders['people'], 'leave'>, string[]> = {
  gracious: ['gracious', 'thanks', 'high', 'understood', 'thank_bk', 'humble', 'congrats', 'wish', 'deny', 'share', 'decline', 'chat', 'happy', 'there', 'help', 'rise'],
  cocky: ['cocky', 'brag', 'laugh', 'i_cocky', 'bigger', 'more', 'coy', 'share', 'congrats', 'tease', 'laugh_off', 'tip', 'brief', 'happy'],
  fiery: ['fire', 'accept', 'i_callout', 'shot', 'complain', 'rematch', 'confirm', 'cocky', 'fire_back', 'brush', 'jealous', 'brief'],
};
const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/** Answer what the orders cover. Returns a line for each thing done, for the summary. */
export function answerForMe(c: Career): string[] {
  const o = ordersOf(c);
  if (!o.on) return [];
  const out: string[] = [];
  const me = findWrestler(c.player);
  for (const l of [...c.letters].reverse()) {
    if (l.done || l.replied) continue;
    const a = l.action;
    // Indie dates.
    if (a?.type === 'indie' && o.indie.on) {
      const show = c.shows[a.show];
      if (!show) continue;
      const home = baseCountry(c);
      const far = o.indie.reach === 'country' ? show.country !== home : o.indie.reach === 'region' ? regionOfCountry(show.country) !== regionOfCountry(home) : false;
      const tired = person(c, c.player).fatigue > o.indie.maxFatigue;
      const why = a.fee < o.indie.minFee ? `pays under ${money(o.indie.minFee)}` : far ? 'too far' : tired ? 'you were too tired' : !indieAllowed(c, show).ok ? indieAllowed(c, show).why ?? 'it didn’t fit' : null;
      if (why) { declineLetter(c, l); out.push(`Turned down ${show.name} (${fmtDay(show.date, 'dm')}): ${why}.`); continue; }
      const said = acceptLetter(c, l);
      out.push(l.done === 'accepted' ? `Took ${show.name}, ${show.city}, ${fmtDay(show.date, 'dm')} · ${money(a.fee)}.` : `Tried for ${show.name}: ${said}`);
      continue;
    }
    // Career events.
    if (a?.type === 'event' && o.events !== 'leave') {
      const def = eventLibrary().find((d) => d.id === c.events?.open[l.id]?.id);
      const choices = eventChoices(c, l.id).filter((x) => !x.blocked);
      const decline = (id: string) => !!def?.options.find((x) => x.id === id)?.decline;
      const pick = o.events === 'yes' ? choices.find((x) => !decline(x.id)) : choices.find((x) => decline(x.id)) ?? choices.at(-1);
      if (!pick) continue;
      const said = answerEvent(c, l.id, pick.id);
      out.push(`${l.subject}: ${pick.label}.${said ? ` ${said}` : ''}`);
      continue;
    }
    // Contract offers.
    if (a?.type === 'negotiate' && o.contracts.on) {
      const offer = c.offers.find((x) => x.id === a.offer);
      if (!offer || offer.status !== 'open') continue;
      const mine = person(c, c.player).contract?.promo ?? me?.promotion;
      if (o.contracts.same && offer.promo !== mine) continue;
      if (offer.fee < o.contracts.minFee) continue;
      signOffer(c, offer);
      l.done = 'accepted';
      out.push(`Signed with ${offer.promo}: ${offer.months} months at ${money(offer.fee)} a match.`);
      continue;
    }
    // People and press.
    if (l.replies?.length && o.people !== 'leave' && !a) {
      const prefs = TONE[o.people];
      const r = prefs.map((id) => l.replies!.find((x) => x.id === id)).find((x) => !!x) ?? l.replies[0]!;
      const said = replyTo(c, l.id, r.id);
      out.push(`${l.from}: you replied “${r.label}”.${said ? ` ${said}` : ''}`);
    }
  }
  return out;
}
