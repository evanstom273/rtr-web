import { useState } from 'react';
import { advanceAvailable, baseRegion, livingCost, shiftPay, takeAdvance, type Career, type Entry } from '../../career';
import { REGION_LABEL } from '../../career/places';
import { FEATURES, JOBS } from '../../career/tuning';
import { fmtDay } from '../../career/dates';
import { commit, Head, money, Screen, useToast, useWords } from './parts';

interface Props { c: Career; onBack: () => void }

const KINDS: [Entry['kind'][], string][] = [
  [['fee', 'bonus'], 'Match fees'], [['merch'], 'Merch'], [['event'], 'Appearances and events'], [['wage'], 'Wages'], [['travel'], 'Travel'], [['training'], 'Training'],
  [['medical'], 'Medical'], [['living'], 'Living costs'], [['relocation'], 'Moving'], [['company'], 'Your promotion'], [['buyout'], 'Buyouts'], [['start'], 'Starting money'],
];

/** Career → Finances: the bank, this month, and every pound in and out. */
export function Finances({ c, onBack }: Props) {
  const { skin, w } = useWords();
  const month = c.today.slice(0, 7);
  const thisMonth = c.ledger.filter((e) => e.day.startsWith(month) && e.kind !== 'start');
  const inM = thisMonth.filter((e) => e.amount > 0).reduce((t, e) => t + e.amount, 0);
  const outM = -thisMonth.filter((e) => e.amount < 0).reduce((t, e) => t + e.amount, 0);
  const amt = (v: number) => ({ v: `${v > 0 ? '+' : ''}${money(v)}`, c: v > 0 ? 'c-amt pos' : v < 0 ? 'c-amt neg' : 'c-amt' });
  const [toast, say] = useToast();
  const [, bump] = useState(0);
  // Signing Bonus & Advances: borrow against your fees when you're skint.
  const adv = advanceAvailable(c);
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
        {adv.k && (adv.amount > 0 || adv.owed > 0) && (
          <div className="c-kv">
            <span className="c-lab">{w('An advance')}</span>
            {adv.amount > 0
              ? <button className="c-ans" style={{ padding: '7px 10px' }} onClick={() => { say(takeAdvance(c)); commit(); bump((n) => n + 1); }}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{w(`Ask ${adv.k.promo} for ${money(adv.amount)}`)}</b><span className="c-eff gold">{w('Advance')}</span></span>
                  <span className="c-ad">You’d pay back {money(adv.owed)} out of your fees.</span>
                </button>
              : <span className="c-val">You owe {adv.k.promo} {money(adv.owed)}: it comes out of your fees.</span>}
          </div>
        )}
        {(FEATURES.livingCosts || c.job) && (
          <div className="c-kv">
            {FEATURES.livingCosts && <><span className="c-lab">{w('Living costs')}</span><span className="c-val">{money(livingCost(baseRegion(c)))} a week in {REGION_LABEL[baseRegion(c)]}, every Monday</span></>}
            {c.job && <><span className="c-lab">{w('Day job')}</span><span className="c-val">{JOBS[c.job.id].name} · {money(shiftPay(c, c.job.id))} a shift, paid Fridays</span></>}
          </div>
        )}
        <span className="c-sec">{w('Since you started', 'Since day one')}</span>
        <div className="c-kv">
          {KINDS.map(([kinds, label]) => {
            // Lifetime totals (the ledger itself keeps only the latest 400 entries).
            const sum = kinds.reduce((t, k) => {
              const x = c.totals?.[k];
              if (x) return { amount: t.amount + x.amount, n: t.n + x.n };
              const es = c.ledger.filter((e) => e.kind === k);
              return { amount: t.amount + es.reduce((u, e) => u + e.amount, 0), n: t.n + es.length };
            }, { amount: 0, n: 0 });
            if (!sum.n && !['fee', 'merch', 'travel', 'training', 'start'].includes(kinds[0]!)) return null;
            const a = amt(sum.amount);
            return <span key={label} style={{ display: 'contents' }}><span className="c-lab">{w(label)}</span><span className="c-val"><span className={a.c}>{a.v}</span> <span className="c-hint">{sum.n ? `${sum.n} ${sum.n === 1 ? 'entry' : 'entries'}` : ''}</span></span></span>;
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
      {toast}
    </Screen>
  );
}
