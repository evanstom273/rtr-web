// Life stage 8: after you retire (Lyra's call: you keep playing). The Epilogue shows once, then you carry on: run the
// empire (homes, businesses, the school), book or own a promotion, coach (wrestlers hire you as their personal
// trainer), or come back for one night or a short run.
import { seededRng, hashSeed } from '../../engine/rng';
import { findWrestler, globalScore, WRESTLERS } from '../../data/rtr';
import { activeWorld } from '../../world/world';
import { moveBond } from '../../world/people';
import { letter, person, spend } from '../career';
import { addDays, addMonths, fmtDay } from '../dates';
import { ensurePotential } from '../development';
import { registerReplies } from '../mail';
import { REGION_OF } from '../places';
import { PRICE_BOOK as PB } from '../tuning';
import type { Career } from '../types';
import { life } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const STATS = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'] as const;

export const isRetired = (c: Career): boolean => !!c.people[c.player]?.retired;
/** Carrying on after the Epilogue. */
export function carryOn(c: Career): void { life(c).after = c.today; }

/** What a wrestler would pay you a month to train them: more the bigger your name. */
export const coachFee = (c: Career): number => Math.round(Math.min(PB.after.fee[1], PB.after.fee[0] + globalScore(findWrestler(c.player)!) * 60) / 50) * 50;

/** The 1st, retired: someone asks you to train them; the ones you're training improve (and pay). */
export function monthlyAfter(c: Career, month: string): void {
  const L = life(c);
  if (!isRetired(c)) return;
  const r = seededRng(hashSeed(c.seed, 'after', month));
  for (const k of [...(L.clients ?? [])]) {
    const w = findWrestler(k.id);
    if (!w || c.people[k.id]?.retired || k.until <= c.today) {
      L.clients = L.clients!.filter((x) => x !== k);
      if (w) letter(c, { kind: 'news', from: w.name, subject: 'Thank you', body: ['That’s my time with you done. I’m a better wrestler for it.'] });
      continue;
    }
    spend(c, k.fee, `Coaching · ${w.name}`, 'event');
    ensurePotential(w);
    const total = STATS.reduce((t, s) => t + w.stats[s], 0);
    if ((w.potential ?? total) > total) for (let i = 0; i < PB.after.gain; i++) { const s = STATS[Math.floor(r() * STATS.length)]!; if (w.stats[s] < 99) w.stats[s]++; }
    const P = activeWorld().people;
    if (P) moveBond(P, c.player, k.id, 3, 'Trains with you', c.today, 'mentor', c.player);
  }
  if ((L.clients?.length ?? 0) >= PB.after.max || r() >= PB.after.ask) return;
  const me = findWrestler(c.player)!;
  const keen = WRESTLERS.filter((w) => w.id !== c.player && !c.people[w.id]?.retired && w.age <= 30 && REGION_OF[w.country] === REGION_OF[me.country] && !L.clients?.some((x) => x.id === w.id) && globalScore(w) < globalScore(me));
  const w = keen[Math.floor(r() * keen.length)];
  if (!w) return;
  const fee = coachFee(c);
  letter(c, {
    kind: 'news', from: w.name, fromId: w.id, subject: 'Would you train me?',
    body: [`I’ve watched your matches since I was a kid. Would you take me on for three months? I can pay ${money(fee)} a month.`],
    replies: [{ id: 'client_yes', label: 'Take them on', detail: `${money(fee)} a month for three months` }, { id: 'client_no', label: 'Not now', detail: '' }],
    ctx: { who: w.id, fee: String(fee) },
  });
}

registerReplies({
  client_yes: (c, l) => {
    const who = l.ctx!.who!, fee = Number(l.ctx!.fee);
    (life(c).clients ??= []).push({ id: who, fee, until: addMonths(c.today, 3) });
    return `You’re training ${findWrestler(who)?.name ?? 'them'}: ${money(fee)} a month.`;
  },
  client_no: () => 'Maybe another time.',
  comeback_stay: (c) => { const L = life(c); if (L.comeback) L.comeback.until = addMonths(c.today, 6); return 'Six more months, then.'; },
  comeback_end: (c) => { endComeback(c); return 'That’s it. For real this time.'; },
});

/** Come back: one night only (you retire again after your next match) or a short run (six months, then you decide). */
export function comeback(c: Career, kind: 'one' | 'run'): string {
  const L = life(c), p = person(c, c.player), me = findWrestler(c.player)!;
  if (!p.retired) return 'You’re not retired.';
  if (me.age >= PB.after.maxAge) return 'Your body says no.';
  p.retired = false;
  delete p.retiredOn;
  delete p.retiring;
  delete c.over;
  delete c.retireDeal;
  L.comeback = { kind, since: c.today, until: kind === 'one' ? addDays(c.today, 120) : addMonths(c.today, 6), matches: c.history.length };
  letter(c, { kind: 'news', from: 'The Wrestling Observer', subject: `${me.name} is coming back`, body: [kind === 'one' ? `${me.name} is back for one night only. Promoters are already on the phone.` : `${me.name} is back for a run. Six months, they say.`] });
  return kind === 'one' ? 'One night only: you’re taking bookings again.' : 'A short run: six months, then you decide.';
}

/** Back into retirement (the Epilogue doesn't show again). */
export function endComeback(c: Career): void {
  const L = life(c), p = person(c, c.player);
  delete L.comeback;
  p.retired = true;
  p.retiredOn = c.today;
  c.over = c.today;
}

/** Daily, mid-comeback: one night only ends after the match; a run's end asks if you'll go on. */
export function dailyComeback(c: Career): void {
  const L = c.life?.comeback;
  if (!L) return;
  if (L.kind === 'one' && (c.history.length > L.matches || c.today >= L.until)) {
    endComeback(c);
    letter(c, { kind: 'news', from: 'The Wrestling Observer', subject: 'One last time', body: ['That was it: one more night, and the crowd got to say goodbye properly.'] });
  } else if (L.kind === 'run' && c.today >= L.until && !L.asked) {
    L.asked = c.today;
    letter(c, { kind: 'news', from: 'You', subject: 'The run’s up', body: [`Six months back, ${c.history.length - L.matches} matches. Keep going?`], replies: [{ id: 'comeback_stay', label: 'Six more months', detail: '' }, { id: 'comeback_end', label: 'Retire again', detail: '' }] });
  } else if (L.kind === 'run' && L.asked && c.today >= addDays(L.asked, 14) && L.until <= L.asked) endComeback(c);
  void fmtDay;
}
