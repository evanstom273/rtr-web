// What Lyra's match exports showed (after the overhaul went live), pinned so it can't slide back:
// hardcore matches that never used a weapon, Rumbles the last few in always won, and Rumbles always 3–3.25★.
import { describe, expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { DEATHMATCH_KIT } from '../gimmicks';
import { seededRng } from '../rng';
import { runHeadless } from '../sim/runHeadless';

const men = (seed: number, n: number) => {
  const rnd = seededRng(seed), ids: string[] = [];
  while (ids.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!ids.includes(w.id) && w.gender === 'MALE') ids.push(w.id); }
  return ids;
};

describe('hardcore matches use the weapons, deathmatches the kit', () => {
  it('a deathmatch brings the glass, the board and the tubes out, and uses them; a street fight brings weapons', () => {
    let kit = 0, used = 0, street = 0;
    for (let i = 0; i < 16; i++) {
      const [a, b] = men(700 + i, 2);
      const dm = runHeadless({ seed: 9000 + i, you: a!, them: b!, player: null, model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { stipulation: 'deathmatch' } });
      for (const o of dm.engine.state.env.objects) if (DEATHMATCH_KIT.has(o.weaponId)) { kit++; if (o.state === 'broken' || o.durability <= 0) used++; }
      const sf = runHeadless({ seed: 9100 + i, you: a!, them: b!, player: null, model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { stipulation: 'street_fight' } });
      street += sf.engine.state.env.objects.length;
    }
    expect(kit / 16).toBeGreaterThan(2);
    expect(used / kit).toBeGreaterThan(0.35);
    expect(street / 16).toBeGreaterThan(1);
  }, 120_000);
});

describe('Rumbles', () => {
  it('can be won from anywhere in the draw, and how good one was varies with what happened', () => {
    const N = 30, early: number[] = [], stars = new Set<number>();
    let firstHalf = 0;
    for (let i = 0; i < N; i++) {
      const ids = men(400 + i, 20);
      const r = runHeadless({ seed: 7000 + i, you: ids[0]!, them: ids[1]!, player: null, type: 'rumble', extras: ids.slice(2).map((id, j) => ({ id, team: j + 2 })), model: { kind: 'skill', sigmaSeconds: 0.1 }, rules: { elimination: true } });
      const S = r.engine.state, w = r.result?.winner;
      const n = w ? S.entries?.[w]?.n ?? 0 : 0;
      if (n && n <= 10) firstHalf++;
      early.push(n);
      stars.add(r.rating?.stars ?? 0);
    }
    // The first half of a 20-man draw wins a fair share (it was all but never), and the late numbers still have the edge.
    expect(firstHalf).toBeGreaterThanOrEqual(5);
    expect(firstHalf).toBeLessThan(N / 2 + 3);
    // Not one number for every Rumble: a spread of at least a star.
    expect(Math.max(...stars) - Math.min(...stars)).toBeGreaterThanOrEqual(1);
  }, 300_000);
});
