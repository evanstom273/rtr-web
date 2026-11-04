import { useState } from 'react';
import {
  bookSummary, borrow, companyOf, IN_LINES, invest, LINE_LABEL, nextTier, OUT_LINES, rolesOf, setPrice, setWage, TIER_LABEL, ticketPrice, withdraw, type Career,
} from '../../career';
import { PROMOTIONS, rosterOf } from '../../data/rtr';
import { fmtDay } from '../../career/dates';
import { BIZ } from '../../career/tuning';
import { commit, money, shortMoney, useWords } from './parts';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The Books tab (booker mode, stage 4): the company's money, its month, its year, and moving money in and out. */
export function OfficeBooks({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const co = companyOf(promo)!;
  const role = rolesOf(c).find((r) => r.promo === promo)!;
  const owner = role.as === 'owner';
  const { month, months } = bookSummary(co);
  const next = nextTier(co);
  const pop = PROMOTIONS.find((p) => p.initials === promo)?.popularity ?? 0;
  const [amount, setAmount] = useState(1000);
  const act = (s: string) => { say(s); commit(); };
  const steps = [500, 1000, 5000, 10_000, 50_000, 250_000].filter((x) => x <= Math.max(BIZ.loan.max[co.tier]!, c.money, co.bank, 1000));
  const lines = [...IN_LINES, ...OUT_LINES].filter((l) => month[l]);
  return (
    <>
      <div className="c-start">
        <div className="c-facts">
          <span className="c-fact"><span className="c-lab">{w('Bank')}</span><b className={co.bank < 0 ? 'c-amt neg' : ''}>{shortMoney(co.bank)}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Tier')}</span><b>{TIER_LABEL[co.tier]}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Popularity')}</span><b>{pop}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Shows rated')}</span><b>{co.rep ? `${co.rep}★` : '—'}</b></span>
        </div>
        {co.red ? <span className="c-hint">Past the {money(-BIZ.overdraft[co.tier]!)} overdraft {co.red} month{co.red === 1 ? '' : 's'}: {(BIZ.redMonths.player - co.red)} more and it’s finished.</span> : null}
        {next && <span className="c-hint">To go {TIER_LABEL[next.tier].toLowerCase()}: popularity {pop}/{next.pop} · bank {money(co.bank)}/{money(next.bank)} · roster {rosterOf(promo).length}/{next.roster}</span>}
      </div>

      <span className="c-sec">{w('This month so far')}</span>
      {lines.length ? <div className="c-kv">{lines.map((l) => <span key={l} style={{ display: 'contents' }}><span className="c-lab">{w(LINE_LABEL[l])}</span><span className="c-val">{(IN_LINES as readonly string[]).includes(l) ? '' : '−'}{money(month[l]!)}</span></span>)}</div>
        : <span className="c-note">Nothing yet this month.</span>}

      {months.length > 0 && (
        <>
          <span className="c-sec">{w('Month by month')}</span>
          {months.slice().reverse().map((m) => (
            <div key={m.m} className="c-rowsb"><span className="c-val">{MON[Number(m.m.slice(5, 7)) - 1]} {m.m.slice(0, 4)}</span><span className="c-hint">in {money(m.in)} · out {money(m.out)} · <b className={m.in - m.out >= 0 ? 'c-amt pos' : 'c-amt neg'}>{m.in - m.out >= 0 ? '+' : '−'}{money(Math.abs(m.in - m.out))}</b></span></div>
          ))}
        </>
      )}

      <span className="c-sec">{w('Tickets')} · {money(ticketPrice(co))}</span>
      <div className="c-chips">{['Cheap', 'Usual', 'Dear'].map((x, i) => <button key={x} className={`c-chip${(co.price ?? 1) === i ? ' on' : ''}`} onClick={() => act(setPrice(c, promo, i))}>{w(x)}</button>)}</div>
      <span className="c-note">Dearer tickets take more a head, and put some people off.</span>

      <span className="c-sec">{w('Deals')}</span>
      {co.tv ? <span className="c-val">TV: {co.tv.network}, {money(co.tv.fee)} a weekly show, to {fmtDay(co.tv.until, 'dm')}</span> : <span className="c-note">No TV deal. Networks come calling once you’re regional and your shows average {BIZ.offerFrom}★.</span>}
      {(co.sponsors ?? []).map((s) => <span key={s.name} className="c-val">{s.name}: {money(s.monthly)} a month to {fmtDay(s.until, 'dm')}</span>)}
      {co.loan && <span className="c-val">Loan: {money(co.loan.left)} left, {money(co.loan.monthly)} a month</span>}

      {owner ? (
        <>
          <span className="c-sec">{w('Your money and the company’s')} · {w('you have')} {money(c.money)}</span>
          <div className="c-chips">{steps.map((x) => <button key={x} className={`c-chip${amount === x ? ' on' : ''}`} onClick={() => setAmount(x)}>{money(x)}</button>)}</div>
          <div className="c-chips">
            <button className="c-chip" onClick={() => act(invest(c, promo, amount))}>{w('Put it in')}</button>
            <button className="c-chip" onClick={() => act(withdraw(c, promo, amount))}>{w('Take it out')}</button>
            <button className="c-chip" onClick={() => act(borrow(c, promo, amount))}>{w('Borrow it')}</button>
            <button className="c-chip" onClick={() => act(setWage(c, promo, amount))}>{w('Pay me that a month')}</button>
            {co.wage ? <button className="c-chip" onClick={() => act(setWage(c, promo, 0))}>{w('Stop my wage')}</button> : null}
          </div>
          <span className="c-note">{co.wage ? `You take ${money(co.wage)} a month. ` : ''}The bank lends up to {money(BIZ.loan.max[co.tier]!)} over {BIZ.loan.months} months at {Math.round(BIZ.loan.rate * 100)}% a year. Past the overdraft for {BIZ.redMonths.player} months running and it closes.</span>
        </>
      ) : (
        <span className="c-note">It’s the owner’s money. You’re paid {money(BIZ.salary[co.tier]!)} a month, and you’ve {money(BIZ.budget[co.tier]!)} a show for free agents.</span>
      )}
    </>
  );
}
