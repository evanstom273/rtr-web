import { describe, expect, it } from 'vitest';
import { fanScore, TITLES, WRESTLERS } from '../../data/rtr';
import { NO_FILTERS, filterRoster } from './roster';

describe('match builder roster', () => {
  it('lists everyone with no filters, sorted ignoring nickname quotes', () => {
    const all = filterRoster(NO_FILTERS);
    expect(all).toHaveLength(WRESTLERS.length);
    expect(all.findIndex((w) => w.id === 'macho_martinez')).toBeGreaterThan(all.findIndex((w) => w.name.startsWith('Abril')));
  });

  it('search ignores accents and matches country, class and face/heel', () => {
    expect(filterRoster({ ...NO_FILTERS, q: 'martinez' }).some((w) => w.id === 'macho_martinez')).toBe(true);
    const heelsJapan = filterRoster({ ...NO_FILTERS, q: 'japan heel' });
    expect(heelsJapan.length).toBeGreaterThan(0);
    expect(heelsJapan.every((w) => w.country === 'Japan' && w.disposition === 'HEEL')).toBe(true);
  });

  it('filters combine and sorts are descending for numbers', () => {
    const list = filterRoster({ ...NO_FILTERS, gender: 'FEMALE', cls: 'TECHNICIAN', sort: 'strength' });
    expect(list.every((w) => w.gender === 'FEMALE' && w.classes.includes('TECHNICIAN'))).toBe(true);
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.stats.strength).toBeGreaterThanOrEqual(list[i]!.stats.strength);
    const asia = filterRoster({ ...NO_FILTERS, sort: 'pop-asia' });
    expect(fanScore(asia[0]!, 'asia')).toBe(Math.max(...WRESTLERS.map((w) => fanScore(w, 'asia'))));
  });

  it('title status: champions, everyone else not', () => {
    const held = TITLES.filter((t) => t.holder).length;
    expect(filterRoster({ ...NO_FILTERS, title: 'champ' })).toHaveLength(held);
    expect(filterRoster({ ...NO_FILTERS, title: 'non' })).toHaveLength(WRESTLERS.length - held);
    expect(filterRoster({ ...NO_FILTERS, title: 'VWF_CHAMPIONSHIP' }).map((w) => w.name)).toEqual(['Ray Hollis']);
  });
});

describe('tag champions in the roster', () => {
  it('filtering or searching by a tag belt finds both champions, and both are marked (c)', async () => {
    const { FEATURES } = await import('../../career/tuning');
    const { freshWorld, setWorld } = await import('../../world/world');
    const { displayName } = await import('../format');
    const was = FEATURES.matches;
    (FEATURES as { matches: boolean }).matches = true;
    try {
      setWorld(freshWorld(5));
      const t = TITLES.find((x) => x.id === 'VWF_TAG_TEAM_CHAMPIONSHIP')!;
      expect(t.holders).toHaveLength(2);
      const found = filterRoster({ ...NO_FILTERS, title: t.id }).map((w) => w.id).sort();
      expect(found).toEqual([...t.holders!].sort());
      const searched = filterRoster({ ...NO_FILTERS, q: t.name }).map((w) => w.id);
      for (const id of t.holders!) expect(searched).toContain(id);
      for (const id of t.holders!) expect(displayName(WRESTLERS.find((w) => w.id === id)!)).toMatch(/^\(c\) /);
    } finally {
      (FEATURES as { matches: boolean }).matches = was;
    }
  });
});
