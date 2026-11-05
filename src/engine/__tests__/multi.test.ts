import { describe, expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { MatchEngine } from '../match';
import { runHeadless } from '../sim/runHeadless';
import { seededRng } from '../rng';
import { aiPickTarget, alive, isMulti, opponents, teamsAlive } from '../multi';
import { distance, zoneDistance, zoneOf } from '../zones';
import type { Ctx } from '../ctx';
import type { MatchState } from '../types';

const pick = (seed: number, n: number) => {
  const rnd = seededRng(seed), out: string[] = [];
  while (out.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id)) out.push(w.id); }
  return out;
};
const run = (seed: number, teams: number[], rules: Record<string, unknown> = {}) => {
  const ids = pick(seed, teams.length);
  return runHeadless({ seed, you: ids[0]!, them: ids[1]!, extras: ids.slice(2).map((id, i) => ({ id, team: teams[i + 2]! })), model: { kind: 'fixed', rate: 0.5 }, rules });
};
/** The engine's context, for poking at the AI directly. */
const ctxOf = (e: MatchEngine) => (e as unknown as { ctx: Ctx }).ctx;

describe('zones', () => {
  it('the ring, aprons, floor, ramp and backstage are joined up sensibly', () => {
    expect(zoneDistance('ring', 'ring')).toBe(0);
    expect(zoneDistance('ring', 'corner_ne')).toBe(1);
    expect(zoneDistance('ring', 'apron_n')).toBe(1);
    expect(zoneDistance('ring', 'floor_n')).toBe(2);
    expect(zoneDistance('floor_n', 'floor_e')).toBe(1);
    expect(zoneDistance('floor_n', 'floor_s')).toBe(2);
    expect(zoneDistance('floor_s', 'ramp')).toBe(1);
    expect(zoneDistance('ring', 'backstage')).toBe(4);
  });

  it('where someone is comes from their area and which way they are', () => {
    const S = new MatchEngine({ you: pick(1, 3)[0]!, them: pick(1, 3)[1]!, extras: [{ id: pick(1, 3)[2]!, team: 2 }], seed: 1 }).state;
    expect(zoneOf(S.you)).toBe('ring');
    S.them.state = { ...S.them.state, area: 'OUTSIDE' };
    S.them.spot = 1;
    expect(zoneOf(S.them)).toBe('floor_e');
    expect(distance(S, 'you', 'them')).toBe(2);
  });
});

describe('triple threats and four-ways', () => {
  it('one fall: the first pin or submission ends it, and the result says who was beaten', () => {
    for (let seed = 10; seed < 22; seed++) {
      const r = run(seed, [0, 1, 2]);
      expect(r.stuck).toBeNull();
      const R = r.result!;
      expect(['PINFALL', 'SUBMISSION', 'I_QUIT']).toContain(R.finish);
      expect(R.winner).not.toBeNull();
      expect(R.loser).not.toBe(R.winner);
      expect(R.winners).toEqual([R.winner]);
      expect(R.losers).toHaveLength(2);
      expect(R.elims).toEqual([]);
    }
  });

  it('one fall has no count-outs or DQs unless the booker asks for them', () => {
    const ids = pick(3, 3);
    const S = new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 2 }], seed: 3 }).state;
    expect(S.rules.countOuts).toBe(false);
    expect(S.rules.dq).toBe(false);
    const T = new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 2 }], seed: 3, rules: { dq: true } }).state;
    expect(T.rules.dq).toBe(true);
  });

  it('elimination: everyone but the last team goes out, one at a time, and nobody who is out acts again', () => {
    for (let seed = 30; seed < 40; seed++) {
      let outActed = false;
      const ids = pick(seed, 4);
      const r = runHeadless({
        seed, you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 2 }, { id: ids[3]!, team: 3 }], model: { kind: 'fixed', rate: 0.5 }, rules: { elimination: true },
        onStep: (e) => { const c = e.state.control; if (c && c !== 'neutral' && e.state.sides[c]?.out === 'eliminated') outActed = true; },
      });
      expect(r.stuck).toBeNull();
      const S = r.engine.state;
      expect(S.elims).toHaveLength(3);
      expect(teamsAlive(S)).toHaveLength(1);
      expect(r.result!.winners).toEqual(alive(S));
      expect(r.result!.elims).toHaveLength(3);
      expect(outActed).toBe(false);
    }
  });

  it('pins get broken up, and opportunists steal some', () => {
    let saves = 0, steals = 0;
    for (let seed = 50; seed < 75; seed++) {
      const S = run(seed, [0, 1, 2, 3]).engine.state;
      saves += S.crowd.saves ?? 0;
      steals += S.crowd.steals ?? 0;
    }
    expect(saves).toBeGreaterThan(20);
    expect(steals).toBeGreaterThan(2);
  });

  it('handicap and tornado: the whole winning team wins', () => {
    for (const teams of [[0, 1, 1], [0, 1, 0, 1]]) {
      for (let seed = 80; seed < 86; seed++) {
        const r = run(seed, teams);
        expect(r.stuck).toBeNull();
        const S = r.engine.state, w = r.result!.winner!;
        expect(r.result!.winners).toEqual(S.order.filter((k) => S.sides[k]!.team === S.sides[w]!.team));
      }
    }
  });

  it('two AI wrestlers fighting while the player watches roll their own dice and play out their own holds', () => {
    // The player is eliminated first in some of these: the rest of the match has to carry on without them.
    for (let seed = 90; seed < 96; seed++) {
      const r = run(seed, [0, 1, 2, 3], { elimination: true });
      expect(r.stuck).toBeNull();
      expect(r.ended).toBe(true);
    }
  });
});

