import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEATURES } from '../career/tuning';
import { findWrestler } from '../data/rtr';
import { seededRng } from '../engine/rng';
import { begin } from '../career/testkit';
import { applyStakes } from '../career/stakes';
import type { Person } from '../career/types';
import {
  activeTeams, addWear, briefcaseOf, ensureMatchWorld, fadeWear, monthlyTeams, TAG_TITLE_NAME, teamOf, teamsIn, unmask, wearInjury, wearStart, willing,
} from './matchWorld';
import { activeWorld, freshWorld, setWorld } from './world';

const flag = FEATURES as { matches: boolean };
let was = false;
beforeEach(() => { was = flag.matches; flag.matches = true; });
afterEach(() => { flag.matches = was; });

describe('the match overhaul’s world (stage 8)', () => {
  it('every major gets tag teams and a tag title held by one of them, named in its style; SLN trios; no other new belts', () => {
    const w = setWorld(freshWorld(3));
    expect(w.matchWorld).toBe(2);
    for (const p of w.db.promotions.filter((x) => !x.indie)) {
      const men = teamsIn(w, p.initials).filter((t) => !t.trios && findWrestler(t.members[0]!)!.gender === 'MALE');
      expect(men.length, p.initials).toBeGreaterThanOrEqual(3);
      for (const t of teamsIn(w, p.initials)) for (const id of t.members) expect(findWrestler(id)!.promotion).toBe(p.initials);
      const tag = w.db.titles.find((t) => t.id === `${p.initials}_TAG_TEAM_CHAMPIONSHIP`)!;
      expect(tag.kind).toBe('tag');
      expect(tag.name).toBe(TAG_TITLE_NAME[p.initials]);
      expect(tag.holders).toHaveLength(2);
      expect(w.teams![tag.team!]!.members).toEqual(tag.holders);
      expect(p.titles).toContain(tag.id);
      expect(w.history.reigns[tag.id]?.at(-1)?.name).toBe(w.teams![tag.team!]!.name);
    }
    const trios = w.db.titles.find((t) => t.id === 'SLN_TRIOS_CHAMPIONSHIP')!;
    expect(trios.holders).toHaveLength(3);
    // Tag belts only (Lyra's call): no hardcore belts.
    expect(w.db.titles.some((t) => t.kind === 'hardcore')).toBe(false);
    expect(w.db.titles.find((t) => t.id === 'TCG_TAG_TEAM_CHAMPIONSHIP')!.name).toBe('TCG Tag Team Title');
    expect(w.db.titles.find((t) => t.id === 'SLN_TAG_TEAM_CHAMPIONSHIP')!.name).toBe('SLN Campeonato de Parejas');
    // Once only.
    const n = w.db.titles.length;
    ensureMatchWorld(w);
    expect(w.db.titles.length).toBe(n);
  });

  it('a save from before: its hardcore belts go (reigns, news and all) and the tag belts are renamed', () => {
    const w = setWorld(freshWorld(8));
    // As the first revision left it: a hardcore belt with a reign, and the old tag name.
    const p = w.db.promotions.find((x) => x.initials === 'END')!;
    const champ = w.db.wrestlers.find((x) => x.promotion === 'END')!.id;
    w.db.titles.push({ id: 'END_HARDCORE_CHAMPIONSHIP', name: 'END Hardcore Championship', promotionId: p.id, gender: 'MALE', holder: champ, weeksHeld: 0, kind: 'hardcore' });
    p.titles.push('END_HARDCORE_CHAMPIONSHIP');
    w.history.reigns.END_HARDCORE_CHAMPIONSHIP = [{ holder: champ, name: 'x', from: '2026-01-01', to: null, defences: 0 }];
    w.db.titles.find((t) => t.id === 'TCG_TAG_TEAM_CHAMPIONSHIP')!.name = 'TCG Tag Team Championship';
    w.matchWorld = 1;
    ensureMatchWorld(w);
    expect(w.matchWorld).toBe(2);
    expect(w.db.titles.some((t) => t.id === 'END_HARDCORE_CHAMPIONSHIP')).toBe(false);
    expect(p.titles).not.toContain('END_HARDCORE_CHAMPIONSHIP');
    expect(w.history.reigns.END_HARDCORE_CHAMPIONSHIP).toBeUndefined();
    expect(w.db.titles.find((t) => t.id === 'TCG_TAG_TEAM_CHAMPIONSHIP')!.name).toBe('TCG Tag Team Title');
  });

  it('with the flag off, the world is left alone', () => {
    flag.matches = false;
    const w = setWorld(freshWorld(4));
    expect(w.teams).toBeUndefined();
    expect(w.db.titles.some((t) => t.kind === 'tag')).toBe(false);
  });

  it('masks: most of SLN, hardly anyone at the big northern promotions; and some won’t do hardcore while some love it', () => {
    const w = setWorld(freshWorld(5));
    const share = (p: string) => { const r = w.db.wrestlers.filter((x) => x.promotion === p); return r.filter((x) => x.masked).length / r.length; };
    expect(share('SLN')).toBeGreaterThan(0.5);
    expect(share('VWF')).toBeLessThan(0.15);
    const h = w.db.wrestlers.map(willing);
    expect(h.filter((x) => x === -1).length).toBeGreaterThan(10);
    expect(h.filter((x) => x === 1).length).toBeGreaterThan(10);
  });

  it('losing your mask is for good, and usually costs fans', () => {
    setWorld(freshWorld(6));
    const x = activeWorld().db.wrestlers.find((y) => y.masked)!;
    const before = Object.values(x.fans).reduce((a, b) => a + b, 0);
    const how = unmask(x, '2026-01-01', seededRng(1));
    expect(x.masked).toBe(false);
    expect(x.unmasked).toBe('2026-01-01');
    const after = Object.values(x.fans).reduce((a, b) => a + b, 0);
    expect(how === 'drop' ? after < before : after > before).toBe(true);
  });

  it('lasting damage builds where they took it, fades week by week, and makes injuries likelier', () => {
    const p = { rep: 0, fatigue: 0, injury: null, contract: null, birthday: '01-01', last: null } as Person;
    addWear(p, { HEAD: 40, BODY: 60, LEFT_ARM: 100, RIGHT_ARM: 100, LEFT_LEG: 100, RIGHT_LEG: 100 }, 2, 'Deathmatch, 2026');
    expect(p.wear!.HEAD).toBeGreaterThan(p.wear!.BODY!);
    expect(p.wear!.LEFT_ARM ?? 0).toBe(0);
    expect(p.scars).toEqual(['Deathmatch, 2026']);
    expect(wearStart(p)!.HEAD).toBeLessThan(100);
    expect(wearInjury(p)).toBeGreaterThan(1);
    const head = p.wear!.HEAD!;
    fadeWear(p, 28);
    expect(p.wear!.HEAD!).toBeLessThan(head);
    fadeWear(p, 365);
    expect(p.wear?.HEAD).toBeUndefined();
  });

  it('teams come and go month by month: new ones form, stale ones split (and lose their titles)', () => {
    const w = setWorld(freshWorld(7));
    const before = activeTeams(w).length;
    let formed = 0, split = 0;
    for (let m = 1; m <= 24; m++) {
      const news = monthlyTeams(w, `2027-${String(((m - 1) % 12) + 1).padStart(2, '0')}-01` as never, () => false);
      formed += news.filter((l) => l.startsWith('New in')).length;
      split += news.filter((l) => !l.startsWith('New in')).length;
    }
    expect(formed).toBeGreaterThan(0);
    expect(split).toBeGreaterThan(0);
    expect(activeTeams(w).length).toBeGreaterThan(before / 2);
    for (const t of w.db.titles.filter((x) => x.team)) expect(w.teams![t.team!]!.split).toBeUndefined();
  });
});

