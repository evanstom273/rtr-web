import { useEffect, useRef, useState } from 'react';
import type { MatchEngine } from '../../engine';
import { Dock, type Tab } from '../match/Dock';
import { Hud } from '../match/Hud';
import { Log } from '../match/Log';
import { WrestlerCard } from '../match/WrestlerCard';
import { Flash } from '../overlays/Flash';
import { KickoutHold } from '../overlays/KickoutHold';
import { RefCount } from '../overlays/RefCount';
import { ReversalMeter } from '../overlays/ReversalMeter';
import { SubmissionMash } from '../overlays/SubmissionMash';
import { useEngine } from '../useEngine';

export function Match({ engine, onOver }: { engine: MatchEngine; onOver: () => void }) {
  const version = useEngine(engine);
  const S = engine.state, p = S.pending, v = S.view;
  const [tab, setTab] = useState<Tab>('moves');
  const [flash, setFlash] = useState<{ id: number; text: string } | null>(null);
  const pulse = useRef(0);
  const seenEvent = useRef(0);

  // Engine events: big-word flashes and crowd pulses.
  useEffect(() => {
    for (const ev of S.events) {
      if (ev.id <= seenEvent.current) continue;
      seenEvent.current = ev.id;
      if (ev.type === 'flash') setFlash({ id: ev.id, text: ev.text });
      else pulse.current = Math.min(1, pulse.current + ev.amount / 25);
    }
  }, [S, version]);

  useEffect(() => {
    if (p.kind === 'over') onOver();
  }, [p, onOver]);

  return (
    <>
      <section id="match">
        <Hud engine={engine} pulse={pulse} />
        <WrestlerCard w={v.sides.you} active={v.ctrl === 'you'} />
        <WrestlerCard w={v.sides.them} active={v.ctrl === 'them'} />
        <Log entries={S.log} />
        <Dock engine={engine} tab={tab} onTab={setTab} />
      </section>
      {p.kind === 'meter' && <ReversalMeter key={p.meter.id} engine={engine} meter={p.meter} />}
      {p.kind === 'kickout' && <KickoutHold key={p.kickout.id} engine={engine} spec={p.kickout} />}
      {p.kind === 'refCount' && <RefCount key={p.id} engine={engine} count={p.count} />}
      {p.kind === 'sub' && <SubmissionMash key={p.sub.id} engine={engine} spec={p.sub} />}
      {flash && <Flash key={flash.id} text={flash.text} />}
    </>
  );
}
