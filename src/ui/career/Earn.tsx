import { bookConvention, buyStock, classFee, conventionsAhead, conventionTake, dropGig, hustleBlocked, hustleOf, isCoaching, recentSessions, subsHeading, type Career } from '../../career';
import { findWrestler } from '../../data/rtr';
import { fmtDay } from '../../career/dates';
import { COACHING, CONTENT, MERCH_TABLE, OWN_SHOW, SPONSOR } from '../../career/tuning';
import { commit, money, useWords } from './parts';

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const DL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** My week › Earn: the merch table, coaching, conventions, subscribers, sponsors, a fundraiser, your own show. */
export function Earn({ c, say, onOwnShow }: { c: Career; say: (s: string) => void; onOwnShow: () => void }) {
  const { w } = useWords();
  const h = hustleOf(c);
  const me = findWrestler(c.player)!;
  const act = (f: () => string) => { const s = f(); commit(); if (s) say(s); };
  const slots = h.coaching?.slots ?? [];
  const toggle = (d: number, ph: 'am' | 'pm') => {
    const on = slots.some(([x, p]) => x === d && p === ph);
    const next = on ? slots.filter(([x, p]) => !(x === d && p === ph)) : [...slots, [d, ph] as [number, 'am' | 'pm']];
    if (!on && next.length > COACHING.maxSlots) return say(`${COACHING.maxSlots} classes a week at most.`);
    hustleOf(c).coaching = next.length ? { slots: next, since: h.coaching?.since ?? c.today } : null;
    commit();
    say(next.length ? `${next.length} class${next.length === 1 ? '' : 'es'} a week at ${money(classFee(c))}.` : 'No more classes.');
  };
  const coachNo = hustleBlocked(c, 'coaching'), conNo = hustleBlocked(c, 'convention'), ownNo = hustleBlocked(c, 'own');
  const target = subsHeading(c);
  const made = recentSessions(c);
  void me;
  return (
    <>
      <span className="c-sec">{w('Merch table')}</span>
      <div className="c-rowsb"><span className="c-val">{h.stock} shirts in stock · {h.sold} sold so far</span><span className="c-hint">{money(MERCH_TABLE.cost)} each, sell at {money(MERCH_TABLE.price)}</span></div>
      <div className="c-chips">{MERCH_TABLE.batches.map((n) => <button key={n} className="c-chip" onClick={() => act(() => buyStock(c, n))}>{w(`Buy ${n} · ${money(n * MERCH_TABLE.cost)}`)}</button>)}</div>
      <span className="c-note">Sold at every show you work: more where they know you, at bigger shows, and after a good match.</span>

      <span className="c-sec">{w('Coaching')} · {money(classFee(c))} {w('a class')}</span>
      {coachNo ? <span className="c-note">{coachNo}</span> : (
        <div className="c-coach">
          <span />{DL.map((d, i) => <span key={i} className="c-lab">{d}</span>)}
          {(['am', 'pm'] as const).map((ph) => (
            <span key={ph} style={{ display: 'contents' }}>
              <span className="c-lab">{ph.toUpperCase()}</span>
              {DAYS.map((d) => <button key={d} className={`c-chip${slots.some(([x, p]) => x === d && p === ph) ? ' on' : ''}`} onClick={() => toggle(d, ph)} aria-label={`Coach ${DL[DAYS.indexOf(d)]} ${ph}`}>{slots.some(([x, p]) => x === d && p === ph) ? '✓' : ''}</button>)}
            </span>
          ))}
        </div>
      )}
      <span className="c-note">Pick up to {COACHING.maxSlots} half-days. A class pays on your reputation and skill, and more the longer you teach ({h.taught ?? 0} taught so far); fine while injured.{isCoaching(c, c.today, c.phase ?? 'am') ? ' You’re coaching now.' : ''}</span>

      <span className="c-sec">{w('Conventions')}</span>
      {conNo ? <span className="c-note">{conNo}</span> : conventionsAhead(c).slice(0, 6).map((x) => {
        const t = conventionTake(c, x);
        const booked = !!h.gigs[x.id];
        return (
          <button key={x.id} className={`c-ans${booked ? ' on' : ''}`} style={{ padding: '7px 10px' }} onClick={() => act(() => (booked ? (dropGig(c, x.id), 'Cancelled.') : bookConvention(c, x.id)))}>
            <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{x.name}</b><span className={booked ? 'c-eff gold' : 'c-eff up'}>{booked ? w('Booked') : `~${money(t.pay - t.table - t.travel)}`}</span></span>
            <span className="c-ad">{fmtDay(x.day, 'long')} · about {t.photos} photos at {money(t.price)}{t.guarantee ? ` and a ${money(t.guarantee)} guarantee` : ` · table ${money(t.table)}`}{t.travel ? ` · travel ${money(t.travel)}` : ''} · the whole day · turnout varies</span>
          </button>
        );
      })}

      <span className="c-sec">{w('Subscribers')}</span>
      <div className="c-kv">
        <span className="c-lab">{w('Now')}</span><span className="c-val">{h.subs.toLocaleString('en-GB')} · about {money((h.subs * CONTENT.price * 7) / 30.4)} a week</span>
        <span className="c-lab">{w('Heading for')}</span><span className="c-val">{target.toLocaleString('en-GB')} · {made} content session{made === 1 ? '' : 's'} in {CONTENT.idleDays} days</span>
      </div>
      <span className="c-note">Put Content half-days in your week: each one (up to {CONTENT.maxSessions} a fortnight) raises where you’re heading. Posting and wrestling keep them coming too; stop and they drift off. Some weeks pay better than others. Stock also sells online.</span>

      <span className="c-sec">{w('Sponsors')}</span>
      {h.sponsors.length ? h.sponsors.map((s) => <div key={s.id} className="c-rowsb"><span className="c-val">{s.name}</span><span className="c-hint">{money(s.monthly)} a month to {fmtDay(s.until, 'dm')}</span></div>)
        : <span className="c-note">Offers come by letter once a region has {SPONSOR.minFans.toLocaleString('en-GB')} of your fans. Keep posting and they renew for more.</span>}
      {h.fund && <span className="c-val">Fundraiser running: {money(h.fund.raised)} so far.</span>}

      <span className="c-sec">{w('Your own show')}{h.hype ? ` · ${w('following')} ${Math.round((1 + h.hype) * 100)}%` : ''}</span>
      {h.own.filter((o) => !o.settled).map((o) => <span key={o.show} className="c-val">{c.shows[o.show]?.name} · {fmtDay(c.shows[o.show]?.date ?? c.today, 'dm')} · {c.shows[o.show]?.city}</span>)}
      {ownNo ? <span className="c-note">{ownNo}</span> : <button className="c-b3" onClick={onOwnShow}>{w('Put on a show ›')}</button>}
      <span className="c-note">Good shows build a following (up to {Math.round((1 + OWN_SHOW.hypeMax) * 100)}% of a first show’s crowd); empty seats and duds cost it.</span>
    </>
  );
}