describe('the player in a crowd', () => {
  it('can see who they could go after and switch freely', () => {
    const ids = pick(5, 4);
    const e = new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 2 }, { id: ids[3]!, team: 3 }], seed: 5 });
    expect(e.targets().map((t) => t.k).sort()).toEqual(['s2', 's3', 'them']);
    expect(e.setTarget('s3')).toBe(true);
    expect(e.state.you.target).toBe('s3');
    expect(e.setTarget('you')).toBe(false);
  });

  it('is asked whether to break up someone else’s pin, and it counts if they get there', () => {
    const ids = pick(6, 3);
    let asked = 0, saved = 0;
    for (let seed = 1; seed < 200 && asked < 6; seed++) {
      const e = new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 2 }], seed });
      const S = e.state as MatchState;
      // them has s2 down and covers; you're standing in the ring.
      S.them.target = 's2';
      S.sides.s2!.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
      S.them.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
      S.pending = { kind: 'idle' };
      const ok = (e as unknown as { run: (c: unknown) => void }).run({ to: 'startPin', k: 'them', embedded: true });
      void ok;
      const asking = e.pending;
      if (asking.kind !== 'save') continue;
      asked++;
      expect(asking.spec.mustSave).toBe(true);
      e.resolveSavePrompt('save');
      const p = S.pending as { kind: string; save?: { by: string } };
      if (p.kind === 'refCount' && p.save?.by === 'you') saved++;
    }
    expect(asked).toBeGreaterThan(0);
    expect(saved).toBeGreaterThan(0);
  });
});

describe('who the AI goes after', () => {
  const field = (seed: number) => {
    const ids = pick(seed, 4);
    const e = new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 2 }, { id: ids[3]!, team: 3 }], seed, rules: { bonds: { s2: { them: -90, s3: 80 } } } });
    return e;
  };

  it('enemies first, friends last', () => {
    const tally: Record<string, number> = {};
    for (let seed = 1; seed <= 60; seed++) {
      const e = field(seed);
      const t = aiPickTarget(ctxOf(e), 's2');
      tally[t] = (tally[t] ?? 0) + 1;
    }
    expect(tally.them ?? 0).toBeGreaterThan(tally.s3 ?? 0);
    expect(tally.them ?? 0).toBeGreaterThan(tally.you ?? 0);
  });

  it('heels leave each other alone while there is a face to beat up', () => {
    let heelOnHeel = 0, n = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const e = field(seed);
      const S = e.state;
      S.you.w = { ...S.you.w, disposition: 'FACE' };
      S.them.w = { ...S.them.w, disposition: 'HEEL' };
      S.sides.s2!.w = { ...S.sides.s2!.w, disposition: 'HEEL' };
      S.sides.s3!.w = { ...S.sides.s3!.w, disposition: 'HEEL' };
      S.alliance = 'on';
      S.rules = { ...S.rules, bonds: {} };
      for (const k of ['them', 's2', 's3']) {
        n++;
        if (aiPickTarget(ctxOf(e), k) !== 'you') heelOnHeel++;
      }
    }
    expect(heelOnHeel / n).toBeLessThan(0.25);
  });

  it('goes after whoever is down and ready to be pinned', () => {
    let onDown = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const e = field(seed);
      const S = e.state;
      S.rules = { ...S.rules, bonds: {} };
      const D = S.sides.s3!;
      D.state = { position: 'GROUNDED', orientation: 'FACE_UP', area: 'IN_RING', motion: 'STATIONARY' };
      D.hp = { HEAD: 25, BODY: 25, LEFT_ARM: 60, RIGHT_ARM: 60, LEFT_LEG: 60, RIGHT_LEG: 60 };
      D.stamina = D.maxStamina * 0.2;
      D.fatigue = 70;
      if (aiPickTarget(ctxOf(e), 's2') === 's3') onDown++;
    }
    expect(onDown).toBeGreaterThan(24);
  });
});

it('singles never go near any of it', () => {
  const ids = pick(7, 2);
  const S = new MatchEngine({ you: ids[0]!, them: ids[1]!, seed: 7 }).state;
  expect(isMulti(S)).toBe(false);
  expect(opponents(S, 'you')).toEqual(['them']);
  expect(S.alliance).toBe('none');
});
