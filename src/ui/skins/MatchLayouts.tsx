import type { MutableRefObject, ReactNode } from 'react';
import { fmtClock, heatWord, type MatchState, type SideKey } from '../../engine';
import { CrowdCanvas } from '../match/CrowdCanvas';
import { LiveStars, StipRow } from '../match/HudParts';
import { Segment } from '../match/Log';
import type { MatchEngine } from '../../engine';
import { nameTone } from '../format';
import { moment, surname } from '../model';

/** The pieces every skin lays out. The match screen builds them once; skins only arrange and dress them. */
export interface MatchSlots {
  engine: MatchEngine;
  S: MatchState;
  wide: boolean;
  pulse: MutableRefObject<number>;
  you: ReactNode;
  them: ReactNode;
  /** Whose cards those are: the player's side and whoever they're going after (singles: you and them). */
  left?: SideKey;
  right?: SideKey;
  /** The ring: a big panel, or (paper on phones) the tap-to-pop thumbnail. */
  ring: ReactNode;
  log: ReactNode;
  dock: ReactNode;
}

const pct = (n: number, d: number) => `${d ? Math.max(0, Math.min(100, (n / d) * 100)) : 0}%`;

/** Name colours for everyone in the match. */
export function tonesOf(S: MatchState) {
  return Object.fromEntries(S.order.map((k) => [k, nameTone(S.sides[k]!.w)])) as { you: string; them: string } & Record<string, string>;
}

/** The headline moment, in whatever dress the skin gives `.moment`. */
function Moment({ S }: { S: MatchState }) {
  const m = moment(S);
  const who = m.side ? surname(S.sides[m.side]!.w) : null;
  return (
    <div className={`moment${m.side ? ` by-${m.side}` : ''}`} key={m.id} aria-live="polite">
      <span className="mo-kick">
        {who ?? 'The match'}
        {m.line ? ` · ${fmtClock(m.line.t)}` : ''}
      </span>
      <span className={`mo-big${m.big.length > 22 ? ' long' : ''}`}>{m.big}</span>
      {m.line && m.line.segs.some((s) => s.v !== m.big) && (
        <span className="mo-deck">
          {m.line.segs.map((s, i) => (
            <Segment key={i} s={s} tones={tonesOf(S)} />
          ))}
        </span>
      )}
    </div>
  );
}

const countOut = (S: MatchState) => (S.view.count !== null ? <span className="m-count">Count {S.view.count}</span> : null);

// ---------------------------------------------------------------- Broadcast

export function BroadcastMatch(p: MatchSlots) {
  const { S } = p, v = S.view, L = p.left ?? 'you', R = p.right ?? 'them', you = v.sides[L] ?? v.sides.you, them = v.sides[R] ?? v.sides.them;
  return (
    <>
      <header className="bc-top">
        <div className="bc-bug">
          <div className="bc-side you">
            <i className="bc-chip" />
            <span className="bc-nm">
              {surname(S.sides[L]!.w)}
              {v.control === L && <b className="bc-ctl" title="In control" />}
            </span>
            <span className="bc-sta"><i style={{ width: pct(you.stamina, you.maxStamina) }} /></span>
          </div>
          <span className="bc-clock">{fmtClock(v.t)}</span>
          <div className="bc-side them">
            <i className="bc-chip" />
            <span className="bc-nm">
              {v.control === R && <b className="bc-ctl" title="In control" />}
              {surname(S.sides[R]!.w)}
            </span>
            <span className="bc-sta"><i style={{ width: pct(them.stamina, them.maxStamina) }} /></span>
          </div>
        </div>
        <div className="bc-tab">
          <span>{v.phase}</span>
          <LiveStars live={v.live} />
          <span>Crowd {Math.round(v.heat)}</span>
          {countOut(S)}
        </div>
        <StipRow S={S} />
        <CrowdCanvas engine={p.engine} pulse={p.pulse} />
      </header>
      <div className="bc-stage">
        {p.ring}
        <Moment S={S} />
      </div>
      {p.you}
      {p.them}
      {p.log}
      {p.dock}
    </>
  );
}

// ---------------------------------------------------------------- Ringside paper

export function PaperMatch(p: MatchSlots) {
  const { S } = p, v = S.view;
  return (
    <>
      <header className="pp-top">
        <div className="pp-dateline">
          <span>{S.event} · {S.venue}{S.rules.title && S.titleName ? ` · ${S.titleName}` : ''}</span>
          <span className="pp-clock">{fmtClock(v.t)}</span>
        </div>
        <div className="pp-mast">The Ringside Report</div>
        <div className="pp-strip">
          <span>{v.phase}</span>
          {countOut(S)}
          <span className="pp-heat">Crowd {Math.round(v.heat)}, {heatWord(v.heat).toLowerCase()}</span>
        </div>
        <StipRow S={S} />
      </header>
      <Moment S={S} />
      {p.you}
      {p.them}
      <div className="pp-cols">
        {p.log}
        <aside className="pp-side">
          <div className="pp-stars">
            <span className="pp-lab">So far</span>
            <LiveStars live={v.live} />
          </div>
          {p.ring}
        </aside>
      </div>
      {p.dock}
    </>
  );
}

// ---------------------------------------------------------------- The building

const LEDS = 20;

export function BuildingMatch(p: MatchSlots) {
  const { S } = p, v = S.view;
  const lit = Math.round((Math.max(0, Math.min(100, v.heat)) / 100) * LEDS);
  return (
    <>
      <header className="bd-led">
        <div className="led-row">
          <span>Crowd {Math.round(v.heat)} · {heatWord(v.heat)}</span>
          <span className="led-clock">{fmtClock(v.t)}</span>
          <LiveStars live={v.live} />
        </div>
        <div className="led-bar" aria-hidden>
          {Array.from({ length: LEDS }, (_, i) => (
            <i key={i} className={i < lit ? (i >= LEDS * 0.75 ? 'on hot' : 'on') : ''} />
          ))}
        </div>
        <div className="led-row sub">
          <span>{v.phase}</span>
          {countOut(S)}
        </div>
        <StipRow S={S} />
      </header>
      <div className="bd-stage">
        {p.ring}
        <Moment S={S} />
      </div>
      {p.you}
      {p.them}
      <div className="bd-desk">
        <span className="desk-lab">
          <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H4zM17 14h3v5h-3zM20 19c0 2-2 3-5 3" />
          </svg>
          At the desk
        </span>
        {p.log}
      </div>
      {p.dock}
    </>
  );
}
