import { store } from '../../storage/storage';
import type { StipulationId } from '../../engine';
import type { TeamKey } from './useDragSort';

/** The match builder's choices, kept while the app is open (they reset on every load). */
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
  stipulation: StipulationId;
  dq: boolean;
  ironManMinutes: number;
  ladderPrize: 'Championship' | 'Briefcase';
  cageEscape: boolean;
  cagePins: boolean;
  cageSubs: boolean;
}

/** Where older versions saved the builder; cleared on load. */
const KEY = 'rtr-builder';
export const MAX_TEAM = 4;

export const DEFAULT_BUILDER: BuilderState = {
  teams: { A: [], B: [] }, locked: { A: false, B: false }, event: 'auto', titleId: '', actionClock: 20, countOuts: true, countOutLimit: 10,
  stipulation: 'standard', dq: true, ironManMinutes: 20, ladderPrize: 'Briefcase', cageEscape: true, cagePins: true, cageSubs: true,
};

/**
 * A fresh builder: no wrestlers picked, a standard singles match. The app starts here on every load
 * (Lyra's call); picks only last while the app is open. Older versions saved the builder, so clear
 * whatever they left behind.
 */
export function freshBuilder(): BuilderState {
  store.remove(KEY);
  store.remove('rtr-picks');
  return { ...DEFAULT_BUILDER, teams: { A: [], B: [] }, locked: { A: false, B: false } };
}
