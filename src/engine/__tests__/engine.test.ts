import { describe, expect, it } from 'vitest';
import { fill } from '../commentary';
import { MatchEngine } from '../match';
import { seededRng } from '../rng';
import type { MatchState, Seg } from '../types';

const text = (segs: Seg[]) => segs.map((s) => s.v).join('');
const logText = (S: MatchState) => S.log.map((l) => `${l.t}|${l.cls}|${text(l.segs)}`);

/** Drive a match with a fixed policy: always auto-pick, always hit gold, fixed kickouts and subs. */
function drive(seed: number, maxSteps = 5000): MatchEngine {
  const e = new MatchEngine({ you: 'grist', them: 'sol', stakes: 'title', seed });
  for (let i = 0; i < maxSteps && e.pending.kind !== 'over'; i++) {
    const p = e.pending;
    if (p.kind === 'continue' || p.kind === 'aiThinking' || p.kind === 'refCount') e.advance();
    else if (p.kind === 'awaitPlayer') e.autoPlayer();
    else if (p.kind === 'meter') e.resolveMeter(i % 3 !== 0);
    else if (p.kind === 'kickout') e.resolveKickout(i % 4 === 0 ? 0 : 2);
    else if (p.kind === 'sub') e.resolveSub(i % 2 ? 'rope' : 'escape', 60);
    else throw new Error(`stuck in ${p.kind}`);
  }
  return e;
}

describe('MatchEngine', () => {
  it('starts with intro lines and waits for the bell', () => {
    const e = new MatchEngine({ you: 'rook', them: 'juno', stakes: 'title', seed: 7 });
    expect(e.state.heat).toBe(45);
    expect(e.pending).toEqual({ kind: 'continue', delay: 1100, cont: { to: 'bell' } });
    expect(text(e.state.log[0]!.segs)).toMatch(/is on the line\.$/);
    expect(text(e.state.log[1]!.segs)).toBe('Isla Rook versus Juno Vance. The referee checks both wrestlers.');
    e.advance();
    expect(['awaitPlayer', 'aiThinking']).toContain(e.pending.kind);
    expect(e.state.ctrl).not.toBeNull();
  });

  it('cross-promotion matches are dream matches; same-promotion use the promotion', () => {
    expect(new MatchEngine({ you: 'rook', them: 'juno', stakes: 'exh', seed: 1 }).state.event).toBe('The Indie Scene: Dream Match');
    expect(new MatchEngine({ you: 'rook', them: 'grist', stakes: 'exh', seed: 1 }).state.event).toBe('ENDEAVOUR: Heavy Weather');
  });

  it('is reproducible from a seed', () => {
    const a = drive(42), b = drive(42), c = drive(43);
    expect(a.pending.kind).toBe('over');
    expect(logText(a.state)).toEqual(logText(b.state));
    expect(a.state.rating).toEqual(b.state.rating);
    expect(logText(a.state)).not.toEqual(logText(c.state));
  });

  it('rejects actions that are not currently asked for', () => {
    const e = new MatchEngine({ you: 'rook', them: 'juno', stakes: 'exh', seed: 3 });
    expect(e.resolveMeter(true)).toBe(false);
    expect(e.pin()).toBe(false);
    expect(e.chooseMove({ index: 0 })).toBe(false);
  });

  it('player move → meter → landed', () => {
    const e = new MatchEngine({ you: 'rook', them: 'juno', stakes: 'exh', rng: seededRng(5) });
    e.advance();
    // force control to the player for this test
    e.state.ctrl = 'you';
    e.state.pending = { kind: 'awaitPlayer' };
    expect(e.canPin()).toBe(false);
    expect(e.canUseSpecial('fin')).toBe(false);
    const idx = e.state.you.moves.findIndex((m) => m.name === 'Body slam');
    expect(e.chooseMove({ index: idx })).toBe(true);
    const p = e.pending;
    if (p.kind !== 'meter') throw new Error('expected meter');
    expect(p.meter.mode).toBe('off');
    expect(p.meter.title).toBe('Body slam');
    expect(p.meter.left).toBeGreaterThanOrEqual(0);
    expect(p.meter.left + p.meter.width).toBeLessThanOrEqual(100);
    expect(e.state.t).toBe(20);
    e.resolveMeter(true);
    expect(e.state.them.pos).toBe('grounded');
    expect(e.state.them.hp.body).toBeLessThan(100);
    expect(e.state.you.used['Body slam']).toBe(1);
    expect(e.pending.kind).toBe('continue');
  });

  it('meter direction alternates', () => {
    const e = new MatchEngine({ you: 'rook', them: 'juno', stakes: 'exh', seed: 9 });
    const dirs: number[] = [];
    for (let i = 0; i < 4; i++) {
      e.state.ctrl = 'you';
      e.state.pending = { kind: 'awaitPlayer' };
      e.state.you.pos = 'standing';
      e.state.them.pos = 'standing';
      e.chooseMove({ index: 0 });
      const p = e.pending;
      if (p.kind === 'meter') dirs.push(p.meter.dir);
      e.resolveMeter(false);
    }
    expect(dirs).toEqual([1, -1, 1, -1]);
  });

  it('the view snapshot only refreshes at render points, like the original', () => {
    const e = new MatchEngine({ you: 'rook', them: 'juno', stakes: 'exh', seed: 11 });
    e.advance();
    e.state.ctrl = 'you';
    e.state.pending = { kind: 'awaitPlayer' };
    const before = e.state.view.t;
    e.chooseMove({ index: 0 });
    expect(e.state.t).toBe(before + 20);
    expect(e.state.view.t).toBe(before);
  });
});

describe('fill', () => {
  const S = new MatchEngine({ you: 'rook', them: 'juno', stakes: 'exh', seed: 1 }).state;

  it('names, move with article, gold and vars', () => {
    const segs = fill(S, '<G>{x}!!</G> {a} hits {am} on {d}.', { a: 'you', d: 'them', am: 'Elbow drop', vars: { x: 'BOOM' } });
    expect(segs).toEqual([
      { k: 'gold', v: 'BOOM!!', big: true },
      { k: 'text', v: ' ' },
      { k: 'name', side: 'you', v: 'Isla Rook' },
      { k: 'text', v: ' hits an ' },
      { k: 'move', v: 'Elbow drop' },
      { k: 'text', v: ' on ' },
      { k: 'name', side: 'them', v: 'Juno Vance' },
      { k: 'text', v: '.' },
    ]);
  });

  it('article picks a/an by first letter', () => {
    expect(text(fill(S, '{am}', { am: 'DDT' }))).toBe('a DDT');
    expect(text(fill(S, '{am}', { am: 'Arm drag' }))).toBe('an Arm drag');
  });
});
