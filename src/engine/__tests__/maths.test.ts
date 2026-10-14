import { describe, expect, it } from 'vitest';
import { damageFor } from '../damage';
import { defWidth, meterDur, offWidth, revChance } from '../moves';
import { kickoutZone, pinPressure, refCountOutcome, refSurviveChance } from '../pin';
import { subRatio } from '../submission';
import { move, side } from './helpers';

describe('revChance', () => {
  const rook = () => side('rook', 'you');
  const juno = () => side('juno', 'them');

  it('base chance by risk, plus fresh defender bonus', () => {
    const a = rook(), d = juno();
    // fresh defender (stamina > 70) adds 6
    expect(revChance(a, d, { kind: 'move', m: move(a, 'Chop') })).toBe(22 + 6);
    expect(revChance(a, d, { kind: 'move', m: move(a, 'Castling') })).toBe(19 + 6);
    expect(revChance(a, d, { kind: 'move', m: move(a, 'Checkmate') })).toBe(14 + 6);
    const j = juno();
    expect(revChance(j, rook(), { kind: 'move', m: move(j, 'Hurricanrana') })).toBe(28 + 6 + 4); // Rook tec 95 > 85
  });

  it('punishes repeating the last move, and spamming', () => {
    const a = rook(), d = juno(), m = move(a, 'Chop');
    a.lastMove = 'Chop';
    expect(revChance(a, d, { kind: 'move', m })).toBe(28 + 12);
    a.lastMove = 'Arm drag';
    a.used.Chop = 2;
    expect(revChance(a, d, { kind: 'move', m })).toBe(28 + 6);
  });

  it('rewards hitting a weakened part, punishes hammering one part', () => {
    const a = rook(), d = juno(), m = move(a, 'Arm stomp');
    d.hp.arm = 39;
    expect(revChance(a, d, { kind: 'move', m })).toBe(22 + 6 - 6);
    a.recentParts = ['arm', 'arm', 'arm', 'arm', 'head'];
    expect(revChance(a, d, { kind: 'move', m })).toBe(22 + 6 - 6 + 6);
  });

  it('stamina and momentum modifiers', () => {
    const a = rook(), d = juno(), m = move(a, 'Chop');
    d.stamina = 20; // -10
    d.momentum = 80; // +8
    a.momentum = 80; // -6
    a.stamina = 20; // +10
    expect(revChance(a, d, { kind: 'move', m })).toBe(22 - 10 + 8 - 6 + 10);
  });

  it('setups use their contest value and skip move-only modifiers', () => {
    const a = rook(), d = juno();
    a.lastMove = 'Pick them up';
    expect(revChance(a, d, { kind: 'setup', contest: 28 })).toBe(28 + 6);
    expect(revChance(a, d, { kind: 'setup', contest: 0 })).toBe(25 + 6); // 0 falls back to 25
  });

  it('clamps to 5–60', () => {
    const a = rook(), d = juno(), m = move(a, 'Checkmate');
    d.stamina = 10;
    a.momentum = 90;
    expect(revChance(a, d, { kind: 'move', m })).toBe(5);
    const b = rook(), e = juno(), n = move(b, 'Chop');
    b.lastMove = 'Chop';
    b.stamina = 10;
    e.momentum = 90;
    b.recentParts = ['body', 'body', 'body', 'body'];
    // 22 + 6 + 8 + 10 + 12 + 6 = 64 → capped
    expect(revChance(b, e, { kind: 'move', m: n })).toBe(60);
  });

  it('gold widths and bar speeds', () => {
    expect(offWidth(28)).toBeCloseTo(29.2);
    expect(offWidth(60)).toBe(14);
    expect(offWidth(5)).toBe(43);
    expect(defWidth(28)).toBeCloseTo(16.8);
    expect(defWidth(5)).toBe(6);
    expect(defWidth(60)).toBe(32);
    const r = rook();
    expect(meterDur(move(r, 'Checkmate'))).toBe(1550);
    expect(meterDur(move(r, 'Castling'))).toBe(1780);
    expect(meterDur(move(r, 'Chop'))).toBe(1900);
    expect(meterDur(move(side('sol'), 'Hurricanrana'))).toBe(1700);
  });
});

