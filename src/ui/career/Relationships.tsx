import { useState } from 'react';
import { findWrestler, type Staffer } from '../../data/rtr';
import { bookerName, memoryLine, memoryOf, patienceOf, promoName, relLabel, relationsList, trust, trustLabel, type Career } from '../../career';
import { daysBetween, fmtDay } from '../../career/dates';
import { activeWorld } from '../../world/world';
import { bondOf, bookerOf, jobLabel } from '../../world/people';
import { Head, Nm, Screen, useWords } from './parts';
import { TraitChips } from './Traits';

interface Props { c: Career; onBack: () => void }

const KIND_CLASS: Record<string, string> = {
  Rival: 'c-eff bad', Mentor: 'c-eff gold', 'Protégé': 'c-eff up', Friend: 'c-eff up', 'Trusted colleague': 'c-eff up', Disliked: 'c-eff dn', Colleague: 'c-eff', Stranger: 'c-eff',
};

/** How someone feels about you, in words (separate from whether they trust your work). */
const likesLabel = (v: number): string => (v >= 40 ? 'Likes you a lot' : v >= 10 ? 'Likes you' : v <= -40 ? 'Can’t stand you' : v <= -10 ? 'Doesn’t like you' : 'No strong feelings');

/** Career → Relationships: the wrestlers you've dealt with, and the bookers and promoters who know you. */
export function Relationships({ c, onBack }: Props) {
  const { w } = useWords();
  const [tab, setTab] = useState(0);
  const [file, setFile] = useState<string | null>(null);
  const me = findWrestler(c.player)!;
  const P = activeWorld().people;
  const people = relationsList(c);
  // Bookers who know you, plus your own promotion's booker even if they don't yet.
  const mine = me.promotion !== 'TIS' && P ? bookerOf(P, me.promotion)?.id : undefined;
  const keys = [...new Set([...(mine ? [mine] : []), ...Object.keys(c.bookers ?? {})])]
    .sort((a, b) => Number(b === mine) - Number(a === mine) || (memoryOf(c, b).matches - memoryOf(c, a).matches) || (a < b ? -1 : 1));
  const count = (label: string) => people.filter((x) => relLabel(c, x.id) === label).length;
  const summary = [
    count('Mentor') ? `${count('Mentor')} ${count('Mentor') === 1 ? 'mentor' : 'mentors'}` : '',
    count('Protégé') ? `${count('Protégé')} ${count('Protégé') === 1 ? 'protégé' : 'protégés'}` : '',
    count('Friend') ? `${count('Friend')} ${count('Friend') === 1 ? 'friend' : 'friends'}` : '',
    count('Rival') ? `${count('Rival')} ${count('Rival') === 1 ? 'rival' : 'rivals'}` : '',
    `${keys.length} ${keys.length === 1 ? 'booker or promoter who knows' : 'bookers and promoters who know'} you`,
  ].filter(Boolean).join(' · ');
  const staff = file && P ? P.staff[file] : undefined;

  return (
    <Screen>
      <Head title={w('Relationships')} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-start" style={{ marginTop: 10 }}><span className="c-lab">{w(me.name)}</span><span className="c-val">{summary}</span></div>
      <div className="c-steps cols2" style={{ marginTop: 8 }}>
        {['Wrestlers', 'Bookers'].map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t)}</button>)}
      </div>
      <div className="c-body">
        {tab === 0 && (people.length ? people.map(({ id, r }) => {
          const label = relLabel(c, id);
          const width = Math.abs(r.v) / 2;
          const why = r.log[0];
          return (
            <div key={id} className="c-ans" style={{ padding: '8px 10px', gap: 5 }}>
              <span className="c-rowsb"><Nm id={id} /><span className={KIND_CLASS[label] ?? 'c-eff'}>{w(label)}</span></span>
              <span className="c-rbar"><b /><i className={r.v >= 0 ? 'pos' : 'neg'} style={{ left: `${r.v >= 0 ? 50 : 50 - width}%`, width: `${width}%` }} /></span>
              <span className="c-ad">{why ? `${fmtDay(why.day, 'dm')} · ${why.t}` : `Met ${fmtDay(r.met, 'dm')}`}</span>
            </div>
          );
        }) : <span className="c-note">Nobody yet. Matches, favours and run-ins backstage build relationships.</span>)}
        {tab === 1 && (
          <>
            {keys.length === 0 && <span className="c-note">No booker or promoter knows you well yet.</span>}
            {keys.map((key) => {
              const t = trust(c, key);
              const s = P?.staff[key];
              const v = s && P ? bondOf(P, s.id, c.player)?.v ?? 0 : 0;
              const width = Math.abs(v) / 2;
              return (
                <button key={key} className="c-ans" style={{ padding: '8px 10px', gap: 5 }} onClick={() => s && setFile(s.id)} disabled={!s}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{s ? s.name : bookerName(key)}</b><span className="c-hint">{s && P ? jobLabel(P, s) : 'Indie promoter'}</span></span>
                  {s && <TraitChips traits={s.traits} />}
                  <span className="c-rowsb"><span className="c-lab">{w('Personally')}</span><span className={v >= 10 ? 'c-eff up' : v <= -10 ? 'c-eff dn' : 'c-eff'}>{w(likesLabel(v))}</span></span>
                  <span className="c-rbar"><b /><i className={v >= 0 ? 'pos' : 'neg'} style={{ left: `${v >= 0 ? 50 : 50 - width}%`, width: `${width}%` }} /></span>
                  <span className="c-rowsb"><span className="c-lab">{w('Your work')}</span><span className={t >= 65 ? 'c-eff up' : t < 45 ? 'c-eff dn' : 'c-eff'}>{w(trustLabel(t))}</span></span>
                  <div className="c-meter"><span className="c-bar"><i className={t < 35 ? 'c-fill best' : 'c-fill'} style={{ width: `${t}%` }} /></span><b className="c-big">{t}</b></div>
                  <span className="c-ad">{memoryLine(memoryOf(c, key))} · {w('Patience')} {Math.round(patienceOf(c, key))}</span>
                </button>
              );
            })}
            <span className="c-note">How they feel about you and whether they trust your work are separate: someone can like you and still not give you the title, or dislike you and book you anyway. Both stay with them if they change jobs.</span>
          </>
        )}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
      {staff && <BookerFile c={c} s={staff} onClose={() => setFile(null)} />}
    </Screen>
  );
}

