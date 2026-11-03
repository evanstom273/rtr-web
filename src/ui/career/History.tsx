import { useState } from 'react';
import { TITLES, findWrestler } from '../../data/rtr';
import { promoName, type Career } from '../../career';
import { fmtDay } from '../../career/dates';
import { activeWorld } from '../../world/world';
import { reignsOf } from '../../world/history';
import { Head, Nm, Screen, stars, useWords } from './parts';

interface Props { c: Career; onBack: () => void; onStats: () => void }

/** Career → History: every match, every title, every promotion. */
export function History({ c, onBack, onStats }: Props) {
  const { skin, w } = useWords();
  const [tab, setTab] = useState(0);
  const tabs = ['Matches', 'Titles', 'Promotions'];
  const reigns = reignsOf(activeWorld().history, c.player).map((r) => ({ id: r.title, ...r }));
  const titleMatches = c.history.filter((m) => m.title);
  // Promotions you've worked for, in order, from your matches (plus where you are now).
  const stints: { promo: string; from: string; to: string }[] = [];
  for (const m of [...c.history].reverse()) {
    const promo = m.indie ? 'TIS' : m.promo;
    const last = stints[stints.length - 1];
    if (last && last.promo === promo) last.to = m.day;
    else stints.push({ promo, from: m.day, to: m.day });
  }
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'The Story So Far' : 'CAREER HISTORY'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-steps cols3" style={{ marginTop: 10 }}>
        {tabs.map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t)}</button>)}
      </div>
      <div className="c-body">
        {tab === 0 && (c.history.length ? c.history.map((m, i) => (
          <div key={i} className="c-led" style={{ gridTemplateColumns: '54px minmax(0, 1fr) auto' }}>
            <span className="c-hint">{fmtDay(m.day, 'dm')}</span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="c-vs"><span className={m.result === 'win' ? 'c-eff up' : m.result === 'loss' ? 'c-eff dn' : 'c-eff'}>{w(m.result === 'win' ? 'beat' : m.result === 'loss' ? 'lost to' : 'drew')}</span>{findWrestler(m.opp) ? <Nm id={m.opp} /> : <span className="c-nl">{m.oppName}</span>}</span>
              <span className="c-hint">{m.showName}{m.title ? ` · ${TITLES.find((t) => t.id === m.title)?.name}` : ''}{m.planned === 'off-script' ? ' · off-script' : ''}</span>
            </span>
            <b className="c-big" style={{ fontSize: 16 }}>{stars(m.stars)}</b>
          </div>
        )) : <span className="c-note">No matches yet.</span>)}
        {tab === 1 && (
          <>
            {reigns.length ? reigns.map((r, i) => (
              <div key={i} className="c-ccard on"><b className="c-cname">{TITLES.find((t) => t.id === r.id)?.name}</b><span className="c-ad">{fmtDay(r.from, 'long')} → {r.to ? fmtDay(r.to, 'long') : 'now'} · {r.defences} {r.defences === 1 ? 'defence' : 'defences'}</span></div>
            )) : <div className="c-ph">No titles yet.</div>}
            <span className="c-sec">{w('Title matches')}</span>
            {titleMatches.length ? titleMatches.map((m, i) => (
              <div key={i} className="c-led" style={{ gridTemplateColumns: '54px minmax(0, 1fr) auto' }}>
                <span className="c-hint">{fmtDay(m.day, 'dm')}</span>
                <span className="c-val">{m.result === 'win' ? (m.wonTitle ? 'Won the' : 'Beat') : 'Lost to'} {m.wonTitle ? TITLES.find((t) => t.id === m.title)?.name : m.oppName}{m.wonTitle ? '' : ` for the ${TITLES.find((t) => t.id === m.title)?.name}`}, {m.showName}{m.planned ? ` (planned finish ${m.planned === 'kept' ? 'kept to' : 'ignored'})` : ''}</span>
                <b className="c-big" style={{ fontSize: 16 }}>{stars(m.stars)}</b>
              </div>
            )) : <span className="c-note">None yet.</span>}
          </>
        )}
        {tab === 2 && (
          <>
            {stints.length ? [...stints].reverse().map((s, i) => (
              <div key={i} className={i === 0 ? 'c-ccard on' : 'c-ccard'}><b className="c-cname">{s.promo === 'TIS' ? 'The Indie Scene' : promoName(s.promo)}</b><span className="c-ad">{fmtDay(s.from, 'long')} → {fmtDay(s.to, 'long')}</span></div>
            )) : <span className="c-note">Every promotion you work for, with dates, goes here.</span>}
          </>
        )}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onStats}>{w('Statistics ›')}</button></div>
    </Screen>
  );
}
