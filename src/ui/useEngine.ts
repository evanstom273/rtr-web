import { useEffect, useSyncExternalStore } from 'react';
import type { MatchEngine } from '../engine';

/** AI "thinking" pause before it acts: pure pacing, so it uses Math.random rather than the match RNG. */
const aiThinkMs = () => 700 + Math.random() * 350;

/**
 * Subscribe to an engine and run its clock: wait out `continue` delays and the AI's thinking time,
 * then call advance(). Timing interactions (meter, kickout, ref count, submission) are driven by
 * their overlay components instead.
 */
export function useEngine(engine: MatchEngine): number {
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion);
  const pending = engine.state.pending;
  useEffect(() => {
    let ms: number | null = null;
    if (pending.kind === 'continue') ms = pending.delay;
    else if (pending.kind === 'aiThinking') ms = aiThinkMs();
    if (ms === null) return;
    const id = window.setTimeout(() => engine.advance(), ms);
    return () => window.clearTimeout(id);
  }, [engine, pending]);
  return version;
}
