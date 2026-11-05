// Dev-only mock-ups for the match overhaul (stage 0, for Lyra's approval): ?mock=matches&scene=tag|triple|rumble|cell|builder|feed.
// Real skins, real wrestler cards and a real engine state; the new pieces (zones, the field strip, targets, tag, save and
// over-the-top prompts, the Rumble feed, the builder) are drawn here as they'd look. Nothing in it plays.
import { useMemo, useRef, type ReactNode } from 'react';
import { MatchEngine } from '../../engine';
import { WRESTLERS, type Wrestler } from '../../data/rtr';
import { Log } from '../match/Log';
import { WrestlerCard } from '../match/WrestlerCard';
import { useSkin } from '../skin';
import { useMedia } from '../useMedia';
import { BroadcastMatch, BuildingMatch, PaperMatch, type MatchSlots } from '../skins/MatchLayouts';
import { nameTone } from '../format';
import '../match/field.css';

type Scene = 'tag' | 'triple' | 'rumble' | 'cell' | 'builder' | 'feed';

/** A real engine a few exchanges in, so cards and the log have something on them. */
function warm(you: string, them: string, stip: 'standard' | 'steel_cage' = 'standard'): MatchEngine {
  const e = new MatchEngine({ you, them, seed: 7, rules: { stipulation: stip, eventName: 'Mock Night', venueName: 'Leeds, UK' } as never });
  for (let i = 0, turns = 0; i < 400 && e.pending.kind !== 'over'; i++) {
    const k = e.pending.kind;
    if (k === 'awaitPlayer') { if (turns++ >= 7) break; e.autoPlayer(); }
    else if (k === 'continue' || k === 'aiThinking' || k === 'refCount' || k === 'refTen') e.advance();
    else if (k === 'defend') e.defend(e.autoDefence());
    else if (k === 'contest') e.rollContest(e.autoPush());
    else if (k === 'contestRoll') e.applyContest();
    else if (k === 'pinChoice') e.autoPinChoice();
    else if (k === 'sigConvert') e.autoSigConvert();
    else if (k === 'subChoice') e.autoSubChoice();
    else if (k === 'kickout') e.resolveKickout(true, 2);
    else if (k === 'resiliency') e.resolveResiliency(false);
    else break;
  }
  return e;
}

/** Distinct surnames, so the mock reads clearly. */
const pick = (pred: (w: Wrestler) => boolean, n: number): Wrestler[] => {
  const seen = new Set<string>();
  return WRESTLERS.filter((w) => { const s = w.name.split(' ').slice(-1)[0]!; if (!pred(w) || seen.has(s)) return false; seen.add(s); return true; }).slice(0, n);
};
const short = (w: Wrestler) => w.name.split(' ').slice(-1)[0]!.toUpperCase();
const TEAM_TONE = ['var(--you)', 'var(--them)', 'var(--gold)', 'var(--good)'];

// ---------------------------------------------------------------- the ring, in zones

