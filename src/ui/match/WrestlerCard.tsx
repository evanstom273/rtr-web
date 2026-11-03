import { useEffect, useRef, useState } from 'react';
import { AREA_LABEL, MOTION_LABEL, ORIENTATION_LABEL, PART_LABEL, POSITION_LABEL } from '../../data/commentary';
import type { Wrestler } from '../../data/rtr';
import { BLEED_WORDS, MAX_FINISHER_STOCK, SIGNATURE_MOMENTUM, WARNING_LIMIT, type BodyPart, type Part, type SideView } from '../../engine';
import { Mannequin } from '../common/Mannequin';
import { Name } from '../common/Name';
import { classNames } from '../format';

interface Props {
  w: Wrestler;
  v: SideView;
  active: boolean;
  /** Player's focus on this wrestler (opponent card only). */
  focus?: Part;
  onPick?: (p: BodyPart) => void;
  /** Open the signatures & finishers sheet for this wrestler. */
  onSpecials?: () => void;
}

export function WrestlerCard({ w, v, active, focus, onPick, onSpecials }: Props) {
  const r = Math.round;
  const st = v.state;
  const staPct = v.maxStamina ? (v.stamina / v.maxStamina) * 100 : 0;
  const hit = useHit(v);
  const ghost = useGhost(staPct);
  return (
    <div className={`card ${v.key}${active ? ' active' : ''}${hit ? ` hit${hit.dmg >= 10 ? ' hit-big' : ''} h${hit.n % 2}` : ''}`} id={`card-${v.key}`}>
      {hit && (
        <span className={`dmg-pop${hit.dmg >= 10 ? ' big' : ''}`} key={hit.n} aria-hidden>
          −{hit.dmg}
          {hit.part && <small>{hit.part}</small>}
        </span>
      )}
      <div className="cname">
        <Name w={w} side={v.key} />
      </div>
      <div className="cmeta">
        <span>{classNames(w.classes)}</span>
        <span className={`band b-${v.exhaustion.toLowerCase()}`}>{v.exhaustion}</span>
        {v.resiliencyAvailable && <span className="resil" title="One-use Resiliency: survive a three or a tap">RES</span>}
        {v.held && <span className="held" title="Holding">{v.held}</span>}
        {v.bleeding > 0 && <span className={`bleed b${v.bleeding}`} title="Bleeding: tires them out and weakens their defence">{BLEED_WORDS[v.bleeding]} cut</span>}
        {v.warnings > 0 && <span className="warn-pts" title="Referee warnings: four is a disqualification">{v.warnings}/{WARNING_LIMIT} warned</span>}
      </div>
      <div className="cbody">
        <Mannequin hp={v.hp} focus={focus} onPick={onPick} className="fig" />
        <div className="cstats">
          <div className="bar">
            <span className="bl">STA</span>
            <span className="bt">
              <i className="ghost" style={{ width: `${Math.max(ghost, staPct)}%` }} />
              <i className="sta" style={{ width: `${staPct}%` }} />
            </span>
            <span className="bv">
              {r(v.stamina)}/{v.maxStamina}
            </span>
          </div>
          <div className="bar">
            <span className="bl">FAT</span>
            <span className="bt">
              <i className="fat" style={{ width: `${v.fatigue}%` }} />
            </span>
            <span className="bv">{r(v.fatigue)}</span>
          </div>
          <div className="bar">
            <span className="bl">MOM</span>
            <span className="bt">
              <i className={`mom${v.signatureReady ? ' ready' : ''}`} style={{ width: `${v.momentum}%` }} />
              <i className="tick" style={{ left: `${SIGNATURE_MOMENTUM}%` }} aria-hidden />
            </span>
            <span className="bv">{r(v.momentum)}</span>
          </div>
          <button className="fin" onClick={onSpecials} aria-label={`${w.name}'s signatures and finishers`}>
            <span className="bl">FIN</span>
            <span className="pips">
              {Array.from({ length: MAX_FINISHER_STOCK }, (_, i) => (
                <b key={i} className={i < v.finisherStock ? 'on' : ''} />
              ))}
            </span>
            {v.signatureReady ? <span className="sig">SIG READY</span> : <span className="sig more">Specials ›</span>}
          </button>
        </div>
      </div>
      <div className="cpos">
        <span>{POSITION_LABEL[st.position]}</span>
        {st.orientation !== 'NONE' && <span>{ORIENTATION_LABEL[st.orientation]}</span>}
        <span>{AREA_LABEL[st.area]}</span>
        {st.motion !== 'STATIONARY' && <span className="mo">{MOTION_LABEL[st.motion]}</span>}
      </div>
    </div>
  );
}

/** A hit: how much it took off, and where most of it went. Clears itself after a beat. */
function useHit(v: SideView): { n: number; dmg: number; part: string } | null {
  const prev = useRef({ ...v.hp });
  const n = useRef(0);
  const [hit, setHit] = useState<{ n: number; dmg: number; part: string } | null>(null);
  const total = Object.values(v.hp).reduce((a, b) => a + b, 0);
  useEffect(() => {
    const before = prev.current;
    prev.current = { ...v.hp };
    let dmg = 0, worst: BodyPart | null = null, most = 0;
    for (const p of Object.keys(v.hp) as BodyPart[]) {
      const d = (before[p] ?? 0) - v.hp[p];
      if (d > 0) dmg += d;
      if (d > most) {
        most = d;
        worst = p;
      }
    }
    if (dmg < 1) return;
    n.current++;
    setHit({ n: n.current, dmg: Math.round(dmg), part: worst ? PART_LABEL[worst] : '' });
    const id = window.setTimeout(() => setHit(null), 1100);
    return () => window.clearTimeout(id);
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps
  return hit;
}

/** The stamina you just lost hangs on in red for a moment, then drains away (fighting-game style). */
function useGhost(pct: number): number {
  const [ghost, setGhost] = useState(pct);
  useEffect(() => {
    if (pct >= ghost) {
      setGhost(pct);
      return;
    }
    const id = window.setTimeout(() => setGhost(pct), 500);
    return () => window.clearTimeout(id);
  }, [pct]); // eslint-disable-line react-hooks/exhaustive-deps
  return ghost;
}
