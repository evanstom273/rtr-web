import { findWrestler } from '../../data/rtr';
import { store } from '../../storage/storage';
import type { TeamKey } from './useDragSort';

/** Everything the match builder remembers between visits. */
export interface BuilderState {
  teams: Record<TeamKey, string[]>;
  locked: Record<TeamKey, boolean>;
  /** 'auto' = from the wrestlers; '' = independent show; otherwise promotion initials. */
  event: string;
  /** '' = non-title. */
  titleId: string;
  actionClock: number;
  countOuts: boolean;
  countOutLimit: number;
}

const KEY = 'rtr-builder';
export const MAX_TEAM = 4;

export const DEFAULT_BUILDER: BuilderState = {
  teams: { A: [], B: [] }, locked: { A: false, B: false }, event: 'auto', titleId: '', actionClock: 20, countOuts: true, countOutLimit: 10,
};

export function loadBuilder(): BuilderState {
  const saved = store.get<Partial<BuilderState> | null>(KEY, null);
  const s: BuilderState = { ...DEFAULT_BUILDER, ...(saved ?? {}) };
  if (!saved) {
    // Carry over the old setup screen's picks.
    const old = store.get<{ you?: string; them?: string } | null>('rtr-picks', null);
    s.teams = { A: old?.you ? [old.you] : [], B: old?.them ? [old.them] : [] };
  }
  s.teams = { A: (s.teams?.A ?? []).filter((id) => findWrestler(id)), B: (s.teams?.B ?? []).filter((id) => findWrestler(id)) };
  s.locked = { A: !!s.locked?.A, B: !!s.locked?.B };
  return s;
}

export const saveBuilder = (s: BuilderState): void => store.set(KEY, s);
