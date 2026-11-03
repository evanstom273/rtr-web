import { useState } from 'react';
import { findWrestler } from '../../data/rtr';
import { attributeTotal, showsOn, spend, trainingPrice, type Career } from '../../career';
import { ATTR_KEYS, ATTR_LONG } from '../../career/create';
import { addDays, fmtDay } from '../../career/dates';
import { ATTRIBUTE_CAP } from '../../career/tuning';
import { commit, Head, money, Screen, useWords } from './parts';

interface Props { c: Career; onBack: () => void; onMoveset: () => void }

/** What `n` more points cost from an attribute total: the price climbs with every point, whichever it goes on. */
export function costOf(total: number, n: number): number {
  let t = 0;
  for (let k = 0; k < n; k++) t += trainingPrice(total + k);
  return t;
}

/**
 * Training: line up points with + and −, see what they cost and what's left in the bank, then
 * Confirm. Nothing changes until you do. Elden Ring's level curve sets the price; shut on booked days.
 */
export function Training({ c, onBack, onMoveset }: Props) {
  const { skin, w } = useWords();
  const me = findWrestler(c.player)!;
  const [pending, setPending] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [done, setDone] = useState<string | null>(null);
  const total = attributeTotal(me);
  const n = pending.reduce((a, b) => a + b, 0);
  const cost = costOf(total, n);
  const next = trainingPrice(total + n);
  const after = c.money - cost;
  const booked = showsOn(c, c.today).some((s) => s.card?.some((b) => b.a === c.player || b.b === c.player)) || Object.keys(c.indie).some((id) => c.shows[id]?.date === c.today);
  const vals = ATTR_KEYS.map((k) => me.stats[k]);
  const best = Math.max(...vals.map((v, i) => v + pending[i]!));
  let nextDate: string | null = null;
  for (let i = 1; i < 60 && !nextDate; i++) {
    const d = addDays(c.today, i);
    const s = showsOn(c, d).find((x) => x.card?.some((b) => b.a === c.player || b.b === c.player) || c.indie[x.id]);
    if (s) nextDate = `${fmtDay(d, 'dm')}, ${s.name}`;
  }
  const canAdd = (i: number) => !booked && after >= next && vals[i]! + pending[i]! < ATTRIBUTE_CAP;
  const bump = (i: number, d: number) => {
    if (d > 0 && !canAdd(i)) return;
    if (d < 0 && pending[i]! <= 0) return;
    setDone(null);
    setPending(pending.map((p, k) => (k === i ? p + d : p)));
  };
  const confirm = () => {
    if (!n || booked || after < 0) return;
    const parts: string[] = [];
    ATTR_KEYS.forEach((k, i) => {
      if (!pending[i]) return;
      me.stats[k] += pending[i]!;
      parts.push(`+${pending[i]} ${ATTR_LONG[i]}`);
    });
    spend(c, -cost, `Training · ${parts.join(', ')}`, 'training');
    setDone(`${parts.join(', ')} for ${money(cost)}.`);
    setPending([0, 0, 0, 0, 0, 0]);
    commit();
  };
  const ladder = [1, 2, 3, 5, 10].map((k) => ({ l: k === 1 ? 'Next 1' : `Next ${k}`, v: `${money(costOf(total + n, k))}${k === 1 ? '' : ` · ${w('last one', 'last')} ${money(trainingPrice(total + n + k - 1))}`}` }));

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'The Gym' : 'TRAINING'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <div className="c-start">
          <div className="c-facts">
            <span className="c-fact"><span className="c-lab">{w('Bank')}</span><b>{money(c.money)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Lined up')}</span><b>{n ? `+${n}` : '0'}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Costs')}</span><b>{money(cost)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Bank after')}</span><b className={after < 0 ? 'c-amt neg' : ''}>{money(after)}</b></span>
          </div>
          <span className="c-val">
            {booked ? 'You’re booked today, so the gym’s shut. Come back on a free day.' : `No booking today, so the gym’s open.${nextDate ? ` Next date: ${nextDate}.` : ''}`}
            {' '}Total {total}{n ? ` → ${total + n}` : ''} · next point {money(next)}.
          </span>
        </div>
        <div className="c-rowsb"><span className="c-sec c-grow">{w('Attributes')}</span><span className="c-hint">{w('Same price for any')}</span></div>
        {ATTR_KEYS.map((k, i) => {
          const v = vals[i]!, p = pending[i]!;
          return (
            <div key={k} className="c-trow" style={{ gridTemplateColumns: '76px minmax(0, 1fr) 54px 36px 36px' }}>
              <span className="c-lab">{ATTR_LONG[i]}</span>
              <span className="c-bar" style={{ position: 'relative' }}>
                <i className={v + p === best ? 'c-fill best' : 'c-fill'} style={{ width: `${v}%` }} />
                {p > 0 && <i className="c-fill best" style={{ position: 'absolute', top: 0, left: `${v}%`, width: `${p}%`, opacity: 0.55 }} />}
              </span>
              <b className="c-big" style={{ whiteSpace: 'nowrap' }}>{v}{p ? <span className="c-eff up" style={{ marginLeft: 4 }}>+{p}</span> : null}</b>
              <button className="c-stepb" onClick={() => bump(i, -1)} disabled={!p} aria-label={`One less ${ATTR_LONG[i]}`}>−</button>
              <button className="c-plus" onClick={() => bump(i, 1)} disabled={!canAdd(i)} aria-label={`One more ${ATTR_LONG[i]}`}>+</button>
            </div>
          );
        })}
        <span className="c-note">Every point makes the next one dearer, whichever attribute it goes on. Nothing’s paid for until you confirm.</span>
        <span className="c-sec">{w('What the next points cost', 'Price ladder')}</span>
        <div className="c-kv">{ladder.map((r) => <span key={r.l} style={{ display: 'contents' }}><span className="c-lab">{w(r.l)}</span><span className="c-val">{r.v}</span></span>)}</div>
        {done && <div className="c-start"><span className="c-lab">{w('Trained')}</span><span className="c-val">{done}</span></div>}
        <button className="c-b3" onClick={onMoveset}>{w('Edit your moveset ›', 'Edit moveset ›')}</button>
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={() => (n ? setPending([0, 0, 0, 0, 0, 0]) : onBack())}>{n ? w('Clear') : w('‹ Back')}</button>
        <button className="c-b1" onClick={confirm} disabled={!n || booked || after < 0}>{n ? w(`Confirm · ${money(cost)}`) : w('Nothing lined up')}</button>
      </div>
    </Screen>
  );
}
