import { FEATURES } from '../../career/tuning';
import { useLayoutEffect, useRef } from 'react';
import { TraitChips } from './Traits';
import { fansIn, fansTotal, findWrestler, fmtFans, getMove, titlesHeldBy } from '../../data/rtr';
import { C, CLAUSES, myBoutToday, person, promoName, type Career } from '../../career';
import { ATTR_KEYS, ATTR_LONG, CLASS_NAME, divisionName } from '../../career/create';
import { daysBetween, fmtDay } from '../../career/dates';
import { REGION_LABEL } from '../../career/places';
import type { PopRegion } from '../../career/types';
import { Head, money, Nm, Screen, useWords } from './parts';

export type ProfileLink = 'contract' | 'history' | 'finances' | 'stats' | 'reputation' | 'relationships' | 'achievements' | 'week' | 'social';
interface Props { c: Career; onBack: () => void; onOpen: (s: ProfileLink) => void; onShowDay: () => void; onHub: () => void }

const REGIONS: PopRegion[] = ['northAmerica', 'southAmerica', 'europe', 'asia', 'africa', 'oceania'];
const SHORT: Record<PopRegion, string> = { northAmerica: 'N AMER', southAmerica: 'S AMER', europe: 'EUROPE', asia: 'ASIA', africa: 'AFRICA', oceania: 'OCEANIA' };

