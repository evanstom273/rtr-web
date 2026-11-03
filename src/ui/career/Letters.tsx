import { useState } from 'react';
import { acceptLetter, declineLetter, type Career, type Letter } from '../../career';
import { fmtDay } from '../../career/dates';
import { commit, Head, Screen, useToast, useWords } from './parts';

interface Props { c: Career; onBack: () => void; onNegotiate: (offerId: string) => void }

const KIND: Record<Letter['kind'], [string, string]> = {
  offer: ['Offer', 'c-eff gold'], result: ['Result', 'c-eff up'], news: ['News', 'c-eff'], injury: ['Injury', 'c-eff bad'], contract: ['Contract', 'c-eff gold'],
};
const TABS: { label: string; kinds: Letter['kind'][] | null }[] = [
  { label: 'All', kinds: null }, { label: 'Offers', kinds: ['offer', 'contract'] }, { label: 'Results', kinds: ['result'] }, { label: 'News', kinds: ['news', 'injury'] },
];

/** Letters (mail): offers to act on, your results, the world's news. */
export function Letters({ c, onBack, onNegotiate }: Props) {
  const { skin, w } = useWords();
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, say] = useToast();
  const kinds = TABS[tab]!.kinds;
  const list = c.letters.filter((l) => !kinds || kinds.includes(l.kind));
  const l = open ? c.letters.find((x) => x.id === open) : undefined;

  const openLetter = (x: Letter) => {
    x.read = true;
    commit();
    setOpen(x.id);
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

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Letters' : 'MAIL'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-steps cols4" style={{ marginTop: 10 }}>
        {TABS.map((t, i) => <button key={t.label} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t.label)}</button>)}
      </div>
      <div className="c-body">
        {list.length === 0 && <span className="c-note">Nothing here yet.</span>}
        {list.map((x) => (
          <button key={x.id} className={!x.read ? 'c-ans on' : 'c-ans'} onClick={() => openLetter(x)}>
            <span className="c-rowsb"><span className="c-lab">{x.from}</span><span className="c-effs"><span className={KIND[x.kind][1]}>{w(KIND[x.kind][0])}</span><span className="c-hint">{fmtDay(x.day, 'dm')}</span></span></span>
            <b className="c-at">{x.subject}</b>
            <span className="c-ad">{x.done ? `${x.done[0]!.toUpperCase()}${x.done.slice(1)}. ` : ''}{x.body[0]}</span>
          </button>
        ))}
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onBack}>{w('‹ Back')}</button>
        <button className="c-b1" onClick={() => { for (const x of c.letters) x.read = true; commit(); }}>{w('Mark all read')}</button>
      </div>
      {l && (
        <div className="c-ovl">
          <div className="c-top"><button className="c-back" onClick={() => setOpen(null)} aria-label="Back to Letters">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'A Letter' : 'LETTER'}</div><span className="c-meta">{fmtDay(l.day, 'dm')}</span></div>
          <div className="c-mast">A Letter</div>
          <div className="c-body">
            <span className="c-lab">{l.from}</span>
            <span className="c-qtext" style={{ fontSize: 26 }}>{l.subject}</span>
            {l.body.map((p, i) => <span key={i} className="c-ad" style={{ fontSize: 15 }}>{p}</span>)}
            {l.terms && <div className="c-kv">{l.terms.map(([a, b]) => <span key={a} style={{ display: 'contents' }}><span className="c-lab">{w(a)}</span><span className="c-val">{b}</span></span>)}</div>}
            {l.note && <span className="c-note">{l.note}</span>}
            {l.done && <span className="c-note">{l.done === 'accepted' ? 'You accepted this.' : l.done === 'declined' ? 'You turned this down.' : 'This has lapsed.'}</span>}
          </div>
          <div className="c-nav">
            {l.action && !l.done && offerOpen ? (
              <>
                <button className="c-b2" onClick={no}>{w('Decline')}</button>
                <button className="c-b1" onClick={yes}>{l.action.type === 'negotiate' ? w('Negotiate ›') : w('Accept')}</button>
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
