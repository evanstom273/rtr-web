import { useMemo, useState } from 'react';
import { fansTotal, fmtFans, globalScore, PROMOTIONS, TITLES, type Wrestler, WRESTLERS } from '../../data/rtr';
import { contractFee, CLAUSES } from '../../career';
import { NO_CLAUSES } from '../../career/clauses';
import { ATTR_KEYS, ATTR_SHORT, CLASS_NAME, divisionName } from '../../career/create';
import { fmtDay } from '../../career/dates';
import { activeWorld } from '../../world/world';
import { Head, Nm, Screen, useWords } from './parts';

/** Your own deal (Lyra's call): any promotion, fee, length and clauses; null for a free agent. */
export type StartDeal = { promo: string; fee: number; months: number; clauses: number[] } | null;

interface Props {
  hasCareer: boolean;
  /** Picking from a fresh world (the one shown), rather than carrying on in this one. */
  fresh: boolean;
  onBack: () => void;
  onPick: (id: string, deal?: StartDeal) => void;
  onCreate: () => void;
}

const ORDER = ['VWF', 'TCG', 'NWGP', 'ZWA', 'SLN', 'END', 'IVW', 'SSWC', 'UFC', 'AAWA', 'TIS'];
const overall = (w: Wrestler) => Math.round(ATTR_KEYS.reduce((t, k) => t + w.stats[k], 0) / 6);

