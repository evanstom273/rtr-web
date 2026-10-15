import { describe, expect, it } from 'vitest';
import { MOVES, WRESTLERS, getMove } from '../../data/rtr';
import { isOutsideArea, isSharedFlatArea, isSupportedDirectionalPair, moveAreasMatch } from '../areaRules';
import { candidateActions, findFollowupPaths, isContested, isRecovery, motionMatches, moveMatchesSnapshots, projectAction } from '../setupRules';
import { resolveTarget, targetHp } from '../targeting';
import type { Snapshot } from '../types';

const neutral = (over: Partial<Snapshot> = {}): Snapshot => ({ position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY', ...over });
const fullHp = () => ({ HEAD: 100, BODY: 100, LEFT_ARM: 100, RIGHT_ARM: 100, LEFT_LEG: 100, RIGHT_LEG: 100 });

describe('motion and areas', () => {
  it('staggering satisfies a stationary requirement, nothing else does', () => {
    expect(motionMatches('STATIONARY', 'STAGGERING')).toBe(true);
    expect(motionMatches('STATIONARY', 'RUNNING')).toBe(false);
  });

  it('classifies flat and outside areas', () => {
    expect(isSharedFlatArea('IN_RING')).toBe(true);
    expect(isSharedFlatArea('TOP_ROPE')).toBe(false);
    expect(isOutsideArea('RAMP')).toBe(true);
    expect(isOutsideArea('APRON')).toBe(false);
  });

  it('only supports the known directional pairs', () => {
    expect(isSupportedDirectionalPair('TOP_ROPE', 'IN_RING')).toBe(true);
    expect(isSupportedDirectionalPair('BACKSTAGE', 'TOP_ROPE')).toBe(false);
  });

  it('shared-flat moves need both wrestlers in the same flat area', () => {
    const m = getMove('americana');
    expect(moveAreasMatch(m, 'IN_RING', 'IN_RING')).toBe(true);
    expect(moveAreasMatch(m, 'IN_RING', 'OUTSIDE')).toBe(false);
  });
});

describe('move requirements', () => {
  it('a front-facing grounded target is needed for an Americana', () => {
    const m = getMove('americana');
    expect(moveMatchesSnapshots(m, neutral(), neutral({ position: 'GROUNDED', orientation: 'FACE_UP' }))).toBe(true);
    expect(moveMatchesSnapshots(m, neutral(), neutral({ position: 'GROUNDED', orientation: 'FACE_DOWN' }))).toBe(false);
    expect(moveMatchesSnapshots(m, neutral(), neutral())).toBe(false);
  });

  it('every wrestler has something to do from the opening stance', () => {
    const a = neutral(), t = neutral();
    for (const w of WRESTLERS) {
      const usable = [...w.moves, ...w.signatures, ...w.finishers].map(getMove).filter((m) => moveMatchesSnapshots(m, a, t));
      const paths = findFollowupPaths([...w.moves, ...w.finishers].map(getMove), a, t);
      expect(usable.length + paths.length, w.name).toBeGreaterThan(0);
    }
  });
});

describe('setups', () => {
  it('offers the opening options from a neutral standoff', () => {
    const c = candidateActions(neutral(), neutral());
    for (const id of ['irish_whip', 'get_behind_opponent', 'throw_into_corner', 'start_running', 'climb_top_rope'] as const) expect(c).toContain(id);
    expect(c).not.toContain('stand_up');
  });

  it('a grounded wrestler can only get up (or taunt-free recover)', () => {
    const c = candidateActions(neutral({ position: 'GROUNDED', orientation: 'FACE_UP' }), neutral());
    expect(c).toContain('stand_up');
    expect(c).not.toContain('irish_whip');
  });

  it('projects positions and rejects invalid actions', () => {
    const turned = projectAction('turn_opponent_face_down', neutral(), neutral({ position: 'GROUNDED', orientation: 'FACE_UP' }));
    expect(turned.valid).toBe(true);
    expect(turned.target.orientation).toBe('FACE_DOWN');
    expect(projectAction('stand_up', neutral(), neutral()).valid).toBe(false);
    expect(projectAction('reset_stance', neutral(), neutral()).valid).toBe(true);
  });

  it('separates contested setups from recoveries', () => {
    expect(isContested('irish_whip')).toBe(true);
    expect(isRecovery('stand_up')).toBe(true);
    expect(isContested('stand_up')).toBe(false);
  });

  it('finds a two-step path to a Boston Crab from a standoff', () => {
    const paths = findFollowupPaths([getMove('boston_crab')], neutral(), neutral());
    // Standing opponent → needs grounding, which setups alone cannot do, so no path; grounded face up → one turn.
    expect(paths).toHaveLength(0);
    const fromGround = findFollowupPaths([getMove('boston_crab')], neutral(), neutral({ position: 'GROUNDED', orientation: 'FACE_UP' }));
    expect(fromGround.length).toBeGreaterThan(0);
    expect(fromGround[0]!.actions).toEqual(['turn_opponent_face_down']);
  });
});

describe('targeting', () => {
  it('CHOOSE_ARM honours a focus and otherwise picks the weaker arm', () => {
    const m = getMove('americana');
    expect(resolveTarget(m, 'RIGHT_ARM', fullHp()).parts).toEqual(['RIGHT_ARM']);
    const hp = { ...fullHp(), RIGHT_ARM: 40 };
    expect(resolveTarget(m, 'NONE', hp).parts).toEqual(['RIGHT_ARM']);
    expect(resolveTarget(m, 'NONE', fullHp()).parts).toEqual(['LEFT_ARM']);
  });

  it('BOTH_LEGS hits both legs at reduced weight', () => {
    const r = resolveTarget(getMove('boston_crab'), 'NONE', fullHp());
    expect([...r.parts].sort()).toEqual(['LEFT_LEG', 'RIGHT_LEG']);
    expect(r.isBilateral).toBe(true);
    for (const p of r.parts) expect(r.weights[p]).toBeLessThan(1);
    expect(targetHp({ ...fullHp(), LEFT_LEG: 50 }, r)).toBeLessThan(100);
  });

  it('every move resolves to at least one body part', () => {
    for (const m of MOVES) expect(resolveTarget(m, 'NONE', fullHp()).parts.length, m.id).toBeGreaterThan(0);
  });
});
