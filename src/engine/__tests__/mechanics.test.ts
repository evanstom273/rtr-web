import { describe, expect, it } from 'vitest';
import { WRESTLERS, getMove } from '../../data/rtr';
import { exhaustionBand, moveDemand, staminaCostMultiplier } from '../exhaustion';
import { canPush, edgeOf, judge, landChance, moveContest } from '../dice';
import { MatchEngine } from '../match';
import { lateMatchProfile, pinProfile, submissionContext } from '../interaction';
import * as ix from '../interactions';
import { conditionResistance, pinCondition, pinOdds } from '../pin';
import { MAX_FINISHER_STOCK, addMomentum, convertLandedSignature, createSide, damagePart, grantFinisherStock, spendFinisher, totalHp } from '../side';
import { aiGoesForTap, workHoldDamage } from '../submission';
import { resolveTarget } from '../targeting';
import type { MatchState } from '../types';

const side = (k: 'you' | 'them' = 'you', i = 0) => createSide(WRESTLERS[i]!, k);

describe('side state', () => {
  it('starts with six full body parts and a stamina pool of 2.5× the attribute', () => {
    const s = side();
    expect(totalHp(s)).toBe(600);
    expect(s.maxStamina).toBe(Math.ceil(s.w.stats.stamina * 2.5));
  });

  it('body parts floor at zero', () => {
    const s = side();
    damagePart(s, 'HEAD', 250);
    expect(s.hp.HEAD).toBe(0);
  });

  it('a full momentum bar readies the signature and earns resiliency once', () => {
    const s = side();
    expect(addMomentum(s, 100)).toBe(true);
    expect(s.signatureReady && s.resiliencyAvailable).toBe(true);
    expect(convertLandedSignature(s)).toBe(true);
    expect(s.finisherStock).toBe(1);
    s.resiliencyAvailable = false;
    addMomentum(s, 100);
    expect(s.resiliencyAvailable).toBe(false);
  });

  it('finisher stock caps at three', () => {
    const s = side();
    grantFinisherStock(s, 10);
    expect(s.finisherStock).toBe(MAX_FINISHER_STOCK);
    expect(spendFinisher(s)).toBe(true);
    expect(s.finisherStock).toBe(2);
  });
});

describe('exhaustion', () => {
  it('worsens as stamina drains and fatigue builds', () => {
    const s = side();
    expect(exhaustionBand(s)).toBe('Fresh');
    s.stamina = 0;
    s.fatigue = 100;
    expect(exhaustionBand(s)).toBe('Spent');
    expect(staminaCostMultiplier(s, 'EXPLOSIVE')).toBeGreaterThan(1);
  });

  it('finishers are explosive', () => {
    const f = WRESTLERS[0]!.finishers.map(getMove)[0]!;
    expect(moveDemand(f)).toBe('EXPLOSIVE');
  });
});

