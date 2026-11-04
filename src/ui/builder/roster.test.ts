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
