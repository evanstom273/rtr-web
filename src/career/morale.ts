// Booker mode, stage 5 (Lyra's design): how your roster feels about you as their booker runs through relationships.
// Being pushed and winning, titles and main events warm them; being left off the cards, underpaid, or promised
// something you don't deliver cools them. Unhappy ones tell you so, ask for their release, and won't re-sign. Conduct
// lands on your desk: fine them, suspend them, or let it go. And your staff: a head writer books what you leave
// better, road agents lift the matches, a producer the segments and the TV money, a scout finds you signings, a
// doctor keeps people healthier.
import { fansIn, findWrestler, rosterOf, type Staffer, type Wrestler } from '../data/rtr';
import { personName } from '../data/rtr/names';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { feelPair, likeOf, takeJob, leaveJob } from '../world/people';
import { backstageTraits } from '../world/populate';
import { letter, setBoutBonus, setCareerHooks, setMod } from './career';
import { companyOf, officeOf, playerRuns, roleIn } from './company';
import { addDays, daysBetween, weekday, type Day } from './dates';
import { registerReplies } from './mail';
import { contractWith, homeRegion, worth } from './signing';
import { BOND_LOG, FEATURES, MORALE, STAFF } from './tuning';
import type { Career, Show } from './types';

export type StaffRole = 'writer' | 'agent' | 'producer' | 'scout' | 'doctor';
export const STAFF_LABEL: Record<StaffRole, string> = { writer: 'Head writer', agent: 'Road agent', producer: 'Producer', scout: 'Scout', doctor: 'Doctor' };
export const STAFF_DOES: Record<StaffRole, string> = {
  writer: 'Books the shows you leave: the biggest match last, storylines on the card.',
  agent: 'Lays out the matches: they come out better.',
  producer: 'Runs the segments and the TV: better segments, more from TV.',
  scout: 'Finds you signings: a list each month.',
  doctor: 'Keeps people in one piece: fewer injuries on your shows.',
};
export interface Hire { role: StaffRole; id: string; wage: number; since: Day }
export interface Promise { who: string; promo: string; kind: 'title' | 'main' | 'push'; by: Day; made: Day }

const W = (id: string): Wrestler | undefined => findWrestler(id);
const nameOf = (id: string): string => W(id)?.name ?? id;
const P = () => activeWorld().people!;
const r5 = (v: number) => Math.round(v / 5) * 5;
const feel = (c: Career, who: string, like: number, respect: number, why: string) => feelPair(P(), who, c.player, [like, respect], [0, 0], why, c.today, { keep: BOND_LOG.mine });

export const staffOf = (promo: string): Hire[] => (companyOf(promo)?.staff ?? []) as Hire[];
/** How good a promotion's staff in a role is, 0–1 (0: nobody). */
export const staffQ = (promo: string, role: StaffRole): number => {
  const h = staffOf(promo).find((x) => x.role === role);
  return h ? (P().staff[h.id]?.rep ?? 50) / 100 : 0;
};
const allPromises = (c: Career): Promise[] => ((officeOf(c) as { promises?: Promise[] }).promises ??= []);
export const promisesOf = (c: Career, promo?: string): Promise[] => allPromises(c).filter((x) => !promo || x.promo === promo);
/** How someone on your roster feels about you, −100 to +100. */
export const moodToward = (c: Career, who: string): number => likeOf(P(), who, c.player);

// ------------------------------------------------------------------ staff

