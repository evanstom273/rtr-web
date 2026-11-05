// Teaming up (match overhaul, stage 9, with the flag on): ask someone on your roster to be your tag partner, over
// the phone. They say yes if they like you and rate you enough (and aren't already in a team); a yes makes it a
// real team, with a name, a record and chemistry, and the bookers start booking you together. Or split it.
import { findWrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { formTeam, splitTeam, teamOf } from '../world/matchWorld';
import { likeOf, type People } from '../world/people';
import { letter } from './career';
import { pvoice, registerTopics } from './phone';
import { pickLine } from './phoneLines';
import { moveRelation } from './relations';
import { FEATURES } from './tuning';

const P = (): People => activeWorld().people!;
/** How much they need to like you to say yes (and how much a rated name helps). */
export const TEAM_UP = { like: 25, sure: 60 };

/** Whether they'd team with you (0–1). */
export function teamUpChance(player: string, id: string): number {
  const like = likeOf(P(), id, player);
  if (like < 0) return 0;
  return Math.max(0, Math.min(0.95, (like - TEAM_UP.like) / (TEAM_UP.sure - TEAM_UP.like) * 0.7 + 0.2));
}

registerTopics(
  {
    topic: 'teamup',
    option: (c, id) => {
      const W = activeWorld(), me = findWrestler(c.player), them = findWrestler(id);
      if (!FEATURES.matches || !W.teams || !me || !them) return null;
      if (me.promotion === 'TIS' || them.promotion !== me.promotion || them.gender !== me.gender) return null;
      const mine = teamOf(W, c.player);
      if (mine?.members.includes(id)) return null;
      return {
        topic: 'teamup', label: 'Ask them to team up',
        ...(mine ? { blocked: `You’re already in ${mine.name}.` } : teamOf(W, id) ? { blocked: `They’re in ${teamOf(W, id)!.name}.` } : {}),
      };
    },
    say: () => 'Fancy teaming up? I reckon we’d be good together. Tag titles, the lot.',
    guess: () => 0,
    run: (c, id, _tone, _about, rnd) => {
      const W = activeWorld(), me = findWrestler(c.player)!, them = findWrestler(id)!;
      if (rnd() >= teamUpChance(c.player, id)) {
        moveRelation(c, id, -1, 'Turned down teaming up');
        return { reply: pickLine({ plain: ['I’m alright on my own, cheers.', 'Not right now, mate.'], hot: ['Nah. I don’t carry people.'], pro: ['I appreciate it, but I’m focused on singles.'], warm: ['Ah, I’d love to, but not right now.'] }, pvoice(id), rnd), note: 'They said no.' };
      }
      const t = formTeam(W, [me, them], me.promotion, c.today, seededRng(hashSeed(c.seed, 'teamup', id, c.today)));
      moveRelation(c, id, 3, 'Teamed up with you');
      letter(c, { kind: 'news', from: `${me.promotion} office`, subject: `${t.name}`, body: [`You and ${them.name} are a team now: ${t.name}. Expect to be booked together.`] });
      return { reply: pickLine({ plain: ['Go on then. Let’s do it.', 'Yeah, why not. Let’s have it.'], hot: ['Let’s go and wreck some people.'], pro: ['Deal. I’ll talk to the office.'], warm: ['I’d love that. Partners.'] }, pvoice(id), rnd), note: `You’re a team: ${t.name}.` };
    },
  },
  {
    topic: 'teamsplit',
    option: (c, id) => {
      const W = activeWorld();
      if (!FEATURES.matches || !W.teams) return null;
      const t = teamOf(W, c.player);
      return t?.members.includes(id) ? { topic: 'teamsplit', label: `Split ${t.name}` } : null;
    },
    say: () => 'I think we’ve gone as far as we can together. I want to go it alone.',
    guess: () => -4,
    run: (c, id, _tone, _about, rnd) => {
      const W = activeWorld(), t = teamOf(W, c.player);
      if (!t) return { reply: '…', note: 'There’s no team to split.' };
      splitTeam(W, t, c.today, 'drift');
      moveRelation(c, id, -4, 'You split the team');
      return { reply: pickLine({ plain: ['Right. Fair enough, I suppose.'], hot: ['Your loss. Don’t come crawling back.'], pro: ['Understood. Good luck.'], warm: ['Oh. I’ll miss it, you know.'] }, pvoice(id), rnd), note: `${t.name} is no more.` };
    },
  },
);
