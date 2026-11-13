// Life stage 2: personal staff, medical help, and entrances. Staff are wages on the 1st for something every day;
// medical help is money for time back; an entrance is the crowd's heat at the bell.
import { seededRng, hashSeed } from '../../engine/rng';
import { findWrestler } from '../../data/rtr';
import { personName } from '../../data/rtr/names';
import type { MatchRulesConfig } from '../../engine/types';
import { answerForMe, ordersOf } from '../away';
import { letter, setEntranceHook, setMod, spend } from '../career';
import { addDays, daysBetween, weekday } from '../dates';
import { COST_INDEX, PRICE_BOOK as PB } from '../tuning';
import type { Bout, Career, Show } from '../types';
import { life, on, regionOfCity, type StaffRole } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
export const STAFF_ROLES = Object.keys(PB.staff) as StaffRole[];
export const hasStaff = (c: Career, role: StaffRole): boolean => !!c.life?.staff?.some((s) => s.role === role);
/** A month's wage where you live. */
export const wageOf = (c: Career, role: StaffRole): number => Math.round(PB.staff[role].wage * COST_INDEX[regionOfCity(life(c).city)] / 50) * 50;

export function hire(c: Career, role: StaffRole): string {
  const L = life(c);
  if (hasStaff(c, role)) return `You’ve already got a ${PB.staff[role].name.toLowerCase()}.`;
  const r = seededRng(hashSeed(c.seed, 'staff', role, c.today));
  const name = personName(r, findWrestler(c.player)?.country ?? 'UK', r() < 0.5 ? 'MALE' : 'FEMALE');
  (L.staff ??= []).push({ role, name, since: c.today });
  return `${name} starts as your ${PB.staff[role].name.toLowerCase()}: ${money(wageOf(c, role))} a month.`;
}
export function letGo(c: Career, role: StaffRole): string {
  const L = life(c);
  const s = L.staff?.find((x) => x.role === role);
  if (!s) return 'Nobody to let go.';
  L.staff = L.staff!.filter((x) => x !== s);
  return `${s.name} has gone.`;
}

/** The 1st: wages, and the recovery kit's running costs. */
export function monthlyStaff(c: Career): void {
  const L = life(c);
  for (const s of L.staff ?? []) spend(c, -wageOf(c, s.role), `Wages · ${s.name} (${PB.staff[s.role].name.toLowerCase()})`, 'staff');
  if (L.kit) spend(c, -PB.medical.kit.monthly, 'Running · recovery kit', 'staff');
}

/** Every day: the PA answers what your standing orders cover, and writes on Mondays with what they did. */
export function dailyPA(c: Career): void {
  if (!hasStaff(c, 'pa')) return;
  const o = ordersOf(c), was = o.on;
  o.on = true;
  const done = answerForMe(c);
  o.on = was;
  const L = life(c);
  if (done.length) L.paLog = [...(L.paLog ?? []), ...done].slice(-20);
  if (weekday(c.today) === 1 && L.paLog?.length) {
    const pa = L.staff!.find((s) => s.role === 'pa')!;
    letter(c, { kind: 'news', from: pa.name, subject: 'What I handled this week', body: L.paLog.slice(-8) });
    L.paLog = [];
  }
}

// ------------------------------------------------------------------ medical

/** What a private surgeon costs for the time you've got left out (and how much sooner you'd be back). */
export function surgeonOffer(c: Career): { cost: number; days: number } | null {
  const p = c.people[c.player];
  if (!p?.injury) return null;
  const left = daysBetween(c.today, p.injury.until);
  if (left < 7) return null;
  const [lo, hi] = PB.medical.surgeon;
  const cost = Math.round(Math.min(hi, Math.max(lo, lo + left * 600)) * COST_INDEX[regionOfCity(life(c).city)] / 100) * 100;
  return { cost, days: Math.round(left * PB.medical.surgeonCut) };
}
export function seeSurgeon(c: Career): string {
  const o = surgeonOffer(c), p = c.people[c.player];
  if (!o || !p?.injury) return 'Nothing a surgeon can speed up.';
  if (c.money < o.cost) return `You need ${money(o.cost)}.`;
  spend(c, -o.cost, `Private surgeon · ${p.injury.what}`, 'medical');
  p.injury = { ...p.injury, until: addDays(p.injury.until, -o.days) };
  return `Done privately: back ${o.days} days sooner.`;
}
/** A week in a rehab clinic: a quarter off what's left. */
export function clinicOffer(c: Career): { cost: number; days: number } | null {
  const p = c.people[c.player];
  if (!p?.injury) return null;
  const left = daysBetween(c.today, p.injury.until);
  if (left < 7) return null;
  return { cost: Math.round(PB.medical.clinicWeek * COST_INDEX[regionOfCity(life(c).city)] / 50) * 50, days: Math.round(left * PB.medical.clinicCut) };
}
export function goToClinic(c: Career): string {
  const o = clinicOffer(c), p = c.people[c.player];
  if (!o || !p?.injury) return 'You don’t need the clinic.';
  if (c.money < o.cost) return `You need ${money(o.cost)}.`;
  spend(c, -o.cost, 'A week in a rehab clinic', 'medical');
  p.injury = { ...p.injury, until: addDays(p.injury.until, -o.days) };
  return `A week of proper rehab: back ${o.days} days sooner.`;
}
export function buyKit(c: Career): string {
  const L = life(c);
  if (L.kit) return 'You’ve got one.';
  if (c.money < PB.medical.kit.price) return `You need ${money(PB.medical.kit.price)}.`;
  spend(c, -PB.medical.kit.price, 'Recovery kit (cryo, hyperbaric)', 'medical');
  L.kit = true;
  return 'The recovery kit’s in: your body bounces back quicker.';
}

