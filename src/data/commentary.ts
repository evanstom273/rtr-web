import type { BodyPart, MoveCat, SetupId } from '../engine/types';

/*
 * Commentary templates.
 *
 * Template syntax (see engine/commentary.ts):
 *   {a}  attacker's name     {d}  defender's name
 *   {am} "a"/"an" + move name, move name emphasised
 *   {x}, {n}, {event} …  plain text parameters
 *   <g>…</g>  gold          <G>…</G>  gold, big
 */

export const T: Readonly<Record<MoveCat | 'rev' | 'crash', readonly string[]>> = {
  strike: ['{a} lights up {d} with {am}.', '{a} fires off {am}.', '{am} from {a} rocks {d}.', '{a} cracks {d} with {am}.'],
  grapple: ['{a} plants {d} with {am}.', '{a} drops {d} hard with {am}.', '{a} hits {am} on {d}.', '{a} snatches {d} into {am}.'],
  air: ['{a} takes flight with {am}!', '{am} from {a} connects!', '{a} soars in with {am}.'],
  brawl: ['{a} hits {am} out on the floor.', '{a} with {am}. The front row scatters.', '{am}! {a} is taking this somewhere ugly.'],
  hold: ['{a} grinds away with {am}.', '{a} slows things down with {am}.'],
  rev: ['{d} sees {am} coming and counters.', '{d} blocks {am} and turns it around.', '{d} slips out of {am}.', '{d} shuts down {am} before it starts.'],
  crash: ['{a} goes for {am} and there is nobody home. {a} crashes hard.', '{a} flies with {am} and eats nothing but canvas.'],
};

/** Limb damage milestones. {d} is the wrestler taking the damage. */
export const MILE: Readonly<Record<BodyPart, Readonly<Record<50 | 25, string>>>> = {
  head: { 50: '{d} is seeing stars.', 25: '{d} is out on their feet. That head is in a bad way.' },
  body: { 50: '{d} is clutching at the ribs.', 25: '{d} can barely breathe through that midsection.' },
  arm: { 50: "{d}'s arm is starting to hang.", 25: "{d} can't lift that arm any more." },
  leg: { 50: '{d} is limping now.', 25: '{d} can barely stand on that leg.' },
};

export const LINES = {
  matchIntro: '{event}, {venue}.',
  titleOnLine: ' The {title} is on the line.',
  versus: '{a} versus {d}. The referee checks both wrestlers.',
  bell: '<g>DING DING.</g> Here we go.',
  firstLockUp: '{a} wins the first lock-up.',

  sigReady: "{a}'s signature is ready.",
  comeback: '{a} is mounting a comeback!',
  bothBackIn: 'Both wrestlers dive back in at nine. The referee is not impressed.',
  refCountOutside: "The referee's count is up to {n}.",

  crowdGroans: "The crowd groans. That's the fourth {x}.",
  finCountered: '{d} counters the finisher and steals the moment.',
  finHit: '<G>{x}!!</G> {a} hits it!',
  sigHit: '<g>{x}!</g> {a} lands the signature. Finisher banked.',
  targetNotePrefixes: ['Right back on the', 'Another shot to the', 'Still going after the'],
  targetNote: " {x} {part}. That's {n} now.",
  aiFinSetup: '{a} is setting up for the {x}…',

  neutralOpeners: [
    'Both wrestlers need a second.',
    'They trade shots in the middle of the ring.',
    'A breather for both. The crowd claps them on.',
    'They scramble back to their feet.',
  ],
  neutralWinner: ' {a} gets the upper hand.',
  reset: '{a} backs off to reset.',

  tauntPunished: '{a} takes too long showing off and {d} makes them pay.',
  tauntHeel: ['{a} soaks up the boos.', '{a} tells the crowd exactly what they think of them.', '{a} shushes the whole building.'],
  tauntFace: ["{a} plays to the crowd, and they're right there with it.", '{a} soaks in the cheers.', '{a} gets the whole place clapping.'],
  breath: '{a} backs off to catch a breath.',
  cheap: [
    "{a} rakes the eyes behind the referee's back.",
    '{a} goes low while the referee is looking elsewhere.',
    '{a} yanks a handful of hair. The referee somehow misses it.',
  ],
  fireUp: '{a} is FIRED UP! The crowd comes unglued.',

  rollUp: '{a} rolls {d} up out of nowhere!',
  cover: ['{a} hooks the leg…', 'Cover by {a}…', '{a} goes for the cover…'],
  earlyPin: "The crowd knows that isn't ending it.",
  kickoutOne: '{d} kicks out at one.',
  kickoutTwo: 'Kickout at two by {d}!',
  kickoutNear: '<g>KICKOUT AT 2.9!</g> {d} survives!',

  trapped: '{d} is trapped in {am}!',
  nearTap: '{d} was a breath away from tapping.',
  escape: ['{d} fights free!', '{d} breaks the hold!', '{d} powers out of it!'],
  rope: '{d} gets a hand on the bottom rope. The hold is broken.',

  pinWinMove: '<G>ONE, TWO, THREE!</G> {a} wins with {am}.',
  pinWin: '<G>ONE, TWO, THREE!</G> {a} wins.',
  subWin: '<G>{x} TAPS!</G> {a} wins with {am}.',
} as const;

