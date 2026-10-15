import { useCallback, useEffect, useRef, useState } from 'react';
import { interactions as ix, type MatchEngine, type SubOutcome, type SubSpec } from '../../engine';
import { buzz } from '../format';
import { Countdown } from './Countdown';
import { useActionKey, useLeadIn } from './useLeadIn';

const SHORT: readonly string[] = ['3', '2', '1'];

/** Submission tug-of-war (Godot submission_tug_interaction). 100 = tap, 0 = escape. */
export function SubmissionTug({ engine, spec }: { engine: MatchEngine; spec: SubSpec }) {
  const cd = useLeadIn(SHORT, 0.4, 0.28);
  const live = cd === null;
  const S = engine.state;
  const marker = useRef<HTMLDivElement>(null);
  const st = useRef({ marker: 50, taps: [] as number[], done: false });
  const [out, setOut] = useState<SubOutcome | null>(null);
  const [push, setPush] = useState(0);
  const attacking = spec.playerDirection > 0;

  const end = useCallback((o: SubOutcome) => {
    if (st.current.done) return;
    st.current.done = true;
    setOut(o);
    buzz(o === 'TAP_OUT' ? [40, 60, 120] : [12, 40, 12]);
    window.setTimeout(() => engine.resolveSub(o), 550);
  }, [engine]);

  useEffect(() => {
    if (!live) return;
    const s = st.current;
    let last = performance.now(), pulse = 0, second = 0, t = 0, winStart = 0, winMin = s.marker, winMax = s.marker, raf = 0;
    const frame = (now: number) => {
      if (s.done) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt;
      pulse += dt;
      while (pulse >= ix.TUG_AI_PULSE_SECONDS) {
        pulse -= ix.TUG_AI_PULSE_SECONDS;
        s.marker += ix.tugAiPulse(spec.playerDirection, spec.aiScore, spec.playerScore, spec.speedMultiplier);
      }
      s.marker = Math.max(0, Math.min(100, s.marker));
      second += dt;
      if (second >= 1) {
        second -= 1;
        engine.subSecond(s.marker);
      }
      if (marker.current) marker.current.style.left = s.marker + '%';
      const o = ix.tugOutcome(s.marker, spec.tapThreshold, spec.escapeThreshold);
      if (o) return end(o);
      winMin = Math.min(winMin, s.marker);
      winMax = Math.max(winMax, s.marker);
      if (t - winStart >= ix.TUG_STALL_WINDOW_SECONDS) {
        if (t >= ix.TUG_STALL_FAILSAFE_SECONDS && winMax - winMin < ix.TUG_STALL_MOVEMENT) return end('BOTCH_OR_SCRAMBLE');
        winStart = t;
        winMin = winMax = s.marker;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, spec, engine, end]);

  const tap = useCallback(() => {
    const s = st.current;
    if (!live || s.done) return;
    const now = performance.now();
    s.taps = s.taps.filter((x) => now - x < 1000);
    if (s.taps.length >= ix.TUG_MAX_TAPS_PER_SECOND) return;
    s.taps.push(now);
    s.marker += spec.playerDirection * ix.tugTapImpulse(spec.playerScore, spec.speedMultiplier);
    setPush((n) => n + 1);
    buzz(6);
  }, [live, spec]);
  useActionKey(tap);

  const verdict = out === 'TAP_OUT' ? (attacking ? 'TAPS OUT!' : 'YOU TAP…') : out === 'SUBMISSION_ESCAPE' ? (attacking ? 'ESCAPED' : 'ESCAPED!') : out ? 'SCRAMBLE' : '';
  return (
    <div className={`ov sub ${attacking ? 'off' : 'def'}${out ? ' done' : ''}`}>
      <div className="inner">
        <div className={`mt-kicker ${attacking ? 'off' : 'def'}`}>
          {attacking ? `You lock in ${S.them.w.name}` : `${S.them.w.name} has you locked in`} · {spec.partLabel}
        </div>
        <div className="sub-title">{spec.moveName}</div>
        <div className="pin-sub">{attacking ? 'Mash to drag the marker into TAP.' : 'Mash to drag the marker into ESCAPE.'}</div>
        <div className="track tug">
          <div className="zone esc" style={{ width: spec.escapeThreshold + '%' }}>
            <span>Escape</span>
          </div>
          <div className="zone tap" style={{ left: spec.tapThreshold + '%', width: 100 - spec.tapThreshold + '%' }}>
            <span>Tap</span>
          </div>
          <div className="marker" ref={marker} style={{ left: '50%' }} />
          {!live && cd !== null && <Countdown label={cd} />}
          {out && <div className="verdict sm">{verdict}</div>}
        </div>
        <button key={push % 2} className="bigbtn mash" onPointerDown={(e) => { e.preventDefault(); tap(); }} onContextMenu={(e) => e.preventDefault()}>
          {attacking ? 'Crank it →' : '← Fight free'}
        </button>
        <div className="mt-hint">Max {ix.TUG_MAX_TAPS_PER_SECOND} taps a second count · Space works too</div>
      </div>
    </div>
  );
}
