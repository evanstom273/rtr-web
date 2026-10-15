import { useMemo, useState } from 'react';
import { CLASS_LABEL } from '../../data/commentary';
import { PROMOTIONS, findWrestler, getMove, getPromotion, WRESTLERS, type Wrestler, type WrestlerClass } from '../../data/rtr';
import { titleNameFor } from '../../engine';
import type { Hit } from '../../storage/greatestHits';
import { Name } from '../common/Name';
import { classNames } from '../format';
import { GreatestHits } from '../GreatestHits';
import { Ropes } from '../Ropes';

export interface Picks {
  you: string;
  them: string;
  step: 'you' | 'them';
  title: boolean;
  actionClock: number;
  countOuts: boolean;
}

interface Props {
  picks: Picks;
  hits: Hit[];
  onPicks: (p: Picks) => void;
  onBell: () => void;
}

const PAGE = 36;
const STAT_KEYS = [['strength', 'STR'], ['speed', 'SPD'], ['stamina', 'STA'], ['skill', 'SKL'], ['striking', 'STK'], ['charisma', 'CHA']] as const;
const CLOCKS = [10, 15, 20, 25, 30];
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function RosterCard({ w, mark, onPick }: { w: Wrestler; mark: 'you' | 'them' | null; onPick: () => void }) {
  return (
    <button className={`rc${mark ? ' ' + mark : ''}`} onClick={onPick}>
      {mark && <span className={`badge ${mark}`}>{mark === 'you' ? 'YOU' : 'OPP'}</span>}
      <div className="rc-top">
        <span className="rc-promo">{w.promotion}</span>
        <span className="rc-promo">{w.division === 'WOMENS' ? "Women's" : "Men's"}</span>
      </div>
      <div className="rc-name">
        <Name w={w} />
      </div>
      <div className="rc-nick">{w.gimmick}</div>
      <div className="rc-cls">{classNames(w.classes)}</div>
      <div className="rc-stats">
        {STAT_KEYS.map(([k, l]) => (
          <span key={k} title={k}>
            <i style={{ height: `${w.stats[k]}%` }} />
            <b>{l}</b>
          </span>
        ))}
      </div>
      <div className="rc-fin">
        <span>Finishers</span>
        {w.finishers.map((id) => getMove(id).name).join(' · ')}
      </div>
    </button>
  );
}

