# Port notes

## Rise to Relevance match engine

`src/engine/` is now a port of the Godot RtR match rules (`evanstom273/rtr-final-version`,
`Scripts/Match/*`). The data in `src/data/rtr/*.json` is generated from the Godot `.tres` files by
`node scripts/import-godot.mjs <path-to-godot-repo>`: 656 moves, 400 wrestlers, 11 promotions and
33 titles. The Match of the Night roster and moves are gone. The MotN crowd layer (heat, streaks,
chants) and the star rating are kept, fed by RtR events.

### What's ported

- The four-part positional state (position / orientation / area / motion), area requirement modes,
  setup actions, projections and the two-step follow-up path search (`setupRules.ts`, `areaRules.ts`).
- Six-part health, the move target resolver (fixed / choose arm or leg / both) and damage per part.
- Stamina pool (2.5× the attribute), fatigue, exhaustion bands and every penalty that hangs off them.
- Momentum, signature → finisher stock (max 3), one-use resiliency.
- Reversal chance (5–65%), the defend/breakthrough ring and setup bar sizes, kickout hold, the
  submission tug, count-outs, the action clock, late-match escalation.
- The AI decision engine (`ai.ts`): move/setup/pin scoring, weighted top-5 choice, loop prevention,
  target focus memory, setup-path planning.

### Deliberate deviations from Godot

