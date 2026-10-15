import { useCallback, useEffect, useRef, useState } from 'react';
import { fmtClock, MatchEngine } from '../engine';
import { addHit, loadHits, type Hit } from '../storage/greatestHits';
import { useBackLayer } from './backStack';
import { LeavePrompt } from './overlays/LeavePrompt';
import { Match } from './screens/Match';
import { Result } from './screens/Result';
import { loadBuilder, saveBuilder, type BuilderState } from './builder/state';
import { Builder } from './screens/Builder';

type Screen = { name: 'setup' } | { name: 'match'; engine: MatchEngine } | { name: 'result'; engine: MatchEngine };

export function App() {
  const [builder, setBuilder] = useState<BuilderState>(loadBuilder);
  const [screen, setScreen] = useState<Screen>({ name: 'setup' });
  const [hits, setHits] = useState<Hit[]>(() => loadHits());
  const saved = useRef(new Set<number>());

  useEffect(() => saveBuilder(builder), [builder]);

  const startMatch = useCallback(() => {
    const you = builder.teams.A[0], them = builder.teams.B[0];
    if (!you || !them) return;
    const engine = new MatchEngine({
      you, them,
      rules: {
        actionClock: builder.actionClock, countOuts: builder.countOuts, countOutLimit: builder.countOutLimit,
        title: !!builder.titleId, titleId: builder.titleId || undefined,
        eventPromotion: builder.event === 'auto' ? undefined : builder.event,
      },
    });
    setScreen({ name: 'match', engine });
  }, [builder]);

  const engine = screen.name === 'setup' ? null : screen.engine;

  // Android back: mid-match it asks before leaving; on the result screen it goes to the roster.
  const [leaving, setLeaving] = useState(false);
  const toRoster = useCallback(() => {
    setLeaving(false);
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

  if (screen.name === 'setup') return <Builder state={builder} hits={hits} onChange={setBuilder} onStart={startMatch} />;
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
