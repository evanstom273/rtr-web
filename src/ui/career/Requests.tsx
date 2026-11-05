import { useMemo, useState, type ReactNode } from 'react';
import { fansIn, fansTotal, findWrestler, fmtFans, globalScore, TITLES, WRESTLERS, rosterOf, worksFor } from '../../data/rtr';
import {
  C, PATIENCE_FLOOR, PATIENCE_START, answerCounter, askApproach, askChallenge, askDayOff, askIndieChallenge, askMore, askRelease, askReview,
  askRival, askShow, askSpot, askTitleShot, askTryout, askIndieTitleShot, askableIndieShows, askableIndieTitles, askableShows, askableTitles, caughtChance, cooldownLeft, counterLabel,
  announceRetirement, bookHoliday, holidays, leaveContract, setPartTime, setTours, setWalk, takeOption, tierOf,
  bookerName, countersWaiting, creativeTier, exitTerms, firstAskable, myPromo, otherPromotions, patienceOf, person, previewChallenge, previewIndieChallenge,
  previewIndieTitle, previewMore, previewShow, previewSpot, previewTitle, promoName, standingWith, gradeOf, FACTOR_NAME, type Ask, type Career, type Preview, type Show,
} from '../../career';
import { titleMinGap } from '../../career/booker';
import { sideWork } from '../../career/deals';
import { isIndieBooker, patienceLog, promoOfBooker, showBooker } from '../../career/patience';
import { addDays, daysBetween, fmtDay } from '../../career/dates';
import { REGION_LABEL } from '../../career/places';
import { COOLDOWN_CHALLENGE, COOLDOWN_MORE, COOLDOWN_PROMOTION, COOLDOWN_TITLE, PATIENCE_DECLINE_COUNTER, PATIENCE_TOOK_COUNTER } from '../../career/tuning';
import { commit, Head, money, Nm, Screen, useToast, useWords, Holders } from './parts';

/** Where a request starts: the Requests tab, or a shortcut elsewhere (a show sheet, a file, a lineage). */
export type ReqRoute =
  | { req: 'title'; title?: string; indie?: boolean }
  | { req: 'challenge'; target?: string; show?: string; indie?: boolean }
  | { req: 'book'; tab?: number; show?: string }
  | { req: 'spot'; show?: string }
  | { req: 'approach'; tab?: number; promo?: string }
  | { req: 'dayoff' }
  | { req: 'rival' }
  | { req: 'creative' }
  | { req: 'scouting' };

const showLine = (s: Show): string => `${fmtDay(s.date, 'dm')} · ${s.city}${s.promo === 'TIS' ? `, ${s.country}` : ''}`;

function Meter({ v }: { v: number }) {
  return (
    <div className="c-meter">
      <span className="c-bar"><i className={v < PATIENCE_FLOOR ? 'c-fill best' : 'c-fill'} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
      <b className="c-big">{Math.round(v)}</b>
    </div>
  );
}

function Booker({ c, who, keyName }: { c: Career; who: string; keyName: string | null }) {
  const { w } = useWords();
  return (
    <div className="c-start" style={{ marginTop: 10, gap: 4 }}>
      <div className="c-rowsb"><span className="c-lab">{who}</span><span className="c-hint">{w(keyName && isIndieBooker(keyName) ? 'Promoter patience' : 'Booker patience')}</span></div>
      {keyName ? <Meter v={patienceOf(c, keyName)} /> : <span className="c-val">No booker: each indie promoter answers for themselves.</span>}
    </div>
  );
}

const chipClass = (s: number): string => (s > 0 ? 'c-eff up' : s < 0 ? 'c-eff dn' : 'c-eff');

/** Where you stand, what they'll weigh, and anything that stops the ask. */
function Weigh({ pv, notes, nag }: { pv: Preview; notes?: string[]; nag?: string | null }) {
  const { w } = useWords();
  return (
    <>
      {pv.stand.length > 0 && (
        <>
          <span className="c-sec">{w('Where you stand')}</span>
          <div className="c-kv">{pv.stand.map(([l, v]) => <span key={l} style={{ display: 'contents' }}><span className="c-lab">{w(l)}</span><span className="c-val">{v}</span></span>)}</div>
        </>
      )}
      <span className="c-sec">{w('What they’ll weigh')}</span>
      <div className="c-chips">{pv.weigh.map((x) => <span key={x.t} className={chipClass(x.s)}>{x.t}</span>)}</div>
      {notes?.map((n) => <span key={n} className="c-note">{n}</span>)}
      {pv.hard && <div className="c-warn">{pv.hard}</div>}
      {!pv.hard && nag && <div className="c-warn">{nag}</div>}
    </>
  );
}

