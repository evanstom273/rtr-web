import type { SetupId } from '../engine/types';

/*
 * Commentary templates. Lines are ported from the Godot match controller (simple_match_ui.gd);
 * the chants and the star-rating copy come from Match of the Night.
 *
 * Template syntax (see engine/commentary.ts):
 *   {a}  attacker's name     {d}  defender's name
 *   {m}  move name, emphasised
 *   {x}, {n}, {part} …  plain text parameters
 *   <g>…</g>  gold          <G>…</G>  gold, big
 */

export const LINES = {
  bell: '<g>The bell rings.</g> {a} and {d} square up in the centre of the ring.',
  intro: '{event}, {venue}.',
  titleOnLine: ' The {title} is on the line.',

  clean: '{a} plants {d} with {m}.',
  cleanLimb: '{a} plants {d} with {m}, driving the attack into the {part}.',
  finisherHit: '<G>{x}!</G> {a} hits it!',
  signatureHit: '<g>{x}!</g> {a} lands the signature.',
  reversal: '{d} counters {m} and takes control.',
  crash: '{a} commits to {m}, but {d} moves clear. {a} crashes hard to the mat.',
  finisherStock: '{a} turns the finisher reversal into finisher stock ({n}/3).',
  signatureConverted: '{a} converts the signature into finisher stock ({n}/3).',
  signatureReady: "{a}'s signature is ready.",
  critical: "{d}'s {part} is in critical condition after the sustained punishment.",
  threshold: "{a} has done visible damage to {d}'s {part}.",
  repeated: '{a} keeps returning to the {part}; that is now a deliberate target.',
  subDanger: 'With the {part} already damaged, this submission is especially dangerous.',
  heroic: '{a} finds one last burst of energy and somehow lands the attack.',
  lowStamina: '{a} is visibly running out of energy.',
  highFatigue: '{a} is struggling to recover between exchanges.',
  spent: '{a} is completely spent.',
  cannotMaintain: '{a} cannot maintain control after the effort.',

  recoveryDelayed: '{a} tries to recover, but exhaustion keeps them down for another beat.',
  neutralDelayed: '{a} struggles to recover, and neither wrestler can claim control yet.',
  neutralStood: '{a} pushes back to their feet first and takes control.',
  neutralInitiative: '{a} regains the initiative and takes control.',
  catchBreath: '{a} backs away, catches their breath, and recovers {n} stamina.',
  waitForCount: '{a} stays safely inside and urges the referee to keep counting.',
  aiCircles: '{a} circles, looking for an opening.',
  aiCommit: '{a} abandons the extra setup and commits to the attack.',
  aiReset: '{a} breaks off the looping setup and resets their stance.',

  tauntTop: ['{a} takes a moment on the top rope, soaking in the reaction.', '{a} rises above the ring and plays to the crowd from the top turnbuckle.'],
  tauntApron: ['{a} showboats from the apron and feeds off the crowd.', '{a} pauses on the apron, daring the crowd to get louder.'],
  tauntTired: '{a} shakes out their arms and fights to recover their composure.',
  tauntStalk: '{a} stalks around the ring, daring their opponent to get up.',
  tauntFired: '{a} fires up and demands a louder reaction from the crowd.',
  tauntStanding: ['{a} plays to the crowd.', '{a} takes a few precious seconds to showboat.', '{a} fires themselves up in the centre of the ring.'],
  tauntInterruptedTop: '{a} poses on the top rope, but {d} recovers and shakes them down!',
  tauntInterruptedApron: '{a} plays to the crowd from the apron, but {d} cuts them off and forces them back inside!',
  tauntInterrupted: ['{a} plays to the crowd, but {d} cuts them off!', '{a} wastes too much time taunting, and {d} takes advantage.', '{a} taunts too long and gets caught by {d}.'],
  setupReversedWhip: '{d} reverses the Irish whip and sends {a} into the ropes instead.',
  setupReversedCorner: '{d} reverses the throw and drives {a} into the corner instead.',
  setupReversedPickup: '{a} reaches down, but {d} was waiting and pulls them into a counter.',
  setupReversed: '{d} counters the setup and takes control.',

  pinHook: '{a} hooks the leg!',
  pinSurprise: '{a} catches {d} by surprise!',
  count1: 'ONE!',
  count2: 'TWO!',
  kickoutBeforeOne: '{d} powers out before one!',
  kickoutOneEarly: '{d} kicks out at one, nowhere near finished yet.',
  kickoutAt: '{d} kicks out at {x}!',
  nearlyHadIt: '{a} nearly had it.',
  kickoutLate: '<g>THREE—NO!</g> {d} kicks out at the last possible moment!',
  resiliency: '{d} summons one last burst of <g>Resiliency</g> and survives the {x}!',

  subTrapped: '{a} traps {d} in {m}, attacking the {part}!',
  subEscape: '{d} claws free and breaks the hold.',
  subScramble: 'The hold breaks down into a scramble.',
  subGiving: "{d}'s {part} is giving way under the submission pressure.",
  subGaining: '{a} cranks back harder on the hold.',
  subFighting: '{d} fights toward an escape.',
  subNearTap: '{d} is fading fast.',
  subNearEscape: '{d} is almost free.',

  countStart: 'The referee begins the count.',
  countReset: 'The count is broken; both wrestlers are safely inside.',
  countLate: '{a} dives back inside at {n}!',
  countBack: '{a} gets back inside the ring.',
  countOneAway: 'They are one count away from losing the match on the floor.',
  countOut: "That's {n}! {d} has been counted out.",
  doubleCountOut: 'Neither wrestler made it back — the referee calls for the bell.',

  pinWin: '<G>ONE, TWO, THREE!</G> {a} wins{x}.',
  subWin: '<G>{x} TAPS!</G> {a} wins with {m}.',
} as const;

