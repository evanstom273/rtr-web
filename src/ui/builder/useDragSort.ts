/*
 * Long-press drag and drop for the match builder, built on pointer events so it works the same
 * with a finger, a pen or a mouse.
 *
 * - Tap: onTap (open the profile).
 * - Touch: hold still for LONG_PRESS_MS to pick up; moving first means you're scrolling, so the
 *   press is dropped and the list scrolls as normal.
 * - Mouse: press and move a few pixels to pick up.
 * - Drop targets are elements with data-drop="A" | "B" | "roster"; rows inside a team carry
 *   data-drop-index so dropping on one inserts before it.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { buzz } from '../format';

export type TeamKey = 'A' | 'B';
export interface DragItem {
  id: string;
  from: 'roster' | TeamKey;
}
export interface DropTarget {
  zone: 'roster' | TeamKey;
  /** Insert before this index within the team; null = at the end. */
  index: number | null;
}
export interface DragState {
  item: DragItem;
  x: number;
  y: number;
  target: DropTarget | null;
}

const LONG_PRESS_MS = 380;
const SLOP_PX = 10;
const MOUSE_START_PX = 5;
const EDGE_PX = 56;

function targetAt(x: number, y: number): DropTarget | null {
  const el = document.elementFromPoint(x, y);
  const zone = el?.closest<HTMLElement>('[data-drop]');
  if (!zone) return null;
  const which = zone.dataset.drop as DropTarget['zone'];
  const row = el?.closest<HTMLElement>('[data-drop-index]');
  const index = row && zone.contains(row) ? Number(row.dataset.dropIndex) : null;
  return { zone: which, index };
}

export function useDragSort(onTap: (item: DragItem) => void, onDrop: (item: DragItem, target: DropTarget | null) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const active = useRef(false);
  const cb = useRef({ onTap, onDrop });
  cb.current = { onTap, onDrop };

  // Must exist before any touch starts: Chrome only lets a touchmove cancel scrolling if a
  // non-passive listener was already there when the finger landed. It only blocks mid-drag.
  useEffect(() => {
    const block = (e: TouchEvent) => {
      if (active.current && e.cancelable) e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, []);

  const press = useCallback((e: ReactPointerEvent, item: DragItem) => {
    if (e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY, mouse = e.pointerType === 'mouse';
    let moved = false, cancelled = false, x = startX, y = startY, raf = 0;
    let timer = 0;

    const begin = () => {
      if (cancelled || active.current) return;
      active.current = true;
      document.body.classList.add('dragging');
      buzz(15);
      setDrag({ item, x, y, target: targetAt(x, y) });
      // Auto-scroll whatever scrollable list you're holding near the edge of.
      const tick = () => {
        if (!active.current) return;
        const under = document.elementFromPoint(x, y);
        // Never scroll while you're over a team: you're trying to drop.
        let list = under?.closest('[data-drop="A"], [data-drop="B"]') ? null : under?.closest<HTMLElement>('[data-autoscroll]') ?? null;
        // The nearest one that actually scrolls.
        while (list && list.scrollHeight <= list.clientHeight + 1) list = list.parentElement?.closest<HTMLElement>('[data-autoscroll]') ?? null;
        if (list) {
          const r = list.getBoundingClientRect();
          const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
          if (y < top + EDGE_PX) list.scrollTop -= Math.ceil((top + EDGE_PX - y) / 6);
          else if (y > bottom - EDGE_PX && y < bottom) list.scrollTop += Math.ceil((y - (bottom - EDGE_PX)) / 6);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
    const end = () => {
      active.current = false;
      document.body.classList.remove('dragging');
      setDrag(null);
    };
    const move = (ev: PointerEvent) => {
      x = ev.clientX;
      y = ev.clientY;
      const dist = Math.hypot(x - startX, y - startY);
      if (!active.current) {
        if (dist > (mouse ? MOUSE_START_PX : SLOP_PX)) {
          moved = true;
          if (mouse) begin();
          else {
            // A finger moving before the hold completes is a scroll, not a pick-up.
            cancelled = true;
            cleanup();
          }
        }
        return;
      }
      setDrag((d) => (d ? { ...d, x, y, target: targetAt(x, y) } : d));
    };
    const up = (ev: PointerEvent) => {
      cleanup();
      if (active.current) {
        const target = targetAt(ev.clientX, ev.clientY);
        end();
        cb.current.onDrop(item, target);
      } else if (!moved && !cancelled) cb.current.onTap(item);
    };
    const cancel = () => {
      cleanup();
      if (active.current) end();
    };

    if (!mouse) timer = window.setTimeout(begin, LONG_PRESS_MS);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }, []);

  /** Spread onto anything that can be picked up. */
  const handle = useCallback(
    (item: DragItem) => ({
      onPointerDown: (e: ReactPointerEvent) => press(e, item),
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    }),
    [press],
  );

  return { drag, handle };
}
