# Port notes

Working notes from porting `legacy/match-of-the-night.html` to Vite + React + TypeScript.
Rule one was to port faithfully, so **nothing below has been changed**. Each item is
something to decide on afterwards.

## How the port is structured

- `src/engine/` holds every rule. It has no DOM, React or timers. The original drove itself
  with `setTimeout` chains (`after(next, 550)`). In the port, each of those becomes a
  `pending: { kind: 'continue', delay, cont }` that the UI waits out before calling `advance()`.
  The delays are the original ones, so the pacing is the same.
- Timing interactions (land/reverse bar, kickout hold, submission mash) run in the UI. The engine
  sets up each one (gold zone size and position, drift rate) and takes the result back
  (`resolveMeter(hit)`, `resolveKickout(count)`, `subSecond(pos)` + `resolveSub(res, peak)`).
  The physics constants live in `engine/interactions.ts`, so the UI and the headless sim share them.
- All randomness goes through an injectable RNG (`seededRng(seed)` for tests, `Math.random` in the app).

### Things that moved between layers

These lived in the UI code in the original. They count as game logic, so they now sit in the engine:

- **The AI's kickout roll.** `runRefCount` decided whether the AI survived a cover, which is a
  pure rules decision. It's now `refCountOutcome()` in `engine/pin.ts`, and the UI only animates the count.
- **Damage while a submission is held.** `runSub`'s animation loop called `hit()` on the defender once a
  second, scaled by where the bar was. That's now `engine.subSecond(pos)`.
- **Where the gold zone sits on the bar.** This used `Math.random` and the alternating `meterDir`. It now
  comes from the engine's RNG, so a seeded match is fully reproducible.

The one piece of randomness I've left in the UI is the AI's "thinking" pause (`700 + rnd()*350` ms).
It's purely pacing and doesn't affect any outcome.

### Render points

In the original, the HUD and wrestler cards only repainted when `render()` was called (in `next()`,
`endMatch()` and at the start of the match). As a result, the clock and stamina bars visibly lag a
beat while a timing bar is on screen. The engine keeps that behaviour with a `view` snapshot taken at
exactly those points. The crowd waveform reads live heat, as it did originally. Log lines also appear immediately, as before.

## Things that look off (left alone)

### Balance / design

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

### Dead code / unused values

8. **`revChance` falls back to 25 for setups when `contest` is 0.** That can never happen: uncontested
   setups (`contest` = 0) skip the meter entirely before `revChance` is called.
9. **The kickout zone has an unreachable lower clamp.** The lower bound of
   `clamp(46 + rnd()*…, 40, 95 - w)` is 40, but the value is always at least 46.
10. **Some stats are tracked but never read.** `stats.pins`, `stats.earlyPins`, `stats.subs`,
    `stats.crashes`, `stats.maxStreak` and `side.landed` are never used by the rating or shown in the UI.
11. **There's a "Lock up" chip state that never shows.** It needs `S.ctrl === null`, which only happens
    before the bell, and the dock isn't interactive then.

### Housekeeping in the original file

12. **The original file had leftover wrapper markup.** It came with a `<title>` and
    `claude:viewport-fit-sides` meta inside `<body>`, plus a light-mode reset stylesheet. Most of that
    reset was overridden by the game's CSS. The exception was the safe-area padding on `:root`, which
    was still in effect, so the port keeps it (top of `src/ui/styles.css`). Everything else is dropped.

### Small timing difference in the port

13. **Submission end lines arrive about 450ms later.** When a submission ends, the original printed
    any queued limb-milestone lines immediately and handed back the result 450ms later. The port prints
    them when the result arrives (`resolveSub`), so they appear about 450ms later. The order is unchanged.

## Headless simulation

`src/engine/sim/simulation.test.ts` runs 300 full matches per hit model, rotating through all 56
ordered matchups and alternating exhibition and title stakes. Both sides are picked by the AI (the
player's side goes through the player's code paths). The tests check that every match ends, that none
gets stuck or loops (the step cap is never approached), that the AI never makes an illegal choice
for either side, and that the same seed gives the same result. All of them pass.

You can rerun the distributions below with `npm run sim -- 500`.

### The two hit models

The original has no AI timing at all, so the sim has to stand in for the player on every bar:

- **Fixed rate:** each bar or kickout attempt hits 60% of the time, whatever the size of the gold.
  This is what the brief asked for. It does mean the size of the gold zone (and so
  `revChance`) has no effect.
- **Skill-based:** the player aims for the middle of the gold and misses by a Gaussian amount
  (σ = 6% of the track). A wider gold zone is easier to hit, which is how a real player experiences it.

In both models, kickouts are repeated holds aimed at the gold, with a 0.15s gap after a miss, until
the player succeeds or the count reaches three. Submissions run the same physics as the UI at 60Hz,
with the player mashing 6 times a second.

### Fixed hit rate 60% — 500 matches

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

### Skill-based (σ = 6% of track) — 500 matches

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

### What stands out (nothing changed)

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
