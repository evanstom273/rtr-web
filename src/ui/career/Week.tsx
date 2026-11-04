import { useState } from 'react';
import { activityAt, baseCountry, jobBoard, livingCost, phaseOf, quitJob, relocate, relocateCost, routineOf, shiftPay, takeJob, type Activity, type Career, type DayJob } from '../../career';
import { ATTR_KEYS, ATTR_SHORT } from '../../career/create';
import { addDays, fmtDay, weekday } from '../../career/dates';
import { occupied, pkey } from '../../career/day';
import { REGION_LABEL, REGION_OF, regionOfCountry } from '../../career/places';
import { FEATURES, JOB_HOLIDAY, JOB_STRIKES, JOBS } from '../../career/tuning';
import { commit, Head, money, Screen, useToast, useWords } from './parts';

interface Props { c: Career; onBack: () => void }

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ACT: Record<Activity, string> = { show: 'Show', travel: 'Travel', moving: 'Moving', work: 'Work', train: 'Train', rest: 'Rest' };

/** "Mon–Fri AM", "Mon, Wed, Fri AM", "Thu–Sat PM". */
export function shiftText(shifts: readonly (readonly [number, string])[]): string {
  if (!shifts.length) return 'The shifts you pick';
  const byPh = new Map<string, number[]>();
  for (const [d, p] of shifts) byPh.set(p, [...(byPh.get(p) ?? []), d]);
  return [...byPh].map(([p, ds]) => {
    const run = ds.every((d, i) => i === 0 || d === ds[i - 1]! + 1);
    return `${run && ds.length > 2 ? `${DAY[ds[0]!]}–${DAY[ds.at(-1)!]}` : ds.map((d) => DAY[d]).join(', ')} ${p.toUpperCase()}`;
  }).join(' · ');
}

