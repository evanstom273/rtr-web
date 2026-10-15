import { describe, expect, it } from 'vitest';
import { WRESTLERS, getMove } from '../../data/rtr';
import type { Ctx } from '../ctx';
import { createHeld, heldBy, WEAPON_MOVES } from '../env';
import { afterAction, endFall } from '../flow';
import { MatchEngine } from '../match';
import { finishMove, moveIsValid } from '../moves';
import { canPin } from '../pin';
import { executeExtra, finishExtraContest, ironManClock, lmsAfterMove, LADDER_PULLS } from '../stip';
import { normaliseRules, DEFAULT_STIPULATION_RULES } from '../stipulations';
import { holdCanWin } from '../submission';
import { resolveTarget } from '../targeting';
import { getWeapon } from '../../data/rtr';
import type { MatchRulesConfig, Snapshot, StipulationId } from '../types';
import { DEFAULT_RULES } from '../match';

const stand = (area: Snapshot['area']): Snapshot => ({ position: 'STANDING', orientation: 'FRONT', area, motion: 'STATIONARY' });
const down = (area: Snapshot['area']): Snapshot => ({ position: 'GROUNDED', orientation: 'FACE_UP', area, motion: 'STATIONARY' });

/** A match with the player in control, and the engine's internals to poke at. rnd: force every roll. */
function setup(stipulation: StipulationId, rnd?: () => number, rules: Partial<MatchRulesConfig> = {}) {
  const e = new MatchEngine({ you: WRESTLERS[0]!.id, them: WRESTLERS[1]!.id, seed: 3, rules: { stipulation, ...rules }, ...(rnd ? { rng: rnd } : {}) });
  const ctx = (e as unknown as { ctx: Ctx }).ctx;
  e.state.control = 'you';
  e.state.pending = { kind: 'awaitPlayer' };
  return { e, S: e.state, ctx };
}

describe('stipulation rules', () => {
  const norm = (stipulation: StipulationId, extra: Partial<MatchRulesConfig> = {}) => normaliseRules({ ...DEFAULT_RULES, ...DEFAULT_STIPULATION_RULES, stipulation, ...extra });

  it('each stipulation forces its own rules', () => {
    expect(norm('tables')).toMatchObject({ pins: false, subs: false, countOuts: false, dq: false, weapons: true });
    expect(norm('submission')).toMatchObject({ pins: false, subs: true, weapons: false });
    expect(norm('no_dq', { countOuts: false })).toMatchObject({ dq: false, countOuts: false });
    expect(norm('standard', { dq: false })).toMatchObject({ dq: false, countOuts: true });
    expect(norm('iron_man', { dq: false, countOuts: false })).toMatchObject({ dq: true, countOuts: true });
  });

  it('a cage with every way to win switched off still has the escape', () => {
    expect(norm('steel_cage', { cageEscape: false, cagePins: false, cageSubs: false })).toMatchObject({ cageEscape: true, pins: false, subs: false });
    expect(norm('steel_cage', { cagePins: false })).toMatchObject({ pins: false, subs: true });
  });

  it('a title ladder match hangs the championship', () => {
    expect(norm('ladder', { title: true }).ladderPrize).toBe('Championship');
  });
});

describe('weapons', () => {
  it('can be pulled from under the ring and swung at an opponent in the same spot', () => {
    const { e, S } = setup('no_dq');
    S.you.state = stand('OUTSIDE');
    S.them.state = stand('IN_RING');
    expect(e.playerSetups()).toContain('retrieve_weapon');
    expect(e.chooseSetup('retrieve_weapon', 'steel_chair')).toBe(true);
    expect(heldBy(S, 'you')?.weaponId).toBe('steel_chair');
    const shot = WEAPON_MOVES.find((m) => m.id === 'weapon:chair_shot')!;
    expect(moveIsValid(S, 'you', shot)).toBe(false);
    S.them.state = stand('OUTSIDE');
    expect(moveIsValid(S, 'you', shot)).toBe(true);
    expect(moveIsValid(S, 'you', WEAPON_MOVES.find((m) => m.id === 'weapon:janice_swing')!)).toBe(false);
  });

  it('a weapon shot the referee sees is a disqualification', () => {
    const { S, ctx } = setup('standard', () => 0.01);
    S.you.state = stand('IN_RING');
    S.them.state = stand('IN_RING');
    createHeld(ctx, 'you', getWeapon('steel_chair'));
    const shot = WEAPON_MOVES.find((m) => m.id === 'weapon:chair_shot')!;
    finishMove(ctx, 'you', shot, false, resolveTarget(shot, 'NONE', S.them.hp));
    expect(S.result).toMatchObject({ winner: 'them', finish: 'DISQUALIFICATION' });
  });

  it('the same shot is fine without disqualifications, and can open a cut', () => {
    const { S, ctx } = setup('no_dq', () => 0.01);
    S.you.state = stand('IN_RING');
    S.them.state = stand('IN_RING');
    createHeld(ctx, 'you', getWeapon('barbed_wire_bat'));
    const shot = WEAPON_MOVES.find((m) => m.id === 'weapon:barbed_wire_bat_swing')!;
    finishMove(ctx, 'you', shot, false, resolveTarget(shot, 'NONE', S.them.hp));
    expect(S.result).toBeNull();
    expect(S.them.bleeding).toBe(1);
  });
});

