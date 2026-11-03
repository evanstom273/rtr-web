import { useState } from 'react';
import { findWrestler } from '../../data/rtr';
import { clamp, fmtClock } from '../../engine';
import { downloadFile } from '../../storage/zip';
import { nameTone } from '../format';
import { Segment } from '../match/Log';
import { grade, starText, surname } from '../model';
import { fileStem, fmtWhen, recordsZip, recordTitle, statRows, type MatchRecord } from '../record';
import { useSkin } from '../skin';

interface Props {
  r: MatchRecord;
  onBack: () => void;
  onDelete: () => void;
}

const sur = (name: string) => surname({ name } as never);

/** The crowd across the match: a line on paper and broadcast, LED bars in the building. */
function Crowd({ r, bars }: { r: MatchRecord; bars: boolean }) {
  const line = r.heat.line;
  if (!line.length) return null;
  if (bars) {
    const n = Math.min(32, line.length), per = line.length / n;
    const cols = Array.from({ length: n }, (_, i) => {
      const slice = line.slice(Math.floor(i * per), Math.max(Math.floor((i + 1) * per), Math.floor(i * per) + 1));
      return Math.max(...slice);
    });
    return (
      <div className="rc-bars" role="img" aria-label={`Crowd heat: average ${r.heat.avg}, peak ${r.heat.peak}`}>
        {cols.map((v, i) => (
          <i key={i} className={v >= 85 ? 'hot' : v >= 60 ? 'warm' : ''} style={{ height: `${Math.max(4, v)}%` }} />
        ))}
      </div>
    );
  }
  const W = 360, H = 70, step = line.length > 1 ? W / (line.length - 1) : W;
  const pts = line.map((v, i) => `${Math.round(i * step)},${Math.round(H - 2 - (clamp(v, 0, 100) / 100) * (H - 4))}`).join(' ');
  return (
    <svg className="rc-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Crowd heat: average ${r.heat.avg}, peak ${r.heat.peak}`}>
      <line x1="0" y1={H - 1} x2={W} y2={H - 1} />
      <polyline points={pts} />
    </svg>
  );
}

