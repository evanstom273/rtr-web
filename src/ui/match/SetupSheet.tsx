import { useEffect, useState } from 'react';
import { SETUP_TEXT, setupGroup, type SetupGroup } from '../../data/commentary';
import { setupTitle, weaponOf, type MatchEngine, type SetupId } from '../../engine';
import { buzz } from '../format';

const ORDER: SetupGroup[] = ['OBJECTIVE', 'WEAPONS', 'OPPONENT SETUP', 'MOVEMENT', 'RING POSITION', 'RECOVERY', 'DIRTY', 'SHOWBOAT'];
const LABEL: Record<SetupGroup, string> = {
  OBJECTIVE: 'Objective', WEAPONS: 'Weapons & objects', 'OPPONENT SETUP': 'Opponent setup', MOVEMENT: 'Movement',
  'RING POSITION': 'Ring position', RECOVERY: 'Recovery', DIRTY: 'Dirty tactics', SHOWBOAT: 'Showboat',
};

export function SetupSheet({ engine, onClose }: { engine: MatchEngine; onClose: () => void }) {
  const S = engine.state;
  const ids = engine.playerSetups();
  const [picker, setPicker] = useState<'retrieve' | 'pickup' | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const groups = ORDER.map((g) => [g, ids.filter((id) => setupGroup(id) === g)] as const).filter(([, l]) => l.length);
  const pick = (id: SetupId, arg?: string) => {
    if (id === 'retrieve_weapon' && !arg) return setPicker('retrieve');
    if (id === 'pick_up_weapon' && !arg && engine.pickUps().length > 1) return setPicker('pickup');
    buzz();
    onClose();
    engine.chooseSetup(id, arg);
  };
  if (picker) {
    const dqOn = S.rules.dq;
    const list = picker === 'retrieve'
      ? engine.retrievable().map((w) => ({ key: w.id, w, extra: `durability ${w.minDurability === w.maxDurability ? w.minDurability : `${w.minDurability}–${w.maxDurability}`}` }))
      : engine.pickUps().map((o) => ({ key: String(o.id), w: weaponOf(o), extra: `durability ${o.durability}` }));
    return (
      <div className="wheel-ov" onClick={onClose}>
        <div className="movepanel setuppanel" onClick={(e) => e.stopPropagation()}>
          <div className="mp-head">
            <button className="ghost sm" onClick={() => setPicker(null)}>
              ‹ Back
            </button>
            <h3>{picker === 'retrieve' ? 'Under the ring' : 'Pick up'}</h3>
            <button className="ghost sm" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          <div className="mgrid">
            {list.map(({ key, w, extra }) => (
              <button key={key} className="mv setup g-weapons" onClick={() => pick(picker === 'retrieve' ? 'retrieve_weapon' : 'pick_up_weapon', key)}>
                <span className="mn">{w.name}</span>
                <span className="mi">
                  impact {w.impact} · {extra}
                  {w.bleed >= 50 ? ' · draws blood' : ''}
                  {dqOn && w.illegal ? <b className="lock"> · DQ if the ref sees it</b> : ''}
                </span>
                <span className="mi">{w.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
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
