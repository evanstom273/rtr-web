import { useEffect } from 'react';
import { CLASS_LABEL } from '../../data/commentary';
import { getMove, getPromotion, titlesHeldBy, type MoveType, type Wrestler } from '../../data/rtr';
import { useBackLayer } from '../backStack';
import { Name } from '../common/Name';
import type { TeamKey } from './useDragSort';

const STATS = [['strength', 'Strength'], ['speed', 'Speed'], ['stamina', 'Stamina'], ['skill', 'Skill'], ['striking', 'Striking'], ['charisma', 'Charisma']] as const;
const POP = [['global', 'Global'], ['northAmerica', 'North America'], ['southAmerica', 'South America'], ['europe', 'Europe'], ['asia', 'Asia'], ['africa', 'Africa'], ['oceania', 'Oceania']] as const;
const TYPE_LABEL: Partial<Record<MoveType, string>> = {
  STRIKE: 'Strikes', GRAPPLE: 'Grapples', SUBMISSION: 'Submissions', AERIAL: 'Aerial', SPRINGBOARD: 'Springboard', RUNNING: 'Running', PINNING_MOVE: 'Pinning',
};

interface Props {
  w: Wrestler;
  team: TeamKey | null;
  locked: Record<TeamKey, boolean>;
  onAdd: (team: TeamKey) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function Profile({ w, team, locked, onAdd, onRemove, onClose }: Props) {
  useBackLayer(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const promo = getPromotion(w.promotion);
  const titles = titlesHeldBy(w);
  const byType = new Map<MoveType, string[]>();
  for (const id of w.moves) {
    const m = getMove(id);
    byType.set(m.type, [...(byType.get(m.type) ?? []), m.name]);
  }
  return (
    <div className="wheel-ov" onClick={onClose}>
      <div className="movepanel profile" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={w.name}>
        <div className="mp-head">
          <h3 className="pf-name">
            <Name w={w} />
          </h3>
          <button className="ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="pf-promo">{promo ? `${promo.initials} — ${promo.name}` : 'Independent'}</p>

        <section className="pf-sec">
          <h4>Identity</h4>
          <dl className="pf-dl">
            <dt>Gimmick</dt>
            <dd>
              <b>{w.gimmick}</b>
              {w.gimmickDescription ? ` — ${w.gimmickDescription}` : ''}
            </dd>
            <dt>Origin</dt>
            <dd>
              {w.country}, {w.regionLabel}
            </dd>
            <dt>Profile</dt>
            <dd>
              {w.gender === 'FEMALE' ? 'Female' : 'Male'} · {w.age} · {w.height} · {w.weight} lb
            </dd>
            <dt>Style</dt>
            <dd>
              {w.disposition === 'HEEL' ? 'Heel' : 'Face'} · {w.classes.map((c) => CLASS_LABEL[c]).join(', ')}
            </dd>
            <dt>Titles</dt>
            <dd>{titles.length ? titles.map((t) => t.name).join(', ') : 'None'}</dd>
          </dl>
        </section>

        <section className="pf-sec">
          <h4>Attributes</h4>
          <div className="pf-bars">
            {STATS.map(([k, l]) => (
              <div key={k} className="pf-bar">
                <span>{l}</span>
                <span className="bt">
                  <i style={{ width: `${w.stats[k]}%` }} />
                </span>
                <b>{w.stats[k]}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="pf-sec">
          <h4>Popularity</h4>
          <div className="pf-bars">
            {POP.map(([k, l]) => (
              <div key={k} className={`pf-bar${k === 'global' ? ' global' : ''}`}>
                <span>{l}</span>
                <span className="bt">
                  <i style={{ width: `${w.popularity[k]}%` }} />
                </span>
                <b>{w.popularity[k]}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="pf-sec">
          <h4>Moves</h4>
          <p className="pf-moves">
            <span className="tags">SIG</span> {w.signatures.map((id) => getMove(id).name).join(' · ')}
          </p>
          <p className="pf-moves">
            <span className="tagf">F</span> {w.finishers.map((id) => getMove(id).name).join(' · ')}
          </p>
          <details className="pf-moveset">
            <summary>Full moveset ({w.moves.length})</summary>
            {[...byType.entries()].map(([t, names]) => (
              <p key={t}>
                <b>{TYPE_LABEL[t] ?? t}</b> {names.join(' · ')}
              </p>
            ))}
          </details>
        </section>

        <div className="pf-actions">
          {team ? (
            <button className="ghost" onClick={onRemove} disabled={locked[team]}>
              Remove from Team {team}
            </button>
          ) : (
            (['A', 'B'] as const).map((t) => (
              <button key={t} className={t === 'A' ? 'primary' : 'ghost'} disabled={locked[t]} onClick={() => onAdd(t)}>
                Add to Team {t}
                {locked[t] ? ' (locked)' : ''}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
