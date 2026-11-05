import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BySide, MatchEngine } from '../../engine';
import { buzz, reduceMotion } from '../format';
import { Dock } from '../match/Dock';
import { Log } from '../match/Log';
import { MoveWheel } from '../match/MoveWheel';
import { RingView } from '../match/RingView';
import { SetupSheet } from '../match/SetupSheet';
import { SpecialsSheet } from '../match/SpecialsSheet';
import { WrestlerCard } from '../match/WrestlerCard';
import { Flash } from '../overlays/Flash';
import { KickoutHold } from '../overlays/KickoutHold';
import { RefCount } from '../overlays/RefCount';
import { Resiliency } from '../overlays/Resiliency';
import { ContestCard } from '../overlays/ContestCard';
import { SubChoice } from '../overlays/SubChoice';
import { DefendChoice } from '../overlays/DefendChoice';
import { SubmissionTug } from '../overlays/SubmissionTug';
import { PinChoice } from '../overlays/PinChoice';
import { SigConvert } from '../overlays/SigConvert';
import { RefTen, TenCount } from '../overlays/TenCount';
import { useEngine } from '../useEngine';
import { useMedia } from '../useMedia';
import { useBackLayer } from '../backStack';
import { useSkin } from '../skin';
import { BroadcastMatch, BuildingMatch, PaperMatch, tonesOf, type MatchSlots } from '../skins/MatchLayouts';
import { ExtraActions, FieldStrip, RoyalBar, SavePrompt, Spectate, spectating, TargetChips, useAutoApply, ZoneRing } from '../match/Field';

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

type Impact = 'light' | 'medium' | 'heavy';
const hpTotal = (hp: Record<string, number>) => Object.values(hp).reduce((a, b) => a + b, 0);

