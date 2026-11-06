import { useState } from 'react';
import { accept, buySchool, coachPool, coachWage, dropCoach, graduate, hireCoach, mySchool, mySchoolRec, openSchool, readOf, schoolFee, schoolPrice, schools, setFocus, statTotal, type Attr } from '../../career/life/school';
import { life } from '../../career/life/state';
import { PRICE_BOOK as PB } from '../../career/tuning';
import type { Career } from '../../career/types';
import { findWrestler, WRESTLERS } from '../../data/rtr';
import { money, shortMoney, useWords } from './parts';

const FOCUS: Attr[] = ['strength', 'speed', 'stamina', 'skill', 'striking', 'charisma'];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Life → School: open or buy one, take your intake, set what they work on, coach, graduate them. */
export function SchoolTab({ c, done }: { c: Career; done: (s: string) => void }) {
  const { w } = useWords();
  const [show, setShow] = useState<'students' | 'applicants' | 'coaches'>('students');
  const S = mySchool(c), s = mySchoolRec(c);
  const L = life(c);
  if (!S || !s) {
    const here = Object.values(schools()).filter((x) => x.country === (L.homes.find((h) => h.use === 'live')?.country ?? '') && x.owner !== 'player');
    const mine = findWrestler(c.player)?.school;
    return (
      <>
        <span className="c-sec">{w('Your own school')}</span>
        <span className="c-note">Students pay fees, you choose who comes in and what they work on, and you can coach them yourself (coaching in your side earners counts). Graduates go out into the world as real wrestlers, and the good ones make the school’s name.</span>
        <button className="c-ans" style={{ padding: '8px 10px' }} onClick={() => done(openSchool(c))}>
          <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>Open one in {L.city}</b><span className="c-eff gold">{money(PB.school.kit)}</span></span>
          <span className="c-ad">A ring and kit; then rent (about {money(PB.school.rent)} a month) and any coaches you hire.</span>
        </button>
        {here.length > 0 && <span className="c-sec">{w('Or buy one')}</span>}
        {here.map((x) => (
          <button key={x.id} className="c-ans" style={{ padding: '8px 10px' }} onClick={() => done(buySchool(c, x.id))}>
            <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{x.name}{x.id === mine ? ' (where you trained)' : ''}</b><span className="c-eff gold">{money(schoolPrice(x))}</span></span>
            <span className="c-ad">Reputation {Math.round(x.rep)} · {x.grads} graduates · {x.coaches.length ? `coached by ${x.coaches.map((id) => findWrestler(id)?.name ?? id).join(', ')}` : 'no name coaches'}</span>
          </button>
        ))}
      </>
    );
  }
  const alumni = WRESTLERS.filter((x) => x.school === s.id);
  return (
    <>
      <div className="c-start">
        <span className="c-lab">{w('Your school')}</span>
        <b className="c-sbig" style={{ fontSize: 22 }}>{s.name}</b>
        <span className="c-val">Reputation {Math.round(s.rep)} · {S.students.length} of {PB.school.places} places · fees {money(schoolFee(c))} a month · {alumni.length} graduates out there{S.feeder && S.feeder.until >= c.today ? ` · feeder deal with ${S.feeder.promo}` : ''}</span>
        <span className="c-chips" style={{ marginTop: 6 }}>
          <button className={`c-chip${S.shows ? ' on' : ''}`} onClick={() => { S.shows = !S.shows; done(S.shows ? 'A school show every month: the students get ring time and the name grows.' : 'No more school shows.'); }}>{S.shows ? 'School shows: on' : 'School shows: off'}</button>
        </span>
      </div>
      <div className="c-chips">
        {(['students', 'applicants', 'coaches'] as const).map((k) => <button key={k} className={`c-chip${show === k ? ' on' : ''}`} onClick={() => setShow(k)}>{cap(k)}{k === 'applicants' && S.applicants.length ? ` (${S.applicants.length})` : ''}</button>)}
      </div>

      {show === 'students' && (
        <>
          {!S.students.length && <span className="c-note">No students yet: take some from the applicants.</span>}
          {S.students.map((st) => {
            const [lo, hi] = readOf(st);
            return (
              <div key={st.id} className="c-ans" style={{ padding: '8px 10px' }}>
                <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{st.name}</b><span className="c-eff">{st.age} · {st.months} months{st.scholarship ? ' · scholarship' : ''}</span></span>
                <span className="c-ad">Now {statTotal(st)} · could be {lo}–{hi}{st.read >= 0.9 ? ' (you know what they’ve got)' : ''}{st.note ? ` · ${st.note}` : ''}</span>
                <span className="c-chips" style={{ marginTop: 6 }}>
                  {FOCUS.map((f) => <button key={f} className={`c-chip${st.focus === f ? ' on' : ''}`} onClick={() => { setFocus(c, st.id, f); done(`${st.name} works on ${f}.`); }}>{cap(f)} {st.stats[f]}</button>)}
                  <button className="c-chip" onClick={() => done(graduate(c, st.id))}>Graduate</button>
                </span>
              </div>
            );
          })}
        </>
      )}

      {show === 'applicants' && (
        <>
          <span className="c-note">New applicants every four months. What they could be is a guess until they’ve trained with you a while.</span>
          {S.applicants.map((a) => {
            const [lo, hi] = readOf(a);
            return (
              <div key={a.id} className="c-ans" style={{ padding: '8px 10px' }}>
                <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{a.name}</b><span className="c-eff">{a.age} · {a.gender === 'FEMALE' ? 'F' : 'M'}</span></span>
                <span className="c-ad">Now {statTotal(a)} · could be {lo}–{hi}{a.note ? ` · ${a.note}` : ''}</span>
                <span className="c-chips" style={{ marginTop: 6 }}>
                  <button className="c-chip" onClick={() => done(accept(c, a.id))}>Take them · {shortMoney(schoolFee(c))}/month</button>
                  <button className="c-chip" onClick={() => done(accept(c, a.id, true))}>Scholarship</button>
                </span>
              </div>
            );
          })}
        </>
      )}

      {show === 'coaches' && (
        <>
          {s.coaches.map((id) => { const x = findWrestler(id); return x ? (
            <div key={id} className="c-kv">
              <span className="c-lab">{w('Coach')}</span><span className="c-val"><b>{x.name}</b> · {money(coachWage(x))} a month</span>
              <span className="c-lab" /><span className="c-chips"><button className="c-chip" onClick={() => done(dropCoach(c, id))}>Let them go</button></span>
            </div>
          ) : null; })}
          <span className="c-note">Retired wrestlers (and veterans part-time). The better known they are, the more they cost and the better your students get.</span>
          {coachPool(c).map((x) => (
            <button key={x.id} className="c-ans" style={{ padding: '8px 10px' }} onClick={() => done(hireCoach(c, x.id))}>
              <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{x.name}</b><span className="c-eff">{money(coachWage(x))}/month</span></span>
              <span className="c-ad">{c.people[x.id]?.retired ? 'Retired' : `Still working, ${x.age}`} · {x.country}</span>
            </button>
          ))}
        </>
      )}
    </>
  );
}
