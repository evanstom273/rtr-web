import { useMemo, useState } from 'react';
import { PROMOTIONS, TITLES, WRESTLERS, getMove, titlesHeldBy } from '../../data/rtr';
import { person, promoName, type Career } from '../../career';
import { ATTR_KEYS, ATTR_LONG, CLASS_NAME } from '../../career/create';
import { fmtDay } from '../../career/dates';
import { Head, money, Nm, Screen, useWords } from './parts';

interface Props { c: Career; onBack: () => void; onMoveset: () => void; onNewCareer: () => void }

const ORDER = ['VWF', 'TCG', 'NWGP', 'ZWA', 'SLN', 'END', 'IVW', 'SSWC', 'UFC', 'AAWA', 'TIS'];

/** Records (the database): every promotion, champion and wrestler as the world stands. Read only, except your own moveset. */
export function Records({ c, onBack, onMoveset, onNewCareer }: Props) {
  const { skin, w } = useWords();
  const mine = WRESTLERS.find((x) => x.id === c.player)!;
  const [pi, setPi] = useState(() => Math.max(0, ORDER.indexOf(mine.promotion)));
  const [sel, setSel] = useState<string | null>(null);
  const promo = PROMOTIONS.find((p) => p.initials === ORDER[pi])!;
  const roster = useMemo(() => WRESTLERS.filter((x) => x.promotion === promo.initials)
    .sort((a, b) => Number(titlesHeldBy(b).length > 0) - Number(titlesHeldBy(a).length > 0) || b.popularity.global - a.popularity.global), [promo, c.today]);
  const champs = promo.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t) => t?.holder);
  const x = sel ? WRESTLERS.find((y) => y.id === sel) : undefined;
  const xp = x ? person(c, x.id) : undefined;
  const best = x ? Math.max(...ATTR_KEYS.map((k) => x.stats[k])) : 0;
  const tis = promo.initials === 'TIS';
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Records' : 'DATABASE'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-cyc" style={{ marginTop: 10 }}>
        <button className="c-stepb" onClick={() => setPi((pi + ORDER.length - 1) % ORDER.length)} aria-label="Previous promotion" style={{ minHeight: 52 }}>‹</button>
        <div className="c-fld mid" style={{ minHeight: 52 }}><b className="c-big" style={{ fontSize: 20 }}>{tis ? w('The Indie Scene') : promo.initials}</b><span className="c-hint">{tis ? 'Free agents' : promo.name} · {roster.length} wrestlers</span></div>
        <button className="c-stepb" onClick={() => setPi((pi + 1) % ORDER.length)} aria-label="Next promotion" style={{ minHeight: 52 }}>›</button>
      </div>
      <div className="c-body">
        <span className="c-sec">{w('The champions', 'Champions')}</span>
        {champs.map((t) => <div key={t!.id} className="c-rowsb"><span className="c-lab">{t!.name}</span><Nm id={t!.holder!} /></div>)}
        <div className="c-rowsb"><span className="c-sec c-grow">{w('The roster', 'Roster')}</span><span className="c-hint">{roster.length}</span></div>
        {roster.map((y) => (
          <button key={y.id} className={y.id === c.player ? 'c-ans on' : 'c-ans'} onClick={() => setSel(y.id)} style={{ padding: '7px 10px' }}>
            <span className="c-rowsb"><Nm w={y} /><span className="c-hint">pop {Math.round(y.popularity.global)}</span></span>
            <span className="c-ad">{y.gimmick} · {y.classes.map((k) => CLASS_NAME[k]).join(' · ')} · {y.country}{person(c, y.id).injury ? ' · injured' : ''}</span>
          </button>
        ))}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={() => { setPi(Math.max(0, ORDER.indexOf(mine.promotion))); setSel(mine.id); }}>{w('Find me')}</button></div>
      {x && xp && (
        <div className="c-ovl">
          <div className="c-top"><button className="c-back" onClick={() => setSel(null)} aria-label="Back to the roster">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'Profile' : 'PROFILE'}</div><span className="c-meta">{x.promotion}</span></div>
          <div className="c-mast">Profile</div>
          <div className="c-who">
            <div className="c-ini">{x.name.replace(/"[^"]*"\s*/g, '').split(' ').map((s) => s[0]).join('').slice(0, 2)}</div>
            <div className="c-whot">
              <span className="c-tag">{x.classes.map((k) => CLASS_NAME[k]).join(' · ')}</span>
              <Nm w={x} cls="c-nm" />
              <span className="c-sub"><i>{x.gimmick}</i> · {x.age} · {x.country}</span>
              <span className="c-status">{x.promotion === 'TIS' ? 'Free agent' : `Signed to ${x.promotion}${xp.contract ? ` to ${fmtDay(xp.contract.end, 'dm')} ${xp.contract.end.slice(0, 4)}` : ''}`}{xp.injury ? ` · injured to ${fmtDay(xp.injury.until, 'dm')}` : ''}</span>
            </div>
          </div>
          <div className="c-body">
            {titlesHeldBy(x).length > 0 && <div className="c-warn">Holds the {titlesHeldBy(x).map((t) => t.name).join(' and the ')}</div>}
            <span className="c-sec">{w('Attributes')}</span>
            {ATTR_KEYS.map((k, i) => <div key={k} className="c-frow" style={{ gridTemplateColumns: '90px minmax(0, 1fr) 28px' }}><span className="c-lab">{ATTR_LONG[i]}</span><span className="c-bar"><i className={x.stats[k] === best ? 'c-fill best' : 'c-fill'} style={{ width: `${x.stats[k]}%` }} /></span><b className="c-big">{x.stats[k]}</b></div>)}
            <div className="c-kv">
              <span className="c-lab">{w('Popularity')}</span><span className="c-val">Global {Math.round(x.popularity.global)}</span>
              <span className="c-lab">{w('Reputation')}</span><span className="c-val">{Math.round(xp.rep)}</span>
              <span className="c-lab">{w('Finishers')}</span><span className="c-val">{x.finishers.map((id) => getMove(id).name).join(', ')}</span>
              <span className="c-lab">{w('Signatures')}</span><span className="c-val">{x.signatures.map((id) => getMove(id).name).join(', ')}</span>
              {x.id === c.player && <><span className="c-lab">{w('Bank')}</span><span className="c-val">{money(c.money)}</span></>}
              {xp.contract && x.id !== c.player && <><span className="c-lab">{w('Contract')}</span><span className="c-val">{promoName(xp.contract.promo)}</span></>}
            </div>
          </div>
          <div className="c-nav">
            <button className="c-b2" onClick={() => setSel(null)}>{w('‹ Back')}</button>
            {x.id === c.player ? <button className="c-b1" onClick={onMoveset}>{w('Edit your moveset ›', 'Edit moveset ›')}</button> : <button className="c-b1" disabled>{w('Read only')}</button>}
          </div>
        </div>
      )}
      <button className="c-b3" style={{ marginTop: 6, minHeight: 36 }} onClick={onNewCareer}>{w('Start a new career…')}</button>
    </Screen>
  );
}
