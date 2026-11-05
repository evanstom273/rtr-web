// Life: tax and your agent. Tax comes off every payment as it arrives, on what you've earned so far this year
// (bands reset every January; they scale with where you live). The agent takes a cut of contract money only, and
// earns it: promotions pay more, and they find you offers.
import { seededRng, hashSeed } from '../../engine/rng';
import { fansTotal, findWrestler, PROMOTIONS } from '../../data/rtr';
import { personName } from '../../data/rtr/names';
import { letter } from '../career';
import { baseFor, offerDeal, setAgentLift } from '../contracts';
import { COST_INDEX, NEGO_ACCEPT, PRICE_BOOK as PB } from '../tuning';
import type { Career, Entry, Offer } from '../types';
import { life, on, regionOfCity, type AgentTier } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
/** What counts as income (the rest is moving your own money about). */
const TAXABLE = new Set<Entry['kind']>(['fee', 'bonus', 'merch', 'wage', 'event', 'company', 'home', 'business', 'invest', 'school']);

/** The tax on the next `gross` pounds this year, where you live (marginal bands). */
export function taxOn(c: Career, gross: number): number {
  const L = life(c);
  const year = c.today.slice(0, 4);
  if (L.tax.year !== year) L.tax = { year, earned: 0, paid: 0 };
  const region = regionOfCity(L.city);
  const scale = COST_INDEX[region], rate = PB.taxRegion[region];
  let from = L.tax.earned, left = gross, tax = 0, low = 0;
  for (const [top, r] of PB.taxBands) {
    const hi = top * scale;
    if (from < hi && left > 0) {
      const inBand = Math.min(left, hi - Math.max(from, low));
      tax += inBand * r * rate;
      left -= inBand;
      from += inBand;
    }
    low = hi;
  }
  return Math.round(tax);
}

/** The effective rate on a year's earnings where you live (for the screens). */
export function effectiveRate(c: Career, year: number): number {
  const L = life(c);
  const keep = L.tax;
  L.tax = { year: c.today.slice(0, 4), earned: 0, paid: 0 };
  const t = taxOn(c, year);
  L.tax = keep;
  return year ? t / year : 0;
}

/** The income hook (career.ts spend): tax on income, the agent's cut of contract money. */
export function offIncome(c: Career, amount: number, kind: Entry['kind'], contract: boolean): { tax: number; agent: number } {
  if (!on('money') || !TAXABLE.has(kind)) return { tax: 0, agent: 0 };
  const L = life(c);
  // Their cut of deals they did: contract money from a deal signed through them.
  const p = c.people[c.player];
  const theirs = !!p && (!!p.contract?.agent || !!p.deals?.some((k) => k.agent));
  const agent = contract && L.agent && theirs ? Math.round(amount * PB.agents[L.agent.tier].cut) : 0;
  const tax = taxOn(c, amount);
  L.tax.earned += amount;
  L.tax.paid += tax;
  const m = c.today.slice(0, 7);
  L.months = { ...(L.months ?? {}), [m]: (L.months?.[m] ?? 0) + amount };
  return { tax, agent };
}

/** Keep a year of monthly earnings (for what you can borrow). */
export function pruneMonths(c: Career): void {
  const L = life(c);
  if (!L.months) return;
  const keys = Object.keys(L.months).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 13))) delete L.months[k];
}

// ------------------------------------------------------------------ the agent

export const AGENT_TIERS = Object.keys(PB.agents) as AgentTier[];
/** Whether an agent of this kind would take you on (they want fans). */
export const agentTakes = (c: Career, tier: AgentTier): boolean => fansTotal(findWrestler(c.player)!) >= PB.agents[tier].fans;

export function hireAgent(c: Career, tier: AgentTier): string {
  if (!agentTakes(c, tier)) return `A ${PB.agents[tier].name.toLowerCase()} wants clients with ${PB.agents[tier].fans.toLocaleString('en-GB')}+ fans.`;
  const L = life(c);
  const me = findWrestler(c.player)!;
  const r = seededRng(hashSeed(c.seed, 'agent', tier, c.today));
  const name = personName(r, me.country, r() < 0.5 ? 'MALE' : 'FEMALE');
  L.agent = { tier, name, mode: L.agent?.mode ?? 'advise', since: c.today, prio: L.agent?.prio ?? ['money'] };
  return `${name} is your agent now: ${Math.round(PB.agents[tier].cut * 100)}% of your contract money, and promotions pay you about ${Math.round(PB.agents[tier].deals * 100)}% more.`;
}
export function fireAgent(c: Career): string {
  const L = life(c);
  if (!L.agent) return 'You haven’t got one.';
  const n = L.agent.name;
  delete L.agent;
  return `${n}’s gone. You’ll do your own deals.`;
}

/** Promotions pay you more with an agent in your corner. */
setAgentLift((c) => (on('money') && c.life?.agent ? 1 + PB.agents[c.life.agent.tier].deals : 1));

/** Advise: what they'd realistically go to for these terms (shown in the negotiation). */
export const agentCeiling = (c: Career, o: Offer): number => Math.round(baseFor(c, o, o) * NEGO_ACCEPT / 5) * 5;

/**
 * Handle it: your agent does the haggling on any new offer, to your priorities. They take it as far as the
 * promotion will go on money (or keeps the clauses that matter to you and settles the money around them), and
 * write to say where it's landed. You still sign or don't.
 */
export function agentHandles(c: Career): void {
  const L = life(c);
  if (!on('money') || L.agent?.mode !== 'handle') return;
  for (const o of c.offers) {
    if (o.status !== 'open' || o.agent) continue;
    o.agent = true;
    const best = agentCeiling(c, o);
    if (best > o.fee) {
      const was = o.fee;
      o.fee = best;
      o.said = `“Fine. £${best.toLocaleString('en-GB')} it is.”`;
      letter(c, { kind: 'news', from: L.agent.name, subject: `${o.promo}: I got them up`, body: [`They opened at ${money(was)} a match. I’ve got them to ${money(best)}: that’s as far as they’ll go. Sign it or don’t, it’s your call.`] });
    }
  }
}

/** Monthly: an agent finds you offers (a local agent in your region now and then, a super agent anywhere). */
export function agentFinds(c: Career): void {
  const L = life(c);
  if (!on('money') || !L.agent) return;
  const r = seededRng(hashSeed(c.seed, 'agent-find', c.today));
  if (r() > PB.agents[L.agent.tier].extra * 0.35) return;
  const me = findWrestler(c.player)!;
  const mine = c.people[c.player]?.contract?.promo;
  const region = regionOfCity(L.city);
  const pool = PROMOTIONS.filter((p) => p.initials !== 'TIS' && p.initials !== mine && !p.indie && (L.agent!.tier === 'super' || regionKey(p.region) === region || L.agent!.tier === 'established'));
  if (!pool.length) return;
  const p = pool[Math.floor(r() * pool.length)]!;
  offerDeal(c, p.initials, `${L.agent.name} has been talking to us about ${me.name}`);
}
const regionKey = (r: string) => ({ NORTH_AMERICA: 'northAmerica', SOUTH_AMERICA: 'southAmerica', EUROPE: 'europe', ASIA: 'asia', AFRICA: 'africa', OCEANIA: 'oceania' } as Record<string, string>)[r] ?? 'europe';