// ------------------------------------------------------------------ entrances

type GearKey = 'theme' | 'video';
export function buyGear(c: Career, what: GearKey | 1 | 2 | 3): string {
  const L = life(c), g = (L.gear ??= {});
  if (what === 'theme' || what === 'video') {
    if (g[what]) return 'You’ve got that.';
    const price = PB.entrance[what].price;
    if (c.money < price) return `You need ${money(price)}.`;
    spend(c, -price, PB.entrance[what].name, 'event', { untaxed: true });
    g[what] = true;
    return `${PB.entrance[what].name}: done. The crowd will know it’s you.`;
  }
  if ((g.gear ?? 0) >= what) return 'You’ve got better already.';
  const t = PB.entrance.gear[what - 1]!;
  if (c.money < t.price) return `You need ${money(t.price)}.`;
  spend(c, -t.price, t.name, 'event', { untaxed: true });
  g.gear = what;
  return `${t.name}: you look the part.`;
}
export function setGearUse(c: Career, k: 'pyro' | 'set', v: boolean): void { (life(c).gear ??= {})[k] = v; }

/** Top of the card: the main event, or a title match. */
const topOfCard = (show: Show, bout: Bout) => (show.card ? show.card[show.card.length - 1] === bout : false) || !!bout.title;
const contractEntrance = (c: Career, show: Show) => {
  const p = c.people[c.player];
  return [p?.contract, ...(p?.deals ?? [])].some((k) => k?.entrance && (show.promos ?? [show.promo]).includes(k.promo));
};
/** Pyro: at the top of the card, or anywhere with the contract term (never on the indies' little shows unless you're top). */
export const pyroAllowed = (c: Career, show: Show, bout: Bout): boolean => topOfCard(show, bout) || contractEntrance(c, show);
/** A set piece: big shows only (a flagship or special), at the top of the card. */
export const setAllowed = (show: Show, bout: Bout): boolean => (show.kind === 'flagship' || show.kind === 'special') && topOfCard(show, bout);

/** Your entrance tonight: the heat it adds at the bell, what it costs, and what it looks like. */
export function entranceFor(c: Career, show: Show, bout: Bout): { heat: number; cost: number; what: string[] } {
  const g = c.life?.gear;
  if (!g) return { heat: 0, cost: 0, what: [] };
  let heat = 0, cost = 0;
  const what: string[] = [];
  if (g.theme) { heat += PB.entrance.theme.heat; what.push('the music hits'); }
  if (g.video && show.promo !== 'TIS') { heat += PB.entrance.video.heat; what.push('the video rolls'); }
  if (g.gear) heat += PB.entrance.gear[g.gear - 1]!.heat;
  if (g.pyro && pyroAllowed(c, show, bout)) { heat += PB.entrance.pyro.heat; cost += PB.entrance.pyro.cost; what.push('the pyro goes off'); }
  if (g.set && setAllowed(show, bout)) { heat += PB.entrance.set.heat; cost += PB.entrance.set.cost; what.push('the set rises out of the stage'); }
  return { heat: Math.min(PB.entrance.max, heat), cost, what };
}

setEntranceHook((c, show, bout, you, them): MatchRulesConfig['entrance'] => {
  if (!on('entrance') || c.spectator || !c.life?.gear) return undefined;
  const side = you === c.player ? 'you' : them === c.player ? 'them' : null;
  if (!side) return undefined;
  const e = entranceFor(c, show, bout);
  if (!e.heat) return undefined;
  const what = e.what.length ? e.what.join(', ').replace(/^./, (x) => x.toUpperCase()) : 'The gear catches the light';
  return { side, heat: e.heat, what };
});

/** After your match: pay for the pyro and the set. */
export function payEntrance(c: Career, show: Show, bout: Bout): void {
  if (!on('entrance')) return;
  const e = entranceFor(c, show, bout);
  if (e.cost) spend(c, -e.cost, `Entrance · ${show.name}`, 'event', { untaxed: true });
}

// ------------------------------------------------------------------ what staff do

const me = (c: Career, id: string) => on('staff') && id === c.player && !!c.life;
setMod('rehab', (c, id) => (me(c, id) ? (hasStaff(c, 'physio') ? 0.8 : 1) * (hasStaff(c, 'doctor') ? 0.85 : 1) : 1));
setMod('injury', (c, id) => (me(c, id) && hasStaff(c, 'doctor') ? 0.85 : 1));
setMod('wear', (c, id) => (me(c, id) ? (hasStaff(c, 'physio') ? 1.5 : 1) * (c.life?.kit ? PB.medical.kit.wear : 1) : 1));
setMod('trainGain', (c, id) => (me(c, id) && hasStaff(c, 'trainer') ? 1.15 : 1));
setMod('recovery', (c, id) => (me(c, id) ? (hasStaff(c, 'nutritionist') ? 1.1 : 1) * (c.life?.kit ? PB.medical.kit.recovery : 1) : 1));
setMod('fans', (c, id) => (me(c, id) && hasStaff(c, 'publicist') ? 1.08 : 1));

