// Life stage 5: the schools. Every country's schools are real now (reputation, coaches, graduates) and they're where
// the world's rookies come from. You can open your own or buy one: choose each intake, see your students develop (their
// potential shows itself as they train), coach them yourself, and graduate them into the world as real wrestlers.
import { seededRng, hashSeed, type Rng } from '../../engine/rng';
import { databaseChanged, findWrestler, globalScore, WRESTLERS, type Wrestler } from '../../data/rtr';
import { personName } from '../../data/rtr/names';
import { activeWorld } from '../../world/world';
import { lifeWorld, type SchoolRec } from '../../world/lifeWorld';
import { bookerOf, moveBond } from '../../world/people';
import { schoolsIn } from '../../world/social';
import { letter, person, setRookieHook, spend } from '../career';
import { companyOf } from '../company';
import { setDemandLift } from '../signing';
import { makeRookie } from '../create';
import { addMonths, type Day } from '../dates';
import { ensurePotential } from '../development';
import { hustleOf } from '../hustle';
import { CITIES, REGION_OF } from '../places';
import { PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { cityPrice, countryOfCity, life, on } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const ATTRS = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'] as const;
export type Attr = (typeof ATTRS)[number];

export interface Student {
  id: string; name: string; gender: 'MALE' | 'FEMALE'; country: string; age: number;
  /** Hidden: how good they could be (an attribute total). */
  potential: number;
  stats: Record<Attr, number>;
  /** How well you know their potential (0–1): your read sharpens as they train. */
  read: number;
  focus?: Attr;
  months: number;
  scholarship?: boolean;
  /** A legend's kid, an ex-athlete. */
  note?: string;
}
export interface PlayerSchool { id: string; students: Student[]; applicants: Student[]; coaches: string[]; nextIntake: Day; shows?: boolean; feeder?: { promo: string; fee: number; until: Day } }

/** Every country's schools, made real the first time: a reputation, a coach or two (veterans), no graduates yet. */
export function schools(seed = activeWorld().seed): Record<string, SchoolRec> {
  const L = lifeWorld();
  if (L.schools) return L.schools;
  const out: Record<string, SchoolRec> = {};
  const vets = WRESTLERS.filter((w) => w.age >= 38).sort((a, b) => globalScore(b) - globalScore(a));
  for (const country of Object.keys(CITIES)) {
    for (const s of schoolsIn(seed, country)) {
      const r = seededRng(hashSeed(seed, 'school', s.id));
      const local = vets.filter((w) => w.country === country);
      const coaches = local.length ? [local[Math.floor(r() * Math.min(6, local.length))]!.id] : [];
      out[s.id] = { id: s.id, name: s.name, country, city: s.city ?? CITIES[country]![0]!, rep: Math.round(20 + r() * 50), coaches, owner: 'ai', grads: 0 };
    }
  }
  L.schools = out;
  return out;
}

const repOf = (s: SchoolRec) => s.rep;
/** A school for a new wrestler from this country, the better-known ones likelier. */
export function schoolFor(country: string, rnd: Rng): SchoolRec | undefined {
  const all = Object.values(schools()).filter((s) => s.country === country);
  if (!all.length) return undefined;
  const total = all.reduce((t, s) => t + repOf(s), 0);
  let x = rnd() * total;
  for (const s of all) { x -= repOf(s); if (x <= 0) return s; }
  return all[0];
}

/** Rookies come out of the schools: a better school, a better rookie (its reputation and its coaches show). */
setRookieHook((w) => {
  if (!on('school')) return;
  const s = schoolFor(w.country, seededRng(hashSeed(activeWorld().seed, 'school', w.id)));
  if (!s) return;
  w.school = s.id;
  w.gimmickDescription = `A rookie fresh out of ${s.name}.`;
  ensurePotential(w);
  w.potential = Math.round((w.potential ?? 0) + (s.rep - 45) / 2 + s.coaches.length * 3);
  s.grads++;
});

// ------------------------------------------------------------------ your school

export const mySchool = (c: Career): PlayerSchool | undefined => c.life?.school;
export const mySchoolRec = (c: Career): SchoolRec | undefined => (c.life?.school ? schools()[c.life.school.id] : undefined);

/** Open a school in your city: the premises (rented), a ring and kit, and a name. */
export function openSchool(c: Career): string {
  const L = life(c);
  if (L.school) return 'You’ve already got a school.';
  const setup = PB.school.kit;
  if (c.money < setup) return `You need ${money(setup)} for the ring and kit.`;
  const me = findWrestler(c.player)!;
  spend(c, -setup, 'A ring and kit for your school', 'school', { untaxed: true });
  const id = `${countryOfCity(L.city)}#you`;
  schools()[id] = { id, name: `${me.name.split(' ').pop()}’s School of Wrestling`, country: countryOfCity(L.city), city: L.city, rep: Math.round(10 + Math.min(40, globalScore(me) * 0.6)), coaches: [], owner: 'player', grads: 0 };
  L.school = { id, students: [], applicants: [], coaches: [], nextIntake: c.today };
  intake(c);
  return `${schools()[id]!.name} is open. Your first applicants are in.`;
}

/** Buy an existing school (its name, reputation and coaches come with it). */
export const schoolPrice = (s: SchoolRec): number => Math.round((PB.school.buyBase + s.rep * PB.school.buyPerRep) * cityPrice(s.city) / 1000) * 1000;
export function buySchool(c: Career, id: string): string {
  const L = life(c), s = schools()[id];
  if (L.school) return 'You’ve already got a school.';
  if (!s || s.owner === 'player') return 'That school isn’t for sale.';
  const price = schoolPrice(s);
  if (c.money < price) return `You need ${money(price)}.`;
  spend(c, -price, `Bought · ${s.name}`, 'school', { untaxed: true });
  s.owner = 'player';
  L.school = { id, students: [], applicants: [], coaches: [...s.coaches], nextIntake: c.today };
  intake(c);
  return `${s.name} is yours, coaches and all.`;
}

/** A coach: a retired wrestler (or a veteran part-time). Better-known coaches cost more and draw better students. */
export const coachWage = (w: Wrestler): number => Math.round(Math.min(PB.school.coach[1], PB.school.coach[0] + globalScore(w) * 60) / 50) * 50;
export function coachPool(c: Career): Wrestler[] {
  const s = mySchoolRec(c);
  if (!s) return [];
  return WRESTLERS.filter((w) => (c.people[w.id]?.retired || w.age >= 40) && w.id !== c.player && !s.coaches.includes(w.id) && REGION_OF[w.country] === REGION_OF[s.country])
    .sort((a, b) => globalScore(b) - globalScore(a)).slice(0, 8);
}
export function hireCoach(c: Career, id: string): string {
  const s = mySchoolRec(c), w = findWrestler(id);
  if (!s || !w) return 'No such coach.';
  if (s.coaches.length >= 3) return 'Three coaches is plenty.';
  s.coaches.push(id);
  return `${w.name} is coaching at ${s.name}: ${money(coachWage(w))} a month.`;
}
export function dropCoach(c: Career, id: string): string {
  const s = mySchoolRec(c);
  if (!s) return 'No school.';
  s.coaches = s.coaches.filter((x) => x !== id);
  return 'They’ve gone.';
}

const fee = (s: SchoolRec) => Math.round((PB.school.fee[0] + (PB.school.fee[1] - PB.school.fee[0]) * Math.min(1, s.rep / 100)) * cityPrice(s.city) / 10) * 10;
export const schoolFee = (c: Career): number => { const s = mySchoolRec(c); return s ? fee(s) : 0; };
/** How good your coaching is: your coaches' quality, and your own classes if you teach there. */
function coaching(c: Career, s: SchoolRec): number {
  const coaches = s.coaches.map((id) => findWrestler(id)).filter((w): w is Wrestler => !!w);
  const q = coaches.reduce((t, w) => t + 0.15 + globalScore(w) / 300, 0);
  const mine = Math.min(0.4, (hustleOf(c).coaching?.slots.length ?? 0) * 0.1);
  return Math.min(1.2, 0.3 + q + mine);
}

/** New applicants (every four months): more and better as the name grows; now and then someone notable. */
function intake(c: Career): void {
  const S = mySchool(c)!, s = mySchoolRec(c)!;
  const r = seededRng(hashSeed(c.seed, 'intake', s.id, c.today));
  const n = 4 + Math.round(s.rep / 12) + Math.floor(r() * 4);
  S.applicants = Array.from({ length: n }, (_, i) => applicant(c, s, r, i));
  S.nextIntake = addMonths(c.today, 4);
}
function applicant(c: Career, s: SchoolRec, r: Rng, i: number): Student {
  const gender = r() < 0.35 ? 'FEMALE' : 'MALE';
  const base = 240 + Math.floor(r() * 70);
  let potential = base + 60 + Math.floor(r() * 80) + Math.round(s.rep * 0.8);
  let note: string | undefined;
  const stats = Object.fromEntries(ATTRS.map((k) => [k, Math.round(base / 6 + (r() - 0.5) * 10)])) as Record<Attr, number>;
  if (r() < PB.school.notable) {
    const legend = WRESTLERS.filter((w) => w.age >= 45 && globalScore(w) >= 40)[Math.floor(r() * 10)];
    if (legend && r() < 0.5) { note = `${legend.name}’s kid`; potential += 60; }
    else { note = 'An ex-athlete'; stats.strength += 12; stats.stamina += 12; potential += 30; }
  }
  return { id: `st${c.today.replace(/-/g, '')}${i}`, name: personName(r, s.country, gender), gender, country: s.country, age: 18 + Math.floor(r() * 7), potential: Math.min(560, potential), stats, read: 0.15, months: 0, ...(note ? { note } : {}) };
}

/** What you think they could be: their potential, blurred by how well you know them. */
export function readOf(st: Student): [number, number] {
  const spread = Math.round(90 * (1 - st.read));
  const seed = seededRng(hashSeed(st.id, 'read'))();
  const centre = st.potential + Math.round((seed - 0.5) * spread);
  return [Math.max(200, centre - spread), centre + spread];
}
export const statTotal = (st: Pick<Student, 'stats'>) => ATTRS.reduce((t, k) => t + st.stats[k], 0);

export function accept(c: Career, id: string, scholarship = false): string {
  const S = mySchool(c), s = mySchoolRec(c);
  if (!S || !s) return 'No school.';
  const a = S.applicants.find((x) => x.id === id);
  if (!a) return 'They’ve gone elsewhere.';
  if (S.students.length >= PB.school.places) return `You’ve only got ${PB.school.places} places.`;
  S.applicants = S.applicants.filter((x) => x !== a);
  S.students.push({ ...a, ...(scholarship ? { scholarship: true } : {}) });
  return `${a.name} is in${scholarship ? ', on a scholarship' : ''}.`;
}
export function setFocus(c: Career, id: string, focus: Attr): void { const st = mySchool(c)?.students.find((x) => x.id === id); if (st) st.focus = focus; }

/**
 * Graduate a student: a real wrestler on the indies, trained at your school, with a mentor's bond to you. If a
 * promotion has a feeder deal, they get first call.
 */
export function graduate(c: Career, id: string): string {
  const S = mySchool(c), s = mySchoolRec(c);
  const st = S?.students.find((x) => x.id === id);
  if (!S || !s || !st) return 'No such student.';
  const r = seededRng(hashSeed(c.seed, 'grad', st.id));
  const w = makeRookie(r, WRESTLERS.filter((x) => x.country === st.country && x.gender === st.gender).slice(0, 40).concat(WRESTLERS.slice(0, 1)), `grad_${st.id}`);
  Object.assign(w, { name: st.name, age: st.age, gender: st.gender, country: st.country, stats: { ...st.stats }, school: s.id, potential: st.potential, gimmickDescription: `Trained at ${s.name}.` });
  WRESTLERS.push(w);
  person(c, w.id);
  databaseChanged();
  S.students = S.students.filter((x) => x !== st);
  s.grads++;
  s.rep = Math.min(100, s.rep + 1);
  const P = activeWorld().people;
  if (P) moveBond(P, c.player, w.id, 25 + Math.round(st.months), 'trained them', c.today, 'mentor', c.player);
  const feed = S.feeder && S.feeder.until >= c.today ? ` ${S.feeder.promo} have first call on them.` : '';
  return `${st.name} graduates: out on the indies now, trained at ${s.name}.${feed}`;
}

/** The 1st: fees in, wages and rent out, students train (and you learn what they've got), the name grows. */
export function monthlySchool(c: Career): void {
  const S = mySchool(c), s = mySchoolRec(c);
  if (!S || !s) return;
  const paying = S.students.filter((x) => !x.scholarship).length;
  if (paying) spend(c, paying * fee(s), `Fees · ${paying} students at ${s.name}`, 'school');
  spend(c, -Math.round(PB.school.rent * cityPrice(s.city)), `Rent · ${s.name}`, 'school');
  for (const id of s.coaches) { const w = findWrestler(id); if (w) spend(c, -coachWage(w), `Coach · ${w.name}`, 'school'); }
  if (S.feeder && S.feeder.until >= c.today) spend(c, Math.round(S.feeder.fee / 12), `Feeder deal · ${S.feeder.promo}`, 'school');
  const q = coaching(c, s);
  for (const st of S.students) {
    st.months++;
    st.read = Math.min(1, st.read + 0.06 * (0.5 + q));
    const room = st.potential - statTotal(st);
    const gain = Math.max(0, Math.round(room * 0.04 * q * (st.age <= 22 ? 1.1 : 0.9)));
    for (let i = 0; i < gain; i++) {
      const k = st.focus && i % 2 === 0 ? st.focus : ATTRS[(i * 7 + st.months) % ATTRS.length]!;
      if (st.stats[k] < 99) st.stats[k]++;
    }
  }
  // School shows: a showcase each month (gate in, production out), and the name grows a little.
  if (S.shows && S.students.length) {
    const r = seededRng(hashSeed(c.seed, 'schoolshow', c.today));
    const crowd = Math.round(PB.school.crowd[0] + (PB.school.crowd[1] - PB.school.crowd[0]) * Math.min(1, s.rep / 80) * (0.7 + r() * 0.6));
    const gate = Math.round(crowd * (PB.school.ticket[0] + r() * (PB.school.ticket[1] - PB.school.ticket[0])));
    spend(c, gate - PB.school.production, `School show · ${crowd} in`, 'school');
    s.rep = Math.min(100, s.rep + 0.3);
  }
  // A feeder deal, once you've a name: a promotion pays for first pick.
  if (!S.feeder && s.rep >= PB.school.feederRep && seededRng(hashSeed(c.seed, 'feeder', c.today))() < 0.15) {
    const promos = Object.keys(activeWorld().companies ?? {}).filter((p) => p !== c.people[c.player]?.contract?.promo);
    const p = promos[Math.floor(seededRng(hashSeed(c.seed, 'feederp', c.today))() * promos.length)];
    if (p) {
      const amount = Math.round(PB.school.feeder[0] + (PB.school.feeder[1] - PB.school.feeder[0]) * Math.min(1, s.rep / 100));
      S.feeder = { promo: p, fee: amount, until: addMonths(c.today, 24) };
      letter(c, { kind: 'news', from: p, subject: 'A feeder deal', body: [`${p} would like ${s.name} as an official school: ${money(amount)} a year for two years, and first call on your graduates.`, 'It’s done; it pays monthly.'] });
    }
  }
  if (S.nextIntake <= c.today) intake(c);
}

/** AI schools: the name follows their graduates (a monthly drift towards what their alumni have made of themselves). */
export function monthlyWorldSchools(): void {
  const all = schools();
  for (const s of Object.values(all)) {
    if (s.owner === 'player') continue;
    const alumni = WRESTLERS.filter((w) => w.school === s.id);
    const made = alumni.reduce((t, w) => t + globalScore(w), 0);
    const target = Math.min(90, 25 + Math.sqrt(made) * 3 + s.coaches.length * 4);
    s.rep = Math.round((s.rep + (target - s.rep) * 0.05) * 10) / 10;
  }
}

/** A veteran with money opens a school of their own (stage 4's AI money): they coach there, their name draws students. */
export function openAiSchool(w: Wrestler): void {
  const all = schools();
  const id = `${w.country}#${w.id}`;
  if (all[id] || !CITIES[w.country]) return;
  all[id] = { id, name: `The ${w.name.split(' ').pop()} Academy`, country: w.country, city: CITIES[w.country]![0]!, rep: Math.round(Math.min(70, 25 + globalScore(w) * 0.5)), coaches: [w.id], owner: 'ai', grads: 0 };
}

/** Your graduates: cheaper (a fifth off) for a promotion you own or book. */
export const myGraduate = (c: Career, id: string): boolean => !!c.life?.school && findWrestler(id)?.school === c.life.school.id;
setDemandLift((c, id, promo) => (on('school') && myGraduate(c, id) && (companyOf(promo)?.owner === 'player' || (activeWorld().people ? bookerOf(activeWorld().people!, promo)?.id === c.player : false)) ? 0.8 : 1));
