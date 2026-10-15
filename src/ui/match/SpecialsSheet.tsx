import { useEffect, useState } from 'react';
import { setupTitle, type MatchEngine, type SideKey, type SpecialInfo } from '../../engine';
import { Name } from '../common/Name';
import { buzz } from '../format';

function Special({ engine, s, side, canUse, onUsed }: { engine: MatchEngine; s: SpecialInfo; side: SideKey; canUse: boolean; onUsed: () => void }) {
  const S = engine.state, me = S[side];
  const you = side === 'you';
  const status = s.usable ? 'Ready now' : s.ready ? (s.fits ? 'Ready — not from here' : 'Ready — get in position') : s.needs ?? '';
  return (
    <li className={`sp ${s.kind === 'FINISHER' ? 'sp-f' : 'sp-s'}${s.usable ? ' usable' : s.ready ? ' ready' : ''}`}>
      <div className="sp-head">
        <span className={s.kind === 'FINISHER' ? 'tagf' : 'tags'}>{s.kind === 'FINISHER' ? 'F' : 'SIG'}</span>
        <span className="sp-name">{s.move.name}</span>
        <span className={`sp-status${s.usable ? ' go' : s.ready ? ' ok' : ''}`}>{status}</span>
      </div>
      <div className="sp-req">
        <span className="sp-who">{you ? 'You' : me.w.name.split(' ').pop()}</span>
        <span>{s.userNeeds.join(' · ')}</span>
        <span className="sp-who">{you ? 'Them' : 'You'}</span>
        <span>{s.opponentNeeds.join(' · ')}</span>
      </div>
      <div className="sp-route">
        {s.blocked ? (
          <span className="none">{s.blocked}</span>
        ) : s.fits ? (
          <span className="fit">✓ Positions fit right now</span>
        ) : s.route && s.route.length ? (
          <span>
            {s.ready ? 'Get there:' : 'Route once it’s ready:'} {s.route.map((id) => setupTitle(me, id).toLowerCase()).join(' → ')}
          </span>
        ) : (
          <span className="none">{s.hint ?? 'No route within three setups from here'}</span>
        )}
      </div>
      {canUse && s.usable && (
        <button className="primary sp-go" onClick={() => { buzz([10, 20, 10]); onUsed(); engine.chooseMove(s.move.id); }}>
          Hit the {s.move.name}
        </button>
      )}
    </li>
  );
}

/** Both wrestlers' signatures and finishers: what they need and whether they're on. */
export function SpecialsSheet({ engine, initial, onClose }: { engine: MatchEngine; initial: SideKey; onClose: () => void }) {
  const [side, setSide] = useState<SideKey>(initial);
  const S = engine.state;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const list = engine.specials(side);
  const myTurn = S.pending.kind === 'awaitPlayer' && S.control === 'you';
  const sv = S.view.sides[side];
  return (
    <div className="wheel-ov" onClick={onClose}>
      <div className="movepanel specials-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mp-head">
          <span />
          <h3>Signatures &amp; Finishers</h3>
          <button className="ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="seg sp-tabs" role="tablist">
          {(['you', 'them'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={side === k} className={side === k ? 'on' : ''} onClick={() => setSide(k)}>
              <Name w={S[k].w} side={k} />
            </button>
          ))}
        </div>
        <div className="sp-meter">
          <span>
            Momentum <b>{Math.round(sv.momentum)}</b>/100{sv.signatureReady ? ' · signature banked' : ''}
          </span>
          <span>
            Finishers banked <b>{sv.finisherStock}</b>/3
          </span>
        </div>
        <ul className="sp-list">
          {list.map((s) => (
            <Special key={s.move.id} engine={engine} s={s} side={side} canUse={side === 'you' && myTurn} onUsed={onClose} />
          ))}
        </ul>
        <p className="sp-help">
          50 momentum banks a signature: it stays banked until it lands, even if momentum drops. 100 momentum banks a finisher (up to
          three), and reversing the opponent’s finisher banks one too. Neither costs momentum; to earn the same one again, momentum has
          to drop well back first.
        </p>
      </div>
    </div>
  );
}
