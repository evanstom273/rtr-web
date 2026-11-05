// Contest flow: build the roll, let the player (and the AI) decide on a push, roll, then hand the
// outcome back to the move or setup that started it.
import { LINES } from '../data/commentary';
import { isPlayer, say } from './commentary';
import type { Ctx } from './ctx';
import { canPush, landChance, PUSH_COST, rollContest, type ContestSide } from './dice';
import { gainMomentum } from './momentum';
import { finishMove } from './moves';
import { pinCondition } from './pin';
import { finishContestedSetup } from './setups';
import { finishTagReach } from './tag';
import { finishOverTop } from './royal';
import { aiDefence, telegraphed, TELEGRAPH_BONUS, type Defence } from './defence';
import type { ContestSpec, DefendSpec, MatchState, Move, SideKey } from './types';

const MOVE_TYPE_LABEL: Partial<Record<Move['type'], string>> = {
  STRIKE: 'Strike', GRAPPLE: 'Grapple', SUBMISSION: 'Submission', AERIAL: 'Aerial', SPRINGBOARD: 'Springboard', RUNNING: 'Running',
  PINNING_MOVE: 'Pinning move', WEAPON: 'Weapon shot', ENVIRONMENTAL: 'Environmental', REVERSAL: 'Counter',
};

/** When the AI spends momentum to push: big moments, or desperation on defence. */
export function aiWantsPush(S: MatchState, k: SideKey, spec: ContestSpec): boolean {
  if (!canPush(S.sides[k]!)) return false;
  if (spec.major) return true;
  if (k === spec.defender && pinCondition(S.sides[k]!) < 45 && S.sides[k]!.momentum >= 40) return true;
  // Close calls with plenty of momentum to spare.
  const mine = k === spec.attacker ? spec.chance : 100 - spec.chance;
  return S.sides[k]!.momentum >= 60 && mine >= 35 && mine <= 60;
}

type ContestBase = Pick<ContestSpec, 'kind' | 'attacker' | 'defender' | 'title' | 'major' | 'attack' | 'defend'>;

/** Put a contest in front of the player. The AI side declares its push up front. */
export function startContest(ctx: Ctx, base: ContestBase, defence: ContestSpec['defence'] = null): void {
  const S = ctx.S;
  const pk = [base.attacker, base.defender].find((k) => isPlayer(S, k));
  const spec: ContestSpec = { ...base, id: ++S.seq, chance: 0, playerCanPush: !!pk && canPush(S.sides[pk]!), defence };
  spec.chance = landChance(spec.attack, spec.defend);
  // Every AI side in it declares its push up front.
  for (const [side, k] of [[spec.attack, spec.attacker], [spec.defend, spec.defender]] as [ContestSide, SideKey][]) {
    if (!isPlayer(S, k) && aiWantsPush(S, k, spec)) side.pushed = true;
  }
  spec.chance = landChance(spec.attack, spec.defend);
  S.pending = { kind: 'contest', spec };
  // Nobody at the controls in this one (two AI wrestlers while the player watches): roll straight away.
  if (!pk) rollPending(ctx, false);
}

const withMod = (s: ContestSide, label: string, value: number): ContestSide => ({ ...s, mods: [...s.mods, { label, value }], bonus: s.bonus + value });

/**
 * A move is coming: the defender sees it and picks how to take it. The player gets the choice on a
 * card; the AI decides on the spot. Only going for the reversal is rolled for.
 */
export function offerDefence(ctx: Ctx, base: ContestBase & { move: Move; aimed: string }): void {
  const S = ctx.S, A = S.sides[base.attacker]!;
  const tele = telegraphed(A);
  const defend = tele ? withMod(base.defend, 'Saw it coming', TELEGRAPH_BONUS) : base.defend;
  const spec: DefendSpec = {
    id: ++S.seq, attacker: base.attacker, defender: base.defender, moveName: base.move.name, moveType: MOVE_TYPE_LABEL[base.move.type] ?? 'Move',
    impact: base.move.impact, major: base.major, aimed: base.aimed, reverseChance: 100 - landChance(base.attack, defend), telegraphed: tele,
    attack: base.attack, defend,
  };
  if (isPlayer(S, base.defender)) {
    S.pending = { kind: 'defend', spec };
    return;
  }
  resolveDefence(ctx, spec, aiDefence(S, spec, ctx.rnd));
}

