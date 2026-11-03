import { useEffect, useMemo, useState } from 'react';
import { findWrestler, TITLES } from '../../data/rtr';
import { countersWaiting, firstAskable, myBoutToday, promoName, showsOn, type Career, type Show } from '../../career';
import type { ReqRoute } from './Requests';
import { addDays, dateOf, dayOf, daysInMonth, fmtDay, MONTHS, monthOf, weekday, yearOf } from '../../career/dates';
import { stipulation } from '../../engine';
import { Nm, Screen, useToast, useWords } from './parts';

interface Props {
  c: Career;
  busy: number | null;
  onAdvance: () => void;
  onShowDay: () => void;
  onOpen: (screen: 'letters' | 'profile' | 'training' | 'records' | 'requests') => void;
  onAsk: (r: ReqRoute) => void;
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function mineOn(c: Career, day: string): { show: Show; indie: boolean } | null {
  for (const s of showsOn(c, day)) {
    if (s.card?.some((b) => b.a === c.player || b.b === c.player)) return { show: s, indie: s.promo === 'TIS' };
    if (c.indie[s.id] || c.tryouts[s.id]) return { show: s, indie: s.promo === 'TIS' };
  }
  return null;
}

/** The career home: the month, today's shows, and the way forward. */
export function Calendar({ c, busy, onAdvance, onShowDay, onOpen, onAsk }: Props) {
  const { skin, w } = useWords();
  const [view, setView] = useState(() => ({ y: yearOf(c.today), m: monthOf(c.today) }));
  const [sel, setSel] = useState(c.today);
  const [open, setOpen] = useState<string | null>(null);
  const [toast] = useToast();
  // When the day moves on, the calendar follows it.
  useEffect(() => {
    setSel(c.today);
    setView({ y: yearOf(c.today), m: monthOf(c.today) });
  }, [c.today]);
  const me = findWrestler(c.player)!;
  const p = c.people[c.player]!;
  const mine = myBoutToday(c);

  const cells = useMemo(() => {
    const first = dayOf(view.y, view.m, 1);
    const lead = (weekday(first) + 6) % 7;
    const start = addDays(first, -lead);
    const n = Math.ceil((lead + daysInMonth(view.y, view.m)) / 7) * 7;
    return Array.from({ length: n }, (_, i) => addDays(start, i));
  }, [view]);

  const shows = showsOn(c, sel).sort((a, b) => {
    const am = mineOn(c, sel)?.show.id === a.id ? -1 : 0, bm = mineOn(c, sel)?.show.id === b.id ? -1 : 0;
    return am - bm || (a.promo === 'TIS' ? 1 : 0) - (b.promo === 'TIS' ? 1 : 0) || a.name.localeCompare(b.name);
  });
  const sheet = open ? c.shows[open] : undefined;
  const contract = p.contract;
  const sub = [
    contract ? `${contract.promo} · contract to ${fmtDay(contract.end, 'dm')} ${contract.end.slice(0, 4)}` : 'Free agent',
    p.injury ? `injured to ${fmtDay(p.injury.until, 'dm')}` : p.fatigue >= 60 ? 'tired' : p.fatigue >= 30 ? 'worn' : 'fresh',
  ].join(' · ');
  const waiting = countersWaiting(c).length;
  const unread = c.letters.filter((l) => !l.read).length;
  const next = useMemo(() => {
    for (let i = 1; i < 60; i++) {
      const d = addDays(c.today, i);
      const m = mineOn(c, d);
      if (m) return `${fmtDay(d, 'dm')}: ${m.show.name}`;
    }
    return null;
  }, [c, c.today]);

  const status = (s: Show): { text: string; hot: boolean } => {
    const b = s.card?.find((x) => x.a === c.player || x.b === c.player);
    if (b) {
      const opp = findWrestler(b.a === c.player ? b.b : b.a);
      return { text: `${w('Your match', 'Your match')}: vs ${opp?.name ?? '?'}${b.title ? ' · title' : ''}`, hot: true };
    }
    if (c.indie[s.id]) return { text: 'You’re booked (card not drawn up yet)', hot: true };
    if (c.tryouts[s.id]) return { text: 'Your tryout (card not drawn up yet)', hot: true };
    if (s.done) return { text: 'Results in', hot: false };
    if (s.card) return { text: `${s.card.length} matches on the card`, hot: false };
    return { text: s.promo === 'TIS' ? 'Indie show · card not drawn up yet' : 'Card not drawn up yet', hot: false };
  };

  return (
    <Screen>
      <div className="c-hdr">
        <span className="c-edge" style={{ background: `var(--cr-${me.disposition === 'HEEL' ? 'heel' : 'face'})` }} />
        <button className="c-who" onClick={() => onOpen('profile')} style={{ background: 'none', border: 0, textAlign: 'left', color: 'inherit' }}>
          <b>{me.name}</b>
          <span>{sub}</span>
        </button>
        <div className="c-date">
          <span>{fmtDay(c.today).split(' ')[0]!.toUpperCase().replace(',', '')}</span>
          <b>{dateOf(c.today)} {MONTHS[monthOf(c.today)]!.slice(0, 3).toUpperCase()}</b>
        </div>
      </div>

      <div className="c-month">
        <button aria-label="Previous month" onClick={() => setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))}>‹</button>
        <span>{w(`${MONTHS[view.m]} ${view.y}`)}</span>
        <button aria-label="Next month" onClick={() => setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))}>›</button>
      </div>

      <div className="c-grid">
        {DOW.map((d, i) => <span key={i} className="c-dow">{d}</span>)}
        {cells.map((d) => {
          const out = monthOf(d) !== view.m;
          const m = mineOn(c, d);
          const n = showsOn(c, d).length;
          const cls = ['c-dcell', out && 'out', d < c.today && 'past', d === sel && 'sel', d === c.today && 'today', p.injury && d >= c.today && d < p.injury.until && 'hurt'].filter(Boolean).join(' ');
          return (
            <button key={d} className={cls} onClick={() => { setSel(d); if (out) setView({ y: yearOf(d), m: monthOf(d) }); }} aria-label={`${fmtDay(d, 'long')}: ${n} shows${m ? ', you’re booked' : ''}`}>
              <b>{dateOf(d)}</b>
              <span className="c-tags">
                {m && <span className={`c-mine${m.indie ? ' indie' : ''}`}>{m.indie ? 'INDIE' : m.show.promo}</span>}
                {n > 0 && <span className="c-more">{n}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <button className="c-adv" onClick={mine ? onShowDay : onAdvance} disabled={busy !== null}>
        <span>
          <b>{mine ? w('To the show', 'To the show') : w('Next day', 'Advance day')}</b>
          <span>{mine ? `${mine.show.name} · vs ${findWrestler(mine.bout.a === c.player ? mine.bout.b : mine.bout.a)?.name}` : next ? `Next booking: ${next}` : 'Nothing booked yet'}</span>
        </span>
        <i>›</i>
      </button>

      <div className="c-day">
        <div className="c-dayh">
          <b>{sel === c.today ? w('Today', 'Today') : w(fmtDay(sel, 'long'), fmtDay(sel))}</b>
          <span>{shows.length} {shows.length === 1 ? 'show' : 'shows'}</span>
        </div>
        <div className="c-shows">
          {shows.length === 0 && <span className="c-empty">No shows anywhere this day.</span>}
          {shows.map((s) => {
            const st = status(s);
            return (
              <button key={s.id} className={`c-show${st.hot ? ' mine' : ''}`} onClick={() => setOpen(s.id)}>
                <span className="c-p">{s.promo === 'TIS' ? 'INDIE' : s.promo}</span>
                <span className="c-n"><b>{s.name}</b><span className={st.hot ? 'hot' : ''}>{st.text}</span></span>
                <span className="c-w">{s.city} ›</span>
              </button>
            );
          })}
        </div>
      </div>

      <nav className="c-tabs4 five">
        <button onClick={() => onOpen('letters')}>{skin === 'paper' ? 'Letters' : 'Mail'}{unread > 0 && <span className="c-badge">{unread}</span>}</button>
        <button onClick={() => onOpen('profile')}>{w('Career')}</button>
        <button onClick={() => onOpen('training')}>{w('Training')}</button>
        <button onClick={() => onOpen('records')}>{skin === 'paper' ? 'Records' : 'DATABASE'}</button>
        <button onClick={() => onOpen('requests')}>{w('Requests')}{waiting > 0 && <span className="c-badge">{waiting}</span>}</button>
      </nav>

      {sheet && (
        <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div>
            <div className="c-sh">
              <div>
                <span>{sheet.promo === 'TIS' ? 'The Indie Scene' : promoName(sheet.promo)} · {fmtDay(sheet.date, 'dm')} · {sheet.city}, {sheet.country}</span>
                <b>{sheet.name}</b>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close the card">✕</button>
            </div>
            <div className="c-rows">
              {!sheet.card && <span className="c-empty">The card isn’t drawn up yet. Bookers settle cards about a week out.</span>}
              {sheet.card?.map((b, i) => {
                const mineRow = b.a === c.player || b.b === c.player;
                const notes = [
                  b.title ? TITLES.find((t) => t.id === b.title)?.name : '',
                  b.stip ? stipulation(b.stip).name : '',
                  b.feud ? 'feud' : '',
                  b.result ? `${b.result.winner ? `${findWrestler(b.result.winner)?.name} wins` : 'draw'} · ${b.result.stars}★` : '',
                ].filter(Boolean).join(' · ');
                return (
                  <div key={i} className={`c-row${mineRow ? ' mine' : ''}`}>
                    <b><Nm id={b.a} /> <span className="c-vsx">vs</span> <Nm id={b.b} /></b>
                    <span>{i === sheet.card!.length - 1 ? 'MAIN EVENT' : i === 0 ? 'OPENER' : `MATCH ${i + 1}`}{notes ? ` · ${notes.toUpperCase()}` : ''}</span>
                  </div>
                );
              })}
            </div>
            {(() => {
              // Requests shortcuts: your promotion's shows and indie shows beyond the drawn week.
              const promo = p.contract?.promo;
              const onIt = !!c.indie[sheet.id] || !!sheet.card?.some((b) => b.a === c.player || b.b === c.player);
              const mine = !!promo && (sheet.promos ?? [sheet.promo]).includes(promo) && sheet.promo !== 'TIS';
              const indie = sheet.promo === 'TIS';
              if (sheet.done || onIt || (!mine && !indie)) return null;
              if (sheet.date < firstAskable(c)) return sheet.date >= c.today ? <span className="c-note">{w('Cards for the next seven days are set.', 'Cards for the next 7 days are set')}</span> : null;
              return <button className="c-b1" style={{ marginTop: 6 }} onClick={() => { setOpen(null); onAsk(mine ? { req: 'book', tab: 0, show: sheet.id } : { req: 'spot', show: sheet.id }); }}>{w(mine ? 'Ask to be on this ›' : 'Ask for a spot ›')}</button>;
            })()}
          </div>
        </div>
      )}
      {busy !== null && (
        <div className="c-busy">
          <span>{w('The world wrestles…', 'Simulating the day')}</span>
          <i style={{ ['--p' as string]: `${Math.round(busy * 100)}%` }}><b /></i>
        </div>
      )}
      {toast}
    </Screen>
  );
}
