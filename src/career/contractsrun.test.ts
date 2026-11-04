// The 25-clause contracts over years of the world (opt-in, slow).
// CONTRACTS=1 npx vitest run src/career/contractsrun.test.ts  [YEARS=2 SEEDS=7,11]
import { expect, it } from 'vitest';
import { PROMOTIONS, rosterOf, TITLES, worksFor, WRESTLERS } from '../data/rtr';
import { C } from './clauses';
import { dealsOf } from './deals';
import { MAX_MAJORS, ROSTER_TARGET } from './tuning';
import { begin, day } from './testkit';

it.skipIf(!process.env.CONTRACTS)('contracts over years of the world', async () => {
  const years = Number(process.env.YEARS ?? 2);
  const seeds = (process.env.SEEDS ?? '7,11').split(',').map(Number);
  for (const seed of seeds) {
    const c = begin('jamie_mercer', seed);
    const out: string[] = [`seed ${seed}`];
    const startMoney = c.money;
    for (let y = 1; y <= years; y++) {
      const t = performance.now();
      for (let i = 0; i < 365; i++) await day(c);
      const ms = (performance.now() - t) / 365;
      const signed = WRESTLERS.filter((w) => w.promotion !== 'TIS' && !c.people[w.id]?.retired);
      const pk: Record<string, number> = {};
      for (const w of signed) { const k = c.people[w.id]?.contract?.pkg ?? 'none'; pk[k] = (pk[k] ?? 0) + 1; }
      const two = WRESTLERS.filter((w) => (w.also?.length ?? 0) > 0);
      const nonex = signed.filter((w) => (c.people[w.id]?.contract?.clauses[C.exclusivity] ?? 2) === 0).length;
      const rosters = PROMOTIONS.filter((p) => !p.indie).map((p) => `${p.initials} ${rosterOf(p.initials).length}`).join(' ');
      // Health: nobody on more majors than allowed; nobody's deals and rosters out of step; no oversized roster; every
      // promotion title held by someone on its roster (or vacant).
      for (const w of WRESTLERS) {
        const deals = dealsOf(c.people[w.id]);
        expect(deals.length).toBeLessThanOrEqual(MAX_MAJORS);
        for (const k of deals) expect(worksFor(w, k.promo), `${w.id} on ${k.promo}`).toBe(true);
        for (const a of w.also ?? []) expect(deals.some((k) => k.promo === a), `${w.id} also ${a}`).toBe(true);
      }
      for (const p of PROMOTIONS.filter((x) => !x.indie)) expect(rosterOf(p.initials).length).toBeLessThanOrEqual(ROSTER_TARGET + 2);
      let wrong = 0;
      for (const t of TITLES) {
        const owner = PROMOTIONS.find((p) => p.titles.includes(t.id));
        const h = t.holder ? WRESTLERS.find((w) => w.id === t.holder) : undefined;
        if (owner && !owner.indie && h && !worksFor(h, owner.initials) && !t.id.startsWith('ARISE_')) { wrong++; console.log('OFF-ROSTER', t.id, h.id, h.promotion, h.also, h.id === c.player ? 'PLAYER' : '', JSON.stringify(c.people[h.id]?.contract?.promo)); }
      }
      const bonus = c.ledger.filter((e) => e.kind === 'bonus').reduce((s, e) => s + e.amount, 0);
      out.push(`  year ${y}: ${ms.toFixed(1)} ms/day · packages ${JSON.stringify(pk)} · non-exclusive ${nonex} · on two majors ${two.length} (${two.slice(0, 4).map((w) => `${w.name} ${w.promotion}+${w.also!.join('+')}`).join(', ')})`);
      out.push(`     rosters ${rosters} · titles held off-roster ${wrong} · you: £${c.money.toLocaleString('en-GB')} (from £${startMoney.toLocaleString('en-GB')}), bonuses/profit £${bonus.toLocaleString('en-GB')}, ${c.history.length} matches`);
      expect(wrong).toBe(0);
    }
    console.log(out.join('\n'));
  }
}, 3_600_000);