/** The defender's call is in. Reverse: roll for it. Brace or ride: the move lands now. */
export function resolveDefence(ctx: Ctx, spec: DefendSpec, choice: Defence): void {
  const S = ctx.S, txn = S.txn, d = spec.defender, st = S.sides[d]!.stats;
  if (!txn || txn.kind !== 'move') return;
  S.pending = { kind: 'idle' };
  if (choice === 'reverse') {
    st.reversalTries++;
    say(ctx, LINES.defendReverse, { a: d, d: spec.attacker, m: spec.moveName }, 'dim');
    startContest(ctx, { kind: 'move', attacker: spec.attacker, defender: d, title: spec.moveName, major: spec.major, attack: spec.attack, defend: spec.defend }, 'reverse');
    return;
  }
  if (choice === 'brace') st.braced++;
  else st.rode++;
  say(ctx, choice === 'brace' ? LINES.defendBrace : LINES.defendRide, { a: d, d: spec.attacker, m: spec.moveName }, 'dim');
  S.txn = null;
  finishMove(ctx, txn.k, txn.move, false, txn.target, false, choice);
}

/** The player rolls. push: spend momentum for advantage. */
export function rollPending(ctx: Ctx, push: boolean): boolean {
  const S = ctx.S, p = S.pending;
  if (p.kind !== 'contest') return false;
  const spec = { ...p.spec, attack: { ...p.spec.attack }, defend: { ...p.spec.defend } };
  const mine = isPlayer(S, spec.attacker) ? spec.attack : spec.defend;
  if (push && spec.playerCanPush) mine.pushed = true;
  for (const s of [spec.attack, spec.defend]) {
    if (s.pushed) gainMomentum(ctx, s.key, -PUSH_COST);
  }
  spec.chance = landChance(spec.attack, spec.defend);
  const roll = rollContest(ctx.rnd, spec.attack, spec.defend);
  const a = spec.attacker, d = spec.defender;
  say(ctx, LINES.roll, {
    a, d, m: spec.title,
    vars: {
      at: String(roll.attackerTotal), ad: String(roll.attackerKept), ab: signed(spec.attack.bonus),
      dt: String(roll.defenderTotal), dd: String(roll.defenderKept), db: signed(spec.defend.bonus),
    },
  }, 'dim');
  // Naturals are announced by the contest card when the dice land, not here (a flash now would
  // give the result away while they're still tumbling).
  S.pending = { kind: 'contestRoll', spec, roll };
  return true;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));

/** The dice have landed (the UI has finished animating): play out the result. */
export function applyPending(ctx: Ctx): boolean {
  const S = ctx.S, p = S.pending, txn = S.txn;
  if (p.kind !== 'contestRoll' || !txn) return false;
  S.pending = { kind: 'idle' };
  S.txn = null;
  const { roll } = p;
  if (roll.crit === 'attacker1' && txn.kind !== 'sub') say(ctx, LINES.botch, { a: txn.k }, 'bad');
  if (txn.kind === 'tag') finishTagReach(ctx, txn.k, txn.to, !roll.landed);
  else if (txn.kind === 'ott') finishOverTop(ctx, txn.k, txn.d, txn.hanging, roll);
  else if (txn.kind === 'move') finishMove(ctx, txn.k, txn.move, !roll.landed, txn.target, roll.crit === 'attackerTop', p.spec.defence);
  else if (txn.kind === 'setup') finishContestedSetup(ctx, txn.k, txn.action, !roll.landed);
  return true;
}
