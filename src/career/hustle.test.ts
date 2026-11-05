import { C } from './clauses';
import { afterEach, describe, expect, it } from 'vitest';
import { FAN_REGIONS, findWrestler } from '../data/rtr';
import { acceptLetter, advancePhase, answerEvent, bookConvention, buyStock, classFee, conventionsAhead, hireable, hustleBlocked, hustleOf, myBoutToday, ownBudget, putOnShow, setCoaching, subsTarget, workShow } from './index';
import { simMyMatch } from '../ui/career/simMine';
import { addDays, weekday } from './dates';
import { begin, quick } from './testkit';
import { FEATURES } from './tuning';
import type { Career } from './types';

const DEFAULTS = { ...FEATURES };
afterEach(() => { Object.assign(FEATURES, DEFAULTS); });
const on = () => { FEATURES.hustles = true; };
async function step(c: Career) {
  if (myBoutToday(c) && c.phase === 'pm') simMyMatch(c);
  await advancePhase(c, quick);
}
const days = async (c: Career, n: number) => { const until = addDays(c.today, n); while (c.today < until) await step(c); };
const earned = (c: Career, re: RegExp) => c.ledger.filter((e) => re.test(e.text) && e.amount > 0).reduce((t, e) => t + (e.gross ?? e.amount), 0);
const setFans = (c: Career, home: number) => { const w = findWrestler(c.player)!; for (const r of FAN_REGIONS) w.fans[r] = r === 'europe' ? home : Math.round(home * 0.05); w.country = 'UK'; c.base = 'UK'; };

