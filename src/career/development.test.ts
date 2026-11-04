import { describe, expect, it } from 'vitest';
import { findWrestler, WRESTLERS } from '../data/rtr';
import { seededRng } from '../engine/rng';
import { developMonth, ensurePotential, rollRoom } from './index';
import { attributeTotal } from './economy';
import { begin } from './testkit';
import { finishDay } from './career';
import { quick } from './testkit';

describe('development and decline (Lyra’s calls)', () => {
  it('a rookie’s room is 20–120, mostly 40–70', () => {
    const rnd = seededRng(5);
    const rooms = Array.from({ length: 4000 }, () => rollRoom(rnd)).sort((a, b) => a - b);
    expect(rooms[0]).toBeGreaterThanOrEqual(20);
    expect(rooms.at(-1)).toBeLessThanOrEqual(120);
    const mid = rooms.filter((r) => r >= 40 && r <= 70).length / rooms.length;
    expect(mid).toBeGreaterThan(0.5);
  });

  it('the young grow towards their potential (faster working and mentored); veterans decline, speed and stamina first', () => {
    begin('jamie_mercer');
    const young = structuredClone(WRESTLERS.find((w) => w.age <= 22)!);
    delete young.potential; delete young.peak; young.dev = 0;
    ensurePotential(young);
    const start = attributeTotal(young);
    const idle = structuredClone(young), busy = structuredClone(young);
    const rnd = seededRng(1);
    for (let m = 0; m < 24; m++) { developMonth(idle, false, false, rnd); developMonth(busy, true, true, rnd); }
    expect(attributeTotal(idle)).toBeGreaterThan(start);
    expect(attributeTotal(busy)).toBeGreaterThan(attributeTotal(idle));
    expect(attributeTotal(busy)).toBeLessThanOrEqual(young.potential!);
    const vet = structuredClone(WRESTLERS.find((w) => w.age >= 40)!);
    const was = { ...vet.stats }, total = attributeTotal(vet);
    for (let m = 0; m < 24; m++) developMonth(vet, true, false, rnd);
    const lost = total - attributeTotal(vet);
    expect(lost).toBeGreaterThanOrEqual(9);
    expect(lost).toBeLessThanOrEqual(17);
    expect((was.speed - vet.stats.speed) + (was.stamina - vet.stats.stamina)).toBeGreaterThan(was.charisma - vet.stats.charisma);
  });

  it('runs on the first of the month for everyone but you, and potentials are the same every time', async () => {
    const c = begin('jamie_mercer', 4);
    const me = { ...findWrestler(c.player)!.stats };
    const someone = WRESTLERS.find((w) => w.id !== c.player && w.age < 23)!;
    const before = attributeTotal(someone);
    while (!c.today.endsWith('-02')) await finishDay(c, quick);
    expect(findWrestler(c.player)!.stats).toEqual(me);
    expect(someone.potential).toBeGreaterThan(0);
    expect(attributeTotal(someone)).toBeGreaterThanOrEqual(before);
    const pot = someone.potential;
    begin('jamie_mercer', 4);
    const again = WRESTLERS.find((w) => w.id === someone.id)!;
    ensurePotential(again);
    expect(again.potential).toBe(pot);
  }, 120000);
});
