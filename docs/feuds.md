# Feuds

Lyra's call: booker mode's segments come over to the wrestling side, and feuds become an actual thing, with heat and
popularity that help match ratings. Code: `career/feuds.ts`, the engine's `rules.feud` (`engine/state.ts`,
`engine/crowd.ts`, `engine/rating.ts`). Switch: `FEATURES.feuds2` (on).

## Heat for every feud

Every feud has heat (0–100) now, not just the storylines you write as a booker. It starts at 20, plus 10 for a title
feud, plus 20 for real bad blood (an angle from real life).

- **Segments** between the two move it: (the segment's score − 2) × 7, times how you played it.
- **Matches** between them move it: (stars − 2.5) × 5. After two, the same match wears it out (−6 each time).
- **A week with nothing** cools it by 4 (each Monday).
- **Calling them out online** adds 3; a beef adds 5.

The hub shows your feud as a strip: who, how hot (Cold, Simmering, Warm, Hot, White hot), where it pays off, and a
bar for the heat. Tap it for what's happened lately.

## Segments on the card

When the AI draws up a TV show or a big show, its feuds get segments: up to two a show, each feud about half the time
(yours 70%, and only when you're on the show). What it is depends on where the feud's at:

- early on: a promo or an interview;
- then: a promo, a beat-down, a run-in (after the other one's match) or an interview;
- in the last two weeks before a payoff on TV or a big show: sometimes a contract signing.

They're scored with booker mode's segment scoring (charisma, fans in the region, real heat between them, the kind of
segment, a little luck) and pay fans the same way. Booker mode's own shows are untouched: you write those.

### Yours: how you play it

On show day, your segment is under "Your feud", with a choice:

| Segment | Choices |
|---|---|
| Promo, interview | Fiery (big if you've the charisma, ugly if not), Cold and calm (safe), Get personal (the most heat, the biggest swing, and they won't forget it), Make them laugh (plays as a face, wins fans, less heat) |
| Beat-down, run-in | Leave them laying (heat for days; if it flops the office thinks it went too far), In and out |
| Contract signing | Sign and leave (a tease), Sign, then attack, Flip the table |

No choice: it's played straight. In a feud with no segment tonight, you can **ask for a promo slot** (once a show):
about 35%, more with reputation and heat.

## The heat in the match

A match between two who are feuding carries `rules.feud = { heat, payoff }` into the engine:

- the crowd starts hotter (heat × 0.2: up to +20 at the bell);
- they react harder to everything the two of them do (heat gains × 1 + heat/100 × 0.25);
- the stars go up by heat/100 × 0.35, and another 0.2 on the blow-off;
- the commentary knows ("No love lost… this one's personal", or "tonight it ends").

Without a feud nothing changes (the golden test is untouched).

## The blow-off

On the payoff show, both ride the heat: the winner's fans in the region × (1 + heat/100 × 0.08), the loser's
× (1 + heat/100 × 0.03). If it's yours, a letter says how it ended.

## Remembered

Once a feud's over it goes into the world's history (`history.feuds`: who, the promotion, how hot it got, how many
matches, how it ended), the last 600, for Feud of the Year and the record books.
