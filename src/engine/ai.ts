// Port of MatchAIDecisionEngine. Godot's optional psychology framework (MatchDecisionFramework) and
// wrestling-identity modifiers are not ported yet; with no framework, Godot itself falls back to the
// weighted top-five choice used here.
import type { BodyPart } from '../data/rtr/types';
import { attributeDelta, moveAttributeProfile, setupScoringModifier, tauntProfile } from './attributes';
import { advanceClock, sideIsOutside } from './clock';
import type { Ctx } from './ctx';
import { other, say } from './commentary';
import { LINES } from '../data/commentary';
import {
  combinedExhaustion, executionPenalty, exhaustionBand, moveDemand, staminaCostMultiplier, staminaPercent, staminaRecoveryMultiplier,
} from './exhaustion';
import { afterAction, setControl } from './flow';
import { moveLandChance, setupLandChance } from './dice';
import { executionChance, isHighRisk } from './interaction';
import { executeMove, isLadderDive, moveIsValid, validMoves } from './moves';
import { canPin, isFlashPinMove, pinCondition, startPin } from './pin';
import { clamp } from './rng';
import { aiWantsWeaponTrip, aiWantsWeaponsHere, executeSetup, validSetups } from './setups';
import { heldBy, objectsIn, weaponOf } from './env';
import { chooseAiWeapon, extraSetups, isExtraSetup } from './stip';
import { findFollowupPaths, isContested, isRecovery, moveMatchesSnapshots, projectAction } from './setupRules';
import {
  canUseMove, isFinisherMove, isSignatureMove, lastAttemptedMoveMatches, lowestTargetHp, mostTargetedPart,
  recentMoveCount, recentTargetPartCount, totalHp, weakestPart,
} from './side';
import { focusAppliesToMove, isLimbFocus, resolveTarget, targetHp } from './targeting';
import type { Choice, MatchState, Move, SetupId, Side, SideKey, Snapshot, TargetResolution } from './types';
import { BODY_PARTS } from './types';

const MOVE_BLOCK_WINDOW = 3;

const AI_PRIORITY_EXTRAS: ReadonlySet<SetupId> = new Set<SetupId>([
  'reach_for_prize', 'escape_over_cage', 'reach_cage_top', 'begin_standing_count', 'retrieve_weapon', 'pick_up_weapon',
  'climb_ladder_top', 'tip_ladder', 'clear_table', 'clear_thumbtacks', 'ask_to_quit',
]);

type Candidate = Choice & { readySpecial?: boolean; forcedFallback?: boolean; fallbackLog?: 'commit' | 'reset' };

export class AiBrain {
  lastSetupIntent: SetupId | null = null;
  targetFocus: BodyPart | null = null;
  lastSuccessfulMoveImpact = 0;
  /** The move the AI landed on its last action, until its next decision. */
  justLanded: Move | null = null;
  /** Forced recoveries since the AI last committed to a move or a pin. */
  forcedRecoveries = 0;
  lastSuccessfulMove: Move | null = null;
  lastLandedFinisher = false;
  playerCrashOpportunity = false;
  reversalPinOpportunity = false;
  bigMoveFollowupOpportunity = false;
  setupIntentDecisionsRemaining = 0;
  setupIntentPendingAttempt = false;
  plannedSetupActions: SetupId[] = [];
  plannedFollowupMoveId = '';
  setupCooldownTurns = 0;
  recentSetupActions: (SetupId | '')[] = [];
  targetFocusUnavailableTurns = 0;
  recentAiMoveIds: string[] = [];
  lastPinAttemptLandedCount = -1;
  lastPinAttemptMoveId = '';

  constructor(private readonly ctx: Ctx, private readonly k: SideKey) {}

  private get S(): MatchState {
    return this.ctx.S;
  }
  private get phase(): 'opening' | 'middle' | 'closing' {
    return this.S.phase.name;
  }
  private phaseFinishBonus(): number {
    return this.phase === 'closing' ? 20 : this.phase === 'middle' ? 8 : 0;
  }

  /* ---------- notes from the match ---------- */

  notePinAttempt(ai: Side, cover: Move | null): void {
    this.lastPinAttemptLandedCount = ai.movesLanded;
    this.lastPinAttemptMoveId = cover?.id ?? '';
  }
  noteReversalControl(): void {
    this.reversalPinOpportunity = true;
  }
  notePlayerHighRiskCrash(): void {
    this.playerCrashOpportunity = true;
  }
  noteSetupExecuted(id: SetupId | null, ai: Side): void {
    if (!id) return this.clearSetupIntent();
    if (isRecovery(id) || id === 'taunt') return this.clearSetupIntent();
    if (this.lastSetupIntent && this.lastSetupIntent !== id && !this.plannedFollowupMoveId) this.clearSetupIntent();
    this.lastSetupIntent = id;
    this.setupIntentDecisionsRemaining = Math.max(2, this.plannedSetupActions.length + 1);
    this.setupIntentPendingAttempt = false;
    void ai;
  }
  noteMoveResult(move: Move, landed: boolean, target: Side, ai: Side, res: TargetResolution): void {
    if (landed) {
      this.lastSuccessfulMoveImpact = move.impact;
      this.lastSuccessfulMove = move;
      this.lastLandedFinisher = move.finisher;
      this.bigMoveFollowupOpportunity = move.impact >= 8;
      this.justLanded = move;
      if (this.targetFocus === null) {
        this.targetFocus = res.storyPart;
        ai.targetFocus = res.storyPart;
      }
    } else {
      this.lastSuccessfulMove = null;
      this.lastLandedFinisher = false;
    }
    void target;
    this.clearSetupIntent();
  }
  noteForcedFallback(ai: Side): void {
    this.setupCooldownTurns = 2;
    ai.consecutiveSetupActions = 0;
    this.clearSetupIntent();
  }
  noteMandatoryRecovery(ai: Side): void {
    this.forcedRecoveries++;
    ai.consecutiveSetupActions = 0;
    this.clearSetupIntent();
  }
  private clearSetupIntent(): void {
    this.lastSetupIntent = null;
    this.setupIntentDecisionsRemaining = 0;
    this.setupIntentPendingAttempt = false;
    this.plannedSetupActions = [];
    this.plannedFollowupMoveId = '';
  }

  /* ---------- choose ---------- */

