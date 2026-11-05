import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ATTACK_DIE, DEFEND_DIE, PUSH_COST, edgeOf, landChance, type ContestRoll, type ContestSide, type ContestSpec,
  type MatchEngine, type SideKey,
} from '../../engine';
import { Name } from '../common/Name';
import { buzz, reduceMotion } from '../format';
import { useActionKey } from './useLeadIn';

const TUMBLE_MS = 950;
const HOLD_MS = 1250;

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

type Pt = readonly [number, number];
const ring = (n: number, r: number, rot = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => [Math.cos(rot + (2 * Math.PI * i) / n) * r, Math.sin(rot + (2 * Math.PI * i) / n) * r] as const);
const poly = (pts: Pt[]) => `M${pts.map((p) => p.join(' ')).join(' L')}Z`;

/**
 * A die seen face-on. d20: hexagon outline with the centre triangle (an icosahedron). d16: octagon
 * with a centre kite (a sixteen-sided bipyramid).
 */
function Die({ faces, value, state, dropped }: { faces: number; value: number | null; state: 'idle' | 'rolling' | 'set'; dropped?: boolean }) {
  const d20 = faces === 20;
  const outer = d20 ? ring(6, 46) : ring(8, 46, -Math.PI / 2 + Math.PI / 8);
  const inner: Pt[] = d20
    ? [0, 2, 4].map((i) => [outer[i]![0] * 0.56, outer[i]![1] * 0.56 + 6] as const)
    : [[0, -30], [24, 2], [0, 30], [-24, 2]];
  const edges = inner.map((p) => {
    // Join each centre-face corner to its two nearest outline corners.
    const near = [...outer].sort((u, v) => Math.hypot(u[0] - p[0], u[1] - p[1]) - Math.hypot(v[0] - p[0], v[1] - p[1])).slice(0, 2);
    return near.map((q) => `M${p.join(' ')} L${q.join(' ')}`).join(' ');
  });
  const top = state === 'set' && value === faces && !dropped;
  const one = state === 'set' && value === 1 && !dropped;
  return (
    <svg viewBox="-50 -50 100 100" className={`d20 ${state}${dropped ? ' dropped' : ''}${top ? ' nat20' : one ? ' nat1' : ''}`} aria-hidden="true">
      <path className="d20-body" d={poly(outer)} />
      <path className="d20-face" d={poly(inner)} />
      {edges.map((e, i) => (
        <path key={i} className="d20-edge" d={e} />
      ))}
      <text className="d20-n" y="11">
        {value ?? '?'}
      </text>
      <text className="d20-kind" y="44">
        d{faces}
      </text>
    </svg>
  );
}

