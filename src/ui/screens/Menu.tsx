import type { MatchRecord } from '../record';
import { fmtWhen, recordTitle } from '../record';
import { useSkin } from '../skin';
import { starText } from '../model';
import { fmtClock } from '../../engine';

interface Props {
  latest: MatchRecord | null;
  count: number;
  best: number;
  onPlay: () => void;
  onCareer: () => void;
  career: string | null;
  onArchive: () => void;
  onSettings: () => void;
  onOpen: (id: string) => void;
}

const LABELS = {
  paper: { career: 'The career', play: 'Make a match', archive: 'The archive', db: 'The records office', settings: 'Settings' },
  broadcast: { career: 'Career', play: 'Play a match', archive: 'Match archive', db: 'Database', settings: 'Settings' },
  building: { career: 'Career', play: 'Play a match', archive: 'Archive', db: 'Database', settings: 'Settings' },
};

/** The front door. One menu, dressed per skin: a front page, an opening title card, the big screen. */
export function Menu({ latest, count, best, onPlay, onCareer, career, onArchive, onSettings, onOpen }: Props) {
  const skin = useSkin();
  const L = LABELS[skin];
  const archiveSub = count ? `${count} ${count === 1 ? 'match' : 'matches'}${best ? ` · best ${best}★` : ''}` : 'Nothing on file yet';
  const lastLine = latest ? `${latest.how}${latest.t ? `, ${fmtClock(latest.t)}` : ''}${latest.venue ? ` · ${latest.venue}` : ''}` : '';
  const items = [
    { id: 'career', label: L.career, sub: career ?? 'Pick a wrestler or create one, and start on the calendar', page: 'P. 1', on: onCareer },
    { id: 'play', label: L.play, sub: 'Pick two, pick the rules, ring the bell', page: 'P. 2', on: onPlay },
    { id: 'archive', label: L.archive, sub: archiveSub, page: 'P. 3', on: onArchive },
    { id: 'db', label: L.db, sub: 'Coming soon: wrestlers, moves, titles, promotions', page: 'P. 4', on: undefined },
    { id: 'settings', label: L.settings, sub: 'Change the look', page: 'P. 5', on: onSettings },
  ];
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();
  return (
    <section id="menu" className={`menu mn-${skin}`}>
      <div className="mn-in">
        {skin === 'paper' && (
          <header className="mn-head">
            <div className="pp-dateline">
              <span>Vol. 1 · No. {count + 1}</span>
              <span>{today}</span>
            </div>
            <h1 className="mn-mast">The Ringside Report</h1>
            <div className="mn-strip">
              <i>Rise to Relevance</i>
              <span>400 on the roster</span>
            </div>
            {latest && (
              <button className="mn-lead" onClick={() => onOpen(latest.id)}>
                <span className="mn-kick">Last time out · {starText(latest.stars)}</span>
                <b>{recordTitle(latest)}</b>
                <i>{lastLine}. Full report inside.</i>
              </button>
            )}
          </header>
        )}
        {skin === 'broadcast' && (
          <header className="mn-head">
            <div className="mn-onair">
              <i />
              On air
              <span>400 wrestlers · 11 stipulations</span>
            </div>
            <div className="mn-title">
              <span className="mn-tonight">Tonight on</span>
              <h1>
                Rise to
                <br />
                Relevance
              </h1>
              <span className="mn-ropes">
                <i />
                <i />
              </span>
            </div>
          </header>
        )}
        {skin === 'building' && (
          <header className="mn-head">
            <div className="bl-frame">
              <div className="bl-screen mn-screen">
                <span className="bl-kick">Live tonight</span>
                <h1>
                  Rise to
                  <br />
                  Relevance
                </h1>
                <span className="bl-sub">400 wrestlers · 11 stipulations</span>
              </div>
            </div>
          </header>
        )}
        <nav className="mn-nav" aria-label="Main menu">
          {items.map((x) => (
            <button key={x.id} className={`mn-item ${x.id}`} onClick={x.on} disabled={!x.on}>
              <span className="mn-t">
                <b>{x.label}</b>
                <small>{x.sub}</small>
              </span>
              {skin === 'paper' ? <span className="mn-page">{x.page}</span> : <span className="mn-arrow" aria-hidden>›</span>}
            </button>
          ))}
        </nav>
        {latest && skin !== 'paper' && (
          <button className="mn-last" onClick={() => onOpen(latest.id)}>
            <span className="mn-kick">{skin === 'building' ? 'At the desk · last time out' : 'Last time out'}</span>
            <b>
              {recordTitle(latest)} · {latest.stars}★
            </b>
            <small>
              {lastLine} · {fmtWhen(latest.at)}
            </small>
          </button>
        )}
        {skin === 'paper' && <p className="mn-foot">All the news that's fit to pin</p>}
      </div>
    </section>
  );
}
