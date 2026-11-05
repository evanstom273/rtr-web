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

## Stage 3: tag teams (`tag.ts`)

Tag rules (`rules.tag`) give each team one legal man; partners wait on the apron in their team's corner
(team 0 north-east, team 1 south-west). Only the legal men fight, pin and get pinned, so with two legal
men the match runs on singles' control rules (no turn queue). **You play whoever's legal on your team**:
when you tag out, you take over your partner. The same rules power handicaps (the one on their own never
tags) and elimination tag (a legal man going out brings their partner in). Tornado is the stage 2 core
with everyone legal. Count-outs and DQs stay on.

- **Tags happen in your corner.** From your own corner it's automatic; from elsewhere in the ring it's a
  dice contest (`tagContest`): your speed, momentum and desperation (the crowd's behind someone who's been
  on the wrong end a while; −2 for crawling) against the cut-off man's speed, skill and momentum (−4 if
  they're down; down or out of the ring, there's no contest at all). Lose it and you're cut off, dragged
  back, and a heel may knock your partner off the apron (two turns before they're back).
- **Hot tag**: five or more turns on the wrong end and properly hurt (condition under 65). The crowd
  erupts (+15 heat), the one coming in gets +25 momentum and the turn, and it counts as the comeback.
- **The heels' tricks**, from the apron for the team in control: distracting the referee (5% an action),
  sneaking in behind his back while he's distracted (35%), or chancing it in plain sight (3%, with a
  warning — and a DQ count — if he sees it). A babyface's tag while the referee's distracted doesn't count.
- **Double-teams** in your own corner (the other man thrown in there; you're legal with a partner on the
  apron): a generic team move, or the team's finisher (`rules.teamFinishers`, by team) if they've a
  finisher banked, with a cover. Legal for the referee's five-count; heels and dirty fighters linger past
  it a quarter of the time (a warning). Can fail: fought off, and the other man takes over.
- **Saves**: the victim's partner can come off the apron to break up a pin or a hold (holds: in three
  seconds from the apron); the pinner's partner on the apron halves the chance by cutting them off.
  The referee then sends them back, and it restarts even.
- **The AI**: cuts off a man in his own corner with a partner waiting; brings its partner in for a
  double-team (heels 45%, faces 30%); tags out when desperate (45%), when the partner's much fresher (15%)
  or, heels, for a quick tag with the other man down (7%) — never in its first four turns in.
  Partners get a little breath back on the apron.
- **Clock**: 2/n of the step for n people still in it (apron included), down to 40%.

## Stage 4: battle royals, Rumbles, gauntlets and series (`royal.ts`, `series.ts`)

