# Matches: beyond one on one

The match overhaul takes the engine past two-person singles: tag teams, triple threats and four-ways,
handicaps, battle royals, Rumbles, elimination matches, gauntlets and series. It also adds a much wider
set of stipulations. All of it is behind `FEATURES.matches` (off) until Lyra approves.

The full design, with every decision from the seven rounds of questions, is in the approved plan. This
doc covers how it works, stage by stage, as it lands.

## Stage 1: any number of sides

- **Sides and order.** A side is a slot. Singles use `'you'` and `'them'` exactly as before; anyone else
  is `'s2'`, `'s3'` and so on. `S.sides` holds every side by key and `S.order` lists them in entry order.
  `S.you` and `S.them` stay as the first two.
- **Per-side fields.** Each side has:
  - a `team`;
  - a `target` (who they're going after);
  - a `controller` (`'player'` or `'ai'`);
  - `out` once they're out of the fight (eliminated, on the apron, waiting to enter, in a pod).
- **Who's going after whom.** `foe(S, k)` replaces the old `other(k)`: it's whoever k is going after. In
  singles that's always the other one.
- **Who's playing.** `S.player` is the side the player controls, or `null` for AI vs AI. `isPlayer(S, k)`
  replaces every hard-wired `'you'`. Control hands the AI turn to whichever side has it, and every side
  gets its own AI brain.
- **Singles are unchanged.** `src/engine/__tests__/golden.test.ts` replays 176 singles matches:
  - 11 stipulations, 8 pairings and 2 hit models;
  - each fingerprinted by steps, winner, finish, time, stars, log length and a hash of the commentary.

  They must match the pre-overhaul engine exactly, after every stage. Nothing multi-person draws a die in
  a two-person match.

## Stage 2: crowds (triple threats, four-ways, handicaps)

### Zones (`zones.ts`)

The arena is a map:

- the ring and its four corners;
- four aprons, and the floor on each side;
- the ramp (south), the crowd and backstage.

A wrestler's zone comes from their area plus which way they are (`spot`). You can reach anyone in your
zone or the next one. Structures join the map in stage 6, and tag corners matter in stage 3.

### Turns (`multi.ts`, `pickTurn`)

With more than two people, whoever won the exchange is favoured (+35). Anyone on their feet with someone
to fight can still jump in, weighted by:

- speed, momentum and stamina;
- a dice roll;
- a penalty for distance from the action;
- a penalty for having had the last few turns.

Anyone down sits the turn out and gets a chance to get up between turns, except whoever the turn-taker
is going after: they stay down for them.

The clock also changes. Each action is a shorter slice of the match: 2/n of the usual step, between half
and the full step. That gives triple threats of about 18 minutes and four-ways of about 21.

### Who the AI goes after (`aiPickTarget`)

At the start of each AI turn, every opponent still fighting is scored on:

- **reach;**
- **pinnability:** how worn they are (opportunists weigh it most), and whether they're down;
- **threat:** banked specials, momentum, and the champion in a title match;
- **grudges:** whoever hit them last (the aggressive and hot-headed hold them hardest);
- **bonds:** `rules.bonds`, −100 to 100, so friends last and enemies first;
- **the heels' truce:** heels on different teams leave each other alone while there's a face to beat up.
  It breaks when the faces are gone, or late in the match on a whim, with a betrayal line.
- **faces go after heels;**
- **stickiness:** they stay on their current target unless there's reason not to.

Whoever gets hit turns on the one who hit them.

### Saves and steals

When someone covers, everyone else who can reach may break it up (`planSave`). The AI weighs two things:

- **Motive:**
  - in one fall, if it counts, you've lost;
  - in elimination, only to save a partner (or for an opportunist's steal);
  - bonds add to it either way.
- **Reach:** distance, whether they're upright, and stamina.

Saves come at one or two, and the earliest wins. A save at two counts as a near fall.

A steal throws the pinner off and covers instead, with a pressure bonus. Opportunists steal most, then
heels.

The player is asked, with their chance of getting there: break it up, steal it, or leave it. Holds can be
stomped loose the same way. Two AI wrestlers' holds play out by themselves while the player watches, and
so do their dice.

### Winning

- **One fall:** the first pin or submission of anyone wins it, and the whole team wins. There are no
  count-outs or DQs unless the booker turns them on.
- **Elimination** (`rules.elimination`): pins, submissions, count-outs and DQs each put someone out. The
  rest regroup and carry on until one team is left.
- **The result** also carries `winners`, `losers` and `elims` (who went out, how, by whom, when).

### The AI's ring sense

You can only win in the ring. A fight that's been outside for three of a wrestler's turns gets taken back
in, as the count-out does in singles. Falls count anywhere doesn't need it.

### Stars

Each type is judged on its own terms, with singles' spread (median about 3★). More people bring more
heat and more drama by default, so `RATING_TYPE` takes each type down after the curve.

The drama score also counts saves (up to +0.45), steals and eliminations.

### Harness

`MATCHES=1 npx vitest run src/engine/__tests__/matchesrun.test.ts` runs 40 of each type and reports:

- length, stars and finishes;
- saves, steals and eliminations;
- how often the player's side wins, and time per match.

At stage 2 (minutes, stars, saves and steals are medians or per-match averages):

| Type | Minutes | Stars (median) | Saves | Steals | Time per match |
|---|---|---|---|---|---|
| Triple threat | 18 | 3 | 1.4 | 0.25 | 90 ms |
| Four-way | 21 | 3.25 | 4.7 | 0.65 | 125 ms |
| Triple threat, elimination | 24 | 3 | 0.1 | | |
| Four-way, elimination | 27 | 3.25 | 0.3 | | |
| Handicap, 2 on 1 | 15 | 3 | | | |
| Tornado, 2 on 2 | 17 | 3.25 | | | |
| Six-way elimination | 37 | 3.25 | | | 220 ms |
