import { useCallback, useEffect, useRef, useState } from 'react';
import { findWrestler } from '../data/rtr';
import { fmtClock, MatchEngine, stipulation } from '../engine';
import { addHit, loadHits, type Hit } from '../storage/greatestHits';
import { allRecords, archiveIsTemporary, deleteRecords, saveRecord } from '../storage/records';
import { useBackLayer } from './backStack';
import { LeavePrompt } from './overlays/LeavePrompt';
import { buildRecord, type MatchRecord } from './record';
import { Archive } from './screens/Archive';
import { Builder } from './screens/Builder';
import { Match } from './screens/Match';
import { Menu } from './screens/Menu';
import { Record } from './screens/Record';
import { Result } from './screens/Result';
import { Tape } from './screens/Tape';
import { Settings } from './Settings';
import { freshBuilder, type BuilderState } from './builder/state';

type Screen =
  | { name: 'menu' }
  | { name: 'setup' }
  | { name: 'tape' }
  | { name: 'match'; engine: MatchEngine }
  | { name: 'result'; engine: MatchEngine }
  | { name: 'archive' }
  | { name: 'record'; id: string };

export function App() {
  const [builder, setBuilder] = useState<BuilderState>(freshBuilder);
  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [hits, setHits] = useState<Hit[]>(() => loadHits());
  const [records, setRecords] = useState<MatchRecord[] | null>(null);
  const [settings, setSettings] = useState(false);
  const saved = useRef(new Set<number>());

  const reload = useCallback(() => {
    void allRecords().then(setRecords);
  }, []);
  useEffect(reload, [reload]);

  const startMatch = useCallback(() => {
    const you = builder.teams.A[0], them = builder.teams.B[0];
    if (!you || !them) return;
    const engine = new MatchEngine({
      you, them,
      rules: {
        actionClock: builder.actionClock, countOuts: builder.countOuts, countOutLimit: builder.countOutLimit,
        stipulation: builder.stipulation, dq: builder.dq, ironManMinutes: builder.ironManMinutes, ladderPrize: builder.ladderPrize,
        cageEscape: builder.cageEscape, cagePins: builder.cagePins, cageSubs: builder.cageSubs,
        title: !!builder.titleId, titleId: builder.titleId || undefined,
        eventPromotion: builder.event === 'auto' ? undefined : builder.event,
      },
    });
    // Dev only: lets the screenshot scripts poke at a live match.
    if (import.meta.env.DEV) (window as unknown as { __rtr: MatchEngine }).__rtr = engine;
    setScreen({ name: 'match', engine });
  }, [builder]);

  const engine = screen.name === 'match' || screen.name === 'result' ? screen.engine : null;

  const [leaving, setLeaving] = useState(false);
  const toRoster = useCallback(() => {
    setLeaving(false);
    setScreen({ name: 'setup' });
  }, []);
  const toMenu = useCallback(() => setScreen({ name: 'menu' }), []);
  const toArchive = useCallback(() => setScreen({ name: 'archive' }), []);
  // Android back: mid-match it asks before leaving; a record goes back to the archive; the result
  // and tale of the tape go to the builder; everything else goes to the menu.
  useBackLayer(screen.name !== 'menu', () => {
    if (screen.name === 'match' && !screen.engine.state.over) {
      setLeaving((x) => !x);
      return true;
    }
    if (screen.name === 'record') return toArchive();
    if (screen.name === 'result' || screen.name === 'tape') return toRoster();
    toMenu();
  });

  const onOver = useCallback(() => {
    if (!engine) return;
    const S = engine.state, R = S.result, r = S.rating;
    if (!R || !r) return;
    if (!saved.current.has(S.id)) {
      saved.current.add(S.id);
      const how = R.winner ? `${S[R.winner].w.name} won, ${fmtClock(R.t)}` : `No contest, ${fmtClock(R.t)}`;
      setHits(addHit({ stars: r.stars, you: S.you.w.name, them: S.them.w.name, how, venue: S.venue }));
      const rec = buildRecord(S);
      if (rec) void saveRecord(rec).then(reload);
    }
    window.setTimeout(() => setScreen({ name: 'result', engine }), 1400);
  }, [engine, reload]);

  let body: JSX.Element | null = null;
  if (screen.name === 'menu') {
    const latest = records?.find((r) => !r.legacy) ?? records?.[0] ?? null;
    const best = records?.length ? Math.max(...records.map((r) => r.stars)) : 0;
    body = (
      <Menu latest={latest} count={records?.length ?? 0} best={best} onPlay={() => setScreen({ name: 'setup' })} onArchive={toArchive}
        onSettings={() => setSettings(true)} onOpen={(id) => setScreen({ name: 'record', id })} />
    );
  } else if (screen.name === 'setup') {
    body = <Builder state={builder} hits={hits} onChange={setBuilder} onStart={() => setScreen({ name: 'tape' })} onMenu={toMenu} />;
  } else if (screen.name === 'tape') {
    const you = findWrestler(builder.teams.A[0] ?? ''), them = findWrestler(builder.teams.B[0] ?? '');
    if (you && them) {
      const st = stipulation(builder.stipulation);
      const rules = [
        builder.stipulation === 'iron_man' ? `${st.name} (${builder.ironManMinutes} min)` : st.name,
        st.countOuts && builder.countOuts ? `Count-out ${builder.countOutLimit}` : 'No count-outs',
        `${builder.actionClock}s clock`,
      ].join(' · ');
      body = <Tape you={you} them={them} rules={rules} onBack={toRoster} onBell={startMatch} />;
    }
  } else if (screen.name === 'match') {
    body = (
      <>
        <Match key={screen.engine.state.id} engine={screen.engine} onOver={onOver} />
        {leaving && <LeavePrompt onStay={() => setLeaving(false)} onLeave={toRoster} />}
      </>
    );
  } else if (screen.name === 'result') {
    const S = screen.engine.state;
    body = S.rating ? <Result S={S} rating={S.rating} hits={hits} onRematch={startMatch} onNewMatch={toRoster} onMenu={toMenu} /> : null;
  } else if (screen.name === 'archive') {
    body = <Archive records={records} temporary={archiveIsTemporary()} onBack={toMenu} onOpen={(id) => setScreen({ name: 'record', id })} />;
  } else {
    const r = records?.find((x) => x.id === screen.id);
    body = r ? (
      <Record key={r.id} r={r} onBack={toArchive}
        onDelete={() => void deleteRecords([r.id]).then(() => {
          reload();
          toArchive();
        })} />
    ) : null;
  }
  return (
    <>
      {body}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </>
  );
}
