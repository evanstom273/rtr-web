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
- **A straight 200 wrestlers** (Lyra's call), built by the same rules as rookies and created wrestlers. Each is a prospect, journeyman or veteran, with a home region and country. Names and gimmicks come from `data/rtr/names.ts`; each gets traits.
- **Indie brands with named promoters.** Each brand runs a show about every 7–21 days, mostly at weekends. A region's brands are in proportion to its share of the scene, at least two everywhere.
- **All 15 indie titles** go to the best generated indies when the world starts.
- **Older saves:** a world played before the scene existed is topped up to 200. A scene from before the straight 200 grows to it (world rev 6), with new brands so the extra wrestlers have somewhere to work.

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
- Someone the promoter has promised you that night (the champion for a title shot, a challenge opponent) is always flown in.
- There's no quota, so the least popular struggle for dates (Lyra's call). The tests still check that nobody available is ever locked out by a bug.
- **At most two title matches on an indie card, one on a short card.** Promised shots go first, then the most overdue.

**Promoters and promises:**
- Indie promoters are people now. Their patience and memory of you go with them; older saves keep their show-name keys as they were.
- Indie promises roll on to the same brand's next show. A title shot only rolls on to a night the title can be on (never a cup night).

**Monthly upkeep:**
- When the scene is over 220, idle unknowns (90 days without a match, popularity under 10) quietly leave the business.
- When it's under 200, a few new faces debut (up to four a month).

The `LONG=1` harness reports, each year:
- indie dates a month (p10, median, p90);
- who's gone 60 or 120 days without a match, overall and by popularity quarter;
- signed wrestlers' dates;
- indie shows a week and by region.

With the straight 200 (3 seeds, three years; the scene drifts up to about 230 as promotions release people):

| Measure | Year 1 | Year 3 |
| --- | --- | --- |
| Indie dates a month | median 1.6–1.7, p10 0.7, p90 2.7–2.8 | median 1.3–1.4, p10 0.4, p90 2.5 |
| No match in 120 days | 1% overall; 2–6% of the least popular quarter | 3–5% overall; 9–14% of the least popular quarter |
| Indie shows a week | median 10 (at the cap), never more | the same |
| Engine time a day | about 0.8–0.95 s median, 1.7 s p95 | |

At 100–200 it was a median of 1.8–2.0 dates a month and 1–2% idle. Fewer dates each is the price of a
bigger scene: the weekly cap of 10 shows doesn't move, so 200 wrestlers share the same slots.

## Rosters (Lyra's call: 38–40)

Every major promotion aims for 38–40 wrestlers (`career.ts: scoutRosters`, last thing every night):
- **Someone leaves** (released, contract up, poached, retired) and the promotion goes scouting. The
  replacement signs from the indie scene 7–21 days later (`ROSTER_SCOUT_DAYS`), one at a time, until
  they're back to 40.
- **Under 38** they sign straight away, back to 38, and carry on scouting to 40.
- **Nobody signs or poaches past 40.** Your own signing can take a roster to 41.
- **Like for like:** the division that's short against how the promotion ships gets the signing, so
  neither the men's nor the women's division drains away. Within it, the best popularity in the
  promotion's region. Indie champions aren't signed while they hold a belt.

## Starting a career: the universe first (Lyra's call)

When there's a career or a world that's been played, New career asks first: keep this world, or a
fresh one. Then you pick or create your wrestler from that world, so the rosters you see are the ones
you'll play. A fresh world is only a look until you start: back out and the world you had comes back
exactly as it was, and nothing's saved until you begin.

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

## Traits

Every wrestler has one to three traits, any mix of in-ring and backstage (catalogue in `data/rtr/traits.ts`). They shift chances; they never decide anything outright. Every number lives in `tuning.ts`: `TRAIT_FX` for in-ring traits, `TRAIT_BACKSTAGE` for backstage ones.

