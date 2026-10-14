import { useEffect, useRef } from 'react';
import { interactions as ix, type MatchEngine, type SubOutcome, type SubSpec } from '../../engine';

const END_MS = 450;

/** Locked in a hold (either way round): mash to push the bar. Port of runSub(). */
export function SubmissionMash({ engine, spec }: { engine: MatchEngine; spec: SubSpec }) {
  const marker = useRef<HTMLDivElement>(null);
  const tap = useRef<() => void>(() => {});
  const S = engine.state;

  useEffect(() => {
    const { role, rate } = spec;
    let pos = 50, peak = 50, taps: number[] = [], last = performance.now(), acc = 0, done = false, raf = 0, to = 0;
    const t0 = last;
    if (marker.current) marker.current.style.left = '50%';
    const end = (res: SubOutcome) => {
      if (done) return;
      done = true;
      to = window.setTimeout(() => engine.resolveSub(res, peak), END_MS);
    };
    tap.current = () => {
      if (done) return;
      const now = performance.now();
      taps = taps.filter((t) => now - t < 1000);
      if (taps.length >= ix.SUB_MAX_TAPS_PER_SEC) return;
      taps.push(now);
      pos += ix.subTapDelta(role);
    };
    const frame = (now: number) => {
      if (done) return;
      const dt = (now - last) / 1000;
      last = now;
      const e = (now - t0) / 1000;
      pos += ix.subDrift(role, rate, dt, Math.random());
      peak = Math.max(peak, pos);
      acc += dt;
      if (acc >= 1) {
        acc = 0;
        engine.subSecond(pos);
      }
      if (marker.current) marker.current.style.left = ix.subMarker(pos) + '%';
      const res = ix.subOutcome(pos, e);
      if (res) return end(res);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!e.repeat) tap.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(to);
      document.removeEventListener('keydown', onKey);
    };
  }, [engine, spec]);

  const attack = spec.role === 'attack';
  return (
    <div id="subOv" className="ov">
      <div className="inner">
        <div className="mt-kicker eyebrow">{attack ? `You've got ${S[spec.defender].name} locked in` : `${S.them.name} has you locked in`}</div>
        <div className="sub-title">{spec.move.name}</div>
        <div className="pin-sub">{attack ? 'Mash to push the bar to TAP.' : 'Mash to push the bar to ESCAPE.'}</div>
        <div className="track tug">
          <span>Escape</span>
          <div className="marker" ref={marker} />
          <span>Tap</span>
        </div>
        <button
          className="bigbtn"
          id="mashBtn"
          onPointerDown={(e) => {
            e.preventDefault();
            tap.current();
          }}
        >
          Mash
        </button>
      </div>
    </div>
  );
}
