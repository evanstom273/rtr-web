# Feuds

Lyra's design (five rounds of questions, after the first version was rubbish). Code: `career/feuds.ts` (the story),
`career/segments.ts` (segments, played), the engine's `rules.feud`; the screens `ui/career/Feuds.tsx` and
`ui/career/SegmentPlay.tsx`. Switch: `FEATURES.feuds2` (on). Numbers: `FEUD`, `FEUD_PLAY`, `FEUD_MATCH` in tuning.

## One at a time, four ways in

You're in one feud at a time (everyone else has theirs; you can watch them and get involved).

- **You start it** (Feuds screen, from the hub's feud button): pick a rival from your promotion who isn't tied up, and
  call them out (online, +5 heat), jump them (a beat-down on the next show, +12) or cut a promo on them (the next
  show, +8). An old rival reignites (+15).
- **The office hands you one** (about one a month when you're not in one, 3.5% a day): you're in it, no choice.
  Title feuds the booker sets up with you in them count too.
- **It grows on its own:** a loss to someone who can't stand you (30%), a beef online (30%), or costing someone a
  match when you run in.
- **A rival comes for you:** a hot-head, an ego or a showboat runs their mouth about you (1.2% a day): bite (+10, it's
  on) or ignore them (−1 reputation; they tell everyone you're scared).

## Stages

**The spark → building → escalation → the blow-off.** What moves it on: heat, key moments, time, and the booker's date.

| From | To | When |
|---|---|---|
| The spark | Building | heat 30, or anything happens (a segment, a call-out), or 10 days |
| Building | Escalation | heat 60, or an attack, a stipulation agreed or a betrayal, or 35 days at 35+ heat |
| Escalation | The blow-off | the blow-off's week |

The blow-off gets its date when it turns personal (escalation): the first big show (a special or flagship) at least
three weeks off. It isn't the next show: feuds run weeks to months. **As long as it's hot:** at 75+ heat a week out,
the booker puts the blow-off back to the next big show (twice at most) unless you called it. **You can call it**
yourself once it's building: the next big show at least two weeks off, with the stipulation (street fight, last man
standing, steel cage, I quit, falls count anywhere, no DQ) and stakes (loser leaves town, hair, mask, a title shot) you
want. Old feuds are remembered and can reignite.

Heat: segments (score − 2) × 7 × how they were played; matches (stars − 2.5) × 5, worn after three; a week with nothing
−4; call-outs +3, beefs +5; attacks and moments as below.

## The matches: a story

- None in the spark. After that, at least 10 days apart; weekly TV less often, the big shows more.
- **Who wins:** the story. They trade wins (the heel first, by cheating), whoever's behind goes over next, and at the
  blow-off the face goes over the heel (else the bigger star). Creative Control still has its say: yours over your
  own, and an AI star with it protects themselves against anyone below them, feud or not.
- **Stipulations escalate:** standard → no DQ → street fight → falls count anywhere → last man standing → steel cage,
  a step per match (one more when it's hot or escalated). The blow-off's by heat (80+: cage, last man standing, I
  quit, street fight; 55+: street fight, no DQ, falls count anywhere), or the one you called. Anyone who won't do
  hardcore gets a clean ladder instead (two out of three falls → submission → steel cage; the blow-off a cage, an iron
  man, two out of three or a submission match), and can't be called into a weapons match.
- **Allies:** from escalation, 30% of the time friends get involved: a tag match (both have a close friend free) or
  two on one (one has). Only with the match overhaul on (`FEATURES.matches`).
- **Stakes** on the blow-off: what you called; at 85+ heat sometimes loser leaves town.
- The heat goes into the match (`rules.feud`): a hotter crowd at the bell, bigger reactions, +heat/100 × 0.35 stars,
  +0.2 on the blow-off, and the commentary knows. Whoever won the last segment has the crowd (+1 on every roll).
- Hot feuds go higher up the card.

## Title feuds

Lyra's call: a feud with a champion is for the title, no catch. Whoever starts it and however it starts (you call out
the champion, the office hands you one, it grows, they come for you, or you're the champion), if one of you holds a
singles title in the promotion (the biggest, if you both do) and the other could hold it, the belt goes on the line at
the blow-off.

- **Only the blow-off.** The matches building to it are non-title (beat the champion to prove a point); the blow-off is
  the title match, with the stipulation (called or by heat) and any stakes.
- **Who leaves with it:** the story, with the title's say. The story's pick counts for 0.6 + heat/500 (to 0.9), the
  title's own rhythm the rest (a new champion tends to keep it, a long reign tends to end). Your contract's protection
  for a new champion stands.
- **Every title feud gets the full feud,** the office's AI ones too: stages, build-up matches, segments, stipulations.
  The title isn't defended against anyone else while it runs.
- **If the belt moves:** the champion losing it elsewhere (or it falling vacant) takes it out of the feud (it's just
  personal now); someone in a feud winning a belt brings it in.
- **What it pays:** the title itself, instead of the promised title shot.
- Match Conditions (no hardcore) in either contract rules those stipulations out when you call it.

## Segments, played

The AI puts its feuds' segments on TV and big shows (up to two a show); yours go on when you're on the show. You can
also ask for one (Feuds screen, the calendar's show sheet, show day): promo, face to face, beat-down, run-in, contract
signing, backstage, interview. The booker answers straight away (about 45%, plus reputation and heat).

**The big cut (`docs/cut.md`, `FEATURES.playSegments` off): segments aren't played any more.** Yours are simmed (Sim
it on show day, or after the show), and a skip never stops for one. What follows is how playing them works, kept for if
it comes back.

On show day: **Play it** or **Sim it**. Skipping stops for them, like your matches, unless you've set "Your matches and
segments: Sim them" (the skip sheet, or the week's settings). Then a long skip sims your segments like your matches,
the feud's letters (it's building, they're posting about you, the blow-off's set) land in your mail without stopping
it, and a rival's call-out is answered for you by who you are: hot-heads, the aggressive, egos, showboats and anyone
who already can't stand them bite; the professional, the methodical and the defensive ignore it; anyone else bites.
It goes in the skip's summary.

- **Promos** are built beat by beat (the open, the dig, the hook, the closer), each from four kinds of material:
  - going after them (their skill, their looks, the last time you beat them);
  - hyping yourself (your titles, your wins);
  - **real life**, from what actually happened in the game: their ex, the bank taking their house, a losing run, a
    lost title, the last time you beat them, how the locker room sees them (risky: the most heat, and they don't forget);
  - working the crowd (a heel's cheap heat, a face's pandering).

  Heels get more from going after them and the crowd, faces from themselves; the same kind twice running is worth
  less. Each beat is **delivered on the timing bar**: stop the marker in the gold (charisma widens it, risky lines
  narrow it; close is half marks; fluffing loses the crowd). Your rival comes back at you after the dig and the closer.
  The crowd meter (from 50) is the score (÷ 20).
- **Face to face and backstage:** a short promo, then go for them or walk away.
- **Contract signings:** sign and leave (a tease), sign then attack, or flip the table (both a brawl).
- **Beat-downs and run-ins:** a brawl. A mini match: up to four exchanges on the dice, your move against theirs (strike
  beats a grapple, a grapple beats a weapon, a weapon beats a strike; they choose by personality), each won exchange
  swinging the upper hand. Someone's left laying. The same move every time is dull TV.
- **How it lands:** great (3.75+), you've the crowd (the edge in your next match with them); botched (under 1.75, or
  fluffing twice), the crowd turns, your rival wins the exchange, the office notices (−2 reputation). Either can go round
  online (40%: fans ±, a letter, the locker room). Real life: ×1.3 heat, and −6 with them.

## Your rival, between shows

By who they are: hot-heads and the aggressive jump you (+8, fatigue; real enemies can really hurt you, friends pull it),
showboats and egos post about you or cost you a match (they run in on your next one), the methodical want you face to
face. More often the hotter it is.

## It can go wrong

- Cold (8 or less after three weeks): the office pulls it.
- Either of you out for a month or more: dropped.
- Your last three segments averaging under 1.75: dropped.
- A real fight backstage (80+ heat and you genuinely can't stand each other): fines, maybe an injury, more heat.

## What it pays

- Better matches (the heat in the stars), fans (each segment; the blow-off: the winner × 1 + heat/100 × 0.08, the
  loser 0.03).
- **Money:** a feud bonus at the blow-off, your fee × heat/100 × 2.
- **A push:** reputation (heat/100 × 8 if you win, × 3 if not), higher on the card, and a title shot (the secondary
  title) if you win a blow-off at 70+.

## Everyone else's

The Feuds screen lists the promotion's other storylines (heat, stage, record, blow-off). On a show you're on with their
match: **run in** for one of them. They win; the one you cost remembers (and, if you're free, it's a feud).

Finished feuds go into the world's history (`history.feuds`), the last 600.
