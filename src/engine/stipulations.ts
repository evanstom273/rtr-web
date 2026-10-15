// The stipulation catalogue (MatchStipulationCatalogue) and rule normalisation
// (MatchRules.apply_stipulation_defaults + MatchStipulationHandler.normalize_rules).
import type { MatchRulesConfig, StipulationId } from './types';

export interface Stipulation {
  id: StipulationId;
  name: string;
  /** One line for the match builder. */
  blurb: string;
  pins: boolean;
  subs: boolean;
  countOuts: boolean;
  dq: boolean;
  weapons: boolean;
  /** The match is won by an objective (ladder grab, table break, cage escape, ten count, I quit). */
  objective: boolean;
  /** Falls are scored instead of ending the match. */
  multiFall: boolean;
}

const S = (
  id: StipulationId, name: string, blurb: string,
  [pins, subs, countOuts, dq, weapons]: [boolean, boolean, boolean, boolean, boolean],
  extra: Partial<Pick<Stipulation, 'objective' | 'multiFall'>> = {},
): Stipulation => ({ id, name, blurb, pins, subs, countOuts, dq, weapons, objective: !!extra.objective, multiFall: !!extra.multiFall });

export const STIPULATIONS: Stipulation[] = [
  S('standard', 'Standard', 'Pinfall, submission, count-out or DQ.', [true, true, true, true, true]),
  S('no_dq', 'No Disqualification', 'Anything goes. Weapons are legal.', [true, true, true, false, true]),
  S('tables', 'Tables', 'Put your opponent through a table to win.', [false, false, false, false, true], { objective: true }),
  S('ladder', 'Ladder', 'Climb the ladder and pull down the prize.', [false, false, false, false, true], { objective: true }),
  S('submission', 'Submission Match', 'The only way to win is to make them tap.', [false, true, false, false, false]),
  S('steel_cage', 'Steel Cage', 'Escape over the top, or win by pin or submission.', [true, true, false, false, false], { objective: true }),
  S('falls_count_anywhere', 'Falls Count Anywhere', 'Pins and submissions count anywhere in the building.', [true, true, false, false, true]),
  S('iron_man', 'Iron Man', 'Most falls when time runs out wins.', [true, true, true, true, true], { multiFall: true }),
  S('two_out_of_three', 'Two out of Three Falls', 'First to two falls wins.', [true, true, true, true, true], { multiFall: true }),
  S('last_man_standing', 'Last Man Standing', 'Keep them down for a ten count.', [false, false, false, false, true], { objective: true }),
  S('i_quit', 'I Quit', 'Make them say it.', [false, true, false, false, true], { objective: true }),
];

const byId = new Map(STIPULATIONS.map((s) => [s.id, s]));
export const stipulation = (id: StipulationId): Stipulation => byId.get(id) ?? STIPULATIONS[0]!;

export const IRON_MAN_MINUTES = [10, 15, 20, 30, 60];

export const DEFAULT_STIPULATION_RULES = {
  stipulation: 'standard' as StipulationId,
  dq: true,
  weapons: true,
  pins: true,
  subs: true,
  ironManMinutes: 20,
  ladderPrize: 'Briefcase' as 'Championship' | 'Briefcase',
  cageEscape: true,
  cagePins: true,
  cageSubs: true,
};

/** DQs and count-outs are only the builder's call in Standard and No DQ; elsewhere the stipulation sets them. */
export const rulesEditable = (id: StipulationId): boolean => id === 'standard' || id === 'no_dq';

/** Force each feature off where the stipulation forbids it (never back on), as Godot does. */
export function normaliseRules(r: MatchRulesConfig): MatchRulesConfig {
  const def = stipulation(r.stipulation);
  const out = { ...r };
  if (!rulesEditable(def.id)) {
    out.countOuts = def.countOuts;
    out.dq = def.dq;
  }
  out.countOuts = out.countOuts && def.countOuts;
  out.dq = out.dq && def.dq;
  out.weapons = out.weapons && def.weapons;
  out.pins = def.pins;
  out.subs = def.subs;
  if (def.id === 'steel_cage') {
    if (!out.cageEscape && !out.cagePins && !out.cageSubs) out.cageEscape = true;
    out.pins = out.cagePins;
    out.subs = out.cageSubs;
  }
  if (out.titleId || out.title) out.ladderPrize = 'Championship';
  return out;
}
