import { useState } from 'react';
import {
  attitude, baseFor, BONUS_TRIGGERS, C, CHARACTER, clauseCost, dealsOf, gate, PACKAGES, packageProposal, person, PLAYER_PACKAGES, promoName, propose, roundsLeft,
  signOffer, triggerSlots, underLine, walkAway, type BonusTrigger, type Career, type PackageId, type Proposal,
} from '../../career';
import { CLAUSES } from '../../career/clauses';
import { PAY_LABEL, payWords, preferredPay } from '../../career/economy';
import type { PayType } from '../../career/types';
import { agentCeiling } from '../../career/life/money';
import { on } from '../../career/life/state';
import { fmtDay } from '../../career/dates';
import { CONTRACT_MONTHS, SPLIT_DATES_TOTAL } from '../../career/tuning';
import { ClauseGroups, Pips } from './Clauses';
import { commit, Head, money, Screen, useToast, useWords } from './parts';
import { PayBoxes } from './PayBoxes';



interface Props { c: Career; offerId: string; onBack: () => void; onDone: () => void }

/** A rough read on how they took your last offer (never live: Lyra's call). */
const MOOD: Record<string, [string, string]> = { keen: ['Interested', 'c-eff up'], happy: ['They could live with it', 'c-eff up'], hesitant: ['Not keen', 'c-eff gold'], losing: ['Losing patience', 'c-eff bad'] };
const PKG_SHORT: Record<string, string> = { star: 'Star', developmental: 'Developmental', parttime: 'Part-timer', attraction: 'Attraction', custom: 'Custom' };

/**
 * Negotiate a contract (Lyra's design): open with a package or build your own, every clause in five folding
 * sections, a walk-away line on any clause (their offer goes under it and you can walk with no hard feelings),
 * your pick of bonus triggers, and the dates a month when it's part-time or a second major.
 */
