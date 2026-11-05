import { clamp, fmtClock, ironMen, type MatchState, type Rating } from '../../engine';
import type { Hit } from '../../storage/greatestHits';
import { Name } from '../common/Name';
import { GreatestHits } from '../GreatestHits';
import { FINISH_LABEL, report, starText, surname, type Report } from '../model';
import { useSkin } from '../skin';

interface Props {
  S: MatchState;
  rating: Rating;
  hits: Hit[];
  onRematch: () => void;
  onNewMatch: () => void;
  onMenu: () => void;
  /** Career matches: one button, back to the career. */
  onCareer?: () => void;
}

/** More than two people: the winning side, and who went out how (and, in a Rumble, the iron men). */
function Field({ S }: { S: MatchState }) {
  const R = S.result!;
  const winners = (R.winners ?? []).map((k) => S.sides[k]!.w.name);
  const im = S.entries ? ironMen(S) : null;
  return (
    <div className="rp-field">
      {winners.length > 1 && <p className="rp-winner">Winners: {winners.join(' & ')}</p>}
      {S.elims.length > 0 && (
        <>
          <span className="fs-h">Order of elimination</span>
          <ol className="rp-elims">
            {S.elims.map((e) => (
              <li key={e.k}>
                <b>{S.sides[e.k]!.w.name}</b> · {FINISH_LABEL[e.finish] ?? e.finish}{e.by ? ` by ${S.sides[e.by]!.w.name}` : ''} · {fmtClock(e.t)}
              </li>
            ))}
          </ol>
        </>
      )}
      {im?.longest && (
        <p className="mk-note">
          Iron man: {S.sides[im.longest]!.w.name} ({fmtClock(im.secs)}){im.most ? ` · Most eliminations: ${S.sides[im.most]!.w.name} (${im.elims})` : ''}
        </p>
      )}
    </div>
  );
}

/** The match report. One model (the result, the rating, the headline), three dresses. */
export function Result({ S, rating, hits, onRematch, onNewMatch, onMenu, onCareer }: Props) {
  const skin = useSkin();
  const r = report(S, rating);
  if (!r) return null;
  const Body = skin === 'paper' ? PaperReport : skin === 'broadcast' ? BroadcastReport : BuildingReport;
  return (
    <section id="result" className={`report r-${skin}`}>
      <div className="wrap">
        <Body r={r} S={S} />
        {S.order.length > 2 && <Field S={S} />}
        <div className="ractions">
          {onCareer ? (
            <button className="primary" onClick={onCareer}>
              Back to your career
            </button>
          ) : (
            <>
          <button className="primary" onClick={onRematch}>
            Rematch
          </button>
          <button className="ghost" onClick={onNewMatch}>
            New match
          </button>
          <button className="ghost" onClick={onMenu}>
            Main menu
          </button>
            </>
          )}
        </div>
        <div className="hits">
          <GreatestHits hits={hits} title="Your greatest hits" />
        </div>
      </div>
    </section>
  );
}

const winnerName = (r: Report) =>
  r.winner && r.winnerSide ? <Name w={r.winner} side={r.winnerSide} /> : <span>No winner</span>;

