import { applyBout, boutRules, myBoutToday, type Career } from '../../career';
import { hashSeed } from '../../career/booker';
import { outOf, simOne } from '../../career/sim';

/**
 * Sim your match tonight, the way the show screen's Sim button does (and a skip, when you've said to):
 * it leans towards the booker's plan, as AI matches do. Returns false if you've no match tonight.
 */
export function simMyMatch(c: Career): boolean {
  const mine = myBoutToday(c);
  if (!mine) return false;
  const aIsYou = mine.bout.a === c.player;
  const you = c.player, them = aIsYou ? mine.bout.b : mine.bout.a;
  const { engine } = simOne({ key: 'mine', seed: hashSeed(c.seed, 'mine', mine.show.id), you, them, rules: boutRules(c, mine.show, mine.bout, you, them, true) });
  applyBout(c, mine.show, mine.index, outOf('mine', engine), aIsYou, 'simmed');
  return true;
}
