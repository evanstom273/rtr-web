import { useMemo, useState } from 'react';
import { PROMOTIONS, TITLES, WRESTLERS, type Wrestler } from '../../data/rtr';
import { ATTR_KEYS, ATTR_SHORT, CLASS_NAME } from '../../career/create';
import { Head, Nm, Screen, useWords } from './parts';

interface Props {
  hasCareer: boolean;
  onBack: () => void;
  onPick: (id: string) => void;
  onCreate: () => void;
}

const ORDER = ['VWF', 'TCG', 'NWGP', 'ZWA', 'SLN', 'END', 'IVW', 'SSWC', 'UFC', 'AAWA', 'TIS'];
const overall = (w: Wrestler) => Math.round(ATTR_KEYS.reduce((t, k) => t + w.stats[k], 0) / 6);

/** New career: cycle through the promotions and pick anyone, or create your own. */
export function Start({ hasCareer, onBack, onPick, onCreate }: Props) {
  const { skin, w } = useWords();
  const [pi, setPi] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const promo = PROMOTIONS.find((p) => p.initials === ORDER[pi])!;
  const roster = useMemo(() => WRESTLERS.filter((x) => x.promotion === promo.initials)
    .sort((a, b) => Number(TITLES.some((t) => t.holder === b.id)) - Number(TITLES.some((t) => t.holder === a.id)) || b.popularity.global - a.popularity.global), [promo]);
  const picked = roster.find((x) => x.id === sel);
  const ranked = [...roster].sort((a, b) => overall(b) - overall(a));
  const move = (d: number) => { setPi((pi + d + ORDER.length) % ORDER.length); setSel(null); };
  const tis = promo.initials === 'TIS';
  const surname = picked ? picked.name.replace(/"[^"]*"\s*/g, '').split(' ').pop() : '';

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'A New Career' : 'NEW CAREER'} onBack={onBack} />
      <p className="c-note" style={{ margin: '8px 0 0' }}>Pick a wrestler from any promotion, or create your own. Starting a new career replaces your current one.</p>
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
            <button key={x.id} className={x.id === sel ? 'c-ans on' : 'c-ans'} onClick={() => setSel(x.id)} style={{ padding: '7px 10px 8px' }}>
              <span className="c-rowsb"><Nm w={x} /><span className="c-hint">POP {Math.round(x.popularity.global)}</span></span>
              <span className="c-ad"><i>{x.gimmick}</i> · {x.classes.map((k) => CLASS_NAME[k]).join(' · ')} · {x.country}</span>
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
            <span className="c-fact"><span className="c-lab">{w('Starts')}</span><b>{tis ? 'Free agent' : `Signed · ${promo.initials}`}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Roster rank')}</span><b>#{ranked.indexOf(picked) + 1} of {roster.length}</b></span>
            <span className="c-fact"><span className="c-lab">{w('Overall')}</span><b>{overall(picked)}</b></span>
          </div>
        </div>
      )}
      <div className="c-nav">
        <button className="c-b2" onClick={onCreate}>{skin === 'paper' ? 'Write your own' : 'CREATE YOUR OWN'}</button>
        <button className="c-b1" disabled={!picked} onClick={() => (hasCareer ? setConfirm(true) : picked && onPick(picked.id))}>
          {picked ? w(`Begin as ${surname}`, `Start as ${surname}`) : w('Choose someone', 'Pick someone')}
        </button>
      </div>
      {confirm && picked && (
        <div className="c-sheet">
          <div>
            <div className="c-sh"><div><span>{w('New career')}</span><b>Start again?</b></div></div>
            <p className="c-note">This replaces your current career and puts the whole world back as it started: rosters, champions, everything.</p>
            <div className="c-nav"><button className="c-b2" onClick={() => setConfirm(false)}>{w('Keep my career')}</button><button className="c-b1" onClick={() => onPick(picked.id)}>{w('Start again')}</button></div>
          </div>
        </div>
      )}
    </Screen>
  );
}
