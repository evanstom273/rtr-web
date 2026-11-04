import { describe, expect, it } from 'vitest';
import { findWrestler, PROMOTIONS, TITLES } from '../data/rtr';
import { setWorld, freshWorld } from '../world/world';
import { finishDay, leaveContract, signOffer, startCareer } from './index';
import { C, NO_CLAUSES } from './clauses';
const excl = (t: number) => { const x = NO_CLAUSES(); x[C.exclusivity] = t; return x; };
import { quick } from './testkit';

describe('your own deal at the start (Lyra’s call: no negotiating)', () => {
  it('any promotion, fee, length and clauses; they move there', () => {
    setWorld(freshWorld(3));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 3, deal: { promo: 'NWGP', fee: 99999, months: 60, clauses: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] } });
    const k = c.people.jamie_mercer!.contract!;
    expect(k).toMatchObject({ promo: 'NWGP', fee: 99999, start: '2026-11-03', end: '2031-11-03', clauses: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3] });
    expect(findWrestler('jamie_mercer')!.promotion).toBe('NWGP');
  });
  it('moving strips the belt (Lyra’s call); staying keeps it', () => {
    setWorld(freshWorld(3));
    const champ = TITLES.find((t) => t.holder && findWrestler(t.holder)?.promotion === 'VWF' && PROMOTIONS.find((p) => p.initials === 'VWF')!.titles.includes(t.id))!;
    const who = champ.holder!;
    const c = startCareer({ player: who, today: '2026-11-03', seed: 3, deal: { promo: 'TCG', fee: 5000, months: 12, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
    expect(champ.holder).toBeNull();
    expect(c.letters.some((l) => /stripped/.test(l.subject))).toBe(true);
    setWorld(freshWorld(3));
    const again = TITLES.find((t) => t.id === champ.id)!;
    startCareer({ player: again.holder!, today: '2026-11-03', seed: 3, deal: { promo: 'VWF', fee: 5000, months: 12, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
    expect(again.holder).toBe(who);
  });
  it('null: a free agent on the indies', () => {
    setWorld(freshWorld(3));
    const c = startCareer({ player: 'jamie_mercer', today: '2026-11-03', seed: 3, deal: null });
    expect(c.people.jamie_mercer!.contract).toBeNull();
    expect(findWrestler('jamie_mercer')!.promotion).toBe('TIS');
  });
});

describe('leaving a promotion strips its belt (Lyra’s call)', () => {
  const champOf = (promo: string) => {
    setWorld(freshWorld(5));
    const t = TITLES.find((x) => x.holder && PROMOTIONS.find((p) => p.initials === promo)!.titles.includes(x.id) && findWrestler(x.holder)?.promotion === promo)!;
    return { t, c: startCareer({ player: t.holder!, today: '2026-11-03', seed: 5 }) };
  };
  it('signing somewhere else straight away', () => {
    const { t, c } = champOf('VWF');
    c.people[c.player]!.contract = null;
    signOffer(c, { id: 'o1', promo: 'TCG', day: c.today, fee: 5000, months: 12, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], start: c.today, status: 'open' } as never);
    expect(t.holder).toBeNull();
    expect(c.letters.some((l) => /stripped/.test(l.subject))).toBe(true);
  });
  it('re-signing with the same promotion keeps it', () => {
    const { t, c } = champOf('VWF');
    const who = t.holder;
    c.people[c.player]!.contract = null;
    signOffer(c, { id: 'o1', promo: 'VWF', day: c.today, fee: 5000, months: 12, clauses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], start: c.today, status: 'open' } as never);
    expect(t.holder).toBe(who);
  });
  it('walking out (Contract Exit) or the deal running out', async () => {
    const a = champOf('TCG');
    a.c.people[a.c.player]!.contract!.clauses[C.exit] = 3;
    leaveContract(a.c);
    expect(a.t.holder).toBeNull();
    const b = champOf('END');
    b.c.people[b.c.player]!.contract!.end = b.c.today;
    await finishDay(b.c, quick);
    expect(b.t.holder).toBeNull();
  });
  it('an indie belt stays on the indies, or with any deal short of Total Exclusivity; goes with it', () => {
    setWorld(freshWorld(5));
    const t = TITLES.find((x) => x.holder && x.id.includes('INDEPENDENT') && findWrestler(x.holder)?.promotion === 'TIS')!;
    const c = startCareer({ player: t.holder!, today: '2026-11-03', seed: 5 });
    signOffer(c, { id: 'o1', promo: 'VWF', day: c.today, fee: 5000, months: 12, clauses: excl(2), start: c.today, status: 'open' } as never);
    expect(t.holder).toBe(c.player);
    setWorld(freshWorld(5));
    const t2 = TITLES.find((x) => x.id === t.id)!;
    const c2 = startCareer({ player: t2.holder!, today: '2026-11-03', seed: 5 });
    signOffer(c2, { id: 'o1', promo: 'VWF', day: c2.today, fee: 5000, months: 12, clauses: excl(3), start: c2.today, status: 'open' } as never);
    expect(t2.holder).toBeNull();
  });
});
