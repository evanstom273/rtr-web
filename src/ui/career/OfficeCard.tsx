import { useEffect, useMemo, useRef, useState } from 'react';
import {
  autoBook, bookerPool, canBook, CARD_MAX, cardIssues, FINISH_LABEL, roundBouts, SEG_LABEL, SEG_WHO, setCard, showsDone, showsToBook, STIPS, titlesFor, watchBout,
  type BookedFinish, type Bout, type Career, type Segment, type SegKind, type Show,
} from '../../career';
import { findWrestler } from '../../data/rtr';
import { fmtDay } from '../../career/dates';
import { stipulation } from '../../engine/stipulations';
import type { LogEntry } from '../../engine/types';
import { commit, stars, useWords } from './parts';

const nm = (id: string) => findWrestler(id)?.name ?? id;
const FINISHES: BookedFinish[] = ['clean', 'cheat', 'dq', 'countout', 'nocontest'];
const SEG_KINDS = Object.keys(SEG_LABEL) as SegKind[];

/** The Card tab (booker mode, stage 2): book a show's matches and segments, watch them on the night, see how it went. */
export function OfficeCard({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const ahead = showsToBook(c, promo);
  const last = showsDone(c, promo)[0];
  const [sel, setSel] = useState<string | null>(ahead[0]?.id ?? last?.id ?? null);
  const show = sel ? c.shows[sel] : undefined;
  return (
    <>
      <div className="c-chips">
        {last && <button className={`c-chip${sel === last.id ? ' on' : ''}`} onClick={() => setSel(last.id)}>{w('Last show')}</button>}
        {ahead.map((s) => <button key={s.id} className={`c-chip${sel === s.id ? ' on' : ''}`} onClick={() => setSel(s.id)}>{fmtDay(s.date, 'dm')}{s.card ? ' ✓' : ''}</button>)}
      </div>
      {!show ? <span className="c-note">No shows coming up. Set a schedule.</span>
        : show.done ? <Results show={show} />
        : <Booking key={show.id + (show.card ? 'b' : 'n')} c={c} show={show} say={say} />}
    </>
  );
}

function Results({ show }: { show: Show }) {
  const { w } = useWords();
  return (
    <>
      <div className="c-start">
        <b className="c-at">{show.name}</b>
        <span className="c-hint">{fmtDay(show.date, 'long')} · {show.city}{show.booked === 'staff' ? ' · booked by your staff' : ''}</span>
        {show.rating && <span className="c-val"><b>{stars(show.rating.score)}</b> · {show.rating.notes.join(' ')}</span>}
      </div>
      <span className="c-sec">{w('Results')}</span>
      {(show.card ?? []).map((b, i) => (
        <div key={i} className="c-rowsb">
          <span className="c-val">{nm(b.a)} vs {nm(b.b)}</span>
          <span className="c-hint">{b.result ? `${b.result.winner ? nm(b.result.winner) : b.result.finish === 'NO_CONTEST' ? 'No contest' : 'Draw'}${b.result.finish === 'DISQUALIFICATION' ? ' (DQ)' : b.result.finish === 'COUNT_OUT' ? ' (count-out)' : ''} · ${stars(b.result.stars)}` : 'Didn’t happen'}</span>
        </div>
      ))}
      {(show.segments ?? []).filter((g) => g.score !== undefined).map((g, i) => (
        <div key={`s${i}`} className="c-rowsb"><span className="c-val">{SEG_LABEL[g.kind]}: {g.who.map(nm).join(' & ')}</span><span className="c-hint">{stars(g.score!)} · {g.note}</span></div>
      ))}
      {show.rating && <div className="c-kv">{show.rating.parts.map(([k, v]) => <span key={k} style={{ display: 'contents' }}><span className="c-lab">{w(k)}</span><span className="c-val">{v}</span></span>)}</div>}
    </>
  );
}

function Booking({ c, show, say }: { c: Career; show: Show; say: (s: string) => void }) {
  const { w } = useWords();
  const [card, setCardDraft] = useState<Bout[] | null>(show.card ? structuredClone(show.card) : null);
  const [segs, setSegs] = useState<Segment[]>(() => structuredClone(show.segments ?? []));
  const [sheet, setSheet] = useState<'match' | 'seg' | null>(null);
  const [watching, setWatching] = useState<{ log: LogEntry[]; text: string } | null>(null);
  const no = canBook(c, show);
  const pool = useMemo(() => bookerPool(c, show), [c, show]);
  const started = show.card?.some((b) => b.result);
  const tonight = show.date === c.today && !!show.card;
  const save = () => { say(setCard(c, show.id, card ?? [], segs)); commit(); };
  const staff = () => { say(autoBook(c, show.id)); commit(); setCardDraft(show.card ? structuredClone(show.card) : []); setSegs(structuredClone(show.segments ?? [])); };
  const move = (i: number, d: number) => {
    if (!card) return;
    const j = i + d;
    if (j < 0 || j >= card.length) return;
    const next = [...card];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setCardDraft(next);
  };
  const drop = (i: number) => { setCardDraft(card!.filter((_, k) => k !== i)); setSegs(segs.filter((g) => g.after < card!.length - 1).map((g) => (g.after >= i ? { ...g, after: Math.max(-1, g.after - 1) } : g))); };
  const changed = JSON.stringify(card ?? null) !== JSON.stringify(show.card ?? null) || JSON.stringify(segs) !== JSON.stringify(show.segments ?? []);
  const issues = card ? cardIssues(c, show, card, segs) : [];
  const watch = (i: number) => {
    const r = watchBout(c, show.id, i);
    commit();
    if (typeof r === 'string') say(r);
    else { setWatching(r); setCardDraft(structuredClone(show.card!)); }
  };

  return (
    <>
      <div className="c-start">
        <b className="c-at">{show.name}</b>
        <span className="c-hint">{fmtDay(show.date, 'long')} · {show.city} · {show.kind === 'weekly' ? 'regular show' : show.kind}{show.booked ? ` · booked by ${show.booked === 'player' ? 'you' : 'your staff'}` : ''}</span>
      </div>
      {!card ? (
        <>
          <span className="c-note">Not booked yet. If you leave it, your staff book it the night before.</span>
          <button className="c-b1" disabled={!!no} onClick={() => setCardDraft(roundBouts(c, show))}>{no ?? w('Book it ›')}</button>
          <button className="c-b3" disabled={!!no} onClick={staff}>{w('Let the staff book it now')}</button>
        </>
      ) : (
        <>
          <span className="c-sec">{w('Running order')} · {card.length} {card.length === 1 ? 'match' : 'matches'}, {segs.length} segment{segs.length === 1 ? '' : 's'}</span>
          <div className="c-rows">
            {segs.filter((g) => g.after === -1).map((g) => <SegRow key={`s-1${g.who.join()}${g.kind}`} g={g} onDrop={started ? undefined : () => setSegs(segs.filter((x) => x !== g))} />)}
            {card.map((b, i) => (
              <div key={`${b.a}${b.b}${i}`} style={{ display: 'contents' }}>
                <div className="c-ans" style={{ padding: '6px 8px' }}>
                  <span className="c-rowsb">
                    <b className="c-at" style={{ fontSize: 15 }}>{nm(b.a)} vs {nm(b.b)}</b>
                    <span className="c-hint">{i === card.length - 1 ? 'MAIN EVENT' : i === 0 ? 'OPENER' : `MATCH ${i + 1}`}</span>
                  </span>
                  <span className="c-ad">
                    {[b.title ? titlesFor(show).find((t) => t.id === b.title)?.name : '', b.stip && b.stip !== 'standard' ? stipulation(b.stip).name : '',
                      b.result ? `${b.result.winner ? nm(b.result.winner) : 'No contest'} · ${stars(b.result.stars)}` : b.planned ? `${nm(b.planned)} wins · ${FINISH_LABEL[b.finish ?? 'clean']}` : b.finish === 'nocontest' ? 'No contest' : 'Winner: theirs to decide'].filter(Boolean).join(' · ')}
                  </span>
                  {!started && (
                    <span className="c-chips" style={{ marginTop: 4 }}>
                      <button className="c-chip" onClick={() => move(i, -1)} aria-label="Earlier">↑</button>
                      <button className="c-chip" onClick={() => move(i, 1)} aria-label="Later">↓</button>
                      <button className="c-chip" onClick={() => drop(i)}>{w('Drop')}</button>
                    </span>
                  )}
                  {tonight && !b.result && b.a !== c.player && b.b !== c.player && !changed && <button className="c-chip" style={{ marginTop: 4 }} onClick={() => watch(i)}>{w('Watch it ›')}</button>}
                </div>
                {segs.filter((g) => g.after === i).map((g) => <SegRow key={`s${i}${g.who.join()}${g.kind}`} g={g} onDrop={started ? undefined : () => setSegs(segs.filter((x) => x !== g))} />)}
              </div>
            ))}
          </div>
          {!started && (
            <>
              <div className="c-chips">
                <button className="c-chip" disabled={card.length >= CARD_MAX.matches} onClick={() => setSheet('match')}>{w('+ Match')}</button>
                <button className="c-chip" disabled={segs.length >= CARD_MAX.segments} onClick={() => setSheet('seg')}>{w('+ Segment')}</button>
                <button className="c-chip" onClick={staff}>{w('Staff: rebook it')}</button>
              </div>
              {issues.map((x) => <span key={x} className="c-note">• {x}</span>)}
              <button className="c-b1" disabled={!changed || !!no} onClick={save}>{no ?? (changed ? w('Save the card') : w('Saved'))}</button>
            </>
          )}
          {tonight && <span className="c-note">Tonight: watch any match as it happens (what you watch is what happens). The rest are wrestled when the night runs.</span>}
        </>
      )}
      {sheet === 'match' && card && <MatchSheet show={show} pool={pool.filter((x) => !card.some((b) => b.a === x.id || b.b === x.id))} onClose={() => setSheet(null)} onAdd={(b) => { setCardDraft([...card, b]); setSheet(null); }} />}
      {sheet === 'seg' && card && <SegSheet card={card} pool={pool} onClose={() => setSheet(null)} onAdd={(g) => { setSegs([...segs, g]); setSheet(null); }} />}
      {watching && <Watch log={watching.log} text={watching.text} onClose={() => setWatching(null)} />}
    </>
  );
}

function SegRow({ g, onDrop }: { g: Segment; onDrop?: () => void }) {
  const { w } = useWords();
  return (
    <div className="c-rowsb" style={{ padding: '2px 8px', borderLeft: '3px solid var(--cr-hi)' }}>
      <span className="c-val">{SEG_LABEL[g.kind]}: {g.who.map(nm).join(' & ')}{g.score !== undefined ? ` · ${stars(g.score)}` : ''}</span>
      {onDrop && <button className="c-chip" onClick={onDrop}>{w('Drop')}</button>}
    </div>
  );
}

function MatchSheet({ show, pool, onClose, onAdd }: { show: Show; pool: ReturnType<typeof bookerPool>; onClose: () => void; onAdd: (b: Bout) => void }) {
  const { w } = useWords();
  const [a, setA] = useState(pool[0]?.id ?? '');
  const ga = findWrestler(a)?.gender;
  const others = pool.filter((x) => x.id !== a && x.gender === ga);
  const [bId, setB] = useState('');
  const b = others.some((x) => x.id === bId) ? bId : others[0]?.id ?? '';
  const titles = titlesFor(show).filter((t) => (t.gender === 'FEMALE') === (ga === 'FEMALE'));
  const [title, setTitle] = useState('');
  const [stip, setStip] = useState<string>('standard');
  const [win, setWin] = useState<'a' | 'b' | ''>('a');
  const [finish, setFinish] = useState<BookedFinish>('clean');
  const holderOk = !title || !titles.find((t) => t.id === title)?.holder || [a, b].includes(titles.find((t) => t.id === title)!.holder!);
  const planned = finish === 'nocontest' ? undefined : win === 'a' ? a : win === 'b' ? b : undefined;
  return (
    <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div>
        <div className="c-sh"><div><span>{show.name}</span><b>{w('Add a match')}</b></div><button onClick={onClose} aria-label="Close">✕</button></div>
        <select className="c-fld" value={a} onChange={(e) => setA(e.target.value)} aria-label="First wrestler">{pool.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <span className="c-lab">{w('against')}</span>
        <select className="c-fld" value={b} onChange={(e) => setB(e.target.value)} aria-label="Second wrestler">{others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {titles.length > 0 && (
          <select className="c-fld" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title">
            <option value="">{w('No title on the line')}</option>
            {titles.map((t) => <option key={t.id} value={t.id}>{t.name}{t.holder ? ` (${nm(t.holder)})` : ' (vacant)'}</option>)}
          </select>
        )}
        <select className="c-fld" value={stip} onChange={(e) => setStip(e.target.value)} aria-label="Stipulation">{STIPS.map((s) => <option key={s} value={s}>{stipulation(s).name}</option>)}</select>
        <span className="c-lab">{w('Who wins')}</span>
        <div className="c-chips">
          <button className={`c-chip${win === 'a' ? ' on' : ''}`} onClick={() => setWin('a')}>{nm(a)}</button>
          <button className={`c-chip${win === 'b' ? ' on' : ''}`} onClick={() => setWin('b')}>{b ? nm(b) : '—'}</button>
          <button className={`c-chip${win === '' ? ' on' : ''}`} onClick={() => setWin('')}>{w('Let them work it out')}</button>
        </div>
        <span className="c-lab">{w('How')}</span>
        <div className="c-chips">{FINISHES.map((f) => <button key={f} className={`c-chip${finish === f ? ' on' : ''}`} onClick={() => setFinish(f)}>{w(FINISH_LABEL[f])}</button>)}</div>
        {!holderOk && <span className="c-note">The champion has to be in a title match.</span>}
        <button className="c-b1" disabled={!a || !b || !holderOk || (finish !== 'nocontest' && finish !== 'clean' && !planned)}
          onClick={() => onAdd({ a, b, ...(title ? { title } : {}), ...(stip !== 'standard' ? { stip: stip as Bout['stip'] } : {}), ...(planned ? { planned } : {}), ...(finish !== 'clean' ? { finish } : {}) })}>{w('Add it')}</button>
      </div>
    </div>
  );
}

function SegSheet({ card, pool, onClose, onAdd }: { card: Bout[]; pool: ReturnType<typeof bookerPool>; onClose: () => void; onAdd: (g: Segment) => void }) {
  const { w } = useWords();
  const [kind, setKind] = useState<SegKind>('promo');
  const [x, setX] = useState(pool[0]?.id ?? '');
  const [y, setY] = useState('');
  const [after, setAfter] = useState(Math.max(-1, card.length - 2));
  const two = SEG_WHO[kind][1] === 2;
  const need2 = SEG_WHO[kind][0] === 2;
  const who = [x, ...(two && y && y !== x ? [y] : [])];
  return (
    <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div>
        <div className="c-sh"><div><span>{w('Between the matches')}</span><b>{w('Add a segment')}</b></div><button onClick={onClose} aria-label="Close">✕</button></div>
        <div className="c-chips">{SEG_KINDS.map((k) => <button key={k} className={`c-chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{w(SEG_LABEL[k])}</button>)}</div>
        <select className="c-fld" value={x} onChange={(e) => setX(e.target.value)} aria-label="Who">{pool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {two && (
          <select className="c-fld" value={y} onChange={(e) => setY(e.target.value)} aria-label="And who">
            {!need2 && <option value="">{w('On their own')}</option>}
            {pool.filter((p) => p.id !== x).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select className="c-fld" value={after} onChange={(e) => setAfter(Number(e.target.value))} aria-label="When">
          <option value={-1}>{w('Opens the show')}</option>
          {card.map((b, i) => <option key={i} value={i}>After {nm(b.a)} vs {nm(b.b)}</option>)}
        </select>
        <button className="c-b1" disabled={!x || who.length < SEG_WHO[kind][0]} onClick={() => onAdd({ kind, who, after })}>{w('Add it')}</button>
      </div>
    </div>
  );
}

/** Watching a match: the commentary, line by line, as it happened. */
function Watch({ log, text, onClose }: { log: LogEntry[]; text: string; onClose: () => void }) {
  const { w } = useWords();
  const lines = useMemo(() => log.filter((l) => l.segs.length), [log]);
  const [n, setN] = useState(Math.min(3, lines.length));
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (n >= lines.length) return;
    const t = window.setTimeout(() => setN((x) => x + 1), 420);
    return () => window.clearTimeout(t);
  }, [n, lines.length]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [n]);
  const done = n >= lines.length;
  return (
    <div className="c-sheet">
      <div>
        <div className="c-sh"><div><span>{w('Watching')}</span><b>{done ? text : w('Live')}</b></div><button onClick={onClose} aria-label="Close">✕</button></div>
        <div ref={box} className="c-rows" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {lines.slice(0, n).map((l) => (
            <span key={l.id} className="c-dline" style={l.cls === 'hl' ? { fontWeight: 700 } : l.cls === 'dim' ? { opacity: 0.7 } : undefined}>
              {l.segs.map((s, i) => (s.k === 'text' ? <span key={i}>{s.v}</span> : s.k === 'move' ? <i key={i}>{s.v}</i> : <b key={i}>{s.v}</b>))}
            </span>
          ))}
        </div>
        {done ? <button className="c-b1" onClick={onClose}>{w('Back to the card')}</button> : <button className="c-b2" onClick={() => setN(lines.length)}>{w('Skip to the end')}</button>}
      </div>
    </div>
  );
}