/** A booker's or promoter's file: who they are, their career, how they feel about you, and what they've promised you. */
function BookerFile({ c, s, onClose }: { c: Career; s: Staffer; onClose: () => void }) {
  const { skin, w } = useWords();
  const P = activeWorld().people!;
  const age = Math.floor(daysBetween(s.born, c.today) / 365.25);
  const v = bondOf(P, s.id, c.player)?.v ?? 0;
  const t = trust(c, s.id);
  const where = (j: Staffer['spells'][number]['job']) => (j.kind === 'booker' ? `Booker, ${promoName(j.promo)}` : `Promoter, ${P.brands[j.brand]?.name ?? 'an indie'}`);
  const promises = [...(c.pledges ?? []).filter((p) => p.by === s.id), ...(c.pledgeLog ?? []).filter((p) => p.by === s.id || p.settledBy === s.id)];
  const what = (p: (typeof promises)[number]) => (p.kind === 'title' ? 'A title shot' : p.kind === 'match' ? 'A match' : p.kind === 'dates' ? 'Extra dates' : p.kind === 'defence' ? 'A title defence' : 'A booking');
  const status = (p: (typeof promises)[number]) => (p.status === 'refused' ? ['c-eff dn', 'Refused'] : p.status === 'kept' ? ['c-eff up', 'Kept'] : p.status === 'lapsed' ? ['c-eff', 'Lapsed'] : ['c-eff gold', 'Open']);
  return (
    <div className="c-ovl">
      <div className="c-top"><button className="c-back" onClick={onClose} aria-label="Back">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'The File' : 'BOOKER'}</div><span className="c-meta">{jobLabel(P, s)}</span></div>
      <div className="c-mast">The File</div>
      <div className="c-who">
        <div className="c-ini">{s.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</div>
        <div className="c-whot">
          <span className="c-tag">{s.background === 'wrestler' ? 'Former wrestler' : s.background === 'promoter' ? 'Promoter' : s.background === 'media' ? 'From the media' : s.background === 'trainer' ? 'Trainer' : 'From business'}</span>
          <b className="c-nm">{s.name}</b>
          <span className="c-sub">{age} · {s.country} · {w(`Standing ${s.rep}`)}</span>
          <TraitChips traits={s.traits} />
        </div>
      </div>
      <div className="c-body">
        <span className="c-ad">{s.bio}</span>
        <span className="c-sec">{w('You and them')}</span>
        <div className="c-kv">
          <span className="c-lab">{w('Personally')}</span><span className="c-val">{likesLabel(v)} ({v > 0 ? '+' : ''}{v})</span>
          <span className="c-lab">{w('Your work')}</span><span className="c-val">{trustLabel(t)} ({t})</span>
          <span className="c-lab">{w('Patience')}</span><span className="c-val">{Math.round(patienceOf(c, s.id))}</span>
          <span className="c-lab">{w('Remembers')}</span><span className="c-val">{memoryLine(memoryOf(c, s.id))}</span>
        </div>
        <span className="c-sec">{w('Career')}</span>
        {[...s.spells].reverse().map((sp, i) => (
          <div key={i} className="c-led" style={{ gridTemplateColumns: '92px minmax(0, 1fr)' }}>
            <span className="c-hint">{sp.from.slice(0, 4)}–{sp.to ? sp.to.slice(0, 4) : 'now'}</span>
            <span className="c-val">{where(sp.job)}{sp.end ? ` · ${sp.end === 'fired' ? 'fired' : sp.end === 'quit' ? 'quit' : sp.end === 'retired' ? 'retired' : sp.end === 'closed' ? 'closed it' : sp.end}` : ''}</span>
          </div>
        ))}
        {promises.length > 0 && <span className="c-sec">{w('What they promised you')}</span>}
        {promises.map((p, i) => {
          const [cls, label] = status(p);
          return (
            <div key={i} className="c-led" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
              <span className="c-val">{what(p)}{p.then ? ` · ${p.then}` : ''}</span>
              <span className={cls}>{w(label!)}</span>
            </div>
          );
        })}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onClose}>{w('‹ Back')}</button><button className="c-b1" onClick={onClose}>{w('Done')}</button></div>
    </div>
  );
}


