// The match screen with more than two people (match overhaul, stage 7), from the approved mock-ups: the
// field strip, who you're going after, the new actions, the save prompt, the ring in zones, the Rumble's
// bar, and watching once you're out (or before you're in).
import { useEffect } from 'react';
import {
  fighting, fmtClock, hasEntrants, ironMen, isRoyal, nextEntrant, staminaPercent, tagRules, timedEntries, zoneOf,
  type MatchEngine, type MatchState, type SaveSpec, type SideKey, type ZoneId,
} from '../../engine';
import { buzz } from '../format';
import './field.css';

const short = (S: MatchState, k: SideKey) => S.sides[k]!.w.name.split(' ').slice(-1)[0]!.toUpperCase();
export const TEAM_TONE = ['var(--you)', 'var(--them)', 'var(--gold)', 'var(--good)'];
const tone = (team: number) => TEAM_TONE[team % TEAM_TONE.length]!;
const DOWN = new Set(['GROUNDED', 'SEATED', 'KNEELING']);

/** One line on where someone is and how they are. */
export function statusOf(S: MatchState, k: SideKey): { text: string; cls: '' | 'legal' | 'down' | 'out' | 'pod' } {
  const s = S.sides[k]!, e = S.entries?.[k];
  if (s.out === 'eliminated') {
    const el = S.elims.find((x) => x.k === k);
    return { text: el?.by ? `Out · by ${short(S, el.by)}` : 'Out', cls: 'out' };
  }
  if (s.out === 'pod') return { text: 'In a pod', cls: 'pod' };
  if (s.out === 'waiting') return { text: e ? `#${e.n} · to come` : 'To come', cls: 'pod' };
  if (s.out === 'apron') return { text: s.away ? 'Knocked off the apron' : 'On the apron', cls: '' };
  if (s.perch === 'roof') return { text: 'On the cell roof', cls: 'legal' };
  if (s.perch === 'cables') return { text: 'On the cables', cls: 'legal' };
  if (isRoyal(S) && s.state.area === 'APRON') return { text: 'Hanging on!', cls: 'down' };
  const where = s.state.area === 'IN_RING' || s.state.area === 'CORNER' || s.state.area === 'ROPES' ? '' : ' · outside';
  if (DOWN.has(s.state.position)) return { text: `Down${where}`, cls: 'down' };
  const tag = tagRules(S) && s.legal ? 'Legal' : e?.inAt != null ? `#${e.n} · ${fmtClock(S.t - e.inAt)}` : 'Fighting';
  return { text: tag + where, cls: tagRules(S) && s.legal ? 'legal' : '' };
}

