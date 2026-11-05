import { describe, expect, it } from 'vitest';
import { getWeapon, WRESTLERS } from '../../data/rtr';
import { MatchEngine } from '../match';
import { runHeadless } from '../sim/runHeadless';
import { seededRng } from '../rng';
import { canRetrieve, heldBy, weaponMovesFor } from '../env';
import { gimmickActions } from '../gimmicks';
import { validSetups } from '../setups';
import type { Ctx } from '../ctx';
import type { FinishType, StipulationId } from '../types';

const pick = (seed: number) => {
  const rnd = seededRng(seed), out: string[] = [];
  while (out.length < 2) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id)) out.push(w.id); }
  return out;
};
const run = (seed: number, stipulation: StipulationId, rules: Record<string, unknown> = {}) => {
  const [you, them] = pick(seed);
  return runHeadless({ seed, you: you!, them: them!, model: { kind: 'fixed', rate: 0.5 }, rules: { stipulation, ...rules } });
};
const engine = (seed: number, stipulation: StipulationId, rules: Record<string, unknown> = {}) => {
  const [you, them] = pick(seed);
  return new MatchEngine({ you: you!, them: them!, seed, rules: { stipulation, ...rules } });
};
const logHas = (r: ReturnType<typeof run>, re: RegExp) => r.engine.state.log.some((l) => re.test(l.segs.map((s) => s.v).join('')));

describe('every new stipulation finishes its own way', () => {
  const cases: [StipulationId, FinishType[]][] = [
    ['casket', ['CASKET']], ['ambulance', ['AMBULANCE']], ['stretcher', ['STRETCHER']], ['strap', ['CORNERS']],
    ['first_blood', ['FIRST_BLOOD']], ['texas_death', ['TEN_COUNT']],
    ['street_fight', ['PINFALL', 'SUBMISSION']], ['no_holds_barred', ['PINFALL', 'SUBMISSION']], ['deathmatch', ['PINFALL', 'SUBMISSION']],
    ['dog_collar', ['PINFALL', 'SUBMISSION']], ['bull_rope', ['PINFALL', 'SUBMISSION']], ['lumberjack', ['PINFALL', 'SUBMISSION', 'DISQUALIFICATION']],
    ['pole', ['PINFALL', 'SUBMISSION', 'DISQUALIFICATION']],
  ];
  for (const [stip, finishes] of cases) {
    it(stip, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const r = run(seed, stip);
        expect(r.stuck).toBeNull();
        expect(finishes).toContain(r.result!.finish);
        expect(r.result!.t / 60).toBeLessThan(90);
      }
    });
  }
});

describe('the rules that come with them', () => {
  it('tied together: both hold what ties them, can use it, never drop it, and can’t fetch anything else', () => {
    for (const [stip, weapon] of [['strap', 'leather_strap'], ['dog_collar', 'collar_chain'], ['bull_rope', 'cowbell']] as const) {
      const e = engine(3, stip);
      const S = e.state;
      for (const k of ['you', 'them']) {
        const o = heldBy(S, k)!;
        expect(o.weaponId).toBe(weapon);
        expect(o.fixed).toBe(true);
        expect(weaponMovesFor(S, k).length).toBeGreaterThan(0);
        expect(validSetups(S, k)).not.toContain('drop_weapon');
      }
      expect(canRetrieve(S, getWeapon('steel_chair'))).toBe(false);
      const r = run(4, stip);
      expect(heldBy(r.engine.state, 'you')?.weaponId).toBe(weapon);
    }
  });

  it('the deathmatch kit only comes out in a deathmatch, and people go through the glass', () => {
    expect(canRetrieve(engine(5, 'no_dq').state, getWeapon('glass_pane'))).toBe(false);
    expect(canRetrieve(engine(5, 'deathmatch').state, getWeapon('glass_pane'))).toBe(true);
    expect(engine(5, 'deathmatch').state.rules.barbedRopes).toBe(true);
    let kit = 0;
    for (let seed = 10; seed < 40; seed++) if (logHas(run(seed, 'deathmatch'), /glass|barbed|Light Tube Bundle/i)) kit++;
    expect(kit).toBeGreaterThan(5);
  });

  it('first blood: whoever bleeds first loses', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const r = run(seed, 'first_blood');
      expect(r.engine.state.sides[r.result!.loser!]!.bleeding).toBeGreaterThan(0);
    }
  });

  it('Texas death: falls only start a ten count', () => {
    let counts = 0;
    for (let seed = 1; seed <= 8; seed++) if (logHas(run(seed, 'texas_death'), /this is Texas death/)) counts++;
    expect(counts).toBe(8);
  });

  it('lumberjacks throw anyone who leaves back in', () => {
    let thrown = 0;
    for (let seed = 1; seed <= 15; seed++) if (logHas(run(seed, 'lumberjack'), /lumberjacks throw/)) thrown++;
    expect(thrown).toBeGreaterThan(3);
  });

  it('the object on the pole: climb up and it’s yours (and legal); a contract on a pole wins it', () => {
    let got = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = run(seed, 'pole');
      if (r.engine.state.obj.pole?.taken) got++;
    }
    expect(got).toBeGreaterThan(5);
    for (let seed = 1; seed <= 6; seed++) expect(run(seed, 'pole', { poleObject: 'contract' }).result!.finish).toBe('POLE');
  });

  it('the strap: the run of corners starts again the moment the other one takes over', () => {
    const e = engine(7, 'strap');
    const S = e.state;
    S.obj.corners!.you = 3;
    S.control = 'them';
    const ctx = (e as unknown as { ctx: Ctx }).ctx;
    void ctx;
    S.pending = { kind: 'idle' };
    (e as unknown as { run: (c: unknown) => void }).run({ to: 'next' });
    // Settle through the after-action hook.
    return import('../gimmicks').then(({ gimmickAfterAction }) => {
      gimmickAfterAction((e as unknown as { ctx: Ctx }).ctx);
      expect(S.obj.corners!.you).toBe(0);
    });
  });

  it('the player gets the stipulation’s actions when they’re on', () => {
    const e = engine(8, 'casket');
    const S = e.state;
    S.them.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
    S.them.hp = { HEAD: 30, BODY: 30, LEFT_ARM: 60, RIGHT_ARM: 60, LEFT_LEG: 60, RIGHT_LEG: 60 };
    S.them.stamina = S.them.maxStamina * 0.2;
    expect(gimmickActions(S, 'you')).toContain('load_casket');
  });
});
