import { useCallback, useEffect, useRef, useState } from 'react';
import { findWrestler } from '../data/rtr';
import { fmtClock, MatchEngine } from '../engine';
import { addHit, loadHits, type Hit } from '../storage/greatestHits';
import { store } from '../storage/storage';
import { useBackLayer } from './backStack';
import { LeavePrompt } from './overlays/LeavePrompt';
import { Match } from './screens/Match';
import { Result } from './screens/Result';
import { Setup, type Picks } from './screens/Setup';

type Screen = { name: 'setup' } | { name: 'match'; engine: MatchEngine } | { name: 'result'; engine: MatchEngine };

const PICKS_KEY = 'rtr-picks';
const DEFAULT_PICKS: Picks = { you: 'macho_martinez', them: '', step: 'you', title: false, actionClock: 20, countOuts: true };

function loadPicks(): Picks {
  const p = { ...DEFAULT_PICKS, ...store.get<Partial<Picks>>(PICKS_KEY, {}) };
  if (!findWrestler(p.you)) p.you = DEFAULT_PICKS.you;
  if (p.them && !findWrestler(p.them)) p.them = '';
  return p;
}

export function App() {
  const [picks, setPicks] = useState<Picks>(loadPicks);
  const [screen, setScreen] = useState<Screen>({ name: 'setup' });
  const [hits, setHits] = useState<Hit[]>(() => loadHits());
  const saved = useRef(new Set<number>());

  useEffect(() => store.set(PICKS_KEY, picks), [picks]);

  const startMatch = useCallback(() => {
    if (!picks.you || !picks.them) return;
    const engine = new MatchEngine({
      you: picks.you, them: picks.them,
      rules: { title: picks.title, actionClock: picks.actionClock, countOuts: picks.countOuts },
    });
    setScreen({ name: 'match', engine });
  }, [picks]);

  const engine = screen.name === 'setup' ? null : screen.engine;

  // Android back: mid-match it asks before leaving; on the result screen it goes to the roster.
  const [leaving, setLeaving] = useState(false);
  const toRoster = useCallback(() => {
    setLeaving(false);
    setPicks((p) => ({ ...p, step: 'you' }));
    setScreen({ name: 'setup' });
  }, []);
  useBackLayer(screen.name !== 'setup', () => {
    if (screen.name === 'match' && !screen.engine.state.over) {
      setLeaving((x) => !x);
      return true;
    }
    toRoster();
  });

  const onOver = useCallback(() => {
    if (!engine) return;
    const S = engine.state, R = S.result, r = S.rating;
    if (!R || !r) return;
    if (!saved.current.has(S.id)) {
      saved.current.add(S.id);
      const how = R.winner ? `${S[R.winner].w.name} won, ${fmtClock(R.t)}` : `No contest, ${fmtClock(R.t)}`;
      setHits(addHit({ stars: r.stars, you: S.you.w.name, them: S.them.w.name, how, venue: S.venue }));
    }
    window.setTimeout(() => setScreen({ name: 'result', engine }), 1400);
  }, [engine]);

  if (screen.name === 'setup') return <Setup picks={picks} hits={hits} onPicks={setPicks} onBell={startMatch} />;
  if (screen.name === 'match') {
    return (
      <>
        <Match key={screen.engine.state.id} engine={screen.engine} onOver={onOver} />
        {leaving && <LeavePrompt onStay={() => setLeaving(false)} onLeave={toRoster} />}
      </>
    );
  }
  const S = screen.engine.state;
  return S.rating ? (
    <Result S={S} rating={S.rating} hits={hits} onRematch={startMatch}
      onNewMatch={toRoster} />
  ) : null;
}
