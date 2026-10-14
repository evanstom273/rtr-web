import { useEffect, useRef, useState } from 'react';
import { interactions as ix, type KickoutCount, type KickoutSpec, type MatchEngine } from '../../engine';

/** You're pinned: hold, let go in the gold before three. Port of runKickout(). */
export function KickoutHold({ engine, spec }: { engine: MatchEngine; spec: KickoutSpec }) {
  const [cls, setCls] = useState({ hit: false, shake: false });
  const count = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const ctl = useRef<{ down: () => void; up: () => void }>({ down: () => {}, up: () => {} });

  useEffect(() => {
    const { lo, width: w } = spec;
    const setCount = (t: string) => {
      if (count.current) count.current.textContent = t;
    };
    const setFill = (v: number) => {
      if (fill.current) fill.current.style.width = v + '%';
    };
    let holding = false, locked = false, fv = 0, last = performance.now(), done = false, raf = 0;
    const t0 = last, timers: number[] = [];
    setCount('ONE');
    setFill(0);
    const end = (c: KickoutCount) => {
      if (done) return;
      done = true;
      timers.push(window.setTimeout(() => engine.resolveKickout(c), c ? 650 : 550));
    };
    ctl.current = {
      down: () => {
        if (!locked && !done) holding = true;
      },
      up: () => {
        if (locked) {
          locked = false;
          return;
        }
        if (!holding || done) return;
        holding = false;
        const e = (performance.now() - t0) / 1000;
        if (fv >= lo && fv <= lo + w) {
          setCount('KICKOUT');
          setCls((c) => ({ ...c, hit: true }));
          end(ix.kickoutCountAt(e));
        } else {
          fv = 0;
          setFill(0);
          setCls((c) => ({ ...c, shake: true }));
          timers.push(window.setTimeout(() => setCls((c) => ({ ...c, shake: false })), 260));
        }
      },
    };
    const frame = (now: number) => {
      if (done) return;
      const dt = (now - last) / 1000;
      last = now;
      const e = (now - t0) / 1000;
      setCount(e < 1 ? 'ONE' : e < 2 ? 'TWO' : 'THR—');
      if (holding) {
        fv += dt * ix.KICKOUT_FILL_PER_SEC;
        if (fv >= 100) {
          fv = 0;
          holding = false;
          locked = true;
        }
      }
      setFill(fv);
      if (e >= ix.PIN_SECONDS) {
        setCount('THREE');
        return end(0);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!e.repeat) ctl.current.down();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      ctl.current.up();
    };
    document.addEventListener('keydown', onDown);
    document.addEventListener('keyup', onUp);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      timers.forEach((t) => window.clearTimeout(t));
      document.removeEventListener('keydown', onDown);
      document.removeEventListener('keyup', onUp);
    };
  }, [engine, spec]);

  return (
    <div id="pinOv" className={`ov${cls.hit ? ' hit' : ''}${cls.shake ? ' shake' : ''}`} data-mode="kick">
      <div className="inner">
        <div className="pin-count" ref={count}>
          ONE
        </div>
        <div className="pin-sub">Hold the button, then let go inside the gold. Miss and you can go again.</div>
        <div className="track">
          <div className="gold" style={{ left: spec.lo + '%', width: spec.width + '%' }} />
          <div className="fill" ref={fill} />
        </div>
        <button
          className="bigbtn"
          id="holdBtn"
          onPointerDown={(e) => {
            e.preventDefault();
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            ctl.current.down();
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            ctl.current.up();
          }}
          onPointerCancel={() => ctl.current.up()}
          onContextMenu={(e) => e.preventDefault()}
        >
          Hold · let go in the gold
        </button>
      </div>
    </div>
  );
}
