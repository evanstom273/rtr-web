import { useCallback, useState } from 'react';
import { WRESTLERS, databaseChanged, type Wrestler } from '../../data/rtr';
import { finishDay, makeOffer, person, startCareer } from '../../career';
import { todayReal } from '../../career/dates';
import { runJobs } from '../../career/runner';
import { activeWorld, resetCareer, resetWorld, saveWorld } from '../../world/world';
import { useBackLayer } from '../backStack';
import { Calendar } from './Calendar';
import { Contract } from './Contract';
import { Create } from './Create';
import { Finances } from './Finances';
import { History } from './History';
import { Letters } from './Letters';
import { MovesetEditor } from './MovesetEditor';
import { Negotiate } from './Negotiate';
import { commit, useCareer } from './parts';
import { Profile, type ProfileLink } from './Profile';
import { Records } from './Records';
import { Relationships } from './Relationships';
import { RequestFlow, Requests, showAnswersNext, type ReqRoute } from './Requests';
import { ShowDay } from './ShowDay';
import { Start } from './Start';
import { Stats } from './Stats';
import { Training } from './Training';
import './career.css';
import './career-app.css';

export type CareerScreen =
  | 'cal' | 'show' | 'profile' | 'letters' | 'contract' | 'training' | 'finances' | 'history' | 'stats' | 'records' | 'moveset' | 'start' | 'create' | 'requests' | 'relationships'
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
  if (import.meta.env.DEV) (window as unknown as { __career: unknown }).__career = { world: activeWorld, commit, makeOffer };
  const [stack, setStack] = useState<CareerScreen[]>(() => [c ? initial ?? 'cal' : 'start']);
  const [busy, setBusy] = useState<number | null>(null);
  const screen = stack[stack.length - 1]!;
  const go = useCallback((s: CareerScreen) => setStack((st) => [...st, s]), []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)), []);
  const home = useCallback(() => setStack(['cal']), []);
  useBackLayer(stack.length > 1, back);

  const begin = async (player: string, extra: Wrestler | undefined, fresh: boolean) => {
    // Fresh: the world as it ships, from today's real date. Kept: carry on where the world got to.
    if (!fresh && activeWorld().career) await resetCareer();
    const world = fresh ? await resetWorld(Math.floor(Math.random() * 2 ** 31)) : activeWorld();
    if (extra) {
      WRESTLERS.push(extra);
      databaseChanged();
    }
    world.career = startCareer({
      player, today: fresh ? todayReal() : world.day ?? todayReal(), seed: world.seed, created: !!extra,
      ...(!fresh && world.calendar ? { calendar: world.calendar } : {}),
    });
    await saveWorld(world);
    commit();
    setStack(['cal']);
  };

  const advance = async () => {
    if (!c || busy !== null) return;
    setBusy(0.15);
    try {
      await finishDay(c, async (jobs) => {
        setBusy(0.4);
        const out = await runJobs(jobs);
        setBusy(0.9);
        return out;
      });
    } finally {
      commit();
      setBusy(null);
    }
  };

  if (screen === 'start') return <Start hasCareer={!!c} onBack={c ? back : onMenu} onPick={(id, fresh) => void begin(id, undefined, fresh)} onCreate={() => go('create')} />;
  if (screen === 'create') return <Create hasCareer={!!c} onBack={back} onDone={(w, fresh) => void begin(w.id, w, fresh)} />;
  if (!c) return <Start hasCareer={false} onBack={onMenu} onPick={(id, fresh) => void begin(id, undefined, fresh)} onCreate={() => go('create')} />;

  if (typeof screen === 'object') {
    if ('negotiate' in screen) return <Negotiate c={c} offerId={screen.negotiate} onBack={back} onDone={home} />;
    if ('requests' in screen) return <Requests c={c} tab={screen.requests} onBack={back} onFlow={(r) => go(r)} onNegotiate={(id) => go({ negotiate: id })} />;
    // A request: answered, it lands you back on Requests › Answers.
    return <RequestFlow key={JSON.stringify(screen)} c={c} route={screen} onBack={back} onNegotiate={(id) => go({ negotiate: id })}
      onAnswered={() => { showAnswersNext(); setStack((st) => [...st.slice(0, -1).filter((x) => x !== 'requests' && !(typeof x === 'object' && 'requests' in x)), 'requests']); }} />;
  }
  switch (screen) {
    case 'show': return <ShowDay c={c} onBack={home} onPlay={onPlay} />;
    case 'profile': return <Profile c={c} onBack={back} onShowDay={() => go('show')} onHub={home} onOpen={(s: ProfileLink) => go(s === 'contract' || s === 'history' || s === 'finances' || s === 'stats' || s === 'relationships' ? s : 'profile')} />;
    case 'letters': return <Letters c={c} onBack={back} onNegotiate={(id) => go({ negotiate: id })} />;
    case 'contract': return <Contract c={c} onBack={back} />;
    case 'training': return <Training c={c} onBack={back} onMoveset={() => go('moveset')} />;
    case 'finances': return <Finances c={c} onBack={back} />;
    case 'history': return <History c={c} onBack={back} onStats={() => go('stats')} />;
    case 'stats': return <Stats c={c} onBack={back} onHistory={() => go('history')} />;
    case 'records': return <Records c={c} onBack={back} onMoveset={() => go('moveset')} onNewCareer={() => go('start')} onRequest={(r) => go(r)} />;
    case 'relationships': return <Relationships c={c} onBack={back} />;
    case 'requests': return <Requests c={c} onBack={back} onFlow={(r) => go(r)} onNegotiate={(id) => go({ negotiate: id })} />;
    case 'moveset': {
      const me = WRESTLERS.find((x) => x.id === c.player)!;
      return (
        <MovesetEditor who={me.name} classes={me.classes} kit={{ moves: me.moves, signatures: me.signatures, finishers: me.finishers }} onCancel={back}
          onSave={(k) => { me.moves = k.moves; me.signatures = k.signatures; me.finishers = k.finishers; commit(); back(); }} />
      );
    }
    default:
      return <Calendar c={c} busy={busy} onAdvance={() => void advance()} onShowDay={() => go('show')} onOpen={(s) => go(s)} onAsk={(r) => go(r)} />;
  }
}

export { person, activeWorld };