describe('pinPressure', () => {
  it('an early plain cover has no chance', () => {
    expect(pinPressure(0, side('juno', 'them'), { imp: 2, move: null })).toBe(0);
  });

  it('finisher at ten minutes on a fresh opponent', () => {
    // 13*2.5 + 32 + min(20,10) - (0-50)*0.1
    expect(pinPressure(600, side('juno', 'them'), { imp: 13, finisher: true, move: null })).toBeCloseTo(32.5 + 32 + 10 + 5);
  });

  it('damage, fatigue, absorbed finishers and low head/body all add', () => {
    const d = side('juno', 'them');
    d.hp = { head: 30, body: 30, arm: 70, leg: 70 }; // avg 50 → +27.5, head & body < 35 → +16
    d.stamina = 50; // +10
    d.fkAbsorbed = 1; // +12
    d.momentum = 50; // ±0
    // plain cover, imp 5, 15 minutes in
    expect(pinPressure(900, d, { imp: 5, move: null })).toBeCloseTo(12.5 + 27.5 + 10 + 15 + 12 + 16);
  });

  it('early-match penalties by type', () => {
    const d = side('juno', 'them');
    d.momentum = 50;
    // under five minutes: flash -35 then +35
    expect(pinPressure(120, d, { imp: 2, flash: true, move: null })).toBeCloseTo(5 + 2);
    // five to ten minutes: finisher -5
    expect(pinPressure(360, d, { imp: 13, finisher: true, move: null })).toBeCloseTo(32.5 + 32 + 6 - 5);
    // five to ten minutes: plain -20
    expect(pinPressure(360, d, { imp: 10, move: null })).toBeCloseTo(25 + 6 - 20);
  });

  it('clamps at 135', () => {
    const d = side('juno', 'them');
    d.hp = { head: 0, body: 0, arm: 0, leg: 0 };
    d.stamina = 0;
    d.fkAbsorbed = 3;
    expect(pinPressure(1800, d, { imp: 14, finisher: true, move: null })).toBe(135);
  });

  it('ref count survival curve and outcomes', () => {
    expect(refSurviveChance(0)).toBe(0.98);
    expect(refSurviveChance(62.5)).toBeCloseTo(0.75);
    expect(refSurviveChance(135)).toBe(0.03);
    expect(refCountOutcome(() => 0.99, 10)).toBe(0); // failed survival roll
    expect(refCountOutcome(() => 0.1, 10)).toBe(1);
    expect(refCountOutcome(() => 0.1, 50)).toBe(2);
    const seq = [0.1, 0.9];
    expect(refCountOutcome(() => seq.shift() ?? 0, 50)).toBe(2.9);
    expect(refCountOutcome(() => 0.01, 100)).toBe(2.9);
  });

  it('kickout gold zone narrows with pressure and stays on the track', () => {
    expect(kickoutZone(() => 0, 0)).toEqual({ lo: 46, width: 36 });
    const hard = kickoutZone(() => 1, 135);
    expect(hard.width).toBe(5);
    expect(hard.lo).toBe(87);
    expect(hard.lo + hard.width).toBeLessThanOrEqual(95);
  });
});

describe('subRatio', () => {
  it('matches the A/(A+D) formula', () => {
    const a = side('rook', 'you'), d = side('juno', 'them');
    const m = move(a, 'Checkmate');
    // A = 20 + 95*.3 + 0 + 0 + 25 + 10*.8 = 81.5; D = 20 + 66*.25 + 100*.3 + 100*.25 + 0 = 91.5
    expect(subRatio(600, a, d, m)).toBeCloseTo(81.5 / (81.5 + 91.5));
  });

  it('limb work, damage and absorbed finishers swing it to the attacker', () => {
    const a = side('rook', 'you'), d = side('juno', 'them');
    const m = move(a, 'Armbar');
    d.hp.arm = 40;
    d.partHits.arm = 4;
    d.fkAbsorbed = 1;
    a.momentum = 60;
    // A = 20 + 28.5 + 60*.55 + 9 + 0 + 20*.8 + 10 = 116.5 ; D = 20 + 16.5 + 30 + 10 + 0 - 5 = 71.5
    expect(subRatio(1500, a, d, m)).toBeCloseTo(116.5 / (116.5 + 71.5));
  });

  it('early in the match the defender gets a big bonus', () => {
    const a = side('rook', 'you'), d = side('juno', 'them'), m = move(a, 'Armbar');
    expect(subRatio(0, a, d, m)).toBeLessThan(subRatio(300, a, d, m));
    expect(subRatio(300, a, d, m)).toBeLessThan(subRatio(600, a, d, m));
  });
});

describe('damage', () => {
  it('scales with the relevant stat and the target part', () => {
    const a = side('rook'), d = side('juno', 'them');
    // Chop is a strike: uses strk (66). roll .5 → ×1.0
    expect(damageFor(a, d, move(a, 'Chop'), 0.5)).toBeCloseTo(4 * (1 + 1 / 180));
    // grapple uses str (60)
    expect(damageFor(a, d, move(a, 'DDT'), 0.5)).toBeCloseTo(7 * (1 - 5 / 180));
    // hold uses tec (95), damaged part adds (100-hp)*0.06
    d.hp.arm = 50;
    expect(damageFor(a, d, move(a, 'Armbar'), 0.5)).toBeCloseTo(3 * (1 + 30 / 180) + 3);
  });

  it('roll spans ±10%', () => {
    const a = side('barr'), d = side('juno', 'them'), m = move(a, 'Powerbomb');
    const mid = damageFor(a, d, m, 0.5);
    expect(damageFor(a, d, m, 0)).toBeCloseTo(mid * 0.9);
    expect(damageFor(a, d, m, 1)).toBeCloseTo(mid * 1.1);
  });
});
