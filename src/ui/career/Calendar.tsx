import { useEffect, useMemo, useState } from 'react';
import { activeWorld } from '../../world/world';
import { findWrestler, TITLES } from '../../data/rtr';
import { activityAt, dropGig, isPhoneLetter, ordersOf, phoneOn, phoneUnread, hustleOf, showWorkPay, workShow, countersWaiting, cupLabel, firstAskable, myBoutToday, phaseOf, promoName, roundName, routineOf, showsOn, type Activity, type Career, type Show, type SkipTarget } from '../../career';
import { FEATURES } from '../../career/tuning';
import type { ReqRoute } from './Requests';
import { addDays, dateOf, dayOf, daysInMonth, fmtDay, MONTHS, monthOf, weekday, yearOf } from '../../career/dates';
import { stipulation } from '../../engine';
import { EventPopup } from './EventCard';
import { commit, money, Nm, Screen, useToast, useWords } from './parts';
import { boutKind, vsLine } from '../../career/bouts';

const nameOf = (id: string): string => findWrestler(id)?.name ?? '?';

interface Props {
  c: Career;
  busy: number | null;
  /** A skip under way: stop it. */
  skipping?: boolean;
  onStop?: () => void;
  onSkip?: (t: SkipTarget) => void;
  /** Why a skip stopped (a new object each time, so the same reason shows again). */
  note?: { text: string } | null;
  /** What your character answered while you were away. */
  awayLog?: string[] | null;
  onAwayDone?: () => void;
  onAdvance: () => void;
  onShowDay: () => void;
  onOpen: (screen: 'letters' | 'profile' | 'training' | 'records' | 'requests' | 'phone' | 'office' | 'life') => void;
  onAsk: (r: ReqRoute) => void;
  onNegotiate: (offerId: string) => void;
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOING: Record<Activity, string> = { show: 'wrestling', travel: 'travelling', moving: 'moving house', work: 'at work', train: 'training', rest: 'resting', hustle: 'on a side gig', content: 'making content', social: 'seeing people', office: 'in the office' };

function mineOn(c: Career, day: string): { show: Show; indie: boolean } | null {
  for (const s of showsOn(c, day)) {
    if (s.card?.some((b) => b.a === c.player || b.b === c.player)) return { show: s, indie: s.promo === 'TIS' };
    if (c.indie[s.id] || c.tryouts[s.id]) return { show: s, indie: s.promo === 'TIS' };
  }
  return null;
}

/** The career home: the month, today's shows, and the way forward. */
/** An indie show's brand and the promoter putting it on. */
function brandLine(s: Show): string {
  const P = activeWorld().people;
  const b = s.brand ? P?.brands[s.brand] : undefined;
  if (!b) return 'The Indie Scene';
  const who = b.promoter ? P!.staff[b.promoter]?.name : undefined;
  return who ? `${b.name} · ${who}` : b.name;
}

export function Calendar({ c, busy, skipping, onStop, onSkip, note, awayLog, onAwayDone, onAdvance, onShowDay, onOpen, onAsk, onNegotiate }: Props) {
  const { skin, w } = useWords();
  const [view, setView] = useState(() => ({ y: yearOf(c.today), m: monthOf(c.today) }));
  const [sel, setSel] = useState(c.today);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, say] = useToast();
  const [skipSheet, setSkipSheet] = useState(false);
  // Skip a number of days of your choosing (1–365).
  // What's typed (so the box can be cleared mid-edit) and the number it means: 0 while it's empty.
  const [nText, setNText] = useState('14');
  const nDays = Math.min(365, Number(nText) || 0);
  const setNDays = (n: number) => setNText(String(Math.max(1, Math.min(365, n))));
  useEffect(() => { if (note) say(note.text); }, [note, say]);
  // When the day moves on, the calendar follows it.
  useEffect(() => {
    setSel(c.today);
    setView({ y: yearOf(c.today), m: monthOf(c.today) });
  }, [c.today]);
  const me = findWrestler(c.player)!;
  const p = c.people[c.player]!;
  const mine = myBoutToday(c);
  // Days on: an AM and a PM. Your match is the PM; the morning is yours.
  const days = FEATURES.days;
  const ph = phaseOf(c);
  const toShow = !!mine && (!days || ph === 'pm');
  const doing = days ? DOING[activityAt(c, c.today, ph)] : '';

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
  const unread = c.letters.filter((l) => !l.read && !isPhoneLetter(l)).length;
  const texts = phoneUnread(c);
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
      // A crowd's too long for the row: say what kind (the button above says who).
      return { text: `${w('Your match', 'Your match')}: ${b.sides ? (boutKind(b) ?? 'match').toLowerCase() : vsLine(b, c.player, nameOf)}${b.title ? ' · title' : ''}`, hot: true };
    }
    if (c.indie[s.id]) return { text: 'You’re booked (card not drawn up yet)', hot: true };
    if (c.tryouts[s.id]) return { text: 'Your tryout (card not drawn up yet)', hot: true };
    if (s.done) return { text: 'Results in', hot: false };
    if (s.card) return { text: `${s.card.length} matches on the card`, hot: false };
    return { text: s.promo === 'TIS' && !s.special ? 'Indie show · card not drawn up yet' : 'Card not drawn up yet', hot: false };
  };
  /** One-offs say what they are: "Charity: food bank", "Farewell: Name", "The Leeds Cup · Semi-final". */
  const tagOf = (s: Show) => (s.special ? cupLabel(c, s) ?? s.special.tag : null);
  const promoLabel = (s: Show) => (s.special?.kind === 'crossover' && s.promos ? s.promos.join('×') : s.promo === 'TIS' ? 'INDIE' : s.promo);

  return (
    <Screen>
      <div className={`c-hdr${phoneOn() ? ' withphone' : ''}`}>
        <span className="c-edge" style={{ background: `var(--cr-${me.disposition === 'HEEL' ? 'heel' : 'face'})` }} />
        <button className="c-who" onClick={() => onOpen('profile')} style={{ background: 'none', border: 0, textAlign: 'left', color: 'inherit' }}>
          <b>{me.name}</b>
          <span>{sub}</span>
        </button>
        {phoneOn() && <button className="c-phoneb" onClick={() => onOpen('phone')} aria-label={`Phone${texts ? `, ${texts} unread` : ''}`}>{w('Phone')}{texts > 0 && <span className="c-badge">{texts}</span>}</button>}
        <div className="c-date">
          <span>{fmtDay(c.today).split(' ')[0]!.toUpperCase().replace(',', '')}{days ? ` · ${ph.toUpperCase()}` : ''}</span>
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

      <div className="c-advrow">
        <button className="c-adv" onClick={toShow ? onShowDay : onAdvance} disabled={busy !== null}>
          <span>
            <b>{toShow ? w('To the show', 'To the show') : days ? (ph === 'am' ? w('On to the evening', 'To PM') : w('On to tomorrow', 'Next day')) : w('Next day', 'Advance day')}</b>
            <span>{mine ? `${days && !toShow ? `This morning: ${doing} · tonight ` : ''}${mine.show.name} · ${vsLine(mine.bout, c.player, nameOf)}`
              : `${days ? `This ${ph === 'am' ? 'morning' : 'evening'}: ${doing} · ` : ''}${next ? `Next booking: ${next}` : 'Nothing booked yet'}`}</span>
          </span>
          <i>›</i>
        </button>
        {FEATURES.skip && onSkip && <button className="c-skipb" onClick={() => setSkipSheet(true)} disabled={busy !== null} aria-label="Skip ahead"><b>»</b><span>{w('Skip')}</span></button>}
      </div>

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
                <span className="c-p">{promoLabel(s)}</span>
                <span className="c-n"><b>{s.name}</b><span className={st.hot ? 'hot' : ''}>{tagOf(s) && !st.hot ? `${tagOf(s)} · ` : ''}{st.text}</span></span>
                <span className="c-w">{s.city} ›</span>
              </button>
            );
          })}
        </div>
      </div>

      <nav className={`c-tabs4 ${['four', 'five', 'six', 'seven'][3 + (FEATURES.booker ? 1 : 0) + (FEATURES.life ? 1 : 0) - 2]}`}>
        <button onClick={() => onOpen('letters')}>{skin === 'paper' ? 'Letters' : 'Mail'}{unread > 0 && <span className="c-badge">{unread}</span>}</button>
        <button onClick={() => onOpen('profile')}>{w('Career')}</button>
        <button onClick={() => onOpen('training')}>{w('Training')}</button>
        <button onClick={() => onOpen('records')}>{skin === 'paper' ? 'Records' : 'DATABASE'}</button>
        <button onClick={() => onOpen('requests')}>{w('Requests')}{waiting > 0 && <span className="c-badge">{waiting}</span>}</button>
        {FEATURES.life && <button onClick={() => onOpen('life')}>{w('Life')}</button>}
        {FEATURES.booker && <button onClick={() => onOpen('office')}>{w('Office')}</button>}
      </nav>

      {sheet && (
        <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && setOpen(null)}>
          <div>
            <div className="c-sh">
              <div>
                <span>{sheet.special?.kind === 'crossover' && sheet.promos ? sheet.promos.map(promoName).join(' × ') : sheet.promo === 'TIS' ? brandLine(sheet) : promoName(sheet.promo)} · {fmtDay(sheet.date, 'dm')} · {sheet.city}, {sheet.country}</span>
                <b>{sheet.name}</b>
                {tagOf(sheet) && <span className="c-hot">{tagOf(sheet)}{sheet.special?.noTitles ? ' · no titles on the line' : ''}</span>}
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
                  b.tourney ? `cup ${roundName(b.tourney.round)}` : '',
                  b.farewell ? 'farewell match' : '',
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
              const work = FEATURES.hustles && indie && !onIt && sheet.date > c.today && !sheet.id.startsWith('own|') ? (
                hustleOf(c).gigs[`work|${sheet.id}`]
                  ? <div className="c-rowsb" style={{ marginTop: 6 }}><span className="c-val">{w('You’re working this show')}</span><button className="c-chip" onClick={() => { dropGig(c, `work|${sheet.id}`); commit(); say('Cancelled.'); }}>{w('Cancel')}</button></div>
                  : <div className="c-chips" style={{ marginTop: 6 }}>{(['ref', 'crew', 'commentary'] as const).map((r) => <button key={r} className="c-chip" onClick={() => { say(workShow(c, sheet, r)); commit(); }}>{w(`${r === 'ref' ? 'Referee' : r === 'crew' ? 'Ring crew' : 'Commentary'} · ${money(showWorkPay(c, r, sheet))}`)}</button>)}</div>
              ) : null;
              if (sheet.date < firstAskable(c)) return <>{work}{sheet.date >= c.today ? <span className="c-note">{w('Cards for the next seven days are set.', 'Cards for the next 7 days are set')}</span> : null}</>;
              return <>{work}<button className="c-b1" style={{ marginTop: 6 }} onClick={() => { setOpen(null); onAsk(mine ? { req: 'book', tab: 0, show: sheet.id } : { req: 'spot', show: sheet.id }); }}>{w(mine ? 'Ask to be on this ›' : 'Ask for a spot ›')}</button></>;
            })()}
          </div>
        </div>
      )}
      {skipSheet && onSkip && (
        <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && setSkipSheet(false)}>
          <div>
            <div className="c-sh">
              <div><span>{w('Time', 'Skip ahead')}</span><b>{w('Skip ahead')}</b></div>
              <button onClick={() => setSkipSheet(false)} aria-label="Close">✕</button>
            </div>
            {([
              ['day', days ? 'To tomorrow morning' : 'A day', days ? 'The rest of today' : 'One day'],
              [{ days: 7 }, 'A week', `To ${fmtDay(addDays(c.today, 7), 'long')}`],
              [{ days: 30 }, 'A month', `To ${fmtDay(addDays(c.today, 30), 'long')}`],
              ['booking', 'To my next booking', next ?? 'Nothing booked: up to 60 days'],
            ] as [SkipTarget, string, string][]).map(([t, l, d]) => (
              <button key={l} className="c-ans" style={{ padding: '8px 10px' }} onClick={() => { setSkipSheet(false); onSkip(t); }}>
                <b className="c-at" style={{ fontSize: 16 }}>{w(l)}</b><span className="c-ad">{d}</span>
              </button>
            ))}
            <div className="c-ans c-skipn" style={{ padding: '8px 10px' }}>
              <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{w('A number of days')}</b><span className="c-ad">{nDays ? `To ${fmtDay(addDays(c.today, nDays), 'long')}` : '1 to 365'}</span></span>
              <div className="c-cyc">
                <button className="c-stepb" onClick={() => setNDays(Math.max(1, nDays - 1))} aria-label="One day fewer">−</button>
                <input className="c-fld mid" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} value={nText} aria-label="Days to skip"
                  onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); setNText(d && Number(d) > 365 ? '365' : d); }}
                  onBlur={() => { if (nText) setNDays(Number(nText)); }} style={{ textAlign: 'center', fontSize: 18 }} />
                <button className="c-stepb" onClick={() => setNDays(Math.min(365, nDays + 1))} aria-label="One day more">+</button>
                <button className="c-b1" style={{ minHeight: 44, padding: '0 14px' }} disabled={!nDays} onClick={() => { setSkipSheet(false); onSkip({ days: nDays }); }}>{w('Go ›')}</button>
              </div>
            </div>
            <span className="c-lab" style={{ marginTop: 4 }}>{w('Your mail')}</span>
            <div className="c-chips">
              {[[true, 'Answer it for me'], [false, 'Leave it for me']].map(([v, l]) => (
                <button key={String(l)} className={`c-chip${ordersOf(c).on === v ? ' on' : ''}`} onClick={() => { ordersOf(c).on = v as boolean; commit(); }}>{w(l as string)}</button>
              ))}
            </div>
            <span className="c-lab" style={{ marginTop: 4 }}>{w('Your matches')}</span>
            <div className="c-chips">
              {[[false, 'Stop for them'], [true, 'Sim them']].map(([v, l]) => (
                <button key={String(l)} className={`c-chip${routineOf(c).simMine === v ? ' on' : ''}`} onClick={() => { routineOf(c).simMine = v as boolean; commit(); }}>{w(l as string)}</button>
              ))}
            </div>
            {FEATURES.mail && (
              <>
                <span className="c-lab" style={{ marginTop: 4 }}>{w('Stop for mail')}</span>
                <div className="c-chips">
                  {([['decisions', 'Decisions'], ['people', 'People'], ['checkins', 'Check-ins'], ['news', 'News & results']] as const).map(([k, label]) => {
                    const f = routineOf(c).stopFor ?? { decisions: true, people: true, checkins: true, news: true };
                    return <button key={k} className={`c-chip${f[k] ? ' on' : ''}`} onClick={() => { routineOf(c).stopFor = { ...f, [k]: !f[k] }; commit(); }}>{w(label)}</button>;
                  })}
                </div>
              </>
            )}
            <span className="c-note">A skip does everything pressing on does, and stops for anything that needs you: your match, {FEATURES.mail ? 'the mail you’ve ticked' : 'a letter to answer'}, an injury, a contract, news from work.</span>
          </div>
        </div>
      )}
      {awayLog && awayLog.length > 0 && busy === null && (
        <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onAwayDone?.()}>
          <div>
            <div className="c-sh"><div><span>{w('While you were away')}</span><b>{w(`${awayLog.length} thing${awayLog.length === 1 ? '' : 's'} handled`)}</b></div><button onClick={onAwayDone} aria-label="Close">✕</button></div>
            <div className="c-rows">{awayLog.map((x, i) => <span key={i} className="c-dline">{x}</span>)}</div>
            <span className="c-note">Set what your character does in My week › Away.</span>
            <button className="c-b1" onClick={onAwayDone}>{w('Got it')}</button>
          </div>
        </div>
      )}
      {busy === null && !awayLog?.length && <EventPopup c={c} onNegotiate={onNegotiate} />}
      {busy !== null && (
        <div className="c-busy">
          <span>{skipping ? `${w('Skipping ahead', 'Skipping')} · ${fmtDay(c.today, 'dm')}${days ? ` ${ph.toUpperCase()}` : ''}` : w('The world wrestles…', 'Simulating the day')}</span>
          <i style={{ ['--p' as string]: `${Math.round(busy * 100)}%` }}><b /></i>
          {skipping && onStop && <button className="c-b2" style={{ minHeight: 44, padding: '0 22px' }} onClick={onStop}>{w('Stop')}</button>}
        </div>
      )}
      {toast}
    </Screen>
  );
}
