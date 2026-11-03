import { describe, expect, it } from 'vitest';
import { findWrestler } from '../data/rtr';
import type { MatchEngine } from '../engine';
import { runHeadless } from '../engine/sim/runHeadless';
import { fmtHeight, grade, moment, report, starText, surname, tape } from './model';

const sosa = findWrestler('abril_sosa')!;
const okoro = findWrestler('adebayo_the_great_okoro')!;

describe('shared screen model', () => {
  it('shortens names to a surname, dropping nicknames', () => {
    expect(surname(okoro)).toBe('Okoro');
    expect(surname(sosa)).toBe('Sosa');
  });

  it('builds the tale of the tape with the right edges and story', () => {
    const t = tape(sosa, okoro);
    const skill = t.stats.find((s) => s.key === 'skill')!;
    expect(skill).toMatchObject({ a: 87, b: 70, edge: 'a' });
    expect(t.stats.find((s) => s.key === 'striking')!.edge).toBe('b');
    expect(t.vitals[1]).toMatchObject({ a: '145 lb', b: '235 lb' });
    expect(t.story[0]).toBe('Okoro outweighs Sosa by 90 lb.');
    expect(t.story[1]).toBe('Sosa is the cleaner wrestler: 17 more skill.');
    expect(t.story).toHaveLength(3);
  });

  it('formats heights, grades and printed stars', () => {
    expect(fmtHeight("5'8")).toBe('5′ 8″');
    expect(fmtHeight("6'")).toBe('6′ 0″');
    expect([0.9, 0.65, 0.45, 0.25, 0.1].map(grade)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(starText(3.5)).toBe('★★★½');
    expect(starText(4.75)).toBe('★★★★¾');
  });

  it('always has a headline moment mid-match, and a report with a headline at the end', () => {
    let engine: MatchEngine | null = null;
    const bigs = new Set<string>();
    const r = runHeadless({
      seed: 11, you: sosa.id, them: okoro.id, model: { kind: 'fixed', rate: 0.6 },
      onStep: (e) => {
        engine = e;
        const m = moment(e.state);
        expect(m.big.length).toBeGreaterThan(0);
        bigs.add(m.big);
      },
    });
    expect(r.ended).toBe(true);
    expect(bigs.size).toBeGreaterThan(5);
    const S = (engine as MatchEngine | null)!.state;
    const rep = report(S, S.rating!)!;
    expect(rep.headline.length).toBeGreaterThan(0);
    expect(rep.parts.every((p) => /^[A-E]$/.test(p.grade))).toBe(true);
    if (rep.winner) expect(rep.headline).toMatch(new RegExp(surname(rep.winner) + '|' + surname(rep.loser!)));
  });
});