describe('contested rolls', () => {
  const contestFor = (pick?: (a: ReturnType<typeof side>, d: ReturnType<typeof side>) => void) => {
    const a = side('you', 0), d = side('them', 1);
    pick?.(a, d);
    const m = getMove(a.w.moves[0]!);
    return { a, d, m, ...moveContest(a, d, m, resolveTarget(m, 'NONE', d.hp)) };
  };

  it('a straight roll with equal bonuses favours the attacker: their d20 against a d16', () => {
    const { attack, defend } = contestFor();
    attack.bonus = defend.bonus = 0;
    attack.edges = defend.edges = [];
    const p = landChance(attack, defend);
    expect(p).toBeGreaterThan(60);
    expect(p).toBeLessThan(66);
  });

  it('naturals beat totals', () => {
    expect(judge(1, 2, 50, 0)).toEqual({ landed: false, crit: 'attacker1' });
    expect(judge(19, 16, 50, 0)).toEqual({ landed: false, crit: 'defenderTop' });
    expect(judge(20, 15, -50, 0)).toEqual({ landed: true, crit: 'attackerTop' });
    expect(judge(5, 1, -50, 0)).toEqual({ landed: true, crit: 'defender1' });
    expect(judge(10, 12, 3, 1)).toEqual({ landed: true, crit: null });
  });

  it('advantage helps and pushing grants it', () => {
    const { attack, defend } = contestFor();
    const base = landChance(attack, defend);
    attack.pushed = true;
    expect(edgeOf(attack)).toBe(1);
    expect(landChance(attack, defend)).toBeGreaterThan(base + 5);
  });

  it('momentum and a worn-down target make moves land more often', () => {
    const fresh = contestFor();
    const worn = contestFor((a, d) => {
      a.momentum = 80;
      for (const p of Object.keys(d.hp) as (keyof typeof d.hp)[]) d.hp[p] = 30;
    });
    expect(landChance(worn.attack, worn.defend)).toBeGreaterThan(landChance(fresh.attack, fresh.defend) + 10);
  });

  it('repeating the same move hands the defender advantage', () => {
    const { a, d, m } = contestFor();
    a.recentMoves.push(m.id);
    const again = moveContest(a, d, m, resolveTarget(m, 'NONE', d.hp));
    expect(edgeOf(again.defend)).toBe(1);
  });

  it('cannot push while a signature is banked', () => {
    const a = side();
    a.momentum = 100;
    a.signatureReady = true;
    expect(canPush(a)).toBe(false);
    a.signatureReady = false;
    expect(canPush(a)).toBe(true);
  });
});

describe('pins and submissions', () => {
  it('pressure narrows the kickout window and later counts are tighter', () => {
    const d = side('them');
    const easy = pinProfile(18, 0, 50, 2, d), hard = pinProfile(18, 100, 0, 2, d);
    expect(hard.window).toBeLessThan(easy.window);
    expect(hard.aiChance).toBeLessThan(easy.aiChance);
    expect(pinProfile(18, 50, 50, 3, d).window).toBeLessThan(pinProfile(18, 50, 50, 1, d).window);
  });

  it('late match escalates finish pressure', () => {
    expect(lateMatchProfile(0).finishPressure).toBe(0);
    expect(lateMatchProfile(2200).finishPressure).toBeGreaterThan(lateMatchProfile(1600).finishPressure);
  });

  it('has no early-match submission protection', () => {
    const a = side('you', 0), d = side('them', 1);
    const m = getMove('americana');
    const t = resolveTarget(m, 'NONE', d.hp);
    expect(submissionContext(a, d, m, 30, t, false).tapThreshold).toBe(submissionContext(a, d, m, 800, t, false).tapThreshold);
    expect(submissionContext(a, d, m, 2200, t, false).tapThreshold).toBeLessThan(submissionContext(a, d, m, 30, t, false).tapThreshold);
  });

  it('a worn-down limb is easier to submit', () => {
    const a = side('you', 0), d = side('them', 1);
    const m = getMove('americana');
    const fresh = submissionContext(a, d, m, 300, resolveTarget(m, 'LEFT_ARM', d.hp), false);
    d.hp.LEFT_ARM = 15;
    const hurt = submissionContext(a, d, m, 300, resolveTarget(m, 'LEFT_ARM', d.hp), false);
    expect(hurt.attackerScore - hurt.defenderScore).toBeGreaterThan(fresh.attackerScore - fresh.defenderScore);
  });

  it('tug outcomes', () => {
    expect(ix.tugOutcome(95, 90, 10)).toBe('TAP_OUT');
    expect(ix.tugOutcome(5, 90, 10)).toBe('SUBMISSION_ESCAPE');
    expect(ix.tugOutcome(50, 90, 10)).toBeNull();
    expect(ix.tugTapImpulse(100, 1)).toBeCloseTo(ix.TUG_MAX_IMPULSE);
  });
});

