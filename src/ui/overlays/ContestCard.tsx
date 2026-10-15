import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PUSH_COST, edgeOf, landChance, type ContestRoll, type ContestSide, type ContestSpec, type MatchEngine, type SideKey,
} from '../../engine';
import { Name } from '../common/Name';
import { buzz, reduceMotion } from '../format';
import { useActionKey } from './useLeadIn';

const TUMBLE_MS = 950;
const HOLD_MS = 1250;

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

/** Flat icosahedron: hexagon outline, centre face, edges out to the corners. */
function D20({ value, state, dropped }: { value: number | null; state: 'idle' | 'rolling' | 'set'; dropped?: boolean }) {
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [Math.cos(a) * 46, Math.sin(a) * 46] as const;
  });
  const tri = [0, 2, 4].map((i) => [hex[i]![0] * 0.56, hex[i]![1] * 0.56 + 6] as const);
  const crit = state === 'set' && (value === 20 || value === 1) && !dropped;
  return (
    <svg viewBox="-50 -50 100 100" className={`d20 ${state}${dropped ? ' dropped' : ''}${crit ? (value === 20 ? ' nat20' : ' nat1') : ''}`} aria-hidden="true">
      <path className="d20-body" d={`M${hex.map((p) => p.join(' ')).join(' L')}Z`} />
      <path className="d20-face" d={`M${tri.map((p) => p.join(' ')).join(' L')}Z`} />
      {tri.map((t, i) => {
        const h1 = hex[(i * 2 + 5) % 6]!, h2 = hex[i * 2]!, h3 = hex[(i * 2 + 1) % 6]!;
        return <path key={i} className="d20-edge" d={`M${t.join(' ')} L${h1.join(' ')} M${t.join(' ')} L${h2.join(' ')} M${t.join(' ')} L${h3.join(' ')}`} />;
      })}
      <text className="d20-n" y="13">
        {value ?? '?'}
      </text>
    </svg>
  );
}

function useTumble(target: number[], rolling: boolean): number[] {
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
      setShown(target.map(() => 1 + Math.floor(Math.random() * 20)));
      // Slow down as it settles.
      id = window.setTimeout(tick, 40 + (e / TUMBLE_MS) * 120);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [rolling, target]);
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
}

function Column({ engine, side, role, dice, kept, total, rolling, settled, won, previewPush }: ColumnProps) {
  const S = engine.state;
  const edgeSide = previewPush ? { ...side, pushed: true } : side;
  const edge = edgeOf(edgeSide);
  const shown = useTumble(dice ?? [], rolling);
  const nDice = dice ? dice.length : edge === 0 ? 1 : 2;
  return (
    <div className={`cc-col ${side.key} ${role}${won === true ? ' won' : won === false ? ' lost' : ''}`}>
      <div className="cc-who">
        <Name w={S[side.key].w} side={side.key} />
        <span className="cc-role">{role === 'attack' ? 'Attacking' : 'Defending'}</span>
      </div>
      <div className={`cc-dice n${nDice}`}>
        {Array.from({ length: nDice }, (_, i) => {
          const v = dice ? (settled ? dice[i]! : shown[i] ?? null) : null;
          const dropped = settled && dice !== null && nDice === 2 && (dice[i] !== kept || (dice[0] === dice[1] && i === 1));
          return <D20 key={i} value={v} state={dice ? (settled ? 'set' : 'rolling') : 'idle'} dropped={dropped} />;
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
      <div className="cc-total">{settled && total !== null ? `${kept} ${side.bonus >= 0 ? '+' : '−'} ${Math.abs(side.bonus)} = ${total}` : ' '}</div>
    </div>
  );
}

const myRoleIsAttack = (spec: ContestSpec) => spec.attacker === 'you';

function verdictFor(spec: ContestSpec, roll: ContestRoll): { text: string; tone: 'good' | 'bad' | 'gold' } {
  const playerAttacks = spec.attacker === 'you';
  const good = roll.landed === playerAttacks;
  if (roll.crit === 'attacker20') return { text: 'Critical!', tone: 'gold' };
  if (roll.crit === 'defender20') return { text: 'Natural 20!', tone: 'gold' };
  if (roll.crit === 'attacker1') return { text: 'Botch!', tone: playerAttacks ? 'bad' : 'good' };
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
      const crit = roll.crit === 'attacker20' || roll.crit === 'defender20';
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
    if (engine.state.pending.kind === 'contest') {
      buzz(10);
      engine.rollContest(push);
    } else if (settled && !applied.current) {
      applied.current = true;
      engine.applyContest();
    }
  }, [engine, push, settled]);
  useActionKey(doRoll);

  if (!spec) return null;
  const playerKey: SideKey = 'you';
  const mine = spec.attacker === playerKey ? spec.attack : spec.defend;
  const theirs = spec.attacker === playerKey ? spec.defend : spec.attack;
  const myRole = spec.attacker === playerKey ? 'attack' : 'defend';
  const withPush = !roll && push;
  const chance = withPush
    ? landChance(myRoleIsAttack(spec) ? { ...spec.attack, pushed: true } : spec.attack, myRoleIsAttack(spec) ? spec.defend : { ...spec.defend, pushed: true })
    : spec.chance;
  const odds = spec.attacker === playerKey ? chance : 100 - chance;
  const verdict = roll && settled ? verdictFor(spec, roll) : null;
  const myWon = roll && settled ? roll.landed === (myRole === 'attack') : null;
  const diceFor = (s: ContestSide) => (!roll ? null : s === spec.attack ? roll.attackerDice : roll.defenderDice);
  const keptFor = (s: ContestSide) => (!roll ? null : s === spec.attack ? roll.attackerKept : roll.defenderKept);
  const totalFor = (s: ContestSide) => (!roll ? null : s === spec.attack ? roll.attackerTotal : roll.defenderTotal);
  const S = engine.state;
  const pushWhy = spec.playerCanPush ? '' : S.you.signatureReady ? 'Signature banked — use it first' : `Needs ${PUSH_COST} momentum`;

  return (
    <div className={`ov contest${spec.major ? ' strong' : ''}${verdict ? ` v-${verdict.tone}` : ''}`}
      onPointerDown={(e) => { if (roll && settled && e.target === e.currentTarget) doRoll(); }}>
      <div className="cc">
        <div className="cc-head">
          <div className="mt-kicker">
            {spec.major ? `${spec.major} · ` : ''}
            {myRole === 'attack' ? (spec.kind === 'move' ? 'You go for it' : 'You try to set it up') : spec.kind === 'move' ? `${S.them.w.name} goes for it` : `${S.them.w.name} tries to set it up`}
          </div>
          <div className="mt-title">{spec.title}</div>
          <div className="cc-odds">
            <span className="cc-odds-bar">
              <i style={{ width: `${odds}%` }} />
            </span>
            <span>
              {myRole === 'attack' ? 'Your chance to land it' : 'Your chance to stop it'} <b>{Math.round(odds)}%</b>
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
            <button className="cc-roll" onClick={doRoll}>
              Roll
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
