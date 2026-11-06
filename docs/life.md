# Life: things to buy, own, run and lose

Lyra's call: deep into a career, money stopped meaning anything (a star went from £374k to £2.98M in two years with
nothing to spend it on). Life gives money somewhere to go, at every level: a banger for an indie kid, a jet for a
megastar. Everything has upkeep, some of it earns back, and the risk is real. The numbers are the price book Lyra
approved (`PRICE_BOOK` and `CITY_PRICE` in `career/tuning.ts`).

Switches: `FEATURES.life` (on) and `LIFE_PARTS` (each part on as it's built). `on(part)` in `career/life/state.ts`.
Tests: `LIFE_ON=1` / `LIFE_OFF=1` run the suite either way; `life.test.ts`; `ECON=1` has a careful and a flash star;
`scripts/life-sweep.mjs` checks the screens (three skins, phone and fold).

## Stage 1: homes, getting about, borrowing, tax, the agent

Code: `career/life/` — `state.ts` (c.life), `homes.ts`, `garage.ts`, `travel.ts`, `loans.ts`, `money.ts` (tax and the
agent), `index.ts` (the hooks); `world/lifeWorld.ts` (city markets); `ui/career/Life.tsx`.

### Cities and travel

Every city has coordinates (`CITY_GEO`), so a trip is a distance from your city. Another region is abroad.

| Trip | Bus and train | Your car | Fatigue | Time |
|---|---|---|---|---|
| Local (under 100 km) | £0 | £0 | 0 | none |
| Short (100–500 km) | £20 | £12 | 2 | the morning of the show |
| Long (500 km+, same region) | £60 | £40 | 4 | the morning of, and the next morning home |
| Abroad | £250 economy | – | 10 | the whole day before, and the whole next day |

Something that starts in the morning (a convention) means travelling the evening before. Flying abroad: premium
economy £400 (fatigue 8), business £1,000 (5), first £1,750 (3), a charter £25,000 (2, half a day each way). With a
Travel clause the promotion pays economy and you pay the upgrade.

| Vehicle | Price | A month | What it does |
|---|---|---|---|
| Used car | £1,500 | £80 | Cheap road trips; you drive (+1 fatigue) |
| Decent car | £18,000 | £180 | Cheaper road trips |
| Luxury car | £90,000 | £700 | Road trips tire you less (−1) |
| Van | £35,000 | £350 | Six seats: mates chip in £15 a trip and grow closer |
| Tour bus | £420,000 | £6,100 (with the driver) | Eight seats; you sleep on board, so road trips are rest |
| Jet share (1/16) | £550,000 | £14,000 | Abroad in half a day each way, fatigue 2 |
| Your own jet | £18,000,000 | £95,000 | Abroad in half a day each way, fatigue 1 |

Vehicles lose 7–15% of their value a year. Half a day abroad instead of two whole days is what makes back-to-backs
across continents fit: bookers only book you if the trip fits.

### Homes

Rent replaces the flat living cost (every Monday, shared with a partner as before):

| Place | Rent + bills a week (average European city) | Sleep | Wellbeing |
|---|---|---|---|
| Shared room | £220 (today's living cost) | – | −2 once you're signed |
| Flat | £390 | +5% | – |
| House | £750 | +10% | +3 |
| Penthouse | £2,200 | +15% | +5 |

Each city costs its region's index × its own price (`CITY_PRICE`: London ×1.7, Manchester ×0.85, Brooklyn ×1.6,
Tokyo ×1.5, Mexico City ×0.5…). A new career rents a shared room on the indies or a flat once signed.

Buying (× the city and its market): flat £220k, house £520k, penthouse £2.6M, mansion £7.5M. Upkeep 1% a year (the
mansion 2%); 5% in fees to buy, 3% to sell; a sale takes one to three months. A home you own is yours empty: live
there (switching between your own homes is instant and free), let it (a letting agent takes 12%; a month in twelve
sits empty, more without one; repairs 3%), or sell. A home gym (£12k: training 20% cheaper) or your own ring (£40k:
30% cheaper) in a house or bigger; the penthouse and mansion come with a gym.

Markets: every city's index moves monthly, about +3% a year with its own lean, a wobble of about 6% a year, and a
slump (−15% to −25%, sliding for a year) about once a decade.

Moving to another city: three days and the removal costs (half the regional cost within the country); you rent
there (or move into a home you own there, which is instant).

### Borrowing and credit

| Loan | Rate | Years | Deposit (good / middling / poor credit) |
|---|---|---|---|
| Mortgage | 5.5% | 25 | 10% / 15% / 25% |
| Car or bus | 9% | 5 | 10% |
| Jet | 7% | 10 | 20% |

Good credit (70+) takes a point off the rate, poor (under 40) adds two. You can borrow 4.5 × your taxable earnings over
the last twelve months (or a year of your contract). Credit starts at 60: +1 a month paid on time, −5 a missed
payment; three missed in a row and it's repossessed (sold at 80%, credit −30, the shortfall still owed, a press
letter). If home is repossessed, you're in a rented room in the same city.