export function Negotiate({ c, offerId, onBack, onDone }: Props) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const o = c.offers.find((x) => x.id === offerId);
  const [p, setP] = useState<Proposal>(() => ({ fee: o?.fee ?? 0, months: o?.months ?? 12, clauses: [...(o?.clauses ?? [])], ...(o?.dates ? { dates: o.dates } : {}), triggers: [...(o?.triggers ?? [])], ...(o?.entrance ? { entrance: true } : {}), pay: o?.pay ?? (o ? preferredPay(o.promo) : 'ppa') }));
  const [pkg, setPkg] = useState<PackageId | 'custom'>(o?.pkg ?? 'custom');
  const [lines, setLines] = useState<number[]>(() => o?.lines ?? CLAUSES.map(() => 0));
  if (!o) return null;
  const base = baseFor(c, o, p);
  const open = o.status === 'open';
  const accepted = open && o.said.startsWith('“Done');
  const under = underLine(o) >= 0;
  const ch = CHARACTER[o.promo];
  const others = dealsOf(person(c, c.player)).filter((k) => k.promo !== o.promo);
  const setTier = (i: number, d: number) => {
    const t = Math.max(0, Math.min(3, (p.clauses[i] ?? 0) + d));
    if (d > 0 && gate(c, o, i, t)) return say(gate(c, o, i, t)!);
    const clauses = p.clauses.map((x, k) => (k === i ? t : x));
    const slots = triggerSlots(clauses[C.bonuses] ?? 0);
    setP({ ...p, clauses, triggers: (p.triggers ?? []).slice(0, slots) });
    setPkg('custom');
  };
  const pickPackage = (k: PackageId | 'custom') => { setPkg(k); setP(packageProposal(c, o, k, p)); };
  const toggleTrigger = (t: BonusTrigger) => {
    const have = p.triggers ?? [];
    const slots = triggerSlots(p.clauses[C.bonuses] ?? 0);
    setP({ ...p, triggers: have.includes(t) ? have.filter((x) => x !== t) : have.length < slots ? [...have, t] : [...have.slice(1), t] });
  };
  const submit = () => {
    o.lines = lines;
    o.pkg = pkg === 'custom' ? undefined : pkg;
    const r = propose(c, o, p);
    if (r === 'counter') setP({ fee: o.fee, months: o.months, clauses: [...o.clauses], ...(o.dates ? { dates: o.dates } : {}), triggers: [...(o.triggers ?? [])], ...(o.entrance ? { entrance: true } : {}), pay: p.pay, ...(p.salaryMult !== undefined ? { salaryMult: p.salaryMult } : {}), ...(p.dateMult !== undefined ? { dateMult: p.dateMult } : {}) });
    commit();
  };
  const sign = () => {
    const said = signOffer(c, o);
    commit();
    if (o.status === 'signed') onDone();
    else say(said);
  };
  const walk = () => { o.lines = lines; const said = walkAway(c, o); commit(); if (said) say(said); onBack(); };
  const slots = triggerSlots(p.clauses[C.bonuses] ?? 0);
  const datesOn = !!o.second || !!p.dates || pkg === 'parttime' || pkg === 'attraction';

  return (
    <Screen>
      <Head title={skin === 'paper' ? `At the Table: ${o.promo}` : `NEGOTIATE · ${o.promo}`} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-start" style={{ marginTop: 10 }}>
        <div className="c-rowsb"><span className="c-lab">{w(`${o.promo} said`)}</span><span className="c-hint">{open ? `${roundsLeft(o)} ${roundsLeft(o) === 1 ? 'round' : 'rounds'} left` : o.status}</span></div>
        <span className="c-val">{o.said}</span>
        <div className="c-rowsb"><span className="c-lab">{w('How they took it')}</span>{o.read ? <b className={MOOD[o.read]![1]}>{w(MOOD[o.read]![0])}</b> : <span className="c-hint">Put an offer to them and see</span>}</div>
      </div>
      <div className="c-body">
        {ch && <span className="c-note"><b>{promoName(o.promo)}: {ch.style}.</b> {ch.blurb}</span>}
        {open && on('money') && c.life?.agent && <span className="c-note"><b>{c.life.agent.name} (your agent):</b> they’d realistically go to about {money(agentCeiling(c, o))} a date on these terms. Ask for more and expect a counter.</span>}
        {o.second && <span className="c-note">A second deal, alongside {others.map((k) => k.promo).join(' and ')}: it can’t be exclusive, and the month splits between you ({SPLIT_DATES_TOTAL} dates in all).</span>}
        <span className="c-lab">{w('Start from')}</span>
        <div className="c-chips">
          {[...PLAYER_PACKAGES, 'custom' as const].map((k) => <button key={k} className={`c-chip${pkg === k ? ' on' : ''}`} onClick={() => pickPackage(k)}>{w(PKG_SHORT[k]!)}</button>)}
        </div>
        {pkg !== 'custom' && <span className="c-ad">{PACKAGES[pkg].blurb}</span>}
        <span className="c-lab">{w('How you’re paid')}</span>
        <div className="c-chips">
          {(['ppa', 'monthly', 'both'] as PayType[]).map((t) => (
            <button key={t} className={`c-chip${(p.pay ?? 'ppa') === t ? ' on' : ''}`} onClick={() => { const { salaryMult: _s, dateMult: _d, ...rest } = p; setP({ ...rest, pay: t }); }}>{PAY_LABEL[t]}{t === preferredPay(o.promo) ? ' ✓' : ''}</button>
          ))}
        </div>
        <span className="c-note">{p.pay === 'monthly' ? 'A salary every month, booked or not, hurt or not.' : p.pay === 'both' ? 'A smaller salary every month, plus a smaller fee for each appearance.' : 'Paid for each appearance: more than a salary if you’re busy, less if you’re not.'}{p.pay !== preferredPay(o.promo) ? ` ${o.promo} would rather ${PAY_LABEL[preferredPay(o.promo)].toLowerCase()}: asking costs you a little in the deal.` : ''}</span>
        <PayBoxes promo={o.promo} deal={p} onChange={(d) => { const { salaryMult: _s, dateMult: _d, ...rest } = p; setP({ ...rest, ...d }); }} />
        <span className="c-val">{payWords({ ...p, promo: o.promo })}</span>
        <span className="c-lab">{w('Length')}</span>
        <div className="c-modes" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {CONTRACT_MONTHS.map((n) => <button key={n} className={p.months === n ? 'c-mode on' : 'c-mode'} style={{ minHeight: 40 }} onClick={() => setP({ ...p, months: n })}><b>{n} {w('mo')}</b></button>)}
        </div>
        {on('entrance') && (
          <>
            <span className="c-lab">{w('Entrance & production')}</span>
            <div className="c-chips">
              <button className={`c-chip${p.entrance ? ' on' : ''}`} onClick={() => setP({ ...p, entrance: !p.entrance || undefined })}>{p.entrance ? 'Pyro on any show: yes' : 'Pyro on any show: no'}</button>
            </div>
            <span className="c-note">Pyro and production wherever you are on the card (you pay for it; it costs them about 3% of the fee to allow). Without it, only at the top of the card.</span>
          </>
        )}
        {datesOn && (
          <>
            <span className="c-lab">{w('Dates a month')}</span>
            <div className="c-chips">
              {!o.second && <button className={`c-chip${!p.dates ? ' on' : ''}`} onClick={() => { const { dates: _d, ...rest } = p; setP(rest); }}>{w('Booker’s call')}</button>}
              {[2, 4, 6, 8].map((n) => <button key={n} className={`c-chip${p.dates === n ? ' on' : ''}`} onClick={() => setP({ ...p, dates: n })}>{n}</button>)}
            </div>
            <span className="c-hint">Fewer dates pay more a date.{o.second ? ` ${others.map((k) => k.promo).join(' and ')} would keep ${SPLIT_DATES_TOTAL - (p.dates ?? 4)}.` : ''}</span>
          </>
        )}
        <div className="c-rowsb"><span className="c-sec c-grow">{w('The 25 clauses', 'Clauses')}</span><span className="c-hint">{w('Tap a section to open it')}</span></div>
        <ClauseGroups tiers={p.clauses} open={['card']} row={(cl, i) => {
          const t = p.clauses[i] ?? 0;
          const att = attitude(o.promo, i);
          const cost = clauseCost(o.promo, base, i, t);
          const line = lines[i] ?? 0;
          const excl = i === C.exclusivity;
          return (
            <div className={t ? 'c-ccard on' : 'c-ccard'}>
              <div className="c-crow2">
                <b className="c-at">{cl.name}</b>
                <button className="c-stepb" onClick={() => setTier(i, -1)} aria-label={`Lower ${cl.name}`}>−</button>
                <Pips t={t} lock={(n) => !!gate(c, o, i, n)} />
                <button className="c-stepb" onClick={() => setTier(i, 1)} aria-label={`Raise ${cl.name}`}>+</button>
              </div>
              <span className="c-ad">{t ? `${w('Tier', 'T')} ${t} · ${cl.tiers[t - 1]}` : cl.none}</span>
              <span className="c-effs">
                <span className={att === 'resist' ? 'c-eff dn' : att === 'flexible' ? 'c-eff up' : 'c-eff'}>{w(excl ? (att === 'resist' ? 'They want you exclusive' : att === 'flexible' ? 'They’ll share you' : 'Neutral') : att === 'resist' ? 'They resist' : att === 'flexible' ? 'They’re flexible' : 'Neutral')}</span>
                <span className="c-eff">{excl ? (cost < 0 ? `Pays you ~${money(-cost)} more a date` : cost > 0 ? `Costs them ~${money(cost)} a date` : 'The standard') : t ? `Costs them ~${money(cost)} a date` : w('Costs nothing')}</span>
                <button className={line ? 'c-eff gold' : 'c-eff'} onClick={() => setLines(lines.map((x, k) => (k === i ? (x + 1) % 4 : x)))} aria-label={`Walk-away line for ${cl.name}`}>{w(line ? `Your line: T${line}` : 'No line')}</button>
              </span>
              {i === C.bonuses && slots > 0 && (
                <div className="c-chips">
                  {BONUS_TRIGGERS.map((b) => <button key={b.id} className={`c-chip${p.triggers?.includes(b.id) ? ' on' : ''}`} onClick={() => toggleTrigger(b.id)}>{w(b.name)}</button>)}
                  <span className="c-hint">{(p.triggers ?? []).length} of {slots} picked</span>
                </div>
              )}
            </div>
          );
        }} />
        <span className="c-note">Starts {fmtDay(o.start, 'long')}. Every clause tier costs them something; push too far and they walk. Set a line on the clauses you won’t give up: if their offer goes under one, you can walk away and they won’t hold it against you.</span>
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={open ? walk : onBack}>{w(open ? (under ? 'Walk away (no hard feelings)' : 'Walk away') : '‹ Back')}</button>
        {accepted ? <button className="c-b1" onClick={sign}>{w(`Sign with ${o.promo}`)}</button>
          : <button className="c-b1" disabled={!open} onClick={submit}>{w('Put it to them', 'Submit')}</button>}
      </div>
      {toast}
    </Screen>
  );
}