  choose(ai: Side, target: Side, moves: Move[], setups: SetupId[]): Candidate | null {
    if (this.setupCooldownTurns > 0) this.setupCooldownTurns--;
    const cover = this.coverAfterBigMove(ai, target) ?? this.objectivePriority(ai, target, setups);
    this.justLanded = null;
    if (cover) {
      this.clearSetupIntent();
      this.recordChoice(cover, ai);
      this.playerCrashOpportunity = this.reversalPinOpportunity = this.bigMoveFollowupOpportunity = false;
      return cover;
    }
    let candidates: Candidate[] = [];
    this.updateTargetFocus(ai, target, moves);
    const focus = this.targetFocus ?? 'NONE';
    for (const move of moves) {
      const res = resolveTarget(move, focus, target.hp);
      const readySpecial = (ai.finisherStock > 0 && isFinisherMove(ai, move)) || (ai.signatureReady && isSignatureMove(ai, move));
      candidates.push({ kind: 'move', move, target: res, score: this.scoreMove(ai, target, move, res), readySpecial });
    }
    candidates = this.applyTemporaryMoveBlock(candidates);
    let bestMoveScore = -Infinity;
    for (const c of candidates) bestMoveScore = Math.max(bestMoveScore, c.score);
    for (const action of setups) {
      if (moves.length && isRecovery(action)) continue;
      if (action === 'taunt' && this.rejectTaunt(ai, target, moves, bestMoveScore)) continue;
      const plan = this.bestSetupPlan(ai, target, action);
      candidates.push({ kind: 'setup', action, score: this.scoreSetup(ai, target, action, moves, plan), path: plan?.actions ?? [], plannedMove: plan?.move ?? null });
    }
    const pinScore = this.scorePin(ai, target, bestMoveScore);
    if (pinScore > -Infinity && canPin(this.S, this.k)) candidates.push({ kind: 'pin', score: pinScore });
    if (!candidates.length) {
      this.clearSetupIntent();
      return null;
    }
    const intentMoves = moves.filter((m) => this.intentMatchesMove(this.lastSetupIntent, m));
    if (this.lastSetupIntent && !intentMoves.length) {
      this.setupIntentDecisionsRemaining--;
      if (this.setupIntentDecisionsRemaining <= 0) this.clearSetupIntent();
    }
    let selected: Candidate | null = null;
    const readyMove = this.bestReadySpecialMove(candidates, ai);
    // Deviations from Godot (see NOTES.md): stop forcing the ready-special setup path once the
    // setup-loop breaker has tripped, or when a credible pin is on the table. Otherwise a reversed
    // first step (e.g. pick-up) can repeat indefinitely and the AI never covers a beaten opponent.
    const crediblePin = canPin(this.S, this.k) && (
      totalHp(target) <= 390 || staminaPercent(target) < 30 || target.fatigue >= 70 || this.phase === 'closing' || ai.lastMoveWasFinisher
    );
    // Also once the special's setup path has bounced off a forced recovery twice without a move in
    // between: the forced recovery resets the setup-loop breaker, so e.g. apron -> back in -> apron
    // for a springboard that doesn't fit would otherwise go on forever.
    const skipSpecialPath = ai.consecutiveSetupActions >= 3 || crediblePin || this.forcedRecoveries >= 2;
    const readySetup = readyMove || skipSpecialPath ? null : this.bestReadySpecialSetup(candidates, ai);
    if (readyMove) selected = readyMove;
    else if (readySetup) {
      this.clearSetupIntent();
      selected = readySetup;
    } else if (this.plannedSetupActions.length && !skipSpecialPath) {
      selected = this.candidateForSetup(candidates, this.plannedSetupActions[0]!);
      if (!selected) this.clearSetupIntent();
    } else if (intentMoves.length) selected = this.bestIntentMove(candidates, this.lastSetupIntent);
    else if (ai.consecutiveSetupActions >= 3) {
      if (moves.length) selected = { ...this.bestOfKind(candidates, 'move')!, forcedFallback: true, fallbackLog: 'commit' };
      else {
        selected = { ...this.bestRecovery(candidates), forcedFallback: true, fallbackLog: 'reset' };
        this.setupCooldownTurns = 2;
      }
      this.clearSetupIntent();
    }
    if (!selected) selected = this.weightedTop(candidates);
    if (!selected) return null;
    if (selected.kind === 'setup') {
      const path = selected.path ?? [];
      if (this.plannedSetupActions.length && this.plannedSetupActions[0] === selected.action) this.plannedSetupActions.shift();
      else if (!this.plannedSetupActions.length && path.length) {
        this.plannedSetupActions = path.slice(1);
        this.plannedFollowupMoveId = selected.plannedMove?.id ?? '';
      }
    }
    if (intentMoves.length) {
      if (selected.kind === 'move' && this.intentMatchesMove(this.lastSetupIntent, selected.move)) this.setupIntentPendingAttempt = true;
      else this.clearSetupIntent();
    }
    this.recordChoice(selected, ai);
    this.playerCrashOpportunity = false;
    this.reversalPinOpportunity = false;
    this.bigMoveFollowupOpportunity = false;
    return selected;
  }

  private recordChoice(c: Candidate, ai: Side): void {
    if (c.kind !== 'setup') this.forcedRecoveries = 0;
    if (c.kind === 'move') {
      this.recentAiMoveIds.push(c.move.id);
      while (this.recentAiMoveIds.length > MOVE_BLOCK_WINDOW) this.recentAiMoveIds.shift();
      this.recentSetupActions.push('');
      ai.consecutiveSetupActions = 0;
    } else if (c.kind === 'setup') {
      if (c.action === 'catch_breath' || isExtraSetup(c.action)) {
        this.recentSetupActions.push('');
        ai.consecutiveSetupActions = 0;
      } else {
        this.recentSetupActions.push(c.action);
        ai.consecutiveSetupActions++;
      }
    } else {
      this.lastLandedFinisher = false;
      this.recentSetupActions.push('');
      ai.consecutiveSetupActions = 0;
    }
    while (this.recentSetupActions.length > 3) this.recentSetupActions.shift();
  }

