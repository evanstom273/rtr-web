import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { MatchEngine, SideKey } from '../../engine';
import { nameTone, reduceMotion } from '../format';
import { Dock } from '../match/Dock';
import { Hud } from '../match/Hud';
import { Log } from '../match/Log';
import { MoveWheel } from '../match/MoveWheel';
import { RingView, snapKey } from '../match/RingView';
import { SetupSheet } from '../match/SetupSheet';
import { SpecialsSheet } from '../match/SpecialsSheet';
import { WrestlerCard } from '../match/WrestlerCard';
import { Flash } from '../overlays/Flash';
import { KickoutHold } from '../overlays/KickoutHold';
import { RefCount } from '../overlays/RefCount';
import { Resiliency } from '../overlays/Resiliency';
import { ContestCard } from '../overlays/ContestCard';
import { SubChoice } from '../overlays/SubChoice';
import { SubmissionTug } from '../overlays/SubmissionTug';
import { PinChoice } from '../overlays/PinChoice';
import { useEngine } from '../useEngine';
import { useMedia } from '../useMedia';

const POP_MS = 1900;
const THUMB_W = 112;

function useViewportWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

export function Match({ engine, onOver }: { engine: MatchEngine; onOver: () => void }) {
  const version = useEngine(engine);
  const S = engine.state, p = S.pending, v = S.view;
  const wide = useMedia('(min-width: 700px)');
  const vw = useViewportWidth();
  const bigW = Math.min(vw - 16, 480);
  const [sheet, setSheet] = useState<'none' | 'moves' | 'setup' | 'specials-you' | 'specials-them'>('none');
  const [flash, setFlash] = useState<{ id: number; text: string; strong: boolean } | null>(null);
  const [jolt, setJolt] = useState<{ n: number; big: boolean }>({ n: 0, big: false });
  const [pinned, setPinned] = useState(false);
  const [autoPop, setAutoPop] = useState(0);
  const [popOpen, setPopOpen] = useState(false);
  const pulse = useRef(0);
  const seenEvent = useRef(0);
  const lastSnap = useRef(`${snapKey(v.sides.you.state)}/${snapKey(v.sides.them.state)}`);
  const tones: Record<SideKey, string> = { you: nameTone(S.you.w), them: nameTone(S.them.w) };

  // Engine events: big-word flashes, crowd pulses, screen jolts.
  useEffect(() => {
    let big = false, any = false;
    for (const ev of S.events) {
      if (ev.id <= seenEvent.current) continue;
      seenEvent.current = ev.id;
      if (ev.type === 'flash') {
        setFlash({ id: ev.id, text: ev.text, strong: !!ev.strong });
        if (ev.strong) big = any = true;
      } else if (ev.type === 'heatSpike') pulse.current = Math.min(1, pulse.current + ev.amount / 25);
      else if (ev.beat === 'crash') big = any = true;
      else if (ev.beat === 'move_landed') any = true;
    }
    if (any && !reduceMotion()) setJolt((j) => ({ n: j.n + 1, big }));
  }, [S, version]);

  // Phone: pop the ring thumbnail open when someone changes position.
  useEffect(() => {
    const key = `${snapKey(v.sides.you.state)}/${snapKey(v.sides.them.state)}`;
    if (key === lastSnap.current) return;
    lastSnap.current = key;
    if (!wide) setAutoPop((n) => n + 1);
  }, [v, wide]);
  useEffect(() => {
    if (!autoPop) return;
    setPopOpen(true);
    const id = window.setTimeout(() => setPopOpen(false), POP_MS);
    return () => window.clearTimeout(id);
  }, [autoPop]);
  const pop = pinned || popOpen;

  useEffect(() => {
    if (p.kind === 'over') onOver();
    // The move wheel and setup page only make sense on your turn; specials can stay open.
    if (p.kind !== 'awaitPlayer') setSheet((x) => (x === 'moves' || x === 'setup' ? 'none' : x));
  }, [p, onOver]);

  const close = useCallback(() => setSheet('none'), []);
  const joltCls = jolt.n ? ` ${jolt.big ? 'jolt-big' : 'jolt'}${jolt.n % 2}` : '';
  const ringBusy = p.kind === 'contest' || p.kind === 'contestRoll' || p.kind === 'pinChoice' || p.kind === 'subChoice' || p.kind === 'kickout' || p.kind === 'refCount' || p.kind === 'sub';

  return (
    <>
      <section id="match" className={`${wide ? 'wide' : 'narrow'}${joltCls}`}>
        <Hud engine={engine} pulse={pulse}>
          {!wide && (
            <button className={`ringthumb${pop ? ' pop' : ''}${ringBusy ? ' busy' : ''}`}
              style={{ '--thumb-w': `${THUMB_W}px`, '--big-w': `${bigW}px`, '--thumb-s': THUMB_W / bigW } as CSSProperties} onClick={() => { setPinned(!pop); setPopOpen(false); }}
              aria-label={pop ? 'Shrink ring view' : 'Expand ring view'}>
              <RingView engine={engine} version={version} variant={pop ? 'panel' : 'thumb'} />
            </button>
          )}
        </Hud>
        <WrestlerCard w={S.you.w} v={v.sides.you} active={v.control === 'you'} onSpecials={() => setSheet('specials-you')} />
        <WrestlerCard w={S.them.w} v={v.sides.them} active={v.control === 'them'} focus={S.you.targetFocus} onPick={(part) => engine.setFocus(part)}
          onSpecials={() => setSheet('specials-them')} />
        {wide && (
          <div id="ringpanel">
            <RingView engine={engine} version={version} variant="panel" />
          </div>
        )}
        <Log entries={S.log} tones={tones} />
        <Dock engine={engine} onMoves={() => setSheet('moves')} onSetup={() => setSheet('setup')} />
      </section>
      {sheet === 'moves' && p.kind === 'awaitPlayer' && <MoveWheel engine={engine} onClose={close} />}
      {sheet === 'setup' && p.kind === 'awaitPlayer' && <SetupSheet engine={engine} onClose={close} />}
      {(sheet === 'specials-you' || sheet === 'specials-them') && (
        <SpecialsSheet engine={engine} initial={sheet === 'specials-you' ? 'you' : 'them'} onClose={close} />
      )}
      {(p.kind === 'contest' || p.kind === 'contestRoll') && <ContestCard key={p.spec.id} engine={engine} />}
      {p.kind === 'kickout' && <KickoutHold key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'refCount' && <RefCount key={p.id} engine={engine} kickoutAt={p.kickoutAt} />}
      {p.kind === 'sub' && <SubmissionTug key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'subChoice' && <SubChoice key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'pinChoice' && <PinChoice key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'resiliency' && <Resiliency key={p.id} engine={engine} threat={p.threat} />}
      {flash && <Flash key={flash.id} text={flash.text} strong={flash.strong} />}
    </>
  );
}
