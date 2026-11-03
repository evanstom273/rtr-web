import type { Career, Entry } from '../../career';
import { fmtDay } from '../../career/dates';
import { Head, money, Screen, useWords } from './parts';

interface Props { c: Career; onBack: () => void }

const KINDS: [Entry['kind'][], string][] = [
  [['fee', 'bonus'], 'Match fees'], [['merch'], 'Merch'], [['travel'], 'Travel'], [['training'], 'Training'], [['medical'], 'Medical'], [['buyout'], 'Buyouts'], [['start'], 'Starting money'],
];

/** Career → Finances: the bank, this month, and every pound in and out. */
export function Finances({ c, onBack }: Props) {
  const { skin, w } = useWords();
  const month = c.today.slice(0, 7);
  const thisMonth = c.ledger.filter((e) => e.day.startsWith(month) && e.kind !== 'start');
  const inM = thisMonth.filter((e) => e.amount > 0).reduce((t, e) => t + e.amount, 0);
  const outM = -thisMonth.filter((e) => e.amount < 0).reduce((t, e) => t + e.amount, 0);
  const amt = (v: number) => ({ v: `${v > 0 ? '+' : ''}${money(v)}`, c: v > 0 ? 'c-amt pos' : v < 0 ? 'c-amt neg' : 'c-amt' });
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'The Books' : 'FINANCES'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <div className="c-start">
          <span className="c-lab">{w('In the bank')}</span>
          <b className="c-sbig" style={{ fontSize: 34 }}>{money(c.money)}</b>
          <div className="c-facts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <span className="c-fact"><span className="c-lab">{w('In this month')}</span><b className="c-amt pos">{money(inM)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Out this month')}</span><b className="c-amt neg">{money(outM)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Net')}</span><b className={amt(inM - outM).c}>{amt(inM - outM).v}</b></span>
          </div>
        </div>
        <span className="c-sec">{w('Since you started', 'Since day one')}</span>
        <div className="c-kv">
          {KINDS.map(([kinds, label]) => {
            const es = c.ledger.filter((e) => kinds.includes(e.kind));
            const a = amt(es.reduce((t, e) => t + e.amount, 0));
            return <span key={label} style={{ display: 'contents' }}><span className="c-lab">{w(label)}</span><span className="c-val"><span className={a.c}>{a.v}</span> <span className="c-hint">{es.length ? `${es.length} ${es.length === 1 ? 'entry' : 'entries'}` : ''}</span></span></span>;
          })}
        </div>
        <span className="c-sec">{w('The ledger', 'Ledger')}</span>
        {c.ledger.length === 0 && <span className="c-note">Nothing yet.</span>}
        {c.ledger.map((e, i) => {
          const a = amt(e.amount);
          return <div key={i} className="c-led"><span className="c-hint">{fmtDay(e.day, 'dm')}</span><span className="c-val">{e.text}</span><b className={a.c}>{a.v}</b></div>;
        })}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
    </Screen>
  );
}