export const COUNT_WORDS = ['', 'ONE!', 'TWO!', 'THREE!', 'FOUR!', 'FIVE!', 'SIX!', 'SEVEN!', 'EIGHT!', 'NINE!', 'TEN!'];
export const COUNT_PHRASE = ['', 'one', 'two', 'three'];

const SETUP_LOG: Partial<Record<SetupId, string>> = {
  stand_up: '{a} pushes back to their feet.',
  start_running: '{a} hits the ropes and builds speed.',
  climb_top_rope: '{a} climbs to the top rope and measures {d}.',
  prepare_springboard: '{a} steps onto the apron and sets for a springboard attack.',
  return_to_ring: '{a} returns to the ring and resets their stance.',
  climb_down: '{a} returns to the ring and resets their stance.',
  pick_opponent_up: '{a} drags {d} back to their feet.',
  grapple_opponent: '{a} ties up with {d}.',
  irish_whip: '{a} sends {d} into the ropes with an Irish whip.',
  throw_into_corner: '{a} drives {d} into the corner.',
  wake_opponent: '{a} calls {d} back to their feet from the top rope.',
  stop_running: '{a} slows down and resets their stance.',
  leave_corner: '{a} steps out of the corner.',
  regain_footing: '{a} comes off the ropes and regains their footing.',
  regain_composure: '{a} takes a moment to regain their composure.',
  press_advantage: '{a} closes in as {d} steadies themselves.',
  step_to_ropes: '{a} steps onto the ropes and measures the distance to the floor.',
  leave_ropes: '{a} steps away from the ropes and returns inside.',
  get_behind_opponent: '{a} circles behind {d} and takes rear control.',
  turn_opponent_face_up: '{a} turns {d} face-up on the mat.',
  turn_opponent_face_down: '{a} turns {d} face-down on the mat.',
  sit_opponent_up_front: '{a} hauls {d} into a seated position.',
  sit_opponent_up_back: '{a} hauls {d} into a seated position.',
  pull_opponent_to_knees_front: '{a} pulls {d} up onto their knees.',
  pull_opponent_to_knees_back: '{a} pulls {d} up onto their knees.',
  turn_opponent_in_corner: '{a} turns {d} around in the corner.',
  seat_opponent_in_corner: '{a} forces {d} down against the turnbuckles.',
  lean_opponent_on_ropes_front: '{a} positions {d} against the ropes.',
  lean_opponent_on_ropes_back: '{a} positions {d} against the ropes.',
  drape_opponent_on_ropes_front: '{a} drapes {d} across the ropes.',
  drape_opponent_on_ropes_back: '{a} drapes {d} across the ropes.',
  place_opponent_on_apron_front: '{a} forces {d} out onto the apron.',
  place_opponent_on_apron_back: '{a} forces {d} out onto the apron.',
  set_opponent_on_top_rope_front: '{a} climbs with {d} and positions them on the top rope.',
  set_opponent_on_top_rope_back: '{a} climbs with {d} and positions them on the top rope.',
  send_opponent_outside: '{a} sends {d} out to the floor.',
  call_opponent_outside: '{a} calls {d} out to ringside, and they step through the ropes to meet them.',
  exit_ring: '{a} steps through the ropes and drops to the floor alone.',
  take_fight_outside: '{a} takes the fight with {d} to the outside.',
  fight_up_ramp: '{a} drives the fight with {d} up the ramp.',
  return_from_ramp: '{a} brings the fight back from the ramp.',
  bring_match_back_to_ring: '{a} brings {d} back inside and resets the in-ring battle.',
  pull_opponent_from_corner: '{a} pulls {d} out of the corner and back into the ring.',
  pull_opponent_from_ropes: '{a} drags {d} away from the ropes and back into open space.',
  bring_opponent_into_ring: '{a} brings {d} down and back into the ring.',
  catch_opponent_running: "{a} cuts off {d}'s run and stops them in their tracks.",
  call_opponent_running: '{a} calls {d} forward from the top rope.',
};

