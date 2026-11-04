import { fmtDay } from '../../career/dates';
import { activeWorld, worldPlayed } from '../../world/world';
import { FEATURES } from '../../career/tuning';
import { useWords } from './parts';

interface Props { hasCareer: boolean; onCancel: () => void; onGo: (fresh: boolean | 'history') => void }

/** Before picking anyone (Lyra's call): keep the world that's been played in, or start a fresh one. */
export function WorldChoice({ hasCareer, onCancel, onGo }: Props) {
  const { w } = useWords();
  const world = activeWorld();
  const shows = world.history.shows.length;
  return (
    <div className="c-sheet" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div>
        <div className="c-sh"><div><span>{w('New career')}</span><b>{hasCareer ? 'Start again?' : 'Which world?'}</b></div><button onClick={onCancel} aria-label="Cancel">✕</button></div>
        <p className="c-note">
          {hasCareer ? 'This replaces your current career. ' : ''}
          Keep this world and carry on from {world.day ? fmtDay(world.day, 'long') : 'today'}: champions, rosters, rookies and its history ({shows} shows) stay.
          Or start a fresh world, as it ships, on today’s date. Then pick or create your wrestler from it.
        </p>
        {FEATURES.history && <button className="c-b3" onClick={() => onGo('history')}>{w('Fresh world with history… ›')}</button>}
        <div className="c-nav">
          <button className="c-b2" onClick={() => onGo(true)}>{w('Fresh world')}</button>
          <button className="c-b1" onClick={() => onGo(false)}>{w('Keep this world')}</button>
        </div>
      </div>
    </div>
  );
}

/** Whether starting a career needs to ask (a career exists, or the world has been played). */
export const needsWorldChoice = (hasCareer: boolean): boolean => hasCareer || worldPlayed();
