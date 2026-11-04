// Voices (Lyra's call: in character). Whoever writes to you sounds like themselves: a hot-head shouts, an
// egotist brags, a professional is brief, a mentor is warm, a politician is sly. Picked from their traits.
import { findWrestler, type TraitId } from '../data/rtr';
import { activeWorld } from '../world/world';

export type Voice = 'hot' | 'cocky' | 'pro' | 'warm' | 'sly' | 'plain';

const BY_TRAIT: [TraitId, Voice][] = [
  ['hot_headed', 'hot'], ['egotistical', 'cocky'], ['professional', 'pro'], ['mentor', 'warm'], ['politician', 'sly'],
  ['aggressive', 'hot'], ['rebellious', 'hot'], ['showboat', 'cocky'], ['ambitious', 'cocky'], ['reliable', 'pro'], ['methodical', 'pro'],
  ['loyal', 'warm'], ['team_player', 'warm'], ['crowd_pleaser', 'warm'], ['opportunist', 'sly'], ['mercenary', 'sly'], ['dirty_fighter', 'sly'],
];

/** A wrestler's or a booker's voice. */
export function voiceOf(id: string | undefined): Voice {
  if (!id) return 'plain';
  const traits: readonly string[] = findWrestler(id)?.traits ?? activeWorld().people?.staff[id]?.traits ?? [];
  return BY_TRAIT.find(([t]) => traits.includes(t))?.[1] ?? 'plain';
}

