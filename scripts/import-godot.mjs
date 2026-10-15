// Imports Rise to Relevance content from the Godot project into typed JSON for the web build.
//
//   node scripts/import-godot.mjs /path/to/rtr-final-version
//
// Reads the authored .tres resources directly (moves, wrestlers, promotions, titles), applies the
// schema defaults from Scripts/Data/*.gd for any field the resource omits, converts integer enums
// to readable strings, and writes src/data/rtr/*.json. Re-run whenever the Godot content changes.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('usage: node scripts/import-godot.mjs <godot-project-root>');
  process.exit(1);
}
const outDir = new URL('../src/data/rtr/', import.meta.url).pathname;

/* ---------- enums (order matches the GDScript declarations exactly) ---------- */

const POSITION = ['NONE', 'STANDING', 'GROUNDED', 'SEATED', 'KNEELING', 'PERCHED', 'CLIMBING'];
const ORIENTATION = ['NONE', 'FRONT', 'BACK', 'FACE_UP', 'FACE_DOWN'];
const AREA = ['IN_RING', 'CORNER', 'ROPES', 'APRON', 'OUTSIDE', 'RAMP', 'TOP_ROPE', 'LADDER', 'CROWD', 'BACKSTAGE', 'CAGE'];
const MOTION = ['STATIONARY', 'RUNNING', 'ROPE_REBOUND', 'RISING', 'STAGGERING'];
const MOVE_TYPE = ['NONE', 'STRIKE', 'GRAPPLE', 'SUBMISSION', 'AERIAL', 'SPRINGBOARD', 'RUNNING', 'REVERSAL', 'PINNING_MOVE', 'WEAPON', 'ENVIRONMENTAL'];
const PART = ['NONE', 'HEAD', 'BODY', 'LEFT_ARM', 'RIGHT_ARM', 'LEFT_LEG', 'RIGHT_LEG'];
const TARGETING = ['FIXED_PARTS', 'CHOOSE_ARM', 'CHOOSE_LEG', 'BOTH_ARMS', 'BOTH_LEGS'];
const STRIKE_WEIGHT = ['WEAK', 'MEDIUM', 'HEAVY'];
const INTERACTION = ['AUTO', 'TIMING_STRIKE', 'TIMING_AERIAL', 'HOLD_POWER', 'SUBMISSION_LOCK_IN'];
const AREA_REQ = ['SPECIFIC', 'ANY', 'SAME_AS_OTHER', 'SHARED_FLAT_AREA'];
const AREA_RES = ['UNCHANGED', 'SPECIFIC'];
const CLASS = ['HIGH_FLYER', 'POWERHOUSE', 'TECHNICIAN', 'STRIKER', 'HARDCORE'];
const REGION = ['NONE', 'NORTH_AMERICA', 'SOUTH_AMERICA', 'ASIA', 'AFRICA', 'OCEANIA', 'EUROPE'];
const REGION_LABEL = ['', 'North America', 'South America', 'Asia', 'Africa', 'Oceania', 'Europe'];
const COUNTRIES = {
  NORTH_AMERICA: ['USA', 'Canada', 'Mexico', 'Other'],
  SOUTH_AMERICA: ['Brazil', 'Argentina', 'Chile', 'Other'],
  EUROPE: ['UK', 'Germany', 'France', 'Italy', 'Spain', 'Other'],
  ASIA: ['Japan', 'China', 'South Korea', 'India', 'Other'],
  OCEANIA: ['Australia', 'New Zealand', 'Samoa', 'Other'],
  AFRICA: ['Ghana', 'Nigeria', 'Egypt', 'South Africa', 'Other'],
};
const COUNTRY_FIELD = {
  NORTH_AMERICA: 'north_american_country',
  SOUTH_AMERICA: 'south_american_country',
  EUROPE: 'europe_country',
  ASIA: 'asia_country',
  OCEANIA: 'oceania_country',
  AFRICA: 'africa_country',
};
const GENDER = ['NONE', 'MALE', 'FEMALE'];
const DISPOSITION = ['NONE', 'FACE', 'HEEL'];