### Tax

Taken off every payment as it arrives, on what you've earned so far this calendar year: nothing up to £15,000, then
20%, 32% over £60,000 and 40% over £200,000. Thresholds × the region's cost index; rates × North America 0.95,
Europe 1, Oceania 0.95, Asia 0.85, South America 0.8, Africa 0.7. Income is fees, bonuses, merch, wages, events, your
company's wage and rent coming in; an advance is a loan, not income. Tax rides on the payment's own ledger line
(`gross`, `tax`, `agent`), so the ledger isn't flooded.

### The agent

| Agent | Cut | Deals | Takes you on | Finds you |
|---|---|---|---|---|
| Local | 10% | +15% | anyone | an extra regional offer now and then |
| Established | 12% | +25% | 10,000+ fans | offers from majors |
| Super | 15% | +35% | 100,000+ fans | offers from anywhere |

The cut is only on money from a deal signed through them (never indie fees or side earners). Promotions pay more
(`willingness` × the agent's lift). Advise: they tell you at the table what the promotion will realistically go to.
Handle it: they haggle every new offer up to that and write to say where it landed.

### Fixes for everyone (Life on or off)

Indie travel, offers, requests, specials, events and hustles cost from where you live, not where you were born; indie
offers favour your local scene (with Life: your city ×2.5, a short trip ×2, a long one ×1.3); "apart from your
partner" follows where you live (living together isn't apart); the END move offer sends you to the UK.

### Numbers (ECON=1, two years)

| Life | Life off | Life on |
|---|---|---|
| Unknown indie, no job | −£20,200 · 0.9 dates a month | −£17,530 · 1.0 |
| …with part-time retail | £1,180 | £1,215 |
| Indie regular (5k fans) + retail | £1,970 | £968 |
| Successful indie (50k) | £1,315 | £1,115 |
| Established star (spending on training) | £1.88M | £0.94M (tax £920k) |
| Established star, careful (a house on a mortgage, a car, an established agent) | – | worth £1.33M |
| Established star, flash (best home the bank allows, jet share, bus, luxury car, super agent) | – | worth £1.03M |

The flash star can't get a mansion: the deposit and the 4.5× limit stop them. Going properly bust comes with staff
(stage 2) and bad luck (stage 7).

Perf: unchanged (88–95 ms a simulated match; world 1.9 MB).

## Stage 2: staff, medical, entrances

Code: `career/life/staff.ts`; the engine's `rules.entrance` (heat at the bell and the entrance line, only when someone's
paid for one, so the golden singles record doesn't move); the Life tab's "Your team".

### Personal staff (wages on the 1st, × where you live)

| Who | A month | What they do |
|---|---|---|
| Physio | £3,000 | Time out injured −20%; wear fades 1.5× faster |
| Doctor | £7,500 | Injuries 15% less likely; time out −15% |
| Personal trainer | £2,500 | Training gains +15% |
| Nutritionist | £1,800 | Fatigue recovery +10% |
| PA | £2,400 | Answers routine letters by your standing orders every day; a note each Monday |
| Driver | £2,600 | Road trips cost no fatigue and count as rest (crash risk comes in stage 7) |
| Publicist | £4,000 | Fan growth +8% |

### Medical

- A private surgeon (out a week or more): £8,000–£40,000 by how long you've got left; back 30% sooner.
- A week in a rehab clinic: £2,000; back 25% sooner.
- The recovery kit at home (cryo, hyperbaric): £45,000 and £400 a month; wear fades 1.3× faster, recovery +5%.

### Entrances

Your entrance sets the crowd's heat at the bell (it starts at 35, or 45 for a title), at most +15, and gets its own
moment in the commentary ("The lights go down. The music hits, the pyro goes off, and here comes…").

| Kit | Cost | Heat |
|---|---|---|
| Your own theme | £6,000 once | +2 |
| Entrance video (not on the indies) | £15,000 once | +2 |
| Gear: decent / custom / show-stopping | £800 / £3,500 / £12,000 | +1 / +2 / +3 |
| Pyro | £3,000 a show | +4 |
| A big set piece | £25,000 a show | +8 |

Pyro only at the top of the card (the main event or a title match), or anywhere with the contract's new "Entrance &
production" term (it costs the promotion about 3% of your fee to agree to). A set piece only on a flagship or special,
at the top of the card. You pay for each show's pyro and set after the match.

## Stage 3: businesses, funds, stakes, luxury, insurance

Code: `career/life/invest.ts`; the Life tab's Invest section (`ui/career/LifeInvest.tsx`).

### Businesses (passive)

Buy in (cash, or a business loan: 8% over ten years, 25% down) and collect the takings on the 1st: the yearly yield,
wobbling month to month, taxed as income. Each can fold: what's left is a tenth of its value, and any loan on it is
still yours. A second site costs three times as much again and earns as much more. Sell for 90% of what it's worth.

| Business | Buy in | A year | Wobble | Folds |
|---|---|---|---|---|
| Gym (your city's prices) | £250,000 | 7% | ±6% | 2% of years |
| Bar or restaurant (your city's prices) | £400,000 | 8% | ±12% | 6% |
| Merch company | £150,000 | 10% | ±18% | 5% |
| Media (podcast, channel, site) | £60,000 | 12% | ±25% | 8% |

Merch and media do better the more fans you have (×0.5 to ×2: (fans ÷ 200,000)^0.35).

### Funds

Put money in and take it out any time; they move on the 1st. A crash comes about once every eight years and hits
everyone at once (`world.life.crash`). Taking money out: what you put in comes back untaxed; the gain is income.

| Fund | A year | Wobble | In a crash |
|---|---|---|---|
| Safe | 3% | ±2% | −5% |
| Balanced | 6% | ±10% | −20% |
| Risky | 10% | ±22% | −45% |

### Stakes in promotions

A slice of any major (5%, 10% or 25% at a time) costs that share of what booker mode values it at, plus 10%. Half
of its last month's profit is paid out by share on the 1st. With 25% you've a seat at the table: they won't release
you. They won't sell past 49%: for more you buy the lot (the owner's price, less what your stake's worth), and then it's
yours in booker mode.

### Luxury

| Kind | Prices | Value a year | Upkeep a year |
|---|---|---|---|
| Watch | £5k / £25k / £250k | −2% ±3% | – |
| Art | £15k / £250k / £5M | +4% ±15% | 1% |
| Classic car | £40k / £300k / £2M | +3% ±10% | 2% |
| Boat | £250k / £2M / £15M | −8% ±3% | 10% |

Status only when flaunted (stage 6).

### Insurance

Homes 0.3% of their value a year, businesses 1.5%, paid monthly. It covers fire and burglary (stage 7), not a bad
year or a business folding.

## Stage 4: everyone's money and the rich list

Code: `career/life/aiMoney.ts` (`world.life.wealth`: a few numbers each, about 40 bytes a wrestler).

Every wrestler has money, seeded once from how long they've been at it and what they earn, then moved on the 1st of
every month (even in a world with no one at the controls):

- **In:** their deal (fee × dates a month × 12, plus about 15% in bonuses and merch), or on the indies a date and a
  half a month plus a day job (£16,000 a year by the region's cost index). Retired: nothing.
- **Out:** tax on the same bands as yours, 10% to an agent over £100k, their home and car, and the good life by
  personality. Showboats and the egotistical are flash (80% of what's spare goes, plus 1.2% of their cash a month);
  the professional, methodical and reliable are careful (20%, 0.1%, and their savings earn about 5% a year); risk
  takers gamble their savings (it swings both ways); everyone else is in between.
- **Moving up:** a better home on a mortgage once they've a deposit (the flash want far less in the bank first),
  then a better car or a jet share. Once they're worth £1M, a business now and then; a mentor opens a school instead
  (it's real: stage 5).
- **Going broke:** past three months' earnings in the red, they sell down (the home first, then the car), and if
  they know you, the rumour mill writes to you.

What it changes: the rich retire sooner (×1.25 over £1M, ×1.6 over £3M) and the skint work on (×0.5); the rich ask
10% more to sign (over £2M), the skint 15% less.

The rich list goes out every January in the Observer (the top five, and where you are), and the top ten for ten
years are kept (Life → Money shows the latest, and where you'd stand today).

Ten years of one world (seed 7, the long run): the top worth about £5–6M, the tenth £2–2.5M; the median signed
wrestler about £225k at the start, more as they go on; a few percent of veterans broke.

## Stage 5: the school

Code: `career/life/school.ts`; Life → School (`ui/career/LifeSchool.tsx`).

**The world's schools are real now** (`world.life.schools`): every country's two to four, with a reputation
(20–70 to start) and a coach or two (a local veteran). Every rookie comes out of one, the better-known ones more often,
and a better school (and more coaches) makes a better rookie (more potential). Each quarter a school's name drifts
towards what its graduates have made of themselves. Rich veterans who mentor open their own (named after them, with
them coaching).

**Your own:**

- **Open one** in your city (£30,000 for the ring and kit; rent about £2,500 a month by the city) or **buy one**
  (£120,000 + £6,000 a point of reputation, by the city), including the one that trained you, coaches and all.
- **Coaches:** retired wrestlers in your part of the world (or veterans part-time), £1,500–£8,000 a month by how well
  known they are; up to three. Better coaches mean faster progress. Coaching in your side earners counts too: each
  class slot adds to it.
- **Intake** every four months: more applicants and better ones as the name grows. Now and then a notable one (8%): a
  legend's kid (a lot more potential) or an ex-athlete (stronger, fitter). Take them paying (£250–£800 a month by
  reputation and city) or on a scholarship. Sixteen places.
- **Training:** each month they improve towards their potential (faster with better coaching, and when they're young),
  half of it on what you've set them to work on. You see what they could be as a range that narrows as they train:
  you can misjudge them early.
- **Graduation:** whenever you say. They become a real wrestler on the indies, trained at your school, with a
  mentor's bond to you; the school's name grows with each one.
- **School shows:** switch them on for a monthly showcase (a crowd of 60–500 by reputation, tickets £8–£18, less
  £1,500 to put on) and a little more name.
- **Feeder deals:** past reputation 45, a promotion may pay £20,000–£120,000 a year for two years for first call on
  your graduates.

## Stage 6: status and family money

Code: `career/life/status.ts`, `career/life/family.ts`; Life → Home (Show it off) and Life → Money (Family).

### Showing off (only when you choose to)

Once a week you can post the house (a house or better that you own), post the luxury car, turn up in the jet, show
off your luxuries, or throw a party (£8,000 by the region's cost index). It goes in your feed, and:

- **The fans:** a heel gets heat for it (4% of your social reach in new fans, half as much again for the jet or a
  party, inside the week's social cap). A face has an even chance of looking out of touch (a few fans lost, and a
  point of reputation).
- **The locker room:** about a third of your roster mates who know you notice. Those far poorer than you (worth under
  a quarter of you, by stage 4's money) are mostly envious (−3); the rest are impressed (+2). Someone skint may ask to
  borrow £1,000–£5,000 (the phone's usual lend-or-don't).
- **The office:** showing off now and then (twice in 90 days or less) helps (+1 reputation). Every week while you're
  losing reads as lost hunger (−2).
- **The humble megastar:** worth £5M+ and not shown off in a year, each June the locker room notices (+2 with up to
  twelve roster mates, +2 reputation, and a letter).

Your partner has views on your home whatever you post: living together or married, a home below what your money
says you should have (a room past £150k, a flat past £750k, a house past £3M) costs you with them each month; a house
or better keeps them happy.

### Family money

- **Married:** your partner chips in each month: a wrestler about 35% of their monthly earnings (out of their own
  stage-4 money), anyone else their job (£1,600 a month by the region).
- **Kids** cost money until they're 22: £700 a month under five, £450 at school, £900 at university (by the region).
  At 18 they can apply to your school (a notable applicant, with a little extra potential).
- **Divorce** (a marriage ending, either way): they get half of everything you're worth, no prenup. The cash goes
  first; if it won't cover it, things are sold in the fall's order (luxuries, funds, stakes, businesses, cars, the
  places you let, then your home) at 70% of their value.

## Stage 7: bad luck and the fall

Code: `career/life/risk.ts`, `career/life/fall.ts`. All on their own dice, once a month.

### Bad luck (chances a year)

- **A car crash:** only if you drive yourself (a car or van and no driver). 5% a year × the vehicle's own crash
  factor (a used car 1, a decent car 0.7, a luxury car 0.6, a van 0.8), worse the more tired you are (doubled at
  fatigue 50). 15% of crashes hurt you (3–12 weeks out, and the car's written off), 30% write the car off (insurance
  on your homes covers 80% of it), the rest are a bump (repairs, or the £500 excess if you're insured). The finance on a
  written-off car is still yours. A driver, the tour bus or flying means no risk.
- **Burglary:** 2% a year for each home you own and live in. They take a watch or a painting if you have one, else
  £2,000–£15,000 of cash and kit. Insured: paid back less the excess.
- **Fire:** 0.4% a year for each home and business you own: 15–65% of its value in damage. Insured (homes, or
  businesses), paid less the excess.
- **Scams:** with £100,000+ in the bank, about one "sure thing" a year: put in a fifth of your money (up to
  £250,000) to double it in a year. One in ten is real; the rest vanish after four months. An established or super
  agent warns you off.
- **Market shocks** are stage 3's: fund crashes, city slumps, businesses folding.

### The fall

- **The overdraft:** the bank stands you a quarter of a year's earnings in the red (£5,000 at least). Past it on the
  1st, things are sold until you're back inside it, in order: luxuries, funds, stakes, businesses, cars, the places you
  let, and last your home (each at 70% of its value; any loan on it is cleared from the sale).
- **Bankruptcy:** past the overdraft with nothing left to sell. Your debts are wiped (the overdraft and every loan),
  your credit goes to 0, and no one lends to you for six years. You lose 15 reputation, your partner takes it hard
  (−15), the Observer runs it, and promoters pay you 15% less until you're discharged (a letter says when).

## Stage 8: after you retire

Code: `career/life/afterlife.ts`; the Epilogue's "Carry on", and the Retired section at the top of Life → Home.

When you retire, the Epilogue shows once, as before, but with "Carry on". Carry on and the career goes on in retired
mode: the days keep going and nobody books you, but everything you own is still yours to run (homes, businesses,
investments, your school), the Office if you book or own a promotion, and the mail.

- **Wrestlers hire you as a personal trainer.** About once every three months (30% a month) a younger wrestler from
  your part of the world, less famous than you, asks: three months at £500–£6,000 a month (by your name), up to three
  at once. Each month they gain two points towards their potential, and their bond with you grows (a mentor's).
- **Comebacks** (up to 58): one night only (you're taking bookings again, and you retire again after your next
  match) or a short run (six months; then a letter asks whether you'll do six more or call it a day). A send-off
  purse and pension aren't paid twice.

## Stage 9: validation (everything switched on)

**Two years of each life** (ECON harness, `ECON=1`), worth at 24 months:

| Life | Worth | Notes |
|---|---|---|
| Unknown indie, no job | −£10,950 | Past the overdraft with nothing to sell: bankrupt (the debts wiped once) and still behind. Meant to struggle. |
| Unknown indie, part-time retail | £1,475 | Steady. Rent £185 a week, no tax. |
| Indie regular (5k fans), part-time | £1,209 | Steady; £2k tax over two years. |
| Successful indie (50k fans) | £1,651 | Steady; £20k tax. |
| Newly signed, bottom of VWF | £2,409 | Lives up to its means; £49k tax (about 19%). |
| Established star, nothing bought | £967k | Rent only. |
| Established star, careful | £1.55M | A house on a mortgage, a decent car, an agent, a physio, the rest in a balanced fund. On target (£1.3–1.8M). |
| Established star, flash | £995k | A mansion, a jet share, a luxury car, a tour bus, a flat to let, the full team. Still solvent: borrowing limits (a multiple of a year's earnings) stop a star on steady money overreaching, so the flash fall comes when the money stops (injury, release, retirement), not on a good run. |

**The world** (long runs, 3 seeds × 3 years and one world × 10): the richest about £4–6M, the tenth £1.3–2.5M, the
median signed wrestler £200k growing to £500k+ over ten years, a few percent of veterans broke. Day time unchanged
(about 20 ms median); perf about 95 ms a job (it was 85–92 before Life's later stages, within run-to-run noise).

**Checks for every stage:** typecheck; the full suite with Life on and off; build; the golden test unchanged; long run;
perf; the match UI sweep and the Life sweep (homes, travel, staff, invest, school, rich list, showing off, retiring and
carrying on) in all three skins at phone and fold widths.

Price tweaks wait for Lyra's play.
