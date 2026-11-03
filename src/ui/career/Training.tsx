import { useState } from 'react';
import { findWrestler } from '../../data/rtr';
import { attributeTotal, showsOn, spend, trainingPrice, type Career } from '../../career';
import { ATTR_KEYS, ATTR_LONG } from '../../career/create';
import { addDays, fmtDay } from '../../career/dates';
import { ATTRIBUTE_CAP } from '../../career/tuning';
import { commit, Head, money, Screen, useWords } from './parts';

interface Props { c: Career; onBack: () => void; onMoveset: () => void }

/** Training: buy +1 to any attribute; Elden Ring's level curve sets the price. Not on booked days. */
export function Training({ c, onBack, onMoveset }: Props) {
  const { skin, w } = useWords();
  const me = findWrestler(c.player)!;
  const [bought, setBought] = useState<string[]>([]);
  const total = attributeTotal(me);
  const price = trainingPrice(total);
  const booked = showsOn(c, c.today).some((s) => s.card?.some((b) => b.a === c.player || b.b === c.player)) || Object.keys(c.indie).some((id) => c.shows[id]?.date === c.today);
  const vals = ATTR_KEYS.map((k) => me.stats[k]);
  const best = Math.max(...vals);
  let nextDate: string | null = null;
  for (let i = 1; i < 60 && !nextDate; i++) {
    const d = addDays(c.today, i);
    const s = showsOn(c, d).find((x) => x.card?.some((b) => b.a === c.player || b.b === c.player) || c.indie[x.id]);
    if (s) nextDate = `${fmtDay(d, 'dm')}, ${s.name}`;
  }
  const buy = (i: number) => {
    const key = ATTR_KEYS[i]!;
    if (booked || c.money < price || me.stats[key] >= ATTRIBUTE_CAP) return;
    me.stats[key]++;
    spend(c, -price, `Training · ${ATTR_LONG[i]} ${me.stats[key]}`, 'training');
    setBought([...bought, `${ATTR_LONG[i]} ${me.stats[key]} (${money(price)})`]);
    commit();
  };
  const ladder = [1, 2, 3, 5, 10].map((n) => {
    let t = 0;
    for (let k = 0; k < n; k++) t += trainingPrice(total + k);
    return { l: n === 1 ? 'Next 1' : `Next ${n}`, v: `${money(t)}${n === 1 ? '' : ` · ${w('last one', 'last')} ${money(trainingPrice(total + n - 1))}`}` };
  });
  return (
    <Screen>
      <Head title={skin === 'paper' ? 'The Gym' : 'TRAINING'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        <div className="c-start">
          <div className="c-facts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <span className="c-fact"><span className="c-lab">{w('Bank')}</span><b>{money(c.money)}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Total')}</span><b>{total}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Next point')}</span><b>{money(price)}</b></span>
          </div>
          <span className="c-val">{booked ? 'You’re booked today, so the gym’s shut. Come back on a free day.' : `No booking today, so the gym’s open.${nextDate ? ` Next date: ${nextDate}.` : ''}`}</span>
        </div>
        <div className="c-rowsb"><span className="c-sec c-grow">{w('Attributes')}</span><span className="c-hint">{w('Same price for any')}</span></div>
        {ATTR_KEYS.map((k, i) => (
          <div key={k} className="c-trow">
            <span className="c-lab">{ATTR_LONG[i]}</span>
            <span className="c-bar"><i className={vals[i] === best ? 'c-fill best' : 'c-fill'} style={{ width: `${vals[i]}%` }} /></span>
            <b className="c-big">{vals[i]}</b>
            <button className="c-plus" onClick={() => buy(i)} disabled={booked || c.money < price || vals[i]! >= ATTRIBUTE_CAP}>+1</button>
          </div>
        ))}
        <span className="c-note">Every point you buy makes the next one dearer, whichever attribute it goes on.</span>
        <span className="c-sec">{w('What the next points cost', 'Price ladder')}</span>
        <div className="c-kv">{ladder.map((r) => <span key={r.l} style={{ display: 'contents' }}><span className="c-lab">{w(r.l)}</span><span className="c-val">{r.v}</span></span>)}</div>
        <span className="c-sec">{w('Bought today')}</span>
        <span className="c-note">{bought.length ? bought.join(' · ') : 'Nothing yet.'}</span>
        <button className="c-b3" onClick={onMoveset}>{w('Edit your moveset ›', 'Edit moveset ›')}</button>
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
    </Screen>
  );
}
