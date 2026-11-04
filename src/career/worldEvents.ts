// The living world (career expansion, stage 4): things that happen to everyone, not just you. Wrestlers
// retire (after a farewell) and now and then come back; rookies break through; long reigns and injured
// champions make the news; your own career milestones get noticed. All of it goes into the world's
// history (Records), and only the bits that touch you, or are big news, reach your mail.
import { findWrestler, globalScore, PROMOTIONS, TITLES, type Wrestler, WRESTLERS } from '../data/rtr';
import { seededRng, type Rng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent, type WorldEvent } from '../world/history';
import { hashSeed } from './booker';
import { letter, person, setCareerHooks } from './career';
import { addDays, daysBetween, fmtDay } from './dates';
import { affinity } from './relations';
import { arrangeFarewell } from './specials';
import {
  BREAKTHROUGH_POP, CAREER_MILESTONES, CHAMP_INJURY_NEWS_DAYS, REIGN_MILESTONES, RETIRE_AGE_MIN, RETIRE_MONTHLY_BASE, RETIRE_MONTHLY_PER_YEAR,
  RETURN_MIN_DAYS, RETURN_MIN_POP, RETURN_MONTHLY,
} from './tuning';
import type { Career } from './types';

const world = (c: Career) => (c.world ??= { last: {}, seen: {} });
const record = (e: WorldEvent) => addEvent(activeWorld().history, e);
const relOf = (c: Career, id: string) => affinity(c, id);
const titleHolder = (id: string) => TITLES.some((t) => t.holder === id);
const promoOfTitle = (id: string) => PROMOTIONS.find((p) => p.titles.includes(id))?.initials;
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Whether news about someone reaches your mail: your roster, someone you know well, or a big name. */
function newsworthy(c: Career, w: Wrestler, big = 60): boolean {
  const mine = findWrestler(c.player)?.promotion;
  return (w.promotion === mine && mine !== 'TIS') || Math.abs(relOf(c, w.id)) >= 15 || globalScore(w) >= big;
}

// ------------------------------------------------------------------ retirement and comebacks

function announceRetirements(c: Career, rnd: Rng): void {
  for (const w of WRESTLERS) {
    const p = c.people[w.id];
    if (!p || w.id === c.player || p.retired || p.retiring || w.age < RETIRE_AGE_MIN || titleHolder(w.id)) continue;
    if (c.feuds.some((f) => !f.done && f.title && (f.a === w.id || f.b === w.id))) continue;
    if (rnd() >= RETIRE_MONTHLY_BASE + RETIRE_MONTHLY_PER_YEAR * (w.age - RETIRE_AGE_MIN)) continue;
    const day = arrangeFarewell(c, w, rnd);
    p.retiring = day;
    // Their deal runs to the farewell, whatever it said.
    if (p.contract && p.contract.end < day) p.contract.end = day;
    if (newsworthy(c, w)) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} to retire`, body: [`${w.name} (${w.age}) has announced their retirement. Their last match is on ${fmtDay(day, 'long')}.`] });
  }
}

function retire(c: Career, w: Wrestler): void {
  const p = person(c, w.id);
  // A champion on farewell night keeps going: nobody hands over a title by retiring.
  if (titleHolder(w.id)) {
    delete p.retiring;
    if (newsworthy(c, w)) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} isn’t done yet`, body: [`${w.name} was meant to retire, but as champion they’re carrying on.`] });
    return;
  }
  const from = w.promotion;
  delete p.retiring;
  p.retired = true;
  p.retiredOn = c.today;
  p.contract = null;
  w.promotion = 'TIS';
  for (const f of c.feuds) if (!f.done && (f.a === w.id || f.b === w.id)) f.done = true;
  record({ day: c.today, kind: 'retired', who: w.id, name: w.name, promo: from, what: `aged ${w.age}` });
  if (newsworthy(c, w)) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} retires`, body: [`${w.name} has wrestled their last match. ${from === 'TIS' ? 'The Indie Scene' : from} says goodbye to one of its own.`] });
}

function comebacks(c: Career, rnd: Rng): void {
  for (const w of WRESTLERS) {
    const p = c.people[w.id];
    if (!p?.retired || !p.retiredOn || daysBetween(p.retiredOn, c.today) < RETURN_MIN_DAYS || globalScore(w) < RETURN_MIN_POP || w.age > 52) continue;
    if (rnd() >= RETURN_MONTHLY) continue;
    p.retired = false;
    delete p.retiredOn;
    record({ day: c.today, kind: 'returned', who: w.id, name: w.name, promo: 'TIS' });
    if (newsworthy(c, w, 55)) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} is back`, body: [`${w.name} is coming out of retirement and taking indie bookings again.`] });
  }
}

