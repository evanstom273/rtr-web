import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { findWrestler } from '../../data/rtr';
import {
  answerEvent, contacts, eventChoices, GUESS_TEXT, markRead, preview, readOf, relationOf, relLabel, replyTo, send, threadList, threadOf, TONE_LABEL, topicsFor,
  type Career, type Letter, type ThreadItem, type Tone, type Topic,
} from '../../career';
import { fmtDay } from '../../career/dates';
import { activeWorld } from '../../world/world';
import { commit, Head, Nm, Screen, useWords } from './parts';

const FAMILY_WORD: Record<string, string> = { mother: 'Your mum', father: 'Your dad', sister: 'Your sister', brother: 'Your brother' };
const TONES: Tone[] = ['warm', 'plain', 'cocky', 'blunt'];
const nameOf = (id: string) => findWrestler(id)?.name ?? activeWorld().people?.staff[id]?.name ?? activeWorld().people?.folk?.[id]?.name ?? id;
const initials = (s: string) => s.replace(/"[^"]*"\s*/g, '').split(' ').map((x) => x[0]).join('').slice(0, 2);

/** What someone is to you, in a word: family, your trainer, or the relationship. */
function tagOf(c: Career, id: string): string {
  const f = activeWorld().people?.folk?.[id];
  if (f) return f.kind === 'family' ? FAMILY_WORD[f.rel ?? ''] ?? 'Family' : f.kind === 'trainer' ? 'Your trainer' : 'Friend';
  const s = activeWorld().people?.staff[id];
  return s ? (s.job?.kind === 'booker' ? `${s.job.promo} booker` : 'Promoter') : relLabel(c, id);
}
const preview1 = (x: ThreadItem): string => (x.msg ? `${x.msg.me ? 'You: ' : ''}${x.msg.text}` : x.letter!.kind === 'event' ? `In person: ${x.letter!.subject}` : x.letter!.body[0] ?? x.letter!.subject);