describe('pin odds shown to the player', () => {
  it('a fresh opponent rarely stays down; a wrecked one usually does', () => {
    const e = new MatchEngine({ you: WRESTLERS[0]!.id, them: WRESTLERS[1]!.id, seed: 4 });
    const S = e.state;
    S.you.momentum = 50;
    S.you.lastActionResult = 'CLEAN_SUCCESS';
    S.you.lastMoveLanded = getMove('falcon_arrow');
    const fresh = pinOdds(S, 'you', true);
    for (const p of Object.keys(S.them.hp) as (keyof typeof S.them.hp)[]) S.them.hp[p] = 20;
    S.them.stamina = S.them.maxStamina * 0.15;
    S.them.fatigue = 85;
    const wrecked = pinOdds(S, 'you', true);
    expect(fresh).toBeLessThan(15);
    expect(wrecked).toBeGreaterThan(70);
  });
});

describe('pin resistance comes from damage, not the clock', () => {
  it('a fresh wrestler fights harder than a worn-down one', () => {
    const fresh = side('them', 1), worn = side('them', 2);
    for (const p of Object.keys(worn.hp) as (keyof typeof worn.hp)[]) worn.hp[p] = 35;
    worn.stamina = worn.maxStamina * 0.25;
    worn.fatigue = 70;
    expect(pinCondition(fresh)).toBeGreaterThan(95);
    expect(pinCondition(worn)).toBeLessThan(40);
    expect(conditionResistance(fresh)).toBeGreaterThan(100);
    expect(conditionResistance(worn)).toBeLessThan(0);
  });
});

describe('holds: go for the tap or work the hold', () => {
  const S = (a: ReturnType<typeof side>, d: ReturnType<typeof side>, t = 300) => ({ you: d, them: a, t }) as unknown as MatchState;
  const armbar = () => getMove('americana');

  it('the AI works the hold on a fresh opponent and goes for the tap once the limb is gone', () => {
    const a = side('them', 2), d = side('you', 1);
    a.w = { ...a.w, classes: ['STRIKER'] };
    const t = resolveTarget(armbar(), 'LEFT_ARM', d.hp);
    expect(aiGoesForTap(S(a, d), 'them', armbar(), t)).toBe(false);
    d.hp.LEFT_ARM = 30;
    expect(aiGoesForTap(S(a, d), 'them', armbar(), resolveTarget(armbar(), 'LEFT_ARM', d.hp))).toBe(true);
  });

  it('technicians trust their holds sooner', () => {
    const a = side('them', 2), d = side('you', 1);
    d.hp.LEFT_ARM = 45;
    const t = resolveTarget(armbar(), 'LEFT_ARM', d.hp);
    a.w = { ...a.w, classes: ['STRIKER'] };
    expect(aiGoesForTap(S(a, d), 'them', armbar(), t)).toBe(false);
    a.w = { ...a.w, classes: ['TECHNICIAN'] };
    expect(aiGoesForTap(S(a, d), 'them', armbar(), t)).toBe(true);
    expect(workHoldDamage(a, armbar())).toBeGreaterThan(workHoldDamage({ ...a, w: { ...a.w, classes: ['STRIKER'] } }, armbar()));
  });
});

describe('signatures and finishers sheet', () => {
  it('lists both specials kinds with requirements, readiness and a route', () => {
    const e = new MatchEngine({ you: WRESTLERS[0]!.id, them: WRESTLERS[1]!.id, seed: 3 });
    const list = e.specials('you');
    expect(list.filter((s) => s.kind === 'SIGNATURE').length).toBeGreaterThan(0);
    expect(list.filter((s) => s.kind === 'FINISHER').length).toBeGreaterThan(0);
    for (const s of list) {
      expect(s.ready).toBe(false);
      expect(s.needs).toBeTruthy();
      expect(s.usable).toBe(false);
      expect(s.userNeeds.length).toBeGreaterThan(0);
      if (s.fits) expect(s.route).toEqual([]);
    }
    e.state.you.signatureReady = true;
    expect(e.specials('you').filter((s) => s.kind === 'SIGNATURE').every((s) => s.ready && s.needs === null)).toBe(true);
  });
});
