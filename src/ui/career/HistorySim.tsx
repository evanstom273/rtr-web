import { useEffect, useRef, useState } from 'react';
import { databaseChanged } from '../../data/rtr';
import { headline, historyOf, runHistoryYear, summarise, type Summary } from '../../career';
import { addMonths, fmtDay } from '../../career/dates';
import { runJobs } from '../../career/runner';
import { activeWorld, reloadWorld } from '../../world/world';
import { Head, Screen, stars, useWords } from './parts';

/** The setup sheet: how many years of history before you choose (Lyra's call: 1–10, backdated to today). */
export function HistorySetup({ onCancel, onGo }: { onCancel: () => void; onGo: (years: number) => void }) {
  const { w } = useWords();
  const [years, setYears] = useState(5);
  // Its own layer over whichever screen opened it (the start screen, or the world choice).
  return (
    <section className="cr" style={{ background: 'transparent', zIndex: 40 }}>
    <div className="c-scr">
    <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div>
        <div className="c-sh"><div><span>{w('New career')}</span><b>{w('Simulate history first')}</b></div><button onClick={onCancel} aria-label="Cancel">✕</button></div>
        <p className="c-note">A fresh world, wound back {years} year{years === 1 ? '' : 's'}: everyone younger, less famous, some not yet debuted. Then the world plays out to today, every match through the engine, a year at a time. After each year you can carry on or start your career there.</p>
        <span className="c-lab">{w('Years of history')}</span>
        <div className="c-chips">{Array.from({ length: 10 }, (_, i) => i + 1).map((y) => <button key={y} className={`c-chip${y === years ? ' on' : ''}`} onClick={() => setYears(y)}>{y}</button>)}</div>
        <span className="c-note">About 2–3 minutes a year on a phone (it saves at the end of each year). Once the first year’s done, it replaces your current world and career.</span>
        <div className="c-nav">
          <button className="c-b2" onClick={onCancel}>{w('Cancel')}</button>
          <button className="c-b1" onClick={() => onGo(years)}>{w(`Simulate ${years} year${years === 1 ? '' : 's'} ›`)}</button>
        </div>
      </div>
    </div>
    </div>
    </section>
  );
}

type Phase = 'running' | 'year' | 'review';

