// Contest flow: build the roll, let the player (and the AI) decide on a push, roll, then hand the
// outcome back to the move or setup that started it.
import { LINES } from '../data/commentary';
import { flash, say } from './commentary';
import type { Ctx } from './ctx';
import { canPush, landChance, PUSH_COST, rollContest, type ContestSide } from './dice';
import { finishMove } from './moves';
import { pinCondition } from './pin';
import { finishContestedSetup } from './setups';
import type { ContestSpec, MatchState, SideKey } from './types';

/** When the AI spends momentum to push: big moments, or desperation on defence. */
export function aiWantsPush(S: MatchState, k: SideKey, spec: ContestSpec): boolean {
  if (!canPush(S[k])) return false;
  if (spec.major) return true;
  if (k === spec.defender && pinCondition(S[k]) < 45 && S[k].momentum >= 40) return true;
  // Close calls with plenty of momentum to spare.
  const mine = k === spec.attacker ? spec.chance : 100 - spec.chance;
  return S[k].momentum >= 60 && mine >= 35 && mine <= 60;
}

/** Put a contest in front of the player. The AI side declares its push up front. */
export function startContest(ctx: Ctx, base: Omit<ContestSpec, 'id' | 'chance' | 'playerCanPush'>): void {
  const S = ctx.S;
  const spec: ContestSpec = { ...base, id: ++S.seq, chance: 0, playerCanPush: canPush(S.you) };
  spec.chance = landChance(spec.attack, spec.defend);
  const aiSide: ContestSide = spec.attacker === 'them' ? spec.attack : spec.defend;
  if (aiWantsPush(S, 'them', spec)) aiSide.pushed = true;
  spec.chance = landChance(spec.attack, spec.defend);
  S.pending = { kind: 'contest', spec };
}

/** The player rolls. push: spend momentum for advantage. */
export function rollPending(ctx: Ctx, push: boolean): boolean {
  const S = ctx.S, p = S.pending;
  if (p.kind !== 'contest') return false;
  const spec = { ...p.spec, attack: { ...p.spec.attack }, defend: { ...p.spec.defend } };
  const mine = spec.attacker === 'you' ? spec.attack : spec.defend;
  if (push && spec.playerCanPush) mine.pushed = true;
  for (const s of [spec.attack, spec.defend]) {
    if (s.pushed) S[s.key].momentum = Math.max(0, S[s.key].momentum - PUSH_COST);
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
  if (roll.crit === 'attacker20') flash(ctx, 'Critical!', true);
  else if (roll.crit === 'defender20') flash(ctx, 'Natural 20!', true);
  else if (roll.crit === 'attacker1') flash(ctx, 'Botch!');
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
  if (txn.kind === 'move') finishMove(ctx, txn.k, txn.move, !roll.landed, txn.target, roll.crit === 'attacker20');
  else if (txn.kind === 'setup') finishContestedSetup(ctx, txn.k, txn.action, !roll.landed);
  return true;
}
