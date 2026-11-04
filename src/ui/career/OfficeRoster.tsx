import { useState } from 'react';
import {
  approach, approachesOf, C, candidates, CLAUSES, contractWith, dealValue, fireStaff, hire, homeRegion, moodToward, offer, promise, promisesOf, prospects, releaseFrom, staffOf, STAFF_DOES, STAFF_LABEL, worth,
  type Approach, type Career, type Deal, type StaffRole,
} from '../../career';
import { fansIn, findWrestler, fmtFans, rosterOf } from '../../data/rtr';
import { fmtDay } from '../../career/dates';
import { activeWorld } from '../../world/world';
import { commit, money, useWords } from './parts';

const nm = (id: string) => findWrestler(id)?.name ?? id;
const moodWord = (v: number) => (v >= 40 ? 'happy' : v >= 0 ? 'content' : v > -30 ? 'grumbling' : v > -50 ? 'unhappy' : 'wants out');

/** The Roster tab (booker mode, stage 5): who's signed, how they feel about you, promises, releases. */
export function OfficeRoster({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const roster = rosterOf(promo).filter((x) => x.id !== c.player);
  const region = homeRegion(promo);
  const promises = promisesOf(c, promo);
  const act = (s: string) => { say(s); commit(); };
  return (
    <>
      <span className="c-sec">{w('Signed')} · {roster.length}</span>
      {roster.length ? roster.sort((a, b) => fansIn(b, region) - fansIn(a, region)).map((x) => {
        const k = contractWith(c, x.id, promo);
        const mood = moodToward(c, x.id);
        return (
          <div key={x.id} className="c-ans" style={{ padding: '6px 8px' }}>
            <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{x.name}</b><span className="c-hint">{moodWord(mood)} ({mood})</span></span>
            <span className="c-ad">{fmtFans(fansIn(x, region))} fans here{k ? ` · ${money(k.fee)} a date · to ${fmtDay(k.end, 'dm')}${k.walk ? ' · leaving' : ''}` : ''}</span>
            <span className="c-chips" style={{ marginTop: 4 }}>
              <button className="c-chip" onClick={() => act(promise(c, promo, x.id, 'push'))}>{w('Promise a push')}</button>
              <button className="c-chip" onClick={() => act(promise(c, promo, x.id, 'title'))}>{w('Promise a title shot')}</button>
              <button className="c-chip" onClick={() => act(releaseFrom(c, promo, x.id))}>{w('Release')}</button>
            </span>
          </div>
        );
      }) : <span className="c-note">Nobody’s signed. Your shows book free agents a night at a time; sign people in Signings.</span>}
      {promises.length > 0 && (
        <>
          <span className="c-sec">{w('Promises')}</span>
          {promises.map((p) => <span key={p.who + p.kind} className="c-val">{nm(p.who)}: {p.kind === 'title' ? 'a title match' : p.kind === 'main' ? 'a main event' : 'a push (three wins)'} by {fmtDay(p.by, 'dm')}</span>)}
        </>
      )}
      <span className="c-note">How they feel about you is how you book them: wins, titles and main events warm them; weeks off the cards, being underpaid and broken promises don’t. The unhappy say so, ask to leave, and won’t re-sign.</span>
    </>
  );
}

/** The Signings tab: talks under way, and who's out there. */
export function OfficeSignings({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const open = approachesOf(c, promo).filter((a) => a.status === 'open');
  const recent = approachesOf(c, promo).filter((a) => a.status !== 'open').slice(-3).reverse();
  const region = homeRegion(promo);
  const list = prospects(c, promo, 30);
  const act = (s: string) => { say(s); commit(); };
  return (
    <>
      {open.map((a) => <Talks key={a.id} c={c} a={a} say={say} />)}
      {recent.map((a) => <span key={a.id} className="c-hint">{nm(a.who)}: {a.status === 'signed' ? 'signed' : 'walked'} · “{a.said}”</span>)}
      <span className="c-sec">{w('Who’s out there')}</span>
      {list.map((x) => (
        <div key={x.id} className="c-rowsb">
          <span className="c-val">{x.name}<span className="c-hint"> · {x.promotion === 'TIS' ? 'free agent' : x.promotion} · {fmtFans(fansIn(x, region))} here · ~{money(worth(c, promo, x))}</span></span>
          <button className="c-chip" onClick={() => { const r = approach(c, promo, x.id); act(typeof r === 'string' ? r : `Talking to ${x.name}.`); }}>{w('Approach')}</button>
        </div>
      ))}
    </>
  );
}

/** One negotiation: what they want, what you'll give, the 25 clauses. */
function Talks({ c, a, say }: { c: Career; a: Approach; say: (s: string) => void }) {
  const { w } = useWords();
  const [d, setD] = useState<Deal>(() => ({ ...a.ask, clauses: [...a.ask.clauses] }));
  const [terms, setTerms] = useState(false);
  const want = dealValue(a.promo, a.ask.fee, a.ask), got = dealValue(a.promo, a.ask.fee, d);
  const act = (s: string) => { say(s); commit(); };
  return (
    <div className="c-ans" style={{ padding: '6px 8px' }}>
      <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{nm(a.who)}</b><span className="c-hint">round {a.rounds + 1}</span></span>
      <span className="c-ad">“{a.said}”{a.buyout ? ` · buyout ${money(a.buyout)} to ${findWrestler(a.who)?.promotion}` : ''}</span>
      <span className="c-rowsb" style={{ gap: 6, marginTop: 4 }}>
        <span className="c-lab">{w('A date')}</span>
        <input className="c-fld mid" type="text" inputMode="numeric" value={String(d.fee)} onChange={(e) => setD({ ...d, fee: Number(e.target.value.replace(/\D/g, '')) || 0 })} aria-label="Fee a date" style={{ maxWidth: 110 }} />
        {[6, 12, 24].map((m) => <button key={m} className={`c-chip${d.months === m ? ' on' : ''}`} onClick={() => setD({ ...d, months: m })}>{m}m</button>)}
      </span>
      <span className="c-hint">They want {money(want)} of value; you’re offering {money(got)} ({Math.round((got / Math.max(1, want)) * 100)}%).</span>
      <button className="c-chip" onClick={() => setTerms(!terms)}>{w(terms ? 'Hide the contract' : 'The contract ›')}</button>
      {terms && CLAUSES.map((cl, i) => i === C.exclusivity ? null : (
        <span key={cl.id} className="c-rowsb" style={{ gap: 4 }}>
          <span className="c-hint" style={{ flex: 1 }}>{cl.name}{a.ask.clauses[i] ? ` (wants ${a.ask.clauses[i]})` : ''}</span>
          {[0, 1, 2, 3].map((t) => <button key={t} className={`c-chip${(d.clauses[i] ?? 0) === t ? ' on' : ''}`} style={{ minWidth: 30 }} onClick={() => { const cs = [...d.clauses]; cs[i] = t; setD({ ...d, clauses: cs }); }}>{t || '–'}</button>)}
        </span>
      ))}
      <button className="c-b3" onClick={() => act(offer(c, a.id, d))}>{w('Make the offer ›')}</button>
    </div>
  );
}

const ROLES: StaffRole[] = ['writer', 'agent', 'producer', 'scout', 'doctor'];
/** The Staff tab: who you've hired, and who you could. */
export function OfficeStaff({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const [role, setRole] = useState<StaffRole>('writer');
  const hired = staffOf(promo);
  const P = activeWorld().people!;
  const act = (s: string) => { say(s); commit(); };
  const mine = hired.find((h) => h.role === role);
  return (
    <>
      <div className="c-chips">{ROLES.map((r) => <button key={r} className={`c-chip${role === r ? ' on' : ''}`} onClick={() => setRole(r)}>{w(STAFF_LABEL[r])}{hired.some((h) => h.role === r) ? ' ✓' : ''}</button>)}</div>
      <span className="c-note">{STAFF_DOES[role]}</span>
      {mine ? (
        <div className="c-ans" style={{ padding: '6px 8px' }}>
          <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{P.staff[mine.id]?.name}</b><span className="c-hint">quality {P.staff[mine.id]?.rep}</span></span>
          <span className="c-ad">{money(mine.wage)} a month · since {fmtDay(mine.since, 'dm')}</span>
          <button className="c-chip" style={{ marginTop: 4 }} onClick={() => act(fireStaff(c, promo, role))}>{w('Let them go')}</button>
        </div>
      ) : <span className="c-hint">Nobody yet.</span>}
      <span className="c-sec">{w('Available this month')}</span>
      {candidates(c, promo, role).map(({ s, wage }) => (
        <div key={s.id} className="c-rowsb">
          <span className="c-val">{s.name}<span className="c-hint"> · quality {s.rep} · {money(wage)} a month</span></span>
          <button className="c-chip" onClick={() => act(hire(c, promo, role, s.id))}>{w(mine ? 'Replace' : 'Hire')}</button>
        </div>
      ))}
      <span className="c-note">Staff are paid monthly out of the company’s money.</span>
    </>
  );
}