function useTumble(target: number[], rolling: boolean, faces: number): number[] {
  const [shown, setShown] = useState<number[]>(target.map(() => 0));
  useEffect(() => {
    if (!rolling) return;
    if (reduceMotion()) {
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let id = 0;
    const tick = () => {
      const e = performance.now() - t0;
      if (e >= TUMBLE_MS) return setShown(target);
      setShown(target.map(() => 1 + Math.floor(Math.random() * faces)));
      // Slow down as it settles.
      id = window.setTimeout(tick, 40 + (e / TUMBLE_MS) * 120);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [rolling, target, faces]);
  return shown;
}

interface ColumnProps {
  engine: MatchEngine;
  side: ContestSide;
  role: 'attack' | 'defend';
  dice: number[] | null;
  kept: number | null;
  total: number | null;
  rolling: boolean;
  settled: boolean;
  won: boolean | null;
  previewPush: boolean;
  /** The move isn't revealed yet (the player hasn't read it): keep its modifiers hidden. */
  hidden?: boolean;
}

function Column({ engine, side, role, dice, kept, total, rolling, settled, won, previewPush, hidden }: ColumnProps) {
  const S = engine.state;
  const edgeSide = previewPush ? { ...side, pushed: true } : side;
  const edge = edgeOf(edgeSide);
  const faces = role === 'attack' ? ATTACK_DIE : DEFEND_DIE;
  const shown = useTumble(dice ?? [], rolling, faces);
  const nDice = dice ? dice.length : edge === 0 ? 1 : 2;
  return (
    <div className={`cc-col ${side.key} ${role}${won === true ? ' won' : won === false ? ' lost' : ''}`}>
      <div className="cc-who">
        <Name w={S.sides[side.key]!.w} side={side.key} />
        <span className="cc-role">{role === 'attack' ? 'Attacking' : 'Defending'}</span>
      </div>
      <div className={`cc-dice n${nDice}`}>
        {Array.from({ length: nDice }, (_, i) => {
          const v = dice ? (settled ? dice[i]! : shown[i] ?? null) : null;
          const dropped = settled && dice !== null && nDice === 2 && (dice[i] !== kept || (dice[0] === dice[1] && i === 1));
          return <Die key={i} faces={faces} value={v} state={dice ? (settled ? 'set' : 'rolling') : 'idle'} dropped={dropped} />;
        })}
      </div>
      <div className="cc-edges">
        {edge === 1 && <span className="edge adv">Advantage</span>}
        {edge === -1 && <span className="edge dis">Disadvantage</span>}
        {side.edges.map((e, i) => (
          <span key={i} className={`edge-why ${e.dir > 0 ? 'adv' : 'dis'}`}>{e.label}</span>
        ))}
        {(side.pushed || previewPush) && <span className="edge-why adv push">Pushing</span>}
      </div>
      {hidden ? (
        <ul className="cc-mods">
          <li className="cc-hidden">
            <span>Hidden until you read it</span>
          </li>
        </ul>
      ) : (
      <ul className="cc-mods">
        {side.mods.map((m, i) => (
          <li key={i}>
            <span>{m.label}</span>
            <b className={m.value >= 0 ? 'pos' : 'neg'}>{signed(m.value)}</b>
          </li>
        ))}
        <li className="cc-sum">
          <span>Bonus</span>
          <b>{signed(side.bonus)}</b>
        </li>
      </ul>
      )}
      <div className="cc-total">{settled && total !== null ? `${kept} ${side.bonus >= 0 ? '+' : '−'} ${Math.abs(side.bonus)} = ${total}` : ' '}</div>
    </div>
  );
}

const myRoleIsAttack = (spec: ContestSpec, pk: SideKey) => spec.attacker === pk;

function verdictFor(spec: ContestSpec, roll: ContestRoll, pk: SideKey): { text: string; tone: 'good' | 'bad' | 'gold' } {
  const playerAttacks = spec.attacker === pk;
  const good = roll.landed === playerAttacks;
  if (roll.crit === 'attackerTop') return { text: 'Critical!', tone: 'gold' };
  if (roll.crit === 'defenderTop') return { text: `Natural ${DEFEND_DIE}!`, tone: 'gold' };
  if (roll.crit === 'attacker1') return { text: 'Botch!', tone: playerAttacks ? 'bad' : 'good' };
  if (spec.kind === 'move' && spec.defence === 'reverse') {
    if (!roll.landed) return { text: 'Reversed!', tone: playerAttacks ? 'bad' : 'gold' };
    return { text: playerAttacks ? 'Caught them going for it' : 'Caught going for it', tone: playerAttacks ? 'good' : 'bad' };
  }
  const text = spec.kind === 'move' ? (roll.landed ? 'It lands' : 'Reversed!') : roll.landed ? 'In control' : 'Countered!';
  return { text, tone: good ? 'good' : 'bad' };
}

/** The contested roll: modifiers on show, push or don't, roll, watch the dice. */
export function ContestCard({ engine }: { engine: MatchEngine }) {
  const p = engine.state.pending;
  const spec = p.kind === 'contest' || p.kind === 'contestRoll' ? p.spec : null;
  const roll = p.kind === 'contestRoll' ? p.roll : null;
  const [push, setPush] = useState(false);
  const [settled, setSettled] = useState(false);
  const applied = useRef(false);

  useEffect(() => {
    if (!roll) return;
    const t1 = window.setTimeout(() => {
      setSettled(true);
      const crit = roll.crit === 'attackerTop' || roll.crit === 'defenderTop';
      buzz(crit ? [20, 40, 20, 40, 60] : 18);
    }, reduceMotion() ? 50 : TUMBLE_MS);
    const t2 = window.setTimeout(() => {
      if (!applied.current) {
        applied.current = true;
        engine.applyContest();
      }
    }, (reduceMotion() ? 50 : TUMBLE_MS) + HOLD_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [roll, engine]);

  const doRoll = useCallback(() => {
    const pend = engine.state.pending;
    if (pend.kind === 'contest') {
      buzz(10);
      engine.rollContest(push);
    } else if (settled && !applied.current) {
      applied.current = true;
      engine.applyContest();
    }
  }, [engine, push, settled]);
  useActionKey(() => doRoll());

  if (!spec) return null;
  const playerKey: SideKey = engine.pk;
  const mine = spec.attacker === playerKey ? spec.attack : spec.defend;
  const theirs = spec.attacker === playerKey ? spec.defend : spec.attack;
  const myRole = spec.attacker === playerKey ? 'attack' : 'defend';
  const withPush = !roll && push;
  const chance = withPush
    ? landChance(myRoleIsAttack(spec, engine.pk) ? { ...spec.attack, pushed: true } : spec.attack, myRoleIsAttack(spec, engine.pk) ? spec.defend : { ...spec.defend, pushed: true })
    : spec.chance;
  const odds = spec.attacker === playerKey ? chance : 100 - chance;
  const verdict = roll && settled ? verdictFor(spec, roll, engine.pk) : null;
  const myWon = roll && settled ? roll.landed === (myRole === 'attack') : null;
  const diceFor = (s: ContestSide) => (!roll ? null : s === spec.attack ? roll.attackerDice : roll.defenderDice);
  const keptFor = (s: ContestSide) => (!roll ? null : s === spec.attack ? roll.attackerKept : roll.defenderKept);
  const totalFor = (s: ContestSide) => (!roll ? null : s === spec.attack ? roll.attackerTotal : roll.defenderTotal);
  const S = engine.state;
  const playerAttacks = spec.attacker === playerKey;
  const pushWhy = spec.playerCanPush ? '' : engine.me.signatureReady ? 'Signature banked — use it first' : `Needs ${PUSH_COST} momentum`;

  return (
    <div className={`ov contest${spec.major ? ' strong' : ''}${verdict ? ` v-${verdict.tone}` : ''}`}
      onPointerDown={(e) => { if (roll && settled && e.target === e.currentTarget) doRoll(); }}>
      <div className="cc">
        <div className="cc-head">
          <div className="mt-kicker">
            {spec.major ? `${spec.major} · ` : ''}
            {myRole === 'attack'
              ? spec.kind === 'move' ? (spec.defence === 'reverse' ? `You go for it · ${S.sides[playerAttacks ? spec.defender : spec.attacker]!.w.name} goes for the reversal` : 'You go for it') : 'You try to set it up'
              : spec.kind === 'move' ? `${S.sides[playerAttacks ? spec.defender : spec.attacker]!.w.name} goes for it · you go for the reversal` : `${S.sides[playerAttacks ? spec.defender : spec.attacker]!.w.name} tries to set it up`}
          </div>
          <div className="mt-title">{spec.title}</div>
          <div className="cc-odds">
            <span className="cc-odds-bar">
              <i style={{ width: `${odds}%` }} />
            </span>
            <span>
              {myRole === 'attack' ? 'Your chance to land it' : 'Your chance to reverse it'} <b>{Math.round(odds)}%</b>
            </span>
          </div>
        </div>
        <div className="cc-cols">
          <Column engine={engine} side={mine} role={myRole} dice={diceFor(mine)} kept={keptFor(mine)} total={totalFor(mine)}
            rolling={!!roll} settled={settled} won={myWon} previewPush={!roll && push} />
          <div className="cc-vs">vs</div>
          <Column engine={engine} side={theirs} role={myRole === 'attack' ? 'defend' : 'attack'} dice={diceFor(theirs)} kept={keptFor(theirs)}
            total={totalFor(theirs)} rolling={!!roll} settled={settled} won={myWon === null ? null : !myWon} previewPush={false} />
        </div>
        {verdict && <div className={`cc-verdict ${verdict.tone}`}>{verdict.text}</div>}
        {!roll && (
          <div className="cc-actions">
            <button className={`cc-push${push ? ' on' : ''}`} disabled={!spec.playerCanPush} onClick={() => setPush((x) => !x)} aria-pressed={push}>
              <span className="pl">Push</span>
              <span className="ps">{spec.playerCanPush ? `Advantage · −${PUSH_COST} momentum` : pushWhy}</span>
            </button>
              <button className="cc-roll" onClick={() => doRoll()}>
              Roll
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