/** Their answer: yes, no, or a counter you take or turn down. */
function AnswerSheet({ c, a, onClose, onNegotiate }: { c: Career; a: Ask; onClose: () => void; onNegotiate: (offer: string) => void }) {
  const { skin, w } = useWords();
  const [, bump] = useState(0);
  const k = a.counter;
  const show = k?.pledge?.show ? c.shows[k.pledge.show] : k?.tryout ? c.shows[k.tryout.show] : undefined;
  const opp = k?.pledge?.opp ? findWrestler(k.pledge.opp) : undefined;
  const title = k?.pledge?.title ?? k?.pledge?.earn;
  const offer = a.kind === 'approach' || a.kind === 'tryout' ? c.offers.find((o) => o.promo === a.to && o.status === 'open') : undefined;
  const open = a.status === 'open';
  const terms: [string, string][] = k ? [
    ['Counter', counterLabel(k.kind)],
    ...(title ? [['Title', TITLES.find((t) => t.id === title)?.name ?? title] as [string, string]] : []),
    ...(show ? [['Show', `${show.name} · ${fmtDay(show.date, 'dm')} · ${show.city}`] as [string, string]] : k.pledge?.from ? [['From', fmtDay(k.pledge.from, 'dm')] as [string, string]] : []),
    ...(opp ? [['Against', opp.name] as [string, string]] : []),
  ] : [];
  const act = (yes: boolean) => { answerCounter(c, a.id, yes); commit(); bump((n) => n + 1); };
  return (
    <div className="c-ovl">
      <div className="c-top"><button className="c-back" onClick={onClose} aria-label="Back">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{w('The Answer')}</div><span className="c-meta">{w(fmtDay(c.today, 'long'), fmtDay(c.today))}</span></div>
      <div className="c-mast">The Answer</div>
      <div className="c-body">
        <div className="c-rowsb"><span className="c-lab">{w(a.toName)}</span><span className={a.answer === 'yes' ? 'c-eff up' : a.answer === 'no' ? 'c-eff dn' : 'c-eff gold'}>{w(a.answer === 'counter' ? (k ? counterLabel(k.kind) : 'Counter') : a.answer === 'yes' ? 'Yes' : 'No')}</span></div>
        <span className="c-at" style={{ fontSize: 15 }}>{a.what}</span>
        <span className="c-qtext" style={{ fontSize: 25 }}>{a.said}</span>
        {terms.length > 0 && <div className="c-kv">{terms.map(([l, v]) => <span key={l} style={{ display: 'contents' }}><span className="c-lab">{w(l)}</span><span className="c-val">{v}</span></span>)}</div>}
        {a.then && <span className="c-ad" style={{ fontSize: 15 }}>{a.then}</span>}
        {open && <span className="c-note">Turning it down costs {a.toName} patience ({PATIENCE_DECLINE_COUNTER}). Taking it gives some back (+{PATIENCE_TOOK_COUNTER}).</span>}
      </div>
      <div className="c-nav">
        {open ? (
          <>
            <button className="c-b2" onClick={() => act(false)}>{w('Decline')}</button>
            <button className="c-b1" onClick={() => act(true)}>{w('Accept')}</button>
          </>
        ) : offer ? (
          <>
            <button className="c-b2" onClick={onClose}>{w('Close')}</button>
            <button className="c-b1" onClick={() => onNegotiate(offer.id)}>{w('Negotiate ›')}</button>
          </>
        ) : (
          <>
            <button className="c-b2" onClick={onClose}>{w('Close')}</button>
            <button className="c-b1" onClick={onClose}>{w('Fine', 'OK')}</button>
          </>
        )}
      </div>
    </div>
  );
}

interface ReqProps { c: Career; tab?: number; onBack: () => void; onFlow: (r: ReqRoute) => void; onNegotiate: (offer: string) => void }

/** The tab you were on, so coming back from a request lands you there (answering one shows Answers). */
let rememberedTab = 0;
export const showAnswersNext = (): void => { rememberedTab = 1; };