type Bank = Partial<Record<Voice, string[]>> & { plain: string[] };
export const LINES = {
  // From your opponent, after the match.
  opp_won: {
    hot: ['Told you. Every time you get in there with me, this is how it ends.', 'Stay down next time. Save us both the bother.', 'Next time you won’t get up at all.'],
    cocky: ['No hard feelings. Somebody had to show you how it’s done.', 'You were good. I was better. That’s the business.', 'Don’t take it personally. Everyone loses to me eventually.'],
    pro: ['Good match tonight. You pushed me further than I expected.', 'Good work tonight. Watch the tape back: you’re closer than you think.', 'Solid match. I had to work for that one.'],
    warm: ['Hell of a fight, {you}. Keep that up and you’ll be beating people like me soon enough.', 'You made me earn that. Respect, honestly.', 'Chin up. That was a proper match, whatever the result says.'],
    sly: ['Nice work out there. Shame about the result. For you, I mean.', 'Good match. People saw who came out on top, though.', 'You did well. I did better. Funny how that works.'],
    plain: ['Good match. Better luck next time.', 'Good match tonight.', 'Tough one. Well fought.'],
  },
  opp_lost: {
    hot: ['THAT WAS A FLUKE. Run it back and see what happens.', 'Enjoy it while it lasts. I’m coming for you.', 'I’m not done with you.'],
    cocky: ['Enjoy it. It won’t happen twice.', 'You caught me on an off night. Everyone gets one lucky night.', 'Lucky. We both know it.'],
    pro: ['You earned that one. Respect.', 'Fair result. I’ll be better next time.', 'Well wrestled. I’ll want that one back.'],
    warm: ['You were the better wrestler tonight. Proud to have been in there with you.', 'You earned that. Go and enjoy it.', 'Brilliant from you tonight. I mean that.'],
    sly: ['Congratulations. People will remember that one. I’ll make sure of it.', 'Enjoy the win. Everyone’s watching you now. Careful.', 'Well done. I hope you’re ready for the attention.'],
    plain: ['Fair result. Well wrestled.', 'You were better tonight.', 'Congratulations. Earned.'],
  },
  opp_great: {
    hot: ['Still. The crowd loved it. Even I’ll admit that.'], cocky: ['Mind you, we tore the house down. Mostly me, but still.'],
    pro: ['That’s the best match I’ve had in a while.'], warm: ['That’s one I’ll remember. Thank you.'],
    sly: ['We made each other look good. Let’s keep doing that.'], plain: ['The crowd loved it.'],
  },
  friend_title: {
    hot: ['CHAMPION! About bloody time.'], cocky: ['Champion. I told everyone you’d get there, mostly so I’d look clever.'],
    pro: ['Congratulations on the title. You earned it.'], warm: ['Champion! I’m so proud of you. Drinks are on me.'],
    sly: ['Champion. Remember who was in your corner when it counted.'], plain: ['Congratulations on the title.'],
  },
  friend_great: {
    hot: ['Saw your match. FUMING it wasn’t me in there with you.'], cocky: ['Saw the match. Not bad. I’d have done it better, but not bad.'],
    pro: ['Watched your match back. That was the real thing.', 'That was a clinic. Well done.'], warm: ['Just watched your match. Brilliant. Absolutely brilliant.', 'Still buzzing from your match. Proud of you.', 'That’s the one people will talk about. Well done.'],
    sly: ['Everyone’s talking about your match. Make sure the right people hear about it.'], plain: ['Great match. Everyone’s talking about it.', 'Everyone in the locker room was watching that one.'],
  },
  rival_callout: {
    hot: ['You’ve been hiding from me. Name the night and I’ll be there.'], cocky: ['Everyone wants to see us. I’m not sure you do.'],
    pro: ['It’s time we settled this properly. You know where to find me.'], warm: ['No hard feelings, but I want a go at you.'],
    sly: ['People are saying you’re avoiding me. I’m not saying it. People are.'], plain: ['I want a match with you.'],
  },
  mentor_open: {
    hot: ['Listen.'], cocky: ['Free advice, and I don’t give much of it:'], pro: ['One note from your last few matches:'],
    warm: ['Been watching your matches. Something to try:'], sly: ['Between us:'], plain: ['A tip from your last few matches:'],
  },
  // Your booker or promoter, on the night.
  bk_good: {
    hot: ['Now THAT is a match.'], cocky: ['Told you booking you was a good idea.'], pro: ['Strong match. Exactly what I wanted.', 'Good. That’s the standard.', 'Strong. Keep that up.'],
    warm: ['Brilliant. The crowd loved you.', 'That’s why I booked you.', 'Lovely work tonight.'], sly: ['Good match. I’ll keep you in mind.'], plain: ['Good work tonight.', 'Strong match.', 'Exactly what I wanted.'],
  },
  bk_ok: {
    hot: ['Fine. Just fine. I want more than fine.'], cocky: ['It did the job.'], pro: ['Solid. We can build on that.', 'Fine work. Nothing wrong with it.', 'Did the job.'],
    warm: ['Good honest work tonight.', 'Nice and solid. Well done.', 'Good honest work.'], sly: ['Solid. We’ll see where it takes you.'], plain: ['Solid work.', 'It did the job.', 'Fine.'],
  },
  bk_poor: {
    hot: ['That was FLAT. Fix it.'], cocky: ['I’ve seen better from trainees.'], pro: ['Below what I need from you.'],
    warm: ['Off night. We all have them.'], sly: ['Let’s not talk about that one.'], plain: ['Not your best.'],
  },
  bk_offscript: {
    hot: ['WHO TOLD YOU TO WIN? You don’t decide that. I do.'], cocky: ['Cute. Do that again and see how far down the card you go.'],
    pro: ['That wasn’t the plan. We’ll talk.'], warm: ['I’m disappointed. We had a plan.'], sly: ['Interesting choice. I’ll remember it.'],
    plain: ['You went off-script. I’m not happy.'],
  },
  bk_botched: {
    hot: ['You were supposed to WIN. What happened?'], cocky: ['I handed you the win and you dropped it.'], pro: ['You were booked to win. That didn’t happen.'],
    warm: ['Rough night. You were meant to win that one.'], sly: ['I put my neck out for you and you lost.'], plain: ['You were booked to win.'],
  },
  bk_upset: { plain: ['Not the finish we planned, but nobody’s blaming you.'], hot: ['Not what I planned. Not your fault. Still annoyed.'] },
  // The weekly check-in.
  ci_up: {
    hot: ['You’re getting better. Don’t let it go to your head.'], cocky: ['You’re finally listening to me. It shows.'], pro: ['Your matches are improving.', 'Better every week. Keep going.', 'Your numbers are up. Good.'],
    warm: ['Lovely few weeks. You’re getting better every time out.', 'Love what I’m seeing from you lately.', 'You’re on a run. Enjoy it, and keep it going.'], sly: ['People are starting to notice you. That can be good or bad.'], plain: ['Your matches are getting better.', 'Better weeks lately.', 'Things are looking up for you.'],
  },
  ci_down: {
    hot: ['Your matches are going backwards. SORT IT OUT.'], cocky: ['You’ve gone off. Don’t make me regret this.'], pro: ['Your recent matches have slipped.', 'Not your best few weeks. I need more.', 'You’ve dipped. Let’s fix it.'],
    warm: ['Tough few weeks. Let’s turn it round.', 'Bit of a rough patch. It happens. Let’s get you back.', 'Not your best spell. I still believe in you.'], sly: ['Some people are asking whether you’ve peaked.'], plain: ['Your matches have slipped.', 'A rough few weeks.', 'Not your best spell.'],
  },
  ci_steady: {
    hot: ['Same as ever. I want more.', 'Fine. FINE. Give me something bigger.'], cocky: ['Steady. Steady doesn’t sell tickets.', 'Steady. Do something people will remember.'], pro: ['Steady. Keep doing what you’re doing.', 'Steady. Keep doing what you’re doing.', 'Consistent. That matters.', 'No complaints this week.'],
    warm: ['Steady as ever. Good.', 'Another good honest week.', 'Steady and reliable. I like that.'], sly: ['Steady. Nobody’s talking about you, which isn’t always good.', 'Steady. Quiet weeks get forgotten.'], plain: ['A steady week.', 'A steady week.', 'Nothing to complain about.', 'Business as usual.'],
  },
  ci_quiet: {
    hot: ['Nothing from you this week. Stay ready.'], cocky: ['Quiet week. Enjoy it while it lasts.'], pro: ['No matches this week. Stay sharp.', 'Quiet week. Use it to get better.', 'No dates this week. Stay ready.'],
    warm: ['Quiet week. Rest up.', 'Nothing for you this week. Look after yourself.', 'Quiet one. You’ve earned a rest.'], sly: ['Quiet week. Use it.'], plain: ['Nothing to report this week.', 'A quiet week.', 'No matches this week.'],
  },
  ci_grudge: {
    hot: ['And I haven’t forgotten what you did.'], pro: ['I haven’t forgotten the off-script finish.'], sly: ['I haven’t forgotten that little stunt, by the way.'],
    plain: ['The off-script finish is still on my mind.'],
  },
  // A short post after the match.
  post_after: {
    hot: ['Rematch. Now.', 'Not finished. Not even close.'], cocky: ['You’re welcome, {city}.', '{city}, you saw a star tonight.', 'Another night, another show stolen.'], pro: ['Good match tonight. Thanks, {city}.', 'Back to work tomorrow. Thanks, {city}.'], warm: ['Thank you, {city}! What a night.', 'What a crowd, {city}. Thank you!', 'Every time, {city}. Every time.'],
    sly: ['Remember where you saw it first.'], plain: ['Thanks, {city}.', 'Thank you, {city}.', 'Great crowd tonight.'],
  },
} satisfies Record<string, Bank>;
export type Situation = keyof typeof LINES;

