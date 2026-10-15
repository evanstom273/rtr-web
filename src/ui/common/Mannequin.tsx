import { useEffect, useRef, useState } from 'react';
import type { BodyPart, HP, Part } from '../../engine';
import { hpColor } from '../format';

interface Props {
  hp: HP;
  /** Highlighted focus part (player's target focus on the opponent). */
  focus?: Part;
  /** Parts the currently previewed move would hit. */
  preview?: readonly BodyPart[];
  onPick?: (p: BodyPart) => void;
  className?: string;
}

const SHAPES: { part: BodyPart; el: (p: Record<string, unknown>) => JSX.Element }[] = [
  { part: 'HEAD', el: (p) => <circle cx="24" cy="10" r="8" {...p} /> },
  { part: 'BODY', el: (p) => <rect x="15" y="20" width="18" height="26" rx="5" {...p} /> },
  // Viewer's left = wrestler's right (they face you).
  { part: 'RIGHT_ARM', el: (p) => <rect x="5" y="21" width="8" height="25" rx="3.5" {...p} /> },
  { part: 'LEFT_ARM', el: (p) => <rect x="35" y="21" width="8" height="25" rx="3.5" {...p} /> },
  { part: 'RIGHT_LEG', el: (p) => <rect x="15.5" y="48" width="8" height="30" rx="3.5" {...p} /> },
  { part: 'LEFT_LEG', el: (p) => <rect x="24.5" y="48" width="8" height="30" rx="3.5" {...p} /> },
];

/** Six-part body diagram. Parts flash when they take damage. */
export function Mannequin({ hp, focus = 'NONE', preview, onPick, className = '' }: Props) {
  const prev = useRef(hp);
  const [hit, setHit] = useState<Partial<Record<BodyPart, number>>>({});
  useEffect(() => {
    const changed: Partial<Record<BodyPart, number>> = {};
    let any = false;
    for (const { part } of SHAPES) {
      if (hp[part] < prev.current[part] - 0.5) {
        changed[part] = Date.now();
        any = true;
      }
    }
    prev.current = hp;
    if (any) setHit((h) => ({ ...h, ...changed }));
  }, [hp]);

  return (
    <svg className={`mannequin ${onPick ? 'pickable' : ''} ${className}`} viewBox="0 0 48 80" role={onPick ? 'group' : 'img'} aria-label="Body damage">
      {SHAPES.map(({ part, el }) => {
        const cls = ['bp', focus === part ? 'focus' : '', preview?.includes(part) ? 'pv' : ''].join(' ');
        return (
          <g key={part + (hit[part] ?? 0)} className={hit[part] ? 'bp-hit' : ''}>
            {el({
              className: cls,
              style: { fill: hpColor(hp[part]) },
              onClick: onPick ? () => onPick(part) : undefined,
            })}
          </g>
        );
      })}
    </svg>
  );
}
