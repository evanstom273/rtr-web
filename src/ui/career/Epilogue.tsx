import { findWrestler, fmtFans, fansTotal } from '../../data/rtr';
import { type Career } from '../../career';
import { fmtDay } from '../../career/dates';
import { Head, money, Screen, useWords } from './parts';

/** Retirement & Legacy: the career's over. What it added up to, and what next. */
export function Epilogue({ c, onRecords, onNew, onCarryOn }: { c: Career; onRecords: () => void; onNew: () => void; onCarryOn?: () => void }) {
  const { w } = useWords();
  const me = findWrestler(c.player)!;
  const wins = c.history.filter((m) => m.result === 'win').length;
  const titles = c.history.filter((m) => m.wonTitle).length;
  const best = [...c.history].sort((a, b) => b.stars - a.stars)[0];
  const earned = c.ledger.filter((e) => e.amount > 0 && e.kind !== 'start').reduce((t, e) => t + e.amount, 0);
  return (
    <Screen>
      <Head title={w('The Last Bell', 'RETIRED')} meta={c.over ? fmtDay(c.over, 'long') : ''} onBack={onRecords} back="Records" />
      <div className="c-body">
        <div className="c-start">
          <span className="c-lab">{w(`${c.startedOn.slice(0, 4)}–${(c.over ?? c.today).slice(0, 4)}`)}</span>
          <b className="c-sbig">{me.name}</b>
          <span className="c-val">{c.history.length} matches · {wins} wins · {titles} title win{titles === 1 ? '' : 's'} · {fmtFans(fansTotal(me))} fans</span>
        </div>
        <div className="c-kv">
          <span className="c-lab">{w('Best match')}</span><span className="c-val">{best ? `${best.stars}★ against ${best.oppName}, ${best.showName}` : '—'}</span>
          <span className="c-lab">{w('Earned')}</span><span className="c-val">{money(earned)} over the years</span>
          <span className="c-lab">{w('In the bank')}</span><span className="c-val">{money(c.money)}</span>
        </div>
        <span className="c-note">Your story stays in Records: every match, every reign.{onCarryOn ? ' Or carry on: run what you own, coach, book, or come back for one more.' : ' Thanks for playing it.'}</span>
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onRecords}>{w('Records')}</button>
        {onCarryOn ? <button className="c-b2" onClick={onNew}>{w('A new career')}</button> : null}
        <button className="c-b1" onClick={onCarryOn ?? onNew}>{w(onCarryOn ? 'Carry on ›' : 'A new career ›')}</button>
      </div>
    </Screen>
  );
}
