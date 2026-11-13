// The big cut (Lyra's call): what's hidden stays hidden, and what's left still works without it.
import { describe, expect, it } from 'vitest';
import { findWrestler, PROMOTIONS } from '../data/rtr';
import { simMyMatch } from '../ui/career/simMine';
import { activeWorld } from '../world/world';
import { teamOf } from '../world/matchWorld';
import { ensureBond } from '../world/people';
import { boutRules } from './career';
import { canRun, foundingProblem } from './company';
import { advancePhase, myBoutToday } from './index';
import { buyGear } from './life/staff';
import { askTeamUp, teamUpOffer } from './teamPhone';
import { begin, quick } from './testkit';
import { CUT_CLAUSES, FEATURES, LIFE_PARTS, MONEY_TROUBLE_AT } from './tuning';
import type { Career } from './types';

async function step(c: Career) {
  if (myBoutToday(c) && c.phase === 'pm') simMyMatch(c);
  await advancePhase(c, quick);
}

describe('the big cut', () => {
  it('the switches are where Lyra put them', () => {
    expect(FEATURES).toMatchObject({ social: false, phone: false, jobs: false, romance: false, politics: false, bookerMode: false, checkIns: false, press: false, playSegments: false });
    // Kept: the world's business, mail, hustles, AM/PM, living costs, skipping, the history sim, feuds.
    expect(FEATURES).toMatchObject({ booker: true, mail: true, hustles: true, days: true, livingCosts: true, skip: true, history: true, feuds2: true, life: true });
    expect(LIFE_PARTS).toMatchObject({ money: true, school: true, entrance: true, homes: false, staff: false, invest: false, ai: false, status: false, family: false, risk: false, after: false });
    expect(CUT_CLAUSES).toHaveLength(11);
  });

  it('booker mode is hidden from you: no booking for anyone, no founding', () => {
    const c = begin('jamie_mercer');
    const major = PROMOTIONS.find((p) => !p.indie && !p.closed)!;
    expect(canRun(c, major.initials)).toMatch(/switched on/);
    expect(foundingProblem(c, { name: 'Test Wrestling', initials: 'TSTW', country: 'UK', city: 'Leeds', capital: 50_000 })).toMatch(/switched on/);
  });

  it('with the phone gone you can still ask someone to team up', () => {
    const c = begin('jamie_mercer');
    const me = findWrestler(c.player)!;
    const them = Object.keys(c.people).map(findWrestler).find((w) => w && w.id !== me.id && w.promotion === me.promotion && w.gender === me.gender && !teamOf(activeWorld(), w.id))!;
    const x = ensureBond(activeWorld().people!, c.player, them.id, c.today);
    x.la = 80; x.lb = 80;
    expect(teamUpOffer(c, them.id)?.label).toMatch(/team up/);
    expect(askTeamUp(c, them.id, () => 0).note).toMatch(/You’re a team/);
    expect(teamOf(activeWorld(), c.player)?.members).toContain(them.id);
  });

  it('your entrance works without the staff part of Life', () => {
    const c = begin('@indie');
    c.money = 100_000;
    buyGear(c, 'theme');
    const show = Object.values(c.shows).find((s) => s.promo === 'TIS')!;
    const opp = Object.keys(c.people).find((id) => id !== c.player && findWrestler(id))!;
    const bout = { a: c.player, b: opp };
    show.card = [bout];
    expect(boutRules(c, show, bout, c.player, opp, false).entrance?.side).toBe('you');
  });

  it('a month of mail: no check-ins, no digest, no press, and the world’s news doesn’t pile up', async () => {
    const c = begin('jamie_mercer', 9);
    for (let i = 0; i < 60; i++) await step(c);
    expect(c.letters.filter((l) => l.kind === 'digest' || l.kind === 'booker' || l.kind === 'press')).toEqual([]);
    expect(c.letters.filter((l) => l.kind === 'news' && l.from === 'The news desk' && !/^Your /.test(l.subject))).toEqual([]);
    expect(c.mailBox?.length ?? 0).toBeLessThan(40);
    expect(c.letters.filter((l) => l.kind === 'result').length).toBeGreaterThan(0);
  }, 120000);

  it('money trouble without day jobs: a friend, or ride it out', async () => {
    const c = begin('jamie_mercer');
    c.money = MONEY_TROUBLE_AT - 500;
    for (let i = 0; i < 2 && !c.letters.some((l) => l.action?.type === 'event' && l.action.event === 'money_trouble'); i++) await step(c);
    const l = c.letters.find((x) => x.action?.type === 'event' && x.action.event === 'money_trouble')!;
    expect(l).toBeTruthy();
    const ids = l.action?.type === 'event' ? l.action.options.map((o) => o.id) : [];
    expect(ids).not.toContain('gig');
    expect(ids).not.toContain('job');
    expect(ids).toContain('ride');
  });
});
