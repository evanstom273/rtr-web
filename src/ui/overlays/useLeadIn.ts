import { useEffect, useState } from 'react';
import { reduceMotion } from '../format';

/**
 * Godot's present_countdown: a short read of the event, then 3-2-1, then the interaction goes live.
 * Returns the countdown label to show, or null once live. `values` must be stable (module constant).
 */
const THREE_TWO_ONE: readonly string[] = ['3', '2', '1'];

export function useLeadIn(values: readonly string[] = THREE_TWO_ONE, leadIn = 0.35, interval = 0.3): string | null {
  const [i, setI] = useState(-1);
  useEffect(() => {
    const timers: number[] = [];
    const step = reduceMotion() ? interval * 1.2 : interval;
    timers.push(window.setTimeout(() => setI(0), leadIn * 1000));
    values.forEach((_, k) => timers.push(window.setTimeout(() => setI(k + 1), (leadIn + step * (k + 1)) * 1000)));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [values, leadIn, interval]);
  if (i < 0) return '';
  return i < values.length ? values[i]! : null;
}

/** Space / Enter as the action key; ignores auto-repeat. */
export function useActionKey(down: () => void, up?: () => void): void {
  useEffect(() => {
    const isKey = (e: KeyboardEvent) => e.code === 'Space' || e.code === 'Enter';
    const d = (e: KeyboardEvent) => {
      if (!isKey(e)) return;
      e.preventDefault();
      if (!e.repeat) down();
    };
    const u = (e: KeyboardEvent) => {
      if (!isKey(e) || !up) return;
      e.preventDefault();
      up();
    };
    document.addEventListener('keydown', d);
    document.addEventListener('keyup', u);
    return () => {
      document.removeEventListener('keydown', d);
      document.removeEventListener('keyup', u);
    };
  }, [down, up]);
}