  private weightedTop(candidates: Candidate[]): Candidate | null {
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 5);
    if (!top.length) return null;
    const lowest = top[top.length - 1]!.score;
    const weights = top.map((c) => Math.max(1, c.score - lowest + 10));
    let roll = this.ctx.rnd() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < top.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return top[i]!;
    }
    return top[0]!;
  }

  private applyTemporaryMoveBlock(candidates: Candidate[]): Candidate[] {
    if (candidates.length <= 1 || !this.recentAiMoveIds.length) return candidates;
    const available: Candidate[] = [], blocked: Candidate[] = [];
    for (const c of candidates) {
      if (c.kind === 'move' && !c.readySpecial && this.recentAiMoveIds.includes(c.move.id)) blocked.push(c);
      else available.push(c);
    }
    if (available.length) return available;
    for (const old of this.recentAiMoveIds) {
      const released = blocked.filter((c) => c.kind === 'move' && c.move.id === old);
      if (released.length) return released;
    }
    return candidates;
  }

  private readyRank(ai: Side, m: Move | null | undefined): number {
    if (!m) return 0;
    if (ai.finisherStock > 0 && isFinisherMove(ai, m)) return 2;
    if (ai.signatureReady && isSignatureMove(ai, m)) return 1;
    return 0;
  }
  private bestReadySpecialMove(cs: Candidate[], ai: Side): Candidate | null {
    let best: Candidate | null = null, bestRank = 0;
    for (const c of cs) {
      if (c.kind !== 'move') continue;
      const r = this.readyRank(ai, c.move);
      if (r <= 0) continue;
      if (!best || r > bestRank || (r === bestRank && c.score > best.score)) {
        best = c;
        bestRank = r;
      }
    }
    return best;
  }
  private bestReadySpecialSetup(cs: Candidate[], ai: Side): Candidate | null {
    let best: Candidate | null = null, bestRank = 0, bestSteps = 999;
    for (const c of cs) {
      if (c.kind !== 'setup') continue;
      const r = this.readyRank(ai, c.plannedMove);
      if (r <= 0) continue;
      const steps = c.path?.length ?? 0;
      if (!best || r > bestRank || (r === bestRank && steps < bestSteps) || (r === bestRank && steps === bestSteps && c.score > best.score)) {
        best = c;
        bestRank = r;
        bestSteps = steps;
      }
    }
    return best;
  }
  private candidateForSetup(cs: Candidate[], id: SetupId): Candidate | null {
    let best: Candidate | null = null;
    for (const c of cs) if (c.kind === 'setup' && c.action === id && (!best || c.score > best.score)) best = c;
    return best;
  }
  private bestIntentMove(cs: Candidate[], intent: SetupId | null): Candidate | null {
    let best: Candidate | null = null;
    for (const c of cs) if (c.kind === 'move' && this.intentMatchesMove(intent, c.move) && (!best || c.score > best.score)) best = c;
    return best;
  }
  private bestOfKind(cs: Candidate[], kind: Candidate['kind']): Candidate | null {
    let best: Candidate | null = null;
    for (const c of cs) if (c.kind === kind && (!best || c.score > best.score)) best = c;
    return best;
  }
  private bestRecovery(cs: Candidate[]): Candidate {
    const priority: SetupId[] = [
      'stand_up', 'regain_composure', 'press_advantage', 'regain_footing', 'leave_corner', 'leave_ropes', 'return_to_ring',
      'return_from_ramp', 'pull_opponent_from_corner', 'pull_opponent_from_ropes', 'bring_opponent_into_ring',
      'catch_opponent_running', 'bring_match_back_to_ring', 'climb_down', 'stop_running', 'reset_stance',
    ];
    for (const id of priority) {
      const c = cs.find((x) => x.kind === 'setup' && x.action === id);
      if (c) return c;
    }
    return this.bestOfKind(cs, 'setup') ?? cs[0]!;
  }

  intentMatchesMove(intent: SetupId | null, m: Move): boolean {
    if (!intent) return false;
    if (this.plannedFollowupMoveId) return m.id === this.plannedFollowupMoveId;
    switch (intent) {
      case 'irish_whip': return m.req.t.motion === 'ROPE_REBOUND' || (m.req.t.areaMode === 'SPECIFIC' && m.req.t.area === 'ROPES');
      case 'throw_into_corner': return m.req.t.areaMode === 'SPECIFIC' && m.req.t.area === 'CORNER';
      case 'start_running': return m.type === 'RUNNING';
      case 'climb_top_rope': return m.type === 'AERIAL' || (m.req.a.areaMode === 'SPECIFIC' && m.req.a.area === 'TOP_ROPE');
      case 'wake_opponent': return m.type === 'AERIAL' && m.req.t.position === 'STANDING';
      case 'prepare_springboard': return m.type === 'SPRINGBOARD';
      case 'pick_opponent_up': case 'grapple_opponent': return m.type === 'GRAPPLE' || m.type === 'SUBMISSION';
    }
    return !isRecovery(intent) && intent !== 'taunt';
  }

  /* ---------- scoring ---------- */

  private updateTargetFocus(ai: Side, target: Side, moves: Move[]): void {
    const available: BodyPart[] = [];
    for (const m of moves) for (const p of BODY_PARTS) if (focusAppliesToMove(m, p) && !available.includes(p)) available.push(p);
    if (!available.length) {
      this.targetFocusUnavailableTurns++;
      if (this.targetFocusUnavailableTurns >= 2) {
        this.targetFocus = null;
        ai.targetFocus = 'NONE';
      }
      return;
    }
    const currentAvailable = this.targetFocus !== null && available.includes(this.targetFocus);
    if (currentAvailable) this.targetFocusUnavailableTurns = 0;
    else this.targetFocusUnavailableTurns++;
    let preferred = available[0]!, preferredScore = Infinity;
    const cls = ai.w.classes;
    for (const p of available) {
      let s = target.hp[p];
      if (cls.includes('POWERHOUSE') && (p === 'HEAD' || p === 'BODY')) s -= 6;
      if (cls.includes('TECHNICIAN') && isLimbFocus(p)) s -= 6;
      if (cls.includes('STRIKER')) {
        if (p === 'HEAD') s -= 6;
        else if (isLimbFocus(p)) s -= 3;
      }
      if (cls.includes('HIGH_FLYER')) s += 3;
      if (s < preferredScore) {
        preferredScore = s;
        preferred = p;
      }
    }
    let shouldSwitch = !currentAvailable && this.targetFocusUnavailableTurns >= 2;
    if (this.targetFocus === null) shouldSwitch = true;
    else if (currentAvailable) shouldSwitch = target.hp[preferred] <= target.hp[this.targetFocus] - 15;
    if (shouldSwitch) {
      this.targetFocus = preferred;
      this.targetFocusUnavailableTurns = 0;
      ai.targetFocus = preferred;
    }
  }

  private isSquashFinish(ai: Side, target: Side): boolean {
    if (this.lastLandedFinisher) return true;
    const dominant = ai.momentum >= 80 && target.momentum <= 20;
    const little = target.movesLanded <= 1 && target.damageDealt < 20;
    const established = ai.movesLanded >= 3;
    const worn = target.fatigue >= 55 || target.fatigue >= ai.fatigue + 20 || staminaPercent(target) <= 30;
    return dominant && little && established && worn && this.lastSuccessfulMoveImpact >= 8;
  }

  /**
   * Web-version addition: wrestlers cover after big moves. The weighted move scoring alone left the
   * AI covering about twice a match. The chance rises as the opponent wears down; a signature makes
   * it likely and a finisher all but certain. Covering twice in a row without landing anything in
   * between is rare.
   */
  private coverAfterBigMove(ai: Side, target: Side): Candidate | null {
    const m = this.justLanded;
    if (!m || m.submission || !canPin(this.S, this.k)) return null;
    const fin = isFinisherMove(ai, m), sig = isSignatureMove(ai, m);
    if (!fin && !sig && m.impact < 7) return null;
    let p = clamp((90 - pinCondition(target)) / 70, 0.1, 0.8);
    if (m.impact >= 9) p += 0.1;
    if (sig) p += 0.35;
    if (fin) p = 0.95;
    if (this.lastPinAttemptLandedCount >= 0 && ai.movesLanded - this.lastPinAttemptLandedCount <= 1) p *= 0.4;
    return this.ctx.rnd() < p ? { kind: 'pin', score: 0 } : null;
  }

  /**
   * Stipulation business that shouldn't be left to a weighted roll (Godot's objective priorities and
   * forced follow-throughs): grab the prize, go over the cage, make the referee count, knock them
   * off the ladder, finish a weapon trip, set up what you're holding.
   */
  private objectivePriority(ai: Side, target: Side, setups: SetupId[]): Candidate | null {
    const S = this.S, stip = S.rules.stipulation, has = (id: SetupId) => setups.includes(id);
    const pickSetup = (id: SetupId): Candidate => ({ kind: 'setup', action: id, score: 999 });
    const down = ['GROUNDED', 'SEATED', 'KNEELING'].includes(target.state.position);
    for (const id of ['reach_for_prize', 'escape_over_cage', 'tip_ladder', 'begin_standing_count', 'climb_ladder_top', 'clear_table', 'clear_thumbtacks'] as SetupId[]) {
      if (has(id) && (id !== 'climb_ladder_top' || stip === 'ladder')) return pickSetup(id);
    }
    if (has('reach_cage_top') && this.ctx.rnd() < 0.6) return pickSetup('reach_cage_top');
    const want = stip === 'ladder' ? 'LADDER' : stip === 'tables' ? 'TABLE' : null;
    const held = heldBy(S, this.k);
    if (!held && want && has('pick_up_weapon') && objectsIn(S, ai.state.area, ['dropped']).some((o) => weaponOf(o).kind === want)) return pickSetup('pick_up_weapon');
    if (has('retrieve_weapon') && ai.state.area === 'OUTSIDE') {
      const best = chooseAiWeapon(S, this.k);
      if (best && (want ? best.kind === want : aiWantsWeaponsHere(S) || ai.weaponTrips > 0)) return pickSetup('retrieve_weapon');
    }
    if (held) {
      const kind = weaponOf(held).kind;
      // The prize hangs over the ring, and tables are no use where the fight isn't: take them inside.
      if ((kind === 'LADDER' || kind === 'TABLE') && kind === want && ai.state.area !== 'IN_RING' && has('return_to_ring')) return pickSetup('return_to_ring');
      if (kind === 'LADDER' && has('set_up_ladder') && ai.state.area === 'IN_RING' && this.ctx.rnd() < 0.7) return pickSetup('set_up_ladder');
      if (kind === 'TABLE' && stip === 'tables') {
        if (has('stack_table') && this.ctx.rnd() < 0.4) return pickSetup('stack_table');
        if (has('set_table_flat') && ai.state.area === 'IN_RING') return pickSetup('set_table_flat');
      }
      if (kind === 'THUMBTACKS' && has('spread_thumbtacks') && ai.state.area === 'IN_RING') return pickSetup('spread_thumbtacks');
    }
    if (stip === 'ladder' && has('climb_ladder') && (down || this.ctx.rnd() < 0.5)) return pickSetup('climb_ladder');
    if (stip === 'tables') {
      for (const id of ['lay_on_table', 'position_at_table', 'position_at_corner_table'] as SetupId[]) if (has(id) && this.ctx.rnd() < 0.8) return pickSetup(id);
    }
    if (has('position_over_thumbtacks') && this.ctx.rnd() < 0.5) return pickSetup('position_over_thumbtacks');
    // The cage is the way out, but most of a cage match is fought inside it.
    if (stip === 'steel_cage' && has('climb_cage') && this.ctx.rnd() < (down ? 0.2 : 0.03)) return pickSetup('climb_cage');
    if (has('ask_to_quit') && this.ctx.rnd() < (down ? 0.6 : 0.35)) return pickSetup('ask_to_quit');
    return null;
  }

  private pinSpacingModifier(ai: Side, moveId: string): number {
    if (this.lastPinAttemptLandedCount < 0) return 0;
    const since = Math.max(0, ai.movesLanded - this.lastPinAttemptLandedCount);
    let mod = since === 0 ? -58 : since === 1 ? -36 : since === 2 ? -18 : 0;
    mod -= Math.min(18, Math.max(0, ai.pinAttempts - 1) * 4);
    if (moveId && moveId === this.lastPinAttemptMoveId) mod -= 20;
    return mod;
  }

  private embeddedPinModifier(ai: Side, target: Side, m: Move): number {
    let mod = this.pinSpacingModifier(ai, m.id);
    const flash = m.flashPin || isFlashPinMove(m);
    const protectedEarly = !flash && !this.isSquashFinish(ai, target);
    if (this.phase === 'opening') mod -= 18;
    else if (this.phase === 'middle') mod -= 6;
    if (protectedEarly && target.hp.HEAD > 75 && target.hp.BODY > 75 && target.fatigue < 30) mod -= 24;
    if (flash) mod += 8;
    if (target.hp.HEAD < 50 || target.hp.BODY < 50) mod += 10;
    if (target.fatigue >= 60 || staminaPercent(target) < 40) mod += 10;
    return mod;
  }

  scoreMove(ai: Side, target: Side, m: Move, res: TargetResolution): number {
    let score = 50;
    const high = isHighRisk(m);
    const leg = Math.min(ai.hp.LEFT_LEG, ai.hp.RIGHT_LEG);
    if (high) {
      if (leg < 40) score -= 15;
      else if (leg < 60) score -= 8;
      if (target.momentum >= ai.momentum + 20) score -= 6;
    }
    score -= (100 - moveLandChance(ai, target, m, res)) * 0.08;
    const demand = moveDemand(m, isSignatureMove(ai, m));
    score += (executionChance(ai, m) - 70) * 0.22;
    const attr = moveAttributeProfile(ai, m);
    score += (attr.damageMultiplier - 1) * 80;
    score += attr.controlModifier * 0.65;
    score -= executionPenalty(ai, demand) * 0.65;
    score -= (staminaCostMultiplier(ai, demand) - 1) * 24;
    const x = combinedExhaustion(ai);
    if (demand === 'BASIC') score += x * 12;
    else if (demand === 'EXPLOSIVE') score -= x * 30;
    if (m.impact >= 9) score += 20;
    else if (m.impact >= 7) score += 14;
    else if (m.impact >= 4) score += 8;
    const hp = targetHp(target.hp, res);
    if (m.flashPin || m.pinningCombo) score += this.embeddedPinModifier(ai, target, m);
    score += hp < 25 ? 24 : hp < 45 ? 15 : hp < 70 ? 8 : 0;
    const weakest = weakestPart(target);
    if (res.parts.includes(weakest)) {
      const w = target.hp[weakest];
      score += w < 25 ? 40 : w < 50 ? 25 : 15;
    }
    if (this.targetFocus !== null && res.parts.includes(this.targetFocus)) score += m.submission ? 25 : 8;
    if (target.fatigue >= 80) {
      if (m.impact >= 7) score += 15;
      if (m.submission) score += 15;
    } else if (target.fatigue >= 60) {
      if (m.impact >= 7) score += 10;
      if (m.submission) score += 8;
    }
    const tp = staminaPercent(target);
    if (tp < 20) {
      if (m.submission || m.finisher) score += 18;
    } else if (tp < 40 && (m.submission || m.finisher)) score += 10;
    if (ai.momentum >= 70) {
      if (m.finisher) score += 35;
      if (m.impact >= 7) score += 12;
    } else if (ai.momentum >= 40) {
      if (m.impact >= 7) score += 8;
      if (m.submission) score += 6;
    } else if (ai.momentum < 20) score += high ? -10 : 8;
    if (lastAttemptedMoveMatches(ai, m)) score -= 20;
    if (recentMoveCount(ai, m, 8) >= 3) score -= 25;
    else if (recentMoveCount(ai, m, 5) >= 2) score -= 12;
    if (high) {
      score -= ai.w.classes.includes('HIGH_FLYER') ? 2 : 8;
      if (target.fatigue >= 70 || target.hp.HEAD < 40 || target.hp.BODY < 40) score += 10;
      if (ai.momentum >= 70) score += 8;
      if (m.finisher) score += 15;
      if (target.momentum > 80) score -= 20;
    }
    if (m.finisher) score += this.finisherBonus(ai, target, m, res);
    // A landed signature no longer banks a finisher, but it's still the big move of the match.
    else if (isSignatureMove(ai, m)) score += 45;
    if (m.submission) {
      score += attributeDelta(ai.w.stats.skill) * 8 * 0.6;
      score += this.submissionBonus(ai, target, m, res);
    }
    if (ai.consecutiveSetupActions >= 2) score += 80;
    if (this.lastSetupIntent && this.intentMatchesMove(this.lastSetupIntent, m)) {
      score += 60;
      if (m.finisher) score += 30;
      score += hp < 25 ? 25 : hp < 45 ? 18 : hp < 70 ? 10 : 0;
    }
    if (this.playerCrashOpportunity) {
      if (m.req.t.position === 'GROUNDED') score += 20;
      if (m.submission) score += 15;
      score += 10;
    }
    if (this.reversalPinOpportunity) score += m.impact >= 6 ? 14 : 8;
    if (this.bigMoveFollowupOpportunity) {
      if (m.submission) score += 14;
      else if (m.impact >= 6) score += 10;
    }
    if (m.finisher || m.submission || (exhaustionBand(ai) === 'Spent' && moveDemand(m) === 'BASIC')) score += this.phaseFinishBonus();
    score += this.stipulationMoveBonus(ai, m);
    return score;
  }

  /** Weapon shots and stipulation preferences (Godot's ai_profile bonuses). */
  private stipulationMoveBonus(ai: Side, m: Move): number {
    const S = this.S, stip = S.rules.stipulation;
    let b = 0;
    if (m.type === 'WEAPON') {
      b += stip === 'no_dq' ? 34 : 8;
      if (ai.w.classes.includes('HARDCORE')) b += 12;
      // Godot's AI swung in plain sight and got itself disqualified; this one waits for the ref to look away.
      if (S.rules.dq) b += S.ref.distracted > 0 ? 25 : -90;
    }
    if (stip === 'submission' && m.submission) b += 32;
    if (stip === 'i_quit' && m.submission) b += 25;
    if (stip === 'last_man_standing' && m.impact >= 8) b += 30;
    if (isLadderDive(S, this.k, m)) b += 20;
    return b;
  }

  private finisherBonus(ai: Side, target: Side, m: Move, res: TargetResolution): number {
    let b = 70;
    if (target.fatigue >= 60) b += 20;
    if (staminaPercent(target) < 40) b += 20;
    if (target.hp.BODY < 50 || target.hp.HEAD < 50) b += 20;
    if (this.phase === 'closing') b += 25;
    else if (this.phase === 'middle') b += 15;
    if (targetHp(target.hp, res) < 70) b += 20;
    if (recentMoveCount(ai, m, 3) > 0) b -= 20;
    return b;
  }

  private submissionBonus(ai: Side, target: Side, m: Move, res: TargetResolution): number {
    const hp = targetHp(target.hp, res);
    let b = 0;
    const context = hp < 70 || staminaPercent(target) < 40 || target.fatigue > 60 || ai.momentum > 50 || m.finisher || this.phase !== 'opening';
    if (!context) b -= 35;
    if (hp >= 80) b -= 30;
    else if (hp >= 60) b -= 15;
    if (hp < 25) b += 35;
    else if (hp < 45) b += 20;
    else if (hp < 70) b += 10;
    if (res.parts.includes(weakestPart(target))) b += 35;
    if (m.finisher) {
      b += 45;
      if (hp < 60) b += 20;
      if (staminaPercent(target) < 40) b += 20;
      if (target.fatigue > 60) b += 20;
    }
    const fresh = staminaPercent(target) >= 80 && target.fatigue <= 20;
    if (fresh) b -= m.finisher ? 12 : 30;
    if (!m.finisher && hp > 25) {
      if (this.phase === 'opening') b -= 55;
      else if (this.phase === 'middle') b -= 25;
    } else if (this.phase === 'closing') b += 15;
    return b;
  }

  private movesForStates(ai: Side, a: Snapshot, t: Snapshot): Move[] {
    return ai.all.filter((m) => moveMatchesSnapshots(m, a, t) && canUseMove(ai, m));
  }

  private bestSetupPlan(ai: Side, target: Side, action: SetupId): { actions: SetupId[]; move: Move } | null {
    let best: { actions: SetupId[]; move: Move } | null = null, bestScore = -Infinity;
    for (const p of findFollowupPaths(ai.all, ai.state, target.state, 2)) {
      if (!p.actions.length || p.actions[0] !== action) continue;
      if (!canUseMove(ai, p.move)) continue;
      if (this.recentAiMoveIds.includes(p.move.id) && this.readyRank(ai, p.move) <= 0) continue;
      let s = p.move.impact * 10 - (p.actions.length - 1) * 12;
      if (ai.finisherStock > 0 && isFinisherMove(ai, p.move)) s += 160;
      else if (ai.signatureReady && isSignatureMove(ai, p.move)) s += 140;
      else if (p.move.finisher) s += 35;
      if (p.move.submission) s += 8;
      if (s > bestScore) {
        bestScore = s;
        best = { actions: p.actions, move: p.move };
      }
    }
    return best;
  }

  private isMandatoryRecovery(id: SetupId, moves: Move[]): boolean {
    if (id === 'stand_up' || id === 'regain_footing' || id === 'regain_composure' || id === 'press_advantage' || id === 'reset_stance') return true;
    return isRecovery(id) ? !moves.length : false;
  }

  private hasHighValueFollowup(moves: Move[], target: Side): boolean {
    return moves.some((m) => m.finisher || (m.impact >= 6 && lowestTargetHp(target, m.parts.filter((p) => p !== 'NONE') as BodyPart[]) < 45));
  }

  private incomingTargetingContext(ai: Side, opponent: Side): { part: BodyPart; hp: number } | null {
    const part = mostTargetedPart(opponent);
    if (!part) return null;
    const total = opponent.targetAttackCounts[part] ?? 0, recent = recentTargetPartCount(opponent, part, 5), hp = ai.hp[part];
    if (total < 3 || recent < 2 || hp > 60) return null;
    return { part, hp };
  }

  /**
   * Weapons, objects, stipulation objectives, travel and dirty tactics. Godot's bonuses
   * (match_ai_decision_engine.gd) on the usual base of 40, plus a sense of the DQ risk Godot lacked.
   */
  scoreExtra(ai: Side, target: Side, id: SetupId, moves: Move[]): number {
    const S = this.S, stip = S.rules.stipulation, heel = ai.w.disposition === 'HEEL', hardcore = ai.w.classes.includes('HARDCORE');
    const weaponMatch = ['ladder', 'tables', 'no_dq', 'falls_count_anywhere', 'last_man_standing', 'i_quit'].includes(stip);
    const down = ['GROUNDED', 'SEATED', 'KNEELING'].includes(target.state.position);
    const held = heldBy(S, this.k);
    let score = 40;
    switch (id) {
      case 'retrieve_weapon':
        score += stip === 'ladder' ? 72 : stip === 'tables' ? 64 : stip === 'no_dq' ? 78 : weaponMatch ? 48 : 10;
        break;
      case 'pick_up_weapon': score += weaponMatch ? 62 : S.rules.dq ? -20 : 30; break;
      case 'drop_weapon': {
        const w = held ? weaponOf(held) : null;
        score -= 30;
        if (w && w.kind !== 'HANDHELD' && !extraSetups(S, this.k).some((x) => x.startsWith('set_') || x === 'stack_table' || x === 'spread_thumbtacks')) score += 50;
        break;
      }
      case 'set_table_flat': case 'set_table_corner': score += stip === 'tables' ? (ai.state.area === 'IN_RING' ? 70 : -40) : 45; break;
      case 'stack_table': score += stip === 'tables' ? 60 : 50; break;
      case 'set_up_ladder': score += stip === 'ladder' ? (ai.state.area === 'IN_RING' ? 90 : -60) : 40; break;
      case 'spread_thumbtacks': score += 45; break;
      case 'position_at_table': case 'lay_on_table': case 'position_at_corner_table': case 'position_over_thumbtacks':
        score += stip === 'tables' ? 75 : 50;
        if (ai.finisherStock > 0) score += 15;
        break;
      case 'clear_table': case 'clear_thumbtacks': score += 75; break;
      case 'climb_ladder': score += stip === 'ladder' ? 70 + (down ? 25 : 0) : 25; break;
      case 'climb_ladder_top': score += stip === 'ladder' ? 85 + (down ? 20 : 0) : 40; break;
      case 'reach_for_prize': score += 130; break;
      case 'climb_down_ladder':
        score += stip === 'ladder' ? -30 : moves.length ? -40 : 30;
        break;
      case 'tip_ladder': score += 95; break;
      case 'climb_cage': score += 10 + (down ? 20 : 0); break;
      case 'reach_cage_top': score += 62 + (down ? 20 : 0); break;
      case 'escape_over_cage': score += 110; break;
      case 'climb_down_cage': score -= 30; break;
      case 'enter_crowd': case 'fight_backstage': score += 18; break;
      case 'leave_crowd': case 'return_from_backstage': score += 8; break;
      case 'begin_standing_count': score += 90; break;
      case 'ask_to_quit': score += 82; break;
      case 'distract_referee':
        score += held && S.rules.dq && weaponOf(held).illegal ? 80 : heel ? 5 : -30;
        break;
      case 'remove_turnbuckle_pad': score += heel ? 5 : -30; break;
      default: {
        // Eye rakes, hair pulls, closed fists, chokes, the exposed turnbuckle.
        score += id === 'exposed_turnbuckle' ? 10 : -25;
        if (heel) score += 20;
        if (S.ref.distracted > 0) score += 20;
        if (S.rules.dq && S.ref.warnings[this.k] >= 2) score -= 70;
      }
    }
    if (hardcore && ['retrieve_weapon', 'pick_up_weapon', 'set_table_flat', 'stack_table', 'spread_thumbtacks', 'set_up_ladder'].includes(id)) score += 12;
    if (this.recentSetupActions.includes(id) && !['reach_for_prize', 'climb_ladder', 'climb_cage', 'tip_ladder'].includes(id)) score -= 60;
    return score;
  }

  scoreSetup(ai: Side, target: Side, id: SetupId, moves: Move[], plan: { actions: SetupId[]; move: Move } | null): number {
    if (isExtraSetup(id)) return this.scoreExtra(ai, target, id, moves);
    if (id === 'exit_ring' && aiWantsWeaponTrip(this.S, this.k)) {
      // Under the ring for a weapon (Godot's EXIT_RING scores).
      const stip = this.S.rules.stipulation;
      return 40 + (stip === 'ladder' ? 82 : stip === 'tables' ? 74 : 52) + (target.state.position === 'GROUNDED' ? 16 : 0)
        + (ai.w.classes.includes('HARDCORE') ? 14 : 0);
    }
    let score = 40;
    if (isContested(id)) score -= (100 - setupLandChance(ai, target, id)) * 0.08;
    score += setupScoringModifier(ai, id);
    const projected = projectAction(id, ai.state, target.state);
    const future = this.movesForStates(ai, projected.attacker, projected.target);
    if (!future.length && plan) future.push(plan.move);
    const futureFinishers = future.filter((m) => m.finisher).length;
    const mandatory = this.isMandatoryRecovery(id, moves);
    if (!future.length && !mandatory && id !== 'taunt' && id !== 'catch_breath') score -= 70;
    const impact6 = future.some((m) => m.impact >= 6);
    const cls = ai.w.classes;
    switch (id) {
      case 'stand_up': score += target.state.position === 'STANDING' ? 100 : 70; break;
      case 'pick_opponent_up':
        score += 45;
        if (future.length >= 4) score += 20;
        if (futureFinishers) score += 20;
        if (staminaPercent(target) < 40) score += 15;
        if (target.fatigue > 60) score += 15;
        if (this.scorePin(ai, target, 0) >= 80) score -= 15;
        if (moves.length >= 3) score -= 10;
        if (this.playerCrashOpportunity) score += 15;
        break;
      case 'irish_whip':
        score += 45;
        if (future.length) score += 25;
        if (impact6) score += 15;
        if (cls.includes('POWERHOUSE') || cls.includes('STRIKER')) score += 10;
        break;
      case 'throw_into_corner':
        score += 45;
        if (future.length) score += 25;
        if (futureFinishers) score += 20;
        if (target.fatigue > 60) score += 10;
        break;
      case 'start_running':
        score += 35;
        if (future.length) score += 25;
        if (futureFinishers) score += 15;
        break;
      case 'climb_top_rope':
        score += 35;
        if (future.length) score += 30;
        if (futureFinishers) score += 25;
        if (target.momentum > 70) score -= 15;
        break;
      case 'prepare_springboard':
        score += 35;
        if (future.length) score += 30;
        if (futureFinishers) score += 20;
        break;
      case 'wake_opponent':
        score += 50;
        if (future.length) score += 35;
        if (futureFinishers) score += 45;
        if (moves.length) score -= 25;
        break;
      case 'return_to_ring': case 'climb_down':
        score += 20;
        if (!moves.length) score += 60;
        if (combinedExhaustion(ai) >= 0.7) score += 40;
        if (moves.length) score -= 30;
        break;
      case 'stop_running': case 'leave_corner': case 'regain_footing':
        score += moves.length ? 20 : 80;
        break;
      case 'grapple_opponent':
        if (future.length >= 4) score += 10;
        if (cls.includes('TECHNICIAN')) score += 10;
        break;
      case 'taunt': {
        score -= 35;
        score += target.state.position === 'GROUNDED' ? 30 : -20;
        const sp = staminaPercent(ai);
        if (sp < 35) score += 15;
        else if (sp < 60) score += 8;
        else if (sp > 80) score -= 10;
        if (ai.momentum < 30) score += 8;
        else if (ai.momentum <= 70) score += 4;
        else if (ai.momentum > 85) score -= 10;
        if (ai.state.area === 'APRON') score += 5;
        else if (ai.state.area === 'TOP_ROPE') score += 8;
        score += tauntProfile(ai).aiScoreModifier;
        if (ai.w.disposition === 'HEEL') score += 5;
        if ((ai.state.area === 'APRON' || ai.state.area === 'TOP_ROPE') && cls.includes('HIGH_FLYER')) score += 5;
        break;
      }
      case 'catch_breath': {
        score -= 20;
        const sp = staminaPercent(ai);
        score += sp < 20 ? 65 : sp < 40 ? 42 : 12;
        score += (1 - staminaRecoveryMultiplier(ai)) * -10;
        if (target.state.position === 'GROUNDED') score += 12;
        if (futureFinishers > 0 || this.scorePin(ai, target, 0) >= 70) score -= 90;
        break;
      }
    }
    const movement = ['start_running', 'climb_top_rope', 'prepare_springboard', 'step_to_ropes', 'send_opponent_outside', 'call_opponent_outside', 'take_fight_outside', 'fight_up_ramp'].includes(id);
    const highValue = this.hasHighValueFollowup(future, target);
    const x = combinedExhaustion(ai);
    if (movement && x >= 0.7) {
      let penalty = -45 * x;
      if (x >= 0.9) penalty = -80;
      if (highValue) penalty *= 0.25;
      score += penalty;
    } else if (mandatory && x >= 0.8) score += 15;
    else if (mandatory && x >= 0.6) score += 10;
    if (x >= 0.7 && mandatory) score += 8;
    if (ai.momentum < 20) score += 8;
    if (id !== 'catch_breath' && ai.consecutiveSetupActions >= 1) score -= 40;
    if (id !== 'catch_breath' && this.recentSetupActions.includes(id)) score -= 60;
    if (id !== 'catch_breath' && ai.consecutiveSetupActions >= 2 && !mandatory) score -= 75;
    if (id !== 'catch_breath' && this.setupCooldownTurns > 0 && !mandatory) score -= 100;
    if (movement && !mandatory) score -= this.phase === 'closing' ? 10 : this.phase === 'middle' ? 4 : 0;
    if (cls.includes('POWERHOUSE') && (id === 'irish_whip' || id === 'throw_into_corner')) score += 10;
    const threat = this.incomingTargetingContext(ai, target);
    if (threat) {
      if (id === 'irish_whip' || id === 'throw_into_corner' || id === 'grapple_opponent') score += 8;
      if (['stop_running', 'leave_corner', 'regain_footing', 'return_to_ring', 'climb_down', 'reset_stance'].includes(id)) score += 10;
      if (movement && (threat.part === 'LEFT_LEG' || threat.part === 'RIGHT_LEG')) score -= threat.hp < 40 ? 18 : 10;
    }
    return score;
  }

  scorePin(ai: Side, target: Side, bestMoveScore: number): number {
    if (ai.state.position !== 'STANDING' || target.state.position !== 'GROUNDED') return -Infinity;
    const flashPin = this.reversalPinOpportunity || isFlashPinMove(this.lastSuccessfulMove);
    const squash = this.isSquashFinish(ai, target);
    const protectedEarly = !flashPin && !squash && !this.lastLandedFinisher;
    const untouched = ai.damageDealt <= 0 && target.hp.HEAD > 90 && target.hp.BODY > 90 && target.fatigue < 25 && this.phase === 'opening' && protectedEarly;
    let s = 0;
    if (untouched) s -= 40;
    if (this.lastSuccessfulMoveImpact >= 6) s += 25;
    if (this.lastLandedFinisher) s += 45;
    if (flashPin) s += 65;
    if (squash) s += 65;
    if (target.hp.BODY < 50) s += 20;
    if (target.hp.HEAD < 50) s += 20;
    if (target.fatigue >= 80) s += 25;
    else if (target.fatigue >= 60) s += 15;
    const tp = staminaPercent(target);
    if (tp < 20) s += 25;
    else if (tp < 40) s += 15;
    if (this.phase === 'closing') s += 20;
    else if (this.phase === 'opening') s -= 20;
    else s -= 10;
    if (ai.damageDealt < 10 && protectedEarly) s -= 50;
    if (this.phase === 'opening' && protectedEarly) s -= 90;
    else if (this.phase === 'middle' && protectedEarly) s -= 25;
    if (protectedEarly && target.fatigue < 30 && target.hp.BODY > 75 && target.hp.HEAD > 75) s -= 25;
    if (ai.momentum < 30) s -= 20;
    if (bestMoveScore > 75) s -= 15;
    if (this.playerCrashOpportunity) s += 20;
    if (this.reversalPinOpportunity) s += 45;
    if (this.bigMoveFollowupOpportunity) s += 25;
    if (combinedExhaustion(ai) >= 0.7 && (target.hp.BODY < 70 || target.hp.HEAD < 70)) s += 10;
    s += this.pinSpacingModifier(ai, '');
    s += this.phaseFinishBonus();
    return s;
  }

  private rejectTaunt(ai: Side, target: Side, moves: Move[], bestMoveScore: number): boolean {
    if (this.S.t < ai.tauntCooldownUntil) return true;
    if (!moves.length) return true;
    if (moves.some((m) => m.finisher)) return true;
    if (this.scorePin(ai, target, bestMoveScore) >= 45) return true;
    return target.state.position === 'STANDING' && 100 - setupLandChance(ai, target, 'taunt') >= 45;
  }

  hasReadySpecialContinuation(ai: Side, target: Side, moves: Move[], setups: SetupId[]): boolean {
    if (moves.some((m) => this.readyRank(ai, m) > 0)) return true;
    if (!setups.length) return false;
    return findFollowupPaths(ai.all, ai.state, target.state, 2).some(
      (p) => p.actions.length > 0 && canUseMove(ai, p.move) && this.readyRank(ai, p.move) > 0 && setups.includes(p.actions[0]!),
    );
  }

  hasReachableOffensiveSetup(ai: Side, target: Side, setups: SetupId[]): boolean {
    if (!setups.length) return false;
    return findFollowupPaths(ai.all, ai.state, target.state, 2).some((p) => {
      const first = p.actions[0];
      return !!first && canUseMove(ai, p.move) && setups.includes(first) && !isRecovery(first) && first !== 'taunt' && first !== 'catch_breath';
    });
  }
}