/** The Requests tab: everything you can ask for, what they said, and how patient they are with you. */
export function Requests({ c, tab: start, onBack, onFlow, onNegotiate }: ReqProps) {
  const { w } = useWords();
  const [tab, setTabState] = useState(start ?? rememberedTab);
  const setTab = (n: number) => { rememberedTab = n; setTabState(n); };
  const [open, setOpen] = useState<Ask | null>(null);
  const [confirm, setConfirm] = useState(false);
  const p = person(c, c.player);
  const k = p.contract;
  const promo = myPromo(c);
  const asked = (key: string, days: number) => { const d = cooldownLeft(c, key, days); return d ? `Asked ${fmtDay(addDays(c.today, d - days), 'dm')}` : null; };
  const titles = askableTitles(c);
  const ranks = titles.map((t) => previewTitle(c, t.id).stand[0]?.[1]).filter((x) => x && x !== '—');
  const exit = exitTerms(c);
  const indieOk = sideWork(c.people[c.player]).rule !== 'banned';
  const rivals = k ? c.offers.filter((o) => o.status === 'open' && o.promo !== k.promo) : [];
  const run = (f: () => Ask) => { const a = f(); commit(); setOpen(a); };
  const [toast, say] = useToast();
  const [, bump] = useState(0);
  const [retireAsk, setRetireAsk] = useState(false);
  const act = (f: () => string) => { say(f()); commit(); bump((n) => n + 1); };
  const hol = holidays(c);

  type Item = { t: string; d: string; go?: () => void; tag?: string | null; tc?: string };
  const groups: { t: string; items: Item[] }[] = [];
  if (k) {
    groups.push({ t: w(`Your booker: ${k.promo}`, `Your booker · ${k.promo}`), items: [
      { t: 'Ask for a title shot', d: titles.length ? `${titles.map((t) => t.name).join(' · ')}` : 'No titles for your division here.', go: titles.length ? () => onFlow({ req: 'title' }) : undefined,
        tag: asked('title', COOLDOWN_TITLE) ?? (ranks[0] ? `${ranks[0]} contender` : null), tc: cooldownLeft(c, 'title', COOLDOWN_TITLE) ? 'c-eff bad' : 'c-eff gold' },
      { t: 'Challenge a wrestler', d: `Pick anyone on the ${k.promo} roster and a show from ${fmtDay(firstAskable(c), 'dm')}.`, go: () => onFlow({ req: 'challenge' }), tag: asked('challenge', COOLDOWN_CHALLENGE), tc: 'c-eff bad' },
      { t: 'Ask to be on a show', d: `Any ${k.promo} show from ${fmtDay(firstAskable(c), 'dm')}. The next seven days’ cards are set.`, go: () => onFlow({ req: 'book', tab: 0 }) },
      { t: 'Ask for more matches', d: 'A yes means a minimum number of dates next month.', go: () => onFlow({ req: 'book', tab: 1 }), tag: asked('more', COOLDOWN_MORE), tc: 'c-eff bad' },
      { t: 'Creative Control', d: 'Finishes either way, opponents, the main event, feuds and turns.', go: () => onFlow({ req: 'creative' }), tag: creativeTier(c, k.promo) ? null : 'Needs Creative Control' },
      { t: 'Ask for a day off', d: (k.clauses[C.schedule] ?? 0) >= 3 ? 'Or refuse a date you’re booked on.' : 'On a day your promotion has a show.', go: (k.clauses[C.schedule] ?? 0) ? () => onFlow({ req: 'dayoff' }) : undefined, tag: (k.clauses[C.schedule] ?? 0) ? null : 'Needs Schedule Flexibility' },
    ] });
    groups.push({ t: w('Your contract'), items: [
      { t: 'Pay review', d: 'Against wrestlers of your standing here.', go: (k.clauses[C.wage] ?? 0) >= 1 ? () => run(() => askReview(c)) : undefined, tag: (k.clauses[C.wage] ?? 0) >= 1 ? null : 'Needs Wage Matching' },
      { t: 'Show them a rival offer', d: rivals.length ? `${rivals.length} open: ${rivals.map((o) => o.promo).join(', ')}.` : 'They can match it, up to a point.', go: (k.clauses[C.wage] ?? 0) >= 2 && rivals.length ? () => onFlow({ req: 'rival' }) : undefined, tag: (k.clauses[C.wage] ?? 0) >= 2 ? (rivals.length ? null : 'No rival offers') : 'Needs Wage Matching T2' },
      { t: exit.free ? 'Walk away (they broke their promises)' : exit.tier === 3 ? 'Leave now' : exit.tier === 2 ? 'Give notice' : exit.tier === 1 ? 'Buy yourself out' : 'Ask for your release', d: exit.text, go: k.leaving ? undefined : () => setConfirm(true), tag: k.leaving ? `Leaving ${fmtDay(k.leaving, 'dm')}` : null },
      ...((p.deals ?? []).map((x): Item => ({ t: `Leave ${x.promo}`, d: exitTerms(c, x.promo).text, go: () => act(() => leaveContract(c, x.promo)) }))),
      { t: 'Book a holiday week', d: hol.allowed ? `${hol.allowed - hol.used} of ${hol.allowed} left this contract year. No bookings that week, no penalty.` : 'Agreed weeks off.', go: hol.allowed > hol.used ? () => act(() => bookHoliday(c, addDays(c.today, 8))) : undefined, tag: hol.allowed ? null : 'Needs Schedule Flexibility' },
      { t: k.dates && (p.deals ?? []).length === 0 ? 'Go back full-time' : 'Go part-time', d: `A few dates a month (${k.dates ? `now ${k.dates}` : 'the booker’s call now'}).`, go: tierOf(k, 'schedule') >= 2 ? () => act(() => setPartTime(c, !(k.dates && (p.deals ?? []).length === 0))) : undefined, tag: tierOf(k, 'schedule') >= 2 ? null : 'Needs Schedule Flexibility T2' },
      { t: k.tours ? 'Come off their tours' : 'Join their tours', d: 'Tour dates abroad: fans in other regions, weeks away.', go: tierOf(k, 'touring') >= 2 ? () => act(() => setTours(c, !k.tours)) : undefined, tag: tierOf(k, 'touring') >= 2 ? (k.tours ? 'On' : 'Off') : 'Needs International Touring T2' },
      { t: 'Take up your option year', d: `Another 12 months on the same terms (from six months before ${fmtDay(k.end, 'dm')}).`, go: tierOf(k, 'renewal') >= 1 && !k.optioned ? () => act(() => takeOption(c)) : undefined, tag: tierOf(k, 'renewal') >= 1 ? (k.optioned ? 'Taken' : null) : 'Their option, not yours' },
      ...(tierOf(k, 'renewal') >= 3 ? [{ t: k.walk ? 'Let it renew' : 'Let it run out', d: k.walk ? 'It renews itself with a raise.' : `You’ll leave on ${fmtDay(k.end, 'dm')} instead of renewing.`, go: () => act(() => setWalk(c, !k.walk)) } as Item] : []),
      { t: 'Announce your retirement', d: tierOf(k, 'retirement') ? `Your contract guarantees a farewell${tierOf(k, 'retirement') >= 2 ? ', a night in your honour' : ''}${tierOf(k, 'retirement') >= 3 ? ' and a pension' : ''}.` : 'Your last day would be a month away. No farewell guaranteed.', go: p.retiring ? undefined : () => setRetireAsk(true), tag: p.retiring ? `Last day ${fmtDay(p.retiring, 'dm')}` : null, tc: 'c-eff bad' },
    ] });
  }
  groups.push({ t: w('Other promotions'), items: [
    { t: 'Approach a promotion', d: k ? `Ask about a contract. ${k.promo} might find out.` : 'Ask about a contract.', go: () => onFlow({ req: 'approach', tab: 0 }), tag: k ? 'Risky while signed' : null, tc: 'c-eff bad' },
    { t: 'Ask for a tryout', d: 'One match on their show, written up by a scout.', go: () => onFlow({ req: 'approach', tab: 1 }) },
    { t: 'Scouting reports', d: 'How every major rates you, what they value, and where you are with them.', go: () => onFlow({ req: 'scouting' }) },
  ] });
  const indieTitles = askableIndieTitles(c);
  groups.push({ t: w('The Indie Scene'), items: [
    ...(indieTitles.length ? [{ t: 'Ask for a title shot', d: `${indieTitles.map((t) => t.name).join(' · ')}. Pick an indie show; its promoter answers.`, go: () => onFlow({ req: 'title', indie: true }),
      tag: asked('title', COOLDOWN_TITLE), tc: 'c-eff bad' } as Item] : []),
    { t: 'Ask for a spot on an indie show', d: `Indie shows from ${fmtDay(firstAskable(c), 'dm')}.`, go: indieOk ? () => onFlow({ req: 'spot' }) : undefined, tag: indieOk ? null : 'Needs Indie Bookings' },
    { t: 'Challenge someone on an indie show', d: 'Including wrestlers from other promotions.', go: indieOk ? () => onFlow({ req: 'challenge', indie: true }) : undefined, tag: indieOk ? null : 'Needs Indie Bookings' },
  ] });

  const waiting = countersWaiting(c);
  const answered = (c.asks ?? []).filter((a) => a.status !== 'open');
  const keys = Object.keys(c.patience ?? {});
  const askedPromos = [...new Set([...keys.map(promoOfBooker), ...(c.asks ?? []).map((a) => a.to)])].filter((x): x is string => !!x && x !== promo && !x.startsWith('TIS'));
  const promoters = [...new Set([...keys, ...(c.asks ?? []).map((a) => a.to)])].filter((x) => isIndieBooker(x));
  const chip = (a: Ask) => (a.answer === 'yes' ? ['c-eff up', 'Yes'] : a.answer === 'no' ? ['c-eff dn', 'No'] : a.counter?.kind === 'feud' ? ['c-eff', 'Wait for the feud'] : ['c-eff gold', 'Counter']);
  const log = (key: string) => patienceLog(c, key);

  return (
    <Screen>
      <Head title={w('Requests')} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <Booker c={c} who={promo ? w(`Your booker · ${promo}`) : w('Free agent')} keyName={promo} />
      <div className="c-steps cols3" style={{ marginTop: 8 }}>
        {['Ask', 'Answers', 'Patience'].map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t)}{i === 1 && waiting.length > 0 ? ` (${waiting.length})` : ''}</button>)}
      </div>
      <div className="c-body">
        {tab === 0 && groups.map((g) => (
          <div key={g.t} style={{ display: 'contents' }}>
            <span className="c-sec">{g.t}</span>
            {g.items.map((i) => (
              <button key={i.t} className={i.go ? 'c-ans' : 'c-ans dis'} disabled={!i.go} onClick={i.go} style={{ padding: '8px 10px' }}>
                <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{i.t}</b>{i.tag && <span className={i.tc ?? 'c-eff'}>{w(i.tag)}</span>}</span>
                <span className="c-ad">{i.d}</span>
              </button>
            ))}
          </div>
        ))}
        {tab === 1 && (
          <>
            <span className="c-sec">{w('Waiting on you')}</span>
            {waiting.length === 0 && <span className="c-note">Nothing waiting. Counters land here until you take them or turn them down.</span>}
            {waiting.map((a) => (
              <button key={a.id} className="c-ans on" onClick={() => setOpen(a)} style={{ padding: '8px 10px' }}>
                <span className="c-rowsb"><span className="c-lab">{fmtDay(a.day, 'dm')} · {a.toName}</span><span className={chip(a)[0]}>{w(a.counter ? counterLabel(a.counter.kind) : 'Counter')}</span></span>
                <b className="c-at" style={{ fontSize: 16 }}>{a.what}</b>
                <span className="c-ad">{a.said}</span>
                <span className="c-hint">{w('Tap to take it or turn it down')}</span>
              </button>
            ))}
            <span className="c-sec">{w('Answered')}</span>
            {answered.length === 0 && <span className="c-note">You haven’t asked for anything yet.</span>}
            {answered.map((a) => (
              <button key={a.id} className="c-ans" onClick={() => setOpen(a)} style={{ padding: '8px 10px' }}>
                <span className="c-rowsb"><span className="c-lab">{fmtDay(a.day, 'dm')} · {a.toName}</span><span className={chip(a)[0]}>{w(chip(a)[1]!)}</span></span>
                <b className="c-at" style={{ fontSize: 16 }}>{a.what}</b>
                <span className="c-ad">{a.said}</span>
                {a.then && <span className="c-hint">{a.then}</span>}
              </button>
            ))}
          </>
        )}
        {tab === 2 && (
          <>
            {promo && (
              <>
                <span className="c-sec">{w(`Your booker: ${promo}`, `Your booker · ${promo}`)}</span>
                <PatienceCard name={promoName(promo)} v={patienceOf(c, promo)} log={log(promo)} />
              </>
            )}
            <span className="c-sec">{w('Promotions you’ve asked')}</span>
            {askedPromos.length === 0 && <span className="c-note">None yet.</span>}
            {askedPromos.map((x) => <PatienceCard key={x} name={promoName(x)} v={patienceOf(c, x)} log={log(x)} />)}
            <span className="c-sec">{w('The Indie Scene')}</span>
            {promoters.length === 0 && <span className="c-note">None yet. Each indie promoter has their own patience once you ask them for something.</span>}
            {promoters.map((x) => <PatienceCard key={x} name={bookerName(x)} v={patienceOf(c, x)} log={log(x)} />)}
            <span className="c-sec">{w('What moves patience', 'What moves it')}</span>
            <div className="c-kv">
              <span className="c-lab">{w('Up')}</span><span className="c-val">Time, good matches on their shows, following their plan, taking their counters.</span>
              <span className="c-lab">{w('Down')}</span><span className="c-val">Turning down their counters, asking again too soon, going off-script, missing dates.</span>
              <span className="c-lab">{w('Too low')}</span><span className="c-val">Below {PATIENCE_FLOOR} they won’t hear any request until it recovers.</span>
            </div>
          </>
        )}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Back to the diary', 'Calendar ›')}</button></div>
      {confirm && k && (
        <div className="c-ovl">
          <Head title={w('Your Contract')} meta={k.promo} onBack={() => setConfirm(false)} />
          <div className="c-body">
            <span className="c-qtext" style={{ fontSize: 25 }}>{exit.tier === 3 ? 'Leave now?' : exit.tier === 2 ? 'Give notice?' : exit.tier === 1 ? 'Buy yourself out?' : 'Ask for your release?'}</span>
            <span className="c-ad" style={{ fontSize: 15 }}>{exit.text}</span>
          </div>
          <div className="c-nav">
            <button className="c-b2" onClick={() => setConfirm(false)}>{w('Cancel')}</button>
            <button className="c-b1" onClick={() => { setConfirm(false); run(() => askRelease(c)); }}>{w(exit.tier === 0 ? 'Ask' : 'Do it')}</button>
          </div>
        </div>
      )}
      {retireAsk && (
        <div className="c-ovl">
          <Head title={w('Retirement')} meta={k?.promo ?? ''} onBack={() => setRetireAsk(false)} />
          <div className="c-body">
            <span className="c-qtext" style={{ fontSize: 25 }}>{w('Hang up the boots?')}</span>
            <span className="c-ad" style={{ fontSize: 15 }}>Your career ends after your last day. {k && tierOf(k, 'retirement') ? 'Your contract guarantees your farewell.' : 'Without Retirement & Legacy, there’s no farewell guaranteed.'}</span>
          </div>
          <div className="c-nav">
            <button className="c-b2" onClick={() => setRetireAsk(false)}>{w('Not yet')}</button>
            <button className="c-b1" onClick={() => { setRetireAsk(false); act(() => announceRetirement(c)); }}>{w('Announce it')}</button>
          </div>
        </div>
      )}
      {open && <AnswerSheet c={c} a={open} onClose={() => { setOpen(null); }} onNegotiate={onNegotiate} />}
      {toast}
    </Screen>
  );
}

