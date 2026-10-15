/*
 * Android back (the edge swipe, or the back button) inside the installed app. A PWA with one
 * history entry just closes on back, so each "layer" (a screen beyond the roster, an open sheet)
 * pushes a history entry and back pops the top layer instead.
 */
import { useEffect, useRef } from 'react';

interface Layer {
  onBack: () => boolean | void;
  /** Its history entry has already been consumed by a back press. */
  popped: boolean;
}

const stack: Layer[] = [];
/** Our own history.go(-n) traversals in flight, whose popstate we must ignore. */
let ownBacks = 0;
/** Entries to drop, batched into one go(-n) (two back() calls in a row can get merged). */
let toDrop = 0;
/** Pushes waiting for our own traversal to land first (otherwise it would pop them). */
let queued = 0;

function push() {
  if (ownBacks > 0 || toDrop > 0) queued++;
  else history.pushState({ rtr: true }, '');
}

function drop() {
  if (queued > 0) {
    // Its entry was never pushed.
    queued--;
    return;
  }
  if (toDrop++ > 0) return;
  queueMicrotask(() => {
    const n = toDrop;
    toDrop = 0;
    ownBacks++;
    history.go(-n);
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ownBacks > 0) {
      ownBacks--;
      if (ownBacks === 0) for (; queued > 0; queued--) history.pushState({ rtr: true }, '');
      return;
    }
    const top = stack[stack.length - 1];
    if (!top) return;
    // onBack returning true means "handled, but stay open" (e.g. a leave-the-match prompt).
    if (top.onBack() === true) history.pushState({ rtr: true }, '');
    else {
      top.popped = true;
      stack.pop();
    }
  });
}

/**
 * While `active`, back calls `onBack` instead of leaving. Return true from onBack to keep the
 * layer (and its guard) in place.
 */
export function useBackLayer(active: boolean, onBack: () => boolean | void): void {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active) return;
    const layer: Layer = { onBack: () => cb.current(), popped: false };
    stack.push(layer);
    push();
    return () => {
      const i = stack.indexOf(layer);
      if (i >= 0) stack.splice(i, 1);
      // Closed from the UI: drop its history entry so the next back goes to the layer below.
      if (!layer.popped) drop();
    };
  }, [active]);
}