/* ---------- the AI's turn (_perform_ai_decision) ---------- */

function specialStateRecovery(S: MatchState, k: SideKey, moves: Move[], setups: SetupId[]): SetupId | null {
  const A = S[k], D = S[other(k)], r = S.referee;
  if (S.rules.countOuts && r.active) {
    const remaining = S.rules.countOutLimit - r.value;
    if (sideIsOutside(S, k) && remaining <= 3 && setups.includes('return_to_ring')) return 'return_to_ring';
    if (!sideIsOutside(S, k) && sideIsOutside(S, other(k)) && remaining <= Math.max(3, Math.floor(S.rules.countOutLimit / 2)) && setups.includes('wait_for_count')) return 'wait_for_count';
  }
  if (moves.length) return null;
  // Objective and weapon business outranks tidying up.
  if (setups.some((id) => AI_PRIORITY_EXTRAS.has(id))) return null;
  const has = (id: SetupId) => setups.includes(id);
  const ap = A.state, dp = D.state;
  if ((ap.position === 'GROUNDED' || ap.position === 'SEATED' || ap.position === 'KNEELING') && has('stand_up')) return 'stand_up';
  if (ap.motion === 'RUNNING' && has('stop_running')) return 'stop_running';
  if (ap.motion === 'ROPE_REBOUND' && has('regain_footing')) return 'regain_footing';
  if (ap.motion === 'RISING' && has('regain_composure')) return 'regain_composure';
  if (dp.motion === 'RISING' && has('press_advantage')) return 'press_advantage';
  if ((dp.motion === 'RUNNING' || dp.motion === 'ROPE_REBOUND') && has('catch_opponent_running')) return 'catch_opponent_running';
  if (dp.area === 'CORNER' && has('pull_opponent_from_corner')) return 'pull_opponent_from_corner';
  if (dp.area === 'ROPES' && has('pull_opponent_from_ropes')) return 'pull_opponent_from_ropes';
  if ((dp.area === 'APRON' || dp.area === 'TOP_ROPE') && has('bring_opponent_into_ring')) return 'bring_opponent_into_ring';
  if (ap.area === 'TOP_ROPE' && has('climb_down')) return 'climb_down';
  if ((ap.area === 'APRON' || ap.area === 'ROPES' || ap.area === 'OUTSIDE' || ap.area === 'RAMP') && has('return_to_ring')) return 'return_to_ring';
  if (ap.area === 'CORNER' && has('leave_corner')) return 'leave_corner';
  for (const id of setups) if (isRecovery(id)) return id;
  return null;
}

