import { useMemo, useState } from 'react';
import { MOVES, getMove, type MoveType, type WrestlerClass } from '../../data/rtr';
import { Head, Screen, useWords } from './parts';

export interface Kit { moves: (string | null)[]; signatures: (string | null)[]; finishers: (string | null)[] }

const TYPES: [MoveType, string][] = [['GRAPPLE', 'Grapples'], ['STRIKE', 'Strikes'], ['SUBMISSION', 'Submissions'], ['RUNNING', 'Running'], ['PINNING_MOVE', 'Pins'], ['AERIAL', 'Aerial'], ['SPRINGBOARD', 'Springboard']];
type Slot = { kind: 'fin' | 'sig' | 'move'; i: number };

interface Props {
  title?: string;
  who: string;
  classes: WrestlerClass[];
  kit: Kit;
  onCancel: () => void;
  onSave: (kit: { moves: string[]; signatures: string[]; finishers: string[] }) => void;
}

/** Swap any move in a 40/2/3 moveset. Empty slots (a blank moveset) fill the same way. */
export function MovesetEditor({ title, who, classes, kit: initial, onCancel, onSave }: Props) {
  const { skin, w } = useWords();
  const [kit, setKit] = useState<Kit>(() => ({ moves: [...initial.moves], signatures: [...initial.signatures], finishers: [...initial.finishers] }));
  const [pick, setPick] = useState<Slot | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState<MoveType>('GRAPPLE');
  const suits = (id: string) => getMove(id).classPref.some((c) => classes.includes(c));

  const current = pick ? (pick.kind === 'fin' ? kit.finishers : pick.kind === 'sig' ? kit.signatures : kit.moves)[pick.i] ?? null : null;
  const open = (s: Slot) => {
    const cur = (s.kind === 'fin' ? kit.finishers : s.kind === 'sig' ? kit.signatures : kit.moves)[s.i];
    if (cur) setType(getMove(cur).type);
    setQ('');
    setPick(s);
  };
  const used = new Set([...kit.moves, ...kit.signatures, ...kit.finishers].filter(Boolean) as string[]);
  const options = useMemo(() => {
    if (!pick) return [];
    const needle = q.trim().toLowerCase();
    return MOVES.filter((m) => (pick.kind === 'fin' ? m.finisher : pick.kind === 'sig' ? m.finisher || m.impact >= 7 : needle ? true : m.type === type))
      .filter((m) => !needle || m.name.toLowerCase().includes(needle))
      .filter((m) => !used.has(m.id) || m.id === current)
      .sort((a, b) => Number(suits(b.id)) - Number(suits(a.id)) || a.name.localeCompare(b.name))
      .slice(0, 80);
  }, [pick, q, type, kit]);
  const choose = (id: string) => {
    if (!pick) return;
    const next = { moves: [...kit.moves], signatures: [...kit.signatures], finishers: [...kit.finishers] };
    (pick.kind === 'fin' ? next.finishers : pick.kind === 'sig' ? next.signatures : next.moves)[pick.i] = id;
    setKit(next);
    setPick(null);
  };
  const complete = kit.moves.every(Boolean) && kit.signatures.every(Boolean) && kit.finishers.every(Boolean);
  const name = (id: string | null) => (id ? getMove(id).name : w('Empty slot', 'Empty slot'));
  const slot = (s: Slot, id: string | null, k?: string) => (
    <button key={`${s.kind}${s.i}`} className={`c-slot${pick && pick.kind === s.kind && pick.i === s.i ? ' on' : ''}`} onClick={() => open(s)}>
      <span style={id ? undefined : { opacity: 0.55, fontStyle: 'italic' }}>{name(id)}</span>{k && <span className="c-hint">{k}</span>}
    </button>
  );
  const groups = TYPES.map(([t, label]) => ({ t, label, slots: kit.moves.map((id, i) => ({ id, i })).filter((x) => (x.id ? getMove(x.id).type === t : false)) }));
  const empties = kit.moves.map((id, i) => ({ id, i })).filter((x) => !x.id);

  return (
    <Screen>
      <Head title={title ?? (skin === 'paper' ? 'The Arsenal' : 'MOVESET')} meta={w(who)} onBack={onCancel} />
      <div className="c-body">
        <span className="c-sec">{w('Finishers')}</span>
        {kit.finishers.map((id, i) => slot({ kind: 'fin', i }, id, w('Finisher')))}
        <span className="c-sec">{w('Signatures')}</span>
        {kit.signatures.map((id, i) => slot({ kind: 'sig', i }, id, w('Signature')))}
        {groups.filter((g) => g.slots.length).map((g) => (
          <div key={g.t} style={{ display: 'contents' }}>
            <div className="c-rowsb"><span className="c-sec c-grow">{w(g.label)}</span><span className="c-hint">{g.slots.length}</span></div>
            <div className="c-mlist">{g.slots.map((x) => slot({ kind: 'move', i: x.i }, x.id))}</div>
          </div>
        ))}
        {empties.length > 0 && (
          <>
            <div className="c-rowsb"><span className="c-sec c-grow">{w('Still to fill')}</span><span className="c-hint">{empties.length}</span></div>
            <div className="c-mlist">{empties.map((x) => slot({ kind: 'move', i: x.i }, null))}</div>
          </>
        )}
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onCancel}>{w('Cancel')}</button>
        <button className="c-b1" disabled={!complete} onClick={() => onSave({ moves: kit.moves as string[], signatures: kit.signatures as string[], finishers: kit.finishers as string[] })}>
          {complete ? w('Save') : w(`${[...kit.moves, ...kit.signatures, ...kit.finishers].filter((x) => !x).length} to fill`)}
        </button>
      </div>
      {pick && (
        <div className="c-ovl">
          <div className="c-top"><button className="c-back" onClick={() => setPick(null)} aria-label="Close">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'Swap a Move' : 'SWAP MOVE'}</div><span className="c-meta">{w(pick.kind === 'fin' ? 'Finisher' : pick.kind === 'sig' ? 'Signature' : TYPES.find((t) => t[0] === type)![1])}</span></div>
          <div className="c-mast">{skin === 'paper' ? 'Swap a Move' : 'SWAP MOVE'}</div>
          <div className="c-start" style={{ marginTop: 10 }}><span className="c-lab">{w(current ? 'Replacing' : 'Filling')}</span><b className="c-sbig">{name(current)}</b></div>
          <input className="c-fld" style={{ marginTop: 8, width: '100%', border: 0, outline: 0 }} placeholder="Search moves…" value={q} onChange={(e) => setQ(e.target.value)} />
          {pick.kind === 'move' && !q && (
            <div className="c-wrap" style={{ marginTop: 6 }}>
              {TYPES.map(([t, label]) => <button key={t} className={t === type ? 'c-chip on' : 'c-chip'} style={{ minHeight: 34, fontSize: 13 }} onClick={() => setType(t)}>{w(label)}</button>)}
            </div>
          )}
          <div className="c-body">
            {options.map((m) => (
              <button key={m.id} className="c-slot" onClick={() => choose(m.id)}>
                <span>{m.name}</span>{suits(m.id) && <span className="c-eff up">{w('Suits you')}</span>}
              </button>
            ))}
          </div>
          <div className="c-nav"><button className="c-b2" onClick={() => setPick(null)}>{w('Cancel')}</button><button className="c-b1" onClick={() => setPick(null)}>{w('Keep it', 'Keep')}</button></div>
        </div>
      )}
    </Screen>
  );
}
