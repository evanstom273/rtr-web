# Career mode: the living world

How the career expansion fits together:
- championship rhythm;
- promoters' memory and relationships;
- career events;
- one-off shows;
- the world moving on without you.

Every number mentioned here lives in `src/career/tuning.ts`. The expansion's numbers are marked
**proposals** (balance sheet, section 14). They're live, so they can be felt in play, and each is a
one-line change to revert or retune.

## Where things live

| File | What it does |
| --- | --- |
| `career.ts` | The day loop: shows, results (`applyBout`), the overnight (`endOfDay`), contracts, rookies. Other modules plug in through `setCareerHooks`. |
| `booker.ts` | Draws every card a week ahead: titles, feuds, promises, your spot, one-offs (cup rounds, farewells, crossovers). |
| `requests.ts`, `patience.ts` | What you can ask for, and each booker's patience with you. |
| `relations.ts` | Your relationships with wrestlers, and each promoter's long-term memory (trust). |
| `events.ts`, `eventLibrary.ts` | Career events: the engine, then the library of 51 events. |
| `specials.ts`, `tourney.ts` | One-off shows: charity, benefit, tribute, crossover, cups, farewells; plus the invitations to them. |
| `worldEvents.ts` | Retirements, comebacks, breakthroughs, milestones, injured champions. |
| `world/history.ts` | The world's permanent record (Records): shows, reigns, world events. |

Hooks run in this order each night, after the day has moved on:
1. Offers and requests.
2. Relations.
3. Events.
4. One-offs.
5. World events.

Each module rolls with its own seeded RNG, so adding or removing one never shifts another's results.

## Championships: defence rhythm is separate from stability

How often a title is defended and how often it changes hands are tuned separately:
- **Rhythm** (`TITLE_RHYTHM`): each title class has a minimum gap and a target gap. Past the target,
  a title is overdue: certain to be defended on a big show, likelier on any other.
- **Stability** (`TITLE_PLANNED_CHANGE`): the booker plans most defences for the champion. The chance it
  plans a change grows with the length of the reign.
- **Simulated title matches** are re-run up to `PLANNED_RETRIES` times if they go against the plan.

Title classes:

| Class | Which titles | Gap (min / target) |
| --- | --- | --- |
| World | a promotion's first title | 21 / 35 days |
| Secondary | its other titles | 21 / 35 days |
| Indie | The Indie Scene's three worldwide titles | 21 / 35 days, defended when the champion's on an indie card |
| Regional | The twelve regional indie titles | 21 / 42 days, only on indie shows in their region |
| Alliance | A.R.I.S.E. titles | 30 / 60 days; only on A.R.I.S.E. joint shows |

Per title per year, over two years in three worlds (`TITLE_STATS=1 npx vitest run src/career/titlestats.test.ts`):

| Class | Before stage 1 | After stage 1 | After stage 4 |
| --- | --- | --- | --- |
| World: matches · changes · median reign · longest gap | 6.1 · 1.95 · 101d · 171d | 7.2 · 1.0 · 175d · 119d | 7.1 · 1.07 · 175d · 126d |
| Secondary | 6.2 · 1.78 · 123d · 283d | 10.9 · 1.76 · 131d · 126d | 10.9 · 1.68 · 126d · 99d |
| Indie | 8.7 · 2.94 · 78d · — | 12.5 · 1.44 · 197d · — | 11.2 · 1.44 · 102d · 42d |
| Alliance | 1.2 · 0.5 | 1.0 · 0.17 | 1.1 · 0.33 |

The plan is kept about 97% of the time.

Rules the expansion never changes:
- One unplayed card per title.
- A champion never retires holding a belt (they carry on).
- Crossover and cup shows put no titles on the line.

## Promoters and relationships

Two separate things:
- **Patience** (`patience.ts`) is a booker's short-term mood with you. It moves with what you ask
  for and how you behave, and drifts back over time.
- **Trust** (`relations.ts`) is a promoter's long-term memory of you, counted from what you've done
  with them:
  - matches;
  - great matches;
  - plans kept, off-script, botched;
  - no-shows;
  - favours;
  - snubs.

