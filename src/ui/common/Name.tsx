import type { Wrestler } from '../../data/rtr';
import type { SideKey } from '../../engine';
import { displayName, nameTone } from '../format';

/** Side marker: the player is a circle, the AI a diamond. */
export function SideMark({ side, size = 10 }: { side: SideKey; size?: number }) {
  return (
    <svg className={`smark ${side}`} width={size} height={size} viewBox="0 0 10 10" aria-label={side === 'you' ? 'You' : 'Opponent'}>
      {side === 'you' ? <circle cx="5" cy="5" r="4.2" /> : <path d="M5 .6 9.4 5 5 9.4 .6 5Z" />}
    </svg>
  );
}

export function Name({ w, side, className = '' }: { w: Wrestler; side?: SideKey; className?: string }) {
  return (
    <span className={`wname ${nameTone(w)} ${className}`}>
      {side && <SideMark side={side} />}
      {displayName(w)}
    </span>
  );
}
