import { useState } from 'react';
import { answerEvent, eventChoices, type Career, type Letter } from '../../career';
import { fmtDay } from '../../career/dates';
import { commit, useWords } from './parts';

interface ChoicesProps { c: Career; l: Letter; choice: string | null; onPick: (id: string) => void }

/** A career event's choices (greyed out with the reason when you can't take one), or, once answered, what you chose and what came of it. */
export function EventChoices({ c, l, choice, onPick }: ChoicesProps) {
  const { w } = useWords();
  const ev = l.action?.type === 'event' ? l.action : null;
  if (!ev) return null;
  if (l.done) {
    return (
      <div className="c-ans on" style={{ cursor: 'default' }}>
        <span className="c-lab">{l.picked ? w('You chose') : w('No answer')}</span>
        {l.picked && <b className="c-at">{l.picked}</b>}
        <span className="c-ad">{l.outcome ?? (l.done === 'expired' ? 'You didn’t answer in time. Nothing came of it.' : '')}</span>
      </div>
    );
  }
  return (
    <>
      <span className="c-hint">{w('Your call')} · {w('answer by')} {fmtDay(ev.expires, 'dm')}</span>
      {eventChoices(c, l.id).map((o) => (
        <button key={o.id} className={o.blocked ? 'c-ans dis' : o.id === choice ? 'c-ans on' : 'c-ans'} disabled={!!o.blocked} onClick={() => onPick(o.id)}>
          <b className="c-at">{o.label}</b>
          {(o.blocked || o.detail) && <span className={o.blocked ? 'c-ad c-why' : 'c-ad'}>{o.blocked ?? o.detail}</span>}
        </button>
      ))}
    </>
  );
}

/** Letters that need your call and pop up: career events and invitations, and contract offers (Lyra's call). */
const popsUp = (c: Career, x: Letter): boolean => {
  if (x.read || x.done || !x.action) return false;
  if (x.action.type === 'event') return true;
  if (x.action.type === 'negotiate') { const id = x.action.offer; return c.offers.some((o) => o.id === id && o.status === 'open'); }
  return false;
};

/** What needs your call pops up over the calendar as a card, oldest first, so you notice it as it happens.
 * Events: choose there and then, or Later and it waits in your Mail until it lapses. Contract offers: Negotiate, or Later. */
export function EventPopup({ c, onNegotiate }: { c: Career; onNegotiate: (offerId: string) => void }) {
  const { skin, w } = useWords();
  const [shown, setShown] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const waiting = c.letters.filter((x) => popsUp(c, x)).reverse();
  const l = (shown ? c.letters.find((x) => x.id === shown) : undefined) ?? waiting[0];
  if (!l) return null;
  const more = waiting.filter((x) => x.id !== l.id).length;
  const offer = l.action?.type === 'negotiate' ? l.action.offer : null;

  const later = () => { l.read = true; commit(); setChoice(null); setShown(null); };
  const choose = () => {
    if (!choice) return;
    answerEvent(c, l.id, choice);
    l.read = true;
    commit();
    setChoice(null);
    if (l.done) setShown(l.id); // stay up to show what came of it
  };

  return (
    <div className="c-pop" role="dialog" aria-modal="true" aria-label={l.subject}>
      <div className="c-pcard" key={l.id}>
        <div className="c-ptag">
          <span>{offer ? (skin === 'paper' ? 'An offer' : 'CONTRACT OFFER') : skin === 'paper' ? 'Your call' : 'YOUR CALL'}</span>
          {more > 0 && <span className="c-hint">{w(`${more} more waiting`)}</span>}
        </div>
        <span className="c-lab">{l.from}</span>
        <b className="c-pttl">{l.subject}</b>
        <div className="c-pbody">
          {l.body.map((p, i) => <span key={i} className="c-ad">{p}</span>)}
          {l.terms && <div className="c-kv">{l.terms.map(([a, b]) => <span key={a} style={{ display: 'contents' }}><span className="c-lab">{w(a)}</span><span className="c-val">{b}</span></span>)}</div>}
          <EventChoices c={c} l={l} choice={choice} onPick={setChoice} />
        </div>
        <div className="c-pnav">
          {offer ? (
            <>
              <button className="c-b2" onClick={later}>{w('Later')}</button>
              <button className="c-b1" onClick={() => { l.read = true; commit(); onNegotiate(offer); }}>{w('Negotiate ›')}</button>
            </>
          ) : l.done ? (
            <button className="c-b1" onClick={() => setShown(null)}>{more > 0 ? w('Next ›') : w('Fine', 'OK')}</button>
          ) : (
            <>
              <button className="c-b2" onClick={later}>{w('Later')}</button>
              <button className="c-b1" disabled={!choice} onClick={choose}>{w('Choose ›')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
