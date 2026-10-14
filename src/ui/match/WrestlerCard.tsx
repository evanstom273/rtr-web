import { POS } from '../../data/labels';
import type { BodyPart, HP, SideView } from '../../engine';
import { classNames, hpColor } from '../format';

function Figure({ hp }: { hp: HP }) {
  const f = (p: BodyPart) => ({ fill: hpColor(hp[p]) });
  return (
    <svg className="fig" viewBox="0 0 40 72" aria-hidden="true">
      <circle cx="20" cy="9" r="7" style={f('head')} />
      <rect x="12" y="18" width="16" height="22" rx="4" style={f('body')} />
      <rect x="4" y="19" width="6.5" height="20" rx="3" style={f('arm')} />
      <rect x="29.5" y="19" width="6.5" height="20" rx="3" style={f('arm')} />
      <rect x="12.5" y="42" width="6.5" height="27" rx="3" style={f('leg')} />
      <rect x="21" y="42" width="6.5" height="27" rx="3" style={f('leg')} />
    </svg>
  );
}

export function WrestlerCard({ w, active }: { w: SideView; active: boolean }) {
  const r = Math.round;
  return (
    <div className={`card${active ? ' active' : ''}`} id={`card-${w.key}`}>
      <div className="cname">{w.name}</div>
      <div className="cmeta">
        <span>{classNames(w.cls)}</span>
        <span className={`al ${w.align}`}>{w.align}</span>
      </div>
      <div className="cbody">
        <Figure hp={w.hp} />
        <div className="cstats">
          <div className="bar">
            <span className="bl">STA</span>
            <span className="bt">
              <i className="sta" style={{ width: `${w.stamina}%` }} />
            </span>
          </div>
          <div className="bar">
            <span className="bl">MOM</span>
            <span className="bt">
              <i className={`mom${w.sigReady ? ' ready' : ''}`} style={{ width: `${w.momentum}%` }} />
            </span>
          </div>
          <div className="fin">
            <span className="bl">FIN</span>
            <span className="pips">
              {[0, 1, 2].map((i) => (
                <b key={i} className={i < w.finStock ? 'on' : ''} />
              ))}
            </span>
            <span className="sig" hidden={!w.sigReady}>
              SIG READY
            </span>
          </div>
          <div className="hpnums">
            H {r(w.hp.head)} · B {r(w.hp.body)} · A {r(w.hp.arm)} · L {r(w.hp.leg)}
          </div>
        </div>
      </div>
      <div className="cpos">{POS[w.pos]}</div>
    </div>
  );
}
