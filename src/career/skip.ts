// Time skipping (Lyra's call, Football Manager style): move on a phase, a day, a number of days, to a
// date or to your next booking, doing everything a normal advance does, and stop when something needs
// you: your match, a letter that needs an answer, an injury, a contract starting or ending, work.
import { findWrestler } from '../data/rtr';
import { myBoutToday } from './career';
import { addDays, type Day } from './dates';
import { advancePhase, bookings, phaseOf, routineOf } from './day';
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

/** Which mail stops a skip (Lyra's call: all of it), each kind switchable in the skip sheet. */
export const stopsFor = (c: Career) => routineOf(c).stopFor ?? { decisions: true, people: true, checkins: true, news: true };
/** Letters that stop a skip. Mail off: events and choices, offers and counters, tryouts (not indie offers). */
function needs(c: Career): Set<string> {
  if (!FEATURES.mail) return new Set(c.letters.filter((l) => !l.done && l.action && l.action.type !== 'indie').map((l) => l.id));
  const f = stopsFor(c);
  return new Set(c.letters.filter((l) => (l.action && !l.done ? f.decisions : l.kind === 'person' || l.kind === 'press' ? f.people : l.kind === 'booker' ? f.checkins : f.news)).map((l) => l.id));
}

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
    const fresh = [...after].find((id) => !before.letters.has(id));
    if (fresh) return { stopped: FEATURES.mail ? `New mail: ${c.letters.find((l) => l.id === fresh)?.subject ?? ''}` : 'A letter needs an answer', phases: done };
    if (!before.hurt && c.people[c.player]?.injury) return { stopped: 'You’re injured', phases: done };
    if (before.deal !== JSON.stringify(c.people[c.player]?.contract ?? null)) return { stopped: 'Your contract changed', phases: done };
    if (before.job !== (c.job?.id ?? null) || (c.job?.strikes.length ?? 0) > before.strikes) return { stopped: 'News from work', phases: done };
    if (target === 'booking' && next && c.today >= next.day && findWrestler(c.player)) return { stopped: null, phases: done };
  }
}