export const setupLogLine = (id: SetupId): string => SETUP_LOG[id] ?? `{a} uses ${SETUP_TEXT[id].title.toLowerCase()} to create an opening.`;

export interface SetupText {
  title: string;
  description: string;
}

export const SETUP_TEXT: Record<SetupId, SetupText> = {
  stand_up: { title: 'STAND UP', description: 'Return to standing without changing area.' },
  start_running: { title: 'START RUNNING', description: 'Build speed in the current flat area.' },
  stop_running: { title: 'STOP RUNNING / RESET STANCE', description: 'Slow down without leaving the current area.' },
  regain_footing: { title: 'REGAIN FOOTING', description: 'Recover from the forced rope rebound.' },
  regain_composure: { title: 'REGAIN COMPOSURE', description: 'Shake off the transient motion state.' },
  press_advantage: { title: 'CLOSE IN ON OPPONENT', description: 'Use one action while the opponent finishes rising.' },
  climb_top_rope: { title: 'CLIMB TOP ROPE', description: 'Perch on the top rope for an aerial attack.' },
  climb_down: { title: 'CLIMB DOWN', description: 'Return to a standing in-ring position.' },
  prepare_springboard: { title: 'STEP TO APRON', description: 'Move to the apron for a springboard attack.' },
  step_to_ropes: { title: 'STEP TO ROPES', description: 'Set at the ropes for a springboard to the floor.' },
  leave_ropes: { title: 'LEAVE ROPES', description: 'Step away from the ropes and return inside.' },
  return_to_ring: { title: 'RETURN TO RING', description: 'Return to a neutral standing position inside the ring.' },
  leave_corner: { title: 'LEAVE CORNER', description: 'Step away from the corner.' },
  pick_opponent_up: { title: 'PICK OPPONENT UP', description: 'Bring the opponent to standing in their current area.' },
  wake_opponent: { title: 'CALL OPPONENT TO THEIR FEET', description: 'Remain perched while the opponent rises.' },
  get_behind_opponent: { title: 'GET BEHIND OPPONENT', description: 'Move into rear control for standing-back offence.' },
  irish_whip: { title: 'IRISH WHIP', description: 'Send the opponent into a rope rebound without changing flat area.' },
  turn_opponent_face_up: { title: 'TURN OPPONENT FACE UP', description: 'Roll the grounded opponent onto their back.' },
  turn_opponent_face_down: { title: 'TURN OPPONENT FACE DOWN', description: 'Roll the grounded opponent onto their front.' },
  sit_opponent_up_front: { title: 'SIT OPPONENT UP — FRONT', description: 'Position the opponent seated and facing you.' },
  sit_opponent_up_back: { title: 'SIT OPPONENT UP — BACK', description: 'Position the opponent seated with their back exposed.' },
  pull_opponent_to_knees_front: { title: 'PULL TO KNEES — FRONT', description: 'Position the opponent kneeling and facing you.' },
  pull_opponent_to_knees_back: { title: 'PULL TO KNEES — BACK', description: 'Position the kneeling opponent with their back exposed.' },
  throw_into_corner: { title: 'SEND OPPONENT INTO CORNER', description: 'Drive the opponent into a front-facing corner position.' },
  turn_opponent_in_corner: { title: 'TURN OPPONENT IN CORNER', description: "Expose the opponent's back in the corner." },
  seat_opponent_in_corner: { title: 'SEAT OPPONENT IN CORNER', description: 'Leave the opponent seated against the turnbuckles.' },
  lean_opponent_on_ropes_front: { title: 'LEAN ON ROPES — FRONT', description: 'Position the standing opponent front-first at the ropes.' },
  lean_opponent_on_ropes_back: { title: 'LEAN ON ROPES — BACK', description: 'Position the standing opponent back-first at the ropes.' },
  drape_opponent_on_ropes_front: { title: 'DRAPE ON ROPES — FRONT', description: 'Leave the opponent kneeling front-first on the ropes.' },
  drape_opponent_on_ropes_back: { title: 'DRAPE ON ROPES — BACK', description: "Leave the kneeling opponent's back exposed at the ropes." },
  place_opponent_on_apron_front: { title: 'PLACE ON APRON — FRONT', description: 'Move the standing opponent to the apron facing you.' },
  place_opponent_on_apron_back: { title: 'PLACE ON APRON — BACK', description: 'Move the standing opponent to the apron with their back exposed.' },
  set_opponent_on_top_rope_front: { title: 'SET ON TOP ROPE — FRONT', description: 'Position both wrestlers on top with the opponent facing front.' },
  set_opponent_on_top_rope_back: { title: 'SET ON TOP ROPE — BACK', description: 'Position both wrestlers on top with the opponent facing back.' },
  send_opponent_outside: { title: 'SEND OPPONENT OUTSIDE', description: 'Leave the opponent standing outside while you remain inside.' },
  call_opponent_outside: { title: 'CALL OPPONENT OUTSIDE', description: 'Draw the in-ring opponent out to meet you at ringside.' },
  exit_ring: { title: 'EXIT RING', description: 'Leave the ring by yourself while the opponent stays where they are.' },
  take_fight_outside: { title: 'TAKE THE FIGHT OUTSIDE', description: 'Move both wrestlers to the floor.' },
  fight_up_ramp: { title: 'FIGHT UP THE RAMP', description: 'Move the outside fight onto the ramp.' },
  return_from_ramp: { title: 'RETURN FROM RAMP', description: 'Bring both wrestlers back to ringside.' },
  bring_match_back_to_ring: { title: 'BRING MATCH BACK TO RING', description: 'Recover a stranded match state inside the ring.' },
  pull_opponent_from_corner: { title: 'PULL OPPONENT FROM CORNER', description: 'Bring the opponent out of the corner and back to a usable in-ring stance.' },
  pull_opponent_from_ropes: { title: 'PULL OPPONENT FROM ROPES', description: 'Pull the opponent away from the ropes and back into the ring.' },
  bring_opponent_into_ring: { title: 'BRING OPPONENT INTO RING', description: 'Bring an opponent down from the apron or top rope into a standing in-ring stance.' },
  catch_opponent_running: { title: 'CUT OFF OPPONENT', description: "Intercept the opponent's run and force them back to a stationary stance." },
  call_opponent_running: { title: 'CALL OPPONENT FORWARD', description: 'Draw the opponent into a run beneath the top rope.' },
  wait_for_count: { title: 'STAY INSIDE / LET REFEREE COUNT', description: 'Remain safely inside while the referee continues counting.' },
  grapple_opponent: { title: 'GRAPPLE OPPONENT', description: 'Tie up with the opponent in the centre of the ring.' },
  reset_stance: { title: 'RESET STANCE', description: 'Use the safe match fallback and return both wrestlers inside.' },
  taunt: { title: 'TAUNT / PLAY TO CROWD', description: 'Showboat for stamina and momentum.' },
  catch_breath: { title: 'CATCH BREATH', description: 'Recover short-term stamina, then return the match to neutral.' },
};