describe('objectives', () => {
  it('a table break wins a Tables match once a finisher has been banked, and not before', () => {
    for (const gate of [false, true]) {
      const { S, ctx } = setup('tables', () => 0.99);
      S.obj.gateOpen = gate;
      S.you.state = stand('IN_RING');
      S.them.state = stand('IN_RING');
      const t = createHeld(ctx, 'you', getWeapon('table'));
      Object.assign(t, { state: 'flat', holder: null, area: 'IN_RING', positioned: 'them', positionedBy: 'you' });
      const move = S.you.all.find((m) => m.impact >= 6 && m.res.t.position === 'GROUNDED' && !m.submission && m.type === 'GRAPPLE')
        ?? getMove('powerbomb');
      finishMove(ctx, 'you', move, false, resolveTarget(move, 'NONE', S.them.hp));
      expect(t.state).toBe('broken');
      expect(S.result?.finish === 'TABLES').toBe(gate);
    }
  });

  it('enough pulls at the ladder prize win it', () => {
    const { S, ctx } = setup('ladder');
    S.obj.gateOpen = true;
    for (let i = 0; i < LADDER_PULLS; i++) finishExtraContest(ctx, 'you', 'reach_for_prize', false);
    afterAction(ctx);
    expect(S.result).toMatchObject({ winner: 'you', finish: 'LADDER' });
  });

  it('a big enough blow in Last Man Standing lets you make the referee count', () => {
    const { e, S, ctx } = setup('last_man_standing');
    S.them.state = down('IN_RING');
    const big = S.you.all.find((m) => m.impact >= 8)!;
    lmsAfterMove(S, 'you', big, 'CLEAN_SUCCESS');
    expect(S.obj.lmsFor).toBe('them');
    S.you.state = stand('IN_RING');
    expect(e.playerSetups()).toContain('begin_standing_count');
    executeExtra(ctx, 'you', 'begin_standing_count');
    expect(S.pending.kind).toBe('refTen');
    S.pending = { kind: 'refTen', id: 1, counted: 'them', beatenAt: null };
    e.advance();
    expect(S.result).toMatchObject({ winner: 'you', finish: 'TEN_COUNT' });
  });

  it('pins and holds follow the stipulation', () => {
    const fca = setup('falls_count_anywhere').S;
    fca.you.state = stand('CROWD');
    fca.them.state = down('CROWD');
    expect(canPin(fca, 'you')).toBe(true);
    const std = setup('standard').S;
    std.you.state = stand('OUTSIDE');
    std.them.state = down('OUTSIDE');
    expect(canPin(std, 'you')).toBe(false);
    const lms = setup('last_man_standing').S;
    lms.them.state = down('IN_RING');
    expect(canPin(lms, 'you')).toBe(false);
    expect(holdCanWin(lms, 'you')).toBe(false);
  });
});

describe('falls', () => {
  it('two out of three goes on after the first fall and ends on the second', () => {
    const { S, ctx } = setup('two_out_of_three');
    endFall(ctx, 'you', 'PINFALL', null);
    expect(S.over).toBe(false);
    expect(S.obj.score.you).toBe(1);
    expect(S.you.state.area).toBe('IN_RING');
    endFall(ctx, 'them', 'SUBMISSION', null);
    endFall(ctx, 'you', 'PINFALL', null);
    expect(S.result).toMatchObject({ winner: 'you', score: { you: 2, them: 1 } });
  });

  it('Iron Man: the leader wins at the bell; level means sudden death', () => {
    const lead = setup('iron_man', undefined, { ironManMinutes: 10 });
    lead.S.obj.score.them = 1;
    lead.S.t = 600;
    ironManClock(lead.ctx);
    afterAction(lead.ctx);
    expect(lead.S.result).toMatchObject({ winner: 'them', finish: 'TIME_DECISION' });

    const level = setup('iron_man', undefined, { ironManMinutes: 10 });
    level.S.t = 600;
    ironManClock(level.ctx);
    expect(level.S.obj.overtime).toBe(true);
    endFall(level.ctx, 'you', 'PINFALL', null);
    expect(level.S.result?.winner).toBe('you');
  });
});