const enumOf = (list, value, field) => {
  const v = list[value];
  if (v === undefined) throw new Error(`Bad enum value ${value} for ${field}`);
  return v;
};

/* ---------- .tres parsing ---------- */

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.tres')) out.push(p);
  }
  return out;
}

/** Parse one .tres file into { ext: {id: path}, props: {key: rawValue} }. */
function parseTres(file) {
  const text = readFileSync(file, 'utf8');
  const ext = {};
  // ext_resource attributes can come in any order
  for (const m of text.matchAll(/^\[ext_resource ([^\]]*)\]/gm)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    if (attrs.id && attrs.path) ext[attrs.id] = attrs.path.replace('res://', '');
  }
  const body = text.slice(text.indexOf('[resource]') + '[resource]'.length);
  const props = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w/]*) = (.*)$/);
    if (m) props[m[1]] = m[2].trim();
  }
  return { ext, props };
}

/**
 * Some Godot resources were saved with UTF-8 text re-encoded as Latin-1 ("MartÃ­nez").
 * Repair those strings; leave everything else untouched.
 */
// Windows-1252 code points for bytes 0x80–0x9F (the rest of Latin-1 maps to itself).
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ';
function fixMojibake(s) {
  if (!/[ÃÂâ][\u0080-\u00ff\u0152-\u2122]/.test(s)) return s;
  const bytes = [];
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    const i = CP1252.indexOf(ch);
    if (i >= 0) bytes.push(0x80 + i);
    else if (code <= 0xff) bytes.push(code);
    else return s; // not representable: not mojibake
  }
  const repaired = Buffer.from(bytes).toString('utf8');
  return repaired.includes('\ufffd') ? s : repaired;
}
let repairedCount = 0;
const str = (raw) => {
  if (raw === undefined) return undefined;
  const value = JSON.parse(raw);
  const fixed = fixMojibake(value);
  if (fixed !== value) repairedCount++;
  return fixed;
};
const num = (raw, d) => (raw === undefined ? d : Number(raw));
const bool = (raw, d = false) => (raw === undefined ? d : raw === 'true');
const intArray = (raw) => (raw === undefined ? [] : JSON.parse(raw.replace(/^Array\[int\]\(/, '').replace(/\)$/, '')));
const extArray = (raw, ext) =>
  raw === undefined ? [] : [...raw.matchAll(/ExtResource\("([^"]+)"\)/g)].slice(1).map((m) => ext[m[1]]);
// The first ExtResource in an Array[ExtResource("script")](...) is the element type, hence slice(1).

const stem = (p) => basename(p, '.tres').replace(/\.tres$/, '');

/* ---------- moves ---------- */

const moveFiles = walk(join(root, 'Moves'));
const moves = moveFiles.map((file) => {
  const { props: p } = parseTres(file);
  const id = stem(file);
  const move = {
    id,
    name: str(p.move_name),
    type: enumOf(MOVE_TYPE, num(p.move_type, 0), 'move_type'),
    classPref: intArray(p.class_preferrence).map((c) => enumOf(CLASS, c, 'class')),
    parts: intArray(p.move_target_parts).map((x) => enumOf(PART, x, 'part')),
    targeting: enumOf(TARGETING, num(p.targeting_mode, 0), 'targeting'),
    defaultSide: enumOf(PART, num(p.default_side_target, 0), 'default_side_target'),
    req: {
      a: {
        position: enumOf(POSITION, num(p.required_attacker_position, 0), 'pos'),
        orientation: enumOf(ORIENTATION, num(p.required_attacker_orientation, 0), 'ori'),
        areaMode: enumOf(AREA_REQ, num(p.required_attacker_area_mode, 1), 'areaMode'),
        area: enumOf(AREA, num(p.required_attacker_area, 0), 'area'),
        motion: enumOf(MOTION, num(p.required_attacker_motion_state, 0), 'motion'),
      },
      t: {
        position: enumOf(POSITION, num(p.required_target_position, 0), 'pos'),
        orientation: enumOf(ORIENTATION, num(p.required_target_orientation, 0), 'ori'),
        areaMode: enumOf(AREA_REQ, num(p.required_target_area_mode, 2), 'areaMode'),
        area: enumOf(AREA, num(p.required_target_area, 0), 'area'),
        motion: enumOf(MOTION, num(p.required_target_motion_state, 0), 'motion'),
      },
    },
    res: {
      a: {
        position: enumOf(POSITION, num(p.resulting_attacker_position, 0), 'pos'),
        orientation: enumOf(ORIENTATION, num(p.resulting_attacker_orientation, 0), 'ori'),
        areaMode: enumOf(AREA_RES, num(p.resulting_attacker_area_mode, 0), 'areaRes'),
        area: enumOf(AREA, num(p.resulting_attacker_area, 0), 'area'),
        motion: enumOf(MOTION, num(p.resulting_attacker_motion_state, 0), 'motion'),
      },
      t: {
        position: enumOf(POSITION, num(p.resulting_target_position, 0), 'pos'),
        orientation: enumOf(ORIENTATION, num(p.resulting_target_orientation, 0), 'ori'),
        areaMode: enumOf(AREA_RES, num(p.resulting_target_area_mode, 0), 'areaRes'),
        area: enumOf(AREA, num(p.resulting_target_area, 0), 'area'),
        motion: enumOf(MOTION, num(p.resulting_target_motion_state, 0), 'motion'),
      },
    },
    finisher: bool(p.is_finisher),
    submission: bool(p.is_submission),
    flashPin: bool(p.is_flash_pin),
    pinningCombo: bool(p.is_pinning_combination),
    interaction: enumOf(INTERACTION, num(p.interaction_override, 0), 'interaction'),
    strike: bool(p.is_strike),
    strikeWeight: enumOf(STRIKE_WEIGHT, num(p.strike_weight, 0), 'strike_weight'),
    impact: num(p.move_impact, 1),
    extraTargetPositions: intArray(p.additional_valid_target_positions).map((x) => enumOf(POSITION, x, 'pos')),
  };
  const desc = p['metadata/physical_description'];
  if (desc) move.description = str(desc);
  return move;
});
moves.sort((a, b) => a.name.localeCompare(b.name));
const moveIdByPath = new Map(moveFiles.map((f) => [relative(root, f), stem(f)]));
const moveIds = new Set(moves.map((m) => m.id));
if (moveIds.size !== moves.length) throw new Error('Duplicate move ids');

/* ---------- titles & promotions ---------- */

const promotionFiles = walk(join(root, 'Promotions')).filter((f) => !f.includes('/Titles/'));
const titleFiles = walk(join(root, 'Promotions')).filter((f) => f.includes('/Titles/'));

const titleIdByPath = new Map();
const titles = titleFiles.map((file) => {
  const { props: p } = parseTres(file);
  const id = stem(file);
  titleIdByPath.set(relative(root, file), id);
  return {
    id,
    name: str(p.title_name),
    promotionId: num(p.promotion_id, 0),
    gender: num(p.gender, 1) === 2 ? 'FEMALE' : 'MALE',
    holderId: num(p.current_holder_id, 0),
    weeksHeld: num(p.weeks_held, 0),
  };
});

const wrestlerPromotion = new Map(); // wrestler path -> {promotion initials, division}
const promotions = promotionFiles.map((file) => {
  const { ext, props: p } = parseTres(file);
  const initials = str(p.promotion_initials);
  for (const w of extArray(p.mens_division, ext)) wrestlerPromotion.set(w, { initials, division: 'MENS' });
  for (const w of extArray(p.womens_division, ext)) wrestlerPromotion.set(w, { initials, division: 'WOMENS' });
  const region = enumOf(REGION, num(p.home_region, 0), 'region');
  return {
    id: num(p.promotion_id, 0),
    name: str(p.promotion_name),
    initials,
    indie: bool(p.is_indie),
    region,
    titles: extArray(p.titles, ext).map((t) => titleIdByPath.get(t)).filter(Boolean),
  };
});
promotions.sort((a, b) => a.id - b.id);

/* ---------- wrestlers ---------- */

const wrestlerFiles = walk(join(root, 'Wrestlers'));
const wrestlers = wrestlerFiles.map((file) => {
  const { ext, props: p } = parseTres(file);
  const rel = relative(root, file);
  const region = enumOf(REGION, num(p.birthplace, 0), 'birthplace');
  const countryField = COUNTRY_FIELD[region];
  const country = countryField ? COUNTRIES[region][num(p[countryField], COUNTRIES[region].length - 1)] : '';
  const promo = wrestlerPromotion.get(rel);
  const movesFrom = (raw, field) =>
    extArray(raw, ext).map((path) => {
      const id = moveIdByPath.get(path);
      if (!id) throw new Error(`${rel}: ${field} references unknown move ${path}`);
      return id;
    });
  return {
    id: stem(file),
    wrestlerId: num(p.wrestler_id, 0),
    name: str(p.wrestler_name),
    gimmick: str(p.gimmick_name) ?? '',
    gimmickDescription: str(p.gimmick_description) ?? '',
    classes: intArray(p.wrestler_class).map((c) => enumOf(CLASS, c, 'class')),
    gender: enumOf(GENDER, num(p.wrestler_gender, 1), 'gender'),
    disposition: enumOf(DISPOSITION, num(p.wrestler_disposition, 1), 'disposition'),
    age: num(p.Age, 25),
    height: str(p.wrestler_height) ?? "6'0",
    weight: num(p.wrestler_weight, 220),
    region,
    regionLabel: REGION_LABEL[REGION.indexOf(region)],
    country,
    promotion: promo?.initials ?? '',
    division: promo?.division ?? '',
    stats: {
      strength: num(p.strength, 10),
      speed: num(p.speed, 10),
      stamina: num(p.stamina, 10),
      skill: num(p.skill, 10),
      striking: num(p.striking, 10),
      charisma: num(p.charisma, 10),
    },
    popularity: {
      global: num(p.global_popularity, 0),
      northAmerica: num(p.pop_north_america, 0),
      southAmerica: num(p.pop_south_america, 0),
      europe: num(p.pop_europe, 0),
      asia: num(p.pop_asia, 0),
      africa: num(p.pop_africa, 0),
      oceania: num(p.pop_oceania, 0),
    },
    moves: movesFrom(p.move_set, 'move_set'),
    signatures: movesFrom(p.signature_moves, 'signature_moves'),
    finishers: movesFrom(p.finisher_moves, 'finisher_moves'),
  };
});
wrestlers.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
const wrestlerIds = new Set(wrestlers.map((w) => w.id));
if (wrestlerIds.size !== wrestlers.length) throw new Error('Duplicate wrestler ids');
const unassigned = wrestlers.filter((w) => !w.promotion);
if (unassigned.length) console.warn(`${unassigned.length} wrestlers not on any promotion roster`);

/* ---------- write ---------- */

mkdirSync(outDir, { recursive: true });
const write = (name, data) => writeFileSync(join(outDir, name), JSON.stringify(data) + '\n');
write('moves.json', moves);
write('wrestlers.json', wrestlers);
write('promotions.json', promotions);
write('titles.json', titles);
if (repairedCount) console.log(`repaired ${repairedCount} mis-encoded strings`);
console.log(`moves ${moves.length}, wrestlers ${wrestlers.length}, promotions ${promotions.length}, titles ${titles.length}`);
