# Port notes

## Rise to Relevance match engine

`src/engine/` started as a port of the Godot RtR match rules (`evanstom273/rtr-final-version`,
`Scripts/Match/*`). The Godot version is now dead (Lyra's call), so this is the game, and it is
free to diverge: the biggest divergence so far is contested dice rolls in place of the timing
minigames (below). The data in `src/data/rtr/*.json` is generated from the Godot `.tres` files by
`node scripts/import-godot.mjs <path-to-godot-repo>`: 656 moves, 400 wrestlers, 11 promotions and
33 titles. The Match of the Night roster and moves are gone. The MotN crowd layer (heat, streaks,
chants) and the star rating are kept, fed by RtR events.

### What's ported

- The four-part positional state (position / orientation / area / motion), area requirement modes,
  setup actions, projections and the two-step follow-up path search (`setupRules.ts`, `areaRules.ts`).
- Six-part health, the move target resolver (fixed / choose arm or leg / both) and damage per part.
- Stamina pool (2.5× the attribute), fatigue, exhaustion bands and every penalty that hangs off them.
- Momentum, signatures, finisher stock (max 3), one-use resiliency (the progression is changed, see below).
- Kickout hold, the submission tug, count-outs, the action clock, late-match escalation.
  (Godot's reversal chance, timing ring and setup bar were ported, then replaced by dice.)
- The AI decision engine (`ai.ts`): move/setup/pin scoring, weighted top-5 choice, loop prevention,
  target focus memory, setup-path planning.

### Contested rolls (the web version's own system)

Every move attempt and contested setup is a contested roll (`dice.ts`, `contest.ts`): the attacker
rolls a **d20**, the defender a **d16** (Lyra: d20 against d20 felt too even). It's shown in
full on screen. Both sides roll the same way, so the AI's only job is choosing well. Godot had the
AI never press anything, which is why the player won 95% of matches. The hands-on interactions
stay where they feel like wrestling: the kickout hold and the submission tug. Pin combos and holds
end in a choice card instead of a timing test.

- **Highest total wins; the attacker wins ties.** Naturals beat totals, in this order: attacker 1
  (botch; on a high-risk move that's a crash), defender 16 (reversal; reversing a finisher banks a
  finisher as before), attacker 20 (critical: ×1.5 damage), defender 1 (lands).
- **Attacker modifiers:**
  - the stat the move uses (Strike → Striking, Grapple → Strength, Submission/Pinning → Skill,
    Aerial/Springboard/Running → Speed), at `round((stat − 70) / 7)`
  - +2 initiative on moves (not setups), and momentum ÷ 25
  - +1 when the move suits their classes; +2 for a finisher, +1 for a signature
  - −2 high risk, −1 big move (impact 9+), +1 quick move (impact 3 or less)
  - the targeted part worn down: +1 / +2 / +3 below 75 / 50 / 25 HP
  - +2 if the opponent is down or cornered
  - the exhaustion band: 0 / −1 / −2 / −3 / −5, one worse for explosive moves when tired
  - their own limbs: −2 for a sore leg (aerial/running) or arm (heavy grapples) under 50
- **Defender modifiers:**
  - the average of Skill and Speed
  - momentum ÷ 25
  - +1 for a Technician
  - the exhaustion band
  - rattled: −2 / −3 when the head is under 40 / 25
  - +2 for reading the offence (same move type three times in five)
  - +1 for the same set-up again, and +2 for the same setup trick twice in three
- **Advantage / disadvantage** (two d20s, keep the higher / lower; they cancel):
  - attacker advantage: only from a push. The d20 vs d16 is already the attacker's edge, so
    "Set up" (just won a contested setup) and openings (the defender is off the ropes, staggering
    or still rising) are a flat +2 modifier instead of a second die
  - defender advantage: they "saw it coming", because it's the same move as the attacker's last
    attempt
  - disadvantage: Spent, or a limb the move relies on below 25
- **Push:** either side can spend 20 momentum for advantage, but not while a signature is banked.
  The AI pushes on signatures and finishers, when desperate on defence, and on close calls with
  momentum to spare (about 8% of rolls).
- **Typical odds** in headless matches:
  - ordinary moves land 61–93% (median 83%), so about 1 in 6 is reversed
  - setups 43–85% (median 68%); positioning someone stays a struggle
  - signatures ~88% and finishers ~86%
- **Submissions follow condition too:**
  - a fresh defender takes the edge off the hold: the attacker's tug score is scaled from ×0.75
    when the defender is fresh to ×1.14 when they're wrecked
  - the marker starts nearer the escape end for a fresh defender (25) and nearer the tap for a
    wrecked one (~64)
  - Godot's submission scores cap at 100 for any healthy wrestler, so adding to the defender's
    score did nothing.

### Holds: go for the tap or work the hold (Lyra's idea)

When a submission lands, the attacker chooses:

- **Go for the tap:** the tug, as before. If the defender escapes, they take control.
- **Work the hold:** guaranteed damage to the targeted part, `4 + impact/2` per part (×1.5 for a
  Technician). It also drains 4 stamina, then the attacker lets go and keeps control.

The player gets a card showing the targeted part's HP and how the opponent looks (fresh / holding
up / worn / wrecked). The AI goes for the tap on a finisher, or when the target part is under 35
(Technicians 50), or the opponent's condition is under 45 (Technicians 55), or late on with the
part under 60. Otherwise it works the hold. In headless matches it works holds about twice as
often as it cranks them.

The result is that Technicians, 58% of the roster, play like submission specialists: they win 62%
of their matches by submission, everyone else 34%. Ratings went up too (average 2.8★, from 2.4),
because limb work feeds the story score.

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
  2.7-minute median match (170/200 under five minutes) to 11 minutes (44/200). (Since retuned:
  see the steeper condition curve below.)
- **Pin combos are a choice (Lyra's idea).** When the player lands a pin combo or flash pin, a
  card asks: hook the leg, or keep the upper hand? It shows the exact chance of the three (the same
  maths the cover uses, before any Resiliency), how the opponent looks, and whether they still have
  Resiliency. Covering and getting a kickout sends the match neutral; passing keeps control. The Pin
  button on the dock shows the same odds for a cold cover. The AI's pin combos still cover
  automatically. (This replaced an earlier timing ring you could fail.)
- **No random loss of control.** Godot rolled after every landed non-basic move for a tired
  attacker to "fail to maintain control" (up to 40%), sending the match neutral so the defender
  could take over. Removed: land it and you keep it. When both wrestlers end up on the mat, the
  one who landed the move gets up first 90% of the time (Godot: 80%).
- **AI loop fixes.** In Godot the AI can keep picking a "ready special" setup (e.g. pick the
  opponent up to hit a signature) forever because the opponent reverses or falls back down. Headless
  matches ran to 351 minutes. The AI now skips that setup path after three setup actions in a row,
  and when it has a credible pin (opponent ≤ 390 total HP, < 30% stamina, ≥ 70 fatigue, closing
  phase, or straight after a finisher).
- **Momentum is progression for specials, not a resource** (Lyra's design). 50 momentum banks one
  signature, which stays banked until it lands even if momentum drops. 100 banks a finisher
  (and earns Resiliency, once). Using either costs no momentum; only pushes spend it. Godot readied
  the signature at 100, landing it reset momentum to 0, and a finisher came from landing the
  signature. To earn the same unlock again, momentum has to fall below 25 (signature) or 75
  (finisher) first, so sitting at the top of the bar can't farm specials. Reversing a finisher
  still banks one, as before.
- **Momentum tweaks (Lyra's call):** a landed move is worth 15 momentum (Godot 10; taunts stay at
  10), being reversed no longer costs the attacker momentum (Godot −5), and a landed signature
  offers a choice: cash in 50 momentum for a finisher, or keep it. The AI cashes in when it has no
  finisher banked. Effect in the sim (600 matches): finishers earned 0.46 → 2.4 a match and used
  0.37 → 2.0; finisher finishes 15% → 53%; median match 20.3 → 16.7 minutes. Not rebalanced around.
- **Momentum counts ×0.6 in pin pressure.** It no longer resets when a signature lands, so it runs
  higher late in matches, and at full weight that turned mid-match covers into wins.
- **Steeper pin condition curve:** `(condition − 35) × 3.2` (was `(condition − 40) × 2`), and the AI's
  kickout bases are 32/22/12 (Godot 28/18/9). Healthy wrestlers kick out much more reliably, a
  wrecked one about as before, so covers mid-match are near-falls.
- **The AI covers after big moves.** Godot's weighted move scoring left the AI covering ~1.6 times
  a match. After landing an impact-7+ move, a signature or a finisher (not a submission), it covers
  with a chance that rises as the opponent wears down (10–80%, +10% for impact 9+), +35% after a
  signature, 95% after a finisher, and much less if it covered last time.
- **The closing phase is reachable.** Godot-derived phase pressure topped out at 0.85 against a
  0.68 threshold for 'closing' (where the AI's finishing urgency lives), so it almost never
  happened. Match time now counts too (up to 0.2 at 20 minutes).
- **A third AI loop fix.** With a signature banked, the special's setup path could bounce off a
  forced recovery forever (step onto the apron for a springboard that doesn't fit, forced back in,
  repeat), because forced recoveries reset the setup-loop breaker. The AI now drops the special path
  after two forced recoveries without committing to a move.
- **Rope, corner and apron submissions work.** Godot's "submissions only with both wrestlers in the
  ring" rule made five holds unusable (Tarantula, Corner Foot Choke, Rope-Assisted Abdominal
  Stretch, Rope-Hung Armbar, Rope-Hung Triangle Choke), because their own requirements put someone
  on the ropes, corner or apron. Holds that name their spot are now allowed there. They can't win:
  the referee forces the break, so they always land as damage and the attacker keeps control.
- **Star rating: hot crowds and reversals count for more** (Lyra's call). Crowd scores the average
  heat from 25 (dead) to 60 (rocking) instead of 0–100, since every match opens cold, and a peak of
  95+ is worth 0.35 (was 0.25 at 88+). Reversals are worth 0.05 each in Drama, capped at 0.6 (was
  0.03, capped at 0.35). A typical match rates about the same; hot, back-and-forth ones up to half a
  star higher, and dead crowds a bit lower. Median 3 → 3.25 stars, p90 3.75 → 4.25.
- **No hidden rolls.** Every contest is on screen, modifiers and all.
- The phase tracker is a simplified version of Godot's MatchDecisionFramework.

### Stipulations, weapons and the referee

Ported from Godot (`match_stipulation_*`, `match_environment_state`, `match_referee_state`,
`match_rulebreaking_catalogue` and the stipulation parts of `simple_match_ui.gd`); the web code is
`stipulations.ts` (catalogue and rules), `env.ts` (objects, weapon attacks, bleeding), `referee.ts`
(detection, warnings, DQs) and `stip.ts` (the actions, spots and objectives).

- **11 stipulations:** Standard, No DQ, Tables, Ladder, Submission, Steel Cage, Falls Count Anywhere,
  Iron Man (10/15/20/30/60 min), Two out of Three Falls, Last Man Standing, I Quit, each with
  Godot's rule flags. DQs and count-outs are only editable for Standard (and count-outs for No DQ).
  Cage: escape / pinfall / submission toggles, at least one stays on. Ladder: briefcase or the
  championship (always the championship in a title match).
- **Weapons:** 11, imported from `Weapons/*.tres` (`src/data/rtr/weapons.json`). Look under the ring
  from the floor (you pick; the AI picks by Godot's scoring), pick up and drop. Each has a standing
  and a grounded attack, built at runtime as WEAPON moves, rolled like any move: damage impact × 1.75
  on one part, durability 1–4 (−1 per swing; a reversal knocks it loose), the light tube always
  breaks. Max 6 objects in play.
- **The referee:** sees a landed weapon shot ~74% of the time focused, ~52% outside, ~5% distracted,
  and in a match with DQs that's an instant DQ (Lyra's call: Godot's rule). Dirty tactics (eye rake,
  hair pull, closed fist, choke, remove the turnbuckle pad, exposed turnbuckle) earn warning points
  when seen; four is a DQ. Distract the referee for two actions. Without DQs the ref just shouts.
  Not ported: refusing to break, rope-assisted pins and submissions.
- **Bleeding:** Godot's chance formula; minor / moderate / heavy. Adds fatigue every clock step and
  weakens reversals, kickouts and submission defence. Shown on the wrestler card.
- **Tables, ladders, tacks:** set a table flat, stacked or in the corner; lay or line someone up, and
  the next big grounding move (impact 6+, 8+ for stacked) goes through it, with a reversal putting the
  attacker through instead. Ladders are climbed in two contested steps; top-rope dives work off the
  top of a ladder (×1.2 damage). Tip the ladder to bring someone down. Tacks are spread and used the
  same way as tables, and can cut.
- **Objectives:** Tables (put them through one), Ladder (pull the prize down), Cage (climb out),
  Last Man Standing (a big enough blow lets you make the ref count to ten), I Quit (ask when they're
  hurt; the submission tug decides it, a refusal makes the next harder), Iron Man (most falls at the
  bell; level means sudden death), two out of three (falls reset to a neutral start, damage stays).
  Ladder grabs, cage escapes and table wins unlock once anyone has banked a finisher (Godot: the first
  100 momentum; Lyra's call to tie it to the finisher with the new progression).
- **Minigames (Lyra's call, mixed):** the ladder grab is three contested pulls (Godot: eight timed
  taps), each one the opponent can stop. The Last Man Standing count is hands-on like the kickout,
  out of ten. I Quit uses the submission tug, as in Godot.
- **Falls Count Anywhere:** pins and holds count anywhere flat when both are there. Fight into the
  crowd and backstage.
- **Rating:** hardcore spots (tables broken, weapon shots, blood) add to Action, stipulation drama
  (climbs stopped, pulls at the prize, ten counts beaten, refusing to quit, falls) to Drama. A DQ
  finish costs 0.4; an objective finish after 10 minutes is worth 0.3.
- **Holds in matches without submissions** always work the hold (damage, keep control) rather than
  disappearing from the move list as in Godot.

AI (Godot's scores, plus what Godot was missing):
- Godot's AI swung weapons in plain sight in matches with DQs and got itself disqualified; this one
  only does it while the referee is distracted.
- An objective priority list replaces Godot's forced follow-throughs: it grabs the prize, goes over
  the cage, makes the referee count, tips the ladder, finishes a weapon trip, sets up what it's
  holding (in the ring), and goes back for a dropped ladder or table. Without it, weighted picks left
  matches running for hours: a failed climb knocks the ladder to the floor and the AI fetched junk
  until the six-object limit was hit; tables got set up outside while everyone fought in the ring.
- Godot's cage-priority bug (it read a key that didn't exist, so the AI never climbed) is not copied.
- A third loop fix: forced recoveries no longer reset the special-move path forever.

Headless (`npx vite-node scripts/stip-sim.ts 60`), 60 matches each, no stuck matches, no invalid
choices:

| Stipulation | Median length | Finishes |
|---|---|---|
| Standard | 17.0 | pin 58%, submission 40%, DQ 2% |
| No DQ | 18.7 | pin 60%, submission 40% |
| Tables | 12.0 | through a table 100% |
| Ladder | 18.0 | ladder 100% |
| Submission | 20.7 | submission 100% |
| Steel Cage | 17.0 | escape 68%, pin 23%, submission 10% (40 matches) |
| Falls Count Anywhere | 18.3 | pin 53%, submission 47% |
| Iron Man (20 min) | 20.0 | time 57%, pin 25%, submission 18% |
| Two out of Three | 27.0 | pin 57%, submission 43% |
| Last Man Standing | 10.7 | ten count 100% |
| I Quit | 22.7 | I quit 100% |

### Not ported yet

- The AI psychology / identity framework (personality modifiers, wrestler identity weighting).
- Tag teams (the builder's teams of up to four only send the first of each into the ring).
- Godot's own rating calculator and crowd state (the MotN ones are used instead).
- The broadcast director / camera logic.
- Champions: every imported title is vacant (holderId 0), so no one shows as `(c)` yet.

### Match UI

- **The contest card.**
  - It shows both wrestlers' modifiers line by line, the advantage and disadvantage reasons, your
    exact odds (recalculated live if you toggle Push), and a Push button with its cost or the
    reason you can't.
  - Rolling tumbles the d20s for about a second. With advantage two dice land and the dropped one
    fades. Then come the totals and a verdict (It lands / Reversed! / Critical! / Natural 20! /
    Botch!), held for about 1.25s; tap to skip.
  - Every roll goes in the commentary log too.
- **Hands-on bits kept** (both with Godot's lead-in and 3-2-1 countdown, 0.3s per beat):
  - Kickout: hold-and-release, 2.7s fill, 3s to three, retry on a miss, overfilling wastes the
    attempt.
  - Submissions: the tug, 8 taps/s cap, AI pulses every 0.2s, 30s stall failsafe.
- **Move wheel.** Radial categories as in Godot, each showing how many moves are ready from the
  current positions. Weapons, Environment and Reversals are left off the wheel until those systems
  exist. The move grid shows (F)/SIG markers, the target tag and that part's HP with the current
  focus applied, and greys out locked signatures and finishers with the reason.
- **Target focus.** Chips in the move grid, or tap a body part on the opponent's card.
- **Signatures & finishers sheet.** Tap the FIN row ("Specials ›") on either wrestler's card, at
  any point in the match. Each special shows:
  - whether it's ready, and if not, what it needs (momentum, a banked finisher)
  - the positions both wrestlers need
  - whether those fit right now, and if not, the shortest setup route (up to three steps, starting
    with getting up yourself if you need to), or a hint when a move is needed instead
  - a button to hit it, on your turn when it's on

  The opponent's tab shows what they're building towards.
- **Ring view.** SVG, top-down: ring, apron, barrier, ramp and crowd. Positions come from the
  four-part state, resolved for the pair together, so an attacker stands next to someone in the
  corner or on the apron. The player is a circle and the AI a diamond, coloured face blue / heel
  red / champion gold. Grounded wrestlers flatten (a dot for face up, a bar for face down), with
  speed lines for running, chevrons for rising and a wobble for staggering. Moves draw a cue line
  with the move name; landings, crashes, reversals and kickouts get bursts and a shake. Pins and
  submissions ring the pair. On phones it's a thumbnail in the HUD that pops open for two seconds
  whenever anyone changes position (tap to pin it open). At 700px and wider (the Fold's inner
  screen) it's a permanent panel.
- **Android back** (edge swipe or button) works inside the installed app instead of closing it. Each
  layer pushes a history entry (`ui/backStack.ts`), so back steps out of them in order:
  - a move list goes back to the wheel
  - an open sheet closes
  - mid-match, back asks "Leave the match?" (back again to stay)
  - the result screen goes to the roster
  - only from the roster does back close the app

  Pull-to-refresh is off (`overscroll-behavior: none`).
- **Names** are `(c) Name (f)` / `(h)`, coloured by disposition, gold for champions. No one holds a
  title yet (see above).
- **Match builder** (replaces the old roster screen), modelled on Godot's Exhibition Match Builder:
  - **Rules:** count-outs on/off with the count limit, and the clock step. DQs aren't in the web
    engine, so there's no DQ toggle.
  - **Event:** Auto (their promotion, or a dream match), Independent, or any promotion. The title
    list is that promotion's titles, with their holders.
  - **Roster:** Godot's search, filters (country, class, gender, promotion, face/heel, title status
    / a specific title) and all 15 sorts (A–Z, Z–A, the six attributes, global and regional
    popularity). The current sort's value shows on each row. Names sort ignoring nickname quotes.
  - **Tap** a wrestler for the profile: identity, attributes, popularity by region, signatures,
    finishers and the full moveset, plus Add to Team A / B.
  - **Hold** (380ms) and drag into Team A (you) or Team B (AI), reorder within a team, or drag back
    to the roster to remove. A finger that moves before the hold completes is treated as a scroll.
    Mouse drags start after a 5px move. Lists auto-scroll near their edges.
  - **Lock** a team to keep it through Random match / Random A / Random B. Random draws from the
    current filtered list.
  - **Teams hold up to four** for future tag matches. The engine is one-on-one, so Start needs
    exactly one wrestler a side.
  - **Layout:** the screen is pinned and only the roster list scrolls, with no bounce.
    - top: title, a one-line rules/event summary (tap to expand) and Info (how it works and
      greatest hits)
    - bottom on phones: the teams, Random and the bell
    - from 700px (the Fold's inner screen) it's Godot's two columns instead
  - **Data:** popularity is now imported as global plus the six regions (it used to be averaged).

### Headless simulation

`npm run sim` (`scripts/sim-report.ts`) plays 300 random roster pairings per model. Both sides are
chosen by the AI, including when to push, whether to crank a hold and whether to cover (when the
odds are at least 20%). The hit model only covers what's still hands-on: the kickout and the mash
rate (6 taps/s). Every match finishes, nothing gets stuck and the
AI makes no invalid choices.

Things worth knowing:

- **Median match is ~20–21 minutes**, and about 1 in 10 is under 12 minutes.
- **The player side wins ~45–52%** when it plays exactly like the AI (the edge is probably the hands-on kickout; not confirmed). That's the point of the dice:
  the edge is in your choices now, not your thumb.
- **Submissions end about half of these matches.** That's the roster: 58% are Technicians, and they
  mostly win by submission (see above).
- **Pins and specials (after the progression change):** per match, ~3.1 covers and ~2.6 kickouts
  (was 1.7 and 1.25); a signature is banked ~1.5 times and 99% of matches see one, the first at a
  median 7 minutes (was 0.46, 41% of matches, 16 minutes); a finisher is earned ~0.43 times
  (unchanged, so they stay the rarer prize).
- **Roll-up (flash pin) wins dropped to ~2% of finishes** (was ~14%). The steeper condition curve
  means a healthy wrestler kicks out of a roll-up, and the AI throws fewer of them because it now
  covers more often (pin spacing). An open question whether surprise roll-ups deserve an exception.
- A tail of long matches remains (about 3% over 40 minutes).
- Count-outs are rare (the AI urgently returns to the ring).

#### Steady hands (kickout timing σ = 70ms) — 400/400 matches finished

Length (min): p10 12.7, median 21.0, p90 30.7, max 43.0

| Length | Matches |
|---|---|
| < 5 min | 0.0% |
| 5–8 min | 1.0% |
| 8–25 min | 71.0% |
| 25–40 min | 27.3% |
| > 40 min | 0.8% |

| Finish | Matches |
|---|---|
| Submission (hold) | 45.3% |
| Pin after other move | 32.3% |
| Pin (cold cover) | 7.2% |
| Pin after finisher | 7.0% |
| Submission (finisher) | 6.5% |
| Flash pin | 1.8% |

Winner: player side 51.7%, AI side 48.3%
Stars: mean 3.05, median 3, p10 2.25, p90 3.75
Engine steps per match: median 139, max 274. Stuck: 0. Invalid AI choices: 0

#### Casual (kickout timing σ = 120ms) — 400/400 matches finished

Length (min): p10 11.0, median 19.7, p90 29.7, max 43.0

| Length | Matches |
|---|---|
| < 5 min | 1.3% |
| 5–8 min | 2.8% |
| 8–25 min | 75.5% |
| 25–40 min | 20.0% |
| > 40 min | 0.5% |

| Finish | Matches |
|---|---|
| Submission (hold) | 36.5% |
| Pin after other move | 35.8% |
| Pin (cold cover) | 10.8% |
| Pin after finisher | 7.8% |
| Submission (finisher) | 6.0% |
| Flash pin | 3.3% |

Winner: player side 45.5%, AI side 54.5%
Stars: mean 2.91, median 3, p10 2, p90 3.75
Engine steps per match: median 131, max 274. Stuck: 0. Invalid AI choices: 0

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
