import type { Career, PlayerMatch } from '../../career';
import { fmtDay } from '../../career/dates';
import { Head, Screen, stars, useWords } from './parts';

interface Props { c: Career; onBack: () => void; onHistory: () => void }

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;

/** Career → Statistics, from the match stats the engine keeps for every match you wrestle. */
export function Stats({ c, onBack, onHistory }: Props) {
  const { skin, w } = useWords();
  const H = c.history;
  const W = H.filter((m) => m.result === 'win').length, L = H.filter((m) => m.result === 'loss').length;
  const avg = H.length ? H.reduce((t, m) => t + m.stars, 0) / H.length : 0;
  const titles = Object.values(c.titles).flatMap((t) => t.reigns.filter((r) => r.holder === c.player)).length;
  const by = (f: (m: PlayerMatch) => boolean) => {
    const xs = H.filter(f);
    return `${xs.filter((m) => m.result === 'win').length}–${xs.filter((m) => m.result === 'loss').length}${xs.length ? ` · ${stars(Math.round((xs.reduce((t, m) => t + m.stars, 0) / xs.length) * 4) / 4)}` : ''}`;
  };
  const finish = (f: string) => `${H.filter((m) => m.finish === f && m.result === 'win').length} · ${H.filter((m) => m.finish === f && m.result === 'loss').length}`;
  const sum = (k: keyof NonNullable<PlayerMatch['stats']>) => H.reduce((t, m) => t + (m.stats?.[k] ?? 0), 0);
  const rate = (l: string, a: number, b: number) => ({ l, v: `${a}/${b}`, w: b ? `${Math.round((a / b) * 100)}%` : '0%' });
  const rates = [
    rate('Moves landed', sum('movesLanded'), sum('movesTried')), rate('Finishers hit', sum('finHit'), sum('finTried')), rate('Signatures hit', sum('sigHit'), sum('sigTried')),
    rate('Reversals won', sum('reversalWins'), sum('reversalTries')), rate('Pins that won', H.filter((m) => m.result === 'win' && m.finish === 'PINFALL').length, sum('pinTries')),
  ];
  const opps = new Map<string, { n: string; w: number; l: number }>();
  for (const m of H) {
    const o = opps.get(m.opp) ?? { n: m.oppName, w: 0, l: 0 };
    if (m.result === 'win') o.w++; else if (m.result === 'loss') o.l++;
    opps.set(m.opp, o);
  }
  const top = [...opps.values()].sort((a, b) => b.w + b.l - (a.w + a.l)).slice(0, 4);
  const bestM = [...H].sort((a, b) => b.stars - a.stars)[0];
  const times = H.map((m) => m.t);
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'By the Numbers' : 'STATISTICS'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <div className="c-statg">
          {[[`${W}–${L}`, 'Record'], [H.length ? `${Math.round((W / H.length) * 100)}%` : '—', 'Win rate'], [H.length ? stars(Math.round(avg * 10) / 10) : '—', 'Average']].map(([v, l]) => (
            <div key={l} className="c-statc"><b className="c-sbig" style={{ fontSize: 26 }}>{v}</b><span className="c-lab">{w(l!)}</span></div>
          ))}
        </div>
        <div className="c-statg">
          {[[String(H.length), 'Matches'], [String(H.filter((m) => m.title).length), 'Title shots'], [String(titles), 'Titles won']].map(([v, l]) => (
            <div key={l} className="c-statc"><b className="c-sbig" style={{ fontSize: 22 }}>{v}</b><span className="c-lab">{w(l!)}</span></div>
          ))}
        </div>
        <span className="c-sec">{w('How they ended')}</span>
        <div className="c-kv">
          {[['Pinfall', finish('PINFALL')], ['Submission', finish('SUBMISSION')], ['Count-out', finish('COUNT_OUT')], ['DQ', finish('DISQUALIFICATION')], ['Longest', times.length ? clock(Math.max(...times)) : '—'], ['Shortest', times.length ? clock(Math.min(...times)) : '—']].map(([l, v]) => (
            <span key={l} style={{ display: 'contents' }}><span className="c-lab">{w(l!)}</span><span className="c-val">{v}</span></span>
          ))}
        </div>
        <span className="c-sec">{w('In the ring')}</span>
        {rates.map((r) => <div key={r.l} className="c-frow" style={{ gridTemplateColumns: '110px minmax(0, 1fr) 58px' }}><span className="c-lab">{w(r.l)}</span><span className="c-bar"><i className="c-fill" style={{ width: r.w }} /></span><b className="c-num">{r.v}</b></div>)}
        <span className="c-sec">{w('By show')}</span>
        <div className="c-kv">
          {[['Weekly TV', by((m) => m.kind === 'weekly' && !m.title)], ['Specials', by((m) => (m.kind === 'special' || m.kind === 'flagship') && !m.title)], ['Title matches', by((m) => !!m.title)], ['Indie dates', by((m) => m.indie)]].map(([l, v]) => (
            <span key={l} style={{ display: 'contents' }}><span className="c-lab">{w(l!)}</span><span className="c-val">{v}</span></span>
          ))}
        </div>
        <span className="c-sec">{w('Who you’ve faced', 'Opponents')}</span>
        <div className="c-kv">{top.length ? top.map((o) => <span key={o.n} style={{ display: 'contents' }}><span className="c-lab">{w(o.n)}</span><span className="c-val">{o.w}–{o.l}</span></span>) : <span className="c-note">Nobody yet.</span>}</div>
        <span className="c-sec">{w('Best match')}</span>
        {bestM ? <div className="c-ccard on"><b className="c-cname">{bestM.result === 'win' ? 'Beat' : bestM.result === 'loss' ? 'Lost to' : 'Drew with'} {bestM.oppName} · {stars(bestM.stars)}</b><span className="c-ad">{bestM.showName}, {fmtDay(bestM.day, 'dm')} · {clock(bestM.t)}{bestM.move ? ` · ${bestM.move}` : ''}</span></div> : <span className="c-note">Still to come.</span>}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onHistory}>{w('History ›')}</button></div>
    </Screen>
  );
}
