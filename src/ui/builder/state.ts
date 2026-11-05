import { store } from '../../storage/storage';
import type { MatchConfig, MatchType, StipulationId } from '../../engine';
import type { TeamKey } from './useDragSort';

/** What kind of match the builder's making (match overhaul): teams against teams, or a field of everyone for themselves. */
export type MatchKind = 'singles' | 'tag' | 'tornado' | 'handicap' | 'elim_tag' | 'triple' | 'fourway' | 'multi' | 'battle_royal' | 'rumble' | 'gauntlet';
export interface KindInfo {
  label: string;
  /** 'teams': A against B (and C, D); 'field': you in A, everyone in B for themselves. */
  mode: 'teams' | 'field';
  /** Team mode: per team. Field mode: how many others in the field. */
  min: number;
  max: number;
  type: MatchType;
  tag?: boolean;
  elimination?: boolean;
}
export const KINDS: Record<MatchKind, KindInfo> = {
  singles: { label: 'Singles', mode: 'teams', min: 1, max: 1, type: 'singles' },
  tag: { label: 'Tag team', mode: 'teams', min: 2, max: 5, type: 'tag', tag: true },
  tornado: { label: 'Tornado tag', mode: 'teams', min: 2, max: 5, type: 'tornado' },
  handicap: { label: 'Handicap', mode: 'teams', min: 1, max: 3, type: 'handicap', tag: true },
  elim_tag: { label: 'Elimination tag', mode: 'teams', min: 2, max: 5, type: 'tag', tag: true, elimination: true },
  triple: { label: 'Triple threat', mode: 'field', min: 2, max: 2, type: 'triple' },
  fourway: { label: 'Fatal four-way', mode: 'field', min: 3, max: 3, type: 'fourway' },
  multi: { label: 'Multi-man', mode: 'field', min: 4, max: 7, type: 'multi' },
  battle_royal: { label: 'Battle royal', mode: 'field', min: 4, max: 29, type: 'battle_royal' },
  rumble: { label: 'Rumble', mode: 'field', min: 5, max: 29, type: 'rumble' },
  gauntlet: { label: 'Gauntlet', mode: 'field', min: 2, max: 9, type: 'gauntlet' },
};
export const ALL_TEAMS: TeamKey[] = ['A', 'B', 'C', 'D'];

/** How many can go on team t. */
export function maxOn(s: BuilderState, t: TeamKey): number {
  const k = KINDS[s.matchType];
  if (k.mode === 'field') return t === 'A' ? 1 : t === 'B' ? k.max : 0;
  if (t === 'C' || t === 'D') return ALL_TEAMS.indexOf(t) < s.teamCount ? k.max : 0;
  return k.max;
}

/**
 * How many a random team gets: a team at the match's minimum (or what it already has, if more), and a field of a
 * sensible size (a Rumble 20, a battle royal 12, whatever the multi-man needs).
 */
export function randomSize(s: BuilderState, t: TeamKey): number {
  const k = KINDS[s.matchType];
  if (k.mode === 'field' && t === 'A') return 1;
  // A handicap: one (or two) against more; the bigger side's B.
  if (s.matchType === 'handicap') return Math.min(maxOn(s, t), t === 'A' ? 1 : 2);
  const want = k.mode === 'field' ? (s.matchType === 'rumble' ? 20 : s.matchType === 'battle_royal' ? 12 : s.matchType === 'gauntlet' ? 4 : k.min) : k.min;
  return Math.min(maxOn(s, t), Math.max(want, s.teams[t].length));
}

/** The teams in play for this kind of match. */
export const teamsInPlay = (s: BuilderState): TeamKey[] => (KINDS[s.matchType].mode === 'field' ? ['A', 'B'] : ALL_TEAMS.slice(0, s.teamCount));

