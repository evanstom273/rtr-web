import { isFinisherMove, isSignatureMove, type MatchEngine } from '../../engine';
import { buzz } from '../format';

interface Props {
  engine: MatchEngine;
  onMoves: () => void;
  onSetup: () => void;
}

/** Your turn: Moves (radial wheel), Setup, Pin, plus a shortcut for a ready signature/finisher. */
export function Dock({ engine, onMoves, onSetup }: Props) {
  const S = engine.state, v = S.view;
  const mine = S.pending.kind === 'awaitPlayer' && S.control === 'you';
  const ctrl = v.control;
  const chip = S.over ? 'Match over' : ctrl === 'you' ? 'Your control' : ctrl === 'them' ? `${S.them.w.name} in control` : 'Lock up';
  const odds = mine ? engine.pinOdds() : null;
  const specials = mine ? engine.playerMoves().filter((m) => isFinisherMove(S.you, m) || isSignatureMove(S.you, m)) : [];
  return (
    <div id="dock" className={mine ? 'live' : ''}>
      <div className="dock-head">
        <span className={`chip ${ctrl ?? ''}`}>{chip}</span>
      </div>
      {mine ? (
        <>
          {specials.length > 0 && (
            <div className="specials">
              {specials.map((m) => (
                <button key={m.id} className={`mv special${isFinisherMove(S.you, m) ? ' fin' : ''}`} onClick={() => { buzz([10, 20, 10]); engine.chooseMove(m.id); }}>
                  <span className="mn">{m.name}</span>
                  <span className="mi">{isFinisherMove(S.you, m) ? 'Finisher ready' : 'Signature ready'}</span>
                </button>
              ))}
            </div>
          )}
          <div className="actions">
            <button className="act moves" onClick={onMoves}>
              Moves
            </button>
            <button className="act setup" onClick={onSetup}>
              Setup
            </button>
            <button className="act pin" disabled={!engine.canPin()} onClick={() => { buzz(); engine.pin(); }}>
              Pin
              {odds !== null && <span className="pin-odds">{Math.round(odds)}%</span>}
            </button>
          </div>
        </>
      ) : (
        <p className="wait">
          {S.over ? '' : ctrl === 'them' ? `${S.them.w.name} is on the attack. Get ready to roll.` : ctrl === 'you' ? 'Going for it…' : 'Collar and elbow tie-up…'}
        </p>
      )}
    </div>
  );
}
