import { useCallback, useEffect, useRef, useState } from 'react';
import { WRESTLERS, databaseChanged, type Wrestler } from '../../data/rtr';
import { advancePhase, beginHistory, careerFrom, ctxFor, eventLibrary, fire, makeOffer, makeSpecial, person, phaseOf, routineOf, skip, startCareer, type SkipTarget } from '../../career';
import { simMyMatch } from './simMine';
import { FEATURES } from '../../career/tuning';
import { calledOut } from '../../career/mail';
import { todayReal } from '../../career/dates';
import { runJobs } from '../../career/runner';
import { activeWorld, freshWorld, reloadWorld, resetCareer, saveWorld, setWorld, worldPlayed, type World } from '../../world/world';
import { useBackLayer } from '../backStack';
import { Calendar } from './Calendar';
import { Contract } from './Contract';
import { Create } from './Create';
import { Finances } from './Finances';
import { History } from './History';
import { Letters } from './Letters';
import { MovesetEditor } from './MovesetEditor';
import { Negotiate } from './Negotiate';
import { Creative } from './Creative';
import { Scouting } from './Scouting';
import { Rebrand } from './Rebrand';
import { Epilogue } from './Epilogue';
import { HistoryScreen, HistorySetup } from './HistorySim';
import { commit, Head, Screen, useCareer, useWords } from './parts';
import { Profile, type ProfileLink } from './Profile';
import { Records } from './Records';
import { Relationships } from './Relationships';
import { RequestFlow, Requests, showAnswersNext, type ReqRoute } from './Requests';
import { ShowDay } from './ShowDay';
import { Start, type StartDeal } from './Start';
import { OwnShow } from './OwnShow';
import { Social } from './Social';
import { Stats } from './Stats';
import { Training } from './Training';
import { Week } from './Week';
import { needsWorldChoice, WorldChoice } from './WorldChoice';
import './career.css';
import './career-app.css';

export type CareerScreen =
  | 'cal' | 'show' | 'profile' | 'letters' | 'contract' | 'training' | 'finances' | 'history' | 'stats' | 'records' | 'moveset' | 'start' | 'create' | 'requests' | 'relationships' | 'week' | 'social' | 'ownshow' | 'history'
  | { negotiate: string } | { requests: number } | ReqRoute;

interface Props {
  initial?: CareerScreen;
  onMenu: () => void;
  onPlay: (showId: string, index: number) => void;
}