/** Area-aware taunt label. */
export function tauntTitle(area: string): string {
  if (area === 'TOP_ROPE') return 'TOP-ROPE TAUNT';
  if (area === 'APRON') return 'APRON TAUNT';
  if (area === 'OUTSIDE' || area === 'RAMP') return 'RINGSIDE TAUNT';
  return SETUP_TEXT.taunt.title;
}

/** Setup page groups, as in the Godot Setup / Showboat menu. */
export type SetupGroup = 'MOVEMENT' | 'OPPONENT SETUP' | 'RING POSITION' | 'RECOVERY' | 'SHOWBOAT';
export function setupGroup(id: SetupId): SetupGroup {
  switch (id) {
    case 'start_running': case 'climb_top_rope': case 'prepare_springboard': case 'step_to_ropes':
      return 'MOVEMENT';
    case 'exit_ring': case 'take_fight_outside': case 'send_opponent_outside': case 'call_opponent_outside':
    case 'fight_up_ramp': case 'return_from_ramp': case 'wait_for_count':
      return 'RING POSITION';
    case 'taunt': case 'catch_breath':
      return 'SHOWBOAT';
    case 'stand_up': case 'stop_running': case 'regain_footing': case 'regain_composure': case 'leave_corner':
    case 'climb_down': case 'return_to_ring': case 'leave_ropes': case 'bring_match_back_to_ring': case 'reset_stance':
      return 'RECOVERY';
    default:
      return 'OPPONENT SETUP';
  }
}

