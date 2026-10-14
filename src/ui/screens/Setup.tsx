import { PROMOS, DREAM_MATCH } from '../../data/promotions';
import { ROSTER, wrestlerById } from '../../data/roster';
import type { Stakes } from '../../engine';
import type { Hit } from '../../storage/greatestHits';
import { classNames } from '../format';
import { GreatestHits } from '../GreatestHits';
import { Ropes } from '../Ropes';

export interface Picks {
  you: string;
  them: string;
  step: 'you' | 'them';
  stakes: Stakes;
}

interface Props {
  picks: Picks;
  hits: Hit[];
  onPicks: (p: Picks) => void;
  onBell: () => void;
}

export function Setup({ picks, hits, onPicks, onBell }: Props) {
  const { you: pickYou, them: pickThem, step, stakes } = picks;
  const y = wrestlerById(pickYou), t = wrestlerById(pickThem);
  const same = !!(y && t && y.promo === t.promo);
  const ev = same && y ? PROMOS[y.promo] : null;

  const choose = (id: string) => {
    if (step === 'you') {
      onPicks({ ...picks, them: id === pickThem ? pickYou : pickThem, you: id, step: 'them' });
    } else {
      onPicks({ ...picks, you: id === pickYou ? pickThem : pickYou, them: id });
    }
  };

  const randomOpponent = () => {
    const pool = ROSTER.filter((w) => w.id !== pickYou && w.id !== pickThem);
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (w) onPicks({ ...picks, them: w.id });
  };

  const eyebrow =
    y && t
      ? same && ev
        ? `${ev.event} · ${stakes === 'title' ? ev.title : 'Exhibition'}`
        : `Interpromotional dream match · ${stakes === 'title' ? DREAM_MATCH.title : 'Exhibition'}`
      : 'Pick two wrestlers';

  return (
    <section id="setup">
      <div className="wrap">
        <header className="mast">
          <p className="eyebrow">A wrestling game for people who rate matches</p>
          <h1>
            Match of <span>the Night</span>
          </h1>
          <p className="lede">
            Win the match and steal the show. Every bout gets rated out of five by a crowd that has seen everything and is not easily
            impressed.
          </p>
        </header>
        <Ropes />
        <div className="steps">
          <button className={`step you${step === 'you' ? ' on' : ''}`} onClick={() => onPicks({ ...picks, step: 'you' })}>
            1 · You <span>{y ? y.name : '—'}</span>
          </button>
          <button className={`step them${step === 'them' ? ' on' : ''}`} onClick={() => onPicks({ ...picks, step: 'them' })}>
            2 · Opponent <span>{t ? t.name : '—'}</span>
          </button>
        </div>
        <div className="roster">
          {ROSTER.map((w) => {
            const role = w.id === pickYou ? 'you' : w.id === pickThem ? 'them' : '';
            return (
              <button key={w.id} className={`rc ${role}`} aria-pressed={!!role} onClick={() => choose(w.id)}>
                {role && <span className={`badge ${role}`}>{role === 'you' ? 'YOU' : 'OPP'}</span>}
                <span className="rc-top">
                  <span className={`al ${w.align}`}>{w.align}</span>
                  <span className="rc-promo">
                    {w.promo} · {w.from}
                  </span>
                </span>
                <span className="rc-name">{w.name}</span>
                <span className="rc-nick">{w.nick}</span>
                <span className="rc-cls">{classNames(w.cls)}</span>
                <span className="rc-bio">{w.bio}</span>
                <span className="rc-fin">
                  <span>Finisher</span>
                  {w.fin.name}
                </span>
              </button>
            );
          })}
        </div>
        <div className="matchcard">
          <p className="eyebrow">{eyebrow}</p>
          <div className="mc-vs">
            <span className="you">{y ? y.name : 'You'}</span>
            <span className="vs">vs</span>
            <span className="them">{t ? t.name : 'Opponent'}</span>
          </div>
          <Ropes />
          <div className="mc-row">
            <div className="seg" role="group" aria-label="Stakes">
              <button className={stakes === 'exh' ? 'on' : ''} onClick={() => onPicks({ ...picks, stakes: 'exh' })}>
                Exhibition
              </button>
              <button className={stakes === 'title' ? 'on' : ''} onClick={() => onPicks({ ...picks, stakes: 'title' })}>
                Title match
              </button>
            </div>
            <button className="ghost" onClick={randomOpponent}>
              Random opponent
            </button>
            <button className="primary" disabled={!(y && t)} onClick={onBell}>
              Ring the bell
            </button>
          </div>
        </div>
        <details className="howto">
          <summary>How it plays</summary>
          <ul>
            <li>Every move runs a timing bar. Stop it in the gold to land your move. When they attack, stop it in the gold to reverse.</li>
            <li>
              Moves need the right positions. Corner moves need them in the corner, dives need you up top or them on the floor. Setup
              gets you there.
            </li>
            <li>
              Landed moves build momentum. At full momentum your signature unlocks, and landing it banks a finisher (up to three).
              Counter their finisher and you steal one.
            </li>
            <li>Pinned? Hold the button and let go inside the gold before three. Stuck in a hold? Mash.</li>
            <li>
              You're rated on the match, not just the win: a hot crowd, a heat segment and a comeback, limb work that pays off,
              near-falls, and a finish that feels earned. Spam the same move and the crowd will tell you.
            </li>
          </ul>
        </details>
        <div className="hits">
          <GreatestHits hits={hits} title="Your greatest hits" />
        </div>
      </div>
    </section>
  );
}
