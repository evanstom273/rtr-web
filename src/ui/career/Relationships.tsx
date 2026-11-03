import { useState } from 'react';
import { findWrestler } from '../../data/rtr';
import { bookerName, memoryLine, memoryOf, patienceOf, relLabel, relationsList, trust, trustLabel, type Career } from '../../career';
import { fmtDay } from '../../career/dates';
import { Head, Nm, Screen, useWords } from './parts';

interface Props { c: Career; onBack: () => void }

const KIND_CLASS: Record<string, string> = {
  Rival: 'c-eff bad', Mentor: 'c-eff gold', 'Protégé': 'c-eff up', Friend: 'c-eff up', 'Trusted colleague': 'c-eff up', Disliked: 'c-eff dn', Colleague: 'c-eff', Stranger: 'c-eff',
};

/** Career → Relationships: how the wrestlers you've dealt with feel about you, and what each promoter remembers. */
export function Relationships({ c, onBack }: Props) {
  const { w } = useWords();
  const [tab, setTab] = useState(0);
  const me = findWrestler(c.player)!;
  const people = relationsList(c);
  const promoters = Object.keys(c.bookers ?? {}).sort((a, b) => (memoryOf(c, b).matches - memoryOf(c, a).matches) || (a < b ? -1 : 1));
  const count = (label: string) => people.filter((x) => relLabel(c, x.id) === label).length;
  const summary = [
    count('Mentor') ? `${count('Mentor')} ${count('Mentor') === 1 ? 'mentor' : 'mentors'}` : '',
    count('Protégé') ? `${count('Protégé')} ${count('Protégé') === 1 ? 'protégé' : 'protégés'}` : '',
    count('Friend') ? `${count('Friend')} ${count('Friend') === 1 ? 'friend' : 'friends'}` : '',
    count('Rival') ? `${count('Rival')} ${count('Rival') === 1 ? 'rival' : 'rivals'}` : '',
    `${promoters.length} ${promoters.length === 1 ? 'promoter who knows' : 'promoters who know'} you`,
  ].filter(Boolean).join(' · ');

  return (
    <Screen>
      <Head title={w('Relationships')} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-start" style={{ marginTop: 10 }}><span className="c-lab">{w(me.name)}</span><span className="c-val">{summary}</span></div>
      <div className="c-steps cols2" style={{ marginTop: 8 }}>
        {['Wrestlers', 'Promoters'].map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t)}</button>)}
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
            {promoters.length === 0 && <span className="c-note">No promoter knows you well yet.</span>}
            {promoters.map((key) => {
              const t = trust(c, key);
              return (
                <div key={key} className="c-ans" style={{ padding: '8px 10px', gap: 5 }}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{bookerName(key)}</b><span className={t >= 65 ? 'c-eff up' : t < 45 ? 'c-eff dn' : 'c-eff'}>{w(trustLabel(t))}</span></span>
                  <div className="c-meter"><span className="c-bar"><i className={t < 35 ? 'c-fill best' : 'c-fill'} style={{ width: `${t}%` }} /></span><b className="c-big">{t}</b></div>
                  <span className="c-ad">{memoryLine(memoryOf(c, key))}</span>
                  <span className="c-hint">{w('Patience')} {Math.round(patienceOf(c, key))}</span>
                </div>
              );
            })}
            <span className="c-note">Each promoter remembers for themselves: keeping to their plans, great matches and favours build trust; going off-script, no-shows and turning them down cost it.</span>
          </>
        )}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
    </Screen>
  );
}
