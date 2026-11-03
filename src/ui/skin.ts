import { useSyncExternalStore } from 'react';
import { store } from '../storage/storage';

/**
 * The look of the game. Three skins over one set of screens: the logic (what to show, what you can
 * press) is shared, each skin only decides how it's drawn. Kept between visits, unlike the builder.
 */
export type Skin = 'paper' | 'broadcast' | 'building';

export const SKINS: { id: Skin; name: string; blurb: string }[] = [
  { id: 'paper', name: 'Ringside paper', blurb: 'Newsprint. Headlines, box scores and a review in the morning edition.' },
  { id: 'broadcast', name: 'Broadcast', blurb: 'The TV show. Score bug, lower thirds and commentary captions.' },
  { id: 'building', name: 'The building', blurb: 'Being there. The ring, the big screen, steel and the commentary desk.' },
];

const KEY = 'rtr-skin';
const isSkin = (x: unknown): x is Skin => x === 'paper' || x === 'broadcast' || x === 'building';

let current: Skin = (() => {
  const saved = store.get<unknown>(KEY, 'paper');
  return isSkin(saved) ? saved : 'paper';
})();
const subs = new Set<() => void>();

function apply(s: Skin): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.skin = s;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', s === 'paper' ? '#f1ead8' : s === 'broadcast' ? '#07080d' : '#050508');
}
apply(current);

export function setSkin(s: Skin): void {
  if (s === current) return;
  current = s;
  store.set(KEY, s);
  apply(s);
  subs.forEach((f) => f());
}

export function useSkin(): Skin {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
    () => current,
  );
}
