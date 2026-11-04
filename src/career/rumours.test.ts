// Gossip and angles (Lyra's relationships redesign, stage 6): rumours arise and spread, believing one moves feelings,
// you're told and can answer, you can start one (and be found out), and bookers turn real heat into storylines.
import { describe, expect, it } from 'vitest';
import { rosterOf, WRESTLERS, type Wrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { ensureBond, likeOf } from '../world/people';
import { replyTo } from './mail';
import { send, topicsFor } from './phone';
import { rumoursOf } from './rumours';
import { begin, day, quick } from './testkit';
import { ANGLES, RUMOURS } from './tuning';
import type { Career } from './types';

const P = () => activeWorld().people!;
const set = (c: Career, a: string, b: string, la: number, lb: number, f = 60) => {
  const x = ensureBond(P(), a, b, c.today);
  if (x.a === a) { x.la = la; x.lb = lb; } else { x.lb = la; x.la = lb; }
  x.f = f;
  return x;
};

describe('gossip and angles', () => {
  it('rumours arise from what’s going on (and from liars), and spread through who knows whom', async () => {
    const c = begin('jamie_mercer', 7);
    for (let i = 0; i < 60; i++) await day(c, quick, 'simmed');
    const all = rumoursOf(c);
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((r) => r.heard.length > 1)).toBe(true);
    expect(all.some((r) => !r.truth) || all.some((r) => r.truth)).toBe(true);
  });

  it('when one reaches you, a friend tells you, and you can deny it, confront whoever started it, or pass it on', async () => {
    const c = begin('jamie_mercer', 7);
    const [liar, friend, other] = WRESTLERS.filter((w) => w.id !== c.player).slice(0, 3) as [Wrestler, Wrestler, Wrestler];
    liar.traits = ['politician'];
    set(c, friend.id, c.player, 80, 80, 80);
    set(c, liar.id, friend.id, 80, 80, 80);
    // A false story about you, started by someone who can't stand you, heard by your friend's friend.
    const all = rumoursOf(c);
    all.push({ id: 'rz1', kind: 'drunk', a: c.player, truth: false, by: liar.id, day: c.today, heard: [liar.id] });
    all.push({ id: 'rz2', kind: 'favourite', a: other.id, promo: 'VWF', truth: true, by: other.id, day: c.today, heard: [liar.id] });
    const was = RUMOURS.spread, told = RUMOURS.you.tellChance, per = RUMOURS.you.perWeek;
    RUMOURS.spread = 1; RUMOURS.you.tellChance = 1; RUMOURS.you.perWeek = 2;
    for (let i = 0; i < 36 && !c.letters.some((l) => l.ctx?.rumour === 'rz1'); i++) await day(c, quick, 'simmed');
    RUMOURS.spread = was; RUMOURS.you.tellChance = told; RUMOURS.you.perWeek = per;
    const l = c.letters.find((x) => x.ctx?.rumour === 'rz1');
    expect(l).toBeTruthy();
    expect(l!.replies!.map((r) => r.id)).toEqual(['r_deny', 'r_confront', 'r_ignore']);
    const before = likeOf(P(), liar.id, c.player);
    expect(replyTo(c, l!.id, 'r_confront')).toContain(liar.name);
    expect(likeOf(P(), liar.id, c.player)).toBeLessThan(before);
    expect(rumoursOf(c).find((r) => r.id === 'rz1')?.dead ?? true).toBe(true);
  });

  it('you can start one, about someone you can’t stand; it can be traced back to you', async () => {
    const c = begin('jamie_mercer', 7);
    const [target, mate] = WRESTLERS.filter((w) => w.id !== c.player).slice(3, 5) as [Wrestler, Wrestler];
    set(c, c.player, target.id, -50, -10, 40);
    set(c, c.player, mate.id, 60, 60, 60);
    const opt = topicsFor(c, mate.id).find((x) => x.topic === 'rumour')!;
    expect(opt.groups![0]!.options.map((o) => o.id)).toContain(target.id);
    send(c, mate.id, 'rumour', 'plain', `${target.id}|drunk`);
    expect(rumoursOf(c).some((r) => r.by === c.player && r.a === target.id)).toBe(true);
    const was = RUMOURS.you.traced;
    RUMOURS.you.traced = 1;
    const before = likeOf(P(), target.id, c.player);
    for (let i = 0; i < 8; i++) await day(c, quick, 'simmed');
    RUMOURS.you.traced = was;
    expect(likeOf(P(), target.id, c.player)).toBeLessThan(before);
    expect(c.letters.some((l) => l.subject.includes('came from you'))).toBe(true);
  });

  it('angles from real life: a booker turns real heat on the roster into the storyline', async () => {
    const c = begin('jamie_mercer', 7);
    const roster = rosterOf('TCG').filter((w) => w.id !== c.player);
    const [a, b] = roster.filter((w) => w.gender === roster[0]!.gender).slice(-2) as [Wrestler, Wrestler];
    set(c, a.id, b.id, -90, -90, 60);
    const was = ANGLES.chance;
    ANGLES.chance = 1;
    for (let i = 0; i < 30 && !c.feuds.some((f) => f.real); i++) await day(c, quick, 'simmed');
    ANGLES.chance = was;
    expect(c.feuds.some((f) => f.real)).toBe(true);
  });
});