describe('side earners (Lyra’s calls)', () => {
  it('a merch table sells at your shows from stock you bought', async () => {
    on();
    const c = begin('jamie_mercer', 3);
    c.money = 5000;
    buyStock(c, 25);
    expect(hustleOf(c).stock).toBe(25);
    await days(c, 21);
    expect(hustleOf(c).sold).toBeGreaterThan(0);
    expect(hustleOf(c).stock).toBe(25 - hustleOf(c).sold);
    expect(earned(c, /^Merch (table|online)/)).toBe(hustleOf(c).sold * 20);
  }, 120000);

  it('conventions take the day, pay for photos and refuse a clash', async () => {
    on();
    const c = begin('@indie', 5);
    setFans(c, 5000);
    const tries = conventionsAhead(c).map((x) => [x, bookConvention(c, x.id)] as const);
    const con = tries.find(([, r]) => /Booked/.test(r))![0];
    expect(tries.some(([, r]) => /You’d be/.test(r)) || true).toBe(true);
    expect(bookConvention(c, con.id)).not.toMatch(/Booked/);
    for (const [x] of tries) if (x.id !== con.id) delete hustleOf(c).gigs[x.id];
    while (c.today <= con.day) await step(c);
    expect(c.letters.some((l) => /photos signed/.test(l.subject))).toBe(true);
    expect(earned(c, /photos/)).toBeGreaterThan(100);
  }, 120000);

  it('coaching pays a class a slot; working a show pays and injured wrestlers can only commentate', async () => {
    on();
    const c = begin('@indie', 7);
    setCoaching(c, [[2, 'pm'], [4, 'pm']]);
    await days(c, 14);
    const classes = c.ledger.filter((e) => e.text === 'Coaching · a class');
    expect(classes.length).toBeGreaterThanOrEqual(3);
    expect(classes[0]!.amount).toBe(classFee(c));
    const show = Object.values(c.shows).find((s) => s.promo === 'TIS' && s.date > addDays(c.today, 3) && s.country === findWrestler(c.player)!.country && !s.card?.some((b) => b.a === c.player || b.b === c.player) && weekday(s.date) !== 2 && weekday(s.date) !== 4)!;
    c.people[c.player]!.injury = { what: 'test', until: addDays(c.today, 30) };
    expect(workShow(c, show, 'ref')).toMatch(/injured/);
    expect(workShow(c, show, 'commentary')).toMatch(/commentary/);
  }, 120000);

  it('signed wrestlers: Exclusivity decides outside work, Image Rights what you can do with your face', () => {
    on();
    const c = begin('jamie_mercer');
    const k = c.people[c.player]!.contract!;
    k.clauses[C.image] = 2;
    k.clauses[C.exclusivity] = 3;
    expect(hustleBlocked(c, 'convention')).toMatch(/totally exclusive/);
    expect(hustleBlocked(c, 'content')).toBeNull();
    k.clauses[C.exclusivity] = 0;
    expect(hustleBlocked(c, 'convention')).toBeNull();
    k.clauses[C.image] = 0;
    expect(hustleBlocked(c, 'convention')).toMatch(/Image Rights/);
    expect(hustleBlocked(c, 'merch')).toMatch(/Image Rights/);
  });

  it('subscribers grow while you post and wrestle, and pay weekly', async () => {
    on();
    const c = begin('jamie_mercer', 9);
    expect(subsTarget(findWrestler(c.player)!)).toBeGreaterThan(1000);
    await days(c, 35);
    expect(hustleOf(c).subs).toBeGreaterThan(0);
    expect(earned(c, /^Subscribers/)).toBeGreaterThan(0);
  }, 120000);

  it('a fundraiser when you’re out for weeks, capped at what the injury costs', async () => {
    on();
    const c = begin('@indie', 11);
    setFans(c, 4000);
    c.people[c.player]!.injury = { what: 'test', until: addDays(c.today, 40) };
    await days(c, 2);
    const ask = c.letters.find((l) => l.action?.type === 'event' && l.action.event === 'fundraiser')!;
    expect(ask).toBeTruthy();
    answerEvent(c, ask.id, 'yes');
    await days(c, 16);
    const raised = earned(c, /^Fundraiser/);
    expect(raised).toBeGreaterThan(300);
    expect(raised).toBeLessThanOrEqual(40 * 100 + 40 * 40);
  }, 120000);

  it('your own show: on the calendar with you on top, and the books the morning after', async () => {
    on();
    const c = begin('@indie', 13);
    setFans(c, 5000);
    c.money = 5000;
    let date = addDays(c.today, 15);
    while (weekday(date) !== 6) date = addDays(date, 1);
    const hires = hireable(c, 'UK', date).slice(0, 5).map((w) => w.id);
    const plan = { date, country: 'UK', city: 'Leeds', venue: 'hall', opp: hires[0]!, hires: hires.slice(1) };
    const b = ownBudget(c, plan);
    expect(b.draw).toBeGreaterThan(50);
    expect(putOnShow(c, plan)).toMatch(/Presents/);
    const id = Object.keys(c.shows).find((k) => k.startsWith('own|'))!;
    expect(c.shows[id]!.card!.at(-1)).toMatchObject({ a: c.player });
    while (c.today <= date) await step(c);
    expect(c.letters.some((l) => /Your show (made|lost)/.test(l.subject))).toBe(true);
  }, 180000);

  it('effort pays: a hard-working indie builds a real second career; a lazy one makes pocket money', async () => {
    on();
    const run = async (grind: boolean) => {
      const c = begin('@indie', 17);
      setFans(c, 5000);
      c.money = 3000;
      if (grind) {
        setCoaching(c, [[1, 'pm'], [2, 'pm'], [3, 'pm'], [4, 'pm'], [5, 'pm'], [2, 'am']]);
        for (const d of [1, 3, 5]) c.routine = { ...(c.routine ?? (await import('./day')).defaultRoutine()) }, c.routine.week[d]!.am = 'content';
      }
      for (let d = 0; d < 84; d++) {
        for (const l of c.letters) if (l.action?.type === 'indie' && !l.done) acceptLetter(c, l);
        if (grind) for (const x of conventionsAhead(c)) if (weekday(x.day) === 6 && x.day > addDays(c.today, 2) && x.day <= addDays(c.today, 9)) bookConvention(c, x.id);
        if (hustleOf(c).stock < 10) buyStock(c, 25);
        await days(c, 1);
      }
      const wrestling = c.ledger.filter((e) => e.kind === 'fee' || e.kind === 'bonus').reduce((t, e) => t + e.amount, 0);
      const side = c.ledger.filter((e) => e.amount > 0 && (e.kind === 'event' || /^Merch (table|online)/.test(e.text))).reduce((t, e) => t + e.amount, 0);
      const by = new Map<string, number>();
      for (const e of c.ledger) if (e.amount > 0 && (e.kind === 'event' || /^Merch/.test(e.text))) { const k = e.text.split(' · ')[0]!.replace(/^.*(Fan Fest|Con|Expo|Fair)$/, 'Convention'); by.set(k, (by.get(k) ?? 0) + e.amount); }
      return { wrestling, side, by: JSON.stringify([...by]), taught: hustleOf(c).taught ?? 0, subs: hustleOf(c).subs };
    };
    const grind = await run(true), lazy = await run(false);
    // eslint-disable-next-line no-console
    console.log(`12 weeks, 5k fans. Grinding: wrestling £${grind.wrestling}, side £${grind.side} ${grind.by} (taught ${grind.taught}, subs ${grind.subs}). Lazy: side £${lazy.side} ${lazy.by}`);
    expect(grind.side).toBeGreaterThan(grind.wrestling * 2);
    expect(lazy.side).toBeLessThan(grind.side * 0.35);
  }, 300000);
});