interface Mark { w: Wrestler; zone: string; team: number; legal?: boolean; out?: boolean; down?: boolean; me?: boolean; target?: boolean }
/** Zone centres on a 360×240 board: the ring's centre and corners, the aprons, ringside, the ramp, the crowd. */
const Z: Record<string, [number, number]> = {
  centre: [180, 120], cnrNW: [118, 66], cnrNE: [242, 66], cnrSE: [242, 174], cnrSW: [118, 174],
  apronN: [180, 34], apronS: [180, 206], apronW: [86, 120], apronE: [274, 120],
  outN: [180, 12], outS: [180, 230], outW: [52, 120], outE: [312, 120], ramp: [14, 120], crowd: [344, 40],
  roof: [180, 120], wallW: [70, 120],
};
function ZoneRing({ marks, cell, tagCorners, poleAt, caption }: { marks: Mark[]; cell?: 'cell' | 'roof'; tagCorners?: [string, string]; poleAt?: string; caption?: string }) {
  const byZone = new Map<string, Mark[]>();
  for (const m of marks) byZone.set(m.zone, [...(byZone.get(m.zone) ?? []), m]);
  return (
    <div className="zr-wrap">
      <svg className="ring panel zr" viewBox="0 0 360 240" role="img" aria-label="Who's where">
        <rect className="floor" x="0" y="0" width="360" height="240" />
        <rect className="crowdzone" x="330" y="0" width="30" height="240" />
        <path className="ramp" d="M70 100 L0 92 L0 148 L70 140Z" />
        {cell && <rect className="mk-cell" x="34" y="4" width="292" height="232" rx="6" />}
        <rect className="apron" x="72" y="22" width="216" height="196" rx="3" />
        <rect className="mat" x="96" y="44" width="168" height="152" />
        {[0, 5, 10].map((o, i) => <rect key={o} className={`rope r${i}`} x={96 - o * 0.4} y={44 - o * 0.4} width={168 + o * 0.8} height={152 + o * 0.8} />)}
        {(['cnrNW', 'cnrNE', 'cnrSE', 'cnrSW'] as const).map((c) => {
          const [x, y] = Z[c]!;
          const team = tagCorners?.indexOf(c) ?? -1;
          return <g key={c}>
            <rect className="post" x={x + (x < 180 ? -26 : 22)} y={y + (y < 120 ? -26 : 22)} width="9" height="9" rx="2" />
            {team >= 0 && <rect className="mk-tagcnr" x={x - 22} y={y - 18} width="44" height="36" rx="4" style={{ stroke: TEAM_TONE[team] }} />}
          </g>;
        })}
        {poleAt && <g><line className="mk-pole" x1={Z[poleAt]![0] + 22} y1={Z[poleAt]![1] - 30} x2={Z[poleAt]![0] + 22} y2={Z[poleAt]![1] + 4} /><circle className="mk-prize" cx={Z[poleAt]![0] + 22} cy={Z[poleAt]![1] - 33} r="5" /></g>}
        {[...byZone].map(([zone, ms]) => ms.map((m, i) => {
          const [zx, zy] = Z[zone] ?? [180, 120];
          const n = ms.length, dx = (i - (n - 1) / 2) * 17, x = zx + dx, y = zy + (n > 3 ? (i % 2) * 14 - 7 : 0);
          return (
            <g key={m.w.id} className={`mk${m.out ? ' out' : ''}${m.down ? ' down' : ''}`} opacity={m.out ? 0.35 : 1}>
              {m.target && <circle className="mk-target" cx={x} cy={y} r="13" />}
              {m.legal && <circle className="mk-legal" cx={x} cy={y} r="10.5" style={{ stroke: TEAM_TONE[m.team] }} />}
              <circle cx={x} cy={y} r={m.me ? 8 : 7} style={{ fill: TEAM_TONE[m.team] }} className={m.me ? 'mk-me' : ''} />
              <text className="mk-lab" x={x} y={i % 2 ? y - 12 : y + 19}>{short(m.w).slice(0, 7)}</text>
            </g>
          );
        }))}
      </svg>
      {caption && <span className="zr-cap">{caption}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- the field strip

interface Chip { w: Wrestler; team: number; status: string; sta?: number; tone?: 'legal' | 'down' | 'out' | 'pod' }
function FieldStrip({ chips, title }: { chips: Chip[]; title: string }) {
  return (
    <div className="fs">
      <span className="fs-h">{title}</span>
      <div className="fs-row">
        {chips.map((c) => (
          <div key={c.w.id} className={`fs-card t${c.team}${c.tone ? ` ${c.tone}` : ''}`}>
            <b>{short(c.w)}</b>
            <span>{c.status}</span>
            {c.sta !== undefined && <i className="fs-sta"><i style={{ width: `${c.sta}%` }} /></i>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the dock: targets, and the new actions

function Dock({ targets, actions, chip, note }: { targets?: { w: Wrestler; on?: boolean; tone: number }[]; actions: { label: string; hot?: boolean; sub?: string }[]; chip: string; note?: string }) {
  return (
    <div id="dock" className="live">
      <div className="dock-head"><span className="chip you">{chip}</span></div>
      {targets && (
        <div className="mk-targets">
          <span className="mk-tl">Go after</span>
          {targets.map((t) => <button key={t.w.id} className={`mk-tchip${t.on ? ' on' : ''}`} style={{ borderColor: TEAM_TONE[t.tone] }}>{short(t.w)}</button>)}
        </div>
      )}
      <div className="actions mk-acts" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0,1fr))` }}>
        {actions.map((a) => <button key={a.label} className={`act${a.hot ? ' mk-hot' : ''}`}>{a.label}{a.sub && <span className="pin-odds">{a.sub}</span>}</button>)}
      </div>
      {note && <p className="mk-note">{note}</p>}
    </div>
  );
}

const showPrompt = () => new URLSearchParams(window.location.search).get('prompt') === '1';
function Prompt({ kicker, title, body, choices }: { kicker: string; title: string; body: ReactNode; choices: { label: string; sub?: string; gold?: boolean }[] }) {
  if (!showPrompt()) return null;
  return (
    <>
      <div className="catch" />
      <div className="sheet mk-prompt">
        <div className="inner">
          <span className="mk-kick">{kicker}</span>
          <b className="mk-title">{title}</b>
          <div className="mk-body">{body}</div>
          <div className="mk-choices">
            {choices.map((c) => <button key={c.label} className={`mv${c.gold ? ' special' : ''}`}><span className="mn">{c.label}</span>{c.sub && <span className="mi">{c.sub}</span>}</button>)}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- the scenes

function Layout(p: Omit<MatchSlots, 'wide' | 'pulse'>) {
  const skin = useSkin();
  const wide = useMedia('(min-width: 700px)');
  const pulse = useRef(0);
  const L = skin === 'paper' ? PaperMatch : skin === 'broadcast' ? BroadcastMatch : BuildingMatch;
  return <section id="match" className={`m-${skin} ${wide ? 'wide' : 'narrow'} mk`}><L {...p} wide={wide} pulse={pulse} /></section>;
}

function useCast() {
  return useMemo(() => {
    const men = pick((w) => w.gender === 'MALE' && w.promotion !== 'TIS', 40);
    return { men };
  }, []);
}

function TagScene() {
  const { men } = useCast();
  const [you, partner, them, theirs] = men as [Wrestler, Wrestler, Wrestler, Wrestler];
  const e = useMemo(() => warm(you.id, them.id), [you, them]);
  const S = e.state, v = S.view;
  const ring = (
    <>
      <ZoneRing tagCorners={['cnrSW', 'cnrNE']} marks={[
        { w: you, zone: 'centre', team: 0, legal: true, me: true }, { w: them, zone: 'centre', team: 1, legal: true, target: true },
        { w: partner, zone: 'apronW', team: 0 }, { w: theirs, zone: 'apronE', team: 1 },
      ]} caption="Your corner: bottom left. Get there to tag." />
    </>
  );
  const strip = <FieldStrip title="On the apron" chips={[
    { w: partner, team: 0, status: 'Your partner · reaching out', sta: 92, tone: 'legal' },
    { w: theirs, team: 1, status: 'Their partner · fresh', sta: 100 },
  ]} />;
  return (
    <>
      <Layout engine={e} S={S} ring={ring}
        you={<>{strip}<WrestlerCard w={you} v={v.sides.you} active /></>}
        them={<WrestlerCard w={them} v={v.sides.them} active={false} focus={S.you.targetFocus} />}
        log={<Log entries={S.log} tones={{ you: nameTone(you), them: nameTone(them) }} />}
        dock={<Dock chip={`You're legal · ${short(them)} has cut you off`} actions={[{ label: 'Moves' }, { label: 'Setup' }, { label: 'Pin' }, { label: 'Tag', hot: true, sub: 'crawl' }]} note={`Double-team: ${short(partner)} can't reach you from there. Get to the corner first.`} />} />
      <Prompt kicker="Hot tag" title={`Crawl to ${short(partner)}`} body={<>
        <p>You're on your knees, a metre from the corner. {short(them)} has hold of your boot; {short(theirs)} is screaming at the ref.</p>
        <p className="mk-dice">Your d20 + 3 (momentum, crowd) against {short(them)}'s d16 + 1. Win it and {short(partner)} comes in red hot.</p>
      </>} choices={[{ label: 'Go for the tag', sub: 'Roll the dice', gold: true }, { label: 'Fight up first', sub: 'Shake them off: a turn' }, { label: 'Stay down', sub: 'Get some breath back' }]} />
    </>
  );
}

function TripleScene() {
  const { men } = useCast();
  const [you, a, b] = men.slice(4) as [Wrestler, Wrestler, Wrestler];
  const e = useMemo(() => warm(you.id, a.id), [you, a]);
  const S = e.state, v = S.view;
  const ring = (
    <>
      <ZoneRing marks={[
        { w: you, zone: 'apronS', team: 0, me: true }, { w: a, zone: 'centre', team: 1, down: true }, { w: b, zone: 'centre', team: 2, target: true },
      ]} caption={`${short(b)} is covering ${short(a)}. You're on the apron: one step from it.`} />
    </>
  );
  const strip = <FieldStrip title="Everyone else" chips={[
    { w: a, team: 1, status: 'Down · being pinned', sta: 34, tone: 'down' },
  ]} />;
  return (
    <>
      <Layout engine={e} S={S} ring={ring}
        you={<>{strip}<WrestlerCard w={you} v={v.sides.you} active /></>}
        them={<WrestlerCard w={b} v={v.sides.them} active={false} focus={S.you.targetFocus} />}
        log={<Log entries={S.log} tones={{ you: nameTone(you), them: nameTone(b) }} />}
        dock={<Dock chip="Triple threat · one fall · no DQ" targets={[{ w: a, tone: 1 }, { w: b, on: true, tone: 2 }]} actions={[{ label: 'Moves' }, { label: 'Setup' }, { label: 'Pin' }, { label: 'Move', sub: 'zone' }]} />} />
      <Prompt kicker="One… two…" title="Break it up?" body={<>
        <p>{short(b)} hooks the leg on {short(a)}. If that's three, you've lost without being touched.</p>
        <p className="mk-dice">You're on the apron, next to it. Breaking it up takes your turn; stealing it means pulling {short(b)} off and covering {short(a)} yourself.</p>
      </>} choices={[{ label: 'Break it up', sub: 'Stomp, drag, dive', gold: true }, { label: 'Steal it', sub: `Throw ${short(b)} out, cover ${short(a)}: a contest` }, { label: 'Let it go', sub: 'Hope they kick out' }]} />
    </>
  );
}

function RumbleScene() {
  const { men } = useCast();
  const field = men.slice(8, 22);
  const [you, target, ...rest] = field as [Wrestler, Wrestler, ...Wrestler[]];
  const e = useMemo(() => warm(you.id, target.id), [you, target]);
  const S = e.state, v = S.view;
  const inRing = rest.slice(0, 6);
  const gone = rest.slice(6, 10);
  const ring = (
    <>
      <div className="mk-rumbar"><b>RUMBLE</b><span>In the ring 8</span><span>Eliminated 11</span><span className="mk-next">#20 in 0:47</span></div>
      <ZoneRing marks={[
        { w: you, zone: 'cnrNE', team: 0, me: true }, { w: target, zone: 'cnrNE', team: 1, target: true },
        ...inRing.map((w, i) => ({ w, zone: ['centre', 'centre', 'cnrSW', 'cnrSW', 'cnrNW', 'cnrSE'][i]!, team: 2 + (i % 2), down: i === 4 })),
      ]} caption={`Brawls this round: you and ${short(target)} on the ropes; two pairs in the middle; one man down.`} />
    </>
  );
  const strip = (
    <>
      <FieldStrip title="In the ring" chips={inRing.map((w, i) => ({ w, team: 2 + (i % 2), status: i === 4 ? 'Down' : `#${[2, 7, 11, 14, 16, 19][i]} · ${['26:10', '19:40', '13:05', '9:30', '6:15', '1:20'][i]}`, sta: [30, 44, 58, 70, 22, 96][i], tone: i === 4 ? 'down' as const : undefined }))} />
      <FieldStrip title="Eliminated" chips={gone.map((w, i) => ({ w, team: 3, status: `by ${short(field[i]!)}`, tone: 'out' as const }))} />
    </>
  );
  return (
    <>
      <Layout engine={e} S={S} ring={ring}
        you={<>{strip}<WrestlerCard w={you} v={v.sides.you} active /></>}
        them={<WrestlerCard w={target} v={v.sides.them} active={false} focus={S.you.targetFocus} />}
        log={<Log entries={S.log} tones={{ you: nameTone(you), them: nameTone(target) }} />}
        dock={<Dock chip="Entered #4 · 31:22 in · 3 eliminations" targets={[{ w: target, on: true, tone: 1 }, { w: inRing[2]!, tone: 2 }, { w: inRing[4]!, tone: 3 }]} actions={[{ label: 'Moves' }, { label: 'Over the top', hot: true }, { label: 'Move', sub: 'zone' }]} />} />
      <Prompt kicker="Over the top" title={`${short(target)} has you on the top rope`} body={<>
        <p>Your feet are off the mat. One foot's caught on the middle rope.</p>
        <p className="mk-dice">Hang on: your strength and stamina against his. Skin the cat if you've the speed for it. Land on the apron and you're still in.</p>
      </>} choices={[{ label: 'Hang on', sub: 'STR d20 + 2 vs d16 + 4' }, { label: 'Skin the cat', sub: 'SPD: risky, a big pop', gold: true }, { label: 'Drop to the apron', sub: 'Safe if your feet land' }]} />
    </>
  );
}

function CellScene() {
  const { men } = useCast();
  const [you, them] = men.slice(22, 24) as [Wrestler, Wrestler];
  const e = useMemo(() => warm(you.id, them.id), [you, them]);
  const S = e.state, v = S.view;
  const ring = (
    <>
      <div className="mk-roof">
        <span className="mk-rooflab">ON THE ROOF · 20 FT UP</span>
        <div className="mk-roofgrid">{['North edge', 'Centre (it sags)', 'South edge'].map((z, i) => <span key={z} className={`mk-rz${i === 1 ? ' here' : ''}`}>{z}{i === 1 && <b> {short(you)} · {short(them)}</b>}</span>)}</div>
      </div>
      <ZoneRing cell="roof" marks={[]} caption="Below: the ring and ringside inside the cell. Off the side, through the roof, or climb back down." />
    </>
  );
  return (
    <>
      <Layout engine={e} S={S} ring={ring}
        you={<WrestlerCard w={you} v={v.sides.you} active />}
        them={<WrestlerCard w={them} v={v.sides.them} active={false} focus={S.you.targetFocus} />}
        log={<Log entries={S.log} tones={{ you: nameTone(you), them: nameTone(them) }} />}
        dock={<Dock chip="Hell in a Cell · no DQ · pins and submissions anywhere inside" actions={[{ label: 'Moves' }, { label: 'Setup' }, { label: 'Through it', hot: true, sub: 'roof' }, { label: 'Climb', sub: 'down' }]} note="The roof's buckling under you both. A big enough slam goes through it: the biggest spot of the night, and nobody walks away clean." />} />
    </>
  );
}

function FeedScene() {
  const { men } = useCast();
  const names = men.slice(8, 30).map(short);
  const lines = [
    ['41:02', `${names[3]} launches ${names[9]} over the top! Out, number 17.`],
    ['41:40', `${names[1]} and ${names[12]} trade forearms on the apron.`],
    ['42:15', `Number 27 is… ${names[18]}! The building comes unglued: he hasn't been seen in two years.`],
    ['42:31', `${names[18]} clears house: ${names[5]} and ${names[11]} gone in one go.`],
    ['43:58', `Final four: ${names[1]}, ${names[3]}, ${names[12]}, ${names[18]}.`],
    ['45:20', `${names[3]} skins the cat! He's still in!`],
  ];
  return (
    <section className="mk-feed">
      <header className="mk-fh"><b>THE RUMBLE</b><span>You went out at 38:14 (#4, 3 eliminations)</span></header>
      <div className="mk-fcols">
        <div className="mk-flog">{lines.map(([t, l]) => <p key={t}><span className="mk-ft">{t}</span>{l}</p>)}</div>
        <aside className="mk-fside">
          <span className="fs-h">Still in · 4</span>
          {[1, 3, 12, 18].map((i) => <span key={i} className="mk-fin">{names[i]}</span>)}
          <span className="fs-h">Iron man so far</span>
          <span className="mk-fin">{names[1]} · 44:51</span>
          <span className="fs-h">Most eliminations</span>
          <span className="mk-fin">{names[18]} · 5</span>
        </aside>
      </div>
      <div className="mk-fnav"><button className="act">Faster</button><button className="act mk-hot">Skip to the end</button></div>
    </section>
  );
}

function BuilderScene() {
  const { men } = useCast();
  const teams = [men.slice(30, 32), men.slice(32, 34), men.slice(34, 36)];
  return (
    <section className="mk-builder">
      <header className="mk-bh"><b>MATCH BUILDER</b></header>
      <span className="fs-h">Match type</span>
      <div className="mk-chips">{['Singles', 'Tag', 'Tornado tag', 'Triple threat', 'Fatal 4-way', 'Handicap', 'Battle royal', 'Rumble', 'Elimination tag', 'Gauntlet'].map((x) => <button key={x} className={`mk-c${x === 'Tag' ? ' on' : ''}`}>{x}</button>)}</div>
      <span className="fs-h">Sides · 3 teams of 2 (triple threat tag)</span>
      <div className="mk-sides">
        {teams.map((t, i) => (
          <div key={i} className="mk-side" style={{ borderColor: TEAM_TONE[i] }}>
            <span className="mk-sh">{i === 0 ? 'You' : `Team ${i + 1}`}</span>
            {t.map((w, j) => <span key={w.id} className="mk-slot">{w.name}{i === 0 && j === 0 && <em> · you play</em>}</span>)}
            <button className="mk-add">+ Add</button>
          </div>
        ))}
        <button className="mk-side mk-addside">+ Add a side</button>
      </div>
      <span className="fs-h">Stipulation</span>
      <div className="mk-chips">{['Standard', 'Tables', 'Ladder', 'TLC', 'Street fight', 'Hell in a Cell', 'Steel cage', 'Strap', 'Lumberjack', 'Deathmatch…', 'More…'].map((x) => <button key={x} className={`mk-c${x === 'TLC' ? ' on' : ''}`}>{x}</button>)}</div>
      <span className="fs-h">TLC options</span>
      <div className="mk-chips">{['Prize: tag titles', 'Ladders: 3', 'Tables: 4', 'Chairs: plenty'].map((x) => <button key={x} className="mk-c">{x}</button>)}</div>
      <span className="fs-h">Rules</span>
      <div className="mk-chips">{['Legal men only', 'Tornado', 'No DQ', 'Count-outs off', 'Watch it (AI vs AI)'].map((x, i) => <button key={x} className={`mk-c${i === 0 ? ' on' : ''}`}>{x}</button>)}</div>
      <div className="mk-fnav"><button className="act">Tale of the tape</button><button className="act mk-hot">Ring the bell</button></div>
    </section>
  );
}

export function MatchMocks() {
  const scene = (new URLSearchParams(window.location.search).get('scene') ?? 'tag') as Scene;
  return scene === 'triple' ? <TripleScene /> : scene === 'rumble' ? <RumbleScene /> : scene === 'cell' ? <CellScene /> : scene === 'feed' ? <FeedScene /> : scene === 'builder' ? <BuilderScene /> : <TagScene />;
}
