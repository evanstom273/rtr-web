import { describe, expect, it } from 'vitest';
import { WRESTLERS } from '../../data/rtr';
import { MatchEngine } from '../match';
import { runHeadless } from '../sim/runHeadless';
import { seededRng } from '../rng';
import { fighting } from '../commentary';
import { aiTagInstinct, canTag, cornerDistance, makeTag, partnerFor, tagAfterAction } from '../tag';
import { aiGoesForTap, restHold } from '../submission';
import { resolveTarget } from '../targeting';
import { getMove } from '../../data/rtr';
import type { Ctx } from '../ctx';

const pick = (seed: number, n: number) => {
  const rnd = seededRng(seed), out: string[] = [];
  while (out.length < n) { const w = WRESTLERS[Math.floor(rnd() * WRESTLERS.length)]!; if (!out.includes(w.id)) out.push(w.id); }
  return out;
};
const tagMatch = (seed: number, teams = [0, 1, 0, 1], rules: Record<string, unknown> = {}) => {
  const ids = pick(seed, teams.length);
  return new MatchEngine({ you: ids[0]!, them: ids[1]!, extras: ids.slice(2).map((id, i) => ({ id, team: teams[i + 2]! })), seed, rules: { tag: true, ...rules } });
};
const runTag = (seed: number, teams = [0, 1, 0, 1], rules: Record<string, unknown> = {}, onStep?: Parameters<typeof runHeadless>[0]['onStep']) => {
  const ids = pick(seed, teams.length);
  return runHeadless({ seed, you: ids[0]!, them: ids[1]!, extras: ids.slice(2).map((id, i) => ({ id, team: teams[i + 2]! })), model: { kind: 'fixed', rate: 0.5 }, rules: { tag: true, ...rules }, onStep });
};
const ctxOf = (e: MatchEngine) => (e as unknown as { ctx: Ctx }).ctx;

