import { isFinisherMove, isSignatureMove, type MatchEngine } from '../../engine';
import type { ReactNode } from 'react';
import { buzz } from '../format';

interface Props {
  engine: MatchEngine;
  onMoves: () => void;
  onSetup: () => void;
  /** More than two people: who to go after, and the match's own actions (tags, over the top, the stipulation's). */
  extra?: ReactNode;
}

/** Your turn: Moves (radial wheel), Setup, Pin, plus a shortcut for a ready signature/finisher. */
export function Dock({ engine, onMoves, onSetup, extra }: Props) {
  const S = engine.state, v = S.view;
  const pk = engine.pk, me = engine.me;
  const mine = S.pending.kind === 'awaitPlayer' && S.control === pk;
  const ctrl = v.control;
  const other = ctrl && ctrl !== 'neutral' && ctrl !== pk ? S.sides[ctrl] : undefined;
  const chip = S.over ? 'Match over' : ctrl === pk ? 'Your control' : other ? `${other.w.name} in control` : 'Lock up';
  const odds = mine ? engine.pinOdds() : null;
  const specials = mine ? engine.playerMoves().filter((m) => isFinisherMove(me, m) || isSignatureMove(me, m)) : [];
  return (
    <div id="dock" className={mine ? 'live' : ''}>
      <div className="dock-head">
        <span className={`chip ${ctrl === pk ? 'you' : other ? 'them' : ctrl ?? ''}`}>{chip}</span>
      </div>
      {mine ? (
        <>
          {specials.length > 0 && (
            <div className="specials">
              {specials.map((m) => (
                <button key={m.id} className={`mv special${isFinisherMove(me, m) ? ' fin' : ''}`} onClick={() => { buzz([10, 20, 10]); engine.chooseMove(m.id); }}>
                  <span className="mn">{m.name}</span>
                  <span className="mi">{isFinisherMove(me, m) ? 'Finisher ready' : 'Signature ready'}</span>
                </button>
              ))}
            </div>
          )}
          {extra}
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
          {S.over ? '' : other ? `${other.w.name} is on the attack. Get ready to roll.` : ctrl === pk ? 'Going for it…' : 'Collar and elbow tie-up…'}
        </p>
      )}
    </div>
  );
}