/** New career: cycle through the promotions and pick anyone, or create your own. */
export function Start({ hasCareer, fresh, onBack, onPick, onCreate }: Props) {
  const { skin, w } = useWords();
  const [pi, setPi] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  // undefined: their contract as it is.
  const [deal, setDeal] = useState<StartDeal | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const promo = PROMOTIONS.find((p) => p.initials === ORDER[pi])!;
  const roster = useMemo(() => WRESTLERS.filter((x) => x.promotion === promo.initials)
    .sort((a, b) => Number(TITLES.some((t) => t.holder === b.id)) - Number(TITLES.some((t) => t.holder === a.id)) || globalScore(b) - globalScore(a)), [promo]);
  const picked = roster.find((x) => x.id === sel);
  const ranked = [...roster].sort((a, b) => overall(b) - overall(a));
  const move = (d: number) => { setPi((pi + d + ORDER.length) % ORDER.length); setSel(null); setDeal(undefined); };
  const tis = promo.initials === 'TIS';
  const day = activeWorld().day;
  const surname = picked ? picked.name.replace(/"[^"]*"\s*/g, '').split(' ').pop() : '';

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'A New Career' : 'NEW CAREER'} onBack={onBack} />
      <p className="c-note" style={{ margin: '8px 0 0' }}>
        Pick a wrestler from any promotion, or create your own.{' '}
        {fresh ? 'A fresh world, as it ships, starting today.' : day ? `This world, carrying on from ${fmtDay(day, 'long')}.` : ''}
        {hasCareer ? ' Starting replaces your current career.' : ''}
      </p>
      <div className="c-cyc" style={{ marginTop: 10 }}>
        <button className="c-stepb" onClick={() => move(-1)} aria-label="Previous promotion" style={{ minHeight: 52 }}>‹</button>
        <div className="c-fld mid" style={{ minHeight: 52 }}>
          <b className="c-big" style={{ fontSize: 20 }}>{tis ? w('The Indie Scene') : skin === 'paper' ? promo.name : promo.initials}</b>
          <span className="c-hint">{tis ? 'Free agents' : skin === 'paper' ? promo.initials : promo.name} · {roster.length} wrestlers</span>
        </div>
        <button className="c-stepb" onClick={() => move(1)} aria-label="Next promotion" style={{ minHeight: 52 }}>›</button>
      </div>
      <div className="c-body" style={{ marginTop: 8, gap: 4 }}>
        {roster.map((x) => {
          const best = Math.max(...ATTR_KEYS.map((k) => x.stats[k]));
          return (
            <button key={x.id} className={x.id === sel ? 'c-ans on' : 'c-ans'} onClick={() => { setSel(x.id); setDeal(undefined); }} style={{ padding: '7px 10px 8px' }}>
              <span className="c-rowsb"><Nm w={x} /><span className="c-hint">{fmtFans(fansTotal(x))} FANS</span></span>
              <span className="c-ad"><i>{x.gimmick}</i> · {divisionName(x)} · {x.classes.map((k) => CLASS_NAME[k]).join(' · ')} · {x.country}</span>
              <span className="c-mini">
                {ATTR_KEYS.map((k, i) => (
                  <span key={k}>
                    <span><span>{ATTR_SHORT[i]}</span><b className={x.stats[k] === best ? 'best' : ''}>{x.stats[k]}</b></span>
                    <i><b className={x.stats[k] === best ? 'best' : ''} style={{ width: `${x.stats[k]}%` }} /></i>
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="c-live" style={{ marginTop: 8 }}>
          <div className="c-facts" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <span className="c-fact"><span className="c-lab">{w('Starts')}</span><b>{deal === undefined ? (tis ? 'Free agent' : `Signed · ${promo.initials}`) : deal === null ? 'Free agent' : `${deal.promo} · £${deal.fee.toLocaleString('en-GB')}`}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Roster rank')}</span><b>#{ranked.indexOf(picked) + 1} of {roster.length}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Overall')}</span><b>{overall(picked)}</b></span>
          </div>
          <button className="c-b3" style={{ marginTop: 6 }} onClick={() => setEditing(true)}>
            {deal === undefined ? w('Set their contract ›') : w(`Your deal: ${deal === null ? 'free agent' : `${deal.promo}, ${deal.months} months, ${deal.clauses.filter(Boolean).length} clauses`} · edit ›`)}
          </button>
        </div>
      )}
      <div className="c-nav">
        <button className="c-b2" onClick={onCreate}>{skin === 'paper' ? 'Write your own' : 'CREATE YOUR OWN'}</button>
        <button className="c-b1" disabled={!picked} onClick={() => picked && onPick(picked.id, deal)}>
          {picked ? w(`Begin as ${surname}`, `Start as ${surname}`) : w('Choose someone', 'Pick someone')}
        </button>
      </div>
      {editing && picked && <DealEditor who={picked} initial={deal} onCancel={() => setEditing(false)} onDone={(d) => { setDeal(d); setEditing(false); }} />}
    </Screen>
  );
}

const LENGTHS = [6, 12, 18, 24, 36, 60];

/** Write their contract yourself: no negotiating, no booker, just the deal you want. */
function DealEditor({ who, initial, onCancel, onDone }: { who: Wrestler; initial: StartDeal | undefined; onCancel: () => void; onDone: (d: StartDeal | undefined) => void }) {
  const { skin, w } = useWords();
  const majors = ORDER.filter((x) => x !== 'TIS');
  const [promo, setPromo] = useState(initial === null ? 'TIS' : initial?.promo ?? (who.promotion === 'TIS' ? majors[0]! : who.promotion));
  const market = promo === 'TIS' ? 0 : contractFee(who, promo);
  const [fee, setFee] = useState(initial?.fee ?? market);
  const [months, setMonths] = useState(initial?.months ?? 12);
  const [clauses, setClauses] = useState<number[]>(initial?.clauses ?? NO_CLAUSES());
  const free = promo === 'TIS';
  const setTier = (i: number, t: number) => setClauses(clauses.map((x, k) => (k === i ? t : x)));
  return (
    <div className="c-ovl">
      <div className="c-top"><button className="c-back" onClick={onCancel} aria-label="Back">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'Their Contract' : 'CONTRACT'}</div><span className="c-meta">{who.name}</span></div>
      <div className="c-mast">Their Contract</div>
      <div className="c-body">
        <span className="c-note">No negotiating: the career starts on exactly this deal. Pick another promotion and they move there, and any belt from the one they leave is stripped.</span>
        <span className="c-sec">{w('Promotion')}</span>
        <div className="c-chips">
          {majors.map((x) => <button key={x} className={`c-chip${x === promo ? ' on' : ''}`} onClick={() => { setPromo(x); if (fee === market) setFee(contractFee(who, x)); }}>{x}</button>)}
          <button className={`c-chip${free ? ' on' : ''}`} onClick={() => setPromo('TIS')}>{w('Free agent')}</button>
        </div>
        {!free && (
          <>
            <span className="c-sec">{w('Fee a match')}</span>
            <div className="c-cyc">
              <button className="c-stepb" onClick={() => setFee(Math.max(0, fee - 250))} aria-label="£250 less">−</button>
              <input className="c-fld mid" type="number" inputMode="numeric" min={0} step={50} value={fee} onChange={(e) => setFee(Math.max(0, Math.round(Number(e.target.value) || 0)))} aria-label="Fee a match" style={{ textAlign: 'center', fontSize: 20 }} />
              <button className="c-stepb" onClick={() => setFee(fee + 250)} aria-label="£250 more">+</button>
            </div>
            <div className="c-chips">{[[1, 'Market'], [2, '×2'], [5, '×5'], [10, '×10']].map(([m, l]) => <button key={String(l)} className={`c-chip${fee === Math.round(market * Number(m)) ? ' on' : ''}`} onClick={() => setFee(Math.round(market * Number(m)))}>{w(`${l} · £${Math.round(market * Number(m)).toLocaleString('en-GB')}`)}</button>)}</div>
            <span className="c-sec">{w('Length')}</span>
            <div className="c-chips">{LENGTHS.map((m) => <button key={m} className={`c-chip${m === months ? ' on' : ''}`} onClick={() => setMonths(m)}>{m} {w('months')}</button>)}</div>
            <div className="c-rowsb"><span className="c-sec c-grow">{w('Clauses')}</span><button className="c-chip" onClick={() => setClauses(clauses.map(() => 3))}>{w('Max everything')}</button></div>
            {CLAUSES.map((cl, i) => (
              <div key={cl.id} className="c-dsec">
                <span className="c-lab">{cl.name}</span>
                <div className="c-chips">
                  {['None', ...cl.short].map((t, k) => <button key={t} className={`c-chip${clauses[i] === k ? ' on' : ''}`} onClick={() => setTier(i, k)}>{t}</button>)}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={() => onDone(undefined)}>{w('As it is')}</button>
        <button className="c-b1" onClick={() => onDone(free ? null : { promo, fee, months, clauses })}>{w('Use this deal')}</button>
      </div>
    </div>
  );
}
