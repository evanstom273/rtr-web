import { describe, expect, it } from 'vitest';
import { PROMOTIONS, TITLES, WRESTLERS, findWrestler, getPromotion, getWrestler, isChampion, titlesHeldBy } from '../data/rtr';
import { activeWorld, commitWorld, freshWorld, resetWorld, setWorld } from './world';

describe('the world (shared database)', () => {
  it('ships with every title held, nobody holding two, and Jamie Mercer holding none', () => {
    const w = freshWorld(1);
    const holders = w.db.titles.map((t) => t.holder);
    expect(holders.every(Boolean)).toBe(true);
    expect(new Set(holders).size).toBe(holders.length);
    const jamie = w.db.wrestlers.find((x) => x.name === 'Jamie Mercer')!;
    expect(holders).not.toContain(jamie.id);
  });

  it('every champion belongs to the promotion and division of their title', () => {
    const w = freshWorld(1);
    for (const t of w.db.titles) {
      const champ = w.db.wrestlers.find((x) => x.id === t.holder)!;
      const promo = w.db.promotions.find((p) => p.id === t.promotionId)!;
      expect(champ.promotion, t.name).toBe(promo.initials);
      expect(champ.gender, t.name).toBe(t.gender);
    }
  });

  it('marks The Indie Scene as indie, and only it', () => {
    expect(PROMOTIONS.filter((p) => p.indie).map((p) => p.initials)).toEqual(['TIS']);
  });

  it('the live arrays and lookups follow the active world', () => {
    const w = setWorld(freshWorld(2));
    const champ = TITLES.find((t) => t.id === 'VWF_CHAMPIONSHIP')!;
    const holder = getWrestler(champ.holder!);
    expect(isChampion(holder)).toBe(true);
    // A title changes hands in place: lookups see it once the change is committed.
    const jamie = WRESTLERS.find((x) => x.name === 'Jamie Mercer')!;
    champ.holder = jamie.id;
    void commitWorld();
    expect(titlesHeldBy(jamie).map((t) => t.id)).toEqual(['VWF_CHAMPIONSHIP']);
    expect(isChampion(holder)).toBe(false);
    expect(w.db.titles).toBe(TITLES);
  });

  it('a new wrestler added to the world is found by every lookup', () => {
    setWorld(freshWorld(3));
    const rookie = { ...structuredClone(WRESTLERS[0]!), id: 'rookie_test', name: 'Test Rookie', promotion: 'TIS' };
    activeWorld().db.wrestlers.push(rookie);
    void commitWorld();
    expect(findWrestler('rookie_test')?.name).toBe('Test Rookie');
    expect(getPromotion('TIS')?.indie).toBe(true);
  });

  it('resetting puts the shipped database back', async () => {
    setWorld(freshWorld(4));
    TITLES.find((t) => t.id === 'VWF_CHAMPIONSHIP')!.holder = null;
    WRESTLERS.push({ ...structuredClone(WRESTLERS[0]!), id: 'gone_after_reset' });
    await resetWorld(5);
    expect(TITLES.find((t) => t.id === 'VWF_CHAMPIONSHIP')!.holder).not.toBeNull();
    expect(findWrestler('gone_after_reset')).toBeUndefined();
    expect(WRESTLERS).toHaveLength(400);
  });
});
