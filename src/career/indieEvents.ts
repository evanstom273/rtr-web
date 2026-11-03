// The Indie Scene: not a promotion with a calendar but a worldwide pool of one-off independent
// shows. This builds their names, procedurally, from word pools and several patterns, with local
// flavour for some countries, and keeps away from real promotions' event names.
import { WRESTLERS } from '../data/rtr';
import type { Rng } from '../engine';

/** Every country the roster comes from (the indies run everywhere). */
export const INDIE_COUNTRIES: readonly string[] = [...new Set(WRESTLERS.map((w) => w.country))].filter((c) => c && c !== 'Other').sort();

const pick = <T>(rnd: Rng, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;

const ADJ = [
  'Midnight', 'Savage', 'Brutal', 'Reckless', 'Relentless', 'Ruthless', 'Violent', 'Electric', 'Burning', 'Iron', 'Steel', 'Golden',
  'Wild', 'Lawless', 'Final', 'Total', 'Bitter', 'Fearless', 'Hostile', 'Furious', 'Crimson', 'Hardcore', 'Heavy', 'Desperate',
  'Dangerous', 'Glorious', 'Bloody', 'Wicked', 'Rowdy', 'Mean Street', 'Gritty', 'Unholy', 'Feral', 'Fierce', 'Cold-Blooded',
  'Rough', 'Fiery', 'Mighty', 'Scorched', 'Hard-Hitting',
];
const NOUN = [
  'Mayhem', 'Reckoning', 'Showdown', 'Uprising', 'Carnage', 'Collision', 'Chaos', 'Fury', 'Glory', 'Vendetta', 'Retribution',
  'Redemption', 'Rebellion', 'Inferno', 'Warfare', 'Stampede', 'Ascension', 'Rampage', 'Uproar', 'Havoc', 'Onslaught', 'Gauntlet',
  'Crossfire', 'Spectacle', 'Siege', 'Standoff', 'Throwdown', 'Brawl', 'Bash', 'Riot', 'Rumble', 'Warpath', 'Grudge Match',
  'Bloodbath', 'Ruckus', 'Melee', 'Smash', 'Fallout', 'Clash', 'Feud', 'Slugfest', 'Free-for-All', 'Shake-Up',
];
const DAYS = ['Friday', 'Saturday', 'Sunday', 'Thursday'];
const SHOWCASE = ['Showcase', 'Spectacular', 'Brawl', 'Throwdown', 'Slam', 'Fights', 'Special', 'Shootout', 'Rumble', 'Fight Night'];
const PHRASES = [
  'No Turning Back', 'Fight for Glory', 'Point of No Return', 'Nothing to Lose', 'All or Nothing at All', 'Live and Let Die',
  'Blood, Sweat and Tears', 'The Hard Way', 'One Night Only', 'Leave It All in the Ring', 'Sink or Swim', 'Do or Die',
  'Back to Basics', 'Fight or Flight', 'Win or Go Home', 'Burn It Down', 'Collision Course', 'No Holds Barred',
  'Pride and Glory', 'The Road Less Travelled', 'Nowhere to Hide', 'Into the Fire', 'Out of the Shadows', 'Under the Lights',
  'Ring of Fire', 'Thicker Than Water', 'Heart of the Matter', 'Bad Blood Rising', 'Kings of the Underground', 'The Long Way Home',
];
/** Verb phrases, paired by hand so they always make sense. */
const DO_THINGS = [
  'Raise the Roof', 'Settle the Score', 'Bring Down the House', 'Shake the Rafters', 'Rattle the Cage', 'Storm the Gates',
  'Claim the Throne', 'Light Up the Night', 'Crash the Party', 'Break the Barricade', 'Tear the House Down', 'Own the Night',
  'Take No Prisoners', 'Hold the Line', 'Run the Gauntlet', 'Fight the Power', 'Draw First Blood', 'Raise Hell', 'Shake the Foundations',
  'Settle Old Scores', 'Pack the House', 'Turn Up the Heat',
];
const PLACE = [
  'the Docks', 'the Armoury', 'the Warehouse', 'the Crossroads', 'the Old Mill', 'the Rail Yard', 'the Pier', 'the Boiler Room',
  'the Corn Exchange', 'the Social Club', 'the Drill Hall', 'the Car Park', 'the Lighthouse', 'the Foundry', 'the Ballroom',
  'the Shipyard', 'the Town Hall', 'the Old Cinema', 'the Fairground', 'the Brewery', 'the Market Square', 'the Train Depot', 'the Gym',
];
const PLACE_LEAD = ['Brawl at', 'Showdown at', 'Chaos at', 'Battle at', 'War at', 'Mayhem at', 'Uprising at', 'Rumble at'];
const UNDERGROUND = ['Wrestling', 'Fight Club', 'Grappling', 'Brawl', 'Indie'];
const LATIN = new Set(['Mexico', 'Spain', 'Argentina', 'Chile']);
const SCENE = ['Underground', 'Uncut', 'Unplugged', 'After Dark', 'Unleashed', 'Unchained', 'Exposed', 'Unsanctioned'];

/** Local flavour, used some of the time for shows in these countries. */
const LOCAL: Record<string, readonly string[]> = {
  Mexico: ['Noche de Campeones', 'Noche de Leyendas', 'Lucha Total', 'Furia Libre', 'Guerra de Máscaras', 'Arena Caliente', 'Lucha Sin Límites'],
  Spain: ['Noche de Campeones', 'Furia en el Ring', 'Guerra Total', 'Noche de Lucha'],
  Argentina: ['Noche de Leyendas', 'Furia del Sur', 'Guerra en el Ring', 'Tango y Sangre'],
  Chile: ['Furia Andina', 'Noche de Lucha', 'Guerra del Pacífico'],
  Brazil: ['Noite de Campeões', 'Noite das Lendas', 'Fúria Total', 'Guerra no Ringue'],
  Japan: ['Kaminari Night', 'Matsuri Brawl', 'Natsu no Tatakai', 'Shōgun Showdown', 'Ronin Rising', 'Sakura Smash'],
  France: ['Nuit des Champions', 'Nuit des Légendes', 'La Grande Bagarre', 'Fureur Totale'],
  Italy: ['Notte dei Campioni', 'Furia Totale', 'Notte di Leggende', 'Arena di Fuoco'],
  Germany: ['Nacht der Legenden', 'Stahlnacht', 'Ringschlacht', 'Donnerwetter'],
  Samoa: ['Island Fury', 'Pacific Thunder', 'Tidal Wave Brawl'],
  'New Zealand': ['Southern Cross Showdown', 'Long White Cloud Brawl', 'Kiwi Carnage'],
  Australia: ['Outback Brawl', 'Southern Cross Showdown', 'Bush Fire', 'Down Under Throwdown'],
  UK: ['Brawl in the Borough', 'Rumble on the Riverside', 'Pier Pressure', 'Proper Bother'],
  USA: ['Saturday Night Showcase', 'Main Street Mayhem', 'Barnstormer', 'Rust Belt Rumble'],
  Canada: ['Northern Lights Brawl', 'True North Throwdown', 'Prairie Fire'],
  'South Korea': ['Seoul Smash', 'Han River Rumble'],
  China: ['Year of the Tiger', 'Jade Rumble', 'Great Wall Brawl'],
  India: ['Monsoon Mayhem', 'Bollywood Brawl', 'Mumbai Mayhem'],
  Nigeria: ['Lagos Lockdown', 'Naija Nights'],
  Ghana: ['Gold Coast Brawl', 'Accra After Dark'],
  Egypt: ['Pharaoh\'s Fury', 'Nile Nights', 'Desert Storm Brawl'],
  'South Africa': ['Cape Carnage', 'Highveld Havoc'],
};

/**
 * Real promotions' event and show names that indie names must never produce. Multi-word ones are
 * caught anywhere in a name; single words only when they're the whole name ("Collision" is a TV
 * show, "Collision Course" is a phrase).
 */
const BLOCKED_WHOLE = [
  'wrestlemania', 'summerslam', 'royal rumble', 'survivor series', 'money in the bank', 'hell in a cell', 'elimination chamber',
  'starrcade', 'halloween havoc', 'great american bash', 'clash of the champions', 'bound for glory', 'slammiversary', 'wrestle kingdom',
  'dominion', 'double or nothing', 'all out', 'all in', 'full gear', 'revolution', 'dynamite', 'collision', 'rampage', 'nitro', 'raw',
  'smackdown', 'thunder', 'takeover', 'final battle', 'death before dishonor', 'supercard of honor', 'uncensored', 'fully loaded',
  'backlash', 'judgment day', 'no mercy', 'unforgiven', 'armageddon', 'vengeance', 'no way out', 'in your house', 'king of the ring',
  'fall brawl', 'spring stampede', 'bash at the beach', 'road wild', 'souled out', 'superbrawl', 'beach blast', 'genesis', 'sacrifice',
  'lockdown', 'hard justice', 'victory road', 'turning point', 'against all odds', 'destination x', 'no surrender', 'final resolution',
  'g1 climax', 'best of the super juniors', 'world tag league', 'new beginning', 'wrestling dontaku', 'power struggle', 'destruction',
  'anarchy', 'payback', 'extreme rules', 'fastlane', 'crown jewel', 'clash at the castle', 'tlc', 'great balls of fire', 'roadblock',
  'saturday night\'s main event', 'dragon gate', 'night of champions', 'main event', 'beach brawl',
];
const blocked = (name: string): boolean => {
  const n = name.toLowerCase();
  return BLOCKED_WHOLE.some((b) => n === b || (b.includes(' ') && new RegExp(`(^|[^a-z])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(n)));
};

type Pattern = (rnd: Rng, country: string) => string;
const PATTERNS: [number, Pattern][] = [
  [26, (r) => `${pick(r, ADJ)} ${pick(r, NOUN)}`],
  [10, (r) => `${pick(r, DAYS)} Night ${pick(r, SHOWCASE)}`],
  [14, (r) => pick(r, PHRASES)],
  [10, (r) => pick(r, DO_THINGS)],
  [10, (r) => `${pick(r, PLACE_LEAD)} ${pick(r, PLACE)}`],
  [8, (r, c) => `${LATIN.has(c) && r() < 0.5 ? 'Lucha' : pick(r, UNDERGROUND)} ${pick(r, SCENE)}`],
  [6, (r, c) => `${pick(r, NOUN)} in ${c === 'UK' ? 'Britain' : c === 'USA' ? 'America' : c}`],
  [8, (r, c) => (LOCAL[c] ? pick(r, LOCAL[c]!) : `${pick(r, ADJ)} ${pick(r, NOUN)}`)],
];
const TOTAL = PATTERNS.reduce((t, [w]) => t + w, 0);

/**
 * A name for an indie show in a country. `used` holds names already given out (this save, or this
 * year); a repeat is rerolled, so names only come back once the pools have genuinely run dry.
 */
export function indieEventName(rnd: Rng, country: string, used?: Set<string>): string {
  let name = '';
  for (let tries = 0; tries < 40; tries++) {
    let x = rnd() * TOTAL, fn = PATTERNS[0]![1];
    for (const [w, f] of PATTERNS) {
      x -= w;
      if (x <= 0) {
        fn = f;
        break;
      }
    }
    name = fn(rnd, country);
    if (blocked(name) || used?.has(name)) continue;
    break;
  }
  used?.add(name);
  return name;
}

/** How many distinct names the plain patterns can make (for the tests and a sense of scale). */
export const NAME_SPACE =
  ADJ.length * NOUN.length + DAYS.length * SHOWCASE.length + PHRASES.length + DO_THINGS.length
  + PLACE_LEAD.length * PLACE.length + UNDERGROUND.length * SCENE.length + NOUN.length * INDIE_COUNTRIES.length
  + Object.values(LOCAL).reduce((t, xs) => t + xs.length, 0);

export { blocked as isBlockedEventName };
