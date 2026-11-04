import { afterEach, describe, expect, it } from 'vitest';
import { findWrestler, fansTotal } from '../data/rtr';
import { simMyMatch } from '../ui/career/simMine';
import { advancePhase, myBoutToday, replyTo, skip } from './index';
import { addDays } from './dates';
import { calledOut } from './mail';
import { relationOf } from './relations';
import { patienceOf } from './patience';
import { begin, quick } from './testkit';
import { FEATURES } from './tuning';
import type { Career } from './types';

const DEFAULTS = { ...FEATURES };
afterEach(() => { Object.assign(FEATURES, DEFAULTS); });

/** A phase the game's way, with your match simmed by the real engine (so it has a report card). */
async function step(c: Career) {
  if (myBoutToday(c) && c.phase === 'pm') simMyMatch(c);
  await advancePhase(c, quick);
}

describe('mail (Lyra’s calls)', () => {
  it('a result letter carries the report card, the booker’s verdict, what it did and the reaction online', async () => {
    FEATURES.mail = true;
    const c = begin('jamie_mercer', 5);
    for (let i = 0; i < 40 && !c.letters.some((l) => l.kind === 'result'); i++) await step(c);
    const r = c.letters.find((l) => l.kind === 'result')!;
    expect(r).toBeTruthy();
    expect(r.report!.grades.map((g) => g.l)).toHaveLength(5);
    expect(r.report!.recap.length).toBeGreaterThan(20);
    expect(r.report!.booker!.lines.length).toBeGreaterThan(0);
    expect(r.report!.effects.map(([k]) => k)).toEqual(expect.arrayContaining(['Paid', 'Fans', 'Reputation']));
    expect(r.report!.posts.length).toBeGreaterThanOrEqual(2);
    expect(r.replies!.length).toBeGreaterThanOrEqual(2);
    expect(c.history[0]!.grades).toHaveLength(5);
  }, 120000);

  it('Mondays bring a digest of the world and a check-in from your booker; world news waits for the digest', async () => {
    FEATURES.mail = true;
    const c = begin('jamie_mercer', 9);
    for (let i = 0; i < 30; i++) await step(c);
    const digests = c.letters.filter((l) => l.kind === 'digest');
    expect(digests.length).toBeGreaterThanOrEqual(2);
    expect(digests[0]!.sections!.map((s) => s.h)).toEqual(expect.arrayContaining(['Your week', 'Power rankings']));
    expect(c.letters.filter((l) => l.kind === 'booker').length).toBeGreaterThanOrEqual(2);
    expect(c.letters.filter((l) => l.kind === 'news' && l.from === 'The news desk' && !/^Your /.test(l.subject))).toEqual([]);
  }, 120000);

  it('replies move what they say they move, once', () => {
    FEATURES.mail = true;
    const c = begin('jamie_mercer');
    const rival = Object.keys(c.people).find((id) => id !== c.player && findWrestler(id))!;
    calledOut(c, rival);
    const l = c.letters[0]!;
    const was = relationOf(c, rival)?.v ?? 0;
    expect(replyTo(c, l.id, 'accept')).toMatch(/^On\./);
    expect(relationOf(c, rival)!.v).toBeLessThan(was);
    expect(c.social!.callouts[rival]).toBe(c.today);
    expect(replyTo(c, l.id, 'laugh')).toBe('');
    // A booker check-in reply moves patience.
    const key = c.people[c.player]!.contract!.promo;
    const p0 = patienceOf(c, key);
    const ci = { kind: 'booker', id: 'x1', day: c.today, from: 'B', subject: 's', body: [], read: false, ctx: { booker: key }, replies: [{ id: 'complain', label: 'Complain' }] } as unknown as Career['letters'][number];
    c.letters.unshift(ci);
    replyTo(c, 'x1', 'complain');
    expect(patienceOf(c, key)).toBeLessThan(p0);
  });

  it('ignore a rival’s call-out and it costs you; answer it and it doesn’t', async () => {
    FEATURES.mail = true;
    const run = async (answer: boolean) => {
      const c = begin('@indie', 3);
      const me = findWrestler(c.player)!;
      const rival = Object.keys(c.people).find((id) => id !== c.player && findWrestler(id))!;
      calledOut(c, rival);
      const l = c.letters[0]!;
      if (answer) replyTo(c, l.id, 'high');
      const rep = c.people[c.player]!.rep, fans = fansTotal(me);
      for (let i = 0; i < 14; i++) { c.today = addDays(c.today, 1); await advancePhase(c, quick); }
      return { done: l.done, outcome: l.outcome, rep: c.people[c.player]!.rep - rep, fans: fansTotal(me) - fans };
    };
    const ignored = await run(false), answered = await run(true);
    expect(ignored.done).toBe('expired');
    expect(ignored.outcome).toMatch(/scared/);
    expect(answered.done).toBeUndefined();
    expect(ignored.rep).toBeLessThan(answered.rep);
  }, 120000);

  it('a skip stops for new mail, and saying not to stops it stopping', async () => {
    FEATURES.mail = true;
    const c = begin('jamie_mercer', 4);
    const r = await skip(c, { days: 14 }, quick, { mine: async (x) => simMyMatch(x) });
    expect(r.stopped).toMatch(/New mail|match/);
    c.routine!.stopFor = { decisions: false, people: false, checkins: false, news: false };
    c.routine!.simMine = true;
    const r2 = await skip(c, { days: 7 }, quick, { mine: async (x) => simMyMatch(x) });
    expect(r2.stopped).toBeNull();
  }, 120000);
});
