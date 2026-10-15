import { useCallback, useEffect, useRef, useState } from 'react';
import { interactions as ix, type MatchEngine, type SetupMeterSpec } from '../../engine';
import { buzz } from '../format';
import { Countdown } from './Countdown';
import { useActionKey, useLeadIn } from './useLeadIn';

type Grade = 'clean' | 'near' | 'miss' | 'timeout';

/** One-way control bar for contested setups (Godot control_meter_interaction). */
export function SetupBar({ engine, spec }: { engine: MatchEngine; spec: SetupMeterSpec }) {
  const cd = useLeadIn();
  const live = cd === null;
  const marker = useRef<HTMLDivElement>(null);
  const st = useRef({ pos: spec.dir > 0 ? 0 : 100, done: false });
  const [grade, setGrade] = useState<Grade | null>(null);
  const defend = spec.role === 'defend';

  const finish = useCallback(
    (g: Grade) => {
      if (st.current.done) return;
      st.current.done = true;
      setGrade(g);
      buzz(g === 'clean' ? [10, 30, 18] : 40);
      window.setTimeout(() => engine.resolveSetupMeter(g === 'clean'), 450);
    },
    [engine],
  );

  useEffect(() => {
    if (!live) return;
    const t0 = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      if (st.current.done) return;
      const e = (now - t0) / 1000;
      const pos = ix.barPos(spec.dir, e, spec.crossSeconds);
      st.current.pos = pos;
      if (marker.current) marker.current.style.left = pos + '%';
      if (e >= spec.crossSeconds) return finish('timeout');
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, spec, finish]);

  const press = useCallback(() => {
    if (!live || st.current.done) return;
    const pos = st.current.pos;
    const d = Math.abs(pos - spec.center) - spec.width / 2;
    finish(ix.barHit(pos, spec.center, spec.width) ? 'clean' : d <= 10 ? 'near' : 'miss');
  }, [live, spec, finish]);
  useActionKey(press);

  const verdict =
    grade === 'clean'
      ? defend
        ? 'COUNTERED!'
        : 'IN CONTROL'
      : grade === 'near'
        ? 'SO CLOSE'
        : grade === 'miss'
          ? 'MISSED'
          : grade === 'timeout'
            ? 'TOO LATE'
            : '';
  return (
    <div
      className="catch"
      onPointerDown={(e) => {
        e.preventDefault();
        press();
      }}
    >
      <div className={`sheet bar ${defend ? 'def' : 'off'}${grade ? ` g-${grade}` : ''}`}>
        <div className="inner">
          <div className="mt-kicker">{defend ? 'Counter the setup' : 'Take control'}</div>
          <div className="mt-title">{spec.title}</div>
          <div className="track">
            <div
              className="goldz"
              style={{
                left: spec.center - spec.width / 2 + '%',
                width: spec.width + '%',
              }}
            />
            <div className="marker" ref={marker} style={{ left: (spec.dir > 0 ? 0 : 100) + '%' }} />
            {!live && cd !== null && <Countdown label={cd} />}
            {grade && <div className="verdict sm">{verdict}</div>}
          </div>
          <div className="mt-hint">{spec.dir > 0 ? '→' : '←'} One pass only · tap anywhere or press Space in the gold</div>
        </div>
      </div>
    </div>
  );
}
