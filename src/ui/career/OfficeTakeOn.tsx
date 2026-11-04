import { useState } from 'react';
import {
  applyFor, askingPrice, bookerStanding, buy, canRun, companyOf, goalText, ownerOf, ownerView, resign, sellUp, TIER_LABEL, valuation, type Career,
} from '../../career';
import { findWrestler, PROMOTIONS } from '../../data/rtr';
import { OWNER } from '../../career/tuning';
import { commit, money, useWords } from './parts';

/** Taking one on (booker mode, stage 6): apply for a booking job, or buy a promotion. Founding is the Found form. */
export function TakeOn({ c, say, found }: { c: Career; say: (s: string) => void; found: React.ReactNode }) {
  const { w } = useWords();
  const [how, setHow] = useState<'found' | 'apply' | 'buy'>('found');
  const open = PROMOTIONS.filter((p) => !p.indie && !p.closed && companyOf(p.initials) && !canRun(c, p.initials) && companyOf(p.initials)!.owner !== 'player');
  const act = (s: string) => { say(s); commit(); };
  return (
    <>
      <div className="c-chips">{(['found', 'apply', 'buy'] as const).map((x) => <button key={x} className={`c-chip${how === x ? ' on' : ''}`} onClick={() => setHow(x)}>{w(x === 'found' ? 'Found one' : x === 'apply' ? 'Ask for a book' : 'Buy one')}</button>)}</div>
      {how !== 'found' && !open.length && <span className="c-note">Nothing you can take on: you run a major and an indie already, or there’s nothing of the size you’ve room for.</span>}
      {how === 'found' ? found : how === 'apply' ? (
        <>
          <span className="c-note">Your standing as a booker: {bookerStanding(c)} (your name, and how your shows have gone). Owners want {Object.entries(OWNER.applyNeed).map(([t, v]) => `${t} ${v}`).join(', ')}. Ask once a quarter.</span>
          {open.map((p) => { const co = companyOf(p.initials)!; return (
            <div key={p.initials} className="c-rowsb"><span className="c-val">{p.name}<span className="c-hint"> · {TIER_LABEL[co.tier].toLowerCase()} · owner {ownerOf(p.initials)?.name ?? '—'}</span></span><button className="c-chip" onClick={() => act(applyFor(c, p.initials))}>{w('Ask')}</button></div>
          ); })}
        </>
      ) : (
        <>
          <span className="c-note">You have {money(c.money)}. The price is what the owner wants: the money in the bank, a year’s takings, the fans, the roster. In trouble, it goes cheap.</span>
          {open.map((p) => { const ask = askingPrice(c, p.initials); return (
            <div key={p.initials} className="c-rowsb"><span className="c-val">{p.name}<span className="c-hint"> · {money(ask)}</span></span><button className="c-chip" disabled={ask > c.money} onClick={() => act(buy(c, p.initials, ask))}>{w('Buy')}</button></div>
          ); })}
        </>
      )}
    </>
  );
}

/** The owner, for the Overview: patience, this quarter's goals, their favourite; resign, buy them out, or sell up. */
export function Boss({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const co = companyOf(promo)!;
  const role = c.office?.roles.find((r) => r.promo === promo);
  const act = (s: string) => { say(s); commit(); };
  if (role?.as === 'owner') return (
    <>
      <span className="c-sec">{w('It’s yours')}</span>
      <span className="c-note">Worth about {money(valuation(promo))}. A buyer would give you {money(valuation(promo) * OWNER.sellFor)}.</span>
      <button className="c-b3" onClick={() => act(sellUp(c, promo))}>{w('Sell up')}</button>
    </>
  );
  const boss = ownerView(co);
  const ask = askingPrice(c, promo);
  return (
    <>
      <span className="c-sec">{w('Your boss')} · {ownerOf(promo)?.name ?? 'The owner'}</span>
      <span className="c-meter" style={{ display: 'block', height: 6, background: 'var(--cr-panel2)' }}><span style={{ display: 'block', height: 6, width: `${boss.patience}%`, background: boss.patience < 25 ? 'var(--cr-bad)' : boss.patience < 50 ? 'var(--cr-hi)' : 'var(--cr-good)' }} /></span>
      <span className="c-hint">Patience {boss.patience}/100{boss.favourite ? ` · their favourite: ${findWrestler(boss.favourite)?.name}` : ''}</span>
      {boss.goals.map((g, i) => <span key={i} className="c-val">• {goalText(g)}{g.kind === 'push' ? ` (${g.got ?? 0} so far)` : ''}</span>)}
      <div className="c-chips">
        <button className="c-chip" disabled={ask > c.money} onClick={() => act(buy(c, promo, ask))}>{w(`Buy them out · ${money(ask)}`)}</button>
        <button className="c-chip" onClick={() => act(resign(c, promo))}>{w('Resign')}</button>
      </div>
    </>
  );
}