export function Setup({ picks, hits, onPicks, onBell }: Props) {
  const { you: pickYou, them: pickThem, step } = picks;
  const y = findWrestler(pickYou), t = findWrestler(pickThem);
  const [q, setQ] = useState('');
  const [promo, setPromo] = useState('');
  const [div, setDiv] = useState('');
  const [disp, setDisp] = useState('');
  const [cls, setCls] = useState<WrestlerClass | ''>('');
  const [shown, setShown] = useState(PAGE);

  const list = useMemo(() => {
    const needle = fold(q.trim());
    return WRESTLERS.filter((w) =>
      (!needle || fold(`${w.name} ${w.gimmick} ${w.country}`).includes(needle))
      && (!promo || w.promotion === promo)
      && (!div || w.division === div)
      && (!disp || w.disposition === disp)
      && (!cls || w.classes.includes(cls)),
    ).sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
  }, [q, promo, div, disp, cls]);

  const choose = (id: string) => {
    if (step === 'you') onPicks({ ...picks, them: id === pickThem ? pickYou : pickThem, you: id, step: 'them' });
    else onPicks({ ...picks, you: id === pickYou ? pickThem : pickYou, them: id });
  };
  const random = () => {
    const pool = list.filter((w) => w.id !== pickYou && w.id !== pickThem);
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (w) choose(w.id);
  };

  const same = !!(y && t && y.promotion === t.promotion);
  const host = same && y ? getPromotion(y.promotion)?.name : 'The Indie Scene: Dream Match';
  const titleName = y && t ? titleNameFor(y, t) : '';
  const reset = (f: () => void) => {
    f();
    setShown(PAGE);
  };

  return (
    <section id="setup">
      <div className="wrap">
        <header className="mast">
          <p className="eyebrow">Exhibition · {WRESTLERS.length} wrestlers · {PROMOTIONS.length} promotions</p>
          <h1>
            Rise to <span>Relevance</span>
          </h1>
          <p className="lede">Pick your wrestler, pick a fight. Every match gets rated out of five by a crowd that has seen everything.</p>
        </header>
        <Ropes />
        <div className="matchcard">
          <p className="eyebrow">
            {host} · {picks.title && titleName ? titleName : 'Exhibition'}
          </p>
          <div className="mc-vs">
            {y ? <Name w={y} side="you" /> : <span>—</span>}
            <span className="vs">vs</span>
            {t ? <Name w={t} side="them" /> : <span>—</span>}
          </div>
          <div className="mc-row">
            <div className="seg" role="radiogroup" aria-label="Stakes">
              <button className={!picks.title ? 'on' : ''} onClick={() => onPicks({ ...picks, title: false })}>
                Exhibition
              </button>
              <button className={picks.title ? 'on' : ''} onClick={() => onPicks({ ...picks, title: true })}>
                Title match
              </button>
            </div>
            <div className="seg" role="radiogroup" aria-label="Seconds per action">
              {CLOCKS.map((c) => (
                <button key={c} className={picks.actionClock === c ? 'on' : ''} onClick={() => onPicks({ ...picks, actionClock: c })}>
                  {c}s
                </button>
              ))}
            </div>
            <label className="tog">
              <input type="checkbox" checked={picks.countOuts} onChange={(e) => onPicks({ ...picks, countOuts: e.target.checked })} />
              Count-outs
            </label>
            <button className="primary" disabled={!y || !t || y.id === t.id} onClick={onBell}>
              Ring the bell
            </button>
          </div>
          <details className="howto">
            <summary>How it works</summary>
            <ul>
              <li>Every wrestler has a position, orientation, area and motion. Moves only work from the right ones — use Setup to get there.</li>
              <li>Moves come off the radial wheel, grouped by type. Pick a body part to focus and work it over: six parts, each wears down.</li>
              <li>Every move and contested setup is a contested roll: both of you roll a d20 and add your modifiers — the right attribute for the move, momentum, exhaustion, body-part damage, position. Highest wins, the attacker wins ties. A natural 20 is a critical (or a reversal on defence); a natural 1 is a botch.</li>
              <li>Advantage (roll two, keep the best) comes from setting someone up, catching them off the ropes or staggering. Repeat the same move and they'll see it coming. Spend 20 momentum to push for advantage when it matters.</li>
              <li>Fill momentum to ready your signature. Land a signature to bank a finisher (up to three).</li>
              <li>Land a hold and choose: go for the tap (win it, or they escape and take over) or work the hold for guaranteed limb damage and keep control. Technicians are best at it.</li>
              <li>Land a pin combo and hit the cover ring to hook the leg. Pinned? Hold, then let go in the gold before three. In a hold? Mash — eight taps a second is the cap.</li>
              <li>Kickouts come from condition: a fresh wrestler kicks out of nearly anything; wear them down first.</li>
              <li>Your first full momentum bar earns a one-use Resiliency: burn it to survive a three or a tap.</li>
            </ul>
          </details>
        </div>
        <div className="steps">
          <button className={`step you${step === 'you' ? ' on' : ''}`} onClick={() => onPicks({ ...picks, step: 'you' })}>
            You <span>{y ? y.name : '—'}</span>
          </button>
          <button className={`step them${step === 'them' ? ' on' : ''}`} onClick={() => onPicks({ ...picks, step: 'them' })}>
            Opponent <span>{t ? t.name : '—'}</span>
          </button>
        </div>
        <div className="filters">
          <input type="search" placeholder="Search name, gimmick, country…" value={q} onChange={(e) => reset(() => setQ(e.target.value))} aria-label="Search wrestlers" />
          <select value={promo} onChange={(e) => reset(() => setPromo(e.target.value))} aria-label="Promotion">
            <option value="">All promotions</option>
            {PROMOTIONS.map((p) => (
              <option key={p.initials} value={p.initials}>
                {p.initials} · {p.name}
              </option>
            ))}
          </select>
          <select value={div} onChange={(e) => reset(() => setDiv(e.target.value))} aria-label="Division">
            <option value="">All divisions</option>
            <option value="MENS">Men's</option>
            <option value="WOMENS">Women's</option>
          </select>
          <select value={disp} onChange={(e) => reset(() => setDisp(e.target.value))} aria-label="Disposition">
            <option value="">Faces &amp; heels</option>
            <option value="FACE">Faces</option>
            <option value="HEEL">Heels</option>
          </select>
          <select value={cls} onChange={(e) => reset(() => setCls(e.target.value as WrestlerClass | ''))} aria-label="Class">
            <option value="">All classes</option>
            {Object.entries(CLASS_LABEL).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={random}>
            Random {step === 'you' ? 'you' : 'opponent'}
          </button>
        </div>
        <p className="count">
          {list.length} {list.length === 1 ? 'wrestler' : 'wrestlers'} · picking {step === 'you' ? 'you' : 'your opponent'}
        </p>
        <div className="roster">
          {list.slice(0, shown).map((w) => (
            <RosterCard key={w.id} w={w} mark={w.id === pickYou ? 'you' : w.id === pickThem ? 'them' : null} onPick={() => choose(w.id)} />
          ))}
        </div>
        {shown < list.length && (
          <button className="ghost more" onClick={() => setShown((n) => n + PAGE * 2)}>
            Show more ({list.length - shown} left)
          </button>
        )}
        <div className="hits">
          <GreatestHits hits={hits} title="Greatest hits" />
        </div>
        <div className="bellbar">
          <span className="bb-names">
            {y ? <Name w={y} side="you" /> : '—'} <span className="vs">vs</span> {t ? <Name w={t} side="them" /> : <span className="mute">pick an opponent</span>}
          </span>
          <button className="primary" disabled={!y || !t || y.id === t.id} onClick={onBell}>
            Bell
          </button>
        </div>
      </div>
    </section>
  );
}
