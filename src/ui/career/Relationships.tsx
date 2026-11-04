import { useState } from 'react';
import { findWrestler, type Staffer } from '../../data/rtr';
import { bookerName, memoryLine, memoryOf, MOOD_WHY, moodLabel, moodOf, patienceOf, promoName, readOf, relLabel, relationsList, trust, trustLabel, type Career } from '../../career';
import { daysBetween, fmtDay } from '../../career/dates';
import { activeWorld } from '../../world/world';
import { bookerOf, jobLabel, likeOf, type Orientation } from '../../world/people';
import { homeOf, schoolOf } from '../../world/social';
import { commit, Head, Nm, Screen, useWords } from './parts';
import { TraitChips } from './Traits';

interface Props { c: Career; onBack: () => void }

const KIND_CLASS: Record<string, string> = {
  Enemy: 'c-eff bad', Rival: 'c-eff bad', 'Friendly rival': 'c-eff gold', Mentor: 'c-eff gold', 'Protégé': 'c-eff up', 'Best friend': 'c-eff up', Friend: 'c-eff up',
  'Trusted colleague': 'c-eff up', Disliked: 'c-eff dn', Colleague: 'c-eff', Acquaintance: 'c-eff', Stranger: 'c-eff',
};

/** How someone feels about you, in words (separate from whether they trust your work). */
const likesLabel = (v: number): string => (v >= 40 ? 'Likes you a lot' : v >= 10 ? 'Likes you' : v <= -40 ? 'Can’t stand you' : v <= -10 ? 'Doesn’t like you' : 'No strong feelings');
const ratesLabel = (v: number): string => (v >= 40 ? 'Rates your work highly' : v >= 10 ? 'Rates your work' : v <= -40 ? 'Thinks you’re no good' : v <= -10 ? 'Not sold on your work' : 'Has no view of your work');
const knowsLabel = (f: number): string => (f >= 75 ? 'Close' : f >= 50 ? 'Know each other well' : f >= 20 ? 'Know each other a bit' : 'Barely know each other');
const ORIENT: { id: Orientation; label: string }[] = [{ id: 'straight', label: 'Straight' }, { id: 'gay', label: 'Gay' }, { id: 'bi', label: 'Bi' }, { id: 'ace', label: 'Ace' }];
const FAMILY_WORD: Record<string, string> = { mother: 'Your mum', father: 'Your dad', sister: 'Your sister', brother: 'Your brother' };

/** A −100..+100 dial as a bar from the middle. */
function Dial({ v }: { v: number }) {
  const width = Math.abs(v) / 2;
  return <span className="c-rbar"><b /><i className={v >= 0 ? 'pos' : 'neg'} style={{ left: `${v >= 0 ? 50 : 50 - width}%`, width: `${width}%` }} /></span>;
}

