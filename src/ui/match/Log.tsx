import { useLayoutEffect, useRef } from 'react';
import { fmtClock, type LogEntry, type Seg } from '../../engine';

function Segment({ s }: { s: Seg }) {
  switch (s.k) {
    case 'text': return <>{s.v}</>;
    case 'name': return <b className={`nm ${s.side}`}>{s.v}</b>;
    case 'move': return <em>{s.v}</em>;
    case 'gold': return <span className={s.big ? 'gold big' : 'gold'}>{s.v}</span>;
    case 'chant': return <span className="ch">{s.v}</span>;
  }
}

const lineClass = (c: LogEntry['cls']) => (c === 'crowd' ? 'crowdln' : c);

export function Log({ entries }: { entries: readonly LogEntry[] }) {
  const box = useRef<HTMLDivElement>(null);
  const n = entries.length;
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => {
      if (box.current) box.current.scrollTop = box.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [n]);
  return (
    <div id="log" ref={box} aria-live="polite">
      <div>
        {entries.map((l) => (
          <div key={l.id} className={`ln ${lineClass(l.cls)}`}>
            <span className="ts">{fmtClock(l.t)}</span>
            <span className="tx">
              {l.segs.map((s, i) => (
                <Segment key={i} s={s} />
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
