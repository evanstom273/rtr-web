import { HEAT_WORDS, PHASES } from '../data/commentary';
import { rollForm } from './traits';
import { TITLES, getPromotion, type Wrestler } from '../data/rtr';
import { format } from './commentary';
import { exhaustionBand } from './exhaustion';
import { heldBy, weaponOf } from './env';
import { rateSoFar } from './rating';
import { pick, type Rng } from './rng';
import { createSide } from './side';
import type { BySide, CrowdStats, MatchRulesConfig, MatchState, MatchType, MatchView, Side, SideKey, SideView } from './types';

/** Host cities by promotion region (RtR's exhibition data has no show/venue list yet). */
const VENUES: Record<string, string[]> = {
  NORTH_AMERICA: ['New York', 'Chicago', 'Los Angeles', 'Toronto', 'Mexico City'],
  SOUTH_AMERICA: ['Buenos Aires', 'São Paulo', 'Santiago'],
  EUROPE: ['London', 'Berlin', 'Glasgow', 'Leeds', 'Hamburg'],
  ASIA: ['Tokyo', 'Osaka', 'Shanghai', 'Seoul'],
  AFRICA: ['Cairo', 'Lagos', 'Johannesburg'],
  OCEANIA: ['Apia', 'Auckland', 'Sydney'],
  NONE: ['Philadelphia'],
};

function titleFor(initials: string, gender: Wrestler['gender']): string {
  const promo = getPromotion(initials);
  if (!promo) return '';
  const titles = promo.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t);
  return (titles.find((t) => t.gender === (gender === 'FEMALE' ? 'FEMALE' : 'MALE')) ?? titles[0])?.name ?? '';
}

/** The title that would be on the line for this pairing (same promotion: theirs; otherwise The Indie Scene's). */
export function titleNameFor(a: Wrestler, b: Wrestler): string {
  return titleFor(a.promotion === b.promotion ? a.promotion : 'TIS', a.gender);
}

export function eventFor(rnd: Rng, a: Wrestler, b: Wrestler, title: boolean, rules?: Pick<MatchRulesConfig, 'eventPromotion' | 'titleId'>): { event: string; venue: string; titleName: string } {
  const pa = getPromotion(a.promotion), pb = getPromotion(b.promotion);
  if (rules?.eventPromotion !== undefined) {
    // Chosen in the match builder.
    const host = rules.eventPromotion ? getPromotion(rules.eventPromotion) : undefined;
    const region = host?.region ?? pick(rnd, [a.region, b.region]);
    return {
      event: host ? host.name : 'Independent Show',
      venue: pick(rnd, VENUES[region] ?? VENUES.NONE!),
      titleName: rules.titleId ? TITLES.find((t) => t.id === rules.titleId)?.name ?? '' : '',
    };
  }
  if (pa && pb && pa.initials === pb.initials) {
    return { event: pa.name, venue: pick(rnd, VENUES[pa.region] ?? VENUES.NONE!), titleName: title ? titleFor(pa.initials, a.gender) : '' };
  }
  const hosts = [pa, pb].filter((p): p is NonNullable<typeof pa> => !!p);
  const host = hosts.length ? pick(rnd, hosts) : undefined;
  return {
    event: 'The Indie Scene: Dream Match',
    venue: pick(rnd, VENUES[host?.region ?? 'NONE'] ?? VENUES.NONE!),
    titleName: title ? titleFor('TIS', a.gender) : '',
  };
}

function emptyCrowd(order: readonly SideKey[]): CrowdStats {
  return {
    heatSum: 0, heatN: 0, heatPeak: 0, reversals: 0, finRev: 0, nf: 0, fk: 0, crashes: 0, high: 0, spots: 0, rest: 0,
    repeats: 0, heatSeg: null, comeback: null, limbPayoff: false, finAttemptsSeen: false, fkAbsorbed: perSide(order, () => 0),
    tableBreaks: 0, weaponHits: 0, bleeds: 0, ladderPulls: 0, climbStops: 0, cageClimbs: 0, travel: 0, falls: 0, tenCounts: 0,
    nearQuits: 0, dirty: 0, nearTaps: 0, ropeBreaks: 0, counters: 0, bigHits: 0, lastRev: null, lastRevT: 0,
  };
}

let nextId = 1;

