import { describe, expect, it } from 'vitest';
import { PROMOTIONS, WRESTLERS, shippedDatabase, shippedStaff } from './index';
import { BLOCKED, NAMES, wrestlerName } from './names';
import { CONFLICTS, TRAIT_IDS, canAdd, traitDef, validTraits, type TraitId } from './traits';
import { TRAIT_PREVALENCE_CAP } from '../../career/tuning';
import { QUESTIONS, makeRookie, storyTrait } from '../../career/create';
import { seededRng } from '../../engine/rng';
import { freshWorld, setWorld, type World } from '../../world/world';

describe('traits', () => {
  it('every shipped wrestler has one to three, none clashing, and no trait is everywhere', () => {
    const ws = shippedDatabase().wrestlers;
    for (const w of ws) {
      expect(w.traits?.length, w.id).toBeGreaterThanOrEqual(1);
      expect(validTraits(w.traits!), `${w.id} ${w.traits}`).toBe(true);
    }
    for (const t of TRAIT_IDS) expect(ws.filter((w) => w.traits!.includes(t)).length / ws.length, t).toBeLessThanOrEqual(TRAIT_PREVALENCE_CAP);
    // A real spread, not everyone on two.
    expect(ws.filter((w) => w.traits!.length === 1).length).toBeGreaterThan(80);
    expect(ws.filter((w) => w.traits!.length === 3).length).toBeGreaterThan(40);
  });

  it('three at most, and only the genuinely incompatible pairs refuse each other', () => {
    expect(canAdd(['risk_taker', 'loyal', 'mentor'], 'showboat')).toBe('full');
    expect(canAdd(['risk_taker', 'loyal', 'mentor'], 'showboat', 'loyal')).toBe('ok');
    expect(canAdd(['risk_taker'], 'risk_taker')).toBe('have');
    expect(canAdd(['loyal'], 'mercenary')).toBe('conflict');
    expect(canAdd(['loyal'], 'mercenary', 'loyal')).toBe('ok');
    expect(canAdd(['professional'], 'rebellious')).toBe('conflict');
    expect(canAdd(['egotistical'], 'team_player')).toBe('conflict');
    // Lyra's calls: contradictions are allowed when they're different behaviours.
    expect(canAdd(['aggressive'], 'defensive')).toBe('ok');
    expect(canAdd(['politician'], 'hot_headed')).toBe('ok');
    expect(canAdd(['risk_taker'], 'methodical')).toBe('ok');
    expect(canAdd(['big_match'], 'inconsistent')).toBe('ok');
    expect(CONFLICTS).toHaveLength(3);
    expect(TRAIT_IDS.filter((t) => traitDef(t).cat === 'ring')).toHaveLength(12);
    expect(TRAIT_IDS.filter((t) => traitDef(t).cat === 'backstage')).toHaveLength(12);
  });

  it('a created wrestler’s starting trait comes from their life story', () => {
    // Circus childhood, performing arts, lucha academy, saw a show, podcast: a show-off.
    expect(storyTrait([2, 3, 1, 4, 4])).toBe('showboat');
    // Farm, amateur wrestling, dojo, family business, ring crew.
    expect(['professional', 'reliable', 'submission_specialist', 'resilient']).toContain(storyTrait([0, 0, 0, 1, 2]));
    // Every answer leads somewhere real.
    for (let q = 0; q < QUESTIONS.length; q++) for (let a = 0; a < QUESTIONS[q]!.a.length; a++) {
      const ans = QUESTIONS.map((_, i) => (i === q ? a : null));
      expect(TRAIT_IDS).toContain(storyTrait(ans));
    }
  });

  it('older saves get everyone’s traits back, the same every time', () => {
    const w: World = freshWorld(5);
    w.rev = 1;
    for (const x of w.db.wrestlers) delete x.traits;
    const rookie = makeRookie(seededRng(1), w.db.wrestlers, 'rookie_20270101');
    delete rookie.traits;
    w.db.wrestlers.push(rookie, { ...structuredClone(w.db.wrestlers[0]!), id: 'custom_abc', name: 'Made Up' });
    setWorld(w);
    expect(w.rev).toBe(2);
    const ship = new Map(shippedDatabase().wrestlers.map((x) => [x.id, x.traits]));
    for (const x of WRESTLERS) {
      expect(validTraits(x.traits ?? [])).toBe(true);
      if (ship.has(x.id)) expect(x.traits).toEqual(ship.get(x.id));
    }
    expect(WRESTLERS.find((x) => x.id === 'custom_abc')!.traits).toHaveLength(1);
    const first = WRESTLERS.find((x) => x.id === 'rookie_20270101')!.traits;
    // Same world, same rolls.
    const again: World = freshWorld(5);
    again.rev = 1;
    again.db.wrestlers.push({ ...rookie, traits: undefined });
    setWorld(again);
    expect(WRESTLERS.find((x) => x.id === 'rookie_20270101')!.traits).toEqual(first);
  });
});

describe('names', () => {
  it('pools cover every country in the data, and never repeat or hit a real wrestler', () => {
    for (const c of new Set(shippedDatabase().wrestlers.map((w) => w.country))) expect(NAMES[c], c).toBeDefined();
    const rnd = seededRng(9);
    const taken = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const n = wrestlerName(rnd, ['UK', 'Mexico', 'Japan', 'China'][i % 4]!, i % 3 ? 'MALE' : 'FEMALE', taken);
      expect(taken.has(n)).toBe(false);
      expect(BLOCKED.has(n.replace(/"[^"]*"\s*/g, ''))).toBe(false);
      taken.add(n);
    }
  });

  it('rookies get a name from the pools, a gimmick and traits', () => {
    const ws = shippedDatabase().wrestlers;
    const r = makeRookie(seededRng(4), ws, 'rookie_x');
    expect(ws.some((w) => w.name === r.name)).toBe(false);
    expect(r.gimmick.startsWith('The ')).toBe(true);
    expect(validTraits(r.traits!)).toBe(true);
    expect(r.traits!.length).toBeGreaterThan(0);
  });
});

describe('bookers', () => {
  it('each promotion ships a named booker with backstage traits and a history', () => {
    const staff = shippedStaff();
    const promos = PROMOTIONS.filter((p) => !p.indie).map((p) => p.initials);
    expect(staff).toHaveLength(promos.length);
    for (const p of promos) {
      const b = staff.find((s) => s.job?.kind === 'booker' && s.job.promo === p);
      expect(b, p).toBeDefined();
      expect(b!.traits.every((t) => traitDef(t as TraitId).cat === 'backstage')).toBe(true);
      expect(validTraits(b!.traits)).toBe(true);
      expect(b!.spells.at(-1)!.to).toBeNull();
    }
    expect(new Set(staff.map((s) => s.id)).size).toBe(staff.length);
  });
});
