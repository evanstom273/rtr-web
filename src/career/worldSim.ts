// Simulating the world with nobody playing (Lyra's history sim). The world runs exactly as it does in a
// career, through every system, but the "player" is Nobody: a hidden, retired placeholder who's never
// booked and never written to. When history's done, Nobody goes and a real career carries on from it.
import { databaseChanged, WRESTLERS, type Wrestler } from '../data/rtr';
import { activeWorld } from '../world/world';
import { finishDay, startCareer, type StartOptions } from './career';
import type { Day } from './dates';
import type { SimJob, SimOut } from './sim';
import type { Career } from './types';

export const NOBODY = '__nobody';

function nobody(): Wrestler {
  const model = WRESTLERS.find((w) => w.promotion === 'TIS') ?? WRESTLERS[0]!;
  return {
    ...structuredClone(model), id: NOBODY, name: 'Nobody', promotion: 'TIS', traits: [],
    fans: { northAmerica: 0, southAmerica: 0, europe: 0, asia: 0, africa: 0, oceania: 0 },
  } as Wrestler;
}

/** Nobody in the database while history runs (taken out for saving and choosing). */
export function addNobody(): void { if (!WRESTLERS.some((w) => w.id === NOBODY)) { WRESTLERS.push(nobody()); databaseChanged(); } }
export function dropNobody(): void {
  const i = WRESTLERS.findIndex((w) => w.id === NOBODY);
  if (i >= 0) { WRESTLERS.splice(i, 1); databaseChanged(); }
  const P = activeWorld().people;
  if (P) for (const [k, b] of Object.entries(P.bonds)) if (b.a === NOBODY || b.b === NOBODY) delete P.bonds[k];
}

/** A world with nobody playing, from `today`. */
export function startSpectator(o: Omit<StartOptions, 'player' | 'deal' | 'carry' | 'created'>): Career {
  addNobody();
  const c = startCareer({ ...o, player: NOBODY, created: true });
  c.spectator = true;
  c.letters = [];
  const p = c.people[NOBODY]!;
  p.retired = true;
  p.contract = null;
  return c;
}

/** Run the world on to `until` (a day at a time, every match through `run`). */
export async function simulateTo(c: Career, until: Day, run: (jobs: SimJob[]) => Promise<SimOut[]>, onDay?: (c: Career) => void | Promise<void>, cancelled?: () => boolean): Promise<void> {
  while (c.today < until) {
    if (cancelled?.()) return;
    await finishDay(c, run);
    await onDay?.(c);
  }
}

/** History's done: Nobody goes, and your career carries on from where the world got to. */
export function careerFrom(sim: Career, player: string, extra: Omit<StartOptions, 'player' | 'today' | 'seed' | 'carry'> = {}): Career {
  dropNobody();
  return startCareer({ ...extra, player, today: sim.today, seed: sim.seed, carry: sim });
}
