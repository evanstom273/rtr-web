import { describe, expect, it } from 'vitest';
import { seededRng } from '../engine';
import { INDIE_COUNTRIES, NAME_SPACE, indieEventName, isBlockedEventName } from './indieEvents';

describe('indie event names', () => {
  it('cover every country on the roster', () => {
    expect(INDIE_COUNTRIES.length).toBe(22);
    expect(INDIE_COUNTRIES).not.toContain('Other');
  });

  it('can make thousands of names, and a year of shows never repeats one', () => {
    expect(NAME_SPACE).toBeGreaterThan(2500);
    const rnd = seededRng(3), used = new Set<string>();
    const names = Array.from({ length: 450 }, (_, i) => indieEventName(rnd, INDIE_COUNTRIES[i % INDIE_COUNTRIES.length]!, used));
    expect(new Set(names).size).toBe(names.length);
  });

  it("never use real promotions' event names", () => {
    expect(isBlockedEventName('Royal Rumble')).toBe(true);
    expect(isBlockedEventName('Electric Collision')).toBe(false);
    expect(isBlockedEventName('Collision Course')).toBe(false);
    expect(isBlockedEventName('Collision')).toBe(true);
    expect(isBlockedEventName('Saturday Night Main Event')).toBe(true);
    expect(isBlockedEventName('Midnight Mayhem')).toBe(false);
    const rnd = seededRng(9);
    for (let i = 0; i < 3000; i++) expect(isBlockedEventName(indieEventName(rnd, INDIE_COUNTRIES[i % 22]!))).toBe(false);
  });
});