/** This month's candidates for a role: a few names, by how good they are (and what they'd cost). */
export function candidates(c: Career, promo: string, role: StaffRole): { s: Staffer; wage: number }[] {
  const co = companyOf(promo);
  if (!co) return [];
  const rnd = seededRng(hashSeed(c.seed, 'staffpool', promo, role, c.today.slice(0, 7)));
  const country = co.home?.country ?? 'UK';
  return Array.from({ length: STAFF.pool }, (_, i) => {
    const gender = rnd() < 0.4 ? 'FEMALE' : 'MALE';
    const rep = 30 + Math.floor(rnd() * 60);
    const s: Staffer = {
      id: `sf_${promo}_${role}_${c.today.slice(0, 7).replace('-', '')}_${i}`, name: personName(rnd, country, gender), born: `${1960 + Math.floor(rnd() * 35)}-0${1 + Math.floor(rnd() * 9)}-1${Math.floor(rnd() * 9)}`,
      country, gender, background: role === 'agent' || role === 'writer' ? 'wrestler' : role === 'doctor' ? 'business' : 'media', traits: backstageTraits(rnd), rep, job: null, spells: [], bio: `${STAFF_LABEL[role]}.`,
    };
    return { s, wage: r5(STAFF.wage[co.tier]! * (0.5 + rep / 100)) };
  }).sort((a, b) => b.s.rep - a.s.rep);
}

export function hire(c: Career, promo: string, role: StaffRole, id: string): string {
  if (!FEATURES.booker || !roleIn(c, promo)) return 'You don’t run it.';
  const co = companyOf(promo);
  if (!co) return 'You don’t run it.';
  const pick = candidates(c, promo, role).find((x) => x.s.id === id);
  if (!pick) return 'They’ve gone elsewhere.';
  const old = (co.staff ?? []).find((h) => h.role === role);
  if (old) fire(c, promo, role);
  P().staff[pick.s.id] = pick.s;
  takeJob(P(), pick.s, { kind: 'staff', promo, role }, c.today, 'hired');
  (co.staff ??= []).push({ role, id: pick.s.id, wage: pick.wage, since: c.today });
  return `${pick.s.name} is your ${STAFF_LABEL[role].toLowerCase()}: £${pick.wage.toLocaleString('en-GB')} a month.`;
}
export function fire(c: Career, promo: string, role: StaffRole): string {
  const co = companyOf(promo);
  const h = co?.staff?.find((x) => x.role === role);
  if (!co || !h || !roleIn(c, promo)) return 'There’s nobody to let go.';
  const s = P().staff[h.id];
  if (s) leaveJob(s, c.today, 'fired');
  co.staff = co.staff!.filter((x) => x !== h);
  return `${s?.name ?? 'They'}’ve gone.`;
}

// ------------------------------------------------------------------ promises

/** Promise someone something (a title match, a main event, a push: three wins) by a day. Kept, they'll love you for it. */
export function promise(c: Career, promo: string, who: string, kind: Promise['kind'], days = MORALE.promiseDays): string {
  if (!roleIn(c, promo)) return 'You don’t run it.';
  if (!contractWith(c, who, promo) && W(who)?.promotion !== 'TIS') return 'They’re not on your roster.';
  if (promisesOf(c).some((x) => x.who === who && x.promo === promo)) return 'You’ve already promised them something.';
  allPromises(c).push({ who, promo, kind, by: addDays(c.today, days), made: c.today });
  feel(c, who, MORALE.promised, 0, 'Promised me something');
  return `You’ve promised ${nameOf(who)} ${kind === 'title' ? 'a title match' : kind === 'main' ? 'a main event' : 'a push'} by ${addDays(c.today, days)}.`;
}

// ------------------------------------------------------------------ after your show, each week, each month

