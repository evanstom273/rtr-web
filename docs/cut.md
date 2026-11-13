# The big cut

Lyra's call (Nov 2026), after weeks of adding things without playing: "I went massively overboard on adding stuff
into this game that just doesn't need to be here for a wrestling game." What's below is hidden, not deleted: the code
is all still there, behind switches in `career/tuning.ts`. Flip one back to `true` to bring that part back.
`bringBack()` (`career/cut.testkit.ts`) switches the lot back on for the tests that cover the hidden code, so it
keeps working; `cut.test.ts` checks the cut itself.

## What went, and its switch

| Gone | Switch |
|---|---|
| **Life:** homes and property, getting about (cars, jets, flying classes, the road crew) | `LIFE_PARTS.homes` |
| **Life:** personal staff and medical (surgeons, clinics, the recovery kit) | `LIFE_PARTS.staff` |
| **Life:** investments, businesses, funds, stakes, luxury, insurance | `LIFE_PARTS.invest` |
| **Life:** status (showing off), family money, risk (overdraft, bust, the fall) | `LIFE_PARTS.status`, `.family`, `.risk` |
| **Life:** after retiring (carrying on, comebacks), AI money and the rich list | `LIFE_PARTS.after`, `.ai` |
| Romance and family (yours and the world's couples) | `FEATURES.romance` |
| The phone (texts, topics, plans, invitations, standing orders for invitations) | `FEATURES.phone` |
| Social media (posting, the feed, going viral, the reaction online in your match report) | `FEATURES.social` |
| Locker-room politics (chemistry, enemies working stiff, the room, cliques, badmouthing, fights, signings pulled by friends) and gossip (rumours, real-life angles) | `FEATURES.politics` |
| Booker mode for you (booking for a promotion, founding one, job offers, owners handing one on) | `FEATURES.bookerMode` |
| Day jobs | `FEATURES.jobs` |
| Check-ins (the booker's Monday letter, a mentor's notes, people writing just to chat after a match) | `FEATURES.checkIns` |
| The press (journalists' letters, the weekly digest, the podcast, the finish, the newspaper profile and contract-question events) | `FEATURES.press` |
| Playing segments (the promo minigame, brawls): your segments are simmed | `FEATURES.playSegments` |
| 11 contract clauses: Booking Commitments, International Touring, Wage Matching, Signing Bonus & Advances, Loyalty & Tenure, Training & Development, Schedule Flexibility, Travel & Accommodation, Renewal & Options, Mentorship, Social Media Policy | `CUT_CLAUSES` |

## What stays

The school, your entrance (its own part now, `LIFE_PARTS.entrance`, on the Life screen and the contract's entrance
term), the money side (tax, the agent), side hustles, AM/PM, living costs, mail (results, career events, special nights
and cups, requests), the history sim, scouting and tryouts, Creative Control, feuds, the 14 other clauses, and the
three skins.

## How the gaps were filled

- **The world still runs.** `FEATURES.booker` stays on: it runs every AI company's books, TV deals, wars and owners.
  Only you booking is hidden. A save that already books keeps its Office.
- **Deaths.** The world's only deaths (and babies, illness) live in the romance code's monthly life events; those
  still run. Your own family's events and everyone's love lives don't.
- **Tag teams.** Teaming up used to be a phone call. It's a button on Relationships now ("Ask them to team up", and
  "Split" once you're a team), with the same odds.
- **Sponsors** used to renew only if you'd kept posting. With social media hidden they renew if you've kept wrestling.
- **Money trouble** used to offer gig work or a job. Without day jobs, it's a friend's loan (if you've a friend) or
  riding it out; it now comes whether or not jobs are on.
- **World news.** Without the digest, the news desk's stories about other people stay out of your mail (they're in the
  Records); your own news still comes as a letter.
- **Segments** never stop a skip, and the ones you're in are simmed after the show (or by "Sim it" on show day).
- **Old saves.** Anything bought under a hidden part (a house, a car, staff) stays in the save, untouched; a mortgage
  or finance still gets paid off. Living costs come back in place of rent.
