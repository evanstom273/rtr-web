// Traits in the ring: each hook moves its number, and only for the wrestler who has the trait.
import { describe, expect, it } from 'vitest';
import { WRESTLERS, getMove, type TraitId, type Wrestler } from '../../data/rtr';
import { TRAIT_FX as FX } from '../../career/tuning';
import { moveContest, setupContest } from '../dice';
import { staminaCostMultiplier } from '../exhaustion';
import { pinProfile } from '../interaction';
import { DEFAULT_RULES } from '../match';
import { seededRng } from '../rng';
import { createSide } from '../side';
import { createState } from '../state';
import { workHoldDamage } from '../submission';
import { resolveTarget } from '../targeting';
import { aiMoveLean, aiSetupLean, anyRollMods, heatMult, rollForm, temperature } from '../traits';
import type { MatchRulesConfig, Side } from '../types';

const base = WRESTLERS.find((w) => w.id === 'jamie_mercer')!;
const who = (traits: TraitId[]): Wrestler => ({ ...structuredClone(base), traits });
const side = (traits: TraitId[], k: 'you' | 'them' = 'you'): Side => createSide(who(traits), k);
const mod = (mods: { label: string; value: number }[], label: string) => mods.find((m) => m.label === label)?.value;
const highRisk = WRESTLERS.flatMap((w) => w.moves).map((id) => getMove(id)).find((m) => m.type === 'AERIAL')!;
const strike = WRESTLERS.flatMap((w) => w.moves).map((id) => getMove(id)).find((m) => m.type === 'STRIKE')!;
const hold = WRESTLERS.flatMap((w) => w.moves).map((id) => getMove(id)).find((m) => m.submission)!;

describe('traits in the ring', () => {
  it('Risk Taker: high-risk moves cost less on the dice, and the AI goes for them', () => {
    const plain = side([]), rt = side(['risk_taker']), d = side([], 'them');
    const t = resolveTarget(highRisk, 'NONE', d.hp);
    expect(mod(moveContest(plain, d, highRisk, t).attack.mods, 'High risk')).toBe(-2);
    expect(mod(moveContest(rt, d, highRisk, t).attack.mods, 'High risk')).toBe(FX.risk_taker.highRiskDice);
    expect(aiMoveLean(rt, highRisk, true, false, 100)).toBe(FX.risk_taker.aiHighRisk);
    expect(aiMoveLean(plain, highRisk, true, false, 100)).toBe(0);
    expect(aiSetupLean(rt, 'climb_top_rope')).toBe(FX.risk_taker.aiClimb);
    expect(heatMult(rt, 'high')).toBeCloseTo(FX.risk_taker.heat);
  });

  it('Methodical gets an edge on a worn part and picks more sharply; Inconsistent and Unpredictable less so', () => {
    const m = side(['methodical']), d = side([], 'them');
    for (const k of Object.keys(d.hp) as (keyof typeof d.hp)[]) d.hp[k] = 30;
    const t = resolveTarget(strike, 'NONE', d.hp);
    expect(mod(moveContest(m, d, strike, t).attack.mods, 'Methodical')).toBe(FX.methodical.wornDice);
    expect(temperature(m)).toBeLessThan(1);
    expect(temperature(side(['inconsistent']))).toBeGreaterThan(1);
  });

  it('Defensive is guarded on every counter; Aggressive starts fast and tires faster', () => {
    const a = side([]), d = side(['defensive'], 'them');
    const t = resolveTarget(strike, 'NONE', d.hp);
    expect(mod(moveContest(a, d, strike, t).defend.mods, 'Guarded')).toBe(FX.defensive.counterDice);
    const ag = side(['aggressive']);
    expect(mod(moveContest(ag, side([], 'them'), strike, t).attack.mods, 'Aggressive start')).toBe(FX.aggressive.earlyDice);
    expect(staminaCostMultiplier(ag)).toBeCloseTo(staminaCostMultiplier(a) * FX.aggressive.stamina);
    expect(aiSetupLean(ag, 'catch_breath')).toBeLessThan(0);
  });

  it('Showboat taunts better and more often, and the crowd loves it', () => {
    const s = side(['showboat']);
    expect(mod(setupContest(s, side([], 'them'), 'taunt').attack.mods, 'Showboat')).toBe(FX.showboat.tauntDice);
    expect(aiSetupLean(s, 'taunt')).toBe(FX.showboat.aiTaunt);
    expect(heatMult(s, 'taunt')).toBeCloseTo(FX.showboat.tauntHeat);
  });

  it('Resilient kicks out more often, for the AI and in your timing window', () => {
    const plain = pinProfile(22, 60, 40, 2, side([], 'them'));
    const tough = pinProfile(22, 60, 40, 2, side(['resilient'], 'them'));
    expect(tough.aiChance - plain.aiChance).toBeCloseTo(FX.resilient.kickout);
    expect(tough.window / plain.window).toBeCloseTo(FX.resilient.window);
  });

  it('Submission Specialist works holds harder; the AI reaches for them', () => {
    const s = side(['submission_specialist']);
    expect(workHoldDamage(s, hold) / workHoldDamage(side([]), hold)).toBeCloseTo(FX.submission_specialist.holdDamage);
    expect(aiMoveLean(s, hold, false, false, 100)).toBeGreaterThanOrEqual(FX.submission_specialist.aiHold);
  });

  it('Big-Match Performer only rises to a big match; Inconsistent has a form for the night, fixed by the seed', () => {
    const rules = (big: boolean): MatchRulesConfig => ({ ...DEFAULT_RULES, big });
    const S1 = createState(seededRng(1), who(['big_match']), who([]), rules(false));
    expect(mod(anyRollMods(S1.you), 'Big match')).toBeUndefined();
    const S2 = createState(seededRng(1), who(['big_match']), who([]), rules(true));
    expect(mod(anyRollMods(S2.you), 'Big match')).toBe(FX.big_match.dice);
    // A title match is a big match too.
    expect(createState(seededRng(1), who(['big_match']), who([]), { ...DEFAULT_RULES, title: true }).you.big).toBe(true);
    const forms = new Set<number>();
    for (let i = 0; i < 60; i++) forms.add(rollForm(side(['inconsistent']), seededRng(i)));
    expect([...forms].every((f) => f >= -2 && f <= 2)).toBe(true);
    expect(forms.size).toBeGreaterThan(3);
    expect(rollForm(side(['inconsistent']), seededRng(5))).toBe(rollForm(side(['inconsistent']), seededRng(5)));
    // Nobody else rolls at all, so other matches don't shift.
    const r = seededRng(3);
    expect(rollForm(side([]), r)).toBe(0);
    expect(r()).toBe(seededRng(3)());
  });

  it('Crowd Pleaser lifts the crowd for everything they do', () => {
    const cp = side(['crowd_pleaser']);
    expect(heatMult(cp, 'move')).toBeCloseTo(FX.crowd_pleaser.heat);
    expect(heatMult(cp, 'kickout')).toBeCloseTo(FX.crowd_pleaser.heat);
    expect(heatMult(side([]), 'move')).toBe(1);
  });
});
