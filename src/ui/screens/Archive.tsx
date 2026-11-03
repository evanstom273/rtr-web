import { useMemo, useState } from 'react';
import { fmtClock } from '../../engine';
import { downloadFile } from '../../storage/zip';
import { buzz } from '../format';
import { starText } from '../model';
import { fmtWhen, recordsZip, recordTitle, type MatchRecord } from '../record';
import { useSkin } from '../skin';

type Sort = 'newest' | 'best' | 'longest';

interface Props {
  records: MatchRecord[] | null;
  temporary: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
}

const stamp = () => {
  const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Every match on file: sort, tick, download as a zip. */
export function Archive({ records, temporary, onBack, onOpen }: Props) {
  const skin = useSkin();
  const [sort, setSort] = useState<Sort>('newest');
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const list = useMemo(() => {
    const xs = [...(records ?? [])];
    if (sort === 'best') xs.sort((a, b) => b.stars - a.stars || b.at - a.at);
    else if (sort === 'longest') xs.sort((a, b) => b.t - a.t || b.at - a.at);
    return xs;
  }, [records, sort]);
  const toggle = (id: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const all = list.length > 0 && sel.size === list.length;
  const download = (rs: MatchRecord[]) => {
    if (!rs.length) return;
    buzz();
    downloadFile(`rtr-matches-${stamp()}-${rs.length}.zip`, recordsZip(rs));
  };
  const n = sel.size;
  const paper = skin === 'paper';
  return (
    <section id="archive" className={`archive ar-${skin}`}>
      <div className="ar-in">
        <header className="ar-head">
          <button className="ar-back" onClick={onBack} aria-label="Back to the main menu">
            {paper ? '‹ Front page' : '‹'}
          </button>
          <h1>{paper ? 'The Archive' : 'Match archive'}</h1>
          <span className="ar-count">{records ? `${records.length} on file` : 'Loading…'}</span>
        </header>
        {temporary && <p className="ar-warn">This browser won't let the game keep matches, so the archive only lasts until you close it.</p>}
        <div className="ar-tools">
          {(['newest', 'best', 'longest'] as Sort[]).map((x) => (
            <button key={x} className={`ar-sort${sort === x ? ' on' : ''}`} aria-pressed={sort === x} onClick={() => setSort(x)}>
              {x}
            </button>
          ))}
          <button className="ar-all" onClick={() => setSel(all ? new Set() : new Set(list.map((r) => r.id)))}>
            {all ? 'Clear' : 'Select all'}
          </button>
        </div>
        <ul className="ar-list">
          {list.map((r) => {
            const on = sel.has(r.id);
            return (
              <li key={r.id} className={`ar-row${on ? ' on' : ''}${r.stars >= 4 ? ' hot' : ''}`}>
                <label className="ar-tick">
                  <input type="checkbox" checked={on} onChange={() => toggle(r.id)} aria-label={`Select ${recordTitle(r)}`} />
                </label>
                <span className="ar-stars" aria-label={`${r.stars} stars`}>
                  {paper ? starText(r.stars) : r.stars}
                  {!paper && <small>stars</small>}
                </span>
                <button className="ar-open" onClick={() => onOpen(r.id)}>
                  <b>{recordTitle(r)}</b>
                  <span>
                    {r.how}
                    {r.t ? ` · ${fmtClock(r.t)}` : ''}
                  </span>
                  <small>
                    {fmtWhen(r.at)} · {r.stipulation}
                    {r.venue ? ` · ${r.venue}` : ''}
                  </small>
                </button>
              </li>
            );
          })}
          {records && !list.length && <li className="ar-empty">No matches on file yet. Play one and it lands here.</li>}
        </ul>
        <div className="ar-actions">
          <button className="ghost ar-dl-all" onClick={() => download(list)} disabled={!list.length}>
            Download all
          </button>
          <button className="primary ar-dl" onClick={() => download(list.filter((r) => sel.has(r.id)))} disabled={!n}>
            {n ? `Download ${n}` : 'Tick some to download'}
            {n > 0 && <small>.zip: text and data</small>}
          </button>
        </div>
      </div>
    </section>
  );
}
