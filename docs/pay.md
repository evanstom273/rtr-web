# Pay

Lyra's rework (Nov 2026): pay was far too low. Code: `career/economy.ts` (the curve, the three ways to be paid,
indie fees), `career/money.ts` (salaries, Guaranteed Pay, bonuses), `career/contracts.ts` (negotiating it),
`career/books.ts` (what companies pay and take). Numbers: `PAY`, `INDIE_FEE_*`, `GUARANTEED_DATES`,
`RELEASE_PAYOUT`, `BONUS_FEES`, `BIZ.takings`, `BIZ.talentCover` in `career/tuning.ts`.

## The salary curve (majors)

Set by drawing power: where you stand on the promotion's roster by fans in its home region (0 the bottom, 1 the
top), then reputation (×0.85–1.2) and titles (a world title ×1.2, any other ×1.08). At the biggest major:

| Tier | A year |
|---|---|
| Lower card | £250k–£600k |
| Midcard | £600k–£1.5m |
| Upper midcard | £1.5m–£3m |
| Main event | £3m–£6m |
| Megastar | £6m–£10m, and an exceptional draw past the roster's top keeps going |

Ranges, not caps. Each promotion pays its own scale by popularity: the biggest major ×1, the smallest major ×0.5,
falling away fast below the majors (regional and local companies in booker mode).

A deal's `fee` is the per-appearance unit: a year ÷ (12 × 4.5). Everything priced "in fees" (signing bonuses,
pensions, fines, bonuses) uses it, so it all scaled with the rework.

## How you're paid: PPA, Monthly or Both

Negotiated like any other term (asking for a way they don't prefer costs a little in the deal).

- **PPA (per appearance):** the unit × the show's size (weekly 1, tour 0.8, special 1.5, flagship 2.5) × 1.15. More
  than a salary if you're busy, less if you're not.
- **Monthly:** a salary every month, always: booked or not, injured, suspended. Sized to the promotion's schedule
  (a promotion that runs one show a month pays a one-show salary) and to agreed dates (part-timers).
- **Both:** 60% of the monthly salary, plus 45% of the unit × the show's size per appearance.

Who opens with what (by size): the biggest majors (popularity 65+) Monthly, the other majors Both, anyone running
fewer than three shows a month PPA, the indies always PPA.

A salary starting part-way through a month (a new deal, a new career) pays the rest of that month there and then.

## Losing

Costs nothing. The booker decides who goes over; your pay doesn't care. A loss only costs you a win bonus.

## Performance Bonuses (the clause: triggers by tier)

Winning a title (5 fees), title defences (1), great matches (4★: 1; 5★: 2.5), main events (0.5), big shows (0.5),
win streaks (2), **winning** (0.25), **drawing a crowd** (1: headlining a show that takes 25% over its usual).

## Guaranteed Pay

| Tier | Pulled from a card | Paid dates a month (PPA, Both's per-show part) | Let go early |
|---|---|---|---|
| Partial | paid in full | 1 | a quarter of what's left |
| Standard | paid in full | 2 | half of what's left |
| Premium | paid in full, + an appearance bonus | 4 | all of what's left |

## Indies (per appearance only)

£300 × the brand (0.85 a skint local outfit to 1.25 a well-off one) × reputation (0.9–1.15) × (fans in that region
÷ 500)^0.40, × 1.5 for an indie champion, × 1.3 on a special or cup night. £250 is the floor, no cap.

| Level | An appearance |
|---|---|
| Rookie / tiny local shows | £250–£500 |
| Established local regular | £500–£1,000 |
| Recognised indie talent | £1,000–£2,500 |
| Major indie attraction | £2,500–£5,000 |
| Nationally known star | £5,000–£10,000 |
| Legendary draw | £10,000+ |

## The world

- AI wrestlers earn on the same curves; the rich list follows (`life/aiMoney.ts`).
- Companies pay PPA fees on the night, salaries at the end of the month. The new money in the business (TV rights,
  sponsors) comes to each company in line with what its roster's worth on the curve (×0.8 a month), not what it
  actually pays, so overpaying still costs you. Local and regional companies' takings ×4 and ×2.5 (indie talent
  costs £250+ a head now). Every major stays in profit, close to its old margins.
- Prices went up 2.5× afterwards (Lyra's call: not as much as pay, but enough that you have to think): training,
  homes and rent, cars and travel, luxury, staff, medical, the cost of living (`COST_SCALE`, applied to the price book
  in `tuning.ts`; `TRAIN_DIVISOR`, `TRAVEL`, `MEDICAL_PER_DAY`, `LIVING_COST_EUROPE`).

## Old saves (world rev 12)

Every current deal is lifted onto the curve (never down) and stays per-appearance; you get a letter, and you can ask
for Monthly or Both at renewal. Open offers too.

## Negotiating (Lyra's call: a nobody shouldn't talk their way into a star's deal)

- **No live read.** You only see how they took an offer after you put it to them, and it's rough: Interested, They
  could live with it, Not keen, Losing patience.
- **Your standing caps the big clauses.** Standing is half your reputation and half where your drawing power puts
  you on their roster (0–100). Under 35 you can ask for Tier 1 at most of Creative Control, Guaranteed Pay, Merch,
  Profit Share, Championship Opportunities, Push, Booking Commitments, Wage Matching, Signing Bonus and Image Rights;
  under 60, Tier 2. Whatever they offered themselves stands (`NEGO_CAPS`, `clauseCap` in `contracts.ts`).

## Leaving without your Character & Image Rights

The character stays with them: the name, your entrance theme and video, your finishers' and signatures' names
(name them in the moveset editor), and your merch drops to a quarter, building back over a year. The new name has to
be properly new: not the old one with a capital, a space, a letter or two changed, or a "The" added. Buy the old name
back from your profile (£3 a fan it lost you, £25,000 at least): the name, the finishers' names, the entrance and
half the lost fans come back. Re-sign with them and it's yours again for nothing (`REBRAND`, `buyBackName`).
