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
  // Match overhaul, stage 5.
  S('street_fight', 'Street Fight', 'No DQ, no count-outs, weapons everywhere. Falls count in the ring and at ringside.', [true, true, false, false, true]),
  S('no_holds_barred', 'No Holds Barred', 'No rules at all: no DQ, no count-outs, anything goes.', [true, true, false, false, true]),
  S('texas_death', 'Texas Death', 'A pin or a submission only starts a ten count. Stay down and you lose.', [true, true, false, false, true], { objective: true }),
  S('first_blood', 'First Blood', 'The first one to bleed loses.', [false, false, false, false, true], { objective: true }),
  S('deathmatch', 'Deathmatch', 'Barbed wire, light tubes, glass and tacks. No DQ, no count-outs.', [true, true, false, false, true]),
  S('casket', 'Casket Match', 'Put them in the casket and shut the lid.', [false, false, false, false, true], { objective: true }),
  S('ambulance', 'Ambulance Match', 'Put them in the ambulance and shut the doors.', [false, false, false, false, true], { objective: true }),
  S('stretcher', 'Stretcher Match', 'Strap them to the stretcher and wheel them past the line.', [false, false, false, false, true], { objective: true }),
  S('strap', 'Strap Match', 'Tied together by a leather strap. Touch all four corners in a row to win.', [false, false, false, false, true], { objective: true }),
  S('dog_collar', 'Dog Collar Match', 'Chained together at the neck. Pinfall or submission.', [true, true, false, false, true]),
  S('bull_rope', 'Bull Rope Match', 'Tied together by a bull rope, cowbell and all. Pinfall or submission.', [true, true, false, false, true]),
  S('lumberjack', 'Lumberjack Match', 'Surrounded by lumberjacks: leave the ring and they throw you back in.', [true, true, false, true, false]),
  S('pole', 'Object on a Pole', 'Something hangs on a pole in the corner. Climb up and get it, and it’s legal.', [true, true, false, true, false]),
  // Stage 6: structures.
  S('hell_in_a_cell', 'Hell in a Cell', 'A roofed steel cell around the ring. Falls count anywhere inside it; no DQ. Someone always ends up on top of it.', [true, true, false, false, true]),
  S('elimination_chamber', 'Elimination Chamber', 'Two start; the rest are locked in pods and let out one at a time. Pinfall or submission puts you out.', [true, true, false, false, false]),
  S('wargames', 'WarGames', 'Two teams, two rings, one cage. They come in one at a time; once everyone’s in, the first fall wins.', [true, true, false, false, true]),
  S('scaffold', 'Scaffold Match', 'Fought on a scaffold high above the ring. Knock them off to win.', [false, false, false, false, false], { objective: true }),
  S('ultimate_x', 'Ultimate X', 'Climb up to the cables strung over the ring and crawl out to pull down the X.', [false, false, false, false, false], { objective: true }),
  S('tlc', 'Tables, Ladders and Chairs', 'Climb the ladder and pull down the prize. Tables, ladders and chairs are all fair game.', [false, false, false, false, true], { objective: true }),
  S('money_in_the_bank', 'Money in the Bank', 'A ladder match for the briefcase: a title shot whenever you like, for a year.', [false, false, false, false, true], { objective: true }),
];

const byId = new Map(STIPULATIONS.map((s) => [s.id, s]));
/** Ladder matches: the original, TLC and Money in the Bank (all won by pulling down what's hanging). */
export const isLadderStip = (id: StipulationId): boolean => id === 'ladder' || id === 'tlc' || id === 'money_in_the_bank';
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
