import { useCallback, useRef, useState } from 'react';
import { DEFAULT_THEM, DEFAULT_YOU } from '../data/roster';
import { fmtClock, MatchEngine } from '../engine';
import { addHit, loadHits, type Hit } from '../storage/greatestHits';
import { Match } from './screens/Match';
import { Result } from './screens/Result';
import { Setup, type Picks } from './screens/Setup';

type Screen = { name: 'setup' } | { name: 'match'; engine: MatchEngine } | { name: 'result'; engine: MatchEngine };

export function App() {
  const [picks, setPicks] = useState<Picks>({ you: DEFAULT_YOU, them: DEFAULT_THEM, step: 'you', stakes: 'exh' });
  const [screen, setScreen] = useState<Screen>({ name: 'setup' });
  const [hits, setHits] = useState<Hit[]>(() => loadHits());
  const saved = useRef(new Set<number>());

  const startMatch = useCallback(() => {
    setScreen({ name: 'match', engine: new MatchEngine({ you: picks.you, them: picks.them, stakes: picks.stakes }) });
  }, [picks]);

  const engine = screen.name === 'setup' ? null : screen.engine;

  const onOver = useCallback(() => {
    if (!engine) return;
    const S = engine.state, R = S.result, r = S.rating;
    if (!R || !r) return;
    if (!saved.current.has(S.id)) {
      saved.current.add(S.id);
      setHits(addHit({ stars: r.stars, you: S.you.name, them: S.them.name, how: `${S[R.winner].name} won, ${fmtClock(R.t)}`, venue: S.venue }));
    }
    setScreen({ name: 'result', engine });
  }, [engine]);

  if (screen.name === 'setup') {
    return <Setup picks={picks} hits={hits} onPicks={setPicks} onBell={startMatch} />;
  }
  if (screen.name === 'match') {
    return <Match key={screen.engine.state.id} engine={screen.engine} onOver={onOver} />;
  }
  const S = screen.engine.state;
  return S.rating ? (
    <Result
      S={S}
      rating={S.rating}
      hits={hits}
      onRematch={startMatch}
      onNewMatch={() => {
        setPicks((p) => ({ ...p, step: 'you' }));
        setScreen({ name: 'setup' });
      }}
    />
  ) : null;
}
