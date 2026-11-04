// Time skipping (Lyra's call, Football Manager style): move on a phase, a day, a number of days, to a
// date or to your next booking, doing everything a normal advance does, and stop when something needs
// you: your match, a letter that needs an answer, an injury, a contract starting or ending, work.
import { findWrestler } from '../data/rtr';
import { myBoutToday } from './career';
import { addDays, type Day } from './dates';
import { advancePhase, bookings, phaseOf } from './day';
import type { SimJob, SimOut } from './sim';
import { FEATURES } from './tuning';
import type { Career } from './types';

export type SkipTarget = 'phase' | 'day' | 'booking' | { days: number } | { until: Day };
export interface SkipOptions {
  /** After every phase (save here). */
  onPhase?: (c: Career, done: number, total: number) => void | Promise<void>;
  cancelled?: () => boolean;
  /** Your match came up: sim it (return true) or stop (false). */
  mine?: (c: Career) => Promise<boolean>;
}

/** Letters that need you: events and choices, contract offers and counters, tryouts. Indie offers don't stop a skip. */
const needs = (c: Career) => new Set(c.letters.filter((l) => !l.done && l.action && l.action.type !== 'indie').map((l) => l.id));

export async function skip(c: Career, target: SkipTarget, run: (jobs: SimJob[]) => Promise<SimOut[]>, o: SkipOptions = {}): Promise<{ stopped: string | null; phases: number }> {
  const phases = FEATURES.days;
  const per = phases ? 2 : 1;
  const next = bookings(c).find((b) => b.day > c.today || (b.day === c.today && phaseOf(c) === 'am'));
  const untilDay = target === 'phase' ? null : target === 'day' ? addDays(c.today, 1) : target === 'booking' ? next?.day ?? addDays(c.today, 60)
    : 'days' in target ? addDays(c.today, target.days) : target.until;
  const total = target === 'phase' ? 1 : Math.max(1, Math.round((new Date(`${untilDay}T12:00:00Z`).getTime() - new Date(`${c.today}T12:00:00Z`).getTime()) / 864e5) * per);
  let done = 0;
  for (;;) {
    if (target === 'phase' ? done >= 1 : c.today >= untilDay! && phaseOf(c) === 'am') return { stopped: null, phases: done };
    if (o.cancelled?.()) return { stopped: 'Stopped', phases: done };
    // Your match tonight (the PM, or the whole day with days off).
    if (myBoutToday(c) && (!phases || phaseOf(c) === 'pm')) {
      if (!o.mine || !(await o.mine(c))) return { stopped: 'Your match is up', phases: done };
    }
    const before = { letters: needs(c), hurt: !!c.people[c.player]?.injury, deal: JSON.stringify(c.people[c.player]?.contract ?? null), job: c.job?.id ?? null, strikes: c.job?.strikes.length ?? 0 };
    await advancePhase(c, run);
    done++;
    await o.onPhase?.(c, done, total);
    const after = needs(c);
    if ([...after].some((id) => !before.letters.has(id))) return { stopped: 'A letter needs an answer', phases: done };
    if (!before.hurt && c.people[c.player]?.injury) return { stopped: 'You’re injured', phases: done };
    if (before.deal !== JSON.stringify(c.people[c.player]?.contract ?? null)) return { stopped: 'Your contract changed', phases: done };
    if (before.job !== (c.job?.id ?? null) || (c.job?.strikes.length ?? 0) > before.strikes) return { stopped: 'News from work', phases: done };
    if (target === 'booking' && next && c.today >= next.day && findWrestler(c.player)) return { stopped: null, phases: done };
  }
}
