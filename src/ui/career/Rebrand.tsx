import { useState } from 'react';
import { promoName, rebrand, type Career } from '../../career';
import { commit, Head, Screen, useWords } from './parts';

/**
 * Character & Image Rights (Lyra's call): you've left a promotion that owned your name and gimmick, so you
 * rebrand. Some of your fans don't follow the new name.
 */
export function Rebrand({ c, onDone }: { c: Career; onDone: () => void }) {
  const { w } = useWords();
  const r = c.rebrand!;
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    const said = rebrand(c, name);
    if (c.rebrand) { setErr(said); return; }
    commit();
    onDone();
  };
  return (
    <Screen>
      <Head title={w('A New Name', 'REBRAND')} meta={promoName(r.from)} onBack={() => undefined} back="" />
      <div className="c-body">
        <div className="c-start">
          <span className="c-lab">{w(`${r.from} own “${r.old}”`)}</span>
          <b className="c-sbig" style={{ fontSize: 26 }}>{w('Time for a new name')}</b>
          <span className="c-val">Your deal didn’t give you the rights to your character, so the name stays with {promoName(r.from)}. {r.lost.toLocaleString('en-GB')} fans didn’t follow you.</span>
        </div>
        <span className="c-lab">{w('Your new ring name')}</span>
        <input className="c-fld" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder={r.old} aria-label="New ring name" maxLength={40} />
        {err && <span className="c-hint">{err}</span>}
        <span className="c-note">Next time, negotiate Character & Image Rights: Licensed or better and the name’s yours to keep.</span>
      </div>
      <div className="c-nav"><button className="c-b1" disabled={name.trim().length < 2} onClick={go}>{w('That’s me now ›')}</button></div>
    </Screen>
  );
}