/** Career extras: the booker's planned winner, how fresh each side arrives, a big occasion, tonight's form. */
function careerSide(s: Side, rules: MatchRulesConfig, rnd: Rng): Side {
  if (rules.booked?.side === s.key) { s.booked = rules.booked.bonus; if (rules.booked.cheat) s.cheat = true; }
  s.big = !!(rules.big || rules.title || rules.titleId);
  s.form = rollForm(s, rnd);
  const mood = rules.mood?.[s.key];
  if (mood) s.mood = mood;
  // Lasting damage: the worn parts start the match below full.
  const wear = rules.wear?.[s.key];
  if (wear) for (const [part, hp] of Object.entries(wear)) if (hp !== undefined) s.hp[part as keyof Side['hp']] = Math.max(1, Math.min(100, hp));
  const fresh = rules.freshness?.[s.key];
  if (fresh !== undefined && fresh < 1) s.stamina = Math.max(1, Math.round(s.maxStamina * Math.max(0, fresh)));
  return s;
}

/** Everyone past the first two (match overhaul): who, on which team. */
export interface ExtraSide { w: Wrestler; team: number }
export interface StateOpts {
  extras?: ExtraSide[];
  /** Which side the player controls (default 'you'; null: AI vs AI). */
  player?: SideKey | null;
  type?: MatchType;
}

/** What kind of match a set of teams makes, when the booker hasn't said. */
export function inferType(teams: number[]): MatchType {
  if (teams.length <= 2 && new Set(teams).size === 2) return 'singles';
  const sizes = [...new Set(teams)].map((t) => teams.filter((x) => x === t).length);
  if (sizes.every((n) => n === 1)) return teams.length === 3 ? 'triple' : teams.length === 4 ? 'fourway' : 'multi';
  return sizes.every((n) => n === sizes[0]) ? 'tornado' : 'handicap';
}

/** Heels on different teams work together while there's a face to beat up (more than two teams only). */
function allianceAtBell(sides: Side[]): MatchState['alliance'] {
  if (new Set(sides.map((s) => s.team)).size < 3) return 'none';
  const heels = sides.filter((s) => s.w.disposition === 'HEEL');
  return new Set(heels.map((s) => s.team)).size >= 2 && heels.length < sides.length ? 'on' : 'none';
}

/** A record with an entry for every side. */
export function perSide<T>(order: readonly SideKey[], v: () => T): Record<SideKey, T> {
  const out: Record<SideKey, T> = {};
  for (const k of order) out[k] = v();
  return out;
}

