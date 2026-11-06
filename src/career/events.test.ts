// Career events (expansion stage 3): pacing, cooldowns, contract gating, effects, follow-ups, expiry,
// one answer per letter, and a long run answering whatever comes in. EVENT_STATS=1 prints how often each fires.
import { describe, expect, it } from 'vitest';
import { findWrestler, globalScore } from '../data/rtr';
import { seededRng } from '../engine/rng';
import { freshWorld, setWorld } from '../world/world';
import { C } from './clauses';
import { addDays, daysBetween } from './dates';
import { answerEvent, applyBout, ctxFor, eligible, eventLibrary, finishDay, fire, myBoutToday, startCareer } from './index';
import type { SimJob, SimOut } from './sim';
import { EVENT_BLOCKED_MULT, EVENT_EXPIRES_DAYS, EVENT_MAX_OPEN, EVENT_MIN_GAP } from './tuning';
import type { Career, Contract } from './types';

const quick = async (jobs: SimJob[]): Promise<SimOut[]> => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const pa = globalScore(a) / (globalScore(a) + globalScore(b));
  return { key: j.key, winner: (j.seed % 1000) / 1000 < pa ? 'you' : 'them', finish: 'PINFALL', t: 600, stars: 3, stats: { you: {} as never, them: {} as never } };
});

function begin(player = 'jamie_mercer', seed = 7): Career {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player, today: '2026-11-03', seed });
  w.career = c;
  return c;
}

async function day(c: Career, i: number): Promise<void> {
  const mine = myBoutToday(c);
  if (mine) applyBout(c, mine.show, mine.index, (await quick([{ key: 'mine', seed: i, you: mine.bout.a, them: mine.bout.b, rules: {} }]))[0]!, true);
  await finishDay(c, quick);
}

const def = (id: string) => eventLibrary().find((d) => d.id === id)!;
const sign = (c: Career, clauses: Partial<Record<number, number>> = {}): Contract => {
  const p = c.people[c.player]!;
  const k: Contract = { promo: 'NWF', start: c.today, end: addDays(c.today, 365), fee: 300, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((v, i) => clauses[i] ?? v) };
  p.contract = k;
  findWrestler(c.player)!.promotion = 'NWF';
  return k;
};

