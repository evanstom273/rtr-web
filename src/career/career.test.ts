import { describe, expect, it } from 'vitest';
import { TITLES, WRESTLERS, findWrestler } from '../data/rtr';
import { freshWorld, setWorld } from '../world/world';
import { acceptLetter, applyBout, finishDay, myBoutToday, propose, showsOn, signOffer, startCareer, worldJobs } from './index';
import { simJobs, type SimJob, type SimOut } from './sim';
import type { Career } from './types';

/** A stand-in for the engine: instant results from popularity and a coin, so a year runs in seconds. */
const quick = async (jobs: SimJob[]): Promise<SimOut[]> => jobs.map((j) => {
  const a = findWrestler(j.you)!, b = findWrestler(j.them)!;
  const h = (j.seed % 1000) / 1000;
  const pa = a.popularity.global / (a.popularity.global + b.popularity.global);
  const zero = { movesTried: 20, movesLanded: 12, finTried: 1, finHit: 1, sigTried: 1, sigHit: 1, reversalTries: 5, reversalWins: 2, kickouts: 2, pinTries: 3 };
  return { key: j.key, winner: h < pa ? 'you' : 'them', finish: 'PINFALL', t: 600 + (j.seed % 600), stars: 2 + (j.seed % 30) / 10, stats: { you: zero, them: zero } };
});

function begin(player = 'jamie_mercer', seed = 7): Career {
  const w = setWorld(freshWorld(seed));
  const c = startCareer({ player, today: '2026-11-03', seed });
  w.career = c;
  return c;
}

/** Play out a day the way the game does: your match first (simmed here), then the world. */
async function day(c: Career, run = quick): Promise<void> {
  const mine = myBoutToday(c);
  if (mine) {
    const [out] = await run([{ key: 'mine', seed: 1, you: mine.bout.a, them: mine.bout.b, rules: {} }]);
    applyBout(c, mine.show, mine.index, out!, true);
  }
  await finishDay(c, run);
}

describe('a career', () => {
  it('starts on the day you start it, with contracts, champions, a calendar and cards', () => {
    const c = begin();
    expect(c.today).toBe('2026-11-03');
    expect(c.people.jamie_mercer!.contract!.promo).toBe('VWF');
    expect(c.money).toBe(46 * 100);
    expect(Object.values(c.shows).length).toBeGreaterThan(100);
    const booked = Object.values(c.shows).filter((s) => s.card && s.card.length);
    expect(booked.length).toBeGreaterThan(10);
    // Nobody is on two shows the same day.
    const seen = new Map<string, string>();
    for (const s of booked) for (const b of s.card!) for (const id of [b.a, b.b]) {
      const k = `${s.date}|${id}`;
      expect(seen.has(k), `${id} twice on ${s.date}`).toBe(false);
      seen.set(k, s.id);
    }
  });

  it('runs a whole year: titles change, people move, rookies arrive, nobody is double-booked', async () => {
    const c = begin();
    const startHolders = TITLES.map((t) => t.holder);
    const signedAt = new Map(WRESTLERS.map((w) => [w.id, w.promotion]));
    let myMatches = 0;
    for (let i = 0; i < 365; i++) {
      for (const s of showsOn(c, c.today)) {
        const ids = (s.card ?? []).flatMap((b) => [b.a, b.b]);
        expect(new Set(ids).size, `${s.name} ${s.date}`).toBe(ids.length);
        for (const b of s.card ?? []) if (b.title) expect(findWrestler(b.a)!.gender === findWrestler(b.b)!.gender || TITLES.find((t) => t.id === b.title)!.gender === findWrestler(b.b)!.gender).toBe(true);
      }
      if (myBoutToday(c)) myMatches++;
      // Say yes to everything: indie bookings, tryouts, and the first contract offer at face value.
      for (const l of c.letters) if (!l.done && l.action && l.action.type !== 'negotiate') acceptLetter(c, l);
      const o = c.offers.find((x) => x.status === 'open');
      if (o && propose(c, o, { fee: o.fee, months: o.months, clauses: o.clauses }) === 'accept') signOffer(c, o);
      await day(c);
    }
    expect(c.today).toBe('2027-11-03');
    expect(TITLES.filter((t, i) => t.holder !== startHolders[i]).length).toBeGreaterThan(5);
    expect(WRESTLERS.filter((w) => signedAt.get(w.id) && signedAt.get(w.id) !== w.promotion).length).toBeGreaterThan(10);
    expect(WRESTLERS.length).toBeGreaterThan(410);
    expect(myMatches).toBeGreaterThan(40);
    expect(c.history.length).toBe(myMatches);
    expect(c.money).toBeGreaterThan(4600);
    expect(Object.keys(c.shows).length).toBeLessThan(600);
  }, 120000);

  it('a few days with the real match engine', async () => {
    const c = begin('abril_sosa', 3);
    const t0 = performance.now();
    let n = 0;
    for (let i = 0; i < 3; i++) {
      n += worldJobs(c).length;
      await day(c, async (jobs) => simJobs(jobs));
    }
    const per = (performance.now() - t0) / n;
    expect(n).toBeGreaterThan(10);
    // Keep an eye on speed: a day's worth of matches should take seconds, not minutes.
    expect(per).toBeLessThan(400);
    console.log(`real engine: ${n} matches over 3 days, ${per.toFixed(0)} ms each`);
  }, 120000);
});