**Conflicts** (Lyra's call): only Loyal/Mercenary, Professional/Rebellious and Team Player/Egotistical. Every other combination is allowed.

**In the ring** (`engine/traits.ts`). The AI's choices are leaned by trait (`ai.ts`). These also apply to the side you control:
- the dice, shown as chips: Guarded, Big match, On form / Off night, Showboat, Methodical, Aggressive start, and the cheaper high-risk roll;
- kickouts and escapes (Resilient);
- holds (Submission Specialist);
- crowd heat (Risk Taker, Showboat, Crowd Pleaser);
- the referee (Dirty Fighter);
- momentum (Defensive) and stamina (Aggressive).

A match is big for the Big-Match Performer when it's a title match, a special or flagship, a cup final or a farewell.

**Calibration:** mirror matches, a wrestler against a copy of themselves with and without the trait (`npx vite-node scripts/trait-sim.ts 600`). Win-rate shifts before the last retune:

| Trait | Win rate |
| --- | --- |
| Submission Specialist | +5.8 |
| Methodical | +2.8 |
| Resilient | +2.7 |
| Showboat | +1.7 |
| Inconsistent | +0.8 |
| Opportunist | +0.5 |
| Risk Taker | −0.3 (+0.12★) |
| Dirty Fighter | −1.0 |
| Crowd Pleaser | −0.8 (+0.05★) |
| Defensive | −2.3 |
| Aggressive | −4.2 |

Noise is about ±2 points. Aggressive and Defensive got gentler downsides afterwards, and Big-Match Performer went to +2 dice in big matches, because +1 measured as nothing.

**Backstage** (`career/leans.ts`, `career/personality.ts`):
- AI contracts:
  - Loyal renews more and is half as poachable;
  - Mercenary the opposite;
  - Ambitious leaves when stuck below the top third.
- Simulated planned finishes are re-run more for Professional and Team Player losers, and less for Rebellious and Egotistical ones.
- Your patience, trust, relationships and negotiations are adjusted by your own traits.

**Getting traits (the player):**
- What you do in matches you play, and your choices in events, contracts and requests, builds points towards traits. Points fade 15% a month.
- At the bar, which is 100 and rises 50% for each trait held, a card offers it. You always confirm, even with a free slot; with three, you choose one to replace.
- Offers are at least 180 days apart. A declined one can't come back for a year.
- Buying in Training: £12,000 (£15,000 for Big-Match Performer and Crowd Pleaser), one every 90 days.
- A created wrestler's starting trait comes from their life story.

**The world's personalities:**
- Checked about a quarter of wrestlers a month, with at most one change a year each, and only from circumstances: age, renewals, moves, long reigns, a young wrestler's breakthrough.
- Each change is recorded in history.
- Veterans with Mentor bring on a young wrestler near them: +1 a month to their weakest attribute, up to +4, and a mentor bond.

## Social media (hidden: the big cut, `docs/cut.md`)

Optional and light, between matches (`career/social.ts`, `FEATURES.social`). There's no follower count, and posting takes no time.

- **Actions:**
  - post an update;
  - promote your next match (that show's fans +15%);
  - reply to someone (relationship +2);
  - call someone out (relationship −3; for 30 days a match with them is 8 points easier to ask for);
  - start a beef (relationship −8 and a rivalry).
- **Fans:**
  - An action reaches 40 + 2.5 × (worldwide fans)^0.6 people: 144 at 500 fans, 1.7k at 50k, 19.5k at 3M.
  - It converts post 3%, promote 2%, reply 2%, call-out 4%, beef 5%.
  - Buzz is ×1.5 with a match this week or a live rivalry, ×1.3 after a 4★+ match.
  - New fans go where your fans already are.
- **Limits:**
  - one action a day;
  - the same kind again within a week is half as good each time;
  - a weekly cap of 3 + 0.03% of your fans.
  - That last one was lowered from the planned 5 + 0.1%: with the planned cap, posting on top of wrestling came out at about 1.5× wrestling alone, against the plan's rule of at most 1.3×. Now it's at most about a third more, and posting alone is worth far less than wrestling.
- **Backfiring:** call-outs 15%, beefs 25%: you lose 1% of your reach in fans and 1 reputation.
- **Personality:**
  - posting leans Showboat;
  - promoting leans Professional and Crowd Pleaser;
  - call-outs lean Showboat and Egotistical;
  - beefs lean Hot-Headed and Egotistical.
  - Once a day at most, so it never outpaces how you wrestle.
- **The AI** posts two to five times a week: champions brag, feuds spill over, hot-heads start beefs that cost them a little goodwill with each other. Someone calling you out reaches your mail.

## Fan growth

How wrestlers win fans (`career/fanGrowth.ts`, no randomness), replacing the old popularity rules:

- **The audience** a show reaches in its region:
  - A major promotion's weekly TV is about 1M at popularity 80, ten times smaller for every 40 points less.
  - That's full in its home region, 35% next door and 15% elsewhere.
  - Show size: tour ×0.6, special ×2, flagship ×3, SLN's weekly flagship ×1.3.
  - An indie brand reaches about 300 people at popularity 5 and 15k at 30 (live and streaming), ×1.5 on a special night.
- **Conversion:**
  - A 3★ match converts 1.5% of a thousand-strong crowd, less of a bigger one, about 0.3% of a TV million.
  - It doubles for every star above 3.
  - A win is ×1.3, a loss ×0.8, a title win ×1.5, Crowd Pleaser ×1.15.
- **Saturation:** you stop winning fans from a show once your fans in that region pass 20 × its audience. A niche following tops out at the scene it works in, and a main-eventer at the size of their TV audience.
- **Spillover:** a 4★ match reaches 5% further, 4.5★ 10%, 5★ 15%. 60% of that goes to your strongest other region, the rest spread round. A five-star indie match is worth a few hundred fans at most, not a global breakthrough.
- **Loss:**
  - Under 1.5★ costs 0.3% of your fans there.
  - Idle for 30 days or more: −0.5% a month everywhere.
  - Events and cups: each old "point" is 1.5% of your fans there, at least 15 people.

Three years of the world (`LONG=1`, 3 seeds):

| | Start | After 3 years |
| --- | --- | --- |
| Signed, median fans | about 600k | 720–756k |
| Signed, bottom tenth | about 45k | 60–115k |
| Top star | 10M | 10M |
| Indies, median | about 2.6k | 4.5–4.9k |

Low-carders grow fastest, because TV puts them in front of big audiences.

**A thin regional division** (an interpretation for Lyra): when nobody in tonight's pool has worked a regional title's region enough to challenge, someone from that region can. Without it, the South American women's title once went 98 days without a defence for want of a challenger.

## Pay and living costs (economy stage)

Lyra's calls:
- About £2,500 a match at the bottom of a major promotion.
- Indie fees lower and not the same everywhere.
- How many dates you get decides your income.
- Weekly living costs where you live.

**Major promotions** (`economy.ts: contractFee`, `clauses.ts: feeFloor`):
- **The floor** is the weekly-show fee: £2,500 at popularity 46, rising £29.40 a point (about £3,500 at 80).
- **The fee** is the floor × (your fans in the promotion's home region ÷ its roster's median)^0.5, never below the floor and at most ×8.
- **Opening offers** start at the floor at least.
- **Negotiation** starts from the same fee and keeps reputation, form, traits, rival offers and clauses as before.
- **Show sizes:** weekly ×1, tour ×0.8, special ×1.5, flagship ×2.5. SLN's Friday show, a flagship every week, pays ×1.25.
- **Existing saves:** contracts and open offers below their promotion's floor come up to it (world rev 8); nothing else about them changes.

**Indie fees** (`indieFee`):
- £50 × the brand (0.8 at popularity 5 to 1.3 at 30) × (your fans in that region ÷ 500)^0.48.
- × 1.5 if you hold an indie title; × 1.3 on a special or cup night.
- Between £30 and £1,500: 500 fans £50, 5k £150, 50k £455, 500k £1,375.
- A loss pays 75% (`LOSS_CUT`).

**Merch:** worldwide fans × £0.006 a month × your Merchandise Rights share; a free agent sells their own at £0.002.

**Starting money:** £1,000 + £2,000 × log10(worldwide fans ÷ 1,000) for someone you pick; £500 for a created wrestler.

**Living costs** (on; `FEATURES.livingCosts`):
- Every Monday where you live: Europe £220, North America £253, Oceania £242, Asia £176, South America £132, Africa £110.
- Keyed to the Monday, so a replayed night can't charge twice.
- An existing career gets a letter and four weeks' notice; a new one pays from its first Monday.

**The ledger:**
- New kinds: living, wage, relocation, event. Event money is no longer filed under training.
- Finances totals now count every pound since day one; the ledger itself keeps the latest 400 entries.

**Two years of five lives in the real game** (`ECON=1 npx vitest run src/career/economy.test.ts`):
- Living costs are on and fans are held fixed.
- Lives take their best-paying indie offers (local first), and anything over £1,000 goes on training.

| Life | Dates a month | Balance after 1 / 2 years | Points | Model |
| --- | --- | --- | --- | --- |
| Unknown indie, no job | 0.6 | −£10.0k / −£21.5k | 1 | −£10.2k / −£20.5k, 0 |
| …with part-time retail (£250) | 0.7 | +£1.2k / +£1.1k | 6 | +£1.1k / +£1.3k, 7 |
| Indie regular (5k fans) + retail | 3.8 | +£1.4k / +£1.0k | 13 | +£1.3k / +£1.5k, 19 |
| Successful indie (50k), full-time | 6.3 | positive | 46 | 53 |
| Newly signed, bottom of VWF | 4.1 | positive | 93 | 103 |
| Star (Buck Stratton) | 7.8 | £2.8M | caps out | caps out |

- Five of the six land within 25% of the model.
- The indie regular trains less than the model, because real travel averages about £60 a date against the £40 assumed.
- With fans allowed to grow, the old popularity rules (now on fans) compound too fast: a 50k indie reached 3.9M in two years. The fan-growth stage replaces those rules.

## Fans and promotion popularity (world rev 7)

Lyra's calls:
- Wrestlers have real **fan counts** in each of the six regions, and **worldwide is their sum**. There's no global pool.
- They replace the old 0–100 popularity, on **five times the base curve**: `fans = 150 × 10^(old ÷ 20)` per region.
  - old 20 → 1,500 fans;
  - old 50 → 47,000;
  - old 80 → 1.5M;
  - old 95 → 8.4M.
- Promotions keep a separate 0–100 popularity, which now moves.

**Converting** (`world/world.ts: toFans`; the shipped data through `scripts/to-fans.ts`):
- Exact, with no jitter:
  - every regional score comes back as it was, to 0.1;
  - regional order never changes;
  - equal old values stay equal.
- The shipped 400 have a median of 604k fans worldwide (q1 167k, q3 1.5M, max 10M). Friedrich Hoffman has 3.0M; Buck Stratton 7.3M.
- Worldwide rankings differ from the old "global", which was the regions' average. With the approved curve, a regional peak outweighs being known everywhere.

**New wrestlers** (`career/fanStart.ts`):

| Who | Home region | Each neighbouring region | Each other region |
| --- | --- | --- | --- |
| Created wrestler | 500 | 25 | 5 |
| Generated indie | Their archetype's old home range through the curve (prospect 380–1,200, journeyman 750–3,800, veteran 1,500–7,500) | 5–15% of home | 0–3% of home |
| Rookie | Start like prospects | 5–15% of home | 0–3% of home |

**Formulas built on the old scale:**
- Weights, odds, contender scores and thresholds read `fanScore` (a region) or `globalScore` (the six averaged).
- `fanScore` is the log of a wrestler's fans: exactly their old popularity for a converted wrestler, never below 0, with no ceiling.
- So nothing the AI decides shifted when the counts arrived. Rankings, bookings and event eligibility are the same on day one, and they move with fans from then on.
- `globalScore` is the regions' exact mean, where the old global was rounded; that's within 0.5 for shipped wrestlers.
- Results, cups and events now report fans gained ("+1.2k fans in Europe").

**Promotion popularity** (`career/promoPopularity.ts`, monthly, no randomness):
- It starts at 10 + 70 × the old budget factor: TCG 80, VWF and NWGP 70.9, ZWA 68.1, SLN 64.6, IVW 57.6, SSWC 56.9, AAWA and END 52, UFC 46.4.
- Each month it moves at most a point towards 10 + 70 × (roster's average score ÷ 43.5) + (90-day average stars − 3) × 8, bounded 10–95. 43.5 is TCG's shipped average, the old budget's base.
- Pay reads it through `budgetOf` (popularity − 10) ÷ 70, so pay at the start is exactly what it was.
- Signed contracts keep their fee whatever happens to it.
- **Indie brands:** 5–30, moving a point a month towards 15 + (90-day average stars − 3) × 10.

**Screens:** fan counts everywhere (profile, start, records, requests, the exhibition profile, the roster sort, the tale of the tape). Promotion popularity stays 0–100 and shows in the Records promotion header.

## Match ratings (recalibrated)

Lyra's targets, long-run and never quotas:
- median about 3★;
- 4★ or better about 12% (a strong performance);
- 4.5★ or better about 2% (exceptional);
- 5★ about 1 match in 1,000.

Before the recalibration, about half of all matches rated 4★ or better.

**How a match is rated** (`engine/rating.ts`):

Five style-neutral scores, each 0–1:

| Score | What feeds it |
| --- | --- |
| **Crowd** | Average and peak heat |
| **Story** | Heat segment, comeback, limb work and its payoff |
| **Drama** | Near-falls, finisher kickouts, reversals (capped), counters of a counter, deep escapes from a hold, stipulation moments |
| **Craft** | Finish quality, length, variety, pacing; DQs and count-outs cost |
| **Spectacle** | High-risk moves, outside spots, big hard-hitting moves, hardcore |

- **The best four count**, weighted: crowd 1.2, story 1.0, drama 1.1, craft 0.9, spectacle 0.8. A technical or submission classic isn't marked down for having no high spots; a brawl isn't marked down for having little limb work.
- **One fixed curve** turns that composite into quarter stars (`RATING_CURVE`). It's steeper at the top, and nothing in it depends on the promotion or the show's size.
- A title adds a touch; the Big-Match trait adds its own bonus.
- **New crowd moments** so technical styles can reach the top: near-tap +10 heat, escaping a hold you nearly tapped to +6, a counter straight back from a counter +6.
- **Big hits** (impact 9+, not high-risk) count as spectacle, so powerhouses and strikers aren't stuck without one.

**Measured** on 50,000 headless matches: the whole world, shipped and generated wrestlers, 12% with stipulations, 15% title matches, 30% played-style.

| | Median | 4★+ | 4.5★+ | 5★ |
| --- | --- | --- | --- | --- |
| Before | 3.75–4 | 49–52% | 22–27% | 2–10% |
| After | 3 | 12.3% | 2.1% | 0.11% |

By style:
- **4.5★+ rates** run from technical and powerhouse (about 1.6%) to strikers (about 3%), within ×2 of each other.
- **5★ matches** came from six different styles.
- **No size effect:** played and simmed matches are close (4★+ 13% / 12%), and indie and promotion matches are the same (12.5% / 12.0%).
- **Ability barely matters,** before or after: a median 3★ at every ability band. That's how the engine's crowd works; it isn't changed here.

**Refitting** (if the crowd model changes):
1. Run `npx vite-node scripts/rating-corpus.ts N SEED out.jsonl` (four in parallel, about 11 minutes for 50,000).
2. Run `python3 scripts/fit-rating.py out*.jsonl`, which mirrors `ratingDims` and `ratingComposite`.
3. Copy the knots into `RATING_CURVE.at`.

`RATING=1 npx vitest run src/engine/__tests__/rating.test.ts` checks 4,000 fresh matches against the targets.

**Things that read stars:**
- These stay at 4★, which is now a genuinely strong match: the reputation bonus, the booker's "good match" memory, the relationship boost, patience, and the great-match event.
- Crowd Pleaser now also leans on a 3.75★ match (+8, or +15 at 4★+), so the trait still comes up.

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

## Days, travel, day jobs and skipping (on; day jobs hidden: the big cut, `docs/cut.md`)

`career/day.ts`, `career/skip.ts`, `FEATURES.days` / `jobs` / `skip`.

**AM and PM:**
- Each day has an AM and a PM.
- A free phase follows your routine: rest (−4 fatigue) or a training session.
- A training session buys up to 2 points at today's prices and adds +6 fatigue. Injury chance by fatigue before the session: none under 40, 0.25% at 40+, 0.75% at 60+, 2% at 80+.
- Sleep takes −10 fatigue, or −4 after a match.
- A legacy save starts at the AM of its day; nothing is replayed.

**Travel:**
- A booking reserves the whole trip:
  - same country: no time;
  - same region: the AM of the show day;
  - another continent: the whole day before.
- You go home the same way, unless your next date in the region is within 4 days (a tour).
- A booking that would clash is refused, with the reason. Bookings made before days came on are honoured as they were.
- The AI is never booked on two continents on consecutive days.
- A regional indie champion 45+ days without a defence isn't booked on indie shows outside their region, so they're free for home (`REGIONAL_HOME_DAYS`; without it one thin division went 96 days).

**Moving:**
- £300 within your region, £1,500 abroad. It takes three days and ends a day job.
- Signing with a promotion in another region brings an offer to pay 75%.
- A fully paid move goes through even when you're overdrawn.

**Day jobs:**

| Job | Shifts | Pay a week (Europe) |
| --- | --- | --- |
| Office | Mon–Fri AM | £420 |
| Warehouse | Mon–Fri AM | £450 |
| Retail | Mon/Wed/Fri AM | £250 |
| Hospitality | Thu–Sat PM | about £250 |
| Gig | any phases you pick | £45 a shift |

- Pay scales with the region's cost index, and wages are paid on Fridays.
- Time off:
  - 7+ days' notice: unpaid, no strike;
  - shorter notice: it comes out of your 20 paid phases of holiday a year;
  - otherwise it's a strike. Three strikes in 90 days and you're sacked.
- A booking against a shift follows your standing answer (take the time off, keep the shift) or comes as a letter asking.

**Money trouble:**
- At −£1,500 with no job, a letter offers gig work (always), a job off the board, a loan from a friend with a bond of 40+ (£1,000, repaid from 20% of your fees), or riding it out.
- It comes at most every four weeks.

**Skipping:**
- Moves on a phase, a day, some days, to a date, or to your next booking.
- It does everything a normal advance does: the same world as pressing the button each time (tested).
- It stops for:
  - your match (unless you sim them);
  - a letter that needs an answer;
  - an injury;
  - a contract change;
  - news from work.
- The advance button now saves only after a whole phase succeeds; a night that fails reloads the last save.
- Matches run on a pool of up to four workers. Results are applied in show and card order, so the pool never changes the outcome.

**Screens (Lyra approved them; every switch is on):**
- **Calendar:** the date shows AM or PM. The big button moves on half a day ("On to the evening", "On to tomorrow") and says what you're doing; with a match tonight, the morning is still yours and the PM goes to the show. The » button opens the skip sheet: tomorrow morning, a week, a month, your next booking, and whether to stop for your matches or sim them. A skip shows its progress with a Stop button, saves at each day's end, and says why it stopped.
- **My week** (Career grid): the next seven days half by half (tap a free one to switch train/rest; it repeats weekly), what to train first, when to skip training tired, match days, skipping. Work: your job (pay, shifts, holiday, warnings, quit) and the board. Home: where you live, living costs, travel times and moving.
- **Social** (Career grid): one post a day with an estimate for each kind, who it's about, this week against the cap, and the feed.
- **The gym:** a session in a free half-day, two points at most; shut while you're working, travelling, moving or overdrawn, or once you've trained that half-day.
- **Finances:** living costs a week and your day job's pay.

## Validation with everything on (stage V)

Every switch on: days, jobs, skipping, social, living costs.

**`ECON=1`: two years of six lives (balance at 3/6/12/18/24 months).**

| Life | Balance | Notes |
| --- | --- | --- |
| Unknown, ~1 date a month, no job | −£1,030 → −£21,085 | The money-trouble letter keeps coming; living costs £22,880 against fees of £1,095. |
| The same with part-time retail | £1,490 → £1,145 | Level: wages of £26,000 cover the rent. |
| Indie regular (5k fans) with retail | £1,495 → £1,400 | Level, with 12 points of training bought. |
| Successful indie (50k fans), full-time | £1,735 → £1,825 | Level on 6 dates a month, with 41 points bought. |
| Newly signed, bottom of VWF | £1,665 → £6,615 | Climbing even after buying 96 points. |
| Established star | £374k → £2.98M | |

**`LONG=1`: three seeds × three years.**
- A world day takes 6–8.5 ms (median) and 14–20 ms (p95). The save grows 2.6 MB → 5.0 MB.
- Indie dates a month: median 1.6–1.8. Indies with no date in 120 days: 0–3%, or up to 9% in the lowest popularity quarter.
- Fans worldwide:
  - signed median: 572k–601k in year 1, rising to 726k–734k in year 3;
  - indie median: 2.4k–2.8k rising to 4.5k–4.9k;
  - nobody runs away (the max stays at about 10M).
- Indie shows a week: median 10, at the cap. The low minimums are the part-weeks at the year edges.
- The regional titles test (three years) passes with travel on, now that overdue regional champions stay home.

**`PERF=1`: real engine, 14 days, two seeds.**
- 13–15 matches a day to sim, at about 70 ms each.
- That's about 1 s a day on one thread, with the main thread taking 5–7 ms a day.
- In the browser the pool of up to 4 workers shares that out. A 30-day skip should take roughly 8–12 s on a 4-core phone (target 15 s). This is worked out from the per-day figures, not measured in a browser.

## Mail (on; check-ins and the press hidden: the big cut, `docs/cut.md`)

Lyra's calls: everything in a result letter, wrestlers writing, weekly check-ins, a weekly digest, the press, tabs by type, replies on anything, bundled volume, in-character voices, world news from everywhere, ignoring sometimes matters, every kind of mail can stop a skip, a year kept. `career/mail.ts`, `career/voice.ts`, `FEATURES.mail`.

**Tabs:**
- **Needs you:** open decisions, plus letters you'll pay for ignoring.
- **Results.**
- **People:** wrestlers, bookers, the press, and settled offers and events.
- **News:** the digest and world news.

**A result letter has:**
- the five grades with their notes, and the recap, the same as the results screen;
- your booker or promoter's verdict, in their voice, depending on whether you followed the plan and how good the match was;
- what it did: pay (and travel), fans worldwide and by region, reputation, form, your opponent's relationship label, and the booker's patience;
- two to five posts online (fans, your opponent, a friend), more for a better match.

You can reply: thank the booker, ask for a bigger spot, or ask for the opponent again. Your history keeps the five grades for check-ins and mentors.

**Voices:** picked from traits.
- hot (hot-headed, aggressive, rebellious);
- cocky (egotistical, showboat, ambitious);
- pro (professional, reliable, methodical);
- warm (mentor, loyal, team player, crowd-pleaser);
- sly (politician, opportunist, mercenary, dirty fighter);
- otherwise plain.

**People who write:**
- **Your opponent:** after a match, 45% of the time.
- **A friend:** after a title or a 4★+ match (a bond of 30+). Answer within 7 days, or the bond drops by 3.
- **A rival calling you out:** this replaces the old online call-out notice. Answer within 5 days, or they tell everyone you're scared: −1 reputation, −2% of your reach in fans, and a line in the digest.
- **A mentor:** a tip from the weakest part of your last four weeks of grades, about every other Monday.

**Mondays:**
- **Booker check-in.** Your booker writes, or for a free agent the indie promoter you've worked for most this month. It covers:
  - your trend (up, down, steady or quiet), plus a grudge line if you went off-script;
  - what they want, from your weakest grade;
  - this week, the last four weeks, patience, and the top title.
  - You can reply: understood (+1 patience), I want more (−2), complain (−5).
- **The Weekly digest.** Sections:
  - your week;
  - match of the week and the best matches;
  - title changes;
  - moves;
  - comings and goings;
  - injuries;
  - milestones;
  - business and headlines;
  - power rankings (the last 30 days, wins and stars);
  - online.
  - Up to 8 lines a section.
  - News-desk stories about other people wait for it. News about you or your promotion stays a letter.

**The press** (2,000+ fans, a 40% chance a week, at least 21 days apart):
- **An interview:**
  - humble: 1% of reach;
  - cocky: 3%, with a 20% chance of backfiring;
  - calling out a rival or your promotion's champion: 5%, with a 35% chance of backfiring;
  - no comment.
- **A rumour, when another promotion has an open offer:**
  - deny it: +2 patience, loyal;
  - play coy: politician;
  - talk it up: −4 patience, mercenary, public.

Public replies' fans count against the weekly social cap, so mail can't out-earn wrestling. A backfire costs 2% of reach and 1 reputation.

**Skips** stop for new mail by kind: decisions, people, check-ins, news and results. All are on by default, and each can be switched off in the skip sheet.

**Keeping:** a year of mail, up to 1,500 letters. Undecided offers are always kept.

## Side earners (on)

Lyra's calls: all eight earners, effort-based, and genuinely lucrative for an indie who puts the time in, though never guaranteed or effortless. They take half-days; content earnings, sponsors and fundraisers tick along in the background. Signed wrestlers need Outside Appearances (Approval Required: only while patience is 50+; your own show needs Limited Freedom). Injured wrestlers can do the quiet ones: coaching, commentary, conventions, content and sponsors. Medical bills are unchanged. `career/hustle.ts`, My week › Earn, `FEATURES.hustles`.

**The earners:**

| Earner | How it works |
| --- | --- |
| Merch table | Stock at £8 a shirt, sold at £20. Sales at each show you work: (2 + 3 × log10(local fans ÷ 100 + 1)) × stars (×1.4 at 4★+, ×0.6 under 3★) × show size. Stock also sells online each Monday: 0.03 a subscriber + 0.02 × √fans, ±30%. |
| Conventions | Saturdays and Sundays, somewhere in your region. Photos: 0.9 × local fans^0.35, at £15 + £5 per tenfold fans over 1k. Under 25k fans you pay a £40 table; from 25k you get a guarantee of £60 × (fans/1k)^0.6, capped at £6,000. Turnout varies ±30%. +2 fatigue, the whole day, plus travel. |
| Coaching | Up to 8 half-days a week. £25 + 0.4 × reputation + skill, multiplied by up to 2.5 with experience (every 60 classes adds +100%). +1 fatigue. |
| Working a show | Referee £45, ring crew £35, commentary £50 (×1.2 outside your region). Booked from an indie show's sheet. |
| Content | Subscribers head for 2.5% × fans^0.95 (more slowly past 100k fans). Each Content half-day in the last 14 days multiplies that by 1.4, up to ×3. Posting and wrestling keep them growing at half the rate; doing nothing loses 3% a week. £3 a subscriber a month, paid weekly, ±30%. |
| Sponsors | Once a region has 5k of your fans: a 35% chance a month of an offer of £0.02 a fan there a month, for 3–6 months, up to 3 at once. They renew at +25% if you've posted in the last 30 days. |
| Fundraiser | Offered when you're out for 14+ days. Total: (500 + 2 × fans^0.7) × (0.5 + reputation ÷ 100), capped at the injury's bills and rent, and halved if you've run one in the last year. Paid over 14 days. |
| Your own show | A Saturday 14–60 days out in your region. A hall (150 seats, £300), a nightclub (400, £900) or a small arena (1,200, £3,000), plus £550 for the ring and crew. You choose your opponent and up to 4 hires, at their indie fee ×1.2. Tickets £10, £15 or £20. |

**Own show numbers:**
- Draw: 10 + 0.6 × Σ√(local fans) across everyone on the card, × (1 + following) × (12 ÷ price)^0.8, ±15% on the night.
- Merch: £1.50 a head, scaled by the best match.
- Following:
  - +0.2 for a 90%-full house with a 3.5★+ match, +0.1 for either one;
  - −0.15 for neither;
  - it runs from 0 to 2 and fades 0.03 a month.

**12 weeks at 5k fans (`hustle.test.ts`):**

| Approach | Side earnings | Breakdown |
| --- | --- | --- |
| Grinding: 6 coaching classes and 3 content half-days a week, plus conventions | £9,300, about £3,100 a month | coaching £4,900 (fee about doubled after 63 classes), online merch £1,500, subscribers £1,350, merch table £1,100 |
| Stocking shirts only | £1,700 | mostly the merch table at shows they wrestled anyway |

Wrestling paid £1,345 over the same 12 weeks.

## Development and decline (on)

Lyra's calls, approved numbers. `career/development.ts`, `DEV` in `tuning.ts`.
- Every AI wrestler has a **hidden potential** (an attribute total they can grow to) and a **hidden peak age** (27–33). Both are rolled from the world's seed the first time they're needed, so every wrestler gets one and it's always the same.
- **Room to grow:** 20–120 points above where they start, most 40–70. It shrinks from age 25 and is gone by 30.
- **Before the peak:** each month a wrestler closes 1.2% of the gap to their potential. That's ×1.3 when working 3+ dates a month and ×1.2 with a mentor. Points go mostly to what they're already good at.
- **From 34:** they lose 2–4 points a year, and 5–8 from 38. Speed and stamina go first, charisma last.
- **Your own wrestler** only changes through training.
- **Shipped wrestlers** retire as if 3 years younger (`SHIPPED_RETIRE_YOUNGER`).

**Five years (seed 7, `LONG=1`):**
- Signed median ability holds at 444–445, and the top 10% rises from 477 to 486.
- The indie median rises from 412 to 432 as the young develop.
- The median age holds at 29.

## The history sim (on)

Lyra's calls: an optional history before choosing a wrestler, run on a fresh world, year by year. Code: `career/worldSim.ts`, `career/historySim.ts`, `ui/career/HistorySim.tsx`.

**Starting it:** pick a fresh world with history from the world choice, or "Simulate history first" on the start screen of a fresh world, then choose 1–10 years.

**Backdated:** the world is wound back N years and history plays out to today, so your career starts on today's date.
- **Shipped wrestlers:**
  - **Ages** go back by N.
  - **Abilities** go back along the development curve, aiming at a potential of their shipped level ±25.
  - **Fans** shrink with the years they'd been in the business: ((years then + 1) ÷ (years now + 1))^1.5, never below a newcomer's.
- **Too young back then:** they debut on the indies at 19–22, capped so everyone shipped has debuted by today.
- **The indie scene:** today's generated indies never existed. A fresh scene is generated for the start: 200 plus the majors' shortfall against 40-man rosters, so it's still a normal size once scouting has filled them.
- **Starting champions:** each title starts with the biggest name on its roster (right gender, right region).

**Running it:**
- History runs through every system, with nobody playing. "You" is a hidden placeholder who's never booked or written to, and mail, side earners, events and offers stand down.
- Every match goes through the full engine on the worker pool.
- After each year: a summary of the champions, best matches, biggest moves, retirements and debuts you'll know. Then carry on, or start your career there.
- After the last year: a review with the title histories, the greatest matches, moves, retirements and the rookies who made it.
- It saves at each year's end. Closing mid-year loses only that year, and opening career mode resumes it.
- Once the first year's saved, it replaces the previous world and career.

**The hand-over:** your career carries on from the world history made. The calendar, every contract, title clocks, feuds, cups, injuries and reputations all carry over. If the wrestler you pick had announced a retirement, it's cancelled.

**Picking afterwards:**
- Sort by card, fans, ability, age or debut year, and filter by age.
- Each wrestler shows their debut year.
- "Ones to watch" lists the young wrestlers who grew most in the last year. Their potential stays hidden.

**The shipped stars** retire as if 3 years younger, everywhere.

**10 years (`HISTORY=1`, fast stand-in sims, seed 12):**

| | Start of history | Year 1 | Today |
| --- | --- | --- | --- |
| Signed median ability | | 410 | 426 (a normal world: 444) |
| Signed median fans | | 57k | 341k |
| Indie scene | | 218 | 449 (left to grow, Lyra's call) |

- **Shipped wrestlers still active today:** 336.
- **Rosters:** full throughout, with no vacant titles at any point.
- **Cost:** about 5 seconds a year with the stand-in sims, and a 13 MB save.

## While you're away (on)

Lyra's call: during a skip, your character answers mail by standing orders, set in My week › Away. There's a quick on/off switch in the skip sheet, and a summary of everything handled appears when the skip ends. Answered letters don't stop the skip; anything the orders don't cover still does, if that kind of mail is ticked. `career/away.ts`.

- **Indie dates:** take them (the default), or ask you. They're turned down if:
  - they pay under your minimum (anything, £100, £250, £500, £1,000);
  - they're beyond your reach (your country, your region, anywhere);
  - you're more tired than your limit;
  - they don't fit your schedule.
- **Career events:** say yes (the first option that isn't a refusal), say no, or ask you (the default).
- **People and press:** reply graciously, cockily, fierily, or ask you (the default).
- **Contract offers:** ask you (the default), re-sign only, or any promotion, at or above a minimum fee. They're signed as offered, with no negotiating.

The skip sheet also takes **a number of days** (1–365) as well as tomorrow, a week, a month and your next booking.

## Contracts: the 25 clauses (on; 11 hidden by the big cut, `docs/cut.md`)

Lyra's design, built across stages 1–8: `clauses.ts` (the clauses, groups, promotion characters, packages), `deals.ts` (everyone's deals, exclusivity rules, AI deals, rewriting old contracts), `contracts.ts` (negotiation and signing), `exclusive.ts`, `creative.ts`, `money.ts`, `body.ts`, `shape.ts` and `conduct.ts` (what each clause does), and the screens `Negotiate.tsx`, `Contract.tsx`, `Creative.tsx`, `Rebrand.tsx` and `Epilogue.tsx`. Every number is in `tuning.ts` under *Clauses* and is a **proposal**, waiting on Lyra's approval.

**Structure.**
- **Tiers:** every clause is None plus three tiers.
- **Groups:** the clauses come in five sections: booking & the card, money, body & schedule, image & conduct, and the future & getting out.
- **No gates (Lyra's call):** any tier is possible, at a price. Each tier costs the promotion a share of the fee, scaled by its attitude: ×1.6 if it resists the clause, ×0.6 if it's flexible.
- **Fresh contracts on update:** world rev 9 rewrites every contract when the save loads. The fee, dates and promotion stay the same. Clauses come from the wrestler's package. Your own deal keeps any tier you'd already negotiated on the eight clauses that carried over, and you get a letter explaining the change.

**Promotion characters** (`CHARACTER`): every major has a style, a blurb, the clauses it fights and the ones it gives easily. Exclusivity works the other way round: a possessive promotion pays more to own you and pushes its deals up.

**Packages** (Lyra's call):
- **The four on offer:** Star, Developmental, Part-timer/Legend and Special Attraction, plus a fully custom deal.
- **How promotions use them:** they open with the package that fits you, and you can start from any of them.
- **AI deals by package:** the top 15% of a roster get star deals (a fifth of them special attractions, which are non-exclusive). Veterans aged 38 and over in the top 60% get part-timer deals. Anyone 23 or under in the bottom half gets a developmental deal. Everyone else gets a standard deal: exclusive, with travel paid.

**Negotiation.**
- **Fee and dates:** fee, length and dates a month. Fewer dates pay more per date (+5% for each date below 10).
- **Bonus triggers:** you pick them, and the tier sets how many (1, 2 or 4).
- **Walk-away lines:** you set the lowest tier you'll accept on each clause. Walking away costs 5 points of the booker's patience, unless their offer has gone under one of your lines.
- **When they counter:** they ask for more exclusivity first, because it saves them money.
- **Courtesy call:** your current promotion always gets one before you sign elsewhere, and makes a counter-offer if it can get near the other deal.

**Exclusivity.**
- **The tiers:**
  - None: non-exclusive.
  - T1: First Refusal.
  - T2: no other majors; indie dates and outside work need approval.
  - T3: total exclusivity.
- **Pricing:** priced against T2. A non-exclusive deal costs the promotion 15% of the fee, First Refusal 8%, and Total Exclusivity pays you 12% more.
- **More than one major:** a non-exclusive wrestler can sign with up to 3 majors. They count fully on every roster (`worksFor`, `Wrestler.also`).
- **Agreed dates:** 12 a month are split between the deals. A new deal takes 4 by default.
- **Titles:** they can hold titles from any promotion they're on.
- **First Refusal:** the promotion blocks a second deal 35% of the time (65% if it's a rival in its own region). Blocking pays you 4 weekly fees and puts the booker 10 points of patience in your debt.
- **AI stars:** each month, a promotion with room has a 12% chance of signing a non-exclusive star as a second deal.

**Creative Control.**
- **What it covers:** finishes in either direction, opponents, card position, feuds and turns.
- **The tiers:**
  - T1: ask. The odds are 20% plus 0.6% for each point of the booker's patience (62% at 70).
  - T2: as T1, plus a veto every 30 days.
  - T3: you decide.
- **Cost:** using it costs nothing.
- **AI stars with it:** the booker plans for them to beat anyone ranked below them, except in title matches.
- **Where to find it:** Requests › Creative Control.

**Money.**
- **Guaranteed Pay**
  - pulled from a card: 50% of the fee at T1, 100% at T2 and T3;
  - a monthly minimum of 2 weekly fees at T2 and 4 at T3.
- **Wage Matching**
  - yearly raises of 2%, 4% or 6% by tier;
  - from T2, a 5% raise for a title, or for a year averaging 3.5★ or better;
  - at T3, parity with anyone below you.
- **Performance Bonuses**, in weekly fees:
  - winning a title: 5;
  - a successful defence: 1;
  - a 4★ match: 1;
  - a main event: 0.5;
  - a big show: 0.5;
  - every 5 wins in a row: 2.
- **Merchandise Rights:** a cut of their online store of 10%, 20% or 35% of fans × 0.003 a month. From T2, your own merch table at their shows.
- **Profit Share**
  - a show's takings are £40k weekly, £25k tour, £150k special or £400k flagship, multiplied by (popularity ÷ 50)²;
  - your cut is 0.4%, 0.6% or 0.8%;
  - flagships at T1, specials from T2, and every show you're on at T3.
- **Signing Bonus & Advances**
  - a signing bonus of 2, 5 or 10 weekly fees;
  - when you're skint, an advance of 2, 4 or 8 weekly fees, at 15%, 8% or 0% interest, paid back from half of each fee;
  - T3 writes off 25% when the deal ends;
  - you take an advance from the Finances screen.
- **Loyalty & Tenure**
  - each anniversary pays 0.5, 1 or 1.5 weekly fees × years served (up to 5);
  - from T2, protection from release after 3 years;
  - at T3, legend status after 5 years (+10 reputation).

**Body and schedule.**
- **Medical Pay**
  - an injury of 21 days or more pays out 2, 4 or 8 weekly fees;
  - from T2, a deal that ends while you're injured runs on until you're fit, plus 14 days;
  - at T3, your spot and any title shot owed are held for your return.
- **Training & Development**
  - T1: training costs 75%.
  - T2: free, plus 15% extra gains.
  - T3: free, 30% extra gains, recovery ×1.25 and rehab ×0.75.
- **Match Conditions**
  - T1+: no hardcore stipulations for anyone with the clause.
  - T2: you can turn down any stipulation on the show screen.
  - T3: injury risk ×0.5 and fatigue ×0.75 on their shows.
- **Schedule Flexibility:** holiday weeks of 1, 2 or 4 a year. From T2, you can go part-time (4 dates a month).
- **Travel & Accommodation**
  - None: you pay your travel to their dates.
  - Per diems of £50 at T2 and £75 at T3 on away dates.
  - Trip fatigue: 0 in your country, 4 in your region, 10 abroad. That's multiplied by 1 at T0 and T1, 0.6 at T2 and 0.3 at T3.
  - The promotion pays 0%, 75%, 75% or 100% of a move.
- **International Touring**
  - T1: skip tour dates.
  - T2: tours only if you've opted in.
  - T3: you headline the tours you join, for 1.5× the fans.

**Career shape.**
- **Booking Commitments**
  - 2, 4 or 6 dates a month, and their big shows at T3;
  - card position: never the opener, the upper half, and at T3 a main event a third of the time;
  - each short month is paid in full and counts as a breach; at 3 breaches you can walk free.
- **Contract Renewal & Options**
  - None: they can take an option year. They do it half the time if you're in the top half of their roster.
  - T1: mutual.
  - T2: yours.
  - T3: the deal renews itself with a 15% raise unless you've said you're walking.
  - Renewal talks open 90 days before the end, or 183 days from T1. From T2, re-signing comes with a raise.
- **Championship Opportunities:** a rematch within 60 days from T1. From T2, reign protection of 30 or 60 days.
- **Push & Marketing:** the fans you win on their shows are multiplied by 1.15, 1.3 or 1.5.
- **Retirement & Legacy**
  - New: you can announce your retirement in Requests › Your contract.
  - T1: a guaranteed farewell match.
  - T2: a night in your honour, with a purse of 3 weekly fees.
  - T3: a pension of 26 weekly fees.
  - The career then ends with an epilogue screen.
- **Mentorship**
  - T1: an assigned mentor.
  - T2: a bigger name, plus 10% extra from training.
  - T3: your choice of mentor; or, at 32 and over, up to 2 protégés, each worth +1 reputation a month.

**Behaviour.**
- **Social Media Policy**
  - None: going after their roster costs a fine of 1 weekly fee and 5 points of patience.
  - T1: half a weekly fee, and only for going after their top quarter.
  - T2: free rein.
  - T3: free rein, and your reach is ×1.5.
- **Conduct & Discipline**
  - fines are 2 weekly fees for a no-show, 1 for going off-script and 0.5 for a beef;
  - they're multiplied by 1, 0.6, 0.3 or 0 by tier;
  - three no-shows in 90 days is a 14-day suspension, whatever the tier.
- **No-shows:** "Don't turn up" is now a button on the show screen.
- **Character & Image Rights**
  - leaving without the rights means a rebrand: you pick a new ring name, and lose 10% of your fans plus 3% for each year you were there, up to 40%. T1 halves the loss, and T2 or higher keeps your name;
  - Shared or higher is needed for paid content and conventions;
  - Licensed or higher is needed for sponsors and your own gear.

**Requests › Your contract** gathers the actions: leaving any of your deals, holiday weeks, part-time, tours, your option year, letting a T3 deal run out, and announcing your retirement.

## Scouting: how majors judge wrestlers (on)

Lyra's redesign of contracts and tryouts lives in `career/scouting.ts`, with the Scouting reports screen in `ui/career/Scouting.tsx`. Every number is in `tuning.ts` under *Scouting*, and all of them are **proposals**.

**The grade.** Each major grades you on twelve factors.
- **Ranked against their roster** (a percentile):
  - fans: their region counts 70%, worldwide 30%;
  - online following;
  - reputation;
  - attributes: the total, plus the attribute that promotion cares about most;
  - results: recent form, weighted by how established each opponent was;
  - match quality: recent stars;
  - experience: years in the business, matches wrestled and big nights;
  - relationships: their booker, friends and enemies on their roster, and introductions;
  - age and potential: youth, plus how much you've improved in the last year.
- **On their own scale**, because most rosters are flat at them:
  - championships, by prestige;
  - professionalism: no-shows, fines, the plan, reliability, and what bookers think of you;
  - personality traits.
- **Weights:** the base weights are multiplied by the promotion's taste (`SCOUT_STYLE`) and then shifted by its booker's personality (`SCOUT_BOOKER`).

**The bar.** Their roster is graded the same way, and the bars move with it.
- Above the roster's bottom quarter: a tryout.
- Above the median: an offer.
- Up to 4 points under the tryout bar: on their radar.
- A standout (95+ at something they weight 2.5 or more) lifts you a step.

**The ladder.**
1. **Pass.**
2. **On our radar:** they watch your next 3 matches. An average of 3.25★, or 2 wins, gets you a tryout.
3. **Tryout:** a scout's report scores stars (40%), execution (25%), the crowd (20%) and the plan (15%).
   - 60+ passes: a full deal if your grade is at their median or you have a standout, otherwise a developmental deal.
   - 45–59: another look (back on the radar).
   - Under 45: no.
   - The report stays on file and moves your grade with them by (score − 50) × 0.3.
4. **Developmental deal.**
5. **Full deal.**

The fee still follows your draw.

**Being seen.** Promotions only look at people they've heard of:
- **scouts at indie shows:** 15% in their region, 3% elsewhere, plus 15% on big nights; a 3.5★ match in front of one gets you looked at straight away;
- **news:** a title win or a 4★ match reaches each major 50% of the time in its region, 15% elsewhere;
- **word of mouth:** a friend on their roster, 40% a month;
- **getting in touch:** Approach and Ask for a tryout in Requests;
- **standing:** a major's roster is known to everyone, and so is anyone with fans at or above a promotion's bottom quarter in its region.

Every major that knows you takes a look each month, with a 30% chance.

**Introductions** (the "I know someone at…" event) are a guaranteed tryout.

**Memory.** After a pass or a failed tryout, they look again once your grade with them is 5 points higher.

**AI signings** pick from the free pool by the same grade, each promotion to its own taste.

**Calibration** (seed 7, after 8 months):
- The old rule (fans in their region against their roster) would give 3 indies an offer somewhere and 2 a tryout.
- The grade gives 9 offers and 14 tryouts, going to the talented, not just the locally popular.
- An elite, unknown 21-year-old indie champion like Lyra's Jamie Diaz is offered deals by the purists and the young-talent promotions, and tryouts by the TV and money promotions.

## Relationships and social life, stage 1: foundations (on)

Lyra's relationships redesign, first of six stages (world first). The bond model lives in `world/people.ts`. What comes from the seed (homes, schools, orientation, chemistry), plus the lived-in seeding and your circle, lives in `world/social.ts`. The living world (backstage, matches, drift, news, wellbeing and goals) is in `career/socialLife.ts`. Every number is in `tuning.ts` under *Relationships and social life*, and all of them are **proposals**.

**A relationship.** One record per pair holds both sides.
- **Two dials each way:** like (as a person) and respect (as a worker), each −100 to +100. Each person feels their own way, so a crush, a one-sided grudge or someone using you all work.
- **Familiarity:** 0–100, how well they know each other.
- **A mentorship** sits alongside whatever else it is.
- **A booker's respect for you is their trust** (from their memory of your work). Patience stays short-term.

**What it becomes** (worked out, not stored):
- **Enemies:** either one at −60 or lower.
- **Best friends:** both at +75 or higher, and they know each other well (60+).
- **Rivals:** a feud, a callout or a fight in the last year.
- **Friends:** both at +40 or higher, knowing each other a bit (30+).

**Reading people.** How clearly you can tell depends on how well you know them.
- Under 20 familiarity, you can't tell how someone feels.
- From 20, you get a rough word.
- From 50, you get a clear read.
- Someone who can't stand you can hide it if you barely know them.

**The lived-in world.** It's seeded once per world: at the first career, at the start of a simulated history, or when an older save loads.
- **Acquaintances:** everyone knows 4–7 people from their roster (their region, on the indies), their school or their country. Feelings are partly shared history and partly their own, plus chemistry.
- **Best friends and old grudges:** about one pair in 10 per roster are best friends, and one in 8 have a grudge (often one-sided).
- **Rivalries:** the top pairs in each division.
- **Protégés:** half of veteran mentors have one.
- **Bookers:** a few favourites and a few in the doghouse.

**Your circle** (Lyra's call):
- your school's head trainer;
- one or two school mates, who are friends;
- one to three family members.

Trainers and family are "folk": people outside the ring, kept light.

**Homes, schools, orientation.** These come from the world seed and need no storage.
- **Home:** a home city in their country.
- **School:** two to four schools per country, named after its cities.
- **Orientation:** straight 82%, gay 7%, bi 9%, ace 2%.
- **What's stored:** only a move, and your own orientation (set on the Relationships screen).

**The world's social life** (tiered, Lyra's call):
- **Backstage:** after every show, each wrestler on the card has a 70% chance of a chat and 35% of a second. They seek out friends and avoid people they dislike, and the booker does the rounds too.
  - Each chat: time together warms people (+3), chemistry swings it, and familiarity rises by 3.
  - Moves shrink as feelings get strong, so friendships and grudges settle rather than run away.
- **Chemistry:** traits against traits, the same country (+0.75) and school (+1), the age gap, mentors warming to the young, and a seeded click (±1.5).
- **In the ring:** respect moves by 3 per star above or below 3 (−2 for a poor match), and familiarity by 4.
- **Feuds:** a feud makes rivals. Half of feud matches spill over: hot-heads and egotists take it personally (−3 like), professionals and team players respect the work (+2). The old flat −4 per feud match is gone.
- **Drift:** after 90 days apart, each month like fades 5% (a grudge, 2%), respect 3%, and familiarity by 2. Family doesn't drift.
- **Pruning:** weak, little-known bonds 90 days stale are dropped, and nobody keeps more than 20 (the closest stay). This keeps the save lean.
- **Backstage news:** a pair you'd care about becoming best friends or enemies makes the Monday digest. So do your own new friends, best friends and (when you can tell) enemies. At most 3 a month.

**Wellbeing** (0–100, Lyra's call: it matters):
- **Starting point:** 55.
- **Lifts it:** friends (+4 each, up to 16), best friends (+6, up to 12), family (+3), a mentorship (+3), winning (up to +8), a great match lately (+4), a title (+6), getting what they were after (+8).
- **Drags it:** enemies (−5 each, down to −15), nobody in their corner (−10), losing (down to −8), getting nowhere for 8 months (−8), injured (−12), not getting booked for 35 days (−8). For you only: worn out (−6) and money worries (−8).
- **How often it moves:** 35% of the way every Monday for your circle, roster and people you know; 60% on the first of the month for everyone else.
- **At 30 or below:** −1 on every roll in the ring ("Head's not right"), training gains ×0.85, recovery ×0.9, and retiring twice as likely.
- **At 85 or above:** +1 on every roll ("In a good place"), training ×1.1, recovery ×1.1.

**Goals.** Everyone but you has one, worked out monthly: get signed, a title, break through, get paid, get out, get even, bring the young ones on, wind down, or happy where they are.
- Wanting out comes from low wellbeing (35 or below) or a booker who dislikes them (−30 or below), unless they're loyal.
- Getting what they wanted lifts wellbeing for 90 days.

**Screens.**
- **Relationships:** your wellbeing and its reasons, home and school, then the people in your life. Each shows how they feel about you and how they rate your work, read as clearly as you know them, plus how well you know each other and the latest reason it moved. You set your orientation here too. Bookers keep "Personally" and "Your work".
- **Profile:** your wellbeing in the status line.
- **A wrestler's file:** where they live and trained, what they're after, how they seem (if you know them), who they're close to, their rivals, who they can't stand, and any mentorship.

**Older saves** (world rev 10). One-number bonds become two-way:
- like = the old number, both ways;
- familiarity from how strong the bond was;
- an old friend is at least friendly, an old rival a rival, and a mentorship keeps its teacher.

The world is then brought to life around them, and the player gets their circle. It happens once.

**Fixed along the way.** Scouting's per-day cache was keyed only by the date, so another world on the same date (a new career, a test) could reuse it. It's keyed by the career now.

**Validation** (`SOCIAL=1 npx vitest run src/career/socialrun.test.ts`, seeds 7 and 11, a year, stand-in sims):

| | Start | 12 months |
|---|---|---|
| Friends each | 1.4–1.5 | about 1.2 |
| Best friends each | 0.14–0.16 | 0.26 |
| Enemies each | about 0.13 | about 0.10 |
| Rivals each | 0.05 | 0.54 (as feuds play out) |
| Wellbeing, 10% / median / 90% | 47 / 59 / 69 | 37 / 53 / 70 |
| At or under 30 / at or over 85 | 0 / 2 | 8 / 3 |
| Bonds in the save | about 380 KB | about 670 KB |

Most of the people without a friend are indie wrestlers, who seldom share a card with the same people twice. A day costs about 1–2 ms more than without the social engine. A one-year contracts run stays healthy: full rosters and no titles held off-roster.

**Next stages:** the phone (messages, topics and tones), plans and activities, romance and family, politics (booking, chemistry, the locker room, cliques, enemies), and gossip and angles.

## Relationships and social life, stage 2: the phone (hidden: the big cut, `docs/cut.md`)

The engine is in `career/phone.ts`, the words in `career/phoneLines.ts` and the screen in `ui/career/Phone.tsx`. `FEATURES.phone` is on (Lyra approved the screens). Every number is in `tuning.ts` under *The phone*, and all of them are **proposals**.

**Threads.** There's one thread per person. It holds what you've texted each other, plus everything they've sent you that wants an answer:
- notes after a match;
- call-outs;
- check-ins;
- in-person moments, which are career events from that person, shown as "In person" cards with their choices.

A thread reads as the story of the two of you. Anything that wants an answer is still a letter underneath, so ignoring it, standing orders while you skip, and skip stops all behave exactly as they do for mail. With the phone on, Mail keeps results, bookers' check-ins, the press, offers and the Monday digest. Person letters move to the phone.

**Getting there.**
- **The hub:** a Phone button in the header, with an unread count.
- **Relationships:** tap someone to open your thread.
- **New message:** lists everyone you know (familiarity 10+), closest first.

**Messaging someone.** Pick what it's about, then how you say it (Warm, Straight, Cheeky, Blunt). You see what you'd say, and your guess at how it'll land, as clear as how well you know them.

| Topic | Moves their like (before tone) | When |
|---|---|---|
| Catch up | +3 | Always |
| Congratulate them | +5 (and +1 respect) | A title in the last fortnight, a move, a win in the last 3 days |
| Check they're alright | +6 | Injured, or a loss in the last 3 days |
| Ask their advice | +2 (+3 more for a mentor) | Not family. A good answer comes with a tip from your weakest grade. |
| Ask about someone | +1 (a gossip-lover +3, a professional −1) | Someone you both know. You learn what they make of them. |
| Ask them to put a word in | −2 | They're on a major you're not. A yes means that promotion hears of you. The chance comes from like + half their respect, out of 80 (5–90%). Once per promotion every 60 days. |
| Apologise | +5 plus 30% of how far below zero they are | They dislike you, or something soured it in the last 60 days. Hot-heads and egotists hold grudges; team players forgive. |
| Have a go at them | −8 and −2 respect (Warm ×0.5, Cheeky ×1.2, Blunt ×1.5) | Not family. Makes rivals; a hot-head comes back at you. |

**How a tone lands.** It depends on their voice: warm ones like warmth, professionals like it straight, hot-heads hate cheek. Cheek goes down well with friends (+0.5) and badly with anyone who dislikes you (−0.8). There's a random swing of ±1.5. A second message in a day counts for 40%; a third is pestering (−2).

**What people send you.**
- **Their news**, from someone close (like 25+, familiarity 30+): a title, a move, an injury.
- **Otherwise,** a 25% chance a day, plus 4% per close person (up to 10), capped at 6 a week (news aside). It's one of:
  - friends and family checking in (family have their own voice);
  - a young wrestler who rates you asking for advice (sit down with them properly and you become their mentor);
  - an enemy (like −50 or worse, a hot, cocky or sly voice) having a dig.

Replies to them move feelings by the `PHONE_REPLY` numbers. Ignoring family or a best friend's check-in costs a little, and ignoring a dig makes you look scared, as with mail. Standing orders know the new replies.

**Tone of the writing** (Lyra's call): grown-up and sweary where it fits the person.

## Relationships and social life, stage 3: plans and activities (hidden with the phone: the big cut)

`career/plans.ts` (with words in `phoneLines.ts`). Every number is in `tuning.ts` under *Plans and activities*, and all of them are **proposals**.

**Making plans** (the phone's *Make plans* topic): pick what, when and who pays.

| What | When | Costs (× where you live) | Like (theirs; yours 70%) | Familiarity | Respect | Wellbeing | Your fatigue |
|---|---|---|---|---|---|---|---|
| Drinks | Evening | £25 | +6 | +6 | | +2 | +3 |
| A meal | Either | £35 | +7 | +6 | | +2 | |
| A night out | Evening | £60 | +9 | +8 | | +4 | +12 |
| The gym together | Either | (the session) | +4 | +5 | +2 | +1 | (the session) |
| Running spots | Either | (the session) | +5 | +5 | +3 | +1 | (the session) |
| Going round theirs | Either | | +8 (+4 if they're hurt) | +8 | | +3 | −2 |

**When it can happen.**
- Any free half-day in the next 7 days (resting, training or making content, nothing else arranged).
- You both have to be in the same country that day, and they can't be on a show that evening.
- Plans take the half-day in your week ("Plans") like training does. A show or travel booked over it later means you stand them up.

**Who pays.** "My treat" doubles the cost and adds +3 like.

**Do they say yes?**
- The chance is 15% plus 0.9% per point of how much they like you, between 5% and 95%. Family say yes at least 85% of the time.
- Respect counts for training together.
- Low wellbeing puts people off a night out.
- Being asked again within a week of a no halves it.
- The right tone helps.

**On the day.**
- **They might flake:** 7%, more for the unpredictable, rebellious and hot-headed, less for the reliable and professional. That costs −4 of your like for them and −2 wellbeing.
- **If you've booked something over it,** you've stood them up: −6.
- **Cancelling** costs −2, or −4 with under a day's notice.
- **When it happens,** the thread gets their after-word in their voice, plus a line saying where it was, that you got closer, and what it cost.

**Invitations.** People invite you, within the phone's weekly cap, about 12% a day. Each one comes with a free slot.
- Friends invite you for drinks, a meal, a night out, the gym or running spots.
- Family ask you round.
- Your trainer asks you down to the school.
- **The old cards are plans now:**
  - your mentor's coffee: +1 to your weakest attribute from their notes;
  - a friend on another major introducing you to their booker over a drink: a guaranteed tryout, as before;
  - a colleague wanting to run spots;
  - a training partner.

  The introduction, help-prepare, private-session, mentor-check-in and protégé cards no longer fire while the phone's on.

**The remaining backstage cards** pick people who know you first.

**Standing orders** gain *Invitations*:
- yes to people you're close to (family, or someone at +40 or more);
- no to everyone;
- or ask me.

Lending is always yours to decide.

**On the road.** A friend on the same indie card, with travel to pay, offers to share the drive 1–3 days out (60%). You can ask too, with *Share the drive*. It halves your travel, and afterwards you're closer (+5 like, +6 familiarity).

**Money.**
- **Gifts:** £20, £50 or £150 (× where you live), for +5, +9 or +14 like. A second within a month counts for half; on their birthday, half again more. You get a reminder two days before family's and close friends' birthdays.
- **Borrowing:** from someone at +40 or more who knows you (30+), or family. Choose £250, £500 or £1,000. The chance is 20% plus 1% per point of like, less for bigger sums (family 90%). It's paid back from your fees, one loan at a time.
- **Lending:**
  - A close friend who's struggling (low wellbeing, after money, injured) asks for £200, £400 or £800.
  - Lending earns +8; refusing costs −3.
  - They pay you back in 4–8 weeks if they're the sort: 80% usually, 95% if reliable, 60% if mercenary.
  - If they don't, you can chase it with *Ask for your money back*. They might pay up; if not, −2.

## Relationships and social life, stage 4: romance and family (hidden: the big cut; the world's deaths still run)

`career/romance.ts`, with attraction and couple seeding in `world/social.ts` and the words in `phoneLines.ts`. Every number is in `tuning.ts` under *Romance and family*, and all of them are **proposals**. Romance fades to black.

**Attraction.**
- **Orientation:** everyone has one (straight 82%, gay 7%, bi 9%, ace 2%). Yours is whatever you set on Relationships; until you set it, nobody makes a move on you.
- **Who can fall for whom:** gender has to fit, nobody under 18, never family or your trainer, and an age gap of 15 years at most.
- **The spark:** each pair has a seeded spark (0–1), warmed or cooled by how they feel about each other.

**A lived-in world's couples.**
- Pairs who know and like each other, fit each other and have the spark (0.45+) are couples half the time: dating, partners, living together or married.
- About 30% of the rest (24 and over) have a partner from outside the business. They're "folk", like your family.

**Your love life** (the phone):
1. **Flirt.** It works if they're into you (attraction 0.35+) and not with someone (mostly). It warms them +4, and they may develop a crush. If not: −1, or −3 if they're taken. Get to know someone and you'll be told when you're not their type.
2. **Ask them out.** Needs like 30+ and familiarity 20+. The chance is attraction × (0.5 + like/100), much less if they're taken. A yes puts a date in your week (evening, about £50: +10 like, +4 wellbeing), and once it happens you're dating. Already together? It's date night.
3. **Make it official.** After 30 days dating, if they like you 55+.
4. **Move in.** After 90 days as partners, in the same country, like 60+. Your living costs drop by 40%.
5. **Propose.** After 180 days, like 70+, and a ring (about £1,500 × where you live). The wedding goes in your week 90–180 days later. It costs about £3,000 × where you live, and makes you married (+10 wellbeing for 90 days, family warm to it).
6. **End it.** −30 like both ways and heartbreak (−12 wellbeing for 60 days). If you lived together, you move out (about £400).

**Keeping it going.**
- **Neglect:** a partner you haven't seen in 21 days or texted in 14 cools by −3 every Monday. Below 45 they want to talk; below 25 they end it.
- **Two at once:** each month each partner finds out with a 35% chance, and it's over (−40 like).
- **Admirers:** if you've set your orientation, someone who likes you (50+), knows you (30+), fits you and has the spark may develop a crush and flirt. A fortnight later they ask you out.
- **Wellbeing:** dating +5, partner +8, living together, engaged or married +10. Apart a lot (another country or another major) −4.

**The rest of the world**, each month:
- **Getting together:** singles who like (40+) and know (35+) each other, fit each other and have the spark (0.35+), 15% a month.
- **Moving on:** partners after 90 days, living together after 180, engaged after a year, married 120 days later (each a chance a month, if they still like each other).
- **Splitting:** more likely the newer it is (dating 3% a month, married 0.5%), much more if it's gone cold. Now and then someone strays.
- **News and weddings:** news of people you'd care about (at most 3 a month). You're invited to a close friend's wedding: say yes and it's an evening in your week (a present, about £100).

**Life events**, each month:
- **For everyone:**
  - a baby for couples living together or married (0.8%, +10 wellbeing);
  - a parent ill (0.4%, −8 for 60 days);
  - a death in the family (0.12%, −15 for 90 days);
  - moving house (0.4%).

  Close friends tell you, and you can be there for them.
- **Your own family** can fall ill or die, more likely the older they are. You hear from the rest of your family, and it hits your wellbeing. With a partner you live with or are married to, you can have a baby of your own.
- **Death** (Lyra's call: rarely, anyone): a tiny chance a month, more each year past 40. A wrestler who dies:
  - their titles are vacated and their cards cleared;
  - the news comes as a tribute;
  - everyone who cared about them grieves (−15 for 90 days).

  A booker is replaced. It never happens to you.

**Validation** (a year, seed 7, stand-in sims):
- **Couples:** about 156 at the start (65 married, 74 living together, the rest newer), and 158 after a year. About 23 break-ups and new couples balance them out.
- **Deaths:** no deaths in that year, as intended (about one every few years).
- **Speed and size:** a day's time is about the same.

## Relationships and social life, stage 5: politics (hidden: the big cut, `docs/cut.md`)

`career/politics.ts`, with hooks into the match engine (`rules.chemistry`), booking (`setPairBias`), signings (`setSigningPull`), contender pushes, patience and fines. Every number is in `tuning.ts` under *Politics*, and all of them are **proposals**.

**In the ring.**
- **Chemistry** adds to a match's stars:
  - mutual respect (0.0025 per point);
  - friends (+0.1);
  - running spots together in the last fortnight (+0.15).

  Enemies working stiff take off 0.25. It's capped at −0.3 to +0.35.
- **Stiffing:** the one the other can't stand is 1.6× as likely to get hurt.
- **Refusing to put someone over:** booked to lose to someone they can't stand, a wrestler halves the booker's nudge and gets fewer re-runs.

**Who's booked with whom.** When picking an opponent, rivals are 1.4× as likely (heat sells), friends who lobby to work together 1.1×, and enemies 0.5× (they refuse).

**Your locker room**, a standing in each major you're signed to (0–100, 50 to start).
- **Moves:** putting someone over (a planned loss kept) +2, keeping to the plan +1, a great match +1, going off-script −8, failing to deliver −1.
- **Each month:**
  - it moves 20% of the way towards what the room's leaders think of you (its two most respected, 30 and over);
  - friends on the roster add +1 each (up to +4), enemies −2 (down to −6).
- **What it does:** a new face on that roster takes to you by it (0.2 per point over or under 50). At 70 or more you're respected (+4 wellbeing); at 30 or less you're frozen out (−6).
- **Labels:** frozen out, on thin ice, accepted, respected, one of the boys.

**Cliques.** Up to two per major, of three to five friends (they all like each other 25+, and the founder's friends 45+). Each has a name and a leader (the most respected). A clique falls apart when its members drift apart (under 20) or drop below three.
- **Lobbying:** members get a push for title shots when the booker likes their leader (20+).
- **Freezing out:** whoever crosses a member gets −4 from each of the rest every month, and −3 to your standing if it's you.
- **Asked in:** close to two of them (45+ both ways) and you're asked in. Joining: +5 from each member, +3 standing.

**Enemies all the way.**
- **Badmouthing:** someone who can't stand you on a roster whose booker likes them (20+) costs you −2 of that booker's like every month, logged as "badmouthing you".
- **Provoking:** on the same card as an enemy, 30% they provoke you (the in-person card, at most monthly). Biting back costs a fine of half a week's fee and −4 standing.
- **Fights:** enemies on the same card where one's a hot-head come to blows 15% of the time: −5 like both ways and −1 reputation each. It's news if it's your roster.

**Contracts and moves.** A signing leans towards:
- friends on the roster (+1.5 each, up to +6);
- a partner there (+8);

and away from enemies (−3 each), as points on the signing grade.

**Bookers personally** (every one, not just politicians):
- a push for people they like (3 points per 100 like);
- second chances: patience lost shrinks by their like ÷ 250;
- softer fines: by their like ÷ 300.

**Screens.**
- **Relationships:** your standing in each locker room, its leaders, and your clique.
- **A wrestler's file:** their clique (and whether they lead it).

## Relationships and social life, stage 6: gossip and angles (hidden with politics: the big cut)

`career/rumours.ts`, with the real-heat hook in `booker.ts` (`setAngles`). Every number is in `tuning.ts` under *Gossip and angles*, and all of them are **proposals**. All six stages' numbers are on one page in `docs/relationships-numbers.md`, generated from `tuning.ts`.

**The rumour mill** (Lyra's call: true or false, started on purpose by anyone). Every Wednesday:
- **True stories arise** from what's going on: a new couple, the booker's pet (they like someone 60+), someone who wants out of their promotion.
- **Liars make things up.** Someone sly, hot-headed or a politician who can't stand someone (−40 or worse) invents a story: cheating (if they've a partner), badmouthing a friend, wanting out, faking an injury, the booker's pet, thrown out of a bar.
- **It spreads.** Each holder tells each friend (like 30+, familiarity 30+) with a 25% chance; gossips 1.6×, the professional and reliable half that. It reaches up to 30 people, and lasts up to 120 days.
- **Believing it** (75% from a friend, 40% otherwise) moves how they feel:
  - the one badmouthed: −8 for the badmouther;
  - the one cheated on: −15, and −2 from anyone who likes them;
  - a booker told someone wants out: −3;
  - roster mates of the booker's pet: −2;
  - an injury "faked": −3 respect;
  - a booker told about the bar: −2.

**When it reaches you.** A friend who has it tells you (at most once a week):
- **About you:**
  - *Deny it:* works 70% of the time if it's false, 25% if it's true. It dies and you gain a little standing; if nobody buys it, you lose some.
  - *Find out who started it:* you're told who, and have it out with them (−5 both ways) and it dies. If it was true, it's awkward (−3 standing).
  - *Let it go.*
- **About someone else:**
  - *Really?* You think less of them.
  - *Pass it on* (politician): all your friends hear it, and it might come back to you.
  - *Don't believe a word.*

**Starting one yourself.** The phone's *Spread a rumour*: about someone you dislike (−20 or worse), told to whoever you're messaging. Whether it's true is checked (are they really cheating, wanting out, the booker's pet). They might believe it. Each week a false one you started is traced back to you 20% of the time: −25 from them, −4 standing everywhere you work, and everyone knows.

**Angles from real life.** When a booker starts a new (non-title) feud, half the time they use real heat if they can: two free on the roster (same division) who are enemies or rivals, the worst first. It's news on your roster, and if it's you, you're told every match will be personal. Real best friends are less likely to be booked against each other (0.6×): on-screen allies, as far as the career's one-on-one cards allow (no tag division yet).

**Validation** (`SOCIAL=1 MONTHS=12 SEEDS=7,11`, everything on, stand-in sims):
- **Rumours:** 20–30 going at any time (a third to a half true), the widest reaching 30 people.
- **Cliques:** up to 9 by the end of the year.
- **Real heat:** up to 12 real-heat feuds.
- **Couples:** steady.
- **Wellbeing:** a spread from struggling (a dozen at 30 or under) to flying (a dozen and a half at 85 or over).
- **Messages:** you'd get about five person-to-person messages a week (the phone's cap is 6, plus match notes).
- **Speed:** a day takes about 15–17 ms with every stage on, against about 13 before stages 2–6.
- **World health:** a year's contracts run is healthy (rosters 39–40, no titles held off-roster).

## Booker mode (off: `FEATURES.booker`)

Lyra's design, six rounds of questions: booking is part of career, not a separate path. You can run one major and one indie at a time and keep wrestling the whole while, for anyone. Every number is in `src/career/tuning.ts` and listed in `docs/booker-numbers.md`.

**Companies** (`src/world/companies.ts`, world rev 11):
- Every promotion except The Indie Scene is a company. Each has:
  - an owner (seeded for every major);
  - a tier: local, regional, national or global;
  - a bank, monthly books, its own schedule once someone changes it, staff, a TV deal, sponsors and a loan.
- Tiers follow popularity (global 70+, national 45+, regional 25+) until play moves them. Shipped majors all start national or global.
- A local or regional promotion books free agents from its region a night at a time, alongside anyone it signs.
- Nobody signs to a promotion you run except you.

**Your roles** (`src/career/company.ts`):
- Your own promotion makes you owner and booker. Someone else's makes you their booker, answering to its owner.
- **Ways in:** found one; be offered or ask for a booking job; buy one or buy out the one you book; be handed one; or book for anyone from career start.
- **Office hours:** booking takes half-days a week by tier (local 1, regional 2, national 3, global 4) as a new `office` activity. Miss them and your staff cover.
- **Schedule:** you set it (weekly, fortnightly or monthly shows; specials; a flagship), capped by tier. Changing it redraws everything more than a week out.

**The card** (`src/career/card.ts`):
- **Matches:** in running order, with winners, titles and stipulations.
- **Finishes:** clean, cheating, DQ, count-out or no contest.
  - Cheating leans the engine's AI on dirty tactics.
  - DQ, count-out and no contest are how the match ends whatever happened; the new finish type is `NO_CONTEST`.
- **Segments:** promo, run-in, beat-down, contract signing, debut, celebration, interview, betrayal. Each is scored 0–5 from charisma, heat, the crowd, the kind of segment and your producer, and moves fans.
- **Your staff** book any show you leave, the night before. A head writer books it better.
- **Watching:** on the night, any match can be watched. It's wrestled there and then in the full engine and the commentary plays back; that result stands.
- **The whole show is judged:** matches by slot (main event ×2, opener ×1.2), segments, flow, payoffs by heat, star power and running to time. The rating feeds popularity, reputation and pay-per-view.
- **Booking yourself to win** costs locker-room standing and your opponent's goodwill. Three wins in 45 days starts a glory-hog rumour. Putting someone over earns both back.

**Storylines and titles** (`src/career/stories.ts`, `belts.ts`):
- **Heat** runs 0–100. It's built by segments and matches between the two, worn by repetition and cooled by a quiet week. It builds slower face against face.
- **The blow-off** at the show you set pays by the heat. A storyline that hits zero has gone cold.
- **Turns** land if the next show shows them. Flip-flopping falls flat.
- **Alliances** can end in a betrayal segment, which starts a storyline hot.
- **Titles:** create (by tier), rename, set the division (with a cruiserweight weight limit), vacate, retire, unify.
- **Tournaments** of 4 or 8 run a round a show, for a vacant belt or a shot at one.
- When a champion is injured, the office asks whether to strip them.

**The books** (`src/career/books.ts`):
- **Each show is settled the night after.**
  - Draw: tier base + Σ√(fans where it is) × size × kind × reputation × ticket price. It goes in the smallest venue that holds it.
  - In: tickets, merch, TV for weekly shows, pay-per-view for big nights.
  - Out: wages per date for the contracted, fees for free agents, venue, production by kind, and travel.
- **Each month:**
  - sponsors, insurance, staff, a salary or owner's wage, and loan repayments;
  - the accounts close and come to you;
  - tiers move with popularity, bank and roster;
  - TV and sponsors come calling from regional tier, once your shows average 2.8★.
- **Moving money:** put your own in, take it out, pay yourself, or borrow.
- **Bust:** past the overdraft for 3 months running (6 for the AI) and the company closes. The roster goes free, the titles are retired, and the history stays.
- **Tuning** (`BIZ=1 src/career/bizprobe.test.ts`): AI majors run healthy margins. A founded local promotion booked weekly by its staff runs about even.

**Roster and staff** (`src/career/signing.ts`, `morale.ts`):
- **Signing from the other side of the table:**
  - What they ask comes from their fans where you are, your size against theirs, their traits and how they feel about you, plus the 25 clauses.
  - Three rounds: they counter, walk, or are insulted.
  - Buyouts are paid to their promotion. Releases pay off what's left.
  - You're asked about renewals 30 days out. Someone who can't stand you won't re-sign.
- **How your roster feels about you** runs through relationships:
  - wins, titles and main events warm them;
  - weeks off the cards, underpay and broken promises cool them;
  - the unhappy write in and ask for their release;
  - conduct lands on your desk: fine, suspend or ignore.
- **Staff:**
  - head writer: smarter staff booking;
  - road agents: better matches;
  - producer: better segments and more TV money;
  - scout: monthly picks;
  - doctor: fewer injuries.

**Owners and the war** (`src/career/owners.ts`, `war.ts`):
- **Owners:**
  - two goals a quarter;
  - patience like any booker (goals, bad shows, budget, the red, crossing their champion, agreeing with or defying them);
  - meddling about their favourite;
  - the sack at zero. You can resign any time.
- **The war:**
  - rivals poach your roster: match the offer, or let them go;
  - a rival show the same night in your region splits the crowd;
  - a bigger rival can take your TV slot;
  - indie brands that make a name become promotions;
  - struggling promotions merge.

**The Office** (`src/ui/career/Office.tsx` and `Office*.tsx`): a tab on the calendar, with:
- Overview (your boss, or selling up)
- Card
- Stories
- Titles
- Roster
- Signings
- Staff
- Books
- Schedule
- Take one on

**Long runs** (`BOOKER=1 src/career/bookerrun.test.ts`): see the numbers in the PR for stage 7.
