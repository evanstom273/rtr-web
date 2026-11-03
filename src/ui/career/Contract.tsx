import { C, CLAUSES, exitTerms, matchPay, person, promoName, type Career } from '../../career';
import { daysBetween, fmtDay } from '../../career/dates';
import { LOSS_CUT_BY_TIER } from '../../career/tuning';
import { Head, money, Screen, useWords } from './parts';

interface Props { c: Career; onBack: () => void }

/** Career → Contract: your deal, its ten clauses, what you're owed, and the ways out. */
export function Contract({ c, onBack }: Props) {
  const { skin, w } = useWords();
  const p = person(c, c.player);
  const k = p.contract;
  if (!k) {
    return (
      <Screen>
        <Head title={skin === 'paper' ? 'Your Terms' : 'CONTRACT'} meta={w(fmtDay(c.today))} onBack={onBack} />
        <div className="c-body">
          <div className="c-start"><span className="c-lab">{w('No contract')}</span><b className="c-sbig">{w('Free agent')}</b><span className="c-val">You’re on The Indie Scene. Contract offers arrive by letter once promotions notice you.</span></div>
          {p.next && <div className="c-start"><span className="c-lab">{w('Signed, starting soon')}</span><b className="c-sbig">{promoName(p.next.promo)}</b><span className="c-val">From {fmtDay(p.next.start, 'long')} at {money(p.next.fee)} a match.</span></div>}
        </div>
        <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
      </Screen>
    );
  }
  const left = daysBetween(c.today, k.end);
  const exit = exitTerms(c);
  const tierLoss = LOSS_CUT_BY_TIER[k.clauses[C.guaranteed] ?? 0]!;
  const fees = [
    [w('Weekly TV'), money(matchPay(k, 'weekly', false).pay)], [w('Tour'), money(matchPay(k, 'tour', false).pay)],
    [w('Special'), money(matchPay(k, 'special', false).pay)], [w('Flagship'), money(matchPay(k, 'flagship', false).pay)],
    [w('If you lose'), tierLoss ? `−${Math.round(tierLoss * 100)}%${(k.clauses[C.guaranteed] ?? 0) ? ' (Partial Guarantee)' : ' (no Guaranteed Pay)'}` : 'Full fee (Guaranteed Pay)'],
  ];
  const promises = [
    k.titleShotBy ? `A title match by ${fmtDay(k.titleShotBy, 'long')}.` : '',
    k.leaving ? `You’ve given notice: you leave on ${fmtDay(k.leaving, 'long')}.` : '',
    p.next ? `Signed with ${p.next.promo} from ${fmtDay(p.next.start, 'long')}.` : '',
  ].filter(Boolean);
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Your Terms' : 'CONTRACT'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <div className="c-start">
          <span className="c-lab">{w('Signed to')}</span>
          <b className="c-sbig">{promoName(k.promo)}</b>
          <div className="c-facts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <span className="c-fact"><span className="c-lab">{w('Signed')}</span><b>{fmtDay(k.start, 'dm')} {k.start.slice(0, 4)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Ends')}</span><b>{fmtDay(k.end, 'dm')} {k.end.slice(0, 4)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Left')}</span><b>{left > 60 ? `${Math.round(left / 30.4)} months` : `${left} days`}</b></span>
          </div>
        </div>
        <span className="c-sec">{w('Your fee', 'Fee per match')}</span>
        <div className="c-kv">{fees.map(([a, b]) => <span key={a} style={{ display: 'contents' }}><span className="c-lab">{a}</span><span className="c-val">{b}</span></span>)}</div>
        <div className="c-rowsb"><span className="c-sec c-grow">{w('The clauses', 'Clauses')}</span><span className="c-hint">{k.clauses.filter(Boolean).length} of 10 in your contract</span></div>
        {CLAUSES.map((cl, i) => {
          const t = k.clauses[i] ?? 0;
          return (
            <div key={cl.id} className={t ? 'c-ccard on' : 'c-ccard dis'}>
              <div className="c-rowsb"><b className="c-at">{cl.name}</b><span className="c-pips">{[1, 2, 3].map((n) => <i key={n} className={n <= t ? 'c-pip on' : 'c-pip'} />)}</span></div>
              <span className="c-ad">{t ? `${w('Tier', 'T')} ${t} · ${cl.tiers[t - 1]}` : cl.none}</span>
            </div>
          );
        })}
        <span className="c-sec">{w('Promises', 'Obligations')}</span>
        {promises.length ? promises.map((x) => <span key={x} className="c-note">{x}</span>) : <span className="c-note">Nothing owed either way right now.</span>}
        <span className="c-sec">{w('Getting out', 'Exit')}</span>
        <span className="c-note">{exit.text}</span>
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
    </Screen>
  );
}
