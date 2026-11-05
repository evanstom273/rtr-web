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
import { freshBuilder, matchSides, type BuilderState } from './builder/state';
import { FEATURES } from '../career/tuning';
import { CareerApp, type CareerScreen } from './career/CareerApp';
import { MatchMocks } from './mock/MatchMocks';
import { commit } from './career/parts';
import { applyBout, boutRules, promoName, runToday } from '../career';
import { runJobs } from '../career/runner';
import { outOf, simOne } from '../career/sim';
import { hashSeed } from '../career/booker';
import { activeWorld, resetCareer } from '../world/world';

/** A career match being played: which show and which match on its card. */
interface CareerBout { showId: string; index: number }

type Screen =
  | { name: 'menu' }
  | { name: 'setup' }
  | { name: 'career'; initial?: CareerScreen }
  | { name: 'tape'; career?: CareerBout }
  | { name: 'match'; engine: MatchEngine; career?: CareerBout }
  | { name: 'result'; engine: MatchEngine; career?: CareerBout }
  | { name: 'archive' }
  | { name: 'record'; id: string };

/** The menu's career line: who you are and what day it is. */
function careerLine(): string | null {
  const c = activeWorld().career;
  const me = c ? findWrestler(c.player) : undefined;
  if (!c || !me) return null;
  return `${me.name} · ${me.promotion === 'TIS' ? 'free agent' : promoName(me.promotion)} · day ${Math.round((Date.parse(c.today) - Date.parse(c.startedOn)) / 864e5) + 1}`;
}

function careerName(): string | null {
  const c = activeWorld().career;
  return c ? findWrestler(c.player)?.name ?? null : null;
}

export function App() {
  const [, setMenuTick] = useState(0);
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
    // Match overhaul: any kind of match, any number of sides (the flag's off: singles as ever).
    const sides = FEATURES.matches ? matchSides(builder) : null;
    const engine = new MatchEngine({
      you, them,
      ...(sides ? { extras: sides.extras, type: sides.type, player: sides.player } : {}),
      rules: {
        ...(sides?.rules ?? {}),
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

  /** Your career match: you against your opponent, with the show's own name, venue and stakes. */
  const careerSetup = useCallback((cb: CareerBout) => {
    const c = activeWorld().career;
    const show = c?.shows[cb.showId];
    const bout = show?.card?.[cb.index];
    if (!c || !show || !bout) return null;
    const them = bout.a === c.player ? bout.b : bout.a;
    return { c, show, bout, you: c.player, them, aIsYou: bout.a === c.player, rules: boutRules(c, show, bout, c.player, them, false) };
  }, []);
  const startCareerMatch = useCallback((cb: CareerBout) => {
    const s = careerSetup(cb);
    if (!s) return;
    const engine = new MatchEngine({ you: s.you, them: s.them, rules: s.rules });
    if (import.meta.env.DEV) (window as unknown as { __rtr: MatchEngine }).__rtr = engine;
    setScreen({ name: 'match', engine, career: cb });
  }, [careerSetup]);
  /** Put a finished (or abandoned and simmed) career match into the career, then run the rest of the night. */
  const settleCareer = useCallback((cb: CareerBout, engine: MatchEngine, how: 'played' | 'simmed' = 'played') => {
    const s = careerSetup(cb);
    if (!s || s.bout.result) return;
    applyBout(s.c, s.show, cb.index, outOf('mine', engine), s.aIsYou, how);
    commit();
    void runToday(s.c, runJobs).then(commit);
  }, [careerSetup]);
  const toCareer = useCallback((initial?: CareerScreen) => setScreen({ name: 'career', initial }), []);

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
    if ((screen.name === 'result' || screen.name === 'tape') && screen.career) return toCareer('show');
    if (screen.name === 'result' || screen.name === 'tape') return toRoster();
    toMenu();
  });

  const onOver = useCallback(() => {
    if (!engine) return;
    const S = engine.state, R = S.result, r = S.rating;
    if (!R || !r) return;
    if (!saved.current.has(S.id)) {
      saved.current.add(S.id);
      const how = R.winner ? `${S.sides[R.winner]!.w.name} won, ${fmtClock(R.t)}` : `No contest, ${fmtClock(R.t)}`;
      setHits(addHit({ stars: r.stars, you: S.you.w.name, them: S.them.w.name, how, venue: S.venue }));
      const rec = buildRecord(S);
      if (rec) void saveRecord(rec).then(reload);
    }
    const cb = screen.name === 'match' ? screen.career : undefined;
    if (cb) settleCareer(cb, engine);
    window.setTimeout(() => setScreen({ name: 'result', engine, career: cb }), 1400);
  }, [engine, reload, screen, settleCareer]);

  let body: JSX.Element | null = null;
  // Dev only: the match overhaul mock-ups (?mock=matches&scene=…), for approval.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('mock') === 'matches') {
    body = <MatchMocks />;
  } else if (screen.name === 'menu') {
    const latest = records?.find((r) => !r.legacy) ?? records?.[0] ?? null;
    const best = records?.length ? Math.max(...records.map((r) => r.stars)) : 0;
    body = (
      <Menu latest={latest} count={records?.length ?? 0} best={best} onPlay={() => setScreen({ name: 'setup' })} onArchive={toArchive}
        onCareer={() => toCareer()} career={careerLine()} careerName={careerName()}
        onResetCareer={() => void resetCareer().then(() => setMenuTick((n) => n + 1))}
        onSettings={() => setSettings(true)} onOpen={(id) => setScreen({ name: 'record', id })} />
    );
  } else if (screen.name === 'career') {
    body = <CareerApp initial={screen.initial} onMenu={toMenu} onPlay={(showId, index) => setScreen({ name: 'tape', career: { showId, index } })} />;
  } else if (screen.name === 'tape' && screen.career) {
    const s = careerSetup(screen.career);
    const you = s ? findWrestler(s.you) : undefined, them = s ? findWrestler(s.them) : undefined;
    if (s && you && them) {
      const cb = screen.career;
      const line = [s.show.name, s.bout.title ? 'Title match' : '', stipulation(s.bout.stip ?? 'standard').name].filter(Boolean).join(' · ');
      body = <Tape you={you} them={them} rules={line} onBack={() => toCareer('show')} onBell={() => startCareerMatch(cb)} />;
    }
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
        {leaving && (
          <LeavePrompt onStay={() => setLeaving(false)} onLeave={() => {
            const cb = screen.career;
            if (!cb) return toRoster();
            // Walking out of a career match: the match still happens, simmed from the bell.
            setLeaving(false);
            const st = careerSetup(cb);
            if (st) settleCareer(cb, simOne({ key: 'mine', seed: hashSeed(st.c.seed, 'mine', st.show.id), you: st.you, them: st.them,
              rules: boutRules(st.c, st.show, st.bout, st.you, st.them, true) }).engine, 'simmed');
            toCareer('show');
          }} />
        )}
      </>
    );
  } else if (screen.name === 'result') {
    const S = screen.engine.state;
    const cb = screen.career;
    body = S.rating ? <Result S={S} rating={S.rating} hits={hits} onRematch={startMatch} onNewMatch={toRoster} onMenu={toMenu} onCareer={cb ? () => toCareer('show') : undefined} /> : null;
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