function afterShow(c: Career, show: Show): void {
  if (!FEATURES.booker || !playerRuns(show.promo)) return;
  const card = (show.card ?? []).filter((b) => b.result);
  const roster = new Set(rosterOf(show.promo).map((w) => w.id));
  card.forEach((b, i) => {
    for (const id of [b.a, b.b]) {
      if (!roster.has(id) || id === c.player) continue;
      (officeOf(c) as { lastOn?: Record<string, Day> }).lastOn = { ...((officeOf(c) as { lastOn?: Record<string, Day> }).lastOn ?? {}), [id]: show.date };
      const won = b.result!.winner === id;
      if (b.result!.newChamp && won) feel(c, id, MORALE.titleWin, MORALE.titleWin / 2, 'Put the title on me');
      else if (won) feel(c, id, MORALE.win, 0, 'Booked me to win');
      if (i === card.length - 1) feel(c, id, 0, MORALE.mainEvent, 'Put me in the main event');
    }
  });
  // Promises: kept tonight?
  for (const pr of promisesOf(c, show.promo)) {
    const b = card.find((x) => x.a === pr.who || x.b === pr.who);
    if (!b) continue;
    const kept = pr.kind === 'title' ? !!b.title : pr.kind === 'main' ? card.indexOf(b) === card.length - 1 : false;
    if (pr.kind === 'push' && b.result!.winner === pr.who) (pr as Promise & { wins?: number }).wins = ((pr as Promise & { wins?: number }).wins ?? 0) + 1;
    if (kept || ((pr as Promise & { wins?: number }).wins ?? 0) >= MORALE.pushWins) settlePromise(c, pr, true);
  }
}

function settlePromise(c: Career, pr: Promise, kept: boolean): void {
  const all = allPromises(c);
  all.splice(all.indexOf(pr), 1);
  if (kept) feel(c, pr.who, MORALE.kept, MORALE.kept / 2, 'Kept their word');
  else {
    feel(c, pr.who, MORALE.broken, MORALE.broken / 2, 'Broke their promise');
    if (roleIn(c, pr.promo)) letter(c, { kind: 'person', from: nameOf(pr.who), fromId: pr.who, subject: 'You promised me', body: [`You said ${pr.kind === 'title' ? 'a title match' : pr.kind === 'main' ? 'the main event' : 'a push'}. Nothing. I won’t forget it.`] });
  }
}

/** Mondays: left off the cards for weeks, promises run out, and the unhappy speak up. */
function weekly(c: Career): void {
  if (!FEATURES.booker || weekday(c.today) !== 1) return;
  const rnd = seededRng(hashSeed(c.seed, 'morale', c.today));
  for (const pr of [...promisesOf(c)]) if (pr.by < c.today) settlePromise(c, pr, false);
  for (const r of officeOf(c).roles) {
    if (!playerRuns(r.promo)) continue;
    const seen = (officeOf(c) as { lastOn?: Record<string, Day> }).lastOn ?? {};
    for (const w of rosterOf(r.promo)) {
      if (w.id === c.player) continue;
      const k = contractWith(c, w.id, r.promo);
      const last = seen[w.id] ?? k?.since ?? k?.start ?? r.since;
      if (daysBetween(last, c.today) >= MORALE.idleDays) feel(c, w.id, MORALE.idle, 0, 'Not being used');
      const mood = moodToward(c, w.id);
      if (mood <= MORALE.unhappy && rnd() < MORALE.speakUp) {
        const out = mood <= MORALE.wantsOut && !!k;
        letter(c, { kind: 'person', from: w.name, fromId: w.id, subject: out ? 'I want my release' : 'We need to talk',
          body: [out ? 'I’m done here. Let me go.' : 'I’m sat at home while people with half my talent are on every show. What’s the plan for me?'],
          replies: out ? [{ id: 'mor_release', label: 'Let them go' }, { id: 'mor_promise', label: 'Promise them a push' }, { id: 'mor_no', label: 'No: they’ve a contract' }]
            : [{ id: 'mor_promise', label: 'Promise them a push' }, { id: 'mor_no', label: 'Tell them to get on with it' }],
          ctx: { who: w.id, promo: r.promo } });
      }
    }
  }
}

