import { useState } from 'react';
import { BONUS_TRIGGERS, CHARACTER, dealsOf, exitTerms, holidays, matchPay, PACKAGES, person, promoName, tierOf, type Career } from '../../career';
import { daysBetween, fmtDay } from '../../career/dates';
import { LOSS_CUT_BY_TIER } from '../../career/tuning';
import { ClauseGroups, Pips } from './Clauses';
import { Head, money, Screen, useWords } from './parts';

interface Props { c: Career; onBack: () => void }

/** Career → Contract: your deal (or deals), its 25 clauses in five sections, what you're owed, and the ways out. */
export function Contract({ c, onBack }: Props) {
  const { skin, w } = useWords();
  const p = person(c, c.player);
  const deals = dealsOf(p);
  const [tab, setTab] = useState(0);
  const k = deals[Math.min(tab, deals.length - 1)];
  if (!k) {
    return (
      <Screen>
        <Head title={skin === 'paper' ? 'Your Terms' : 'CONTRACT'} meta={w(fmtDay(c.today))} onBack={onBack} />
        <div className="c-body">
          <div className="c-start"><span className="c-lab">{w('No contract')}</span><b className="c-sbig">{w('Free agent')}</b><span className="c-val">You’re on The Indie Scene. Contract offers arrive by letter once promotions notice you.</span></div>
          {p.next && <div className="c-start"><span className="c-lab">{w('Signed, starting soon')}</span><b className="c-sbig">{promoName(p.next.promo)}</b><span className="c-val">From {fmtDay(p.next.start, 'long')} at {money(p.next.fee)} a match.</span></div>}
          {p.noCompete && p.noCompete.until > c.today && <span className="c-note">Your non-compete with {p.noCompete.promo} runs to {fmtDay(p.noCompete.until, 'long')}: their region’s other majors can’t sign you till then.</span>}
        </div>
        <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
      </Screen>
    );
  }
  const left = daysBetween(c.today, k.end);
  const exit = exitTerms(c, k.promo);
  const g = tierOf(k, 'guaranteed');
  const tierLoss = LOSS_CUT_BY_TIER[g]!;
  const fees = [
    [w('Weekly TV'), money(matchPay(k, 'weekly', false).pay)], [w('Tour'), money(matchPay(k, 'tour', false).pay)],
    [w('Special'), money(matchPay(k, 'special', false).pay)], [w('Flagship'), money(matchPay(k, 'flagship', false).pay)],
    [w('If you lose'), tierLoss ? `−${Math.round(tierLoss * 100)}%${g ? ' (Partial Guarantee)' : ' (no Guaranteed Pay)'}` : 'Full fee (Guaranteed Pay)'],
    [w('Dates a month'), k.dates ? `${k.dates} agreed` : 'The booker’s call'],
  ];
  const hol = holidays(c, k.promo);
  const promises = [
    k.titleShotBy ? `A title match by ${fmtDay(k.titleShotBy, 'long')}.` : '',
    k.rematch ? `A rematch by ${fmtDay(k.rematch.by, 'long')}.` : '',
    k.leaving ? `You’ve given notice: you leave on ${fmtDay(k.leaving, 'long')}.` : '',
    k.advance ? `You owe them ${money(k.advance)} (an advance), out of your fees.` : '',
    k.breaches ? `They’ve broken ${k.breaches} promise${k.breaches === 1 ? '' : 's'}${k.breachExit ? ': you can walk away free' : ''}.` : '',
    hol.allowed ? `${hol.allowed - hol.used} of ${hol.allowed} holiday weeks left this contract year.` : '',
    k.optioned ? 'Option year taken.' : '',
    k.walk ? 'You’ve said you’ll let it run out.' : '',
    p.legend === k.promo ? `You’re a ${k.promo} legend.` : '',
    p.next ? `Signed with ${p.next.promo} from ${fmtDay(p.next.start, 'long')}.` : '',
  ].filter(Boolean);
  const ch = CHARACTER[k.promo];
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Your Terms' : 'CONTRACT'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        {deals.length > 1 && (
          <div className="c-chips">{deals.map((d, i) => <button key={d.promo} className={`c-chip${i === tab ? ' on' : ''}`} onClick={() => setTab(i)}>{d.promo}{d.dates ? ` · ${d.dates}/mo` : ''}</button>)}</div>
        )}
        <div className="c-start">
          <span className="c-lab">{w(deals.length > 1 ? (tab === 0 ? 'Signed to (main deal)' : 'Signed to (as well)') : 'Signed to')}</span>
          <b className="c-sbig">{promoName(k.promo)}</b>
          {k.pkg && <span className="c-val">{PACKAGES[k.pkg].name}</span>}
          <div className="c-facts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <span className="c-fact"><span className="c-lab">{w('Signed')}</span><b>{fmtDay(k.start, 'dm')} {k.start.slice(0, 4)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Ends')}</span><b>{fmtDay(k.end, 'dm')} {k.end.slice(0, 4)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Left')}</span><b>{left > 60 ? `${Math.round(left / 30.4)} months` : `${left} days`}</b></span>
          </div>
        </div>
        {ch && <span className="c-note"><b>{ch.style}.</b> {ch.blurb}</span>}
        <span className="c-sec">{w('Your fee', 'Fee per match')}</span>
        <div className="c-kv">{fees.map(([a, b]) => <span key={a} style={{ display: 'contents' }}><span className="c-lab">{a}</span><span className="c-val">{b}</span></span>)}</div>
        <div className="c-rowsb"><span className="c-sec c-grow">{w('The clauses', 'Clauses')}</span><span className="c-hint">{k.clauses.filter(Boolean).length} of {k.clauses.length} in your contract</span></div>
        <ClauseGroups tiers={k.clauses} row={(cl, i) => {
          const t = k.clauses[i] ?? 0;
          return (
            <div className={t ? 'c-ccard on' : 'c-ccard dis'}>
              <div className="c-rowsb"><b className="c-at">{cl.name}</b><Pips t={t} /></div>
              <span className="c-ad">{t ? `${w('Tier', 'T')} ${t} · ${cl.tiers[t - 1]}` : cl.none}</span>
              {cl.id === 'bonuses' && t > 0 && <span className="c-hint">Pays for: {(k.triggers ?? []).map((x) => BONUS_TRIGGERS.find((b) => b.id === x)?.name).filter(Boolean).join(', ') || 'nothing picked'}</span>}
            </div>
          );
        }} />
        <span className="c-note">Holiday weeks, part-time, tours, your option year, retirement and leaving are all under Requests › Your contract. Creative Control has its own screen there too.</span>
        <span className="c-sec">{w('Promises', 'Obligations')}</span>
        {promises.length ? promises.map((x) => <span key={x} className="c-note">{x}</span>) : <span className="c-note">Nothing owed either way right now.</span>}
        <span className="c-sec">{w('Getting out', 'Exit')}</span>
        <span className="c-note">{exit.text}</span>
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
    </Screen>
  );
}
