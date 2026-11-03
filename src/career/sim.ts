// Every match the world needs, run through the real match engine with both sides on the AI.
import { applyDatabase, type Database } from '../data/rtr';
import { runHeadless } from '../engine/sim/runHeadless';
import type { FinishType, MatchRulesConfig, SideKey, SideStats } from '../engine/types';
import type { MatchEngine } from '../engine/match';

export interface SimJob {
  key: string;
  seed: number;
  you: string;
  them: string;
  rules: Partial<MatchRulesConfig>;
}

export type StatLine = Pick<SideStats, 'movesTried' | 'movesLanded' | 'finTried' | 'finHit' | 'sigTried' | 'sigHit' | 'reversalTries' | 'reversalWins' | 'kickouts' | 'pinTries'>
  & Partial<Pick<SideStats, 'highTried' | 'taunts' | 'dirty' | 'rests' | 'fk' | 'holds'>>;

export interface SimOut {
  key: string;
  winner: SideKey | null;
  finish: FinishType;
  t: number;
  stars: number;
  move?: string;
  stats: Record<SideKey, StatLine>;
}

const line = (s: SideStats): StatLine => ({
  movesTried: s.movesTried, movesLanded: s.movesLanded, finTried: s.finTried, finHit: s.finHit, sigTried: s.sigTried, sigHit: s.sigHit,
  reversalTries: s.reversalTries, reversalWins: s.reversalWins, kickouts: s.kickouts, pinTries: s.pinTries,
  highTried: s.highTried, taunts: s.taunts, dirty: s.dirty, rests: s.rests, fk: s.fk, holds: s.holds,
});

/** The engine's own summary of a finished match. */
export function outOf(key: string, e: MatchEngine): SimOut {
  const S = e.state, R = S.result;
  return {
    key,
    winner: R?.winner ?? null,
    finish: R?.finish ?? 'TIME_DECISION',
    t: R?.t ?? S.t,
    stars: S.rating?.stars ?? 2,
    move: R?.move?.name,
    stats: { you: line(S.you.stats), them: line(S.them.stats) },
  };
}

/** A timing model for the auto-player: a decent human. */
const MODEL = { kind: 'skill', sigmaSeconds: 0.1 } as const;

export function simOne(job: SimJob): { out: SimOut; engine: MatchEngine } {
  const r = runHeadless({ seed: job.seed, you: job.you, them: job.them, model: MODEL, rules: job.rules as MatchRulesConfig });
  return { out: outOf(job.key, r.engine), engine: r.engine };
}

export function simJobs(jobs: SimJob[], db?: Database): SimOut[] {
  if (db) applyDatabase(db);
  return jobs.map((j) => simOne(j).out);
}