/** Career → Phone (Lyra's relationships redesign): a thread with each person in your life. */
export function Phone({ c, onBack, start }: { c: Career; onBack: () => void; start?: string }) {
  const { w } = useWords();
  const [open, setOpen] = useState<string | null>(start ?? null);
  const [picking, setPicking] = useState(false);
  if (open) return <Thread c={c} id={open} onBack={() => setOpen(null)} />;
  if (picking) return <Contacts c={c} onPick={(id) => { setPicking(false); setOpen(id); }} onBack={() => setPicking(false)} />;
  const list = threadList(c);
  return (
    <Screen>
      <Head title={w('Phone')} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        {!list.length && <span className="c-note">No messages yet. Start one: pick someone, what it’s about, and how you say it.</span>}
        {list.map((t) => (
          <button key={t.id} className={`c-ans c-thr${t.unread ? ' on' : ''}`} onClick={() => setOpen(t.id)}>
            <span className="c-av">{initials(nameOf(t.id))}</span>
            <span className="c-thrt">
              <span className="c-rowsb">{findWrestler(t.id) ? <Nm id={t.id} /> : <b className="c-at" style={{ fontSize: 16 }}>{nameOf(t.id)}</b>}<span className="c-hint">{fmtDay(t.last.day, 'dm')}</span></span>
              <span className="c-rowsb"><span className="c-ad c-ell">{preview1(t.last)}</span>{t.unread > 0 && <span className="c-cnt">{t.unread}</span>}</span>
              <span className="c-effs"><span className="c-eff">{w(tagOf(c, t.id))}</span>{t.waiting && <span className="c-eff gold">{w('Waiting on you')}</span>}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={() => setPicking(true)}>{w('New message ›', 'New ›')}</button></div>
    </Screen>
  );
}

/** Who to message: everyone you know, closest first. */
function Contacts({ c, onPick, onBack }: { c: Career; onPick: (id: string) => void; onBack: () => void }) {
  const { w } = useWords();
  const ids = contacts(c).slice(0, 80);
  return (
    <Screen>
      <Head title={w('New message')} meta={`${ids.length} ${ids.length === 1 ? 'person' : 'people'}`} onBack={onBack} />
      <div className="c-body">
        <span className="c-hint">{w('Everyone you know. The closer you are, the higher up.')}</span>
        {ids.map((id) => (
          <button key={id} className="c-ans c-thr" onClick={() => onPick(id)}>
            <span className="c-av">{initials(nameOf(id))}</span>
            <span className="c-thrt">
              <span className="c-rowsb">{findWrestler(id) ? <Nm id={id} /> : <b className="c-at" style={{ fontSize: 16 }}>{nameOf(id)}</b>}<span className="c-eff">{w(tagOf(c, id))}</span></span>
            </span>
          </button>
        ))}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Cancel')}</button></div>
    </Screen>
  );
}

/** You and them: texts both ways, and the moments you've had in person. */
function Thread({ c, id, onBack }: { c: Career; id: string; onBack: () => void }) {
  const { w } = useWords();
  const [, redraw] = useState(0);
  const [composing, setComposing] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const items = threadOf(c, id);
  useEffect(() => { markRead(c, id); commit(); }, [c, id, items.length]);
  useLayoutEffect(() => { const el = body.current; if (el) el.scrollTop = el.scrollHeight; }, [items.length]);
  const r = relationOf(c, id);
  const read = readOf(r);
  const knows = (r?.fam ?? 0) >= 75 ? 'Close' : (r?.fam ?? 0) >= 50 ? 'Know each other well' : (r?.fam ?? 0) >= 20 ? 'Know each other a bit' : 'Barely know each other';
  const done = () => { commit(); redraw((n) => n + 1); };
  let lastDay = '';
  return (
    <Screen>
      <Head title={nameOf(id)} meta={w(tagOf(c, id))} onBack={onBack} />
      <span className="c-hint" style={{ marginTop: 6 }}>{knows}{read === 'none' ? ' · you can’t tell how they feel about you' : ''}</span>
      <div className="c-body c-msgs" ref={body}>
        {!items.length && <span className="c-note">Nothing between you yet.</span>}
        {items.map((x) => {
          const sep = x.day !== lastDay ? <span key={`d${x.n}`} className="c-dsep">{fmtDay(x.day, 'dm')}</span> : null;
          lastDay = x.day;
          return [sep, x.msg ? (
            <div key={x.n} style={{ display: 'contents' }}>
              <span className={`c-bub${x.msg.me ? ' me' : ''}`}>{x.msg.text}</span>
              {x.msg.note && <span className="c-bnote">{x.msg.note}</span>}
            </div>
          ) : <LetterBit key={x.n} c={c} l={x.letter!} onDone={done} />];
        })}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={() => setComposing(true)}>{w('Message ›', 'Message ›')}</button></div>
      {composing && <Composer c={c} id={id} onClose={() => setComposing(false)} onSent={() => { setComposing(false); done(); }} />}
    </Screen>
  );
}

/** Something from them that wants an answer: a message, or a moment in person (an event). */
function LetterBit({ c, l, onDone }: { c: Career; l: Letter; onDone: () => void }) {
  const { w } = useWords();
  if (l.kind === 'event') {
    const choices = l.done ? [] : eventChoices(c, l.id);
    return (
      <div className="c-inp">
        <span className="c-lab">{w('In person')} · {l.subject}</span>
        {l.body.map((t, i) => <span key={i} className="c-val">{t}</span>)}
        {choices.map((o) => <button key={o.id} className="c-ans" disabled={!!o.blocked} onClick={() => { answerEvent(c, l.id, o.id); onDone(); }}><b className="c-at" style={{ fontSize: 15 }}>{o.label}</b>{(o.detail || o.blocked) && <span className="c-ad">{o.blocked ?? o.detail}</span>}</button>)}
        {l.picked && <span className="c-bub me">{l.picked}</span>}
        {l.outcome && <span className="c-bnote">{l.outcome}</span>}
      </div>
    );
  }
  const open = !!l.replies?.length && !l.replied && !l.done;
  return (
    <>
      {l.body.map((t, i) => <span key={i} className="c-bub">{t}</span>)}
      {open && <div className="c-reps">{l.replies!.map((r) => (
        <button key={r.id} className="c-ans" onClick={() => { replyTo(c, l.id, r.id); onDone(); }}>
          <b className="c-at" style={{ fontSize: 15 }}>{w(r.label)}</b>{r.detail && <span className="c-ad">{r.detail}</span>}
        </button>
      ))}</div>}
      {l.replied && <span className="c-bub me"><i>{l.replied}</i></span>}
      {l.outcome && <span className="c-bnote me">{l.outcome}</span>}
    </>
  );
}

/** Writing to them: what it's about (and who or where, for some), then how you say it. */
function Composer({ c, id, onClose, onSent }: { c: Career; id: string; onClose: () => void; onSent: () => void }) {
  const { w } = useWords();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [about, setAbout] = useState<string | undefined>(undefined);
  const [tone, setTone] = useState<Tone | null>(null);
  const topics = topicsFor(c, id);
  const t = topics.find((x) => x.topic === topic);
  const needsAbout = topic === 'gossip' || topic === 'word';
  const ready = topic && tone && (!needsAbout || about);
  const pv = ready ? preview(c, id, topic!, tone!, about) : null;
  return (
    <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div>
        <div className="c-sh">
          <div><span>{w('Message')} · {nameOf(id)}</span><b>{topic ? t?.label : w('What about?')}</b></div>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        {!topic && <div className="c-rows" style={{ overflowY: 'auto' }}>
          {topics.map((x) => <button key={x.topic} className="c-ans" disabled={!!x.blocked} onClick={() => setTopic(x.topic)}><b className="c-at" style={{ fontSize: 15 }}>{w(x.label)}</b>{x.blocked && <span className="c-ad">{x.blocked}</span>}</button>)}
        </div>}
        {topic && needsAbout && (
          <>
            <span className="c-lab">{w(topic === 'gossip' ? 'Who?' : 'Where?')}</span>
            <div className="c-chips">{(t?.about ?? []).map((a) => <button key={a} className={`c-chip${about === a ? ' on' : ''}`} onClick={() => setAbout(a)}>{topic === 'gossip' ? nameOf(a) : a}</button>)}</div>
          </>
        )}
        {topic && (
          <>
            <span className="c-lab">{w('How do you say it?')}</span>
            <div className="c-chips">{TONES.map((x) => <button key={x} className={`c-chip${tone === x ? ' on' : ''}`} onClick={() => setTone(x)}>{w(TONE_LABEL[x])}</button>)}</div>
          </>
        )}
        {pv && (
          <>
            <span className="c-bub me" style={{ marginTop: 4 }}>{pv.text}</span>
            <span className={`c-bnote me${pv.guess === 'bad' ? ' dn' : pv.guess === 'good' ? ' up' : ''}`}>{GUESS_TEXT[pv.guess]}</span>
          </>
        )}
        <div className="c-nav" style={{ marginTop: 6 }}>
          <button className="c-b2" onClick={() => (topic ? (setTopic(null), setTone(null), setAbout(undefined)) : onClose())}>{w(topic ? '‹ Change' : 'Cancel')}</button>
          <button className="c-b1" disabled={!ready} onClick={() => { if (send(c, id, topic!, tone!, about)) onSent(); }}>{w('Send')}</button>
        </div>
      </div>
    </div>
  );
}
