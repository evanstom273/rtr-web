import type { AiBrain } from './ai';
import type { Rng } from './rng';
import type { Choice, MatchState, SideKey } from './types';

export interface EngineHooks {
  /** Called whenever an AI (or the auto-player) makes a choice, with whether it was legal. */
  onAiChoice?: (k: SideKey, choice: Choice | null, valid: boolean) => void;
}

export interface Ctx {
  S: MatchState;
  rnd: Rng;
  ai: Record<SideKey, AiBrain>;
  hooks: EngineHooks;
}
