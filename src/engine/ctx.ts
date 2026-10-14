import type { Rng } from './rng';
import type { Choice, MatchState, SideKey } from './types';

export interface EngineHooks {
  /** Called whenever the AI makes a choice for a side (for tests). */
  onAiChoice?: (k: SideKey, choice: Choice | null, valid: boolean) => void;
}

/** Everything the engine's internal functions need. */
export interface Ctx {
  S: MatchState;
  rnd: Rng;
  hooks: EngineHooks;
}
