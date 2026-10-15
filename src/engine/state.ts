import { HEAT_WORDS, PHASES } from '../data/commentary';
import { TITLES, getPromotion, type Wrestler } from '../data/rtr';
import { format } from './commentary';
import { exhaustionBand } from './exhaustion';
import { heldBy, weaponOf } from './env';
import { pick, type Rng } from './rng';
import { createSide } from './side';
import type { CrowdStats, MatchRulesConfig, MatchState, MatchView, Side, SideView } from './types';

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

function emptyCrowd(): CrowdStats {
  return {
    heatSum: 0, heatN: 0, heatPeak: 0, reversals: 0, finRev: 0, nf: 0, fk: 0, crashes: 0, high: 0, spots: 0, rest: 0,
    repeats: 0, heatSeg: null, comeback: null, limbPayoff: false, finAttemptsSeen: false, fkAbsorbed: { you: 0, them: 0 },
    tableBreaks: 0, weaponHits: 0, bleeds: 0, ladderPulls: 0, climbStops: 0, cageClimbs: 0, travel: 0, falls: 0, tenCounts: 0,
    nearQuits: 0, dirty: 0,
  };
}

let nextId = 1;

export function createState(rnd: Rng, you: Wrestler, them: Wrestler, rules: MatchRulesConfig): MatchState {
  const ev = eventFor(rnd, you, them, rules.title, rules);
  const S: MatchState = {
    id: nextId++,
    rules,
    you: createSide(you, 'you'),
    them: createSide(them, 'them'),
    t: 0,
    control: null,
    over: false,
    neutralFavoured: null,
    recentReversalSide: null,
    referee: { active: false, value: 0, elapsed: 0, pendingResolution: false, outside: { you: false, them: false } },
    ref: { distracted: 0, distractedBy: null, moving: 0, area: 'IN_RING', warnings: { you: 0, them: 0 } },
    env: { objects: [], nextId: 1, padRemoved: false },
    obj: {
      gateOpen: false, ladderPulls: 0, cageStage: { you: 0, them: 0 }, score: { you: 0, them: 0 }, falls: [], overtime: false,
      lmsFor: null, lmsImpact: 0, quitPressure: { you: 0, them: 0 }, finisherLanded: { you: false, them: false }, decision: null,
    },
    phase: { name: 'opening', drama: 0, controlSwings: 0, actionsSinceChange: 0 },
    heat: rules.title ? 45 : 35,
    crowd: emptyCrowd(),
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
  if (c.heatSeg) return format(PHASES.control, { x: S[c.heatSeg].w.name.split(' ').pop() ?? '' });
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
    held: held ? weaponOf(held).name : null, bleeding: s.bleeding, warnings: S.ref.warnings[s.key],
  };
}

export function snapshotView(S: MatchState): MatchView {
  return {
    t: S.t, heat: S.heat, control: S.control, over: S.over, phase: phaseLabel(S),
    count: S.referee.active ? S.referee.value : null,
    sides: { you: sideView(S, S.you), them: sideView(S, S.them) },
  };
}