/** One match from the archive, in full. */
export function Record({ r, onBack, onDelete }: Props) {
  const skin = useSkin();
  const [confirm, setConfirm] = useState(false);
  const paper = skin === 'paper';
  const rows = statRows(r);
  const wy = findWrestler(r.you.id), wt = findWrestler(r.them.id);
  const tones = { you: wy ? nameTone(wy) : 'face', them: wt ? nameTone(wt) : 'heel' };
  const meta = `${fmtWhen(r.at)} · ${r.stipulation}${r.venue ? ` · ${r.venue}` : ''}`;
  const head = r.winnerName && r.loserName ? recordTitle(r) : `${sur(r.you.name)} vs ${sur(r.them.name)}`;
  return (
    <section id="record" className={`record rc-${skin}`}>
      <div className="rc-in">
        <header className="rc-top">
          <button className="ar-back" onClick={onBack} aria-label="Back to the archive">
            {paper ? '‹ The archive' : '‹'}
          </button>
          <span className="rc-meta">{meta}</span>
        </header>

        <div className="rc-result">
          {skin === 'broadcast' && (
            <>
              <div className="bc-bug rp-bug">
                <div className={`bc-side you${r.winner === 'you' ? ' won' : ''}`}>
                  <i className="bc-chip" />
                  <span className="bc-nm">{sur(r.you.name)}{r.winner === 'you' ? ' ✓' : ''}</span>
                </div>
                <span className="bc-clock rp-final">
                  Final
                  <small>{r.t ? fmtClock(r.t) : '–'}</small>
                </span>
                <div className={`bc-side them${r.winner === 'them' ? ' won' : ''}`}>
                  <i className="bc-chip" />
                  <span className="bc-nm">{r.winner === 'them' ? '✓ ' : ''}{sur(r.them.name)}</span>
                </div>
              </div>
              <div className="rp-score">
                <div className="rp-stars">
                  <b>{r.stars}</b>
                  <small>Stars</small>
                </div>
                <div>
                  <h2>{r.label || head}</h2>
                  <p>{r.how}{r.falls ? ` · ${r.falls}` : ''}</p>
                </div>
              </div>
            </>
          )}
          {skin === 'paper' && (
            <>
              <p className="rp-kick">{r.how}{r.falls ? ` · ${r.falls}` : ''}{r.t ? ` · ${fmtClock(r.t)}` : ''}</p>
              <h1 className="rp-head">{head}</h1>
              {r.recap && <p className="rp-deck">{r.recap}</p>}
              <div className="rp-verdict">
                <div className="rp-stamp">
                  <small>Our rating</small>
                  <b>{starText(r.stars)}</b>
                </div>
                <div>
                  <h2>{r.label || `${r.stars} stars`}</h2>
                  {r.verdict && <p>{r.verdict}</p>}
                </div>
              </div>
            </>
          )}
          {skin === 'building' && (
            <div className="bl-frame">
              <div className="bl-screen rp-screen">
                <span className="bl-kick">{r.winnerName ? 'Winner' : 'Result'}{r.t ? ` · ${fmtClock(r.t)}` : ''}</span>
                <b className={`rp-win ${r.winner ?? ''}`}>{r.winnerName ?? head}</b>
                <span className="bl-sub">{r.how}{r.loserName ? ` · over ${r.loserName}` : ''}</span>
                <span className="rp-ledstars" role="img" aria-label={`${r.stars} out of 5 stars`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <i key={i} className={i < Math.floor(r.stars) ? 'on' : i === Math.floor(r.stars) && r.stars % 1 >= 0.5 ? 'half' : ''}>★</i>
                  ))}
                </span>
                {r.label && <span className="rp-label">{r.label}</span>}
              </div>
            </div>
          )}
        </div>

        {r.legacy && <p className="rc-note">From before the archive: only the summary was kept, so there's no log or numbers for this one.</p>}

        {rows.length > 0 && (
          <section className="rc-sec">
            <h3 className="rc-h">{paper ? 'The box score' : 'By the numbers'}</h3>
            <table className="rc-stats">
              <thead>
                <tr>
                  <th scope="col" />
                  <th scope="col" className={`nm ${tones.you}`}>{sur(r.you.name)}</th>
                  <th scope="col" className={`nm ${tones.them}`}>{sur(r.them.name)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.label}>
                    <th scope="row">{x.label}</th>
                    <td className={x.edge === 'a' ? 'win' : ''}>{x.a}</td>
                    <td className={x.edge === 'b' ? 'win' : ''}>{x.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {r.heat.line.length > 0 && (
          <section className="rc-sec">
            <h3 className="rc-h">The crowd</h3>
            <div className="rc-crowd">
              <Crowd r={r} bars={skin === 'building'} />
              <p>
                Average {r.heat.avg} · peak {r.heat.peak}
              </p>
            </div>
          </section>
        )}

        {r.parts.length > 0 && (
          <section className="rc-sec">
            <h3 className="rc-h">{paper ? 'The review' : 'The rating'}</h3>
            <div className="rc-parts">
              {r.parts.map((p) => (
                <div key={p.l} className={`rc-part g-${grade(p.v)}`}>
                  <span className="rc-pl">
                    {p.l}
                    {!paper && <b>{grade(p.v)}</b>}
                  </span>
                  <span className="rc-pn">{p.n}</span>
                  {skin === 'building' && (
                    <span className="bl-leds wide">
                      {Array.from({ length: 12 }, (_, i) => (
                        <i key={i} className={i < Math.round(clamp(p.v, 0, 1) * 12) ? (i >= 9 ? 'on hot' : 'on') : ''} />
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {r.log.length > 0 && (
          <section className="rc-sec rc-logsec">
            <h3 className="rc-h">
              {paper ? 'Blow by blow, in full' : skin === 'building' ? 'At the desk: the full call' : 'The commentary'}
              <small>{r.log.length} lines</small>
            </h3>
            <ol className="rc-log">
              {r.log.map((l, i) => (
                <li key={i} className={`ln ${l.cls === 'crowd' ? 'crowdln' : l.cls}`}>
                  <span className="ts">{fmtClock(l.t)}</span>
                  <span className="tx">
                    {l.segs.map((s, j) => (
                      <Segment key={j} s={s} tones={tones} />
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="rc-actions">
          {confirm ? (
            <>
              <button className="ghost" onClick={() => setConfirm(false)}>
                Keep it
              </button>
              <button className="primary rc-del-yes" onClick={onDelete}>
                Delete for good
              </button>
            </>
          ) : (
            <>
              <button className="ghost rc-del" onClick={() => setConfirm(true)}>
                {paper ? 'Spike it' : 'Delete'}
              </button>
              <button className="primary" onClick={() => downloadFile(`${fileStem(r)}.zip`, recordsZip([r]))}>
                Download this match
                <small>{fileStem(r)}.zip</small>
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
