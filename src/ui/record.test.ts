import { describe, expect, it } from 'vitest';
import type { MatchEngine } from '../engine';
import { runHeadless } from '../engine/sim/runHeadless';
import { crc32, zipBytes } from '../storage/zip';
import { buildRecord, fileStem, recordText, recordsZip, statRows } from './record';

function playOne(seed: number) {
  let engine: MatchEngine | null = null;
  runHeadless({ seed, you: 'abril_sosa', them: 'adebayo_the_great_okoro', model: { kind: 'fixed', rate: 0.6 }, onStep: (e) => { engine = e; } });
  return (engine as MatchEngine | null)!.state;
}

describe('match records', () => {
  it('keep the whole match: log, numbers that add up, and the crowd at every step', () => {
    const S = playOne(5);
    const r = buildRecord(S, Date.UTC(2026, 10, 3, 1, 42))!;
    expect(r.log.length).toBe(S.log.length);
    expect(r.heat.line.length).toBeGreaterThan(5);
    const a = r.stats!.you, b = r.stats!.them;
    expect(a.movesLanded + a.reversed).toBe(a.movesTried);
    expect(b.movesLanded + b.reversed).toBe(b.movesTried);
    expect(a.movesTried + b.movesTried).toBeGreaterThan(0);
    expect(a.reversalWins).toBeLessThanOrEqual(a.reversalTries);
    expect(b.reversed).toBe(a.reversalWins);
    expect(a.controlSteps + b.controlSteps).toBeLessThanOrEqual(r.heat.line.length);
    expect(statRows(r)).toHaveLength(13);
    const text = recordText(r);
    expect(text).toContain('BY THE NUMBERS');
    expect(text).toContain('THE COMMENTARY');
    expect(fileStem(r)).toMatch(/^[a-z0-9-]+-2026-11-03-\d{4}$/);
  });

  it('zips them into a real zip file', () => {
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
    const z = zipBytes([{ name: 'a.txt', data: 'hello' }, { name: 'b.json', data: '{}' }]);
    const v = new DataView(z.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint32(z.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(2);
    const r = buildRecord(playOne(6))!;
    const zz = recordsZip([r, r]);
    // Two matches with the same name get distinct files: 4 entries.
    expect(new DataView(zz.buffer).getUint16(zz.length - 22 + 10, true)).toBe(4);
  });
});