export const fill = (t: string, vars: Record<string, string | number> = {}): string => t.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));

/** A line for a situation in this voice (falling back to plain), filled in. */
export function line(v: Voice, s: Situation, rnd: () => number, vars: Record<string, string | number> = {}): string {
  const bank: Bank = LINES[s];
  const xs = bank[v] ?? bank.plain;
  return fill(xs[Math.floor(rnd() * xs.length)]!, vars);
}

/** What a mentor tells you, by the weakest part of your recent report cards. */
export const TIPS = [
  'Let them cut you off for a while. The crowd needs a reason to want you back.',
  'Pick a body part and stay on it. Then finish them with something that hurts it.',
  'Give them near-falls. Kick out late. Make them think it’s over.',
  'Don’t rush the finish. Go ten minutes before you go for the finisher.',
  'Take a risk now and then. Up top, out to the floor. They pay to see it.',
];

const FAN_A = ['ringside', 'toprope', 'suplex', 'bodyslam', 'turnbuckle', 'headlock', 'steelchair', 'apron', 'hardcam', 'cornerpost', 'bellringer', 'canvas'];
const FAN_B = ['_rach', '_dan', '_kev', '_soph', '_mo', '_jen', '_li', '_ana', '_tom', '99', '_jay', '_nat', '_bex', '_ollie'];
export const fanHandle = (rnd: () => number): string => `@${FAN_A[Math.floor(rnd() * FAN_A.length)]}${FAN_B[Math.floor(rnd() * FAN_B.length)]}`;

/** What fans post about a match, by how good it was. */
export const FAN_POSTS = {
  great: ['{you} and {opp} just tore the house down at {show}.', 'Somebody give {you} a bigger spot. Now.', '{stars}. Deserved every one.', 'That finish. I’m not okay.', 'Match of the year contender, don’t @ me.'],
  good: ['Proper match, that. {you} looked the business.', 'Solid from {you} and {opp}. More please.', '{city} was loud for that one.', 'Didn’t expect much. Got a lot.'],
  meh: ['Decent enough. Bit long in the middle.', 'Fine match. Wanted more from {you}.', 'Not bad, not great.', 'It was a wrestling match. That’s all I’ve got.'],
  poor: ['Went to make a brew during that one.', '{you} vs {opp} was… a match. Technically.', 'Nope.', 'The crowd in {city} went very quiet.'],
  title: ['AND NEW! {winner} is your {title} champion!', 'The {title} has a new home. {winner}!'],
  upset: ['Did NOT see that coming.', 'Upset of the week, surely.'],
};
