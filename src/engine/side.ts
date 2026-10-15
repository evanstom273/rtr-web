// Port of the parts of MatchSideState the match rules use.
import type { BodyPart, Move, MoveType, Wrestler } from '../data/rtr/types';
import { getMove } from '../data/rtr';
import { clamp } from './rng';
import type { SetupId, Side, SideKey, Snapshot } from './types';
import { BODY_PARTS } from './types';

export const MAX_FINISHER_STOCK = 3;
export const STAMINA_POOL_MULTIPLIER = 2.5;

export function createSide(w: Wrestler, key: SideKey): Side {
  const regular = w.moves.map(getMove), signatures = w.signatures.map(getMove), finishers = w.finishers.map(getMove);
  const all: Move[] = [];
  for (const m of [...regular, ...signatures, ...finishers]) if (!all.includes(m)) all.push(m);
  const maxStamina = Math.ceil(clamp(w.stats.stamina, 0, 100) * STAMINA_POOL_MULTIPLIER);
  return {
    key, w, regular, signatures, finishers, all,
    state: { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' },
    hp: { HEAD: 100, BODY: 100, LEFT_ARM: 100, RIGHT_ARM: 100, LEFT_LEG: 100, RIGHT_LEG: 100 },
    stamina: maxStamina, maxStamina, fatigue: 0, momentum: 0, signatureReady: false, finisherStock: 0,
    resiliencyEarned: false, resiliencyAvailable: false, resiliencyUsed: false,
    targetFocus: 'NONE',
    recentMoves: [], recentMoveTypes: [], recentSetupPatterns: [], pendingSetupAction: null,
    recentTargetParts: [], targetAttackCounts: {}, targetDamageDealt: {}, thresholdsCrossed: {}, repeatedMilestones: {},
    lastBodyCommentaryTime: -1000, moveUseCounts: {},
    lastActionResult: 'NONE', lastMoveLanded: null, lastMoveWasFinisher: false,
    tauntCooldownUntil: 0, catchBreathCooldownUntil: 0, consecutiveNeutralResets: 0, consecutiveSetupActions: 0,
    recoveryDelayProtected: false, announcedLowStamina: false, announcedHighFatigue: false, announcedSpent: false, announcedHeroic: false,
    movesLanded: 0, damageDealt: 0, damageTaken: 0, reversals: 0, kickouts: 0, pinAttempts: 0,
  };
}

export const snapshot = (s: Side): Snapshot => ({ ...s.state });

export function setState(s: Side, next: Snapshot): void {
  s.state = { ...next };
}

export function damagePart(s: Side, part: BodyPart, amount: number): void {
  s.hp[part] = clamp(s.hp[part] - Math.max(0, amount), 0, 100);
}

export const totalHp = (s: Side): number => BODY_PARTS.reduce((t, p) => t + s.hp[p], 0);

export function spendStamina(s: Side, amount: number): void {
  s.stamina = clamp(s.stamina - Math.max(0, amount), 0, s.maxStamina);
}

export function recoverStamina(s: Side, amount: number): number {
  const before = s.stamina;
  s.stamina = clamp(s.stamina + Math.max(0, amount), 0, s.maxStamina);
  return s.stamina - before;
}

export function addFatigue(s: Side, amount: number): void {
  s.fatigue = clamp(s.fatigue + amount, 0, 100);
}

/** Returns true when this call made the signature ready. */
export function addMomentum(s: Side, amount: number): boolean {
  const wasReady = s.signatureReady;
  s.momentum = clamp(s.momentum + amount, 0, 100);
  if (!wasReady && s.momentum >= 100) {
    s.signatureReady = true;
    if (!s.resiliencyEarned) {
      s.resiliencyEarned = true;
      s.resiliencyAvailable = true;
    }
    return true;
  }
  return false;
}

export const isSignatureMove = (s: Side, m: Move): boolean => s.signatures.includes(m);
export const isFinisherMove = (s: Side, m: Move): boolean => m.finisher || s.finishers.includes(m);

export function canUseMove(s: Side, m: Move): boolean {
  if (!s.all.includes(m)) return false;
  if (isFinisherMove(s, m)) return s.finisherStock > 0;
  if (isSignatureMove(s, m)) return s.signatureReady;
  return true;
}

export function convertLandedSignature(s: Side): boolean {
  if (!s.signatureReady) return false;
  s.signatureReady = false;
  s.momentum = 0;
  grantFinisherStock(s);
  return true;
}

export function grantFinisherStock(s: Side, amount = 1): number {
  const before = s.finisherStock;
  s.finisherStock = Math.min(MAX_FINISHER_STOCK, s.finisherStock + Math.max(0, amount));
  return s.finisherStock - before;
}

export function spendFinisher(s: Side): boolean {
  if (s.finisherStock <= 0) return false;
  s.finisherStock--;
  return true;
}

export function recordMoveUsed(s: Side, m: Move, landed: boolean): void {
  s.moveUseCounts[m.id] = (s.moveUseCounts[m.id] ?? 0) + 1;
  if (landed) s.movesLanded++;
  s.recentMoves.push(m.id);
  s.recentMoveTypes.push(m.type);
  while (s.recentMoves.length > 8) s.recentMoves.shift();
  while (s.recentMoveTypes.length > 8) s.recentMoveTypes.shift();
  if (s.pendingSetupAction) {
    s.recentSetupPatterns.push(`${s.pendingSetupAction}:${m.type}`);
    while (s.recentSetupPatterns.length > 5) s.recentSetupPatterns.shift();
    s.pendingSetupAction = null;
  }
  if (landed) {
    s.lastMoveLanded = m;
    s.lastMoveWasFinisher = m.finisher;
  }
}

export function recentMoveCount(s: Side, m: Move, window: number): number {
  return s.recentMoves.slice(-Math.max(0, window)).filter((id) => id === m.id).length;
}
export const lastAttemptedMoveMatches = (s: Side, m: Move): boolean => s.recentMoves[s.recentMoves.length - 1] === m.id;
export const recentMoveTypeCount = (s: Side, t: MoveType, window: number): number => s.recentMoveTypes.slice(-Math.max(0, window)).filter((x) => x === t).length;

export function noteSetupAction(s: Side, id: SetupId): void {
  s.pendingSetupAction = id;
}
export function setupPatternRepeats(s: Side, m: Move): boolean {
  return !!s.pendingSetupAction && s.recentSetupPatterns.includes(`${s.pendingSetupAction}:${m.type}`);
}

export function recordTargetResolution(s: Side, part: BodyPart, damage: number, landed: boolean): void {
  s.recentTargetParts.push(part);
  while (s.recentTargetParts.length > 8) s.recentTargetParts.shift();
  if (!landed) return;
  s.targetAttackCounts[part] = (s.targetAttackCounts[part] ?? 0) + 1;
  s.targetDamageDealt[part] = (s.targetDamageDealt[part] ?? 0) + Math.max(0, damage);
}

export const recentTargetPartCount = (s: Side, part: BodyPart, limit = 5): number =>
  s.recentTargetParts.slice(-Math.max(1, limit)).filter((p) => p === part).length;

export function markCrossedThresholds(s: Side, part: BodyPart, before: number, after: number): number[] {
  const crossed: number[] = [];
  const recorded = (s.thresholdsCrossed[part] ??= []);
  for (const th of [80, 60, 40, 20, 0]) {
    if (before > th && after <= th && !recorded.includes(th)) {
      recorded.push(th);
      crossed.push(th);
    }
  }
  return crossed;
}

export function markRepeatedTargetMilestone(s: Side, part: BodyPart, count: number): boolean {
  if (count !== 3 && count !== 5) return false;
  const recorded = (s.repeatedMilestones[part] ??= []);
  if (recorded.includes(count)) return false;
  recorded.push(count);
  return true;
}

export function mostTargetedPart(s: Side): BodyPart | null {
  let best: BodyPart | null = null, n = 0;
  for (const p of BODY_PARTS) {
    const c = s.targetAttackCounts[p] ?? 0;
    if (c > n) {
      n = c;
      best = p;
    }
  }
  return best;
}

export function weakestPart(s: Side): BodyPart {
  let best: BodyPart = 'HEAD';
  for (const p of BODY_PARTS) if (s.hp[p] < s.hp[best]) best = p;
  return best;
}

export const lowestTargetHp = (s: Side, parts: readonly BodyPart[]): number =>
  parts.length ? parts.reduce((low, p) => Math.min(low, s.hp[p]), 100) : s.hp.BODY;
