import { useEffect, useRef, type MutableRefObject } from 'react';
import { clamp, type MatchEngine } from '../../engine';
import { reduceMotion } from '../format';

interface Props {
  engine: MatchEngine;
  /** Shared with the match screen: heat spikes bump it, the canvas decays it. */
  pulse: MutableRefObject<number>;
}

/** The crowd-noise waveform across the top of the HUD. Reads live heat every frame. */
export function CrowdCanvas({ engine, pulse }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, cx = cv?.getContext('2d');
    if (!cv || !cx) return;
    const reduce = reduceMotion();
    const cs = getComputedStyle(document.documentElement);
    const CC = { crowd: cs.getPropertyValue('--crowd').trim(), gold: cs.getPropertyValue('--gold').trim(), line: cs.getPropertyValue('--line').trim() };
    let raf = 0;
    const loop = (ts: number) => {
      const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      pulse.current = Math.max(0, pulse.current - 0.012);
      const amp = engine.state.heat / 100, t = reduce ? 0 : ts * 0.001, n = Math.max(24, Math.floor(W / 6)), bw = W / n, boost = 1 + pulse.current * 0.5;
      for (let i = 0; i < n; i++) {
        const a = Math.sin(i * 0.55 + t * (2 + amp * 5)) * 0.5 + 0.5, b = Math.sin(i * 1.7 - t * (3 + amp * 4)) * 0.5 + 0.5;
        const v = clamp((0.1 + amp * 0.9 * (0.4 + 0.6 * a * b + 0.12 * Math.sin(i * 0.13 + t))) * boost, 0.06, 1), h = v * H;
        cx.fillStyle = i / n < amp ? (amp > 0.82 ? CC.gold : CC.crowd) : CC.line;
        cx.fillRect(i * bw + 1, (H - h) / 2, Math.max(1, bw - 2), h);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine, pulse]);
  return <canvas id="crowd" ref={ref} aria-hidden="true" />;
}