export const CHANTS = {
  holyShit: { text: 'HOLY SHIT!' },
  sucks: { text: '{x} SUCKS!' },
  fightForever: { text: 'FIGHT FOREVER!', tail: 'The whole building is on its feet.' },
  awesome: { text: 'THIS IS AWESOME!', tail: 'clap clap, clap-clap-clap' },
} as const;

export const FLASH = {
  reversed: 'Reversed',
  kickout: 'Kickout',
  firedUp: 'Fired up',
  three: 'Three!',
  tapOut: 'Tap out',
} as const;

export interface SetupText {
  name: string;
  hint: string;
  line?: string;
  revLine?: string;
}

export const SETUP_TEXT: Readonly<Record<SetupId, SetupText>> = {
  pickup: { name: 'Pick them up', hint: 'Drag them to their feet', line: '{a} drags {d} back to their feet.', revLine: "{d} fights out of {a}'s grip and pulls them down." },
  whip: { name: 'Irish whip to the corner', hint: 'Trap them in the corner', line: '{a} whips {d} hard into the corner.', revLine: '{d} reverses the whip. {a} eats the turnbuckles instead.' },
  climb: { name: 'Climb the turnbuckles', hint: 'Go up top', line: '{a} heads up top.', revLine: '{d} cuts {a} off on the way up and sends them crashing down.' },
  down: { name: 'Climb down', hint: 'Abandon the top rope', line: '{a} thinks better of it and climbs down.' },
  floor: { name: 'Send them to the floor', hint: 'Toss them over the top rope', line: '{a} dumps {d} over the top rope to the floor.', revLine: '{d} hangs on to the top rope and fights back.' },
  follow: { name: 'Follow them out', hint: 'Take it to the floor', line: '{a} goes out after {d}.' },
  wait: { name: 'Let them back in', hint: 'Make them come to you', line: '{a} waits as {d} rolls back under the bottom rope.' },
  rollin: { name: 'Roll them back in', hint: 'Back in the ring with them down', line: '{a} rolls {d} back into the ring and slides in after.' },
  getin: { name: 'Get back in the ring', hint: 'Beat the count', line: '{a} slides back into the ring.' },
  taunt: { name: 'Play to the crowd', hint: "Noise and momentum, but you're open" },
  breath: { name: 'Catch your breath', hint: 'Stamina back, control up for grabs' },
  cheap: { name: 'Cheap shot', hint: "Behind the referee's back" },
  fire: { name: 'Fire up', hint: 'Your comeback. Once per match' },
  reset: { name: 'Back off and reset', hint: 'Both back to neutral' },
};

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