function BroadcastReport({ r, S }: { r: Report; S: MatchState }) {
  const lost = r.winnerSide === 'them' ? 'you' : 'them';
  return (
    <>
      <div className="bc-bug rp-bug">
        <div className={`bc-side you${r.winnerSide === 'you' ? ' won' : ''}`}>
          <i className="bc-chip" />
          <span className="bc-nm">{surname(S.you.w)}{r.winnerSide === 'you' ? ' ✓' : ''}</span>
        </div>
        <span className="bc-clock rp-final">
          Final
          <small>{r.time}</small>
        </span>
        <div className={`bc-side them${r.winnerSide === 'them' ? ' won' : ''}`}>
          <i className="bc-chip" />
          <span className="bc-nm">{r.winnerSide === 'them' ? '✓ ' : ''}{surname(S.them.w)}</span>
        </div>
      </div>
      <div className={`moment rp-lower by-${r.winnerSide ?? lost}`}>
        <span className="mo-kick">{r.winner ? 'Winner' : 'Result'} · {r.how}</span>
        <span className="mo-big long">{r.winner ? r.winner.name : r.headline}</span>
        {r.falls && <span className="mo-deck">{r.falls}</span>}
      </div>
      <div className="rp-score">
        <div className="rp-stars">
          <b>{r.rating.stars}</b>
          <small>Stars</small>
        </div>
        <div>
          <h2>{r.rating.label}</h2>
          <p>{r.rating.verdict}</p>
        </div>
      </div>
      <div className="rp-parts">
        {r.parts.map((p) => (
          <div key={p.l} className={`rp-part g-${p.grade}`}>
            <span className="rp-g">
              {p.l}
              <b>{p.grade}</b>
            </span>
            <span className="rp-n">{p.n}</span>
          </div>
        ))}
      </div>
      <p className="recap">{r.rating.recap}</p>
    </>
  );
}

function PaperReport({ r }: { r: Report; S: MatchState }) {
  return (
    <>
      <div className="pp-dateline">
        <span>Morning edition</span>
        <span>Final · {r.time}</span>
      </div>
      <div className="pp-mast">The Ringside Report</div>
      <div className="pp-rule" />
      <p className="rp-kick">
        {r.winner && r.loser ? `${surname(r.winner)} def. ${surname(r.loser)}` : 'No decision'} · {r.how}
        {r.falls ? ` · ${r.falls}` : ''}
      </p>
      <h1 className="rp-head">{r.headline}</h1>
      <p className="rp-deck">{r.rating.recap}</p>
      <div className="rp-verdict">
        <div className="rp-stamp">
          <small>Our rating</small>
          <b>{starText(r.rating.stars)}</b>
        </div>
        <div>
          <h2>{r.rating.label}</h2>
          <p>{r.rating.verdict}</p>
        </div>
      </div>
      <div className="rp-review">
        <span className="pp-lab">The review</span>
        {r.parts.map((p) => (
          <div key={p.l} className="rp-line">
            <b>{p.l}</b>
            <span>{p.n}</span>
          </div>
        ))}
      </div>
      <p className="rp-winner">Winner: {winnerName(r)}</p>
    </>
  );
}

const LEDS = 12;

function BuildingReport({ r }: { r: Report; S: MatchState }) {
  const full = Math.floor(r.rating.stars), half = r.rating.stars - full >= 0.5;
  return (
    <>
      <div className="bl-frame">
        <div className="bl-screen rp-screen">
          <span className="bl-kick">{r.winner ? 'Winner' : 'Result'} · {r.time}</span>
          <b className={`rp-win ${r.winnerSide ?? ''}`}>{r.winner ? r.winner.name : r.headline}</b>
          <span className="bl-sub">{r.how}{r.falls ? ` · ${r.falls}` : ''}</span>
          <span className="rp-ledstars" role="img" aria-label={`${r.rating.stars} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} className={i < full ? 'on' : i === full && half ? 'half' : ''}>★</i>
            ))}
          </span>
          <span className="rp-label">{r.rating.label}</span>
        </div>
      </div>
      <div className="bl-plate rp-plate">
        {r.parts.map((p) => {
          const lit = Math.round(clamp(p.v, 0, 1) * LEDS);
          return (
            <div key={p.l} className="rp-meter">
              <div className="rp-mh">
                <b>{p.l}</b>
                <span>{p.n}</span>
              </div>
              <span className="bl-leds wide">
                {Array.from({ length: LEDS }, (_, i) => (
                  <i key={i} className={i < lit ? (i >= 9 ? 'on hot' : 'on') : ''} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
      <div className="bl-desk">
        <span className="desk-lab">At the desk</span>
        <p>{r.rating.verdict}</p>
        <p className="mute">{r.rating.recap}</p>
      </div>
      <p className="rp-winner">Winner: {winnerName(r)}</p>
    </>
  );
}