/** Your week (days on): the next seven days half by half, your routine, your day job and where you live. */
export function Week({ c, onBack }: Props) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const tabs = ['Week', ...(FEATURES.jobs ? ['Work'] : []), 'Home'];
  const [tab, setTab] = useState(0);
  const [sure, setSure] = useState(false);
  const [to, setTo] = useState('');
  const r = routineOf(c);
  const ph = phaseOf(c);
  const occ = occupied(c);
  const done = (f: () => string | void) => { const s = f(); commit(); if (s) say(s); };
  const chip = (on: boolean, label: string, f: () => void) => <button key={label} className={`c-chip${on ? ' on' : ''}`} onClick={() => { f(); commit(); }}>{w(label)}</button>;

  const week = Array.from({ length: 7 }, (_, i) => addDays(c.today, i));
  const cell = (d: string, p: 'am' | 'pm') => {
    const a = activityAt(c, d, p);
    const past = d === c.today && p === 'am' && ph === 'pm';
    const what = occ.get(pkey(d, p))?.[0];
    const sub = a === 'show' ? what?.replace(/^the show \((.*)\)$/, '$1') : a === 'travel' ? what?.replace(/^travelling (to|home from) /, (_m, x) => (x === 'to' ? '→ ' : '← ')) : a === 'work' && c.job ? JOBS[c.job.id].name : '';
    const free = a === 'train' || a === 'rest';
    const flip = () => {
      if (!free || past) return;
      const day = r.week[weekday(d)]!;
      day[p] = day[p] === 'train' ? 'rest' : 'train';
      commit();
    };
    return (
      <button key={p} className={`c-wk ${a}${past ? ' past' : ''}`} disabled={!free || past} onClick={flip} aria-label={`${fmtDay(d, 'long')} ${p.toUpperCase()}: ${ACT[a]}`}>
        <b>{w(ACT[a])}</b>{sub && <span>{sub}</span>}
      </button>
    );
  };

  const base = baseCountry(c);
  const region = regionOfCountry(base);
  const countries = Object.keys(REGION_OF).filter((x) => x !== 'Other' && x !== base);
  const board = jobBoard(c).filter((id) => id !== c.job?.id);
  const weekly = (id: DayJob['id']) => (id === 'gig' ? `${money(shiftPay(c, id))} a shift` : `${money(shiftPay(c, id) * JOBS[id].shifts.length)} a week`);

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Your Week' : 'MY WEEK'} meta={`${w(fmtDay(c.today, 'long'), fmtDay(c.today))} · ${ph.toUpperCase()}`} onBack={onBack} />
      <div className={`c-steps cols${tabs.length}`} style={{ marginTop: 8 }}>
        {tabs.map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => { setTab(i); setSure(false); }}>{w(t)}</button>)}
      </div>
      <div className="c-body">
        {tabs[tab] === 'Week' && (
          <>
            <div className="c-wkgrid">
              <span /><span className="c-lab">AM</span><span className="c-lab">PM</span>
              {week.map((d) => (
                <span key={d} style={{ display: 'contents' }}>
                  <span className="c-wkd"><b>{fmtDay(d).split(' ')[0]!.replace(',', '')}</b><span>{fmtDay(d, 'dm')}</span></span>
                  {cell(d, 'am')}{cell(d, 'pm')}
                </span>
              ))}
            </div>
            <span className="c-note">Tap a free half-day to switch between training and rest. Your week repeats; shows, travel and work come first.</span>
            <span className="c-sec">{w('Training sessions')}</span>
            <div className="c-kv">
              <span className="c-lab">{w('Build first')}</span>
              <div className="c-chips">{chip(!r.focus, 'Any', () => { delete r.focus; })}{ATTR_KEYS.map((k, i) => <span key={k} style={{ display: 'contents' }}>{chip(r.focus === k, ATTR_SHORT[i]!, () => { r.focus = k; })}</span>)}</div>
              <span className="c-lab">{w('Skip if tired')}</span>
              <div className="c-chips">{[40, 50, 60, 70, 80].map((f) => chip(r.maxTrainFatigue === f, `over ${f}`, () => { r.maxTrainFatigue = f; }))}</div>
              <span className="c-lab">{w('Match days')}</span>
              <div className="c-chips">{chip(r.trainMatchDays, 'Train', () => { r.trainMatchDays = true; })}{chip(!r.trainMatchDays, 'Rest', () => { r.trainMatchDays = false; })}</div>
              {FEATURES.skip && <><span className="c-lab">{w('Skipping')}</span><div className="c-chips">{chip(!r.simMine, 'Stop for my matches', () => { r.simMine = false; })}{chip(r.simMine, 'Sim them', () => { r.simMine = true; })}</div></>}
            </div>
          </>
        )}

        {tabs[tab] === 'Work' && (
          <>
            {c.job ? (
              <div className="c-start">
                <span className="c-lab">{w('Your job')}</span>
                <b className="c-sbig" style={{ fontSize: 26 }}>{JOBS[c.job.id].name}</b>
                <div className="c-facts">
                  <span className="c-fact"><span className="c-lab">{w('Pay')}</span><b>{weekly(c.job.id)}</b></span>
                  <span className="c-fact"><span className="c-lab">{w('Shifts')}</span><b>{shiftText(c.job.id === 'gig' ? c.job.gig ?? [] : JOBS[c.job.id].shifts)}</b></span>
                  <span className="c-fact"><span className="c-lab">{w('Holiday')}</span><b>{c.job.holiday} of {JOB_HOLIDAY}</b></span>
                  <span className="c-fact"><span className="c-lab">{w('Warnings')}</span><b className={c.job.strikes.length ? 'c-amt neg' : ''}>{c.job.strikes.length} of {JOB_STRIKES}</b></span>
                </div>
                <span className="c-val">{c.job.from > c.today ? `You start ${fmtDay(c.job.from, 'long')}.` : `Since ${fmtDay(c.job.from, 'dm')}. Paid on Fridays for the shifts you work.`}{c.job.off.filter((d) => d >= c.today).length ? ` Off: ${c.job.off.filter((d) => d >= c.today).map((d) => fmtDay(d, 'dm')).join(', ')}.` : ''}</span>
                <button className="c-b3" onClick={() => (sure ? done(() => { quitJob(c); setSure(false); return 'You’ve quit.'; }) : setSure(true))}>{w(sure ? 'Tap again to quit' : 'Quit ›')}</button>
              </div>
            ) : <span className="c-note">No day job. Wrestling pays the bills, or it doesn’t: a job is steady money, at the cost of your mornings and some fatigue.</span>}
            <span className="c-sec">{w('Going near you', 'Job board')} · {REGION_LABEL[region]}</span>
            {board.map((id) => (
              <button key={id} className="c-ans" style={{ padding: '8px 10px' }} onClick={() => done(() => { if (c.job) quitJob(c, 'You’ve moved on'); return `${takeJob(c, id)}: ${id === 'gig' ? 'log on from today' : 'you start next Monday'}.`; })}>
                <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{JOBS[id].name}</b><span className="c-eff up">{weekly(id)}</span></span>
                <span className="c-ad">{shiftText(id === 'gig' ? [] : JOBS[id].shifts)} · +{JOBS[id].fatigue} fatigue a shift{id === 'gig' ? ' · no penalties, drop it any time' : ''}</span>
              </button>
            ))}
            <span className="c-note">Book a show over a shift with a week’s notice and it’s unpaid time off. Any later comes out of your holiday, or it’s a warning: three in 90 days and you’re out.</span>
            <span className="c-lab" style={{ marginTop: 4 }}>{w('A booking against a shift')}</span>
            <div className="c-chips">{chip(r.clash === 'ask', 'Ask me', () => { r.clash = 'ask'; })}{chip(r.clash === 'take', 'Take the time off', () => { r.clash = 'take'; })}{chip(r.clash === 'keep', 'Keep the shift', () => { r.clash = 'keep'; })}</div>
          </>
        )}

        {tabs[tab] === 'Home' && (
          <>
            <div className="c-start">
              <span className="c-lab">{w('You live in')}</span>
              <b className="c-sbig" style={{ fontSize: 26 }}>{base}</b>
              <span className="c-val">{REGION_LABEL[region]}{FEATURES.livingCosts ? ` · living costs ${money(livingCost(region))} a week` : ''}</span>
              {c.moving && <span className="c-val c-hot">Moving to {c.moving.to}: there on {fmtDay(c.moving.until, 'long')}.</span>}
            </div>
            <span className="c-sec">{w('Travel')}</span>
            <div className="c-kv">
              <span className="c-lab">{w('Same country')}</span><span className="c-val">No time</span>
              <span className="c-lab">{w('Same region')}</span><span className="c-val">The morning of the show</span>
              <span className="c-lab">{w('Another continent')}</span><span className="c-val">The whole day before, and the next day home (unless you’re back within four days)</span>
            </div>
            <span className="c-sec">{w('Move')}</span>
            <div className="c-start">
              <select className="c-fld" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Where to">
                <option value="">Where to?</option>
                {(Object.keys(REGION_LABEL) as (keyof typeof REGION_LABEL)[]).map((reg) => (
                  <optgroup key={reg} label={REGION_LABEL[reg]}>
                    {countries.filter((x) => REGION_OF[x] === reg).map((x) => <option key={x} value={x}>{x} · {money(relocateCost(c, x))}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <span className="c-note">Three days, and it ends a day job. Moving changes where you travel from, which indie promoters call, and your living costs. Sign somewhere far away and they’ll offer to pay most of it.</span>
            <button className="c-b3" disabled={!to || !!c.moving} onClick={() => done(() => { const s = relocate(c, to); setTo(''); return s; })}>{w(to ? `Move to ${to} · ${money(relocateCost(c, to))} ›` : 'Pick somewhere')}</button>
          </>
        )}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
      {toast}
    </Screen>
  );
}