/** History being made: a year at a time, headlines as they happen, a summary after each year, a review at the end. */
export function HistoryScreen({ onPick, onQuit }: { onPick: () => void; onQuit: () => void }) {
  const { skin, w } = useWords();
  const s = historyOf()!;
  const [phase, setPhase] = useState<Phase>(() => (s.reached >= s.years ? 'review' : s.reached > 0 ? 'year' : 'running'));
  const [pct, setPct] = useState(0);
  const [ticker, setTicker] = useState<string[]>([]);
  const stop = useRef(false);
  const busy = useRef(false);
  const [, bump] = useState(0);

  useEffect(() => {
    if (phase !== 'running' || busy.current) return;
    busy.current = true;
    stop.current = false;
    setPct(0);
    setTicker([]);
    let last = activeWorld().history.events.length;
    void (async () => {
      const ok = await runHistoryYear(runJobs, async (done, total) => {
        setPct(done / total);
        const ev = activeWorld().history.events;
        const lines = ev.slice(last).map(headline).filter((x): x is string => !!x);
        last = ev.length;
        if (lines.length) setTicker((t) => [...lines.reverse(), ...t].slice(0, 9));
      }, () => stop.current);
      busy.current = false;
      if (ok) { databaseChanged(); setPhase(historyOf()!.reached >= historyOf()!.years ? 'review' : 'year'); return; }
      // Stopped mid-year: back to the end of the last year (or out, if there wasn't one).
      await reloadWorld();
      databaseChanged();
      if (historyOf()?.reached) { setPhase('year'); bump((n) => n + 1); } else onQuit();
    })();
  }, [phase, onQuit]);

  const cur = historyOf() ?? s;
  const yearStart = addMonths(cur.start, 12 * Math.max(0, cur.reached - 1)), yearEnd = addMonths(cur.start, 12 * cur.reached);
  const sum: Summary | null = phase === 'year' ? summarise(yearStart, yearEnd) : phase === 'review' ? summarise(cur.start, cur.end, 10) : null;
  const title = skin === 'paper' ? 'The History Books' : 'HISTORY';

  if (phase === 'running') {
    const y = Number(cur.start.slice(0, 4)) + cur.reached;
    return (
      <Screen>
        <Head title={title} meta={`${w('Year')} ${cur.reached + 1} ${w('of')} ${cur.years}`} onBack={() => { stop.current = true; }} />
        <div className="c-body">
          <div className="c-start">
            <span className="c-lab">{w('Now playing out')}</span>
            <b className="c-sbig" style={{ fontSize: 34 }}>{y}–{String(y + 1).slice(2)}</b>
            <i className="c-hbar"><b style={{ width: `${Math.round(pct * 100)}%` }} /></i>
            <span className="c-hint">{Math.round(pct * 100)}% · {fmtDay(cur.career.today, 'dm')} {cur.career.today.slice(0, 4)}</span>
          </div>
          <span className="c-sec">{w('Headlines')}</span>
          {ticker.length === 0 && <span className="c-note">The world gets going…</span>}
          {ticker.map((t, i) => <span key={`${i}${t}`} className="c-dline" style={{ opacity: 1 - i * 0.08 }}>{t}</span>)}
        </div>
        <div className="c-nav"><button className="c-b2" onClick={() => { stop.current = true; }}>{w('Stop')}</button><button className="c-b1" disabled>{w('Simulating…')}</button></div>
      </Screen>
    );
  }

  const S = sum!;
  const list = (h: string, xs: string[], empty: string) => (
    <div className="c-dsec">
      <span className="c-sec">{w(h)}</span>
      {xs.length ? xs.map((x, i) => <span key={i} className="c-dline">{x}</span>) : <span className="c-note">{empty}</span>}
    </div>
  );
  const done = cur.reached >= cur.years;
  return (
    <Screen>
      <Head title={title} meta={phase === 'review' ? `${cur.start.slice(0, 4)}–${cur.end.slice(0, 4)}` : `${w('Year')} ${cur.reached} ${w('of')} ${cur.years}`} onBack={onQuit} />
      <div className="c-body">
        <span className="c-qtext" style={{ fontSize: 26 }}>{phase === 'review' ? `${cur.years} years of history` : `${yearStart.slice(0, 4)}–${yearEnd.slice(2, 4)} in review`}</span>
        <span className="c-note">{S.changes} title change{S.changes === 1 ? '' : 's'}{phase === 'review' ? ' in all' : ' this year'}. Everything’s in Records too.</span>
        {phase === 'review'
          ? <div className="c-dsec"><span className="c-sec">{w('The champions')}</span>{S.reigns.map((r) => <span key={r.title} className="c-dline"><b>{r.title}</b>: {r.holders.join(' → ') || 'vacant'}</span>)}</div>
          : list('Champions now', S.champions.map((x) => `${x.title}: ${x.holder}`), '')}
        {list(phase === 'review' ? 'The greatest matches' : 'Best matches', S.best.map((b) => `${b.a} vs ${b.b} · ${stars(b.stars)} · ${b.show}`), 'None yet.')}
        {list('Biggest moves', S.moves, 'Nobody moved.')}
        {list('Retirements', S.retired, 'Nobody retired.')}
        {phase === 'review'
          ? list('Rookies who made it', S.rookies.map((r) => `${r.name} · ${r.promo === 'TIS' ? 'indies' : r.promo}`), 'None yet.')
          : list('Debuts you’ll know', S.debuts, 'Nobody you’d know.')}
      </div>
      <div className="c-nav">
        {phase === 'review' || done
          ? <><button className="c-b2" onClick={onQuit}>{w('Menu')}</button><button className="c-b1" onClick={onPick}>{w('Choose your wrestler ›')}</button></>
          : <><button className="c-b2" onClick={onPick}>{w('Start my career here')}</button><button className="c-b1" onClick={() => setPhase('running')}>{w(cur.reached + 1 === cur.years ? 'The last year ›' : 'Next year ›')}</button></>}
      </div>
    </Screen>
  );
}
