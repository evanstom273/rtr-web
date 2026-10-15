import { useEffect, useMemo, useRef, useState } from 'react';
import { AREA_LABEL, POSITION_LABEL } from '../../data/commentary';
import type { MatchEngine, RingBeat, SideKey, Snapshot } from '../../engine';
import { nameTone, reduceMotion, shortName } from '../format';
import { APRON, BARRIER, CENTRE, MAT, POSTS, VIEW, facing, newMemory, placePair, type Pt } from './ringLayout';

interface Fx {
  id: number;
  beat: RingBeat;
  at: Pt;
  from?: Pt;
  label?: string;
  tone: string;
}

const FX_MS: Partial<Record<RingBeat, number>> = {
  move_started: 1100, move_landed: 750, reversal: 850, crash: 900, setup: 700, kickout: 700, escape: 700,
};

const other = (k: SideKey): SideKey => (k === 'you' ? 'them' : 'you');
export const snapKey = (s: Snapshot) => `${s.position}|${s.orientation}|${s.area}|${s.motion}`;

function Marker({ k, s, at, face, tone, label, active }: { k: SideKey; s: Snapshot; at: Pt; face: number; tone: string; label: string; active: boolean }) {
  const grounded = s.position === 'GROUNDED';
  const low = s.position === 'SEATED' || s.position === 'KNEELING';
  const scale = grounded ? 'scale(1.45,.6)' : low ? 'scale(.82)' : 'scale(1)';
  const motion = s.motion.toLowerCase().replace('_', '-');
  return (
    <g className={`rmk ${k} ${tone} m-${motion} p-${s.position.toLowerCase()}${active ? ' active' : ''}`} style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
      {active && <circle className="halo" r="19" />}
      {s.motion === 'RUNNING' && (
        <g className="speed" style={{ transform: `rotate(${face + 180}deg)` }}>
          <line x1="14" y1="-5" x2="30" y2="-5" />
          <line x1="16" y1="0" x2="36" y2="0" />
          <line x1="14" y1="5" x2="30" y2="5" />
        </g>
      )}
      {s.motion === 'RISING' && (
        <g className="rise">
          <path d="M-5 -18 0 -23 5 -18" />
          <path d="M-5 -24 0 -29 5 -24" />
        </g>
      )}
      {s.motion === 'ROPE_REBOUND' && <path className="rebound" d="M-14 -16 Q 0 -26 14 -16" />}
      {(s.area === 'TOP_ROPE' || s.position === 'PERCHED') && <circle className="perch" r="16" />}
      {(grounded || low) ? null : <g className="facing" style={{ transform: `rotate(${face}deg)` }}><path d="M13 -4 19 0 13 4Z" /></g>}
      <g className="body" style={{ transform: scale }}>
        {k === 'you' ? <circle r="10" /> : <path d="M0 -11.5 11.5 0 0 11.5 -11.5 0Z" />}
        {grounded && s.orientation === 'FACE_UP' && <circle className="fu" r="3.6" />}
        {grounded && s.orientation === 'FACE_DOWN' && <rect className="fd" x="-6" y="-1.6" width="12" height="3.2" rx="1.2" />}
        {s.position === 'SEATED' && <path className="seat" d="M-9 9 H9" />}
        {s.position === 'KNEELING' && <circle className="kneel" r="13.5" />}
      </g>
      <text className="rlabel" y={k === 'them' ? (grounded ? -11 : -17) : grounded ? 18 : 25}>
        {label}
      </text>
    </g>
  );
}

function Burst({ fx }: { fx: Fx }) {
  const { at, beat } = fx;
  if (beat === 'move_started' && fx.from) {
    const mid = { x: (fx.from.x + at.x) / 2, y: (fx.from.y + at.y) / 2 - 16 };
    return (
      <g className={`fx cue ${fx.tone}`}>
        <line x1={fx.from.x} y1={fx.from.y} x2={at.x} y2={at.y} />
        {fx.label && (
          <text x={mid.x} y={mid.y} className="cue-label">
            {fx.label.toUpperCase()}
          </text>
        )}
      </g>
    );
  }
  const star = 'M0 -18 4 -6 17 -6 6 2 10 15 0 7 -10 15 -6 2 -17 -6 -4 -6Z';
  return (
    <g className={`fx b-${beat.replace('_', '-')} ${fx.tone}`} style={{ transform: `translate(${at.x}px, ${at.y}px)` }}>
      {beat === 'move_landed' && <path className="star" d={star} />}
      {beat === 'crash' && (
        <>
          <path className="star" d={star} />
          <circle className="ring" r="16" />
        </>
      )}
      {beat === 'reversal' && (
        <g className="spin">
          <path d="M-16 0 A16 16 0 0 1 16 0" />
          <path d="M16 0 A16 16 0 0 1 -16 0" />
        </g>
      )}
      {(beat === 'kickout' || beat === 'escape') && <circle className="ring" r="14" />}
      {beat === 'setup' && <circle className="ping" r="12" />}
    </g>
  );
}