/** Each month: pay against worth, staff wages, a scout's list, and conduct on your desk. */
function monthly(c: Career): void {
  if (!FEATURES.booker) return;
  const rnd = seededRng(hashSeed(c.seed, 'conduct', c.today));
  for (const r of officeOf(c).roles) {
    if (!playerRuns(r.promo)) continue;
    for (const w of rosterOf(r.promo)) {
      const k = contractWith(c, w.id, r.promo);
      if (!k || w.id === c.player) continue;
      if (k.fee < worth(c, r.promo, w) * MORALE.underpaid) feel(c, w.id, MORALE.underpaidLike, 0, 'Underpaid');
      const hot = w.traits?.includes('hot_headed') ? 2 : w.traits?.includes('professional') ? 0.3 : 1;
      if (rnd() < MORALE.conduct * hot) {
        const what = ['turned up late and drunk', 'started a fight in catering', 'went off on a fan online', 'missed the bus to the show'][Math.floor(rnd() * 4)]!;
        letter(c, { kind: 'news', from: `${r.promo} · the office`, subject: `${w.name} ${what}`, body: ['How do you want to handle it?'],
          replies: [{ id: 'con_fine', label: 'Fine them' }, { id: 'con_suspend', label: 'Suspend them two weeks' }, { id: 'con_ignore', label: 'Let it go' }], ctx: { who: w.id, promo: r.promo } });
      }
    }
    const scout = staffQ(r.promo, 'scout');
    if (scout) {
      const region = homeRegion(r.promo);
      const picks = rosterOf('TIS').filter((w) => w.id !== c.player && !c.people[w.id]?.retired && fansIn(w, region) > 0)
        .sort((a, b) => fansIn(b, region) / worth(c, r.promo, b) - fansIn(a, region) / worth(c, r.promo, a)).slice(0, 1 + Math.round(scout * 3));
      if (picks.length) letter(c, { kind: 'news', from: `${r.promo} · your scout`, subject: 'Worth a look', body: picks.map((w) => `${w.name}: ${fansIn(w, region).toLocaleString('en-GB')} fans round here, would want about £${worth(c, r.promo, w).toLocaleString('en-GB')} a date.`) });
    }
  }
}

registerReplies({
  mor_release: (c, l) => {
    const promo = l.ctx?.promo ?? '', who = l.ctx?.who ?? '';
    const k = contractWith(c, who, promo);
    if (!k || !roleIn(c, promo)) return 'Too late.';
    k.end = c.today;
    feel(c, who, MORALE.letGo, 0, 'Let me go when I asked');
    return `${nameOf(who)} is gone when the night’s over.`;
  },
  mor_promise: (c, l) => promise(c, l.ctx?.promo ?? '', l.ctx?.who ?? '', 'push'),
  mor_no: (c, l) => { feel(c, l.ctx?.who ?? '', MORALE.brushOff, 0, 'Told me to get on with it'); return 'They’re not happy.'; },
  con_fine: (c, l) => { feel(c, l.ctx?.who ?? '', MORALE.fined, 0, 'Fined me'); return 'Fined. They’ll live.'; },
  con_suspend: (c, l) => {
    const who = l.ctx?.who ?? '';
    const p = c.people[who];
    if (p) p.suspendedUntil = addDays(c.today, 14);
    feel(c, who, MORALE.suspended, 0, 'Suspended me');
    return 'Suspended for a fortnight.';
  },
  con_ignore: (c, l) => {
    const promo = l.ctx?.promo ?? '';
    for (const w of rosterOf(promo).filter((x) => x.id !== l.ctx?.who && x.id !== c.player).slice(0, 6)) feel(c, w.id, 0, MORALE.ignoredRespect, 'Let someone off');
    return 'Let go. Not everyone thinks that’s fair.';
  },
});

// Staff at work: road agents lift the matches, the doctor cuts injuries on your shows.
setBoutBonus((_c, show) => (FEATURES.booker && playerRuns(show.promo) ? staffQ(show.promo, 'agent') * STAFF.agentStars : 0));
setMod('injury', (_c, _id, show) => (FEATURES.booker && show && playerRuns(show.promo) ? 1 - staffQ(show.promo, 'doctor') * STAFF.doctorCut : 1));

setCareerHooks({ show: afterShow, daily: weekly, monthly });

