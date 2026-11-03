import type { Wrestler } from '../../data/rtr';
import { useSkin } from '../skin';
import { tape, type Tape as TapeModel } from '../model';
import { displayName } from '../format';

interface Props {
  you: Wrestler;
  them: Wrestler;
  /** The rules line from the builder: "Standard · Count-outs (10) · 20s · Auto event". */
  rules: string;
  onBack: () => void;
  onBell: () => void;
}

/** Tale of the tape: the two of them side by side before the bell. One model, three dresses. */
export function Tape({ you, them, rules, onBack, onBell }: Props) {
  const skin = useSkin();
  const t = tape(you, them);
  const Body = skin === 'paper' ? PaperTape : skin === 'broadcast' ? BroadcastTape : BuildingTape;
  return (
    <section id="tape" className={`tape t-${skin}`}>
      <div className="tape-in">
        <Body t={t} rules={rules} />
        <div className="tape-actions">
          <button className="ghost tape-back" onClick={onBack}>
            Back
          </button>
          <button className="primary tape-go" onClick={onBell} autoFocus>
            Ring the bell
          </button>
        </div>
      </div>
    </section>
  );
}

const w = (x: number) => `${Math.max(2, Math.min(100, x))}%`;

/** Mirrored bars: their number, their bar growing out from the middle, the label, ours. */
function Bars({ t, cls }: { t: TapeModel; cls: string }) {
  return (
    <div className={`tp-bars ${cls}`}>
      {t.stats.map((s) => (
        <div key={s.key} className="tp-bar">
          <b className={s.edge === 'a' ? 'win a' : ''}>{s.a}</b>
          <span className="tp-tr l">
            <i className={s.edge === 'a' ? 'a' : ''} style={{ width: w(s.a) }} />
          </span>
          <span className="tp-lab">{s.label}</span>
          <span className="tp-tr">
            <i className={s.edge === 'b' ? 'b' : ''} style={{ width: w(s.b) }} />
          </span>
          <b className={s.edge === 'b' ? 'win b' : ''}>{s.b}</b>
        </div>
      ))}
    </div>
  );
}

function Vitals({ t }: { t: TapeModel }) {
  return (
    <div className="tp-vitals">
      {t.vitals.map((v) => (
        <div key={v.label} className="tp-vital">
          <span>{v.a}</span>
          <span className="tp-lab">{v.label}</span>
          <span>{v.b}</span>
        </div>
      ))}
    </div>
  );
}

function BroadcastTape({ t, rules }: { t: TapeModel; rules: string }) {
  return (
    <>
      <div className="bt-title">Tale of the tape</div>
      <div className="bt-heads">
        <div className="bt-head a">
          <small>Blue · you</small>
          <b>{t.a.name}</b>
          <i>{t.a.gimmick}</i>
        </div>
        <div className="bt-head b">
          <small>Red · AI</small>
          <b>{t.b.name}</b>
          <i>{t.b.gimmick}</i>
        </div>
      </div>
      <Vitals t={t} />
      <Bars t={t} cls="bt-bars" />
      <div className="bt-keys">
        <span className="bt-keytab">Keys to the match</span>
        <p>{t.story.join(' ')}</p>
      </div>
      <p className="tp-rules">{rules}</p>
    </>
  );
}

function PaperTape({ t, rules }: { t: TapeModel; rules: string }) {
  return (
    <>
      <div className="pp-dateline">
        <span>Preview</span>
        <span>{rules}</span>
      </div>
      <h1 className="pt-mast">Tale of the Tape</h1>
      <div className="pt-names">
        <div>
          <b>{displayName(t.a)}</b>
          <i>{t.a.gimmick} · you</i>
        </div>
        <span>v.</span>
        <div>
          <b>{displayName(t.b)}</b>
          <i>{t.b.gimmick} · AI</i>
        </div>
      </div>
      <table className="pt-table">
        <tbody>
          {t.vitals.map((v) => (
            <tr key={v.label}>
              <td>{v.a}</td>
              <th scope="row">{v.label}</th>
              <td>{v.b}</td>
            </tr>
          ))}
          {t.stats.map((s) => (
            <tr key={s.key} className="pt-stat">
              <td className={s.edge === 'a' ? 'edge' : ''}>{s.a}</td>
              <th scope="row">{s.label}</th>
              <td className={s.edge === 'b' ? 'edge' : ''}>{s.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pt-note">Edge in red.</p>
      <div className="pt-story">
        <span className="pp-lab">How it goes</span>
        <p>{t.story.join(' ')}</p>
      </div>
    </>
  );
}

function BuildingTape({ t, rules }: { t: TapeModel; rules: string }) {
  return (
    <>
      <div className="bl-screen">
        <span className="bl-kick">Tale of the tape</span>
        <div className="bl-names">
          <b className="a">{t.a.name}</b>
          <span>vs</span>
          <b className="b">{t.b.name}</b>
        </div>
        <div className="bl-stats">
          {t.stats.map((s) => (
            <div key={s.key} className="bl-stat">
              <b className={s.edge === 'a' ? 'hi' : ''}>{s.a}</b>
              <span className="bl-leds l">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={i < Math.round(s.a / 10) ? (s.edge === 'a' ? 'on a' : 'on') : ''} />
                ))}
              </span>
              <span className="tp-lab">{s.label}</span>
              <span className="bl-leds">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className={i < Math.round(s.b / 10) ? (s.edge === 'b' ? 'on b' : 'on') : ''} />
                ))}
              </span>
              <b className={s.edge === 'b' ? 'hi' : ''}>{s.b}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="bl-plates">
        {([['a', t.a, 'Blue · you'], ['b', t.b, 'Red · AI']] as const).map(([k, x, lab]) => (
          <div key={k} className={`bl-plate ${k}`}>
            <small>{lab}</small>
            <b>
              {t.vitals[0]![k]} · {t.vitals[1]![k]} · {x.age}
            </b>
            <span>
              {x.country} · {x.promotion}
            </span>
            <span>{t.vitals[5]![k]}</span>
          </div>
        ))}
      </div>
      <div className="bl-desk">
        <span className="desk-lab">At the desk</span>
        {t.story.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <small className="tp-rules">{rules}</small>
      </div>
    </>
  );
}