export function Match({ engine, onOver }: { engine: MatchEngine; onOver: () => void }) {
  const [fast, setFast] = useState(false);
  const watching = spectating(engine.state);
  const version = useEngine(engine, fast ? 4 : watching ? 2 : 1);
  const S = engine.state, p = S.pending, v = S.view;
  const multi = S.order.length > 2, pk = engine.pk, opp = engine.opp;
  useAutoApply(engine, fast);
  const wide = useMedia('(min-width: 700px)');
  const skin = useSkin();
  const vw = useViewportWidth();
  const bigW = Math.min(vw - 16, 480);
  const [sheet, setSheet] = useState<'none' | 'moves' | 'setup' | 'specials-you' | 'specials-them'>('none');
  const [flash, setFlash] = useState<{ id: number; text: string; strong: boolean } | null>(null);
  const [jolt, setJolt] = useState<{ n: number; level: Impact }>({ n: 0, level: 'light' });
  const [pinned, setPinned] = useState(false);
  const pulse = useRef(0);
  const seenEvent = useRef(0);
  const allHp = () => S.order.reduce((t, k) => t + hpTotal(v.sides[k]?.hp ?? {}), 0);
  const lastHp = useRef(allHp());
  const tones: BySide<string> = tonesOf(S);

  // Engine events: big-word flashes, crowd pulses. Hits shake the screen (and the phone) by how much
  // they took off: a jab nudges it, a piledriver rattles it.
  useEffect(() => {
    let hit = false, strong = false;
    for (const ev of S.events) {
      if (ev.id <= seenEvent.current) continue;
      seenEvent.current = ev.id;
      if (ev.type === 'flash') {
        setFlash({ id: ev.id, text: ev.text, strong: !!ev.strong });
        if (ev.strong) strong = true;
      } else if (ev.type === 'heatSpike') pulse.current = Math.min(1, pulse.current + ev.amount / 25);
      else if (ev.beat === 'crash') hit = strong = true;
      else if (ev.beat === 'move_landed') hit = true;
    }
    const hp = allHp();
    const dmg = Math.max(0, lastHp.current - hp);
    lastHp.current = hp;
    if (!hit && !strong && dmg < 1) return;
    const level: Impact = strong || dmg >= 14 ? 'heavy' : dmg >= 6 ? 'medium' : 'light';
    buzz(level === 'heavy' ? [30, 40, 60] : level === 'medium' ? 28 : 12);
    if (!reduceMotion()) setJolt((j) => ({ n: j.n + 1, level }));
  }, [S, version, v]);
  const pop = pinned;

  useEffect(() => {
    if (p.kind === 'over') onOver();
    // The move wheel and setup page only make sense on your turn; specials can stay open.
    if (p.kind !== 'awaitPlayer') setSheet((x) => (x === 'moves' || x === 'setup' ? 'none' : x));
  }, [p, onOver]);

  const close = useCallback(() => setSheet('none'), []);
  // Android back closes whichever sheet is open.
  useBackLayer(sheet !== 'none', close);
  const joltCls = jolt.n ? ` jolt-${jolt.level}${jolt.n % 2}` : '';
  const ringBusy = p.kind === 'defend' || p.kind === 'contest' || p.kind === 'contestRoll' || p.kind === 'pinChoice' || p.kind === 'sigConvert' || p.kind === 'subChoice' || p.kind === 'kickout' || p.kind === 'refCount' || p.kind === 'sub' || p.kind === 'tenCount' || p.kind === 'refTen';

  // Paper keeps the ring as a tap-to-pop thumbnail on phones; broadcast and the building put it centre stage.
  const ring = multi ? (
    <div id="ringpanel">
      <RoyalBar engine={engine} />
      <ZoneRing engine={engine} />
    </div>
  ) : wide || skin !== 'paper' ? (
    <div id="ringpanel">
      <RingView engine={engine} version={version} variant="panel" />
    </div>
  ) : (
    <button className={`ringthumb${pop ? ' pop' : ''}${ringBusy ? ' busy' : ''}`}
      style={{ '--thumb-w': `${THUMB_W}px`, '--big-w': `${bigW}px`, '--thumb-s': THUMB_W / bigW } as CSSProperties} onClick={() => setPinned(!pop)}
      aria-label={pop ? 'Shrink ring view' : 'Expand ring view'}>
      <RingView engine={engine} version={version} variant={pop ? 'panel' : 'thumb'} />
    </button>
  );
  const meCard = <WrestlerCard w={S.sides[pk]!.w} v={v.sides[pk] ?? v.sides.you} active={v.control === pk} onSpecials={() => setSheet('specials-you')} />;
  const slots: MatchSlots = {
    engine, S, wide, pulse, ring, left: pk, right: opp,
    // More than two people: on a phone, everyone else gets a strip of their own above the ring; wider, it sits over your card.
    you: multi && wide ? <div className="m-mecol"><FieldStrip engine={engine} />{meCard}</div> : meCard,
    ...(multi && !wide ? { field: <FieldStrip engine={engine} /> } : {}),
    them: <WrestlerCard w={S.sides[opp]!.w} v={v.sides[opp] ?? v.sides.them} active={v.control === opp} focus={engine.me.targetFocus} onPick={(part) => engine.setFocus(part)}
      onSpecials={() => setSheet('specials-them')} />,
    log: <Log entries={S.log} tones={tones} />,
    dock: watching ? <Spectate engine={engine} fast={fast} setFast={setFast} />
      : <Dock engine={engine} onMoves={() => setSheet('moves')} onSetup={() => setSheet('setup')} extra={<><TargetChips engine={engine} /><ExtraActions engine={engine} /></>} />,
  };
  const Layout = skin === 'paper' ? PaperMatch : skin === 'broadcast' ? BroadcastMatch : BuildingMatch;

  return (
    <>
      <section id="match" className={`m-${skin} ${wide ? 'wide' : 'narrow'}${multi ? ' multi' : ''}${joltCls}`}>
        <Layout {...slots} />
      </section>
      {sheet === 'moves' && p.kind === 'awaitPlayer' && <MoveWheel engine={engine} onClose={close} />}
      {sheet === 'setup' && p.kind === 'awaitPlayer' && <SetupSheet engine={engine} onClose={close} />}
      {(sheet === 'specials-you' || sheet === 'specials-them') && (
        <SpecialsSheet engine={engine} initial={sheet === 'specials-you' ? pk : opp} onClose={close} />
      )}
      {p.kind === 'defend' && <DefendChoice key={p.spec.id} engine={engine} spec={p.spec} />}
      {(p.kind === 'contest' || p.kind === 'contestRoll') && (p.spec.attacker === pk || p.spec.defender === pk) && S.player && <ContestCard key={p.spec.id} engine={engine} />}
      {p.kind === 'save' && <SavePrompt key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'kickout' && <KickoutHold key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'refCount' && <RefCount key={p.id} engine={engine} kickoutAt={p.kickoutAt} pinner={p.pinner} save={p.save} />}
      {p.kind === 'sub' && <SubmissionTug key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'subChoice' && <SubChoice key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'pinChoice' && <PinChoice key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'sigConvert' && <SigConvert key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'tenCount' && <TenCount key={p.spec.id} engine={engine} spec={p.spec} />}
      {p.kind === 'refTen' && <RefTen key={p.id} engine={engine} beatenAt={p.beatenAt} />}
      {p.kind === 'resiliency' && <Resiliency key={p.id} engine={engine} threat={p.threat} />}
      {flash && <Flash key={flash.id} text={flash.text} strong={flash.strong} />}
    </>
  );
}