function breakthroughs(c: Career): void {
  const seen = world(c).seen;
  const me = findWrestler(c.player)!;
  for (const w of WRESTLERS) {
    if (!w.id.startsWith('rookie_') || seen[`break:${w.id}`] || globalScore(w) < BREAKTHROUGH_POP) continue;
    seen[`break:${w.id}`] = c.today;
    person(c, w.id).breakthrough = c.today;
    record({ day: c.today, kind: 'breakthrough', who: w.id, name: w.name, promo: w.promotion });
    if (w.region === me.region || (w.promotion === me.promotion && me.promotion !== 'TIS')) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} is the name on everyone’s lips`, body: [`Not long out of training, ${w.name} has broken through. Promoters are paying attention.`] });
  }
}

// ------------------------------------------------------------------ milestones and injured champions

function reigns(c: Career): void {
  const seen = world(c).seen;
  const mine = person(c, c.player).contract?.promo;
  for (const t of TITLES) {
    const since = c.titles[t.id]?.since;
    if (!t.holder || !since) continue;
    const days = daysBetween(since, c.today);
    for (const m of REIGN_MILESTONES) {
      const key = `reign:${t.id}:${since}:${m}`;
      // Only as it happens (an old save doesn't announce years-old milestones all at once).
      if (days < m || days > m + 7 || seen[key]) continue;
      seen[key] = c.today;
      const w = findWrestler(t.holder);
      if (!w) continue;
      const promo = promoOfTitle(t.id);
      record({ day: c.today, kind: 'milestone', who: w.id, name: w.name, ...(promo ? { promo } : {}), title: t.id, what: `${m} days as ${t.name} champion` });
      if (w.id === c.player) letter(c, { kind: 'news', from: 'The news desk', subject: `${m} days as champion`, body: [`You’ve held the ${t.name} for ${m} days.`] });
      else if (m >= 365 && promo === mine && PROMOTIONS.find((p) => p.initials === promo)?.titles[0] === t.id) letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name}: a year as champion`, body: [`${w.name} has held the ${t.name} for ${m} days.`] });
    }
  }
}

function injuredChampions(c: Career): void {
  const seen = world(c).seen;
  const mine = person(c, c.player).contract?.promo;
  for (const t of TITLES) {
    if (!t.holder || t.holder === c.player) continue;
    const inj = c.people[t.holder]?.injury;
    if (!inj || inj.until < addDays(c.today, CHAMP_INJURY_NEWS_DAYS)) continue;
    const key = `inj:${t.id}:${t.holder}:${inj.until}`;
    if (seen[key]) continue;
    seen[key] = c.today;
    const w = findWrestler(t.holder)!;
    const promo = promoOfTitle(t.id);
    record({ day: c.today, kind: 'injured', who: w.id, name: w.name, ...(promo ? { promo } : {}), title: t.id, what: `out until ${fmtDay(inj.until, 'long')}` });
    if (promo === mine) letter(c, { kind: 'news', from: 'The news desk', subject: `Champion ${w.name} injured`, body: [`${w.name} is out with a ${inj.what} injury until ${fmtDay(inj.until, 'long')}. The ${t.name} won’t be defended until they’re back.`] });
  }
}

function careerMilestones(c: Career): void {
  const seen = world(c).seen;
  const n = c.history.length;
  for (const m of CAREER_MILESTONES) {
    if (n < m || seen[`career:${m}`]) continue;
    seen[`career:${m}`] = c.today;
    const me = findWrestler(c.player)!;
    record({ day: c.today, kind: 'milestone', who: me.id, name: me.name, promo: me.promotion, what: `${ord(m)} match` });
    letter(c, { kind: 'news', from: 'The news desk', subject: `Your ${ord(m)} match`, body: [`That was the ${ord(m)} match of your career.`] });
  }
}

// ------------------------------------------------------------------ hooks

function daily(c: Career): void {
  for (const w of WRESTLERS) {
    const p = c.people[w.id];
    if (p?.retiring && p.retiring < c.today) retire(c, w);
  }
  reigns(c);
  injuredChampions(c);
  careerMilestones(c);
}

function monthly(c: Career): void {
  const rnd = seededRng(hashSeed(c.seed, 'world', c.today));
  announceRetirements(c, rnd);
  comebacks(c, rnd);
  breakthroughs(c);
}

setCareerHooks({ daily, monthly });