export const CHANTS = {
  holyShit: { text: 'HOLY SHIT!' },
  sucks: { text: '{x} SUCKS!' },
  fightForever: { text: 'FIGHT FOREVER!', tail: 'The whole building is on its feet.' },
  awesome: { text: 'THIS IS AWESOME!', tail: 'clap clap, clap-clap-clap' },
} as const;


/* ---------- rating copy (plain text; {x} etc. are text params) ---------- */

export const RATING = {
  parts: { crowd: 'Crowd', story: 'Story', drama: 'Drama', action: 'Action', finish: 'Finish' },
  crowdNote: 'Averaged {avg}, peaked at {peak}.',
  story: {
    heatSeg: '{x} had a proper heat segment',
    noHeatSeg: 'No one ever really took over',
    comeback: '{x} came back',
    noComeback: 'no comeback',
    limb: 'worked the {part} ×{n}{tail}',
    limbPaid: ', and it paid off',
    limbUnpaid: ', but it never paid off',
    noLimb: 'no limb work',
    repeats: '{n} repeated move{s}',
  },
  drama: '{nf} near-fall{nfs} · {rev} reversal{revs} · {fr} finisher{frs} countered.',
  action: '{high} high-risk spot{highs}, {spots} on the floor, {mins} minutes.',
  finish: {
    afterFk: 'They kicked out of one finisher and not the next. Textbook.',
    earned: 'Earned. That finish meant something.',
    tooSoon: 'A finisher, but the crowd felt it came too soon.',
    stolen: 'Stolen with a roll-up late on. Cheeky, and it works.',
    tooEarly: 'Over far too early. The crowd wanted more.',
    tapped: 'Tapped out. Fair enough.',
    plain: 'A big move and a pin. It did the job.',
  },
  labels: {
    offScale: 'Off the scale',
    motn: 'Match of the night',
    strong: 'Strong showing',
    solid: 'Solid outing',
    needsWork: 'Needs work',
    goHome: 'Go home early',
  },
  verdicts: {
    offScale: 'A man with a newsletter has just broken his own scale. People will argue about this one for years.',
    v45: 'People will be talking about this one for years.',
    v4: 'Match of the night, no contest.',
    v3: "Good stuff. Nobody's leaving disappointed.",
    v2: 'It happened. The crowd will mostly remember the hot dogs.',
    low: "Someone's getting a talking-to in the back.",
  },
  recap: {
    intro: '{event}, {venue}.',
    title: ' The {title} was on the line.',
    heatSeg: '{dom} took over the middle of the match{tail}.',
    heatSegLimb: ", going after {vic}'s {part}",
    comeback: '{x} fought from underneath and turned it around{tail}.',
    comebackCrowd: ' with the whole building behind them',
    nf: '{n} near-fall{s}{tail}.',
    nfFk: ', {fk} of them out of a finisher',
    finRev: '{n} finisher{s} countered.',
    won: '{w} won it at {t}{how}{sub}.',
    wonWithMove: ' with the {move}',
    wonPin: ' with a pinfall',
    wonSub: ' by submission',
  },
} as const;

