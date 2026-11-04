// Exclusivity in the world (Lyra's call): AI stars on non-exclusive deals sign with a second major, fully on
// both rosters, their month split between them. A deal with First Refusal lets the first promotion block it.
import { globalScore, PROMOTIONS, rosterOf, WRESTLERS } from '../data/rtr';
import type { Rng } from '../engine/rng';
import { addEvent } from '../world/history';
import { activeWorld } from '../world/world';
import { available, promoRegion } from './booker';
import { letter, person, rosterTargetOf, setCareerHooks } from './career';
import { tierOf } from './clauses';
import { addDeal, aiContract, dealsOf, openToSecond } from './deals';
import { AI_SECOND_DATES, AI_SECOND_DEAL_CHANCE, CONTRACT_MONTHS, FIRST_REFUSAL_BLOCK, MAX_MAJORS, SPLIT_DATES_TOTAL } from './tuning';
import type { Career } from './types';

/** The first of the month: a promotion with room might bring in a non-exclusive star from another major. */
function secondDeals(c: Career, rnd: Rng): void {
  for (const p of PROMOTIONS.filter((x) => !x.indie && !x.closed)) {
    if (rnd() >= AI_SECOND_DEAL_CHANCE) continue;
    const roster = rosterOf(p.initials);
    if (roster.length >= rosterTargetOf(p.initials)) continue;
    // Stars on other majors whose deals let them work elsewhere, biggest names first.
    const cands = WRESTLERS.filter((w) => {
      if (w.id === c.player || w.promotion === 'TIS' || w.promotion === p.initials) return false;
      const q = c.people[w.id];
      return !!q && available(q, c.today) && !q.retiring && openToSecond(q, p.initials, MAX_MAJORS).ok;
    }).sort((a, b) => globalScore(b) - globalScore(a)).slice(0, 5);
    const w = cands[Math.floor(rnd() * cands.length)];
    if (!w) continue;
    const q = person(c, w.id);
    const chk = openToSecond(q, p.initials, MAX_MAJORS);
    // First Refusal: their promotion can block it (likelier against a rival in its own region).
    if (chk.refusal && rnd() < FIRST_REFUSAL_BLOCK.base + (promoRegion(chk.refusal) === promoRegion(p.initials) ? FIRST_REFUSAL_BLOCK.sameRegion : 0)) continue;
    const k = aiContract(rnd, w, p.initials, c.today, CONTRACT_MONTHS[1 + Math.floor(rnd() * 2)]!, 'attraction');
    k.dates = AI_SECOND_DATES;
    // Lyra's call: the month splits between them when the second deal's signed.
    for (const x of dealsOf(q)) x.dates = Math.min(x.dates ?? SPLIT_DATES_TOTAL, SPLIT_DATES_TOTAL - AI_SECOND_DATES);
    addDeal(q, w, k);
    addEvent(activeWorld().history, { day: c.today, kind: 'signed', who: w.id, name: w.name, promo: p.initials, from: w.promotion });
    const me = c.people[c.player]?.contract?.promo;
    if (!c.spectator && (me === p.initials || me === w.promotion)) {
      letter(c, { kind: 'news', from: 'The news desk', subject: `${w.name} signs with ${p.initials} as well`, body: [`${w.name} stays with ${w.promotion} but will work ${AI_SECOND_DATES} dates a month for ${p.initials} too. Non-exclusive deals: the dream matches start here.`] });
    }
  }
}

/** Is someone's deal non-exclusive, so other majors can call? (For the offers rules.) */
export const nonExclusive = (c: Career, id: string): boolean => {
  const deals = dealsOf(c.people[id]);
  return deals.length > 0 && deals.every((k) => tierOf(k, 'exclusivity') <= 1) && deals.length < MAX_MAJORS;
};

setCareerHooks({ monthly: secondDeals });
