// A backdated history, year by year (opt-in, slow): HISTORY=1 npx vitest run src/career/history.test.ts [YEARS=10 SEED=12]
import { it } from 'vitest';
import { fansTotal, fmtFans, PROMOTIONS, TITLES, WRESTLERS } from '../data/rtr';
import { activeWorld, freshWorld, setWorld } from '../world/world';
import { backdate, NOBODY, simulateTo, startSpectator } from './index';
import { addMonths } from './dates';
import { attributeTotal } from './economy';
import { pct, quick } from './testkit';
import { SHIPPED_RETIRE_YOUNGER } from './tuning';
import { shippedWrestler } from '../data/rtr';

it.skipIf(!process.env.HISTORY)('a backdated history', async () => {
  const years = Number(process.env.YEARS ?? 10), seed = Number(process.env.SEED ?? 12);
  setWorld(freshWorld(seed));
  const { start, waiting } = backdate(years, '2026-11-04', seed);
  const sim = startSpectator({ today: start, seed });
  sim.waiting = waiting;
  console.log(`start ${start}: ${WRESTLERS.length} wrestlers, ${waiting.length} waiting to debut; majors ${PROMOTIONS.filter((p) => !p.indie).map((p) => `${p.initials} ${WRESTLERS.filter((w) => w.promotion === p.initials).length}`).join(' ')}`);
  for (let y = 1; y <= years; y++) {
    const t0 = Date.now();
    await simulateTo(sim, addMonths(start, 12 * y), quick);
    const live = WRESTLERS.filter((w) => w.id !== NOBODY && !sim.people[w.id]?.retired);
    const signed = live.filter((w) => w.promotion !== 'TIS'), indies = live.filter((w) => w.promotion === 'TIS');
    const shipped = live.filter((w) => shippedWrestler(w.id)).length;
    const H = activeWorld().history;
    const size = Math.round(JSON.stringify(activeWorld()).length / 1024);
    console.log(`year ${y} (${sim.today}) ${((Date.now() - t0) / 1000).toFixed(1)}s · ${size} KB · ${live.length} active (${signed.length} signed, ${indies.length} indie, ${shipped} shipped, ${sim.waiting?.length ?? 0} waiting) · retired ${H.events.filter((e) => e.kind === 'retired').length} · debuts ${H.events.filter((e) => e.kind === 'debut').length}`);
    console.log(`   rosters ${PROMOTIONS.filter((p) => !p.indie).map((p) => WRESTLERS.filter((w) => w.promotion === p.initials && !sim.people[w.id]?.retired).length).join('/')} · vacant titles ${TITLES.filter((t) => !t.holder).length} · ability signed median ${pct(signed.map(attributeTotal), 0.5)} p90 ${pct(signed.map(attributeTotal), 0.9)} · indie median ${pct(indies.map(attributeTotal), 0.5)} · age median ${pct(live.map((w) => w.age), 0.5)} · fans signed median ${fmtFans(pct(signed.map(fansTotal), 0.5))} max ${fmtFans(Math.max(...live.map(fansTotal)))}`);
  }
  void SHIPPED_RETIRE_YOUNGER;
}, 3_600_000);