function PatienceCard({ name, v, log }: { name: string; v: number; log: { day: string; d: number; t: string }[] }) {
  return (
    <div className="c-ans" style={{ padding: '8px 10px', gap: 5 }}>
      <b className="c-at" style={{ fontSize: 16 }}>{name}</b>
      <Meter v={v} />
      {log.slice(0, 3).map((l, i) => (
        <div key={i} className="c-logl"><span className={l.d < 0 ? 'c-eff dn' : 'c-eff up'}>{fmtDay(l.day, 'dm')}</span><span className="c-ad">{l.t}: {l.d > 0 ? '+' : ''}{l.d}</span></div>
      ))}
      {v < PATIENCE_START && <span className="c-hint">Time: +2 a week, up to {PATIENCE_START}</span>}
    </div>
  );
}

interface FlowProps { c: Career; route: ReqRoute; onBack: () => void; onNegotiate: (offer: string) => void; onAnswered: () => void }

/** One request: pick what you're asking for, see what they'll weigh, ask. */
export function RequestFlow({ c, route, onBack, onNegotiate, onAnswered }: FlowProps) {
  const { w } = useWords();
  const [ans, setAns] = useState<Ask | null>(null);
  const k = person(c, c.player).contract;
  const promo = myPromo(c);
  const done = (a: Ask) => { commit(); setAns(a); };
  const close = () => { setAns(null); onAnswered(); };
  let title = '', who = '', booker: string | null = promo;
  let body: ReactNode = null;
  let pv: Preview | null = null;
  let ask: (() => Ask) | null = null;
  let nag: string | null = null;
  let notes: string[] = [];
  let top: ReactNode = null;

  const nagText = (key: string, days: number, what: string) => {
    const d = cooldownLeft(c, key, days);
    return d ? `You asked ${what} on ${fmtDay(addDays(c.today, d - days), 'dm')}. Asking again before ${fmtDay(addDays(c.today, d), 'dm')} is nagging: patience −8 and reputation −1.` : null;
  };

  const [i, setI] = useState(0);
  const [j, setJ] = useState(0);
  const [tab, setTab] = useState('tab' in route ? route.tab ?? 0 : 0);
  const [sel, setSel] = useState<string | null>('show' in route ? route.show ?? null : null);
  const [target, setTarget] = useState<string | null>(route.req === 'challenge' ? route.target ?? null : null);
  const [indie, setIndie] = useState<boolean>(route.req === 'challenge' ? !!route.indie || !promo || (!!route.target && !worksFor(findWrestler(route.target)!, promo)) : false);
  const [picking, setPicking] = useState(route.req === 'challenge' && !route.target);
  const [q, setQ] = useState('');
  const cyc = (n: number, inner: ReactNode) => (
    <div className="c-cyc" style={{ marginTop: 8 }}>
      <button className="c-stepb" onClick={() => setI((i + n - 1) % n)} aria-label="Previous">‹</button>
      {inner}
      <button className="c-stepb" onClick={() => setI((i + 1) % n)} aria-label="Next">›</button>
    </div>
  );
  const showPick = (shows: Show[], cur: string | null, drawn?: Show[]) => (
    <>
      {drawn?.map((s) => <button key={s.id} className="c-ans dis" disabled style={{ padding: '7px 10px' }}><span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{s.name}</b><span className="c-eff">{w('Card set')}</span></span><span className="c-ad">{showLine(s)}</span></button>)}
      {shows.map((s) => (
        <button key={s.id} className={cur === s.id ? 'c-ans on' : 'c-ans'} onClick={() => setSel(s.id)} style={{ padding: '7px 10px' }}>
          <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{s.name}</b><span className={s.kind === 'special' || s.kind === 'flagship' ? 'c-eff gold' : 'c-eff'}>{w(s.kind === 'special' || s.kind === 'flagship' ? 'Big show' : 'Not drawn')}</span></span>
          <span className="c-ad">{showLine(s)}{s.kind === 'special' || s.kind === 'flagship' ? ` · ${s.kind}` : ''}</span>
        </button>
      ))}
    </>
  );

  if (route.req === 'title' && (route.indie || !promo)) {
    const titles = askableIndieTitles(c);
    const start = Math.max(0, titles.findIndex((t) => t.id === route.title));
    const t = titles[(i + start) % Math.max(1, titles.length)];
    const shows = askableIndieShows(c).slice(0, 60);
    const s = shows[j % Math.max(1, shows.length)];
    title = w('Title Shot');
    who = w(s ? `Asking ${s.name}’s promoter` : 'Asking an indie promoter');
    booker = s ? showBooker(s) : null;
    if (t) {
      const ts = c.titles[t.id];
      top = cyc(titles.length, <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{t.name}</b><span className="c-hint">{titles.length > 1 ? w('Tap ‹ › for the other title') : w('Your division’s title')}</span></div>);
      if (s) {
        pv = previewIndieTitle(c, t.id, s.id);
        ask = () => askIndieTitleShot(c, t.id, s.id);
      }
      nag = nagText('title', COOLDOWN_TITLE, 'for a title shot');
      notes = ['A yes puts you on that show for the title, at the usual indie fee and travel.'];
      const when = s ? <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{s.name} · {fmtDay(s.date, 'dm')}</b><span className="c-hint">{s.city}, {s.country} · {w('card not drawn yet')}</span></div> : <div className="c-fld mid"><span className="c-hint">No shows to ask about</span></div>;
      body = (
        <>
          <div className="c-ans" style={{ padding: '8px 10px' }}>
            <span className="c-rowsb"><span className="c-lab">{w('Champion')}</span><span className="c-hint">{ts ? `since ${fmtDay(ts.since, 'dm')} · ${ts.defences} ${ts.defences === 1 ? 'defence' : 'defences'}` : ''}</span></span>
            <span className="c-vs"><Holders t={t} /></span>
          </div>
          <span className="c-sec">{w('When')}</span>
          {shows.length > 0 ? (
            <div className="c-cyc" style={{ marginTop: 0 }}>
              <button className="c-stepb" onClick={() => setJ((j + shows.length - 1) % shows.length)} aria-label="Previous show">‹</button>
              {when}
              <button className="c-stepb" onClick={() => setJ((j + 1) % shows.length)} aria-label="Next show">›</button>
            </div>
          ) : when}
        </>
      );
    }
  } else if (route.req === 'title') {
    const titles = askableTitles(c);
    const start = Math.max(0, titles.findIndex((t) => t.id === route.title));
    const t = titles[(i + start) % Math.max(1, titles.length)];
    title = w('Title Shot'); who = w(`Asking ${promo}’s booker`);
    if (t) {
      const ts = c.titles[t.id];
      const last = ts?.last ?? ts?.since;
      top = cyc(titles.length, <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{t.name}</b><span className="c-hint">{titles.length > 1 ? w('Tap ‹ › for the other title') : w('Your division’s title')}</span></div>);
      pv = previewTitle(c, t.id);
      ask = () => askTitleShot(c, t.id);
      nag = nagText('title', COOLDOWN_TITLE, `${promo} for a title shot`);
      notes = [`A yes books you on the first show after the title’s ${titleMinGap(t.id)}-day gap and beyond the drawn week.`];
      body = (
        <div className="c-ans" style={{ padding: '8px 10px' }}>
          <span className="c-rowsb"><span className="c-lab">{w('Champion')}</span><span className="c-hint">{ts ? `since ${fmtDay(ts.since, 'dm')} · ${ts.defences} ${ts.defences === 1 ? 'defence' : 'defences'}` : ''}</span></span>
          <span className="c-vs"><Holders t={t} /></span>
          <span className="c-ad">{last ? (daysBetween(last, c.today) >= titleMinGap(t.id) ? `Last defended ${fmtDay(last, 'dm')}. Due now.` : `Last defended ${fmtDay(last, 'dm')}. Not due again until ${fmtDay(addDays(last, titleMinGap(t.id)), 'dm')}.`) : ''}</span>
        </div>
      );
    }
  }

  if (route.req === 'challenge') {
    title = w('A Challenge', 'Challenge');
    const indieOk = sideWork(c.people[c.player]).rule !== 'banned';
    const them = target ? findWrestler(target) : undefined;
    const outside = !!them && !!promo && !worksFor(them, promo);
    const useIndie = indie || outside || !promo;
    const shows = useIndie ? askableIndieShows(c).slice(0, 60) : askableShows(c);
    const s = shows[i % Math.max(1, shows.length)];
    who = useIndie ? w(s ? `Asking ${s.name}’s promoter` : 'Asking an indie promoter') : w(`Asking ${promo}’s booker`);
    booker = useIndie ? (s ? showBooker(s) : null) : promo;
    const when = s ? <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{s.name} · {fmtDay(s.date, 'dm')}</b><span className="c-hint">{s.city}, {s.country} · {w('card not drawn yet')}</span></div> : <div className="c-fld mid"><span className="c-hint">No shows to ask about</span></div>;
    if (them && s) {
      pv = useIndie ? previewIndieChallenge(c, them.id, s.id) : previewChallenge(c, them.id, s.id);
      ask = () => (useIndie ? askIndieChallenge(c, them.id, s.id) : askChallenge(c, them.id, s.id));
      nag = nagText('challenge', COOLDOWN_CHALLENGE, 'for a challenge');
    }
    body = (
      <>
        <span className="c-sec">{w('Where')}</span>
        <div className="c-steps cols2" style={{ marginTop: 0 }}>
          <button className={!useIndie ? 'c-st on' : 'c-st'} style={{ border: 0 }} disabled={!promo || outside} onClick={() => { setIndie(false); setI(0); }}>{w(promo ? `${promo} show` : 'Promotion show')}</button>
          <button className={useIndie ? 'c-st on' : 'c-st'} style={{ border: 0 }} disabled={!indieOk} onClick={() => { setIndie(true); setI(0); }}>{w('Indie show')}</button>
        </div>
        {!indieOk && <span className="c-hint">{w(`Indie show: your ${k?.promo} deal has no Indie Bookings.`)}</span>}
        {outside && <span className="c-hint">{w(`${them?.name} is with ${them?.promotion === 'TIS' ? 'the Indie Scene' : them?.promotion}: it has to be an indie show.`)}</span>}
        <span className="c-sec">{w('When')}</span>
        {shows.length > 0 ? cyc(shows.length, when) : when}
      </>
    );
    top = (
      <button className="c-ans on" style={{ marginTop: 8, padding: '8px 10px' }} onClick={() => setPicking(true)}>
        <span className="c-rowsb"><span className="c-lab">{w('Challenging')}</span><span className="c-hint">{w('Tap to change')}</span></span>
        {them ? <span className="c-vs"><Nm id={them.id} /></span> : <b className="c-at" style={{ fontSize: 16 }}>Pick someone</b>}
        {them && <span className="c-ad">{them.promotion === 'TIS' ? 'The Indie Scene' : them.promotion} · {fmtFans(fansIn(them, s?.region ?? 'northAmerica'))} fans in {REGION_LABEL[s?.region ?? 'northAmerica']}{TITLES.some((t) => t.holder === them.id) ? ' · champion' : ''}{c.feuds.some((f) => !f.done && (f.a === them.id || f.b === them.id)) ? ' · in a feud' : ''}</span>}
      </button>
    );
  }

  if (route.req === 'book') {
    title = w('Bookings'); who = w(`Asking ${promo}’s booker`);
    const drawn = promo ? Object.values(c.shows).filter((s) => !s.done && s.date > c.today && s.date < firstAskable(c) && (s.promos ?? [s.promo]).includes(promo) && s.promo !== 'TIS').sort((a, b) => (a.date < b.date ? -1 : 1)) : [];
    const shows = askableShows(c).slice(0, 24);
    const cur = sel ?? shows.find((s) => s.kind === 'special' || s.kind === 'flagship')?.id ?? shows[0]?.id ?? null;
    top = (
      <div className="c-steps cols2" style={{ marginTop: 8 }}>
        {['Be on a show', 'More matches'].map((t, n) => <button key={t} className={n === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(n)}>{w(t)}</button>)}
      </div>
    );
    if (tab === 0) {
      if (cur) { pv = previewShow(c, cur); ask = () => askShow(c, cur); }
      notes = ['Shows in the next seven days already have their cards, so they can’t be asked about.'];
      body = (<><span className="c-sec">{w('Pick a show')}</span>{showPick(shows, cur, drawn)}</>);
    } else {
      pv = previewMore(c);
      ask = () => askMore(c);
      nag = nagText('more', COOLDOWN_MORE, 'for more matches');
      notes = ['You can ask once a month. More dates means more fatigue.'];
    }
  }

  if (route.req === 'spot') {
    const shows = askableIndieShows(c).slice(0, 40);
    const cur = sel ?? shows[0]?.id ?? null;
    const s = cur ? c.shows[cur] : undefined;
    title = w('Indie Spot', 'Indie spot'); who = w(s ? `Asking ${s.name}’s promoter` : 'Asking an indie promoter'); booker = s ? showBooker(s) : null;
    if (cur) { pv = previewSpot(c, cur); ask = () => askSpot(c, cur); }
    body = (<><span className="c-sec">{w('Pick a show')}</span>{showPick(shows, cur)}</>);
  }

  if (route.req === 'approach') {
    const promos = otherPromotions(c);
    const start = Math.max(0, promos.indexOf(route.promo ?? ''));
    const pr = promos[(i + start) % promos.length]!;
    const st = standingWith(c, pr);
    const g = gradeOf(c, findWrestler(c.player)!, pr);
    const stepName = { pass: 'They’d pass', radar: 'On their radar', tryout: 'A tryout', offer: 'An offer' }[g.step];
    title = w('Approach'); who = w(`Asking ${pr}`); booker = pr;
    top = (
      <>
        <div className="c-steps cols2" style={{ marginTop: 8 }}>
          {['A contract', 'A tryout'].map((t, n) => <button key={t} className={n === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(n)}>{w(t)}</button>)}
        </div>
      </>
    );
    const head = <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{promoName(pr)}</b><span className="c-hint">{REGION_LABEL[st.region as keyof typeof REGION_LABEL]} · {st.roster} on the roster</span></div>;
    const p = patienceOf(c, pr);
    pv = {
      hard: p < PATIENCE_FLOOR ? `${pr} won’t hear it: patience too low.` : tab === 0 && c.offers.some((o) => o.promo === pr && o.status === 'open') ? `You’ve already got an offer from ${pr}.` : null,
      chance: 0, nag: 0,
      stand: [['Their grade of you', `${Math.round(g.grade)}`], ['Tryout bar', `${Math.round(g.q1)}`], ['Offer bar', `${Math.round(g.median)}`], ['Right now', stepName], ['Your deal', k ? `${k.promo} until ${fmtDay(k.end, 'dm')} ${k.end.slice(0, 4)}` : 'Free agent']],
      weigh: [
        { t: g.standouts.length ? `Standout: ${g.standouts.map((f) => FACTOR_NAME[f]).join(', ')}` : 'No standout', s: g.standouts.length ? 1 : 0 },
        { t: `Holding you back: ${g.weakest.slice(0, 2).map((f) => FACTOR_NAME[f]).join(', ')}`, s: -1 },
        { t: `Their patience ${Math.round(p)}`, s: p > PATIENCE_START ? 1 : p < PATIENCE_START ? -1 : 0 },
      ],
    };
    ask = () => (tab === 0 ? askApproach(c, pr) : askTryout(c, pr));
    nag = nagText(`promo:${pr}`, COOLDOWN_PROMOTION, pr);
    notes = [tab === 0 ? 'They grade you on twelve things against their own roster, weighted to their taste. Above their median: an offer. Above their bottom quarter: a tryout. Just under it: they watch your next few matches. A standout (their top 10% at something) lifts you a step.' : 'Above their offer bar they skip the tryout and make an offer. Signed, you can only take a tryout date your contract allows.', 'Requests › Other promotions › Scouting reports has the full picture.'];
    if (k) notes.push(`You’re signed to ${k.promo}. ${Math.round(caughtChance(c, pr) * 100)}% chance they hear about it. If they do, for 30 days: patience −20, fewer dates, and lower on the card.`);
    body = cyc(promos.length, head);
  }

  if (route.req === 'dayoff' && k) {
    title = w('Day Off', 'Day off'); who = w(`Asking ${k.promo}’s booker`);
    const tier = k.clauses[C.schedule] ?? 0;
    const shows = Object.values(c.shows).filter((s) => !s.done && s.date > c.today && s.date <= addDays(c.today, 35) && (s.promos ?? [s.promo]).includes(k.promo) && s.promo !== 'TIS').sort((a, b) => (a.date < b.date ? -1 : 1));
    const cur = sel ?? shows[0]?.id ?? null;
    const s = cur ? c.shows[cur] : undefined;
    const onIt = s?.card?.some((b) => b.a === c.player || b.b === c.player);
    pv = { hard: s && onIt && tier < 3 ? `You’re already on ${s.name}. Only Tier 3 lets you refuse a date.` : s && person(c, c.player).daysOff?.includes(s.date) ? 'You’ve already got that day off.' : null, chance: 0, nag: 0,
      stand: [['Your clause', `Schedule Flexibility T${tier}`]], weigh: [{ t: tier >= 2 ? 'Granted' : 'They may need you', s: tier >= 2 ? 1 : 0 }] };
    if (s) ask = () => askDayOff(c, s.date);
    body = (<><span className="c-sec">{w('Pick a date')}</span>{shows.map((x) => (
      <button key={x.id} className={cur === x.id ? 'c-ans on' : 'c-ans'} onClick={() => setSel(x.id)} style={{ padding: '7px 10px' }}>
        <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{x.name}</b><span className={x.card?.some((b) => b.a === c.player || b.b === c.player) ? 'c-eff gold' : 'c-eff'}>{w(x.card?.some((b) => b.a === c.player || b.b === c.player) ? 'You’re on it' : x.card ? 'Card set' : 'Not drawn')}</span></span>
        <span className="c-ad">{showLine(x)}</span>
      </button>
    ))}</>);
  }

  if (route.req === 'rival' && k) {
    title = w('A Rival Offer', 'Rival offer'); who = w(`Asking ${k.promo}`);
    const offers = c.offers.filter((o) => o.status === 'open' && o.promo !== k.promo);
    const cur = sel ?? offers[0]?.id ?? null;
    pv = { hard: null, chance: 0, nag: 0, stand: [['You’re on', `${money(k.fee)} a match`]], weigh: [{ t: 'Wage Matching T2', s: 1 }] };
    if (cur) ask = () => askRival(c, cur);
    body = (<><span className="c-sec">{w('Pick the offer')}</span>{offers.map((o) => (
      <button key={o.id} className={cur === o.id ? 'c-ans on' : 'c-ans'} onClick={() => setSel(o.id)} style={{ padding: '7px 10px' }}>
        <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{promoName(o.promo)}</b><span className="c-eff gold">{money(o.fee)}</span></span>
        <span className="c-ad">{o.months} months from {fmtDay(o.start, 'dm')}</span>
      </button>
    ))}</>);
  }

  const pickList = useMemo(() => {
    if (route.req !== 'challenge') return [];
    const them = indie || !promo ? WRESTLERS : rosterOf(promo);
    const needle = q.trim().toLowerCase();
    return them.filter((x) => x.id !== c.player && !c.people[x.id]?.retired && (!needle || x.name.toLowerCase().includes(needle)))
      .sort((a, b) => globalScore(b) - globalScore(a)).slice(0, 60);
  }, [route.req, indie, promo, q, c.player]);

  return (
    <Screen>
      <Head title={title} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <Booker c={c} who={who} keyName={booker} />
      {route.req === 'challenge' || route.req === 'book' || route.req === 'approach' ? top : null}
      {route.req === 'title' ? top : null}
      <div className="c-body">
        {body}
        {pv && <Weigh pv={pv} notes={notes} nag={nag} />}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" disabled={!ask || !!pv?.hard} onClick={() => ask && done(ask())}>{w('Ask', 'Ask ›')}</button></div>
      {picking && (
        <div className="c-ovl">
          <Head title={w('Who?')} meta={indie || !promo ? w('Anyone') : promo} onBack={() => setPicking(false)} />
          <input className="c-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names…" aria-label="Search wrestlers" style={{ marginTop: 10 }} />
          <div className="c-body">
            {pickList.map((x) => (
              <button key={x.id} className={target === x.id ? 'c-ans on' : 'c-ans'} onClick={() => { setTarget(x.id); setPicking(false); setI(0); if (promo && !worksFor(x, promo)) setIndie(true); }} style={{ padding: '7px 10px' }}>
                <span className="c-rowsb"><Nm id={x.id} /><span className="c-hint">{x.promotion === 'TIS' ? 'INDIE' : x.promotion}</span></span>
                <span className="c-ad">{x.gimmick} · {fmtFans(fansTotal(x))} fans</span>
              </button>
            ))}
          </div>
          <div className="c-nav"><button className="c-b2" onClick={() => setPicking(false)}>{w('‹ Back')}</button><button className="c-b1" onClick={() => setPicking(false)}>{w('Done')}</button></div>
        </div>
      )}
      {ans && <AnswerSheet c={c} a={ans} onClose={close} onNegotiate={onNegotiate} />}
    </Screen>
  );
}