describe('tag rules', () => {
  it('one legal man a team; partners wait on the apron in their own corner', () => {
    const S = tagMatch(1).state;
    expect(S.type).toBe('tag');
    expect(S.order.filter((k) => S.sides[k]!.legal)).toEqual(['you', 'them']);
    expect(S.sides.s2!.out).toBe('apron');
    expect(S.sides.s2!.state.area).toBe('APRON');
    expect(fighting(S)).toEqual(['you', 'them']);
    expect(S.you.target).toBe('them');
    expect(S.sides.s3!.target).toBe('you');
    // Count-outs and DQs stay on (unlike a one-fall multi-man).
    expect(S.rules.countOuts).toBe(true);
    expect(S.rules.dq).toBe(true);
  });

  it('a tag swaps the legal man, and the player goes with it', () => {
    const e = tagMatch(2), S = e.state;
    S.you.state = { position: 'STANDING', orientation: 'FRONT', area: 'CORNER', motion: 'STATIONARY' };
    S.you.spot = 0; // team 0's corner (north-east)
    expect(cornerDistance(S, 'you')).toBe(0);
    expect(canTag(S, 'you')).toBe(true);
    makeTag(ctxOf(e), 'you', 's2');
    expect(S.you.legal).toBe(false);
    expect(S.you.out).toBe('apron');
    expect(S.sides.s2!.legal).toBe(true);
    expect(S.player).toBe('s2');
    expect(S.sides.s2!.controller).toBe('player');
    expect(S.them.target).toBe('s2');
    expect(fighting(S)).toEqual(['them', 's2']);
  });

  it('no tagging straight back out: the man who just came in has to do something first', () => {
    const e = tagMatch(2), S = e.state;
    S.you.state = { position: 'STANDING', orientation: 'FRONT', area: 'CORNER', motion: 'STATIONARY' };
    S.you.spot = 0;
    makeTag(ctxOf(e), 'you', 's2');
    // Partner right there in the corner he just came out of, and it's still no.
    expect(partnerFor(S, 's2')).toBe('you');
    expect(canTag(S, 's2')).toBe(false);
    // One more action happens (anyone's), and the tag's back on, if he's still near his corner.
    tagAfterAction(ctxOf(e));
    expect(S.sides.s2!.fresh ?? 0).toBe(0);
    expect(canTag(S, 's2')).toBe(cornerDistance(S, 's2') <= 1);
  });

  it('the player can’t loop tags: after tagging in, the Tag button is off until the next action', () => {
    // Play a tag match as the player, pressing Tag whenever it's offered; never two of our tags in a row.
    for (const seed of [3, 4, 5, 6]) {
      const e = tagMatch(seed);
      // A loop: the man who's just come in tagging straight back out on his first prompt, before doing anything.
      let tags = 0, loops = 0, justIn = false;
      for (let step = 0; step < 4000 && e.pending.kind !== 'over'; step++) {
        const p = e.pending;
        if (p.kind === 'awaitPlayer') {
          const fresh = justIn && e.state.sides[e.pk]!.legal && e.state.crowd.tags !== undefined;
          if (e.canTag()) {
            if (fresh) loops++;
            const before = e.state.crowd.tags ?? 0;
            e.tag();
            justIn = (e.state.crowd.tags ?? 0) > before;
            tags++;
          } else { justIn = false; e.autoPlayer(); }
        } else if (p.kind === 'continue' || p.kind === 'aiThinking' || p.kind === 'refCount' || p.kind === 'refTen') e.advance();
        else if (p.kind === 'defend') e.defend(e.autoDefence());
        else if (p.kind === 'contest') e.rollContest(e.autoPush());
        else if (p.kind === 'contestRoll') e.applyContest();
        else if (p.kind === 'kickout') e.resolveKickout(true, 2);
        else if (p.kind === 'sub') e.advance();
        else if (p.kind === 'subChoice') e.resolveSubChoice(e.autoSubChoice());
        else if (p.kind === 'tenCount') e.resolveTenCount(true, 5);
        else if (p.kind === 'sigConvert') e.resolveSigConvert(e.autoSigConvert());
        else if (p.kind === 'pinChoice') e.resolvePinChoice(e.autoPinChoice());
        else if (p.kind === 'resiliency') e.resolveResiliency(true);
        else if (p.kind === 'save') e.resolveSavePrompt(e.autoSave());
        else break;
      }
      expect(loops, `seed ${seed}`).toBe(0);
      expect(tags, `seed ${seed}: tagged at all`).toBeGreaterThan(1);
    }
  });

  it('a babyface’s tag doesn’t count while the referee is distracted', () => {
    const e = tagMatch(3), S = e.state;
    S.you.w = { ...S.you.w, disposition: 'FACE' };
    S.ref.distracted = 2;
    makeTag(ctxOf(e), 'you', 's2');
    expect(S.you.legal).toBe(true);
    expect(S.sides.s2!.out).toBe('apron');
  });

  it('nobody to tag when your partner has been knocked off the apron', () => {
    const S = tagMatch(4).state;
    S.sides.s2!.away = 2;
    expect(partnerFor(S, 'you')).toBeNull();
    expect(canTag(S, 'you')).toBe(false);
  });

  it('only legal men pin or get pinned', () => {
    for (let seed = 10; seed < 30; seed++) {
      let illegal = false;
      const r = runTag(seed, [0, 1, 0, 1], {}, (e) => {
        const p = e.pending;
        const pinner = p.kind === 'refCount' ? p.pinner : p.kind === 'kickout' ? p.spec.pinner : null;
        if (pinner && (!e.state.sides[pinner]!.legal || !e.state.sides[e.state.sides[pinner]!.target]!.legal)) illegal = true;
      });
      expect(r.stuck).toBeNull();
      expect(illegal).toBe(false);
      if (r.result!.finish === 'PINFALL' || r.result!.finish === 'SUBMISSION') {
        expect(r.engine.state.sides[r.result!.loser!]!.legal).toBe(true);
      }
    }
  });

  it('matches have tags, hot tags, cut-offs and double-teams', () => {
    const c = { tags: 0, hot: 0, cut: 0, dt: 0 };
    for (let seed = 40; seed < 80; seed++) {
      const S = runTag(seed, [0, 1, 0, 1, 0, 1]).engine.state;
      c.tags += S.crowd.tags ?? 0;
      c.hot += S.crowd.hotTags ?? 0;
      c.cut += S.crowd.cutOffs ?? 0;
      c.dt += S.crowd.doubleTeams ?? 0;
    }
    expect(c.tags).toBeGreaterThan(80);
    expect(c.hot).toBeGreaterThan(15);
    expect(c.cut).toBeGreaterThan(2);
    expect(c.dt).toBeGreaterThan(10);
  });

  it('handicap with tag rules: the one on their own never tags', () => {
    for (let seed = 90; seed < 96; seed++) {
      let soloTagged = false;
      const r = runTag(seed, [0, 1, 1], {}, (e) => { if (!e.state.you.legal && !e.state.over) soloTagged = true; });
      expect(r.stuck).toBeNull();
      expect(soloTagged).toBe(false);
    }
  });

  it('elimination tag: when a legal man goes out, their partner comes in, until a team is gone', () => {
    for (let seed = 100; seed < 108; seed++) {
      const r = runTag(seed, [0, 1, 0, 1, 0, 1], { elimination: true });
      expect(r.stuck).toBeNull();
      const S = r.engine.state, R = r.result!;
      const losing = S.order.filter((k) => !R.winners!.includes(k));
      expect(losing.every((k) => S.sides[k]!.out === 'eliminated')).toBe(true);
      expect(S.elims.length).toBeGreaterThanOrEqual(3);
      // Whoever's left standing for the winners was legal at the end.
      expect(R.winners!.some((k) => S.sides[k]!.legal)).toBe(true);
    }
  });

  it('a team finisher: the team named it, and they hit it', () => {
    let hit = 0;
    for (let seed = 120; seed < 160 && !hit; seed++) {
      const r = runTag(seed, [0, 1, 0, 1], { teamFinishers: { 0: 'Total Eclipse', 1: 'Midnight Express Lane' } });
      if (r.engine.state.log.some((l) => l.segs.some((s) => /TOTAL ECLIPSE|MIDNIGHT EXPRESS LANE/.test(s.v)))) hit++;
    }
    expect(hit).toBeGreaterThan(0);
  });
});

