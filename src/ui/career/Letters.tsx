import { useState } from 'react';
import { acceptLetter, answerEvent, declineLetter, MAIL_TABS, replyTo, tabOf, waitingOnYou, type Career, type Letter } from '../../career';
import { fmtDay } from '../../career/dates';
import { FEATURES } from '../../career/tuning';
import { grade } from '../model';
import { EventChoices } from './EventCard';
import { commit, Head, Nm, Screen, stars, useToast, useWords } from './parts';

interface Props { c: Career; onBack: () => void; onNegotiate: (offerId: string) => void }

const KIND: Record<Letter['kind'], [string, string]> = {
  offer: ['Offer', 'c-eff gold'], result: ['Result', 'c-eff up'], news: ['News', 'c-eff'], injury: ['Injury', 'c-eff bad'], contract: ['Contract', 'c-eff gold'],
  event: ['Your call', 'c-eff gold'], person: ['Personal', 'c-eff up'], booker: ['Check-in', 'c-eff gold'], digest: ['The week', 'c-eff'], press: ['Press', 'c-eff'],
};
const OLD_TABS: { label: string; kinds: Letter['kind'][] | null }[] = [
  { label: 'All', kinds: null }, { label: 'Offers', kinds: ['offer', 'contract', 'event'] }, { label: 'Results', kinds: ['result'] }, { label: 'News', kinds: ['news', 'injury'] },
];