Each promotion is one booker. Each indie show is its own promoter (key `TIS:<show name>`), so crossing
one indie promoter doesn't make the others distrust you.

**Your decisions vs the engine's.** In a title match the booker planned:
- winning against the plan in a match you *played* is **off-script**: your choice, and it costs trust,
  patience and reputation;
- the same result in a *simmed* match is an **upset**: no blame;
- losing when you were booked to win is **botched**: a small knock.

## Career events

Events arrive in the mail as letters with choices (`events.ts`).

**Pacing:**
- About one event a week (`EVENT_DAILY_BASE`). There are more in quiet spells, for free agents,
  champions and stars, and fewer in busy weeks and for unknowns.
- At least `EVENT_MIN_GAP` days between them, and at most `EVENT_MAX_OPEN` waiting on you.
- Per-event cooldowns, and recently seen categories are damped.
- An event your contract rules out entirely comes round a quarter as often.

**Choices:**
- Each choice says what it costs or risks.
- Choices your contract or bank balance rules out are greyed out with the reason. These recompute
  live, so getting paid can unlock one.
- The letter keeps what you chose and what came of it.
- Unanswered letters lapse after `EVENT_EXPIRES_DAYS`.

**They pop up** (Lyra's call). A new event, invitation or contract offer appears as a card over the
calendar as soon as it arrives, oldest first, with "N more waiting":
- Answer an event there and then, and the card shows what came of it.
- A contract offer goes straight to Negotiate.
- Later leaves it waiting in Mail.

The card (`EventCard.tsx`) and Mail share the same choice rows.

**Contract gating:**
- Outside Appearances: media, signings and appearances. Tier 1 needs management's approval.
- Merchandise Rights.
- Indie Bookings: indie dates.
- Creative Control: refusing a character change.

**Follow-ups** land weeks later: the documentary airs, the merch pays out, the mentor's next lesson.

**The library** (`eventLibrary.ts`):
- Training: school guest, seminar, a veteran's mentorship, a protégé, a specialist coach, a private session, a gym block.
- Community: charity appearance, community event, a benefit for an injured colleague, a hospital visit, a welfare campaign.
- Media: podcast, documentary, a journalist on a controversial finish, newspaper profile, publicity for a show, a rival's callout, contract questions, a convention, fans after a show, a sponsor, merch, a video game.
- Backstage: a veteran's advice, helping someone prepare, a card complaint, an alliance, being provoked, an introduction to another promotion, the booker's favour, accusations of favouritism, an olive branch, praise after a great match, a mentor check-in, a prank.
- Career: a guest role, working hurt, a character change, a rival's interest, a publicity campaign, a far-away booking, "we want the champion", the "stolen title" rematch, a title challenge.
- Personal: travel trouble, an unexpected bill, a paid appearance, plus the daft ones: a fan's gift, the wrong entrance music, recognised at the airport, lost luggage.

**Adding an event:**
1. Append an `EventDef` to the right list in `eventLibrary.ts`.
2. Fill in its fields:
   - `when` (can it happen?);
   - `setup` (who and where, drawn from the live world);
   - `from`, `subject`, `body`;
   - `options`, each with a `run` built from `fx.*` effects and an optional `blocked`.
3. Give it a weight and a cooldown.

The engine does the rest.

## One-off shows

These are announced three to six weeks ahead (`SPECIAL_LEAD`) and go on the calendar like any other
show. The same booker draws their cards.

| Kind | When | What's special |
| --- | --- | --- |
| Charity night | every month or so | indie card; wrestle for free (reputation after) or for your fee |
| Benefit | someone popular out 28+ days | "A Night for Name"; once per injury; donate if you can't go |
| Tribute | 30–90 days after a popular wrestler retires | "Thank You, Name"; once per person |
| Crossover | about three a year | two promotions in the same region, never ZWA with NWGP; no titles; the rosters against each other |
| Cup | every couple of months | eight in, one division; quarter-finals, semi-finals and final a fortnight apart; walkovers; prize money and a shot at the division's top indie title; the winner in Records |
| Farewell | when someone retires | their promotion's next big show, or an indie send-off; their last match is the main event |

**Invitations** are event letters, sent for the one-offs in reach: your region, or anywhere if you're
popular, and benefits and tributes for people you know. A wrestler close to you can ask you to be
their last opponent. Indie Bookings rules apply, and if your deal has none you're not invited to the
indie ones.

**In a cup**, winning a round books you for the next one (if you can make the date). Losing, or not
being able to make it, sends your opponent through. The winner gets a shot at their division's top
indie title (Lyra's call):
- If you win, it's booked for you on an indie show where the champion's free.
- An AI winner is first in line the next time that title's defended (for up to 120 days).

**Indie promises roll on** (Lyra's call). If an indie promoter's promise can't happen on the night
(a title shot, a challenge), it moves to that promoter's next show and books you on it. That happens
up to three times; promotion promises already worked like this.

## The living world

- **Retirements:**
  - From age 38 there's a small monthly chance that grows each year: about 5–10 a year worldwide,
    against about 17 rookies.
  - It's announced with a farewell date, and their deal runs to it.
  - Nobody is booked after their farewell, and the retired are never booked again.
  - A champion carries on instead.
  - Now and then someone popular comes back.
- **Breakthroughs:** a rookie whose popularity reaches 20.
- **Milestones:**
  - reigns of 180, 365 and 730 days;
  - your 50th, 100th, 250th… match.
- **Injured champions:** a champion out 30+ days.

Everything goes into Records: the promotion timelines, and a wrestler's file. Only what touches you
reaches your mail: your roster, people you know well, big names. Promotion anniversaries are left out
because the data has no founding dates, and inventing them would rewrite promotions' identities.

## Saves

Every new field is optional and created on first use:
- `events`, `world`, `tourneys`, `relations`, `bookers`;
- `Show.special`, `Bout.tourney`, `Bout.farewell`;
- `Person.retired`, `retiring`, `retiredOn`.

A save from before the expansion carries on; a test covers it.

## Tests

- `npx vitest run`: everything. The expansion's files are `titles.test.ts`, `requests.test.ts`,
  `relations.test.ts`, `events.test.ts` and `specials.test.ts`.
- `TITLE_STATS=1 npx vitest run src/career/titlestats.test.ts`: the title table above.
- `EVENT_STATS=1 npx vitest run src/career/events.test.ts`: how often each event fires in a year.

## The indie scene

Lyra's calls set its shape:
- **The ten promotions start with 40 each.** The 40 indies that used to ship were signed by the promotions in their region (`scripts/move-indies.ts`).
- **Every new world generates its own indie scene** (`world/populate.ts`).

**The generated scene:**
- **100–200 wrestlers**, built by the same rules as rookies and created wrestlers. Each is a prospect, journeyman or veteran, with a home region and country. Names and gimmicks come from `data/rtr/names.ts`; each gets traits.
- **Indie brands with named promoters.** Each brand runs a show about every 7–21 days, mostly at weekends. A region's brands are in proportion to its share of the scene, at least two everywhere.
- **All 15 indie titles** go to the best generated indies when the world starts.
- **Older saves:** a world played before the scene existed is topped up to 120 instead.

**The calendar:**
- Each week the brands most due a show run one.
- The draw aims for indie wrestlers × 0.5 dates ÷ 10 slots a show, kept to 6–10 shows a week.
- **Never more than 10 indie shows in a calendar week.** Charity, benefit, tribute and farewell nights and every cup round count towards it.
  - A one-off in a full week takes the place of a regular show nobody's counting on.
  - If none can give way, the one-off moves on a week.
- No region is promised a show every week. A region that's gone 21 days without one gets priority, and each region has at least two shows in any four weeks.

**Who gets booked:**
- Who's around for an indie show depends on how near they are: home 1, a region they've worked lately 0.5, next door 0.2, anywhere else 0.05. Champions are three times as likely to travel.
- The promoter then picks by popularity, reputation and how they feel about the wrestler, less if they're tired.
- There's no quota, so the least popular struggle for dates (Lyra's call). The tests still check that nobody available is ever locked out by a bug.
- **At most two title matches on an indie card, one on a short card.** Promised shots go first, then the most overdue.

**Promoters and promises:**
- Indie promoters are people now. Their patience and memory of you go with them; older saves keep their show-name keys as they were.
- Indie promises roll on to the same brand's next show.

**Monthly upkeep:**
- When the scene is over 220, idle unknowns (90 days without a match, popularity under 10) quietly leave the business.
- When it's under 120, a few new faces debut.

The `LONG=1` harness reports, each year:
- indie dates a month (p10, median, p90);
- who's gone 60 or 120 days without a match, overall and by popularity quarter;
- signed wrestlers' dates;
- indie shows a week and by region.

After the scene went in (3 seeds, a year):

| Measure | Value |
| --- | --- |
| Indie dates a month | median 1.8–2.0, p10 0.6–0.8, p90 2.8–3.0 |
| No match in 120 days | 1–2% overall; 4–8% of the least popular quarter |
| Indie shows a week | median 7–9, never more than 10 |
| Engine time a day | about 0.8 s (unchanged) |

## Regional indie titles

Twelve titles join the three worldwide indie ones: a world and a women's title for each region.

| Region | Titles |
| --- | --- |
| North America | North American Independent Championship · North American Independent Women's Championship |
| South America | South American Independent Championship · South American Independent Women's Championship |
| Europe | European Independent Championship · European Independent Women's Championship |
| Asia | Asian Independent Championship · Asian Independent Women's Championship |
| Africa | African Independent Championship · African Independent Women's Championship |
| Oceania | Oceanic Independent Championship · Oceanic Independent Women's Championship |

The names are proposals, following "World Independent Championship".

**How they work:**
- **Crowned at the start** (Lyra's call): the best indie from the region holds each one when a world begins. An older save gets them on load, crowned from its own indies, with reigns from that day.
- **Defended only on indie shows in their region.** Within the two-title-matches-a-card limit, promised shots go first, then the most overdue.
- **Who can challenge (Lyra's call):** whoever has worked 3 dates in the region in the last 120 days, wherever they were born. Someone with hardly any recent record is judged by their home region instead.
- **Contender score:** regional popularity, plus 2 for each recent date there.
- **Defence chances:** 25% past the minimum gap, 90% once overdue. A planned change is 15%, rising with the length of the reign like every other class.
- **Requests:** asking for a regional title tells you where it's defended and what it takes to qualify ("Work 3 dates in Europe within 120 days first").
- **News:** a change only reaches you if it's your region, you've worked there lately, or you know someone involved.
- **Signings:** an indie wrestler signed by a promotion between the card being drawn and the show still wrestles the date, but not for a title. An indie champion signed with Indie Bookings still defends on the indies.

Per title per year, two years in three worlds:

| Class | Matches | Changes | Champion wins | Plan kept | Median reign |
| --- | --- | --- | --- | --- | --- |
| World | 7.0 | 1.0 | 85% | 97% | 197d |
| Secondary | 11.1 | 1.7 | 84% | 97% | 140d |
| Indie (worldwide) | 12.9 | 1.9 | 85% | 97% | 134d |
| Regional | 9.8 | 2.0 | 79% | 95% | 101d |

Over three years in three worlds, under the weekly cap, every one of the 15 indie titles gets at least 5 defences a year. None goes more than 90 days without one, not counting days its champion was injured. Indie cards average 0.3 title matches.

## Performance

Two opt-in harnesses keep an eye on speed and save size:
- `PERF=1 npx vitest run src/career/perf.test.ts` (`DAYS=14`): days with the real match engine.
- `LONG=1 npx vitest run src/career/longrun.test.ts` (`YEARS=3 SEEDS=7,11,23`): years with the quick stand-in.

The sim worker is only sent the wrestlers in that night's matches.

Baseline before the indie, traits and bookers expansion (seeds 7 and 11):

| Measure | Value |
| --- | --- |
| Matches a day | about 15 (p95 18) |
| Engine time a match | 55 ms median, 100 ms p95 |
| Engine time a day | 0.8–1.0 s |
| Main-thread time a day | about 3 ms |
| World save | 760 KB at the start; about +1 MB a year of history (1,000 shows) |
| Serialising the world | 50–60 ms after a year or two |

Budgets for the expansion:
- a day takes a median of 1.5 s or less (p95 3 s);
- main-thread work 50 ms or less a day;
- saving 60 ms or less.
