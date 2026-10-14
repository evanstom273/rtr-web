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
    `claude:viewport-fit-sides` meta inside `<body>`, plus a light-mode reset stylesheet that the
    game's own CSS overrode straight away. All of that is dropped in the port; the visual design is unchanged.