/** Career mode: the calendar and everything off it. */
export function CareerApp({ initial, onMenu, onPlay }: Props) {
  const c = useCareer();
  // Dev only: lets the test scripts reach the career.
  if (import.meta.env.DEV) {
    // Dev only: poke the world from the console (and from browser checks), e.g. __career.event('podcast').
    const event = (id: string) => { const c = activeWorld().career!; const l = fire(ctxFor(c), eventLibrary().find((d) => d.id === id)!); commit(); return l?.id; };
    const special = (kind: Parameters<typeof makeSpecial>[1]) => { const ok = makeSpecial(activeWorld().career!, kind, String(Date.now())); commit(); return ok; };
    (window as unknown as { __career: unknown }).__career = { world: activeWorld, commit, makeOffer, event, special, features: FEATURES, calledOut: (id: string) => { calledOut(activeWorld().career!, id); commit(); } };
  }
  // A history mid-simulation picks up where it left off.
  const [stack, setStack] = useState<CareerScreen[]>(() => [c ? initial ?? 'cal' : activeWorld().sim ? 'history' : 'start']);
  const [busy, setBusy] = useState<number | null>(null);
  const screen = stack[stack.length - 1]!;
  const go = useCallback((s: CareerScreen) => setStack((st) => [...st, s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const home = useCallback(() => setStack(['cal']), []);
  useBackLayer(stack.length > 1, back);

  // The universe comes first (Lyra's call): keep this one, or a fresh one, and then pick someone from it.
  // A fresh one is only a look until you start: back out and the world you had comes back as it was.
  const { skin } = useWords();
  const [universe, setUniverse] = useState<'keep' | 'fresh' | null>(null);
  const kept = useRef<World | null>(null);
  const hadCareer = !!(kept.current?.career ?? c);
  const restore = useCallback(() => {
    if (kept.current) {
      setWorld(kept.current);
      kept.current = null;
      databaseChanged();
    }
    setUniverse(null);
  }, []);
  // The history sim (Lyra's call): a fresh world wound back 1–10 years, played out to today before you choose.
  const [histSetup, setHistSetup] = useState(false);
  const startHistory = (years: number) => {
    kept.current = null;
    setUniverse(null);
    setHistSetup(false);
    setWorld(freshWorld());
    beginHistory(years, todayReal());
    databaseChanged();
    setStack(['history']);
  };
  const choose = (fresh: boolean | 'history') => {
    if (fresh === 'history') { setHistSetup(true); return; }
    if (fresh) {
      kept.current = structuredClone(activeWorld());
      setWorld(freshWorld());
      databaseChanged();
    }
    setUniverse(fresh ? 'fresh' : 'keep');
  };
  const leaveStart = () => {
    restore();
    if (stack.length > 1) back();
    else onMenu();
  };
  // Anywhere else (the phone's back button, say), or out of career mode: put the world back.
  const choosing = screen === 'start' || screen === 'create';
  useEffect(() => { if (!choosing) restore(); }, [choosing, restore]);
  useEffect(() => restore, [restore]);

  const begin = async (player: string, extra?: Wrestler, deal?: StartDeal) => {
    // Fresh: the world you've been looking at, from today's real date. Kept: carry on where the world got to.
    const fresh = universe === 'fresh';
    if (!fresh && activeWorld().career) await resetCareer();
    const world = activeWorld();
    kept.current = null;
    setUniverse(null);
    if (extra) {
      WRESTLERS.push(extra);
      databaseChanged();
    }
    // After a simulated history: your career carries on from the world it made.
    if (world.sim) {
      const sim = world.sim;
      delete world.sim;
      world.career = careerFrom(sim.career, player, { created: !!extra, ...(deal !== undefined ? { deal } : {}) });
      await saveWorld(world);
      commit();
      setStack(['cal']);
      return;
    }
    world.career = startCareer({
      player, today: fresh ? todayReal() : world.day ?? todayReal(), seed: world.seed, created: !!extra,
      ...(!fresh && world.calendar ? { calendar: world.calendar } : {}),
      ...(deal !== undefined ? { deal } : {}),
    });
    await saveWorld(world);
    commit();
    setStack(['cal']);
  };

  const advance = async () => {
    if (!c || busy !== null) return;
    setBusy(0.15);
    try {
      // A phase (days on) or a day. Saved only once it's all done: a night that fails isn't half-saved.
      await advancePhase(c, async (jobs) => {
        setBusy(0.4);
        const out = await runJobs(jobs);
        setBusy(0.9);
        return out;
      });
      commit();
    } catch {
      await reloadWorld();
      databaseChanged();
    } finally {
      setBusy(null);
    }
  };

  // Time skipping (Lyra's call, Football Manager style): saved at each day's end, stopped by anything that needs you.
  const [skipping, setSkipping] = useState(false);
  const [note, setNote] = useState<{ text: string } | null>(null);
  const [awayLog, setAwayLog] = useState<string[] | null>(null);
  const stop = useRef(false);
  const doSkip = async (t: SkipTarget) => {
    if (!c || busy !== null) return;
    stop.current = false;
    setSkipping(true);
    setBusy(0.02);
    try {
      const r = await skip(c, t, runJobs, {
        cancelled: () => stop.current,
        mine: async (x) => routineOf(x).simMine && simMyMatch(x),
        onPhase: async (x, done, total) => {
          setBusy(Math.min(0.98, done / total));
          databaseChanged();
          if (phaseOf(x) === 'am') await saveWorld();
        },
      });
      commit();
      // The summary says it all when there is one; otherwise a word on why it stopped.
      setNote({ text: r.stopped ?? (r.handled.length ? '' : 'There.') });
      if (r.handled.length) setAwayLog(r.handled);
      window.setTimeout(() => setNote(null), 4000);
    } catch {
      await reloadWorld();
      databaseChanged();
      setNote({ text: 'Something went wrong; back to the last save.' });
    } finally {
      setBusy(null);
      setSkipping(false);
    }
  };

  const setup = histSetup && <HistorySetup onCancel={() => setHistSetup(false)} onGo={startHistory} />;
  const startScreen = (s: 'start' | 'create') => {
    if (universe === null && !activeWorld().sim && needsWorldChoice(hadCareer)) {
      return (
        <Screen>
          <Head title={skin === 'paper' ? 'A New Career' : 'NEW CAREER'} onBack={leaveStart} />
          {!histSetup && <WorldChoice hasCareer={hadCareer} onCancel={leaveStart} onGo={choose} />}
          {setup}
        </Screen>
      );
    }
    if (s === 'create') return <Create hasCareer={hadCareer} onBack={back} onDone={(w) => void begin(w.id, w)} />;
    return (
      <>
        <Start hasCareer={hadCareer} fresh={universe === 'fresh'} onBack={activeWorld().sim ? () => setStack(['history']) : leaveStart} onPick={(id, deal) => void begin(id, undefined, deal)} onCreate={() => go('create')}
          onHistory={FEATURES.history && !activeWorld().sim && (universe === 'fresh' || !worldPlayed()) ? () => setHistSetup(true) : undefined} />
        {setup}
      </>
    );
  };
  if (screen === 'history' && activeWorld().sim) return <HistoryScreen onPick={() => setStack(['start'])} onQuit={onMenu} />;
  if (screen === 'start' || screen === 'create') return startScreen(screen);
  if (!c) return startScreen('start');

  // Retired: the career's over (Records and a new career are still there).
  if (c.over && screen !== 'records') return <Epilogue c={c} onRecords={() => go('records')} onNew={() => go('start')} />;
  // You've left a promotion that owned your name: pick a new one before anything else.
  if (c.rebrand) return <Rebrand c={c} onDone={() => setStack((st) => [...st])} />;
  if (typeof screen === 'object') {
    if ('negotiate' in screen) return <Negotiate c={c} offerId={screen.negotiate} onBack={back} onDone={home} />;
    if ('requests' in screen) return <Requests c={c} tab={screen.requests} onBack={back} onFlow={(r) => go(r)} onNegotiate={(id) => go({ negotiate: id })} />;
    if ('req' in screen && screen.req === 'creative') return <Creative c={c} onBack={back} />;
    if ('req' in screen && screen.req === 'scouting') return <Scouting c={c} onBack={back} />;
    // A request: answered, it lands you back on Requests › Answers.
    return <RequestFlow key={JSON.stringify(screen)} c={c} route={screen} onBack={back} onNegotiate={(id) => go({ negotiate: id })}
      onAnswered={() => { showAnswersNext(); setStack((st) => [...st.slice(0, -1).filter((x) => x !== 'requests' && !(typeof x === 'object' && 'requests' in x)), 'requests']); }} />;
  }
  switch (screen) {
    case 'show': return <ShowDay c={c} onBack={home} onPlay={onPlay} />;
    case 'profile': return <Profile c={c} onBack={back} onShowDay={() => go('show')} onHub={home} onOpen={(s: ProfileLink) => go(s === 'contract' || s === 'history' || s === 'finances' || s === 'stats' || s === 'relationships' || s === 'week' || s === 'social' ? s : 'profile')} />;
    case 'letters': return <Letters c={c} onBack={back} onNegotiate={(id) => go({ negotiate: id })} />;
    case 'contract': return <Contract c={c} onBack={back} />;
    case 'training': return <Training c={c} onBack={back} onMoveset={() => go('moveset')} />;
    case 'finances': return <Finances c={c} onBack={back} />;
    case 'history': return <History c={c} onBack={back} onStats={() => go('stats')} />;
    case 'stats': return <Stats c={c} onBack={back} onHistory={() => go('history')} />;
    case 'records': return <Records c={c} onBack={back} onMoveset={() => go('moveset')} onNewCareer={() => go('start')} onRequest={(r) => go(r)} />;
    case 'relationships': return <Relationships c={c} onBack={back} />;
    case 'week': return <Week c={c} onBack={back} onOwnShow={() => go('ownshow')} />;
    case 'ownshow': return <OwnShow c={c} onBack={back} />;
    case 'social': return <Social c={c} onBack={back} />;
    case 'requests': return <Requests c={c} onBack={back} onFlow={(r) => go(r)} onNegotiate={(id) => go({ negotiate: id })} />;
    case 'moveset': {
      const me = WRESTLERS.find((x) => x.id === c.player)!;
      return (
        <MovesetEditor who={me.name} classes={me.classes} kit={{ moves: me.moves, signatures: me.signatures, finishers: me.finishers }} onCancel={back}
          onSave={(k) => { me.moves = k.moves; me.signatures = k.signatures; me.finishers = k.finishers; commit(); back(); }} />
      );
    }
    default:
      return <Calendar c={c} busy={busy} skipping={skipping} onStop={() => { stop.current = true; }} onSkip={(t) => void doSkip(t)} note={note} awayLog={awayLog} onAwayDone={() => setAwayLog(null)} onAdvance={() => void advance()} onShowDay={() => go('show')} onOpen={(s) => go(s)} onAsk={(r) => go(r)} onNegotiate={(id) => go({ negotiate: id })} />;
  }
}

export { person, activeWorld };
