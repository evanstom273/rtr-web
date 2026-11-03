// Contest flow: build the roll, let the player (and the AI) decide on a push, roll, then hand the
// outcome back to the move or setup that started it.
import { LINES } from '../data/commentary';
import { say } from './commentary';
import type { Ctx } from './ctx';
import { canPush, landChance, PUSH_COST, rollContest, type ContestSide } from './dice';
import { gainMomentum } from './momentum';
import { finishMove } from './moves';
import { pinCondition } from './pin';
import { finishContestedSetup } from './setups';
import { aiRead, readFor, READ_BONUS, READ_BONUS_TELEGRAPHED, READ_LABEL, tells, telegraphed, WRONG_READ, type Read } from './reads';
import type { ContestSpec, MatchState, Move, SideKey } from './types';

/** When the AI spends momentum to push: big moments, or desperation on defence. */
export function aiWantsPush(S: MatchState, k: SideKey, spec: ContestSpec): boolean {
  if (!canPush(S[k])) return false;
  if (spec.major) return true;
  if (k === spec.defender && pinCondition(S[k]) < 45 && S[k].momentum >= 40) return true;
  // Close calls with plenty of momentum to spare.
  const mine = k === spec.attacker ? spec.chance : 100 - spec.chance;
  return S[k].momentum >= 60 && mine >= 35 && mine <= 60;
}

type ContestBase = Pick<ContestSpec, 'kind' | 'attacker' | 'defender' | 'title' | 'major' | 'attack' | 'defend'> & { move?: Move };

/**
 * Put a contest in front of the player. The AI side declares its push up front. For a move, the
 * defender reads it: the AI reads now (and it shows), the player picks when they roll.
 */
export function startContest(ctx: Ctx, base: ContestBase): void {
  const S = ctx.S;
  const { move, ...rest } = base;
  const spec: ContestSpec = {
    ...rest, id: ++S.seq, chance: 0, playerCanPush: canPush(S.you),
    category: move ? readFor(move) : null, playerReads: !!move && base.defender === 'you', read: null, readRight: false,
    telegraphed: telegraphed(S[base.attacker]), tells: move ? tells(S, base.attacker) : [],
  };
  if (move && base.defender === 'them') applyRead(spec, aiRead(S, 'them', base.attacker, ctx.rnd));
  spec.chance = landChance(spec.attack, spec.defend);
  const aiSide: ContestSide = spec.attacker === 'them' ? spec.attack : spec.defend;
  if (aiWantsPush(S, 'them', spec)) aiSide.pushed = true;
  spec.chance = landChance(spec.attack, spec.defend);
  S.pending = { kind: 'contest', spec };
}

/** Commit the defender's read: a big bonus if it's right, a small cost if not. */
export function applyRead(spec: ContestSpec, read: Read): void {
  spec.read = read;
  spec.readRight = read === spec.category;
  const value = spec.readRight ? (spec.telegraphed ? READ_BONUS_TELEGRAPHED : READ_BONUS) : WRONG_READ;
  const mods = [...spec.defend.mods, { label: `${spec.readRight ? 'Read it' : 'Guessed wrong'}: ${READ_LABEL[read].toLowerCase()}`, value }];
  spec.defend = { ...spec.defend, mods, bonus: spec.defend.bonus + value };
}

/** The player rolls. push: spend momentum for advantage. read: the player's read, when they're defending a move. */
export function rollPending(ctx: Ctx, push: boolean, read?: Read): boolean {
  const S = ctx.S, p = S.pending;
  if (p.kind !== 'contest') return false;
  const spec = { ...p.spec, attack: { ...p.spec.attack }, defend: { ...p.spec.defend } };
  if (spec.playerReads && !spec.read) applyRead(spec, read ?? 'brace');
  const mine = spec.attacker === 'you' ? spec.attack : spec.defend;
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
  if (txn.kind === 'move' && p.spec.read) S[txn.k === 'you' ? 'them' : 'you'].stats.readsTried++;
  if (txn.kind === 'move') finishMove(ctx, txn.k, txn.move, !roll.landed, txn.target, roll.crit === 'attackerTop', p.spec.readRight);
  else if (txn.kind === 'setup') finishContestedSetup(ctx, txn.k, txn.action, !roll.landed);
  return true;
}