/** Everyone but you and who you're after, in small cards: tap one to go after them. */
export function FieldStrip({ engine }: { engine: MatchEngine }) {
  const S = engine.state, pk = engine.pk, opp = engine.opp;
  const others = S.order.filter((k) => k !== pk && k !== opp);
  if (!others.length) return null;
  const canPick = new Set(engine.targets().map((t) => t.k));
  const groups: [string, SideKey[]][] = isRoyal(S) || hasEntrants(S)
    ? [
      ['In the ring', others.filter((k) => fighting(S).includes(k))],
      ['Still to come', others.filter((k) => S.sides[k]!.out === 'waiting' || S.sides[k]!.out === 'pod')],
      ['Eliminated', others.filter((k) => S.sides[k]!.out === 'eliminated').reverse()],
    ]
    : [[tagRules(S) ? 'Everyone else' : 'Everyone else', others]];
  return (
    <>
      {groups.filter(([, ks]) => ks.length).map(([title, ks]) => (
        <div className="fs" key={title}>
          <span className="fs-h">{title}{ks.length > 3 ? ` · ${ks.length}` : ''}</span>
          <div className="fs-row">
            {ks.map((k) => {
              const s = S.sides[k]!, st = statusOf(S, k);
              const pick = canPick.has(k);
              return (
                <button key={k} className={`fs-card t${s.team % 4}${st.cls ? ` ${st.cls}` : ''}${pick ? ' pick' : ''}`} disabled={!pick}
                  onClick={() => { buzz(8); engine.setTarget(k); }} title={pick ? `Go after ${s.w.name}` : s.w.name}>
                  <b>{short(S, k)}</b>
                  <span>{st.text}</span>
                  {st.cls !== 'out' && st.cls !== 'pod' && <i className="fs-sta"><i style={{ width: `${staminaPercent(s)}%` }} /></i>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/** Who you're going after (more than one to choose from). */
export function TargetChips({ engine }: { engine: MatchEngine }) {
  const S = engine.state, list = engine.targets();
  if (list.length < 2) return null;
  return (
    <div className="mk-targets">
      <span className="mk-tl">Go after</span>
      {list.map((t) => (
        <button key={t.k} className={`mk-tchip${t.current ? ' on' : ''}`} style={{ borderColor: tone(S.sides[t.k]!.team) }}
          onClick={() => { buzz(8); engine.setTarget(t.k); }} aria-pressed={t.current}>
          {short(S, t.k)}
          {t.distance > 1 && <span className="mk-far"> · far</span>}
        </button>
      ))}
    </div>
  );
}

/** The actions that come with the match: tags, over the top, the stipulation's own. */
export function ExtraActions({ engine }: { engine: MatchEngine }) {
  const acts: { label: string; sub?: string; hot?: boolean; go: () => void }[] = [];
  if (engine.isHanging()) acts.push({ label: 'Skin the cat', sub: 'Back in, or fall', hot: true, go: () => engine.skinTheCat() });
  if (engine.canTag()) {
    const peril = (engine.me.peakPeril ?? 0) >= 5;
    acts.push({ label: peril ? 'Hot tag' : 'Tag', sub: 'to your partner', hot: peril, go: () => engine.tag() });
  }
  if (engine.canDoubleTeam()) acts.push({ label: 'Double-team', sub: 'in your corner', go: () => engine.doubleTeam() });
  if (engine.canOverTop()) acts.push({ label: 'Over the top', sub: engine.foe.state.area === 'APRON' ? 'knock them off' : 'heave them over', hot: true, go: () => engine.overTheTop() });
  for (const g of engine.gimmicks()) acts.push({ label: g.title, hot: true, go: () => engine.doGimmick(g.id) });
  if (!acts.length) return null;
  return (
    <div className="actions mk-acts" style={{ gridTemplateColumns: `repeat(${Math.min(acts.length, 3)}, minmax(0,1fr))` }}>
      {acts.map((a) => (
        <button key={a.label} className={`act${a.hot ? ' mk-hot' : ''}`} onClick={() => { buzz([10, 20, 10]); a.go(); }}>
          {a.label}
          {a.sub && <span className="pin-odds">{a.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** Someone else's pin (or hold) could end it: break it up, steal it, or leave it. */
export function SavePrompt({ engine, spec }: { engine: MatchEngine; spec: SaveSpec }) {
  const S = engine.state, a = short(S, spec.attacker), v = short(S, spec.victim);
  const pick = (c: 'save' | 'steal' | 'leave') => { buzz(c === 'leave' ? 8 : [12, 30, 12]); engine.resolveSavePrompt(c); };
  return (
    <>
      <div className="catch" />
      <div className="sheet mk-prompt" role="dialog" aria-label="Break it up?">
        <div className="inner">
          <span className="mk-kick">{spec.kind === 'pin' ? 'One… two…' : 'They’re locked in'}</span>
          <b className="mk-title">Break it up?</b>
          <div className="mk-body">
            <p>{spec.kind === 'pin' ? `${a} hooks the leg on ${v}.` : `${a} has ${v} in a hold.`} {spec.mustSave ? 'If that counts, you’ve lost without being touched.' : 'It’s not you in there.'}</p>
            <p className="mk-dice">You’ve a {spec.chance}% chance of getting there in time.</p>
          </div>
          <div className="mk-choices">
            <button className="mv special" onClick={() => pick('save')}><span className="mn">Break it up</span><span className="mi">{spec.chance}% to get there</span></button>
            {spec.kind === 'pin' && <button className="mv" onClick={() => pick('steal')}><span className="mn">Steal it</span><span className="mi">{`Throw ${a} off, cover ${v} yourself`}</span></button>}
            <button className="mv" onClick={() => pick('leave')}><span className="mn">Let it go</span><span className="mi">{spec.mustSave ? 'Hope they kick out' : 'Let them do your work'}</span></button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- the ring, in zones ---------- */

/** Where each zone sits on a 360 × 240 board. */
const Z: Record<ZoneId, [number, number]> = {
  ring: [180, 120], corner_nw: [118, 66], corner_ne: [242, 66], corner_se: [242, 174], corner_sw: [118, 174],
  apron_n: [180, 34], apron_s: [180, 206], apron_w: [86, 120], apron_e: [274, 120],
  floor_n: [180, 12], floor_s: [180, 230], floor_w: [52, 120], floor_e: [312, 120],
  ramp: [14, 200], crowd: [344, 40], backstage: [14, 228], roof: [180, 120], scaffold: [180, 96], cables: [180, 104],
};

/** Every wrestler as a marker in their zone: you, who you're after, the legal men, who's down or out. */
export function ZoneRing({ engine }: { engine: MatchEngine }) {
  const S = engine.state, pk = engine.pk, opp = engine.opp;
  const byZone = new Map<ZoneId, SideKey[]>();
  for (const k of S.order) {
    const s = S.sides[k]!;
    if (s.out === 'eliminated' || s.out === 'waiting' || s.out === 'pod') continue;
    const z = zoneOf(s);
    byZone.set(z, [...(byZone.get(z) ?? []), k]);
  }
  const ctl = S.control;
  const st = S.rules.stipulation;
  return (
    <div className="zr-wrap">
      <svg className="ring panel zr" viewBox="0 0 360 240" role="img" aria-label="Who's where">
        <rect className="floor" x="0" y="0" width="360" height="240" />
        <rect className="crowdzone" x="330" y="0" width="30" height="240" />
        <path className="ramp" d="M70 190 L0 182 L0 238 L70 230Z" />
        {(st === 'hell_in_a_cell' || st === 'elimination_chamber' || st === 'wargames') && <rect className="mk-cell" x="34" y="4" width="292" height="232" rx="6" />}
        <rect className="apron" x="72" y="22" width="216" height="196" rx="3" />
        <rect className="mat" x="96" y="44" width="168" height="152" />
        {[0, 5, 10].map((o, i) => <rect key={o} className={`rope r${i}`} x={96 - o * 0.4} y={44 - o * 0.4} width={168 + o * 0.8} height={152 + o * 0.8} />)}
        {tagRules(S) && [0, 1].map((t) => {
          const [x, y] = Z[t === 0 ? 'corner_ne' : 'corner_sw'];
          return <rect key={t} className="mk-tagcnr" x={x - 22} y={y - 18} width="44" height="36" rx="4" style={{ stroke: tone(t) }} />;
        })}
        {st === 'pole' && !S.obj.pole?.taken && <g><line className="mk-pole" x1="264" y1="36" x2="264" y2="70" /><circle className="mk-prize" cx="264" cy="33" r="5" /></g>}
        {st === 'ultimate_x' && <g><line className="mk-pole" x1="118" y1="66" x2="242" y2="174" /><line className="mk-pole" x1="242" y1="66" x2="118" y2="174" /><circle className="mk-prize" cx="180" cy="120" r="6" /></g>}
        {[...byZone].map(([zone, ks]) => ks.map((k, i) => {
          const s = S.sides[k]!, [zx, zy] = Z[zone] ?? [180, 120];
          const n = ks.length, dx = (i - (n - 1) / 2) * Math.min(17, 150 / n), x = zx + dx, y = zy + (n > 3 ? (i % 2) * 14 - 7 : 0) + (s.perch ? -14 : 0);
          const down = DOWN.has(s.state.position);
          return (
            <g key={k} className={`mk${down ? ' down' : ''}${ctl === k ? ' ctl' : ''}`} opacity={s.out === 'apron' ? 0.7 : 1}>
              {k === opp && <circle className="mk-target" cx={x} cy={y} r="13" />}
              {tagRules(S) && s.legal && <circle className="mk-legal" cx={x} cy={y} r="10.5" style={{ stroke: tone(s.team) }} />}
              <circle cx={x} cy={y} r={k === pk ? 8 : 7} style={{ fill: tone(s.team) }} className={k === pk ? 'mk-me' : ''} />
              {n <= 6 && <text className="mk-lab" x={x} y={i % 2 ? y - 12 : y + 19}>{short(S, k).slice(0, 7)}</text>}
            </g>
          );
        }))}
      </svg>
    </div>
  );
}

/** The Rumble's (and the Chamber's, and WarGames') running count, and who's next. */
export function RoyalBar({ engine }: { engine: MatchEngine }) {
  const S = engine.state;
  if (!isRoyal(S) && !hasEntrants(S)) return null;
  const st = S.rules.stipulation;
  const title = st === 'elimination_chamber' ? 'CHAMBER' : st === 'wargames' ? 'WARGAMES' : S.type === 'rumble' ? 'RUMBLE' : S.type === 'gauntlet' ? 'GAUNTLET' : 'BATTLE ROYAL';
  const next = nextEntrant(S);
  const due = timedEntries(S) && S.nextEntry !== undefined ? Math.max(0, S.nextEntry - S.t) : null;
  return (
    <div className="mk-rumbar">
      <b>{title}</b>
      <span>In it {fighting(S).length}</span>
      <span>Out {S.elims.length}</span>
      {next && <span className="mk-next">#{S.entries?.[next]?.n} {due !== null ? `in ${fmtClock(due)}` : 'next'}</span>}
    </div>
  );
}

/** Not in the fight (out, still to come, or just watching): what's going on, and skipping ahead. */
export function Spectate({ engine, fast, setFast }: { engine: MatchEngine; fast: boolean; setFast: (f: boolean) => void }) {
  const S = engine.state, pk = S.player, s = pk ? S.sides[pk] : null;
  const e = pk ? S.entries?.[pk] : undefined;
  const waiting = !!s && (s.out === 'waiting' || s.out === 'pod');
  const out = !!s && s.out === 'eliminated';
  const im = S.entries ? ironMen(S) : null;
  const toEntry = () => engine.fastForward((x) => !x.sides[pk!]!.out || x.over);
  const toEnd = () => engine.fastForward((x) => x.over);
  const line = !pk ? 'Watching.'
    : waiting ? `You’re #${e?.n ?? '?'}. ${S.nextEntry !== undefined ? `Next one in at ${fmtClock(S.nextEntry)}.` : ''}`
    : out ? `You’re out${e?.inAt != null ? ` after ${fmtClock((e.outAt ?? S.t) - e.inAt)}` : ''}${e?.elims ? `, ${e.elims} elimination${e.elims === 1 ? '' : 's'}` : ''}.`
    : '';
  return (
    <div id="dock" className="spectate">
      <div className="dock-head"><span className="chip">{line}</span></div>
      {im?.longest && <p className="mk-note">Iron man: {short(S, im.longest)} · {fmtClock(im.secs)}{im.most ? ` · Most eliminations: ${short(S, im.most)} (${im.elims})` : ''}</p>}
      <div className="mk-fnav">
        <button className={`act${fast ? ' mk-hot' : ''}`} onClick={() => setFast(!fast)}>{fast ? 'Normal speed' : 'Faster'}</button>
        {waiting ? <button className="act mk-hot" onClick={() => { buzz(10); toEntry(); }}>Skip to my entry</button>
          : <button className="act mk-hot" onClick={() => { buzz(10); toEnd(); }}>Skip to the end</button>}
      </div>
    </div>
  );
}

/** True when the player has nothing to do in the fight right now (out, still to come, or watching). */
export const spectating = (S: MatchState): boolean => {
  const pk = S.player;
  if (!pk) return true;
  const o = S.sides[pk]!.out;
  return o === 'eliminated' || o === 'waiting' || o === 'pod';
};

/** A contest between two others: no card, it just plays out in a beat. */
export function useAutoApply(engine: MatchEngine, fast: boolean): void {
  const p = engine.state.pending;
  useEffect(() => {
    if (p.kind !== 'contestRoll') return;
    const S = engine.state, pk = engine.pk;
    if (S.player && (p.spec.attacker === pk || p.spec.defender === pk)) return;
    const id = window.setTimeout(() => engine.applyContest(), fast ? 120 : 450);
    return () => window.clearTimeout(id);
  }, [engine, p, fast]);
}