/** Top-down ring. variant 'panel' is the permanent big view; 'thumb' is the small HUD version. */
export function RingView({ engine, version, variant }: { engine: MatchEngine; version: number; variant: 'panel' | 'thumb' }) {
  const S = engine.state, v = S.view;
  const mem = useRef(newMemory());
  const you = v.sides.you.state, them = v.sides.them.state;
  const pos = useMemo(() => placePair(you, them, mem.current), [you, them]);
  const tones: Record<SideKey, string> = { you: nameTone(S.you.w), them: nameTone(S.them.w) };
  const [fx, setFx] = useState<Fx[]>([]);
  const seen = useRef(S.events.length ? S.events[S.events.length - 1]!.id : 0);
  const [quake, setQuake] = useState({ n: 0, heavy: false });
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    const add: Fx[] = [];
    let jolt = 0;
    for (const ev of S.events) {
      if (ev.id <= seen.current) continue;
      seen.current = ev.id;
      if (ev.type !== 'ring' || !FX_MS[ev.beat]) continue;
      const actor = ev.actor ?? 'you', target = other(actor), p = posRef.current;
      if (ev.beat === 'move_started') add.push({ id: ev.id, beat: ev.beat, from: p[actor], at: p[target], label: ev.label, tone: tones[actor] });
      else if (ev.beat === 'move_landed') {
        add.push({ id: ev.id, beat: ev.beat, at: p[target], tone: tones[actor] });
        jolt = Math.max(jolt, 1);
      } else if (ev.beat === 'crash') {
        add.push({ id: ev.id, beat: ev.beat, at: p[actor], tone: 'bad' });
        jolt = 2;
      } else add.push({ id: ev.id, beat: ev.beat, at: p[actor], tone: ev.beat === 'reversal' ? 'gold' : tones[actor] });
    }
    if (!add.length) return;
    if (jolt && !reduceMotion()) setQuake((q) => ({ n: q.n + 1, heavy: jolt === 2 }));
    setFx((f) => [...f, ...add]);
    const timers = add.map((a) => window.setTimeout(() => setFx((f) => f.filter((x) => x.id !== a.id)), FX_MS[a.beat] ?? 800));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const p = S.pending;
  const pinning = p.kind === 'kickout' || p.kind === 'refCount' ? (p.kind === 'kickout' ? p.spec.pinner : p.pinner) : null;
  const subbing = p.kind === 'sub' ? p.spec.attacker : null;
  const ctrl = v.control === 'you' || v.control === 'them' ? v.control : null;
  const shakeCls = quake.n ? `${quake.heavy ? 'quake2' : 'quake'} q${quake.n % 2}` : '';
  const rampY = CENTRE.y;
  const posts = Object.values(POSTS);

  return (
    <svg className={`ring ${variant} ${shakeCls}`} viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img"
      aria-label={`${S.you.w.name}: ${POSITION_LABEL[you.position]}, ${AREA_LABEL[you.area]}. ${S.them.w.name}: ${POSITION_LABEL[them.position]}, ${AREA_LABEL[them.area]}.`}>
      <defs>
        <radialGradient id="matGlow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="var(--mat-hi)" />
          <stop offset="100%" stopColor="var(--mat)" />
        </radialGradient>
      </defs>
      <rect className="floor" x="0" y="0" width={VIEW.w} height={VIEW.h} />
      <rect className="crowdzone" x={BARRIER.x + BARRIER.w + 4} y="0" width={VIEW.w - BARRIER.x - BARRIER.w - 4} height={VIEW.h} />
      <path className="ramp" d={`M${APRON.x} ${rampY - 22} L0 ${rampY - 36} L0 ${rampY + 36} L${APRON.x} ${rampY + 22}Z`} />
      {[1, 2, 3, 4].map((i) => (
        <line key={i} className="rampstep" x1={APRON.x - i * 30} y1={rampY - 22 - i * 3.5} x2={APRON.x - i * 30} y2={rampY + 22 + i * 3.5} />
      ))}
      <rect className="curtain" x="0" y={rampY - 40} width="5" height="80" />
      <rect className="barrier" x={BARRIER.x} y={BARRIER.y} width={BARRIER.w} height={BARRIER.h} rx="6" />
      <g className="shakeable">
        <rect className="apron" x={APRON.x} y={APRON.y} width={APRON.w} height={APRON.h} rx="3" />
        <rect className="mat" x={MAT.x} y={MAT.y} width={MAT.w} height={MAT.h} fill="url(#matGlow)" />
        <circle className="matmark" cx={CENTRE.x} cy={CENTRE.y} r="34" />
 {[0, 5, 10].map((o, i) => (
          <rect key={o} className={`rope r${i}`} x={MAT.x - o * 0.4} y={MAT.y - o * 0.4} width={MAT.w + o * 0.8} height={MAT.h + o * 0.8} />
        ))}
        {posts.map((pt, i) => (
          <rect key={i} className="post" x={pt.x - 4.5} y={pt.y - 4.5} width="9" height="9" rx="2" />
        ))}
        {pinning && <circle className="pinring" cx={pos[other(pinning)].x} cy={pos[other(pinning)].y} r="26" />}
        {subbing && <circle className="subring" cx={(pos.you.x + pos.them.x) / 2} cy={(pos.you.y + pos.them.y) / 2} r="30" />}
        {v.count !== null && (
          <text className="refcount" x={CENTRE.x} y={CENTRE.y + 14}>
            {v.count}
          </text>
        )}
      </g>
      {(['them', 'you'] as const).map((k) => (
        <Marker key={k} k={k} s={k === 'you' ? you : them} at={pos[k]} face={facing(pos[k], pos[other(k)], k === 'you' ? you : them)}
          tone={tones[k]} label={variant === 'thumb' ? '' : shortName(S[k].w)} active={ctrl === k} />
      ))}
      {fx.map((f) => (
        <Burst key={f.id} fx={f} />
      ))}
    </svg>
  );
}
