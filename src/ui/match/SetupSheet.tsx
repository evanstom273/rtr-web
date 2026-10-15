import { useEffect } from 'react';
import { SETUP_TEXT, setupGroup, type SetupGroup } from '../../data/commentary';
import { setupTitle, type MatchEngine, type SetupId } from '../../engine';
import { buzz } from '../format';

const ORDER: SetupGroup[] = ['OPPONENT SETUP', 'MOVEMENT', 'RING POSITION', 'RECOVERY', 'SHOWBOAT'];
const LABEL: Record<SetupGroup, string> = {
  'OPPONENT SETUP': 'Opponent setup', MOVEMENT: 'Movement', 'RING POSITION': 'Ring position', RECOVERY: 'Recovery', SHOWBOAT: 'Showboat',
};

export function SetupSheet({ engine, onClose }: { engine: MatchEngine; onClose: () => void }) {
  const S = engine.state;
  const ids = engine.playerSetups();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const groups = ORDER.map((g) => [g, ids.filter((id) => setupGroup(id) === g)] as const).filter(([, l]) => l.length);
  const pick = (id: SetupId) => {
    buzz();
    onClose();
    engine.chooseSetup(id);
  };
  return (
    <div className="wheel-ov" onClick={onClose}>
      <div className="movepanel setuppanel" onClick={(e) => e.stopPropagation()}>
        <div className="mp-head">
          <span />
          <h3>Setup &amp; Showboat</h3>
          <button className="ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {groups.map(([g, list]) => (
          <section key={g} className="sgroup">
            <h4>{LABEL[g]}</h4>
            <div className="mgrid">
              {list.map((id) => (
                <button key={id} className={`mv setup g-${g.split(' ')[0]!.toLowerCase()}`} onClick={() => pick(id)}>
                  <span className="mn">{setupTitle(S.you, id)}</span>
                  <span className="mi">{SETUP_TEXT[id].description}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
