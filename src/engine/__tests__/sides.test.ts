import { describe, expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { MatchEngine } from '../match';
import { foe, fighting, isPlayer } from '../commentary';
import { runHeadless } from '../sim/runHeadless';

const ids = WRESTLERS.slice(0, 4).map((w) => w.id);

describe('any number of sides (match overhaul, stage 1)', () => {
  it('singles still have exactly two sides, the player on you', () => {
    const S = new MatchEngine({ you: ids[0]!, them: ids[1]!, seed: 1 }).state;
    expect(S.order).toEqual(['you', 'them']);
    expect(S.type).toBe('singles');
    expect(S.player).toBe('you');
    expect(isPlayer(S, 'you')).toBe(true);
    expect(isPlayer(S, 'them')).toBe(false);
    expect(foe(S, 'you')).toBe('them');
    expect(foe(S, 'them')).toBe('you');
    expect(S.sides.you).toBe(S.you);
    expect(Object.keys(S.view.sides)).toEqual(['you', 'them']);
  });

  it('extra sides get their own slot, team, brain and per-side records', () => {
    const e = new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 2 }], seed: 2 });
    const S = e.state;
    expect(S.order).toEqual(['you', 'them', 's2']);
    expect(S.type).toBe('triple');
    expect(S.sides.s2!.team).toBe(2);
    expect(S.sides.s2!.controller).toBe('ai');
    expect(fighting(S)).toEqual(['you', 'them', 's2']);
    expect(S.ref.warnings.s2).toBe(0);
    expect(S.obj.score.s2).toBe(0);
    expect(S.view.sides.s2).toBeDefined();
  });

  it('teammates go after the other team', () => {
    const S = new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 0 }, { id: ids[3]!, team: 1 }], seed: 3 }).state;
    for (const k of S.order) expect(S.sides[foe(S, k)]!.team).not.toBe(S.sides[k]!.team);
  });

  it('a three-sided match runs to a finish headless', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const r = runHeadless({ seed, you: ids[0]!, them: ids[1]!, model: { kind: 'fixed', rate: 0.5 }, rules: {}, extras: [{ id: ids[2]!, team: 2 }] });
      expect(r.stuck).toBeNull();
      expect(r.ended).toBe(true);
    }
  });

  it('nobody at the controls: every side is the AI', () => {
    const S = new MatchEngine({ you: ids[0]!, them: ids[1]!, player: null, seed: 4 }).state;
    expect(S.player).toBeNull();
    expect(S.order.every((k) => S.sides[k]!.controller === 'ai')).toBe(true);
    for (let seed = 1; seed <= 4; seed++) {
      const r = runHeadless({ seed, you: ids[0]!, them: ids[1]!, model: { kind: 'fixed', rate: 0.5 }, player: null });
      expect(r.stuck).toBeNull();
      expect(r.ended).toBe(true);
    }
  });
});
