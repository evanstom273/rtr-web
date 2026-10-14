import { useEffect, useRef, useState } from 'react';
import { clamp, interactions as ix, type MatchEngine, type MeterSpec } from '../../engine';

/** Delay between the hit/miss flash and handing the result to the engine. */
const RESULT_MS = 360;

function subtitle(m: MeterSpec, themName: string): string {
  if (m.mode === 'off') return m.target.kind === 'move' ? 'Stop it in the gold to land it' : 'Stop it in the gold';
  return m.target.kind === 'move' ? `Stop it in the gold to reverse ${themName}` : `Stop it in the gold to block ${themName}`;
}

/** The land-it / reverse-it timing bar. Port of runMeter(). */
export function ReversalMeter({ engine, meter }: { engine: MatchEngine; meter: MeterSpec }) {
  const [result, setResult] = useState<'' | 'hit' | 'miss'>('');
  const marker = useRef<HTMLDivElement>(null);
  const tap = useRef<() => void>(() => {});

  useEffect(() => {
    const t0 = performance.now();
    let pos = meter.dir > 0 ? 0 : 100, done = false, raf = 0, to = 0;
    if (marker.current) marker.current.style.left = pos + '%';
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      setResult(ok ? 'hit' : 'miss');
      to = window.setTimeout(() => engine.resolveMeter(ok), RESULT_MS);
    };
    const frame = (now: number) => {
      if (done) return;
      const f = (now - t0) / meter.dur;
      pos = ix.meterPos(meter.dir, f);
      if (marker.current) marker.current.style.left = clamp(pos, 0, 100) + '%';
      if (f >= 1) return finish(false);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    tap.current = () => {
      if (performance.now() - t0 < ix.METER_GRACE_MS) return;
      finish(ix.inGold(pos, meter.left, meter.width));
    };
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
  }, [engine, meter]);

  return (
    <div
      id="meter"
      className={`sheet ${meter.mode}${result ? ' ' + result : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        tap.current();
      }}
    >
      <div className="inner">
        <div className="mt-kicker">{meter.mode === 'off' ? 'Land it' : 'Reverse it'}</div>
        <div className="mt-title">{meter.title}</div>
        <div className="mt-sub">{subtitle(meter, engine.state.them.name)}</div>
        <div className="track">
          <div className="gold" style={{ left: meter.left + '%', width: meter.width + '%' }} />
          <div className="marker" ref={marker} />
        </div>
        <div className="mt-hint">Tap anywhere on this panel · Space</div>
      </div>
    </div>
  );
}
