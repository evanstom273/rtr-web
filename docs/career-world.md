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

## Social media (on)

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

## Days, travel, day jobs and skipping (on)

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
