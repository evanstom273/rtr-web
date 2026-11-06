import { useState } from 'react';
import { buyLuxury, buyOut, buyStake, buyVenture, FUND_KINDS, growVenture, luxuryName, LUXURY_KINDS, premiums, putIn, sellLuxury, sellStake, sellVenture, stakeable, stakeOf, stakePrice, takeOut, VENTURE_KINDS, ventureName, venturePrice } from '../../career/life/invest';
import { depositFor } from '../../career/life/loans';
import { life } from '../../career/life/state';
import { PRICE_BOOK as PB } from '../../career/tuning';
import type { Career } from '../../career/types';
import { promoName } from '../../career';
import { money, shortMoney, useWords } from './parts';

/** Life → Invest: businesses (passive), funds, promotion stakes, luxury and insurance. */
export function InvestTab({ c, done }: { c: Career; done: (s: string) => void }) {
  const { w } = useWords();
  const L = life(c);
  const [amount, setAmount] = useState(10_000);
  const [promo, setPromo] = useState(stakeable()[0] ?? '');
  const p = premiums(c);
  return (
    <>
      <span className="c-sec">{w('Businesses')}</span>
      <span className="c-note">Passive: buy in and collect the takings. They wobble, and some fold. Gyms and bars are in your city.</span>
      {(L.ventures ?? []).map((v) => {
        const loan = L.loans.find((l) => l.on === v.id);
        return (
          <div key={v.id} className="c-kv">
            <span className="c-lab">{w(PB.business[v.kind].name)}</span>
            <span className="c-val">{ventureName(v.kind, v.city)}{v.size === 2 ? ' (two sites)' : ''} · worth {money(v.v)}{loan ? ` · ${money(loan.left)} owed` : ''}</span>
            <span className="c-lab" />
            <span className="c-chips">
              {v.size === 1 && <button className="c-chip" onClick={() => done(growVenture(c, v.id))}>A second site · {shortMoney(venturePrice(v.kind, v.city) * (PB.bigger - 1))}</button>}
              <button className="c-chip" onClick={() => done(sellVenture(c, v.id))}>Sell</button>
            </span>
          </div>
        );
      })}
      {VENTURE_KINDS.filter((k) => !(L.ventures ?? []).some((v) => v.kind === k && v.city === L.city)).map((k) => {
        const b = PB.business[k], price = venturePrice(k, L.city);
        return (
          <div key={k} className="c-ans" style={{ padding: '8px 10px' }}>
            <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{ventureName(k, L.city)}</b><span className="c-eff gold">{money(price)}</span></span>
            <span className="c-ad">About {Math.round(b.yield * 100)}% a year, ±{Math.round(b.wobble * 100)}% · folds {Math.round(b.fold * 100)}% of years{b.fans ? ' · does better the more fans you have' : ''}</span>
            <span className="c-chips" style={{ marginTop: 6 }}>
              <button className="c-chip" onClick={() => done(buyVenture(c, k, L.city, false))}>Cash</button>
              <button className="c-chip" onClick={() => done(buyVenture(c, k, L.city, true))}>Business loan · {shortMoney(price * depositFor(c, 'business'))} down</button>
            </span>
          </div>
        );
      })}

      <span className="c-sec">{w('Funds')}</span>
      <div className="c-chips">
        {[1_000, 10_000, 100_000, 1_000_000].map((a) => <button key={a} className={`c-chip${amount === a ? ' on' : ''}`} onClick={() => setAmount(a)}>{shortMoney(a)}</button>)}
      </div>
      {FUND_KINDS.map((k) => {
        const f = L.funds?.[k], d = PB.funds[k];
        return (
          <div key={k} className="c-kv">
            <span className="c-lab">{w(d.name)}</span>
            <span className="c-val">{f && f.v > 0 ? `${money(f.v)} (you put in ${money(f.put)})` : 'Nothing in it'} · about {Math.round(d.mean * 100)}% a year, ±{Math.round(d.wobble * 100)}%; a crash takes {Math.round(d.crash * 100)}%</span>
            <span className="c-lab" />
            <span className="c-chips">
              <button className="c-chip" onClick={() => done(putIn(c, k, amount))}>Put in {shortMoney(amount)}</button>
              {f && f.v > 0 && <button className="c-chip" onClick={() => done(takeOut(c, k, Math.min(amount, f.v)))}>Take out {shortMoney(Math.min(amount, f.v))}</button>}
              {f && f.v > 0 && <button className="c-chip" onClick={() => done(takeOut(c, k))}>Take it all</button>}
            </span>
          </div>
        );
      })}

      <span className="c-sec">{w('Stakes in promotions')}</span>
      <span className="c-note">A share of what it’s worth; half its monthly profit paid out by share. {PB.stake.say}% gets you a seat at the table (they won’t release you); for more than {PB.stake.max}%, you buy the lot.</span>
      {(L.stakes ?? []).map((s) => (
        <div key={s.promo} className="c-kv">
          <span className="c-lab">{w(s.promo)}</span>
          <span className="c-val">{s.pct}% · you paid {money(s.paid)}</span>
          <span className="c-lab" />
          <span className="c-chips">
            <button className="c-chip" onClick={() => done(sellStake(c, s.promo))}>Sell</button>
            <button className="c-chip" onClick={() => done(buyOut(c, s.promo))}>Buy the lot</button>
          </span>
        </div>
      ))}
      {promo && (
        <div className="c-start">
          <select className="c-fld" value={promo} onChange={(e) => setPromo(e.target.value)} aria-label="Which promotion">
            {stakeable().map((x) => <option key={x} value={x}>{promoName(x)}{stakeOf(c, x) ? ` · you own ${stakeOf(c, x)}%` : ''}</option>)}
          </select>
          <div className="c-chips">
            {[5, 10, 25].map((pct) => <button key={pct} className="c-chip" onClick={() => done(buyStake(c, promo, pct))}>{pct}% · {shortMoney(stakePrice(promo, pct))}</button>)}
          </div>
        </div>
      )}

      <span className="c-sec">{w('Luxury')}</span>
      <span className="c-note">Status, if you show it off; some of it holds its value, some doesn’t.</span>
      {(L.luxury ?? []).map((x) => (
        <div key={x.id} className="c-kv">
          <span className="c-lab">{w(PB.luxury[x.kind].name)}</span>
          <span className="c-val">{luxuryName(x.kind, x.tier)} · worth {money(x.v)} (paid {money(x.paid)})</span>
          <span className="c-lab" />
          <span className="c-chips"><button className="c-chip" onClick={() => done(sellLuxury(c, x.id))}>Sell</button></span>
        </div>
      ))}
      {LUXURY_KINDS.map((k) => (
        <div key={k} className="c-kv">
          <span className="c-lab">{w(PB.luxury[k].name)}</span>
          <span className="c-chips">{PB.luxury[k].tiers.map((price, i) => <button key={i} className="c-chip" onClick={() => done(buyLuxury(c, k, i as 0 | 1 | 2))}>{shortMoney(price)}</button>)}</span>
        </div>
      ))}

      <span className="c-sec">{w('Insurance')}</span>
      <div className="c-kv">
        <span className="c-lab">{w('Homes')}</span>
        <span className="c-chips"><button className={`c-chip${L.insure?.home ? ' on' : ''}`} onClick={() => { (L.insure ??= {}).home = !L.insure.home; done(L.insure.home ? `Homes insured: ${money(p.home)} a month.` : 'Homes uninsured.'); }}>{L.insure?.home ? 'Insured' : 'Not insured'} · {money(p.home)}/month</button></span>
        <span className="c-lab">{w('Businesses')}</span>
        <span className="c-chips"><button className={`c-chip${L.insure?.business ? ' on' : ''}`} onClick={() => { (L.insure ??= {}).business = !L.insure.business; done(L.insure.business ? `Businesses insured: ${money(p.business)} a month.` : 'Businesses uninsured.'); }}>{L.insure?.business ? 'Insured' : 'Not insured'} · {money(p.business)}/month</button></span>
      </div>
      <span className="c-note">Insurance covers fire and burglary, not a bad year or a business folding.</span>
    </>
  );
}