describe('tag matches play like tag matches (Lyra’s 16: too few tags, partners never saved holds, a side headlock won it)', () => {
  const line = (S: ReturnType<typeof runTag>['engine']['state'], re: RegExp) => S.log.filter((l) => re.test(l.segs.map((x) => x.v).join(''))).length;

  it('2-on-2: plenty of tags, a hot tag most matches, and mostly won by pinfall', () => {
    const c = { n: 0, tags: 0, hot: 0, subs: 0, pins: 0, zero: 0 };
    for (let seed = 200; seed < 240; seed++) {
      // The harness's model (the man at the controls plays like a person, not a coin).
      const ids = pick(seed, 4);
      const S = runHeadless({ seed, you: ids[0]!, them: ids[1]!, extras: [{ id: ids[2]!, team: 0 }, { id: ids[3]!, team: 1 }], model: { kind: 'skill', sigmaSeconds: 0.09 }, rules: { tag: true } }).engine.state;
      c.n++;
      c.tags += S.crowd.tags ?? 0;
      c.hot += S.crowd.hotTags ?? 0;
      if (!(S.crowd.tags ?? 0)) c.zero++;
      if (S.result?.finish === 'SUBMISSION') c.subs++;
      if (S.result?.finish === 'PINFALL') c.pins++;
    }
    console.log(c);
    expect(c.tags / c.n).toBeGreaterThan(5);
    expect(c.hot / c.n).toBeGreaterThan(0.6);
    expect(c.zero).toBeLessThanOrEqual(2);
    expect(c.subs / c.n).toBeLessThan(0.3);
    expect(c.pins / c.n).toBeGreaterThan(0.6);
  });

  it('the man in peril reaches for his corner without needing a run of his own first', () => {
    const e = tagMatch(7);
    const S = e.state, ctx = ctxOf(e);
    const A = S.sides.you!;
    A.legalTurns = 0;
    A.peakPeril = A.peril = 6;
    A.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
    let tries = 0;
    for (let i = 0; i < 200; i++) if (aiTagInstinct({ ...ctx, rnd: seededRng(i) }, 'you', []) === 'tag') tries++;
    expect(canTag(S, 'you')).toBe(true);
    expect(tries).toBeGreaterThan(40);
  });

  it('partners break up holds, and after a save the partners often brawl to the floor', () => {
    let saves = 0, brawls = 0;
    for (let seed = 200; seed < 240; seed++) {
      const S = runTag(seed).engine.state;
      saves += line(S, /stomps .* loose|breaks it up/);
      brawls += line(S, /spill to the floor/);
    }
    expect(saves).toBeGreaterThan(20);
    expect(brawls).toBeGreaterThan(5);
  });

  it('a rest hold never makes anyone tap: worked, not a finish (singles too)', () => {
    const rest = getMove('side_headlock');
    const e = tagMatch(9), S = e.state;
    S.sides.them!.hp.HEAD = 5;
    expect(restHold(S.sides.you!, rest)).toBe(true);
    expect(aiGoesForTap(S, 'you', rest, resolveTarget(rest, 'NONE', S.sides.them!.hp))).toBe(false);
    // ...unless it's somebody's finisher.
    expect(restHold({ ...S.sides.you!, finishers: [rest] } as never, rest)).toBe(false);
    for (let seed = 300; seed < 340; seed++) {
      const ids = pick(seed, 2);
      const r = runHeadless({ seed, you: ids[0]!, them: ids[1]!, model: { kind: 'skill', sigmaSeconds: 0.09 } });
      if (r.result?.finish === 'SUBMISSION') expect(r.result.move!.impact, r.result.move!.name).toBeGreaterThan(3);
    }
  });

  it('in a tag match, the AI won’t bet the match on an ordinary hold with the other man’s partner stood there', () => {
    const e = tagMatch(11), S = e.state;
    const hold = getMove('americana');
    S.sides.them!.hp.LEFT_ARM = 5;
    const t = resolveTarget(hold, 'LEFT_ARM', S.sides.them!.hp);
    expect(S.sides.s3!.out).toBe('apron');
    expect(aiGoesForTap(S, 'you', hold, t)).toBe(false);
    // Partner knocked off the apron: now it's on.
    S.sides.s3!.away = 3;
    expect(aiGoesForTap(S, 'you', hold, t)).toBe(true);
  });
});