- **Early finish protection removed** (Lyra's call: "it's a game after all"). Godot makes early pins
  near-impossible (+120/+55 resistance, a forced "kicks out at one" line) and gives submissions
  +35/+18 resistance with 96/93 tap thresholds under 5:00/10:00. All gone. Late-match escalation stays.
- **Pin resistance comes from damage instead of the clock.** With the early protection gone,
  Godot's pin maths only looks at momentum, so a pin combo on a completely fresh wrestler stayed
  down ~80% of the time (Lyra won with a Falcon Arrow at 2:20). The defender now adds
  `(condition − 40) × 2` to their resistance, where condition (0–100) is 35% average body-part
  HP, 20% the worse of head/body, 30% stamina and 15% freshness (100 − fatigue). Against a pin
  combo at mid momentum that's roughly: fresh 7% pinned, worked over ~50%, wrecked ~87%; a
  finisher is ~40% on a fresh wrestler and ~85% once they've been worked over. It feeds the
  player's kickout window too (wider when fresh). A player who pins at every chance went from a
  2.7-minute median match (170/200 under five minutes) to 11 minutes (44/200).
- **Pin combos need a second press (Lyra's idea).** When the player lands a pin combo or flash
  pin, a quick cover ring follows (no 3-2-1, 1.15s, band 12–26% shrinking with exhaustion). Hit
  it and the pin goes ahead; miss and there's no cover, but the player keeps the upper hand. The
  AI's pin combos still cover automatically.
- **Two AI loop fixes.** In Godot the AI can keep picking a "ready special" setup (e.g. pick the
  opponent up to hit a signature) forever because the opponent reverses or falls back down. Headless
  matches ran to 351 minutes. The AI now skips that setup path after three setup actions in a row,
  and when it has a credible pin (opponent ≤ 390 total HP, < 30% stamina, ≥ 70 fatigue, closing
  phase, or straight after a finisher).
- **No hidden AI reversal roll.** Every reversal and contested setup is a visible interaction for
  the player: defend when the AI attacks, breakthrough when the player does.
- The phase tracker is a simplified version of Godot's MatchDecisionFramework.

### Not ported yet

- The AI psychology / identity framework (personality modifiers, wrestler identity weighting).
- Weapons and environment, stipulations, DQs and dirty tactics, bleeding.
- Godot's own rating calculator and crowd state (the MotN ones are used instead).
- The broadcast director / camera logic.
- Champions: every imported title is vacant (holderId 0), so no one shows as `(c)` yet.

### Match UI

- **Minigames at the Godot values.** Every interaction gets Godot's lead-in and 3-2-1 countdown
  (0.3s per beat) before going live.
  - Moves: the shrinking timing circle. Gold band at 28% of the radius, ±window/2 (defend 8–26%,
    breakthrough 10–24%), 1.6–2.0s to shrink. Timing out is a miss. "So close" is shown for
    near-misses (within 9%) but counts as a miss, as in Godot's binary path.
  - Contested setups: the one-way bar (1/8 gold scale, 1.6s / 1.25s crossing, random direction — Godot alternates).
  - Kickout: hold-and-release, 2.7s fill, 3s to three, retry on a miss, overfilling wastes the
    attempt.
  - Submissions: the tug, 8 taps/s cap, AI pulses every 0.2s, 30s stall failsafe.
- **Move wheel.** Radial categories as in Godot, each showing how many moves are ready from the
  current positions. Weapons, Environment and Reversals are left off the wheel until those systems
  exist. The move grid shows (F)/SIG markers, the target tag and that part's HP with the current
  focus applied, and greys out locked signatures and finishers with the reason.
- **Target focus.** Chips in the move grid, or tap a body part on the opponent's card.
- **Ring view.** SVG, top-down: ring, apron, barrier, ramp and crowd. Positions come from the
  four-part state, resolved for the pair together, so an attacker stands next to someone in the
  corner or on the apron. The player is a circle and the AI a diamond, coloured face blue / heel
  red / champion gold. Grounded wrestlers flatten (a dot for face up, a bar for face down), with
  speed lines for running, chevrons for rising and a wobble for staggering. Moves draw a cue line
  with the move name; landings, crashes, reversals and kickouts get bursts and a shake. Pins and
  submissions ring the pair. On phones it's a thumbnail in the HUD that pops open for two seconds
  whenever anyone changes position (tap to pin it open). At 700px and wider (the Fold's inner
  screen) it's a permanent panel.
- **Names** are `(c) Name (f)` / `(h)`, coloured by disposition, gold for champions. No one holds a
  title yet (see above).
- **Roster:** search plus promotion, division, disposition and class filters, 36 at a time.

### Headless simulation

`npm run sim` (`scripts/sim-report.ts`) plays 300 random roster pairings per model. Both sides are
chosen by the AI; the player side's timing interactions use a hit model. Every match finishes,
nothing gets stuck and the AI makes no invalid choices.

Things worth knowing:

- Median match is ~17–18 minutes for the skill models; 3–4% finish under five minutes.
- **The player side wins 73–95%.** That's structural, as in Godot: the AI has no timing input, so
  any half-decent player beats the reversal windows more often than the AI's percentage rolls do.
  Something to balance once the UI is real and Lyra has played it.
- A tail of long matches remains (3–5% over 40 minutes for the skill models). They're mostly
  evenly matched pairs trading reversals. The fixed 60% model is a stress test and runs longer.
- Count-outs are rare (the AI urgently returns to the ring).

#### Fixed hit rate 60% — 300/300 matches finished

Length (min): p10 8.3, median 22.0, p90 45.7, max 103.3

| Length | Matches |
|---|---|
| < 5 min | 3.0% |
| 5–8 min | 5.7% |
| 8–25 min | 51.7% |
| 25–40 min | 25.3% |
| > 40 min | 14.3% |

| Finish | Matches |
|---|---|
| Submission (hold) | 41.7% |
| Pin (cold cover) | 22.7% |
| Pin after other move | 19.0% |
| Pin after finisher | 9.0% |
| Flash pin | 6.0% |
| Submission (finisher) | 1.3% |
| Count-out | 0.3% |

Winner: player side 73.0%, AI side 27.0%
Stars: mean 2.45, median 2.25, p10 1.25, p90 3.75
Engine steps per match: median 111, max 482. Stuck: 0. Invalid AI choices: 0

#### Skill-based (timing σ = 70ms) — 300/300 matches finished

Length (min): p10 8.3, median 17.3, p90 31.0, max 66.7

| Length | Matches |
|---|---|
| < 5 min | 3.0% |
| 5–8 min | 4.7% |
| 8–25 min | 71.3% |
| 25–40 min | 18.3% |
| > 40 min | 2.7% |

| Finish | Matches |
|---|---|
| Submission (hold) | 31.3% |
| Pin after finisher | 18.3% |
| Pin (cold cover) | 18.3% |
| Pin after other move | 15.0% |
| Flash pin | 10.3% |
| Submission (finisher) | 6.7% |

Winner: player side 94.7%, AI side 5.3%
Stars: mean 2.49, median 2.75, p10 1.25, p90 3.5
Engine steps per match: median 89, max 316. Stuck: 0. Invalid AI choices: 0

#### Skill-based (timing σ = 120ms, casual) — 300/300 matches finished

Length (min): p10 7.7, median 17.7, p90 33.7, max 82.3

| Length | Matches |
|---|---|
| < 5 min | 4.3% |
| 5–8 min | 6.3% |
| 8–25 min | 61.0% |
| 25–40 min | 23.7% |
| > 40 min | 4.7% |

| Finish | Matches |
|---|---|
| Submission (hold) | 43.3% |
| Pin after other move | 16.7% |
| Pin (cold cover) | 16.0% |
| Pin after finisher | 10.7% |
| Flash pin | 8.7% |
| Submission (finisher) | 4.3% |
| Count-out | 0.3% |

Winner: player side 73.3%, AI side 26.7%
Stars: mean 2.48, median 2.5, p10 1.25, p90 3.75
Engine steps per match: median 90, max 390. Stuck: 0. Invalid AI choices: 0

## Legacy: Match of the Night port

Notes from the original MotN port (`legacy/match-of-the-night.html`). The MotN engine has since been
replaced, so these are kept for history.


Working notes from porting `legacy/match-of-the-night.html` to Vite + React + TypeScript.
Rule one was to port faithfully, so **nothing below has been changed**. Each item is
something to decide on afterwards.

### How the port is structured

- `src/engine/` holds every rule. It has no DOM, React or timers. The original drove itself
  with `setTimeout` chains (`after(next, 550)`). In the port, each of those becomes a
  `pending: { kind: 'continue', delay, cont }` that the UI waits out before calling `advance()`.
  The delays are the original ones, so the pacing is the same.
- Timing interactions (land/reverse bar, kickout hold, submission mash) run in the UI. The engine
  sets up each one (gold zone size and position, drift rate) and takes the result back
  (`resolveMeter(hit)`, `resolveKickout(count)`, `subSecond(pos)` + `resolveSub(res, peak)`).
  The physics constants live in `engine/interactions.ts`, so the UI and the headless sim share them.
- All randomness goes through an injectable RNG (`seededRng(seed)` for tests, `Math.random` in the app).

#### Things that moved between layers

These lived in the UI code in the original. They count as game logic, so they now sit in the engine:

- **The AI's kickout roll.** `runRefCount` decided whether the AI survived a cover, which is a
  pure rules decision. It's now `refCountOutcome()` in `engine/pin.ts`, and the UI only animates the count.
- **Damage while a submission is held.** `runSub`'s animation loop called `hit()` on the defender once a
  second, scaled by where the bar was. That's now `engine.subSecond(pos)`.
- **Where the gold zone sits on the bar.** This used `Math.random` and the alternating `meterDir`. It now
  comes from the engine's RNG, so a seeded match is fully reproducible.

The one piece of randomness I've left in the UI is the AI's "thinking" pause (`700 + rnd()*350` ms).
It's purely pacing and doesn't affect any outcome.

#### Render points

In the original, the HUD and wrestler cards only repainted when `render()` was called (in `next()`,
`endMatch()` and at the start of the match). As a result, the clock and stamina bars visibly lag a
beat while a timing bar is on screen. The engine keeps that behaviour with a `view` snapshot taken at
exactly those points. The crowd waveform reads live heat, as it did originally. Log lines also appear immediately, as before.

### Things that look off (left alone)

#### Balance / design

1. **A clean first kickout attempt is always a kickout at one.** When *you* are pinned, the fill
   crosses the whole track in 0.95s and the count is read from time since the cover started (`e < 1 → 1`).
   So releasing in the gold on your first hold *always* lands before one second, whatever the pin pressure.
   Pressure only shrinks the gold zone. You only get a kickout at two or 2.9 after missing at least once.
   When the *AI* is pinned, the count depends heavily on pressure (a kickout at one only happens at pressure < 25).
   In practice your near-falls come from misses, not from big moves.
2. **The repeat penalty is charged before reversals are checked.** In `resolveMove`, `used[...]`, the repeat
   heat penalty and "the crowd groans" all apply even when the move gets reversed.
3. **Comeback charges only run down on moves.** `comeback` (from Fire up) changes the width of the
   next three *move* bars. Setups neither use it up nor get affected by it.
4. **The comeback modifier ignores the gold clamps.** `w *= 1.6` (you reversing) can push the gold
   past the usual 32% cap, up to about 51%. `w *= 0.75` (you attacking a fired-up face) can drop it below the
   14% floor, to about 10.5%.
5. **There's no count-out when only one wrestler is outside.** The referee only counts when both are out,
   and at nine they both get sent back in. A wrestler left on the floor alone never gets counted out.
6. **"Limb payoff" counts the attempt, not the result.** `stats.limbPayoff` is set when a submission is
   *applied* to a part with ≥4 hits, whether or not it ends the match. The rating then treats that as
   the limb work paying off.
7. **Setup reversals and crashes count as reversals.** `stats.reversals` includes reversed setups and
   botched high-risk moves as well as true reversals, and all of it feeds the Drama score.

#### Dead code / unused values

8. **`revChance` falls back to 25 for setups when `contest` is 0.** That can never happen: uncontested
   setups (`contest` = 0) skip the meter entirely before `revChance` is called.
9. **The kickout zone has an unreachable lower clamp.** The lower bound of
   `clamp(46 + rnd()*…, 40, 95 - w)` is 40, but the value is always at least 46.
10. **Some stats are tracked but never read.** `stats.pins`, `stats.earlyPins`, `stats.subs`,
    `stats.crashes`, `stats.maxStreak` and `side.landed` are never used by the rating or shown in the UI.
11. **There's a "Lock up" chip state that never shows.** It needs `S.ctrl === null`, which only happens
    before the bell, and the dock isn't interactive then.

#### Housekeeping in the original file

12. **The original file had leftover wrapper markup.** It came with a `<title>` and
    `claude:viewport-fit-sides` meta inside `<body>`, plus a light-mode reset stylesheet. Most of that
    reset was overridden by the game's CSS. The exception was the safe-area padding on `:root`, which
    was still in effect, so the port keeps it (top of `src/ui/styles.css`). Everything else is dropped.

#### Small timing difference in the port

13. **Submission end lines arrive about 450ms later.** When a submission ends, the original printed
    any queued limb-milestone lines immediately and handed back the result 450ms later. The port prints
    them when the result arrives (`resolveSub`), so they appear about 450ms later. The order is unchanged.

### Headless simulation

`src/engine/sim/simulation.test.ts` runs 300 full matches per hit model, rotating through all 56
ordered matchups and alternating exhibition and title stakes. Both sides are picked by the AI (the
player's side goes through the player's code paths). The tests check that every match ends, that none
gets stuck or loops (the step cap is never approached), that the AI never makes an illegal choice
for either side, and that the same seed gives the same result. All of them pass.

You can rerun the distributions below with `npm run sim -- 500`.

#### The two hit models

The original has no AI timing at all, so the sim has to stand in for the player on every bar:

- **Fixed rate:** each bar or kickout attempt hits 60% of the time, whatever the size of the gold.
  This is what the brief asked for. It does mean the size of the gold zone (and so
  `revChance`) has no effect.
- **Skill-based:** the player aims for the middle of the gold and misses by a Gaussian amount
  (σ = 6% of the track). A wider gold zone is easier to hit, which is how a real player experiences it.

In both models, kickouts are repeated holds aimed at the gold, with a 0.15s gap after a miss, until
the player succeeds or the count reaches three. Submissions run the same physics as the UI at 60Hz,
with the player mashing 6 times a second.

#### Fixed hit rate 60% — 500 matches

Match length (minutes): min 5.3, p10 9.7, median 16.3, p90 27.0, max 42.7

| Length | Matches |
|---|---|
| < 6 min | 0.2% |
| 6–10 min | 10.8% |
| 10–20 min | 54.2% |
| 20–28 min | 27.0% |
| > 28 min | 7.8% |

| Finish | Matches |
|---|---|
| Pin after finisher | 53.0% |
| Submission (regular hold) | 23.4% |
| Roll-up pin | 13.2% |
| Submission (finisher) | 9.4% |
| Pin after signature | 0.6% |
| Pin after other move | 0.4% |

Winner: "you" side 90.6%, "them" side 9.4%

| Stars | Matches |
|---|---|
| 1.5 | 0.2% |
| 2 | 0.6% |
| 2.25 | 0.8% |
| 2.5 | 3.8% |
| 2.75 | 4.0% |
| 3 | 5.2% |
| 3.25 | 11.4% |
| 3.5 | 15.8% |
| 3.75 | 19.8% |
| 4 | 18.0% |
| 4.25 | 11.0% |
| 4.5 | 5.6% |
| 4.75 | 2.8% |
| 5 | 1.0% |

Mean 3.68★, median 3.75★. Off the scale (raw ≥ 5.5): 0.0%
Engine steps per match: median 154, max 397

#### Skill-based (σ = 6% of track) — 500 matches

Match length (minutes): min 4.0, p10 4.7, median 10.0, p90 15.0, max 20.7

| Length | Matches |
|---|---|
| < 6 min | 23.0% |
| 6–10 min | 26.0% |
| 10–20 min | 50.8% |
| 20–28 min | 0.2% |
| > 28 min | 0.0% |

| Finish | Matches |
|---|---|
| Pin after finisher | 61.8% |
| Roll-up pin | 20.4% |
| Submission (finisher) | 8.2% |
| Submission (regular hold) | 7.8% |
| Pin after signature | 1.8% |

Winner: "you" side 99.8%, "them" side 0.2%

| Stars | Matches |
|---|---|
| 1.25 | 1.8% |
| 1.5 | 4.4% |
| 1.75 | 10.0% |
| 2 | 11.0% |
| 2.25 | 11.4% |
| 2.5 | 15.6% |
| 2.75 | 13.6% |
| 3 | 14.2% |
| 3.25 | 6.0% |
| 3.5 | 4.0% |
| 3.75 | 2.6% |
| 4 | 2.4% |
| 4.25 | 2.2% |
| 4.5 | 0.6% |
| 4.75 | 0.2% |

Mean 2.59★, median 2.5★. Off the scale (raw ≥ 5.5): 0.0%
Engine steps per match: median 96, max 188

#### What stands out (nothing changed)

14. **The "you" side wins 90–99%.** The AI has no timing input, so every exchange in *both* directions
    comes down to the player's bar. If the player hits the bar, their moves land, and if they hit it on
    defence, the AI's moves get reversed. An opponent stops being a threat as soon as the player is
    reasonably good at the bar. In the skill model the AI side won 1 match in 500. This is the biggest
    balance question for the bigger sim: the AI probably needs some defence of its own.
15. **A decent player finishes matches too fast.** In the skill model, 23% of matches end before
    6 minutes, and the rating hits those hard (−0.6 for length, −0.5 for the finish). A good player
    is effectively punished for being good unless they deliberately slow down.
16. **Pins that don't come off a big move almost never win.** Only about 1% of matches end with a pin
    after an ordinary move, and cold covers never win. Pins end matches only after a finisher, a
    signature or a roll-up. That fits the design, but it means the PIN button does nothing useful most of the time.
17. **Roll-ups win a lot.** Small package and Backslide (13–20% of finishes) are open to every wrestler,
    and from 12 minutes the AI scores them +12.
18. **"Off the scale" never happened.** Raw ≥ 5.5 didn't come up in 1,000 simulated matches. It may be
    reachable with deliberate play, but the sim never got there.
