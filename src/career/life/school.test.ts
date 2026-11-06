import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { begin as kitBegin, day } from '../testkit';
import { FEATURES } from '../tuning';
import { findWrestler, WRESTLERS } from '../../data/rtr';
import { activeWorld } from '../../world/world';
import { bondOf } from '../../world/people';
import { accept, buySchool, graduate, hireCoach, coachPool, monthlySchool, mySchool, mySchoolRec, openSchool, readOf, schools, statTotal } from './school';
import { life } from './state';

const was = FEATURES.life;
const begin = (who: string, seed?: number) => { const c = kitBegin(who, seed); (FEATURES as { life: boolean }).life = true; return c; };
beforeEach(() => { (FEATURES as { life: boolean }).life = true; });
afterEach(() => { (FEATURES as { life: boolean }).life = was; });

describe('Life stage 5: the school', () => {
  it('every country’s schools are real (reputation, coaches), and new rookies come out of them', async () => {
    const c = begin('@indie');
    const all = Object.values(schools());
    expect(all.length).toBeGreaterThan(40);
    expect(all.every((s) => s.rep >= 20 && s.rep <= 70)).toBe(true);
    c.nextRookie = c.today;
    await day(c);
    const rookie = WRESTLERS.find((w) => w.id.startsWith('rookie_'))!;
    expect(rookie.school).toBeTruthy();
    expect(schools()[rookie.school!]!.country).toBe(rookie.country);
  });

  it('open a school, take students, train them (you learn what they’ve got), graduate one into the world', () => {
    const c = begin('buck_stratton');
    c.money = 500_000;
    expect(openSchool(c)).toMatch(/is open/);
    const S = mySchool(c)!;
    expect(S.applicants.length).toBeGreaterThan(3);
    const pick = S.applicants[0]!;
    accept(c, pick.id);
    accept(c, S.applicants[0]!.id, true);
    expect(S.students.length).toBe(2);
    const coach = coachPool(c)[0];
    if (coach) hireCoach(c, coach.id);
    const st = S.students[0]!;
    const [lo0, hi0] = readOf(st), before = statTotal(st), money0 = c.money;
    for (let m = 0; m < 12; m++) { c.today = `2027-${String(m + 1).padStart(2, '0')}-01`; monthlySchool(c); }
    const [lo1, hi1] = readOf(st);
    expect(hi1 - lo1).toBeLessThan(hi0 - lo0);
    expect(statTotal(st)).toBeGreaterThan(before);
    expect(c.ledger.some((e) => e.kind === 'school' && e.amount > 0)).toBe(true);
    expect(c.money).not.toBe(money0);
    expect(graduate(c, st.id)).toMatch(/graduates/);
    const grad = WRESTLERS.find((w) => w.name === st.name && w.school === mySchoolRec(c)!.id)!;
    expect(grad).toBeTruthy();
    expect(grad.promotion).toBe('TIS');
    expect(bondOf(activeWorld().people!, c.player, grad.id)).toBeTruthy();
    expect(mySchoolRec(c)!.grads).toBe(1);
    void findWrestler;
  });

  it('buy a school, coaches and all', () => {
    const c = begin('buck_stratton');
    c.money = 5_000_000;
    const country = life(c).homes[0]!.country;
    const s = Object.values(schools()).find((x) => x.country === country)!;
    expect(buySchool(c, s.id)).toMatch(/is yours/);
    expect(s.owner).toBe('player');
    expect(mySchool(c)!.applicants.length).toBeGreaterThan(0);
  });
});