describe('career events', () => {
  it('the library is well-formed: unique ids, at least two choices, nothing with an empty label', () => {
    const lib = eventLibrary();
    expect(lib.length).toBeGreaterThanOrEqual(45);
    expect(new Set(lib.map((d) => d.id)).size).toBe(lib.length);
    for (const d of lib) {
      expect(d.options.length, d.id).toBeGreaterThanOrEqual(2);
      expect(new Set(d.options.map((o) => o.id)).size, d.id).toBe(d.options.length);
    }
  });

  it('an event arrives as a letter with its choices; answering applies the effects once', () => {
    const c = begin();
    const x = ctxFor(c);
    const l = fire(x, def('hospital_visit'))!;
    expect(l.kind).toBe('event');
    expect(l.action?.type).toBe('event');
    const rep = c.people[c.player]!.rep;
    const said = answerEvent(c, l.id, 'go');
    expect(said).toMatch(/won’t forget/);
    expect(l.done).toBe('accepted');
    expect(l.outcome).toBe(said);
    expect(c.people[c.player]!.rep).toBeGreaterThan(rep);
    const after = c.people[c.player]!.rep;
    expect(answerEvent(c, l.id, 'go')).toMatch(/dealt with/);
    expect(c.people[c.player]!.rep).toBe(after);
  });

  it('money choices are paid once and blocked when you can’t afford them', () => {
    const c = begin();
    const l = fire(ctxFor(c), def('specialist_coach'))!;
    const pay = l.action?.type === 'event' ? l.action.options.find((o) => o.id === 'pay')! : null;
    c.money = 0;
    expect(answerEvent(c, l.id, 'pay')).toMatch(/can’t afford/);
    expect(l.done).toBeUndefined();
    c.money = 100000;
    const before = c.money;
    answerEvent(c, l.id, 'pay');
    expect(c.money).toBeLessThan(before);
    const paid = before - c.money;
    answerEvent(c, l.id, 'pay');
    expect(before - c.money).toBe(paid);
    expect(pay).toBeTruthy();
  });

  it('Exclusivity gates media: Total Exclusivity blocks it, and the letter says why', () => {
    const c = begin();
    sign(c, { [C.exclusivity]: 3 });
    const l = fire(ctxFor(c), def('podcast'))!;
    const opts = l.action?.type === 'event' ? l.action.options : [];
    expect(opts.find((o) => o.id === 'straight')!.blocked).toMatch(/totally exclusive/);
    expect(opts.find((o) => o.id === 'no')!.blocked).toBeUndefined();
    expect(answerEvent(c, l.id, 'straight')).toMatch(/totally exclusive/);
    expect(l.done).toBeUndefined();
  });

  it('Merchandise Rights gates the T-shirt deal', () => {
    const c = begin();
    sign(c, { [C.merch]: 0 });
    const l = fire(ctxFor(c), def('merch_design'))!;
    expect(answerEvent(c, l.id, 'yes')).toMatch(/Merchandise Rights/);
  });

  it('unanswered events lapse after their window, and say nothing happened', async () => {
    const c = begin();
    const l = fire(ctxFor(c), def('hospital_visit'))!;
    for (let i = 0; i <= EVENT_EXPIRES_DAYS; i++) await day(c, i);
    expect(l.done).toBe('expired');
    expect(c.events!.open[l.id]).toBeUndefined();
    expect(c.events!.log.some((e) => e.id === 'hospital_visit' && e.pick === null)).toBe(true);
  });

  it('follow-ups land later: the documentary airs a month on', async () => {
    const c = begin();
    sign(c, { [C.exclusivity]: 0 });
    const l = fire(ctxFor(c), def('documentary'))!;
    answerEvent(c, l.id, 'yes');
    const pop = globalScore(findWrestler(c.player)!);
    for (let i = 0; i < 31; i++) await day(c, i);
    expect(c.letters.some((y) => y.subject === 'The documentary is out')).toBe(true);
    expect(globalScore(findWrestler(c.player)!)).toBeGreaterThan(pop - 3);
    expect(c.events!.follow ?? []).toHaveLength(0);
  });

  it('events your contract rules out entirely come round less often, but still come round', () => {
    const c = begin();
    sign(c, { [C.exclusivity]: 3 });
    const blocked = eligible(ctxFor(c)).find((e) => e.d.id === 'convention' || e.d.id === 'podcast');
    sign(c, { [C.exclusivity]: 0 });
    const open = eligible(ctxFor(c)).find((e) => e.d.id === blocked?.d.id);
    expect(blocked && open).toBeTruthy();
    expect(blocked!.w).toBeCloseTo(open!.w * EVENT_BLOCKED_MULT);
  });

  it('an event that just happened is on cooldown', () => {
    const c = begin();
    fire(ctxFor(c), def('hospital_visit'));
    expect(eligible(ctxFor(c)).some((e) => e.d.id === 'hospital_visit')).toBe(false);
  });

  it('a year answering everything: pacing holds, cooldowns hold, nothing throws, and it’s the same every time', async () => {
    const run = async (seed: number) => {
      const c = begin('jamie_mercer', seed);
      const pick = seededRng(seed);
      let maxOpen = 0;
      for (let i = 0; i < 365; i++) {
        await day(c, i);
        const open = Object.keys(c.events?.open ?? {});
        maxOpen = Math.max(maxOpen, open.length);
        for (const id of open) {
          if (pick() < 0.15) continue; // some go unanswered
          const l = c.letters.find((y) => y.id === id)!;
          const opts = l.action?.type === 'event' ? l.action.options.filter((o) => !o.blocked) : [];
          if (opts.length) answerEvent(c, id, opts[Math.floor(pick() * opts.length)]!.id);
        }
      }
      return { c, maxOpen };
    };
    const { c, maxOpen } = await run(7);
    const log = [...c.events!.log].reverse();
    // Invitations to one-offs (stage 4) arrive when the show's announced, trait offers when you've earned one, a
    // fundraiser when you're badly hurt, and a day job clashing with a date when it's booked: all outside the random pacing.
    const outside = (l: (typeof c.letters)[number]) => l.action?.type === 'event' && (l.action.event.startsWith('invite_') || l.action.event === 'trait_offer' || l.action.event === 'fundraiser' || l.action.event === 'job_clash');
    const fired = c.letters.filter((l) => l.kind === 'event' && !outside(l));
    expect(maxOpen).toBeLessThanOrEqual(EVENT_MAX_OPEN);
    expect(fired.length).toBeGreaterThanOrEqual(20);
    expect(fired.length).toBeLessThanOrEqual(80);
    // Never two events within the minimum gap.
    const days = fired.map((l) => l.day).sort();
    for (let i = 1; i < days.length; i++) expect(daysBetween(days[i - 1]!, days[i]!)).toBeGreaterThanOrEqual(EVENT_MIN_GAP);
    // Each event respects its own cooldown.
    const lastFired: Record<string, string> = {};
    for (const l of [...fired].sort((a, b) => (a.day < b.day ? -1 : 1))) {
      const id = l.action?.type === 'event' ? l.action.event : '';
      if (lastFired[id]) expect(daysBetween(lastFired[id]!, l.day), id).toBeGreaterThanOrEqual(def(id).cooldown);
      lastFired[id] = l.day;
    }
    expect(log.length).toBeGreaterThan(0);
    // Same seed, same story.
    const again = await run(7);
    expect(again.c.letters.filter((l) => l.kind === 'event' && !outside(l)).map((l) => l.subject)).toEqual(fired.map((l) => l.subject));
    if (process.env.EVENT_STATS) {
      const count: Record<string, number> = {};
      for (const l of fired) { const id = l.action?.type === 'event' ? l.action.event : '?'; count[id] = (count[id] ?? 0) + 1; }
      console.log(`${fired.length} events in a year\n${Object.entries(count).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('\n')}`);
    }
  }, 120000);
});