export const PHASES = {
  over: 'Full time',
  finishing: 'Finishing stretch',
  comeback: 'Comeback',
  control: '{x} in control',
  feelingOut: 'Feeling out',
  backAndForth: 'Back and forth',
} as const;

export const HEAT_WORDS: readonly (readonly [number, string])[] = [
  [25, 'Dead'],
  [45, 'Polite'],
  [65, 'Into it'],
  [80, 'Rocking'],
  [92, 'Unglued'],
  [Infinity, 'Off the charts'],
];

export const PART_LABEL = {
  HEAD: 'head', BODY: 'midsection', LEFT_ARM: 'left arm', RIGHT_ARM: 'right arm', LEFT_LEG: 'left leg', RIGHT_LEG: 'right leg',
} as const;

export const POSITION_LABEL = {
  NONE: '—', STANDING: 'Standing', GROUNDED: 'Grounded', SEATED: 'Seated', KNEELING: 'Kneeling', PERCHED: 'Perched', CLIMBING: 'Climbing',
} as const;
export const ORIENTATION_LABEL = { NONE: '—', FRONT: 'Front', BACK: 'Back', FACE_UP: 'Face up', FACE_DOWN: 'Face down' } as const;
export const AREA_LABEL = {
  IN_RING: 'In Ring', CORNER: 'Corner', ROPES: 'Ropes', APRON: 'Apron', OUTSIDE: 'Outside', RAMP: 'Ramp', TOP_ROPE: 'Top Rope',
  LADDER: 'Ladder', CROWD: 'Crowd', BACKSTAGE: 'Backstage', CAGE: 'Cage',
} as const;
export const MOTION_LABEL = { STATIONARY: 'Stationary', RUNNING: 'Running', ROPE_REBOUND: 'Rope rebound', RISING: 'Rising', STAGGERING: 'Staggering' } as const;
export const CLASS_LABEL = { HIGH_FLYER: 'High Flyer', POWERHOUSE: 'Powerhouse', TECHNICIAN: 'Technician', STRIKER: 'Striker', HARDCORE: 'Hardcore' } as const;
