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
import { boutKind, boutLabel, boutWinners, inBout, multiBout } from '../../career/bouts';
import { STAKE_LABEL, type StakeKind } from '../../career/stakes';
import { FEATURES } from '../../career/tuning';
import { STIPULATIONS } from '../../engine/stipulations';
import { activeTeams } from '../../world/matchWorld';
import { activeWorld } from '../../world/world';
import type { MatchType, StipulationId } from '../../engine/types';

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
                    <b className="c-at" style={{ fontSize: 15 }}>{b.sides ? boutLabel(b, nm) : `${nm(b.a)} vs ${nm(b.b)}`}</b>
                    <span className="c-hint">{i === card.length - 1 ? 'MAIN EVENT' : i === 0 ? 'OPENER' : `MATCH ${i + 1}`}</span>
                  </span>
                  <span className="c-ad">
                    {[boutKind(b) ?? '', b.title ? titlesFor(show).find((t) => t.id === b.title)?.name : '', b.stip && b.stip !== 'standard' ? stipulation(b.stip).name : '',
                      b.stakes ? STAKE_LABEL[b.stakes.kind] : '',
                      b.result ? `${boutWinners(b, nm) ?? 'No contest'} · ${stars(b.result.stars)}` : b.planned ? `${nm(b.planned)} wins · ${FINISH_LABEL[b.finish ?? 'clean']}` : b.finish === 'nocontest' ? 'No contest' : 'Winner: theirs to decide'].filter(Boolean).join(' · ')}
                  </span>
                  {!started && (
                    <span className="c-chips" style={{ marginTop: 4 }}>
                      <button className="c-chip" onClick={() => move(i, -1)} aria-label="Earlier">↑</button>
                      <button className="c-chip" onClick={() => move(i, 1)} aria-label="Later">↓</button>
                      <button className="c-chip" onClick={() => drop(i)}>{w('Drop')}</button>
                    </span>
                  )}
                  {tonight && !b.result && !inBout(b, c.player) && !changed && <button className="c-chip" style={{ marginTop: 4 }} onClick={() => watch(i)}>{w('Watch it ›')}</button>}
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
      {sheet === 'match' && card && (FEATURES.matches
        ? <BigMatchSheet show={show} pool={pool.filter((x) => !card.some((b) => inBout(b, x.id)))} onClose={() => setSheet(null)} onAdd={(b) => { setCardDraft([...card, b]); setSheet(null); }} />
        : <MatchSheet show={show} pool={pool.filter((x) => !card.some((b) => b.a === x.id || b.b === x.id))} onClose={() => setSheet(null)} onAdd={(b) => { setCardDraft([...card, b]); setSheet(null); }} />)}
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

type Kind = 'singles' | 'tag' | 'trios' | 'triple' | 'fourway' | 'royal';
const KINDS: { k: Kind; label: string; shape: number[] }[] = [
  { k: 'singles', label: 'Singles', shape: [1, 1] }, { k: 'tag', label: 'Tag team', shape: [2, 2] }, { k: 'trios', label: 'Trios', shape: [3, 3] },
  { k: 'triple', label: 'Triple threat', shape: [1, 1, 1] }, { k: 'fourway', label: 'Fatal four-way', shape: [1, 1, 1, 1] }, { k: 'royal', label: 'Battle royal', shape: [] },
];
const KIND_TYPE: Record<Kind, MatchType> = { singles: 'singles', tag: 'tag', trios: 'tag', triple: 'triple', fourway: 'fourway', royal: 'battle_royal' };
/** Stakes you can put on a match from the office (a career against a title, or a contract, are for the story writers). */
const OFFICE_STAKES: StakeKind[] = ['loser_leaves', 'mask', 'hair', 'mask_vs_hair', 'retirement', 'contendership', 'briefcase'];

/**
 * Add a match, match overhaul edition: any kind (singles, tag, trios, a triple threat, a four-way, a battle royal or
 * a Rumble), any stipulation, a title of the right kind, something riding on it, and who wins.
 */
