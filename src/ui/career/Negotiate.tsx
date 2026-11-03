import { useState } from 'react';
import { CLAUSES, attitude, clauseCost, gate, mood, propose, roundsLeft, signOffer, willingness, type Career, type Proposal } from '../../career';
import { fmtDay } from '../../career/dates';
import { CONTRACT_MONTHS } from '../../career/tuning';
import { commit, Head, money, Screen, useToast, useWords } from './parts';

interface Props { c: Career; offerId: string; onBack: () => void; onDone: () => void }

const MOOD: Record<string, [string, string]> = { keen: ['Keen', 'c-eff up'], happy: ['Happy with it', 'c-eff up'], hesitant: ['Hesitant', 'c-eff gold'], losing: ['Losing interest', 'c-eff bad'] };

/** Negotiate a contract clause by clause: fee, length and ten clauses, against their patience. */
export function Negotiate({ c, offerId, onBack, onDone }: Props) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const o = c.offers.find((x) => x.id === offerId);
  const [p, setP] = useState<Proposal>(() => ({ fee: o?.fee ?? 0, months: o?.months ?? 12, clauses: [...(o?.clauses ?? [])] }));
  if (!o) return null;
  const base = willingness(c, o.promo, o.id);
  const m = mood(c, o, p);
  const open = o.status === 'open';
  const accepted = open && o.said.startsWith('“Done');
  const setTier = (i: number, d: number) => {
    const t = Math.max(0, Math.min(3, (p.clauses[i] ?? 0) + d));
    if (d > 0 && gate(c, o.promo, i, t)) return say(gate(c, o.promo, i, t)!);
    setP({ ...p, clauses: p.clauses.map((x, k) => (k === i ? t : x)) });
  };
  const submit = () => {
    const r = propose(c, o, p);
    if (r === 'counter') setP({ fee: o.fee, months: o.months, clauses: [...o.clauses] });
    commit();
  };
  const sign = () => {
    signOffer(c, o);
    commit();
    onDone();
  };

  return (
    <Screen>
      <Head title={skin === 'paper' ? `At the Table: ${o.promo}` : `NEGOTIATE · ${o.promo}`} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-start" style={{ marginTop: 10 }}>
        <div className="c-rowsb"><span className="c-lab">{w(`${o.promo} said`)}</span><span className="c-hint">{open ? `${roundsLeft(o)} ${roundsLeft(o) === 1 ? 'round' : 'rounds'} left` : o.status}</span></div>
        <span className="c-val">{o.said}</span>
        <div className="c-rowsb"><span className="c-lab">{w('How it’s going')}</span><b className={MOOD[m]![1]}>{w(MOOD[m]![0])}</b></div>
      </div>
      <div className="c-body">
        <div className="c-trow"><span className="c-lab">{w('Fee')}</span><b className="c-big">{money(p.fee)} {w('a match', '/ match')}</b>
          <button className="c-stepb" onClick={() => setP({ ...p, fee: Math.max(50, p.fee - 50) })}>−</button><button className="c-stepb" onClick={() => setP({ ...p, fee: p.fee + 50 })}>+</button></div>
        <span className="c-lab">{w('Length')}</span>
        <div className="c-modes" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {CONTRACT_MONTHS.map((n) => <button key={n} className={p.months === n ? 'c-mode on' : 'c-mode'} style={{ minHeight: 40 }} onClick={() => setP({ ...p, months: n })}><b>{n} {w('mo')}</b></button>)}
        </div>
        <span className="c-sec">{w('The ten clauses', 'Clauses')}</span>
        {CLAUSES.map((cl, i) => {
          const t = p.clauses[i] ?? 0;
          const att = attitude(o.promo, i);
          const g3 = t >= 2 ? gate(c, o.promo, i, 3) : null;
          return (
            <div key={cl.id} className={t ? 'c-ccard on' : 'c-ccard'}>
              <div className="c-crow2">
                <b className="c-at">{cl.name}</b>
                <button className="c-stepb" onClick={() => setTier(i, -1)} aria-label={`Lower ${cl.name}`}>−</button>
                <span className="c-pips">{[1, 2, 3].map((k) => <i key={k} className={k <= t ? 'c-pip on' : gate(c, o.promo, i, k) ? 'c-pip lock' : 'c-pip'} />)}</span>
                <button className="c-stepb" onClick={() => setTier(i, 1)} aria-label={`Raise ${cl.name}`}>+</button>
              </div>
              <span className="c-ad">{t ? `${w('Tier', 'T')} ${t} · ${cl.tiers[t - 1]}` : cl.none}</span>
              <span className="c-effs">
                <span className={att === 'resist' ? 'c-eff dn' : att === 'flexible' ? 'c-eff up' : 'c-eff'}>{w(att === 'resist' ? 'They resist' : att === 'flexible' ? 'They’re flexible' : 'Neutral')}</span>
                <span className="c-eff">{t ? `Costs them ~${money(clauseCost(o.promo, base, i, t))} a match` : w('Costs nothing')}</span>
                {g3 && <span className="c-eff bad">{g3}</span>}
              </span>
            </div>
          );
        })}
        <span className="c-note">Starts {fmtDay(o.start, 'long')}. Every clause tier costs them something; push too far and they walk.</span>
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onBack}>{w(open ? 'Walk away' : '‹ Back')}</button>
        {accepted ? <button className="c-b1" onClick={sign}>{w(`Sign with ${o.promo}`)}</button>
          : <button className="c-b1" disabled={!open} onClick={submit}>{w('Put it to them', 'Submit')}</button>}
      </div>
      {toast}
    </Screen>
  );
}