function urgentCountOut(S: MatchState, k: SideKey, id: SetupId | null): boolean {
  if (!id || !S.rules.countOuts || !S.referee.active) return false;
  const remaining = S.rules.countOutLimit - S.referee.value;
  if (id === 'return_to_ring' && sideIsOutside(S, k) && remaining <= 3) return true;
  return id === 'wait_for_count' && !sideIsOutside(S, k) && sideIsOutside(S, other(k)) && remaining <= Math.max(3, Math.floor(S.rules.countOutLimit / 2));
}

export function isValidChoice(S: MatchState, k: SideKey, c: Choice): boolean {
  if (c.kind === 'move') return moveIsValid(S, k, c.move);
  if (c.kind === 'setup') return validSetups(S, k).includes(c.action);
  return canPin(S, k);
}

/** One AI decision for side k, executed. */
export function aiTurn(ctx: Ctx, k: SideKey): void {
  const S = ctx.S, A = S[k], D = S[other(k)], brain = ctx.ai[k];
  const moves = validMoves(S, k);
  const setups = validSetups(S, k);
  const ready = A.signatureReady || A.finisherStock > 0;
  const forced = specialStateRecovery(S, k, moves, setups);
  let specialContinuation = false, offensiveContinuation = false;
  if (forced) {
    if (ready) specialContinuation = brain.hasReadySpecialContinuation(A, D, moves, setups);
    if (!specialContinuation) offensiveContinuation = brain.hasReachableOffensiveSetup(A, D, setups);
  }
  if (forced && (urgentCountOut(S, k, forced) || (!specialContinuation && !offensiveContinuation))) {
    brain.noteMandatoryRecovery(A);
    ctx.hooks.onAiChoice?.(k, { kind: 'setup', action: forced, score: 0 }, true);
    executeSetup(ctx, k, forced);
    return;
  }
  const choice = brain.choose(A, D, moves, setups);
  ctx.hooks.onAiChoice?.(k, choice, choice ? isValidChoice(S, k, choice) : true);
  if (choice?.fallbackLog === 'commit') say(ctx, LINES.aiCommit, { a: k }, 'dim');
  if (choice?.fallbackLog === 'reset') say(ctx, LINES.aiReset, { a: k }, 'dim');
  if (choice?.kind === 'move' && executeMove(ctx, k, choice.move, choice.target)) return;
  if (choice?.kind === 'setup' && executeSetup(ctx, k, choice.action)) return;
  if (choice?.kind === 'pin' && startPin(ctx, k, false)) return;
  aiFallback(ctx, k);
}

function aiFallback(ctx: Ctx, k: SideKey): void {
  const S = ctx.S, A = S[k];
  ctx.ai[k].noteForcedFallback(A);
  advanceClock(ctx);
  if (S.over) return;
  say(ctx, LINES.aiCircles, { a: k }, 'dim');
  A.state = { position: 'STANDING', orientation: 'FRONT', area: 'IN_RING', motion: 'STATIONARY' };
  setControl(ctx, 'neutral');
  afterAction(ctx);
}