/** What's missing before the bell, or '' when it's ready. */
export function builderProblem(s: BuilderState): string {
  const k = KINDS[s.matchType], T = s.teams;
  if (!T.A.length) return k.mode === 'field' ? 'Pick who you’re playing.' : 'Team A needs a wrestler.';
  if (k.mode === 'field') {
    if (T.B.length < k.min) return `${k.label}: add ${k.min - T.B.length} more to the field (${k.min}${k.max > k.min ? `–${k.max}` : ''}).`;
    return '';
  }
  for (const t of teamsInPlay(s)) {
    if (T[t].length < k.min) return `${k.label}: team ${t} needs ${k.min === k.max ? k.min : `at least ${k.min}`}.`;
  }
  if (s.matchType === 'handicap' && T.A.length === T.B.length) return 'Handicap: the teams need to be different sizes.';
  return '';
}

/** The engine's set-up for what's on the builder: you, the first opponent, everyone else, and how it's played. */
export function matchSides(s: BuilderState): Pick<MatchConfig, 'you' | 'them' | 'extras' | 'type' | 'player'> & { rules: Partial<MatchConfig['rules']> } | null {
  if (builderProblem(s)) return null;
  const k = KINDS[s.matchType], T = s.teams;
  const you = T.A[0]!;
  const extras: { id: string; team: number }[] = [];
  let them: string;
  if (k.mode === 'field') {
    them = T.B[0]!;
    T.B.slice(1).forEach((id, i) => extras.push({ id, team: i + 2 }));
  } else {
    them = T.B[0]!;
    T.A.slice(1).forEach((id) => extras.push({ id, team: 0 }));
    T.B.slice(1).forEach((id) => extras.push({ id, team: 1 }));
    teamsInPlay(s).slice(2).forEach((t, i) => T[t].forEach((id) => extras.push({ id, team: i + 2 })));
  }
  const rules: Partial<MatchConfig['rules']> = {};
  if (k.tag) rules.tag = true;
  if (k.elimination || (s.elimination && (k.mode === 'field' || s.matchType === 'tornado'))) rules.elimination = true;
  if (s.matchType === 'rumble') rules.entryEvery = s.entryEvery;
  if (s.stipulation === 'pole' && s.poleObject) rules.poleObject = s.poleObject;
  return { you, them, extras, type: s.matchType === 'singles' ? undefined : k.type, player: s.watch ? null : 'you', rules };
}

/** The match builder's choices, kept while the app is open (they reset on every load). */
export interface BuilderState {
  /** Match overhaul: the kind of match, how many teams (team kinds), elimination, the Rumble's clock, the pole, and watching it AI vs AI. */
  matchType: MatchKind;
  teamCount: 2 | 3 | 4;
  elimination: boolean;
  entryEvery: number;
  poleObject: string;
  watch: boolean;
  teams: Record<TeamKey, string[]>;
  locked: Record<TeamKey, boolean>;
  /** 'auto' = from the wrestlers; '' = independent show; otherwise promotion initials. */
  event: string;
  /** '' = non-title. */
  titleId: string;
  actionClock: number;
  countOuts: boolean;
  countOutLimit: number;
  stipulation: StipulationId;
  dq: boolean;
  ironManMinutes: number;
  ladderPrize: 'Championship' | 'Briefcase';
  cageEscape: boolean;
  cagePins: boolean;
  cageSubs: boolean;
}

/** Where older versions saved the builder; cleared on load. */
const KEY = 'rtr-builder';
export const MAX_TEAM = 4;

export const DEFAULT_BUILDER: BuilderState = {
  matchType: 'singles', teamCount: 2, elimination: false, entryEvery: 90, poleObject: 'brass_knuckles', watch: false,
  teams: { A: [], B: [], C: [], D: [] }, locked: { A: false, B: false, C: false, D: false }, event: 'auto', titleId: '', actionClock: 20, countOuts: true, countOutLimit: 10,
  stipulation: 'standard', dq: true, ironManMinutes: 20, ladderPrize: 'Briefcase', cageEscape: true, cagePins: true, cageSubs: true,
};

/**
 * A fresh builder: no wrestlers picked, a standard singles match. The app starts here on every load
 * (Lyra's call); picks only last while the app is open. Older versions saved the builder, so clear
 * whatever they left behind.
 */
export function freshBuilder(): BuilderState {
  store.remove(KEY);
  store.remove('rtr-picks');
  return { ...DEFAULT_BUILDER, teams: { A: [], B: [], C: [], D: [] }, locked: { A: false, B: false, C: false, D: false } };
}