/** Letters (mail): what needs you, your results, the people writing to you, and the world's news. */
export function Letters({ c, onBack, onNegotiate }: Props) {
  const { skin, w } = useWords();
  const mail = FEATURES.mail;
  const [tab, setTab] = useState(() => (mail && !c.letters.some(waitingOnYou) ? 1 : 0));
  const [open, setOpen] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [toast, say] = useToast();
  const list = mail ? c.letters.filter((l) => tabOf(l) === MAIL_TABS[tab]!.id) : c.letters.filter((l) => !OLD_TABS[tab]!.kinds || OLD_TABS[tab]!.kinds!.includes(l.kind));
  const l = open ? c.letters.find((x) => x.id === open) : undefined;
  const count = (i: number) => c.letters.filter((x) => tabOf(x) === MAIL_TABS[i]!.id && (i === 0 || !x.read)).length;

  const openLetter = (x: Letter) => {
    x.read = true;
    commit();
    setChoice(null);
    setOpen(x.id);
  };
  const ev = l?.action?.type === 'event' ? l.action : null;
  const canReply = !!l?.replies?.length && !l.replied && !l.done && !ev && !(l.action && !l.done);
  const choose = () => {
    if (!l || !choice) return;
    const msg = answerEvent(c, l.id, choice);
    commit();
    setChoice(null);
    if (!l.done && msg) say(msg);
  };
  const send = () => {
    if (!l || !choice) return;
    const msg = replyTo(c, l.id, choice);
    commit();
    setChoice(null);
    if (msg) say(msg);
  };
  const yes = () => {
    if (!l?.action) return setOpen(null);
    if (l.action.type === 'negotiate') return onNegotiate(l.action.offer);
    const msg = acceptLetter(c, l);
    commit();
    if (msg) say(msg);
    setOpen(null);
  };
  const no = () => {
    if (l) declineLetter(c, l);
    commit();
    setOpen(null);
  };
  const offerOpen = l?.action?.type === 'negotiate' ? c.offers.find((o) => o.id === (l.action as { offer: string }).offer)?.status === 'open' : true;
  const r = l?.report;

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Letters' : 'MAIL'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-steps cols4" style={{ marginTop: 10 }}>
        {mail
          ? MAIL_TABS.map((t, i) => <button key={t.id} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0, position: 'relative' }} onClick={() => setTab(i)}>{w(t.label)}{count(i) > 0 && <span className="c-badge">{count(i)}</span>}</button>)
          : OLD_TABS.map((t, i) => <button key={t.label} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t.label)}</button>)}
      </div>
      <div className="c-body">
        {list.length === 0 && <span className="c-note">{mail && tab === 0 ? 'Nothing waiting on you.' : 'Nothing here yet.'}</span>}
        {list.map((x) => (
          <button key={x.id} className={!x.read ? 'c-ans on' : 'c-ans'} onClick={() => openLetter(x)}>
            <span className="c-rowsb"><span className="c-lab">{x.from}</span><span className="c-effs">
              {x.report ? <span className="c-eff up">{stars(x.report.stars)}</span> : <span className={KIND[x.kind][1]}>{w(KIND[x.kind][0])}</span>}
              <span className="c-hint">{fmtDay(x.day, 'dm')}</span></span></span>
            <b className="c-at">{x.subject}</b>
            <span className="c-ad">
              {x.replied ? `You replied: ${x.replied}. ` : x.picked ? `${x.picked}. ` : x.done ? `${x.done === 'expired' && (x.kind === 'event' || x.ignore) ? 'No answer' : `${x.done[0]!.toUpperCase()}${x.done.slice(1)}`}. ` : x.kind === 'event' ? 'Waiting on you. ' : x.ignore && !x.replied ? `Answer by ${fmtDay(x.ignore.by, 'dm')}. ` : ''}
              {x.report?.label ? `${x.report.label}. ` : ''}{x.body[0]}
            </span>
          </button>
        ))}
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onBack}>{w('‹ Back')}</button>
        <button className="c-b1" onClick={() => { for (const x of c.letters) x.read = true; commit(); }}>{w('Mark all read')}</button>
      </div>
      {l && (
        <div className="c-ovl">
          <div className="c-top"><button className="c-back" onClick={() => setOpen(null)} aria-label="Back to Letters">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? (l.kind === 'digest' ? 'The Weekly' : 'A Letter') : w(KIND[l.kind][0])}</div><span className="c-meta">{fmtDay(l.day, 'dm')}</span></div>
          <div className="c-mast">{l.kind === 'digest' ? 'The Weekly' : l.kind === 'result' ? 'The Result' : 'A Letter'}</div>
          <div className="c-body">
            <span className="c-lab">{l.from}</span>
            <span className="c-qtext" style={{ fontSize: 26 }}>{l.subject}</span>
            {r ? (
              <>
                <div className="c-mrep">
                  <span className="c-mstar"><b>{stars(r.stars)}</b><span>{w(r.label || 'Stars')}</span></span>
                  <span className="c-ad">{r.verdict || l.body[0]}</span>
                </div>
                {r.grades.length > 0 && (
                  <div className="c-grades">
                    {r.grades.map((g) => <span key={g.l} className={`c-grade g-${grade(g.v)}`}><b>{grade(g.v)}</b><span className="c-lab">{w(g.l)}</span><span className="c-ad">{g.n}</span></span>)}
                  </div>
                )}
                {r.recap && <span className="c-ad" style={{ fontSize: 14.5 }}>{r.recap}</span>}
                {r.booker && (
                  <div className="c-quote">
                    <span className="c-lab">{r.booker.who}</span>
                    {r.booker.lines.map((x, i) => <span key={i} className="c-val">“{x}”</span>)}
                  </div>
                )}
                <span className="c-sec">{w('What it did')}</span>
                <div className="c-kv">{r.effects.map(([a, b]) => <span key={a} style={{ display: 'contents' }}><span className="c-lab">{w(a)}</span><span className="c-val">{b}</span></span>)}</div>
                <span className="c-sec">{w('Online')}</span>
                <div className="c-posts">{r.posts.map((p, i) => <span key={i} className="c-post"><b>{p.id ? <Nm id={p.id} /> : p.who}</b><span>{p.text}</span></span>)}</div>
              </>
            ) : l.sections ? (
              <>
                {l.body.map((p, i) => <span key={i} className="c-ad" style={{ fontSize: 15 }}>{p}</span>)}
                {l.sections.map((s) => (
                  <div key={s.h} className="c-dsec">
                    <span className="c-sec">{w(s.h)}</span>
                    {s.lines.map((x, i) => <span key={i} className="c-dline">{x}</span>)}
                  </div>
                ))}
              </>
            ) : (
              l.body.map((p, i) => <span key={i} className={l.kind === 'person' || l.kind === 'booker' ? 'c-val c-said' : 'c-ad'} style={{ fontSize: 15 }}>{p}</span>)
            )}
            {l.terms && <div className="c-kv">{l.terms.map(([a, b]) => <span key={a} style={{ display: 'contents' }}><span className="c-lab">{w(a)}</span><span className="c-val">{b}</span></span>)}</div>}
            {l.note && <span className="c-note">{l.note}</span>}
            {ev && <EventChoices c={c} l={l} choice={choice} onPick={setChoice} />}
            {canReply && (
              <>
                <span className="c-sec">{w('Reply')}{l.ignore ? ` · ${w(`by ${fmtDay(l.ignore.by, 'dm')}`)}` : ''}</span>
                {l.replies!.map((x) => (
                  <button key={x.id} className={`c-ans${choice === x.id ? ' on' : ''}`} style={{ padding: '7px 10px' }} onClick={() => setChoice(x.id)}>
                    <b className="c-at" style={{ fontSize: 15 }}>{x.label}</b>{x.detail && <span className="c-ad">{x.detail}</span>}
                  </button>
                ))}
                {l.ignore && <span className="c-note">{l.ignore.kind === 'rival' ? 'Leave it and they’ll tell everyone you’re scared.' : l.ignore.kind === 'friend' ? 'Leave it and they’ll notice.' : 'Leave it and the chance goes.'}</span>}
              </>
            )}
            {l.replied && <span className="c-note">You replied: {l.replied}.{l.outcome ? ` ${l.outcome}` : ''}</span>}
            {!l.replied && l.ignore && l.done === 'expired' && <span className="c-note">{l.outcome}</span>}
            {!ev && l.done && !l.ignore && <span className="c-note">{l.done === 'accepted' ? 'You accepted this.' : l.done === 'declined' ? 'You turned this down.' : 'This has lapsed.'}</span>}
          </div>
          <div className="c-nav">
            {ev && !l.done ? (
              <>
                <button className="c-b2" onClick={() => setOpen(null)}>{w('Later')}</button>
                <button className="c-b1" disabled={!choice} onClick={choose}>{w('Choose ›')}</button>
              </>
            ) : l.action && !l.done && offerOpen ? (
              <>
                <button className="c-b2" onClick={no}>{w('Decline')}</button>
                <button className="c-b1" onClick={yes}>{l.action.type === 'negotiate' ? w('Negotiate ›') : w('Accept')}</button>
              </>
            ) : canReply ? (
              <>
                <button className="c-b2" onClick={() => setOpen(null)}>{w('Later')}</button>
                <button className="c-b1" disabled={!choice} onClick={send}>{w('Send ›')}</button>
              </>
            ) : (
              <>
                <button className="c-b2" onClick={() => setOpen(null)}>{w('Close')}</button>
                <button className="c-b1" onClick={() => setOpen(null)}>{w('Fine', 'OK')}</button>
              </>
            )}
          </div>
        </div>
      )}
      {toast}
    </Screen>
  );
}
