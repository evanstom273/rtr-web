// The indie scene, month to month: when it's crowded, idle unknowns quietly leave the business; when
// it's thin, new faces debut on the circuit. Rolls with its own seed (a career hook), so it never shifts
// anything else's results.
import { TITLES, WRESTLERS, databaseChanged } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { addEvent } from '../world/history';
import { makeIndie } from '../world/populate';
import { person, setCareerHooks } from './career';
import { daysBetween } from './dates';
import { INDIE_IDLE_LEAVE_DAYS, INDIE_IDLE_LEAVE_MONTHLY, INDIE_IDLE_LEAVE_POP, INDIE_POOL_MAX, INDIE_POOL_MIN } from './tuning';
import type { Career } from './types';

/** The indies still in the business. */
export const activeIndies = (c: Career) => WRESTLERS.filter((w) => w.promotion === 'TIS' && !c.people[w.id]?.retired && w.id !== c.player);

function monthly(c: Career): void {
  const rnd = seededRng(hashSeed(c.seed, 'indie-scene', c.today));
  const indies = activeIndies(c);
  const H = activeWorld().history;
  if (indies.length > INDIE_POOL_MAX) {
    const champs = new Set(TITLES.map((t) => t.holder));
    const idle = indies.filter((w) => {
      const p = c.people[w.id];
      const last = p?.last ?? null;
      return !champs.has(w.id) && !p?.retiring && w.popularity.global < INDIE_IDLE_LEAVE_POP && (!last || daysBetween(last, c.today) >= INDIE_IDLE_LEAVE_DAYS);
    });
    let over = indies.length - INDIE_POOL_MAX;
    for (const w of idle) {
      if (over <= 0) break;
      if (rnd() >= INDIE_IDLE_LEAVE_MONTHLY) continue;
      const p = person(c, w.id);
      p.retired = true;
      p.retiredOn = c.today;
      addEvent(H, { day: c.today, kind: 'retired', who: w.id, name: w.name, promo: 'TIS', what: 'left the business' });
      over--;
    }
  } else if (indies.length < INDIE_POOL_MIN) {
    // A thin scene: a few new faces start working the circuit.
    const n = Math.min(INDIE_POOL_MIN - indies.length, 4);
    for (let i = 0; i < n; i++) {
      const id = `ind_${c.today.replace(/-/g, '')}_${i}`;
      if (WRESTLERS.some((w) => w.id === id)) continue;
      const w = makeIndie(rnd, WRESTLERS, id);
      WRESTLERS.push(w);
      person(c, id);
      addEvent(H, { day: c.today, kind: 'debut', who: id, name: w.name, promo: 'TIS' });
    }
    if (n > 0) databaseChanged();
  }
}

setCareerHooks({ monthly });
