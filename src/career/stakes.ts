// What's riding on a match (match overhaul, stage 8): loser leaves town, mask against mask and hair against
// hair, a title against a career, retirement, a contract, a shot at the title, a Money in the Bank briefcase.
// Applied once the result's in, through the career's own systems (release, retirement, fans, promises).
import { findWrestler } from '../data/rtr';
import { seededRng, hashSeed } from '../engine/rng';
import { activeWorld } from '../world/world';
import { giveBriefcase, monthlyTeams, shave, unmask } from '../world/matchWorld';
import { addDays, type Day } from './dates';
import { letter, person, release, setCareerHooks } from './career';
import { FEATURES } from './tuning';
import { retire } from './worldEvents';
import type { Career } from './types';

export type StakeKind = 'loser_leaves' | 'mask' | 'hair' | 'mask_vs_hair' | 'title_vs_career' | 'retirement' | 'contract' | 'contendership' | 'briefcase';

export interface Stakes {
  kind: StakeKind;
  /** One-sided stakes: who's putting it up (a career against a title, say). */
  who?: string;
  /** The title a contendership (or a briefcase) is for. */
  title?: string;
}

export const STAKE_LABEL: Record<StakeKind, string> = {
  loser_leaves: 'Loser leaves town', mask: 'Mask vs mask', hair: 'Hair vs hair', mask_vs_hair: 'Mask vs hair', title_vs_career: 'Title vs career',
  retirement: 'Retirement match', contract: 'A contract on the line', contendership: 'Number one contendership', briefcase: 'Money in the Bank',
};

/** How long a loser-leaves-town loser is gone, and how long a briefcase is good for. */
export const LEAVES_DAYS = 365;
export const BRIEFCASE_DAYS = 365;

const nm = (id: string) => findWrestler(id)?.name ?? id;

/**
 * The first of the month (match overhaul, with the flag on): teams come and go, and briefcases that weren't
 * cashed in run out. News of your own promotion's teams reaches you.
 */
export function monthlyMatchWorld(c: Career, day: Day): void {
  const w = activeWorld();
  if (!FEATURES.matches || !w.teams) return;
  const out = (id: string) => !!c.people[id]?.retired;
  const news = monthlyTeams(w, day, out, c.player);
  const mine = findWrestler(c.player)?.promotion;
  const relevant = news.filter((l) => !!mine && mine !== 'TIS' && l.includes(mine));
  if (relevant.length) letter(c, { kind: 'news', from: 'The news desk', subject: 'Tag team news', body: relevant });
  for (const b of w.briefcases ?? []) if (!b.cashed && b.until <= day) b.cashed = b.until;
}

/**
 * Settle the stakes. Returns what happened, in a line each (the news desk uses them).
 * `promo`: the promotion the match was for.
 */
export function applyStakes(c: Career, s: Stakes, winners: string[], losers: string[], promo: string, day: Day = c.today): string[] {
  const w = activeWorld(), out: string[] = [];
  const rnd = seededRng(hashSeed(w.seed, 'stakes', day, winners.join(), losers.join()));
  const lose = (fn: (id: string) => void) => losers.forEach(fn);
  switch (s.kind) {
    case 'loser_leaves':
      lose((id) => {
        const x = findWrestler(id);
        if (!x || x.promotion !== promo) return;
        release(c, x, 'released', promo);
        person(c, id).leftTown = { promo, until: addDays(day, LEAVES_DAYS) };
        out.push(`${x.name} lost, and has to leave ${promo}.`);
      });
      break;
    case 'mask': case 'hair': case 'mask_vs_hair':
      lose((id) => {
        const x = findWrestler(id);
        if (!x) return;
        if (x.masked && s.kind !== 'hair') {
          const how = unmask(x, day, rnd);
          out.push(how === 'rise' ? `${x.name} is unmasked — and the crowd takes to the face behind it.` : `${x.name} is unmasked, for good.`);
        } else {
          shave(x, day);
          out.push(`${x.name} has their head shaved in the ring.`);
        }
      });
      break;
    case 'title_vs_career':
      // Whoever put their career up and lost is done; otherwise it's just a title change.
      if (s.who && losers.includes(s.who)) {
        const x = findWrestler(s.who);
        if (x) { retire(c, x); out.push(`${x.name} put their career on the line and lost. That's it for them.`); }
      }
      break;
    case 'retirement':
      lose((id) => {
        const x = findWrestler(id);
        if (x) { retire(c, x); out.push(`${x.name} lost the retirement match.`); }
      });
      break;
    case 'contract':
      for (const id of winners) {
        out.push(`${nm(id)} has won a contract with ${promo}.`);
        if (id === c.player) letter(c, { kind: 'news', from: `${promo} office`, subject: 'You won the contract', body: [`You won the contract on the line. Expect an offer from ${promo}.`] });
      }
      (w.shots ??= []);
      break;
    case 'contendership':
      if (s.title) for (const id of winners) {
        (w.shots ??= []).push({ who: id, title: s.title, from: day });
        out.push(`${nm(id)} is the number one contender.`);
        if (id === c.player) (c.pledges ??= []).push({ id: `shot-${day}-${s.title}`, promo, kind: 'title', title: s.title, from: day, status: 'open' } as never);
      }
      break;
    case 'briefcase':
      for (const id of winners.slice(0, 1)) {
        giveBriefcase(w, id, promo, day, addDays(day, BRIEFCASE_DAYS));
        out.push(`${nm(id)} has the briefcase: a title shot whenever they want it, for a year.`);
      }
      break;
  }
  return out;
}

setCareerHooks({ monthly: (c) => monthlyMatchWorld(c, c.today) });
