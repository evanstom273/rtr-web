import { afterEach, describe, expect, it, vi } from 'vitest';
import { addHit, loadHits } from './greatestHits';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

const hit = (stars: number) => ({ stars, you: 'A', them: 'B', how: 'A won, 10:00', venue: 'Leeds' });

describe('greatest hits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the best six, sorted', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    for (const s of [1, 4.5, 2, 3, 0.25, 5, 2.75, 3.5]) addHit(hit(s));
    expect(loadHits().map((h) => h.stars)).toEqual([5, 4.5, 3.5, 3, 2.75, 2]);
  });

  it('survives storage that throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(loadHits()).toEqual([]);
    expect(() => addHit(hit(3))).not.toThrow();
  });

  it('survives garbage in storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"not":"an array"}', setItem: () => {} });
    expect(loadHits()).toEqual([]);
  });

  it('works with no localStorage at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadHits()).toEqual([]);
  });
});
