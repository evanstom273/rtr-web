import { clamp, fmtClock, type MatchState, type Rating } from '../../engine';
import type { Hit } from '../../storage/greatestHits';
import { Name } from '../common/Name';
import { GreatestHits } from '../GreatestHits';
import { Ropes } from '../Ropes';

function Stars({ x }: { x: number }) {
  const full = Math.floor(x), fr = x - full;
  const fc = fr >= 0.74 ? '¾' : fr >= 0.49 ? '½' : fr >= 0.24 ? '¼' : '';
  return (
    <>
      {'★'.repeat(full)}
      {fc && <span>{fc}</span>}
      <span className="off">{'★'.repeat(Math.max(0, 5 - full - (fc ? 1 : 0)))}</span>
    </>
  );
}

const FINISH: Record<string, string> = { PINFALL: 'Pinfall', SUBMISSION: 'Submission', COUNT_OUT: 'Count-out', DOUBLE_COUNT_OUT: 'Double count-out' };

interface Props {
  S: MatchState;
  rating: Rating;
  hits: Hit[];
  onRematch: () => void;
  onNewMatch: () => void;
}

export function Result({ S, rating: r, hits, onRematch, onNewMatch }: Props) {
  const R = S.result;
  if (!R) return null;
  return (
    <section id="result">
      <div className="wrap">
        <p className="eyebrow">{r.label}</p>
        <div className="stars">
          <Stars x={r.stars} />
        </div>
        <p className="rnum">
          {r.stars} out of 5{r.raw >= 5.5 ? ' (and change)' : ''}
        </p>
        <h2 id="rLine">
          {R.winner && R.loser ? (
            <>
              <Name w={S[R.winner].w} side={R.winner} /> def. <Name w={S[R.loser].w} side={R.loser} />
            </>
          ) : (
            <>
              <Name w={S.you.w} side="you" /> and <Name w={S.them.w} side="them" /> — no contest
            </>
          )}
        </h2>
        <p className="verdict">
          {FINISH[R.finish]}
          {R.move ? `, ${R.move.name}` : ''}, {fmtClock(R.t)}. {r.verdict}
        </p>
        <Ropes />
        <div className="break">
          {r.parts.map((p) => (
            <div className="br" key={p.l}>
              <span className="br-l">{p.l}</span>
              <span className="br-t">
                <i style={{ width: `${Math.round(clamp(p.v, 0.03, 1) * 100)}%` }} />
              </span>
              <span className="br-n">{p.n}</span>
            </div>
          ))}
        </div>
        <p className="recap">{r.recap}</p>
        <div className="ractions">
          <button className="primary" onClick={onRematch}>
            Rematch
          </button>
          <button className="ghost" onClick={onNewMatch}>
            New match
          </button>
        </div>
        <div className="hits">
          <GreatestHits hits={hits} title="Your greatest hits" />
        </div>
      </div>
    </section>
  );
}