/** Career → Relationships: you (wellbeing, home, school), the people in your life, and the bookers and promoters who know you. */
export function Relationships({ c, onBack }: Props) {
  const { w } = useWords();
  const [tab, setTab] = useState(0);
  const [file, setFile] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const me = findWrestler(c.player)!;
  const P = activeWorld().people;
  const seed = activeWorld().seed;
  const people = relationsList(c);
  // Bookers who know you, plus your own promotion's booker even if they don't yet.
  const mine = me.promotion !== 'TIS' && P ? bookerOf(P, me.promotion)?.id : undefined;
  const keys = [...new Set([...(mine ? [mine] : []), ...Object.keys(c.bookers ?? {})])]
    .sort((a, b) => Number(b === mine) - Number(a === mine) || (memoryOf(c, b).matches - memoryOf(c, a).matches) || (a < b ? -1 : 1));
  const count = (label: string) => people.filter((x) => relLabel(c, x.id) === label).length;
  const plural = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const summary = [
    plural(count('Best friend'), 'best friend', 'best friends'), plural(count('Friend'), 'friend', 'friends'), plural(count('Mentor'), 'mentor', 'mentors'),
    plural(count('Protégé'), 'protégé', 'protégés'), plural(count('Rival') + count('Friendly rival'), 'rival', 'rivals'), plural(count('Enemy'), 'enemy', 'enemies'),
  ].filter(Boolean).join(' · ') || 'Nobody close yet';
  const staff = file && P ? P.staff[file] : undefined;
  const life = P?.lives?.[c.player];
  const mood = moodOf(c.player);
  const home = homeOf(seed, me.id, me.country, life);
  const school = schoolOf(seed, me.id, me.country);
  const orient = life?.orient;
  const setOrient = (o: Orientation) => { ((P!.lives ??= {})[c.player] ??= {}).orient = o; commit(); redraw((n) => n + 1); };

  return (
    <Screen>
      <Head title={w('Relationships')} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-start" style={{ marginTop: 10 }}>
        <div className="c-rowsb"><span className="c-lab">{w(me.name)}</span><span className={mood >= 65 ? 'c-eff up' : mood < 40 ? 'c-eff dn' : 'c-eff'}>{w(moodLabel(mood))}</span></div>
        <div className="c-meter"><span className="c-bar"><i className={mood < 35 ? 'c-fill best' : 'c-fill'} style={{ width: `${mood}%` }} /></span><b className="c-big">{mood}</b></div>
        <span className="c-val">{(life?.why ?? []).map((x) => MOOD_WHY[x.slice(1)] ?? x).join(' · ') || 'Wellbeing: how your life’s going, in and out of the ring.'}</span>
        <span className="c-hint">{summary}</span>
        <span className="c-hint">{home ? `${home}, ` : ''}{c.base ?? me.country} · trained at {school.name}</span>
      </div>
      <div className="c-steps cols2" style={{ marginTop: 8 }}>
        {['People', 'Bookers'].map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t)}</button>)}
      </div>
      <div className="c-body">
        {tab === 0 && (people.length ? people.map(({ id, r }) => {
          const label = relLabel(c, id);
          const read = readOf(r);
          const why = r.log[0];
          const folk = P?.folk?.[id];
          return (
            <div key={id} className="c-ans" style={{ padding: '8px 10px', gap: 5 }}>
              <span className="c-rowsb">{folk ? <b className="c-at" style={{ fontSize: 16 }}>{folk.name}</b> : <Nm id={id} />}<span className={KIND_CLASS[label] ?? 'c-eff'}>{w(folk?.kind === 'family' ? FAMILY_WORD[folk.rel ?? ''] ?? 'Family' : folk?.kind === 'trainer' ? 'Your trainer' : label)}</span></span>
              {read === 'none' ? <span className="c-hint">{w('You don’t know them well enough to tell how they feel.')}</span> : (
                <>
                  <span className="c-rowsb"><span className="c-lab">{w(likesLabel(r.v))}</span>{read === 'clear' && <span className="c-hint">{r.v > 0 ? '+' : ''}{r.v}</span>}</span>
                  <Dial v={read === 'clear' ? r.v : Math.round(r.v / 20) * 20} />
                  {!folk && <>
                    <span className="c-rowsb"><span className="c-lab">{w(ratesLabel(r.respect ?? 0))}</span>{read === 'clear' && <span className="c-hint">{(r.respect ?? 0) > 0 ? '+' : ''}{r.respect ?? 0}</span>}</span>
                    <Dial v={read === 'clear' ? r.respect ?? 0 : Math.round((r.respect ?? 0) / 20) * 20} />
                  </>}
                </>
              )}
              <span className="c-ad">{knowsLabel(r.fam ?? 0)}{why ? ` · ${fmtDay(why.day, 'dm')}: ${why.t}` : ` · met ${fmtDay(r.met, 'dm')}`}</span>
            </div>
          );
        }) : <span className="c-note">Nobody yet. The people on the card with you, matches, favours and run-ins backstage build relationships.</span>)}
        {tab === 0 && (
          <>
            <span className="c-sec">{w('You')}</span>
            <span className="c-hint">{w('Your orientation (yours to set; everyone else has their own, which you learn by getting to know them).')}</span>
            <div className="c-chips">{ORIENT.map((o) => <button key={o.id} className={`c-chip${orient === o.id ? ' on' : ''}`} onClick={() => setOrient(o.id)}>{w(o.label)}</button>)}</div>
            <span className="c-note">Everyone feels their own way about you: whether they like you, and whether they rate your work. The better you know someone, the clearer you can read them. Someone who can’t stand you can hide it if you barely know them.</span>
          </>
        )}
        {tab === 1 && (
          <>
            {keys.length === 0 && <span className="c-note">No booker or promoter knows you well yet.</span>}
            {keys.map((key) => {
              const t = trust(c, key);
              const s = P?.staff[key];
              const v = s && P ? likeOf(P, s.id, c.player) : 0;
              return (
                <button key={key} className="c-ans" style={{ padding: '8px 10px', gap: 5 }} onClick={() => s && setFile(s.id)} disabled={!s}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{s ? s.name : bookerName(key)}</b><span className="c-hint">{s && P ? jobLabel(P, s) : 'Indie promoter'}</span></span>
                  {s && <TraitChips traits={s.traits} />}
                  <span className="c-rowsb"><span className="c-lab">{w('Personally')}</span><span className={v >= 10 ? 'c-eff up' : v <= -10 ? 'c-eff dn' : 'c-eff'}>{w(likesLabel(v))}</span></span>
                  <Dial v={v} />
                  <span className="c-rowsb"><span className="c-lab">{w('Your work')}</span><span className={t >= 65 ? 'c-eff up' : t < 45 ? 'c-eff dn' : 'c-eff'}>{w(trustLabel(t))}</span></span>
                  <div className="c-meter"><span className="c-bar"><i className={t < 35 ? 'c-fill best' : 'c-fill'} style={{ width: `${t}%` }} /></span><b className="c-big">{t}</b></div>
                  <span className="c-ad">{memoryLine(memoryOf(c, key))} · {w('Patience')} {Math.round(patienceOf(c, key))}</span>
                </button>
              );
            })}
            <span className="c-note">How they feel about you and whether they trust your work are separate: someone can like you and still not give you the title, or dislike you and book you anyway. A booker’s trust is how they rate your work. Both stay with them if they change jobs.</span>
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
  const v = likeOf(P, s.id, c.player);
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


