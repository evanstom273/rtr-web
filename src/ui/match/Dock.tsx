import { SETUP_TEXT } from '../../data/commentary';
import { posOk, ready, type MatchEngine, type Move, type Side } from '../../engine';
import { pts } from '../format';

export type Tab = 'moves' | 'setup';

function needHint(a: Side, d: Side, m: Move): string {
  if (m.self === 'top' && a.pos !== 'top') return 'Needs you up top';
  if (m.tgt === 'grounded' && d.pos !== 'grounded') return 'Needs them on the mat';
  if (m.tgt === 'standing' && d.pos !== 'standing') return 'Needs them on their feet';
  return 'Wrong position';
}

interface Props {
  engine: MatchEngine;
  tab: Tab;
  onTab: (t: Tab) => void;
}

export function Dock({ engine, tab, onTab }: Props) {
  const S = engine.state;
  // Like the original, the chip and the waiting text reflect control as of the last render point.
  const ctrl = S.view.ctrl;
  const mine = S.ctrl === 'you' && S.pending.kind === 'awaitPlayer';

  let chip = '', chipCls = 'chip';
  if (S.over) chip = 'Match over';
  else {
    chip = ctrl === 'you' ? 'Your control' : ctrl === 'them' ? `${S.them.name} in control` : 'Lock up';
    chipCls = 'chip ' + (ctrl ?? '');
  }

  return (
    <div id="dock">
      <div className="dock-head">
        <span className={chipCls}>{chip}</span>
        <div className="tabs">
          <button className={tab === 'moves' ? 'on' : ''} onClick={() => onTab('moves')}>
            Moves
          </button>
          <button className={tab === 'setup' ? 'on' : ''} onClick={() => onTab('setup')}>
            Setup
          </button>
        </div>
        <button id="pinBtn" disabled={!(mine && engine.canPin())} onClick={() => engine.pin()}>
          PIN
        </button>
      </div>
      <div id="hand">{S.over ? null : mine ? <Hand engine={engine} tab={tab} onTab={onTab} /> : <Waiting engine={engine} ctrl={ctrl} />}</div>
    </div>
  );
}

function Waiting({ engine, ctrl }: { engine: MatchEngine; ctrl: string | null }) {
  return (
    <p className="wait">
      {ctrl === 'them'
        ? `${engine.state.them.name} is on the attack. When the bar comes up, stop it in the gold to reverse.`
        : 'Collar and elbow tie-up…'}
    </p>
  );
}

function Hand({ engine, tab, onTab }: Props) {
  const S = engine.state, a = S.you, d = S.them;
  if (tab === 'setup') {
    return (
      <div className="grid">
        {engine.setups().map((s) => (
          <button
            key={s.id}
            className="mv setup"
            onClick={() => {
              onTab('moves');
              engine.chooseSetup(s.id);
            }}
          >
            <span className="mn">{SETUP_TEXT[s.id].name}</span>
            <span className="mi">{SETUP_TEXT[s.id].hint}</span>
          </button>
        ))}
      </div>
    );
  }
  const specials = (['sig', 'fin'] as const).map((key) => {
    const m = a[key];
    const rd = ready(a, m), po = posOk(a, d, m);
    const why = !rd
      ? m.sig ? 'Fill your momentum' : 'Land your signature to bank one'
      : !po ? needHint(a, d, m)
      : m.sub ? 'Submission finisher' : m.fin ? 'Finisher' : 'Signature';
    return (
      <button key={key} className="mv special" disabled={!(rd && po)} onClick={() => engine.chooseMove({ special: key })}>
        <span className="mn">{m.name}</span>
        <span className="mi">{why}</span>
      </button>
    );
  });
  const list = engine.playableMoves();
  return (
    <>
      <div className="specials">{specials}</div>
      <div className="grid">
        {list.length ? (
          list.map((m) => {
            const u = a.used[m.name] || 0;
            return (
              <button key={m.name} className="mv" onClick={() => engine.chooseMove({ index: a.moves.indexOf(m) })}>
                <span className="mn">{m.name}</span>
                <span className="mi">
                  <span>
                    {m.part} {Math.round(d.hp[m.part])}
                  </span>
                  <span className="pts">{pts(m.imp)}</span>
                  {m.risk === 2 && <span className="risk">high risk</span>}
                  {m.sub && <span className="sub">submission</span>}
                  {m.flash && <span className="flash">roll-up</span>}
                  {m.rest && <span>rest hold</span>}
                  {u >= 2 && <span className="warn">used ×{u}</span>}
                </span>
              </button>
            );
          })
        ) : (
          <p className="wait">Nothing lands from here. Check Setup.</p>
        )}
      </div>
    </>
  );
}
