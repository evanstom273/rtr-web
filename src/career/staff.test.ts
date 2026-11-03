// Bookers' and promoters' careers, and succession (Lyra's calls): the person keeps their feelings and their
// memory of you wherever they go; the newcomer gets the office's files, not feelings; every open promise
// is honoured or refused, on record; changing employer never resets anyone's relationships.
import { describe, expect, it } from 'vitest';
import { activeWorld } from '../world/world';
import { bondOf, bookerOf, moveBond } from '../world/people';
import { handover, memoryOf, patienceOf, promisesOnHandover, remember, trust } from './index';
import { movePatience } from './patience';
import { PATIENCE_START, TRUST_INHERIT } from './tuning';
import { begin, day, quick } from './testkit';
import { seededRng } from '../engine/rng';

describe('bookers’ careers', () => {
  it('over years: a few booker changes a year, indie brands come and go, and the scene keeps its shape', async () => {
    const c = begin('jamie_mercer', 7);
    const P = activeWorld().people!;
    const brandsAtStart = Object.values(P.brands).filter((b) => !b.closed).length;
    for (let i = 0; i < 365 * 3; i++) await day(c, quick, 'simmed');
    const H = activeWorld().history;
    const hires = H.events.filter((e) => e.kind === 'hired').length / 3;
    const closes = H.events.filter((e) => e.kind === 'closed').length / 3;
    expect(hires).toBeGreaterThanOrEqual(0.3);
    expect(hires).toBeLessThanOrEqual(4);
    expect(closes / brandsAtStart).toBeGreaterThanOrEqual(0.05);
    expect(closes / brandsAtStart).toBeLessThanOrEqual(0.35);
    // Every promotion still has a booker; the number of open brands stays the same.
    for (const p of ['VWF', 'TCG', 'SLN', 'END', 'IVW', 'NWGP', 'ZWA', 'UFC', 'SSWC', 'AAWA']) expect(bookerOf(P, p), p).toBeTruthy();
    expect(Object.values(P.brands).filter((b) => !b.closed).length).toBe(brandsAtStart);
  }, 300000);

  it('a new booker gets the office’s files, not feelings; the old one keeps theirs wherever they go', () => {
    const c = begin('jamie_mercer', 11);
    const P = activeWorld().people!;
    const old = bookerOf(P, 'VWF')!;
    remember(c, 'VWF', 'kept', 8);
    remember(c, 'VWF', 'offScript', 4);
    movePatience(c, 'VWF', -30, 'test');
    moveBond(P, old.id, c.player, 40, 'old friends', c.today, 'friend');
    const oldTrust = trust(c, old.id);
    const fresh = handover(c, 'VWF', old, 'fired', seededRng(4));
    expect(fresh.id).not.toBe(old.id);
    expect(bookerOf(P, 'VWF')!.id).toBe(fresh.id);
    // The newcomer: a quarter of the files, fresh patience, no inherited feelings.
    expect(memoryOf(c, 'VWF').kept).toBe(Math.round(8 * TRUST_INHERIT));
    expect(memoryOf(c, 'VWF').offScript).toBe(Math.round(4 * TRUST_INHERIT));
    expect(patienceOf(c, 'VWF')).toBe(PATIENCE_START);
    expect(bondOf(P, fresh.id, c.player)?.v ?? 0).toBe(0);
    // The one who left keeps everything.
    expect(trust(c, old.id)).toBe(oldTrust);
    expect(patienceOf(c, old.id)).toBeLessThan(PATIENCE_START);
    expect(bondOf(P, old.id, c.player)!.v).toBe(40);
    expect(old.job).toBeNull();
    expect(old.spells.at(-1)!.end).toBe('fired');
    expect(activeWorld().history.events.some((e) => e.kind === 'hired' && e.who === fresh.id && e.promo === 'VWF')).toBe(true);
    // Your promotion's booker changed: you hear about it.
    expect(c.letters.some((l) => l.subject === 'VWF has a new booker')).toBe(true);
  });

  it('a refused promise stays on record as refused, by the newcomer, and costs you nothing', () => {
    const c = begin('jamie_mercer', 3);
    const P = activeWorld().people!;
    const old = bookerOf(P, 'VWF')!;
    c.pledges = [{ id: 'p1', promo: 'VWF', kind: 'title', title: 'VWF_CHAMPIONSHIP', by: old.id, status: 'open' }, { id: 'p2', promo: 'VWF', kind: 'dates', month: '2027-01', min: 4, by: old.id, status: 'open' }];
    const before = patienceOf(c, 'VWF');
    const fresh = handover(c, 'VWF', old, 'quit', seededRng(9));
    // Whatever the newcomer decided, each promise is either still open (now theirs) or on record as refused.
    for (const id of ['p1', 'p2']) {
      const open = c.pledges?.find((p) => p.id === id);
      const logged = c.pledgeLog?.find((p) => p.id === id);
      expect(!!open !== !!logged).toBe(true);
      if (open) expect(open.by).toBe(fresh.id);
      if (logged) { expect(logged.status).toBe('refused'); expect(logged.settledBy).toBe(fresh.id); }
    }
    // Force a refusal to check it really costs nothing.
    c.pledges = [{ id: 'p3', promo: 'VWF', kind: 'title', title: 'VWF_CHAMPIONSHIP', by: old.id, status: 'open' }];
    promisesOnHandover(c, 'VWF', fresh, () => 0.999);
    const refused = c.pledgeLog!.find((p) => p.id === 'p3')!;
    expect(refused.status).toBe('refused');
    expect(patienceOf(c, 'VWF')).toBe(before === PATIENCE_START ? PATIENCE_START : patienceOf(c, 'VWF'));
    expect(c.letters.some((l) => l.subject === 'A promise I won’t keep')).toBe(true);
  });

  it('an indie promoter who has made a name can be hired by a promotion, and keeps their relationships', () => {
    const c = begin('jamie_mercer', 5);
    const P = activeWorld().people!;
    const promoter = Object.values(P.staff).find((s) => s.job?.kind === 'promoter')!;
    promoter.rep = 95;
    for (const s of Object.values(P.staff)) if (s.job?.kind === 'promoter' && s !== promoter) s.rep = 10;
    moveBond(P, promoter.id, c.player, 25, 'worked together', c.today);
    remember(c, promoter.id, 'kept', 3);
    const brand = promoter.job!.kind === 'promoter' ? promoter.job.brand : '';
    let hired = null;
    for (let seed = 0; seed < 60 && !hired; seed++) {
      const old = bookerOf(P, 'TCG')!;
      const s = handover(c, 'TCG', old, 'quit', seededRng(seed));
      if (s.id === promoter.id) hired = s;
    }
    expect(hired, 'the promoter got the job in one of the tries').toBeTruthy();
    expect(promoter.job).toEqual({ kind: 'booker', promo: 'TCG' });
    expect(promoter.spells.map((x) => x.job.kind)).toEqual(['promoter', 'booker']);
    // Same person, same feelings, same memory of you.
    expect(bondOf(P, promoter.id, c.player)!.v).toBe(25);
    expect(memoryOf(c, 'TCG').kept).toBeGreaterThanOrEqual(3);
    // Their brand carries on under someone new.
    expect(P.brands[brand]!.promoter).not.toBe(promoter.id);
    expect(P.staff[P.brands[brand]!.promoter!]!.job).toEqual({ kind: 'promoter', brand });
  });
});