/** Career → you: who you are, where you stand, your deal, and the way into everything else. */
export function Profile({ c, onBack, onOpen, onShowDay, onHub }: Props) {
  const { skin, w } = useWords();
  const me = findWrestler(c.player)!;
  const p = person(c, c.player);
  const k = p.contract;
  const tonight = myBoutToday(c);
  const opp = tonight ? findWrestler(tonight.bout.a === c.player ? tonight.bout.b : tonight.bout.a) : undefined;
  const titles = titlesHeldBy(me);
  const wins = c.history.filter((m) => m.result === 'win').length, losses = c.history.filter((m) => m.result === 'loss').length;
  const vals = ATTR_KEYS.map((key) => me.stats[key]);
  const best = Math.max(...vals);
  // Fans: where they are, as people (the bar is each region against your biggest).
  const most = Math.max(1, ...REGIONS.map((r) => fansIn(me, r)));
  const pops = REGIONS.map((r) => [SHORT[r], fansIn(me, r)] as const);
  const health = p.injury ? `Injured to ${fmtDay(p.injury.until, 'dm')}` : p.fatigue >= 60 ? 'Tired' : p.fatigue >= 30 ? 'Worn' : 'Healthy';
  const ini = me.name.replace(/"[^"]*"\s*/g, '').split(' ').map((s) => s[0]).join('').slice(0, 2);
  const clauseList = k ? k.clauses.map((t, i) => (t ? `${CLAUSES[i]!.name} T${t}` : '')).filter(Boolean) : [];
  const recentRef = useWholeRows();

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'The Profile' : 'CAREER'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-who">
        <div className="c-ini">{ini}</div>
        <div className="c-whot">
          <span className="c-tag">{me.disposition} · {divisionName(me)} · {me.classes.map((x) => CLASS_NAME[x]).join(' · ')}</span>
          <Nm w={me} cls="c-nm" />
          <span className="c-sub"><i>{me.gimmick}</i> · {me.age} · {me.height.replace("'", '′ ')}{me.height.includes('"') ? '' : '″'} · {me.weight} lb · {me.country}</span>
          <span className="c-status">{w(health)} · {wins}–{losses} · {titles.length ? titles.map((t) => t.name).join(', ') : w('No titles')} · {w(`Rep ${Math.round(p.rep)}`)}</span>
          <TraitChips traits={me.traits} />
        </div>
      </div>
      <div className="c-pfill">
        {tonight && (
          <button className="c-ans on" style={{ marginTop: 8 }} onClick={onShowDay}>
            <span className="c-rowsb"><span className="c-lab">{w('Tonight')}</span><span className="c-hint">{tonight.show.name} · {tonight.show.city}</span></span>
            <span className="c-vs">vs <Nm w={opp} /></span>
          </button>
        )}
        <div className="c-start" style={{ marginTop: 8 }}>
          <div className="c-rowsb"><span className="c-lab">{w(k ? 'Contract' : 'No contract')}</span><span className="c-hint">{k ? `${Math.max(0, Math.round(daysBetween(c.today, k.end) / 30.4))} months left` : 'Free agent'}</span></div>
          <b className="c-sbig">{k ? promoName(k.promo) : 'The Indie Scene'}</b>
          <span className="c-val">
            {k ? `${fmtDay(k.start, 'dm')} ${k.start.slice(0, 4)} → ${fmtDay(k.end, 'dm')} ${k.end.slice(0, 4)} · ${money(k.fee)} a match` : 'Indie bookings by letter, or ask for a spot on any indie show.'}
            {p.next ? ` · Next: ${p.next.promo} from ${fmtDay(p.next.start, 'dm')}` : ''}
          </span>
          {k && <div className="c-effs">{clauseList.length ? clauseList.slice(0, 6).map((t) => <span key={t} className="c-eff up">{t}</span>) : <span className="c-eff">No clauses</span>}{clauseList.length > 6 && <span className="c-eff">+{clauseList.length - 6} more</span>}{(p.deals ?? []).map((d) => <span key={d.promo} className="c-eff gold">Also {d.promo}</span>)}{(k.clauses[C.merch] ?? 0) === 0 && <span className="c-eff">No merch share</span>}</div>}
        </div>
        <div className="c-two2" style={{ marginTop: 10 }}>
          <div className="c-bars">
            <span className="c-sec" style={{ marginTop: 0 }}>{w('Attributes')}</span>
            {ATTR_KEYS.map((key, i) => <div key={key} className="c-barrow"><span className="c-lab">{ATTR_LONG[i]!.slice(0, 8)}</span><i><b className={vals[i] === best ? 'best' : ''} style={{ width: `${vals[i]}%` }} /></i><b>{vals[i]}</b></div>)}
          </div>
          <div className="c-bars">
            <span className="c-sec" style={{ marginTop: 0 }}>{w('Fans')} · {fmtFans(fansTotal(me))}</span>
            {pops.map(([l, v]) => <div key={l} className="c-barrow fans"><span className="c-lab">{l}</span><i><b className={v === most ? 'best' : ''} style={{ width: `${Math.max(2, (v / most) * 100)}%` }} /></i><b>{fmtFans(v)}</b></div>)}
          </div>
        </div>
        <span className="c-sec">{w('Signatures & finishers')}</span>
        <div className="c-wrap">
          {me.signatures.map((id) => <span key={id} className="c-mv msig">{getMove(id).name}</span>)}
          {me.finishers.map((id) => <span key={id} className="c-mv mfin">{getMove(id).name}</span>)}
        </div>
        {c.history.length > 0 && (
          <div className="c-recent" ref={recentRef}>
            <span className="c-sec">{w('Last time out', 'Recent results')}</span>
            {c.history.slice(0, 6).map((m, i) => (
              <div key={i} className="c-led" style={{ gridTemplateColumns: '54px minmax(0, 1fr) auto', padding: '3px 0' }}>
                <span className="c-hint">{fmtDay(m.day, 'dm')}</span>
                <span className="c-val">{m.result === 'win' ? 'Beat' : m.result === 'loss' ? 'Lost to' : 'Drew with'} {m.oppName} <span className="c-hint">· {m.showName}</span></span>
                <b className="c-num">{m.stars}★</b>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`c-pgrid${FEATURES.days || FEATURES.social ? ' four' : ''}`}>
        {FEATURES.days && <button onClick={() => onOpen('week')}>{w('My week')}</button>}
        {FEATURES.social && <button onClick={() => onOpen('social')}>{w('Social')}</button>}
        <button onClick={() => onOpen('contract')}>{w('Contract')}</button>
        <button onClick={() => onOpen('history')}>{w('Career history', 'History')}</button>
        <button onClick={() => onOpen('finances')}>{w('Finances')}</button>
        <button onClick={() => onOpen('stats')}>{w('Statistics')}</button>
        <button onClick={() => onOpen('relationships')}>{w(FEATURES.days || FEATURES.social ? 'Relations' : 'Relationships')}</button>
        <button onClick={onHub}>{w('The hub', 'Hub')}</button>
      </div>
      <span className="c-hint" style={{ marginTop: 6, textAlign: 'center' }}>{money(c.money)} {w('in the bank')} · {REGION_LABEL[REGIONS.reduce((a, b) => (fansIn(me, b) > fansIn(me, a) ? b : a))]} {w('is your strongest region')}</span>
    </Screen>
  );
}

/**
 * The Career screen never scrolls and its buttons never move, so recent results take what's left:
 * the bars give up a little height to make room for one row, then as many whole rows as fit are
 * shown. When not even one fits, the block goes and the bars spread into the space instead.
 */
function useWholeRows() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    const fit = () => {
      const [head, ...rows] = [...el.children] as HTMLElement[];
      if (!head || !rows.length) return;
      box.classList.remove('c-norecent');
      for (const r of [head, ...rows]) r.style.display = '';
      const need = `${Math.ceil(rows[0]!.getBoundingClientRect().bottom - el.getBoundingClientRect().top)}px`;
      if (el.style.flexBasis !== need) el.style.flexBasis = need;
      const bottom = el.getBoundingClientRect().bottom + 0.5;
      const keep = rows.map((r) => r.getBoundingClientRect().bottom <= bottom);
      rows.forEach((r, i) => (r.style.display = keep[i] ? '' : 'none'));
      box.classList.toggle('c-norecent', !keep[0]);
    };
    fit();
    const watch = new ResizeObserver(fit);
    for (const k of [box, ...box.children]) if (k !== el) watch.observe(k);
    void document.fonts?.ready.then(fit);
    return () => watch.disconnect();
  });
  return ref;
}
