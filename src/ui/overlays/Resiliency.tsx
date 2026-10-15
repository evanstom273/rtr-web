import type { MatchEngine } from '../../engine';

export function Resiliency({ engine, threat }: { engine: MatchEngine; threat: 'pinfall' | 'submission' }) {
  return (
    <div className="ov resil-ov">
      <div className="inner">
        <div className="mt-kicker gold">Resiliency</div>
        <div className="mt-title">{threat === 'pinfall' ? 'That was three…' : 'You’re about to tap…'}</div>
        <p className="pin-sub">Burn your one-use Resiliency to survive it. You only get one, and you won’t get it back.</p>
        <div className="ractions center">
          <button className="primary" onClick={() => engine.resolveResiliency(true)}>
            Use it — keep fighting
          </button>
          <button className="ghost" onClick={() => engine.resolveResiliency(false)}>
            Let it go
          </button>
        </div>
      </div>
    </div>
  );
}
