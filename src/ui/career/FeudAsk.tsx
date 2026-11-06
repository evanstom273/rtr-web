import { useState } from 'react';
import { ASKABLE, askForSegment, canAsk, feudLine, rivalOf } from '../../career/feuds';
import { SEG_LABEL } from '../../career/card';
import { FEATURES } from '../../career/tuning';
import type { Career, Show } from '../../career/types';
import { findWrestler } from '../../data/rtr';
import { commit, useWords } from './parts';

/** In a feud with someone on this show's promotion: ask for a segment with them (or why you can't). */
export function FeudAsk({ c, show, say, title = true }: { c: Career; show: Show; say: (s: string) => void; title?: boolean }) {
  const { w } = useWords();
  const [, bump] = useState(0);
  if (!FEATURES.feuds2) return null;
  const { f, why } = canAsk(c, show);
  if (!f) return null;
  const rival = findWrestler(rivalOf(c, f))?.name ?? 'them';
  return (
    <div className="c-live" style={{ marginTop: 8 }}>
      {title && <span className="c-lab">{w('Your feud')} · {feudLine(c, f)}</span>}
      {why ? <span className="c-ad">{why}</span> : (
        <>
          <span className="c-ad">Ask for a segment with {rival} on {show.name}:</span>
          <span className="c-chips" style={{ marginTop: 4 }}>
            {ASKABLE.map((k) => <button key={k} className="c-chip" onClick={() => { say(askForSegment(c, show, k)); commit(); bump((n) => n + 1); }}>{SEG_LABEL[k]}</button>)}
          </span>
        </>
      )}
    </div>
  );
}