function BigMatchSheet({ show, pool, onClose, onAdd }: { show: Show; pool: ReturnType<typeof bookerPool>; onClose: () => void; onAdd: (b: Bout) => void }) {
  const { w } = useWords();
  const [kind, setKind] = useState<Kind>('singles');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>(pool.some((x) => x.gender === 'MALE') ? 'MALE' : 'FEMALE');
  const field = pool.filter((x) => x.gender === gender);
  const shape = KINDS.find((x) => x.k === kind)!.shape;
  const [picks, setPicks] = useState<string[]>([]);
  const [royal, setRoyal] = useState<{ n: number; rumble: boolean }>({ n: 10, rumble: false });
  const [title, setTitle] = useState('');
  const [stip, setStip] = useState<string>('standard');
  const [stake, setStake] = useState<StakeKind | ''>('');
  const [win, setWin] = useState<number>(-1);
  const [finish, setFinish] = useState<BookedFinish>('clean');
  // The sides: picked slot by slot (anyone not picked falls back to the next free name), or a battle royal's field.
  const slots = shape.reduce((n, x) => n + x, 0);
  const chosen: string[] = [];
  for (let i = 0; i < slots; i++) {
    const want = picks[i];
    const id = want && field.some((x) => x.id === want) && !chosen.includes(want) ? want : field.find((x) => !chosen.includes(x.id))?.id;
    if (id) chosen.push(id);
  }
  const sides: string[][] = kind === 'royal'
    ? [...field].sort((a, b) => Object.values(b.fans).reduce((x, y) => x + y, 0) - Object.values(a.fans).reduce((x, y) => x + y, 0)).slice(0, royal.n).map((x) => [x.id])
    : shape.map((_, i) => chosen.slice(shape.slice(0, i).reduce((a, b) => a + b, 0), shape.slice(0, i + 1).reduce((a, b) => a + b, 0)));
  const full = kind === 'royal' ? sides.length >= 6 : chosen.length === slots;
  const setPick = (i: number, id: string) => setPicks((p) => { const n = [...p]; n[i] = id; return n; });
  // Tag and trios: established teams, one tap to fill a side.
  const teamSize = kind === 'tag' ? 2 : kind === 'trios' ? 3 : 0;
  const teams = teamSize ? activeTeams(activeWorld()).filter((t) => t.members.length === teamSize && t.members.every((id) => field.some((x) => x.id === id))) : [];
  const pickTeam = (members: string[]) => {
    const first = sides[0]!.every((id) => !members.includes(id)) && picks.slice(0, teamSize).filter(Boolean).length === 0;
    setPicks((p) => { const n = [...p]; members.forEach((id, j) => { n[(first ? 0 : teamSize) + j] = id; }); return n; });
  };
  const titleKinds = kind === 'tag' ? ['tag'] : kind === 'trios' ? ['trios'] : ['singles', 'hardcore', undefined];
  const titles = titlesFor(show).filter((t) => (t.gender === 'FEMALE') === (gender === 'FEMALE') && titleKinds.includes(t.kind));
  const t = titles.find((x) => x.id === title);
  const held = t ? (t.holders?.length ? t.holders : t.holder ? [t.holder] : []) : [];
  const holderOk = !t || held.every((id) => sides.flat().includes(id));
  const planned = finish === 'nocontest' || win < 0 ? undefined : sides[win]?.[0];
  const stips = STIPULATIONS.map((x) => x.id);
  const top = titlesFor(show).find((x) => !x.kind && x.gender === gender);
  const add = () => {
    const extra: Partial<Bout> = {
      ...(title ? { title } : {}), ...(stip !== 'standard' ? { stip: stip as StipulationId } : {}), ...(planned ? { planned } : {}), ...(finish !== 'clean' ? { finish } : {}),
      ...(stake ? { stakes: stake === 'contendership' ? { kind: stake, ...(top ? { title: top.id } : {}) } : { kind: stake } } : {}),
    };
    if (kind === 'singles' && !stake) return onAdd({ a: sides[0]![0]!, b: sides[1]![0]!, ...extra });
    onAdd(multiBout(sides, { type: kind === 'royal' && royal.rumble ? 'rumble' : KIND_TYPE[kind], ...(teamSize ? { tag: true } : {}), ...extra }));
  };
  const sideName = (s: string[]) => s.map(nm).join(' & ');
  return (
    <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div>
        <div className="c-sh"><div><span>{show.name}</span><b>{w('Add a match')}</b></div><button onClick={onClose} aria-label="Close">✕</button></div>
        <div className="c-chips">{KINDS.map((x) => <button key={x.k} className={`c-chip${kind === x.k ? ' on' : ''}`} onClick={() => { setKind(x.k); setPicks([]); setTitle(''); setWin(-1); }}>{w(x.label)}</button>)}</div>
        <div className="c-chips">{(['MALE', 'FEMALE'] as const).map((g) => <button key={g} className={`c-chip${gender === g ? ' on' : ''}`} onClick={() => { setGender(g); setPicks([]); setTitle(''); }}>{w(g === 'MALE' ? 'Men' : 'Women')}</button>)}</div>
        {kind === 'royal' ? (
          <>
            <div className="c-chips">{[10, 20, 30].map((n) => <button key={n} className={`c-chip${royal.n === n ? ' on' : ''}`} onClick={() => setRoyal({ ...royal, n })}>{n}</button>)}
              <button className={`c-chip${royal.rumble ? ' on' : ''}`} onClick={() => setRoyal({ ...royal, rumble: !royal.rumble })}>{w('Rumble rules')}</button></div>
            <span className="c-note">{sides.length} {w('in it, the biggest names who are free')}{sides.length < royal.n ? ` (only ${sides.length} free)` : ''}.</span>
          </>
        ) : (
          <>
            {teams.length > 0 && <div className="c-chips">{teams.slice(0, 8).map((tm) => <button key={tm.id} className="c-chip" onClick={() => pickTeam(tm.members)}>{tm.name}</button>)}</div>}
            {shape.map((n, i) => (
              <div key={i}>
                {i > 0 && <span className="c-lab">{w('against')}</span>}
                {Array.from({ length: n }, (_, j) => {
                  const slot = shape.slice(0, i).reduce((a, b) => a + b, 0) + j;
                  const cur = chosen[slot] ?? '';
                  return <select key={j} className="c-fld" value={cur} onChange={(e) => setPick(slot, e.target.value)} aria-label={`Side ${i + 1}, ${j + 1}`}>
                    {field.filter((x) => x.id === cur || !chosen.includes(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>;
                })}
              </div>
            ))}
          </>
        )}
        {titles.length > 0 && (
          <select className="c-fld" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title">
            <option value="">{w('No title on the line')}</option>
            {titles.map((x) => <option key={x.id} value={x.id}>{x.name}{x.holders?.length ? ` (${x.holders.map(nm).join(' & ')})` : x.holder ? ` (${nm(x.holder)})` : ' (vacant)'}</option>)}
          </select>
        )}
        <select className="c-fld" value={stip} onChange={(e) => setStip(e.target.value)} aria-label="Stipulation">{stips.map((x) => <option key={x} value={x}>{stipulation(x).name}</option>)}</select>
        <select className="c-fld" value={stake} onChange={(e) => setStake(e.target.value as StakeKind | '')} aria-label="Stakes">
          <option value="">{w('Nothing else riding on it')}</option>
          {OFFICE_STAKES.map((k) => <option key={k} value={k}>{STAKE_LABEL[k]}</option>)}
        </select>
        <span className="c-lab">{w('Who wins')}</span>
        <div className="c-chips">
          {kind !== 'royal' && sides.map((sd, i) => <button key={i} className={`c-chip${win === i ? ' on' : ''}`} onClick={() => setWin(i)}>{sideName(sd)}</button>)}
          {kind === 'royal' && (
            <select className="c-fld" value={win} onChange={(e) => setWin(Number(e.target.value))} aria-label="Winner">
              <option value={-1}>{w('Let them work it out')}</option>
              {sides.map((sd, i) => <option key={i} value={i}>{nm(sd[0]!)}</option>)}
            </select>
          )}
          {kind !== 'royal' && <button className={`c-chip${win < 0 ? ' on' : ''}`} onClick={() => setWin(-1)}>{w('Let them work it out')}</button>}
        </div>
        <span className="c-lab">{w('How')}</span>
        <div className="c-chips">{FINISHES.map((f) => <button key={f} className={`c-chip${finish === f ? ' on' : ''}`} onClick={() => setFinish(f)}>{w(FINISH_LABEL[f])}</button>)}</div>
        {!holderOk && <span className="c-note">{held.length > 1 ? 'The champions have' : 'The champion has'} to be in a title match.</span>}
        <button className="c-b1" disabled={!full || !holderOk || (finish !== 'nocontest' && finish !== 'clean' && !planned)} onClick={add}>{w('Add it')}</button>
      </div>
    </div>
  );
}
