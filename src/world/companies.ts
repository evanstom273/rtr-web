// Booker mode (Lyra's design): every promotion but The Indie Scene is a company, with an owner, a tier and a
// bank, its own schedule once someone changes it, and the player as its booker (or owner) when they run it.
// This is the world-level record; the career's side (your roles, founding one, office hours) is career/company.ts.
import { type Promotion, type Staffer } from '../data/rtr';
import { personName } from '../data/rtr/names';
import { hashSeed, seededRng, type Rng } from '../engine/rng';
import type { Rule } from '../career/calendar';
import type { Day } from '../career/dates';
import { PROMO_COUNTRIES } from '../career/places';
import { COMPANY } from '../career/tuning';
import { takeJob, type People } from './people';
import { backstageTraits } from './populate';

export type Tier = 'local' | 'regional' | 'national' | 'global';
export const TIERS: Tier[] = ['local', 'regional', 'national', 'global'];
export const TIER_LABEL: Record<Tier, string> = { local: 'Local', regional: 'Regional', national: 'National', global: 'Global' };

export interface Company {
  promo: string;
  /** Who owns it: a staff id, or 'player'. */
  owner: string;
  /** The player books it (otherwise its booker is whoever holds the staff job). */
  booker?: 'player';
  tier: Tier;
  bank: number;
  founded?: Day;
  closed?: Day;
  /** Where it's based (founded promotions; the majors use their usual countries). */
  home?: { country: string; city: string };
  /** Its own schedule, in place of schedules.json (set once someone changes it). */
  schedule?: Rule[];
  /** A player-run company: staff do the signings when the roster's short (otherwise you do). */
  autoSign?: boolean;
  /** The day its tier last moved through play (until then it follows popularity). */
  moved?: Day;
  /** The books (booker mode, stage 4): this month so far, the last two years by month, months in a row in the red. */
  month?: Record<string, number>;
  books?: { m: string; lines: Record<string, number>; bank: number }[];
  red?: number;
  /** Its recent shows' reputation (a running average of their ratings), and the ticket price level (0 cheap, 1, 2 dear). */
  rep?: number;
  price?: number;
  /** A TV deal (a fee for each weekly show), sponsors, a bank loan. */
  tv?: { network: string; fee: number; until: Day };
  sponsors?: { name: string; monthly: number; until: Day }[];
  loan?: { left: number; monthly: number };
  /** Yours: what you pay yourself a month as owner. */
  wage?: number;
  /** Staff you've hired (booker mode, stage 5): head writer, road agent, producer, scout, doctor. */
  staff?: { role: string; id: string; wage: number; since: Day }[];
}

export const tierFor = (popularity = 0): Tier =>
  popularity >= COMPANY.tierFrom.global ? 'global' : popularity >= COMPANY.tierFrom.national ? 'national' : popularity >= COMPANY.tierFrom.regional ? 'regional' : 'local';

const pick = <T>(rnd: Rng, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const OWNER_BIOS = [
  'Made their money in television and bought in when the last owner wanted out.',
  'A local businessman who fell for wrestling as a kid and never got over it.',
  'Inherited the company from family and has kept it going ever since.',
  'Built it from a weekly show in a leisure centre.',
  'Runs it like any other investment: carefully, and with an eye on the numbers.',
];

/** A promotion's owner: someone with money behind the curtain. */
export function makeOwner(rnd: Rng, P: People, promo: string, country: string, id: string, day: Day): Staffer {
  const gender = rnd() < 0.3 ? 'FEMALE' : 'MALE';
  const s: Staffer = {
    id, name: personName(rnd, country, gender), born: `${1948 + Math.floor(rnd() * 28)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}-${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}`,
    country, gender, background: pick(rnd, ['business', 'business', 'media', 'promoter'] as const), traits: backstageTraits(rnd), rep: 55 + Math.floor(rnd() * 30),
    job: null, spells: [], bio: pick(rnd, OWNER_BIOS),
  };
  P.staff[id] = s;
  takeJob(P, s, { kind: 'owner', promo }, day, 'start');
  return s;
}

/** Every promotion has its company (run on every load, so fresh worlds and old saves both get them). */
export function ensureCompanies(w: { seed: number; day: Day | null; db: { promotions: Promotion[] }; people?: People; companies?: Record<string, Company> }): void {
  const P = w.people;
  if (!P) return;
  const cos = (w.companies ??= {});
  const day = w.day ?? '2026-01-01';
  for (const p of w.db.promotions) {
    if (p.indie) continue;
    let co = cos[p.initials];
    if (!co) {
      const rnd = seededRng(hashSeed(w.seed, 'company', p.initials));
      const tier = tierFor(p.popularity);
      const country = PROMO_COUNTRIES[p.initials]?.[0] ?? 'USA';
      const owner = makeOwner(rnd, P, p.initials, country, `own_${p.initials.toLowerCase()}`, day);
      co = cos[p.initials] = { promo: p.initials, owner: owner.id, tier, bank: COMPANY.startBank[tier] };
    }
    // Until its tier's moved through play (booker mode's business), it follows popularity.
    if (!co.moved && !co.founded) co.tier = tierFor(p.popularity);
    // A founded promotion's home country, so the calendar and its shows know where it is.
    if (co.home && !PROMO_COUNTRIES[p.initials]) PROMO_COUNTRIES[p.initials] = [co.home.country];
  }
}

/** What the calendar needs from the companies: their own schedules, where local ones run, and which have closed. */
export function calendarExtras(cos: Record<string, Company> | undefined): { schedules?: Record<string, Rule[]>; homes?: Record<string, { country: string; city: string; local: boolean }>; closed?: string[] } {
  if (!cos) return {};
  const schedules: Record<string, Rule[]> = {};
  const homes: Record<string, { country: string; city: string; local: boolean }> = {};
  const closed: string[] = [];
  for (const co of Object.values(cos)) {
    if (co.closed) { closed.push(co.promo); continue; }
    if (co.schedule) schedules[co.promo] = co.schedule;
    if (co.home) homes[co.promo] = { ...co.home, local: co.tier === 'local' };
  }
  return { ...(Object.keys(schedules).length ? { schedules } : {}), ...(Object.keys(homes).length ? { homes } : {}), ...(closed.length ? { closed } : {}) };
}
