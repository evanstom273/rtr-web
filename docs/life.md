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