describe('stakes', () => {
  it('loser leaves town, mask, retirement, contendership and the briefcase all land', () => {
    const c = begin('jamie_mercer', 11);
    const w = activeWorld();
    ensureMatchWorld(w);
    // Nobody holding a belt (champions don't retire mid-reign).
    const vwf = w.db.wrestlers.filter((x) => x.promotion === 'VWF' && x.id !== c.player && !w.db.titles.some((t) => t.holder === x.id || t.holders?.includes(x.id)));
    const [a, b, d, e] = vwf;
    applyStakes(c, { kind: 'loser_leaves' }, [a!.id], [b!.id], 'VWF');
    expect(findWrestler(b!.id)!.promotion).not.toBe('VWF');
    expect(c.people[b!.id]!.leftTown?.promo).toBe('VWF');
    d!.masked = true;
    applyStakes(c, { kind: 'mask' }, [a!.id], [d!.id], 'VWF');
    expect(findWrestler(d!.id)!.masked).toBe(false);
    applyStakes(c, { kind: 'retirement' }, [a!.id], [e!.id], 'VWF');
    expect(c.people[e!.id]!.retired).toBe(true);
    applyStakes(c, { kind: 'contendership', title: 'VWF_CHAMPIONSHIP' }, [a!.id], [], 'VWF');
    expect(w.shots?.some((s) => s.who === a!.id && s.title === 'VWF_CHAMPIONSHIP')).toBe(true);
    applyStakes(c, { kind: 'briefcase' }, [a!.id], [], 'VWF');
    expect(briefcaseOf(w, a!.id)?.promo).toBe('VWF');
    expect(teamOf(w, 'nobody')).toBeUndefined();
  });
});