- **Battle royal** (`type: 'battle_royal'`): everyone in at the bell. Pins, submissions, count-outs and
  DQs are off: over the top rope with both feet on the floor is the only way out, and nobody can leave
  through the ropes (the cage's blocked setups).
- **Over the top** is its own action and dice contest (`ottContest`): the heaver's strength, momentum
  and the ropes at the other's back against the clinger's strength, skill and size (a big man is hard to
  shift). Win by 5+ (or against someone with nothing left): over and out. Win narrowly: over, but **hanging
  on to the apron** — then it's skin the cat back in (a speed roll; the athletic get a pop for it) or fall,
  and anyone can try to knock them off (+4). Lose: fought off — and on the defender's natural, turned around
  and sent over yourself (hanging on half the time). Anyone whose feet touch the floor any other way is out.
- **Clusters**: with more than four in the ring it splits into brawls of two or three, regrouping each
  round (and whenever someone comes or goes); the AI goes after its own brawl first (+45) and anyone hanging
  on (+25). The AI's heave chance grows with how worn the other is and the ropes at their back.
- **Rumble** (`type: 'rumble'`): a numbered draw (`rules.draw` booked, otherwise drawn at random), two start,
  and a new entrant every 90 seconds of match time (`rules.entryEvery`). Surprise entrants
  (`rules.surprises`) get the crowd's biggest pop. Alone in the ring, you wait for the next one.
  `result.entries` keeps everyone's number, time in and out and eliminations; `ironMen()` reads the longest
  time and the most eliminations. The winner's prize (`rules.prize`, a title shot) is settled by the
  career (stage 9).
- **Gauntlet** (`type: 'gauntlet'`): elimination, winner stays on; the next in the draw comes in the moment
  someone goes out, and whoever's left carries the damage (with a breather while the next one comes down).
  Fights are sprints: 55% of the clock step.
- **Skip to your entry / the feed**: `engine.fastForward(stop)` runs the match on its own until `stop` says
  so or something needs the player (a Rumble skips to your number; once you're out, the rest plays as a
  feed).
- **Series** (`series.ts`): best of three, five or seven across shows, with a stipulation per game if the
  booker sets them; `seriesLine` for the scoreboard. Booked and recorded by the career in stage 9.
- **Stars**: hanging on, skinning the cat and surprise entrants count as drama; `RATING_TYPE` has an entry
  for each (big fields a little more each person past four).

## Stage 5: stipulations, part one (`gimmicks.ts`)

Thirteen new stipulations, each with its own rules and actions (`gimmickActions`, played through
`engine.gimmicks()` / `doGimmick()`, contested on the dice by `gimmickContest`). The original eleven
never touch any of it — the golden fixture is pinned to them.

- **Street fight**: no DQ, no count-outs, weapons; falls count in the ring and at ringside, and the fight
  can go into the crowd and backstage (Falls Count Anywhere's brawling).
- **No holds barred**: no DQ, no count-outs, anything goes.
- **Texas death**: a pin or a submission only starts a ten count on the loser (the Last Man Standing
  count); stay down and it's over, beat it and it goes on.
- **First blood**: no pins or submissions; the first to bleed loses. Head shots (impact 6+) can bust
  someone open in the hardcore stipulations, more so here.
- **Deathmatch**: no DQ, no count-outs, and the kit under the ring — panes of glass and barbed-wire boards
  (set up like tables, and they cut), bundles of light tubes — plus barbed-wire ropes that tear into
  anyone sent into them.
- **Casket, ambulance, stretcher**: no pins or submissions. Get them down and hurt (condition under 62 or
  stamina under 35%), load them in (the casket's at ringside, the ambulance up the ramp; dragging them
  there from the ring is harder), then shut the lid / the doors, or wheel the stretcher up the ramp and
  over the line (two pushes). They can fight it off at every step, and climb out if they get a turn.
- **Strap, dog collar, bull rope**: tied together. Both hold what ties them (strap, chain, cowbell) for the
  whole match — never dropped, never broken, always legal — and nobody leaves without the other or picks
  anything else up. Dog collar and bull rope go to a pin or submission; the strap is won by touching all
  four corners in a row, and the run starts again the moment the other one takes over (`rules.corners`
  gives the bull rope the same).
- **Lumberjack**: leave the ring and the lumberjacks throw you back in, getting their shots in on the
  way (and late on they might brawl among themselves). The AI sends people out to them.
- **Object on a pole**: climb the corner for it (the other one can drag you down); once you have it it's
  legal, DQs or not. `rules.poleObject` sets what's up there (brass knuckles by default); a contract
  (`poleObject: 'contract'`) or `rules.poleWins` makes grabbing it the win.
- **The AI**: goes for each stipulation's objective when it's on (loading and finishing, corners, the
  pole), and with no count-outs takes a fight that's wandered off back to where it can be won.
- **Stars**: stipulation spots count as drama, and `RATING_STIP` puts each new one on singles' spread.

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
| Six-way elimination | 34 | 3.25 | | | 220 ms |

At stage 3 (tags a match; hot tags; stars median):

| Type | Minutes | Stars | Tags | Hot tags | Double-teams |
|---|---|---|---|---|---|
| Singles (for comparison) | 18 | 3 | | | |
| Tag, 2 on 2 | 14 | 3 | 2.6 | 0.6 | 0.8 |
| Tag, 3 on 3 | 17 | 3.25 | 4.1 | 1.25 | 0.9 |
| Handicap tag, 2 on 1 | 15 | 3 | 1.6 | 0.25 | 0.3 |
| Elimination tag, 3 on 3 | 37 | 3 | 7.5 | 2.6 | 1.3 |

At stage 4:

| Type | Minutes | Stars (median) | Over-the-top tries | Left hanging | Time per match |
|---|---|---|---|---|---|
| Battle royal, 10 | 19 | 3 | 17 | 3.2 | 140 ms |
| Battle royal, 20 | 33 | 3 | 36 | 7.1 | 255 ms |
| Rumble, 30 | 57 | 3.25 | 55 | 10.9 | 415 ms |
| Gauntlet, 5 | 27 | 3 | | | 160 ms |

At stage 5 (singles; median stars): street fight 23 min / 3, no holds barred 18 / 3, Texas death 27 / 3.25,
first blood 13 / 3, deathmatch 20 / 3, casket 21 / 3.25, ambulance 21 / 3.25, stretcher 23 / 3.25,
strap 18 / 3, dog collar 18 / 3.25, bull rope 17 / 3.25, lumberjack 18 / 3, pole 18 / 3.