export function createState(rnd: Rng, you: Wrestler, them: Wrestler, rules: MatchRulesConfig, opts: StateOpts = {}): MatchState {
  const ev = eventFor(rnd, you, them, rules.title, rules);
  if (rules.eventName) ev.event = rules.eventName;
  if (rules.venueName) ev.venue = rules.venueName;
  const player = opts.player === undefined ? 'you' : opts.player;
  const sYou = careerSide(createSide(you, 'you', 0, 'them', player === 'you' ? 'player' : 'ai'), rules, rnd);
  const sThem = careerSide(createSide(them, 'them', 1, 'you', player === 'them' ? 'player' : 'ai'), rules, rnd);
  const sides: Record<SideKey, Side> = { you: sYou, them: sThem };
  const order: SideKey[] = ['you', 'them'];
  (opts.extras ?? []).forEach((x, i) => {
    const key = `s${i + 2}`;
    sides[key] = careerSide(createSide(x.w, key, x.team, 'you', player === key ? 'player' : 'ai'), rules, rnd);
    order.push(key);
  });
  // A booked winner's whole team gets the booker's nudge (a tag match: either partner can take the fall).
  const bk = rules.booked && sides[rules.booked.side];
  if (bk && order.length > 2) for (const k of order) if (k !== bk.key && sides[k]!.team === bk.team) { sides[k]!.booked = bk.booked; if (bk.cheat) sides[k]!.cheat = true; }
  // Everyone starts going after the nearest side on another team, from their own corner. In a crowd (not a
  // tag match, where it's legal man against legal man) that's the next one round the ring, so the whole field
  // doesn't open on the first side.
  const spread = order.length > 2 && !rules.tag;
  order.forEach((k, i) => {
    const me = sides[k]!;
    const ring = spread ? [...order.slice(i + 1), ...order.slice(0, i)] : order;
    me.target = ring.find((o) => sides[o]!.team !== me.team) ?? me.target;
  });
  // Corners: four of them, so in a free-for-all some share — and whoever shares one gets jumped first. Who
  // that is is the luck of the draw, not the running order. (Teams keep their own corners.)
  if (order.length > 2) {
    const deal = order.map((_, i) => i);
    const ffa = !rules.tag && new Set(order.map((k) => sides[k]!.team)).size === order.length;
    if (ffa && order.length > 4) for (let i = deal.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deal[i], deal[j]] = [deal[j]!, deal[i]!]; }
    order.forEach((k, i) => { sides[k]!.spot = deal[i]! % 4; });
  }
  const zeros = () => perSide(order, () => 0), noes = () => perSide(order, () => false);
  const S: MatchState = {
    id: nextId++,
    rules,
    you: sYou,
    them: sThem,
    sides,
    order,
    player,
    type: opts.type ?? inferType(order.map((k) => sides[k]!.team)),
    t: 0,
    control: null,
    over: false,
    neutralFavoured: null,
    recentReversalSide: null,
    referee: { active: false, value: 0, elapsed: 0, pendingResolution: false, outside: noes() },
    ref: { distracted: 0, distractedBy: null, moving: 0, area: 'IN_RING', warnings: zeros() },
    env: { objects: [], nextId: 1, padRemoved: false },
    obj: {
      gateOpen: false, ladderPulls: 0, cageStage: zeros(), score: zeros(), falls: [], overtime: false,
      lmsFor: null, lmsImpact: 0, quitPressure: zeros(), finisherLanded: noes(), decision: null,
    },
    phase: { name: 'opening', drama: 0, controlSwings: 0, actionsSinceChange: 0 },
    heat: (rules.title ? 45 : 35) + (rules.entrance?.heat ?? 0),
    crowd: emptyCrowd(order),
    streak: { who: null, n: 0 },
    event: ev.event,
    venue: ev.venue,
    titleName: ev.titleName,
    pinContext: null,
    txn: null,
    result: null,
    rating: null,
    pending: { kind: 'idle' },
    log: [],
    events: [],
    view: undefined as unknown as MatchView,
    seq: 0,
    heatLine: [],
    turn: { k: null, n: 0 },
    elims: [],
    alliance: allianceAtBell(order.map((k) => sides[k]!)),
  };
  S.view = snapshotView(S);
  return S;
}

/* ---------- view ---------- */

export function phaseLabel(S: MatchState): string {
  const c = S.crowd, mins = S.t / 60;
  if (S.over) return PHASES.over;
  if (mins >= 16 || c.finAttemptsSeen) return PHASES.finishing;
  if (c.comeback) return PHASES.comeback;
  if (c.heatSeg) return format(PHASES.control, { x: S.sides[c.heatSeg]!.w.name.split(' ').pop() ?? '' });
  if (mins < 4) return PHASES.feelingOut;
  return PHASES.backAndForth;
}

export function heatWord(h: number): string {
  for (const [lim, word] of HEAT_WORDS) if (h < lim) return word;
  return HEAT_WORDS[HEAT_WORDS.length - 1]?.[1] ?? '';
}

function sideView(S: MatchState, s: Side): SideView {
  const held = heldBy(S, s.key);
  return {
    key: s.key, hp: { ...s.hp }, stamina: s.stamina, maxStamina: s.maxStamina, fatigue: s.fatigue, momentum: s.momentum,
    signatureReady: s.signatureReady, finisherStock: s.finisherStock, state: { ...s.state }, exhaustion: exhaustionBand(s),
    targetFocus: s.targetFocus, resiliencyAvailable: s.resiliencyAvailable,
    held: held ? weaponOf(held).name : null, bleeding: s.bleeding, warnings: S.ref.warnings[s.key] ?? 0,
  };
}

export function snapshotView(S: MatchState): MatchView {
  return {
    t: S.t, heat: S.heat, control: S.control, over: S.over, phase: phaseLabel(S),
    count: S.referee.active ? S.referee.value : null,
    sides: Object.fromEntries(S.order.map((k) => [k, sideView(S, S.sides[k]!)])) as BySide<SideView>,
    live: rateSoFar(S),
  };
}
