// The phone's words (Lyra's call: grown-up and sweary where it fits; romance fades to black, and isn't here yet).
// What you say (each topic in four tones), how they answer (by their voice, and how they took it), and what people
// send you unprompted. Family have their own voice. {them} is their first name, {who} someone you both know,
// {promo} a promotion, {you} your name.
import type { Voice } from './voice';

export type Tone = 'warm' | 'plain' | 'cocky' | 'blunt';
export type Topic = 'catchup' | 'congrats' | 'console' | 'advice' | 'gossip' | 'word' | 'sorry' | 'goat'
  | 'invite' | 'share' | 'gift' | 'borrow' | 'payback' | 'flirt' | 'date' | 'commit' | 'movein' | 'propose' | 'split' | 'rumour' | 'teamup' | 'teamsplit';
/** The topics a stage 1–2 conversation has its own words for (the rest bring their own). */
export type BaseTopic = 'catchup' | 'congrats' | 'console' | 'advice' | 'gossip' | 'word' | 'sorry' | 'goat';
export type Reaction = 'good' | 'meh' | 'bad';
/** Voices on the phone: everyone's from voice.ts, plus family. */
export type PVoice = Voice | 'fam';
type Bank = Partial<Record<PVoice, string[]>> & { plain: string[] };

export const TONE_LABEL: Record<Tone, string> = { warm: 'Warm', plain: 'Straight', cocky: 'Cheeky', blunt: 'Blunt' };
export const TOPIC_LABEL: Record<Topic, string> = {
  catchup: 'Catch up', congrats: 'Congratulate them', console: 'Check they’re alright', advice: 'Ask their advice', gossip: 'Ask about someone',
  word: 'Ask them to put a word in', sorry: 'Apologise', goat: 'Have a go at them',
  invite: 'Make plans', share: 'Share the drive', gift: 'Send them something', borrow: 'Ask to borrow money', payback: 'Ask for your money back',
  flirt: 'Flirt', date: 'Ask them out', commit: 'Make it official', movein: 'Ask them to move in', propose: 'Propose', split: 'End it', rumour: 'Spread a rumour',
  teamup: 'Ask them to team up', teamsplit: 'Split the team',
};

/** What you say. */
export const SAY: Record<BaseTopic, Record<Tone, string[]>> = {
  catchup: {
    warm: ['How are you doing, {them}? Feels like ages.', 'Thinking about you. How’s life treating you?'],
    plain: ['Alright? What’s new with you?', 'How’s things your end?'],
    cocky: ['Still alive, then? Thought you’d retired.', 'Not heard from you in a while. Missing me yet?'],
    blunt: ['You’ve gone quiet. Everything alright?', 'Not heard a word from you. What’s going on?'],
  },
  congrats: {
    warm: ['Congratulations, {them}. You earned every bit of that.', 'So proud of you. Properly deserved.'],
    plain: ['Congrats. Good work.', 'Well done on that. Fair play.'],
    cocky: ['Congrats. Don’t get used to it.', 'Nice one. Now try doing it against me.'],
    blunt: ['Took you long enough. Congrats, though.', 'About time. Well done.'],
  },
  console: {
    warm: ['Just heard. I’m so sorry. Anything you need, I’m here.', 'Thinking of you. Shout if you need anything at all.'],
    plain: ['Heard what happened. Hope you’re alright.', 'Rough one. You okay?'],
    cocky: ['Heard you’ve had a shocker. Chin up, it can only get better.', 'Look on the bright side: it can’t get worse. Probably.'],
    blunt: ['That’s shit luck. You’ll come back from it.', 'Bad break. Don’t let it get in your head.'],
  },
  advice: {
    warm: ['Can I pick your brain? I’d really value your take.', 'You’ve been around. What would you do in my shoes?'],
    plain: ['Got a minute? Want your opinion on my matches.', 'What am I doing wrong out there?'],
    cocky: ['Not that I need it, but what would you change about my work?', 'Go on then, tell me how you’d do it.'],
    blunt: ['Be honest. What’s holding me back?', 'Straight answer: what am I getting wrong?'],
  },
  gossip: {
    warm: ['What do you make of {who}? Genuinely asking.', 'How are you getting on with {who} these days?'],
    plain: ['What’s your read on {who}?', 'What’s the deal with {who}?'],
    cocky: ['{who}, though. What is that about?', 'Have you seen what {who}’s been up to? Go on, dish.'],
    blunt: ['Tell me straight: is {who} as bad as people say?', 'Is {who} trouble or what?'],
  },
  word: {
    warm: ['Would you mind putting a word in for me at {promo}? It’d mean a lot.', 'Any chance you could mention me to the people at {promo}?'],
    plain: ['Could you put a word in for me at {promo}?', 'If you get the chance, mention me to {promo}.'],
    cocky: ['{promo} could use someone like me. Tell them, would you?', 'Do {promo} a favour and tell them about me.'],
    blunt: ['I need a foot in at {promo}. Can you help or not?', 'Put a word in for me at {promo}. I’d do it for you.'],
  },
  sorry: {
    warm: ['I’m sorry. I got it wrong, and I want to put it right.', 'I’ve been thinking about how things went. I’m sorry.'],
    plain: ['Look, I’m sorry about what happened.', 'Sorry. I shouldn’t have done that.'],
    cocky: ['Alright, alright. I’m sorry. Happy now?', 'Fine, I was out of order. Sorry.'],
    blunt: ['I was wrong. I’m sorry. Can we move on?', 'Sorry. That’s it. No excuses.'],
  },
  goat: {
    warm: ['I’ve tried being nice about this. You’re making it really hard.', 'I like you, but you’re taking the piss.'],
    plain: ['We need to talk about how you’ve been with me.', 'I’ve had enough of your attitude.'],
    cocky: ['You’re the second-best thing on any card you’re on. On a good night.', 'Honestly? You’re a glorified extra.'],
    blunt: ['You’re a fucking liability and everyone knows it.', 'Stay out of my way, {them}.'],
  },
};

/** How they answer: topic, then how they took it. */
export const ANSWER: Record<BaseTopic, Partial<Record<Reaction, Bank>>> = {
  catchup: {
    good: {
      hot: ['Busy as hell, but good. You?', 'Can’t complain. Well, I can, but I won’t.'], cocky: ['Living the dream, obviously. You?', 'Better than you, I’d imagine. Kidding. Mostly.'],
      pro: ['Good, thanks. Training a lot. You?', 'All good here. Keeping busy.'], warm: ['Aw, good to hear from you! I’m doing great. How are YOU?', 'You’ve made my day. All good here, you?'],
      sly: ['Oh, you know me. Always something going on. You?', 'Interesting week. I’ll tell you sometime.'], plain: ['Not bad, cheers. You?', 'Good, thanks. Busy.'],
      fam: ['Lovely to hear from you, love. Are you eating properly?', 'We’re all fine here. Your nan keeps asking when you’re on telly.'],
    },
    meh: {
      hot: ['Fine.', 'Yeah. Busy.'], cocky: ['Hm? Oh. Fine.', 'Can’t really talk.'], pro: ['Fine, thanks.', 'All okay.'], warm: ['Busy week, sorry! Fine though.', 'Good, thanks x'],
      sly: ['Fine. Why?', 'Mm. Fine.'], plain: ['Alright.', 'Fine, ta.'], fam: ['All fine. Ring us when you can.'],
    },
    bad: {
      hot: ['What do you want?', 'Don’t text me.'], cocky: ['Who’s this?', 'Do I know you?'], pro: ['I’m busy.', 'Can this wait?'], warm: ['I’m not really in the mood, sorry.', 'Not now.'],
      sly: ['Funny you should ask.', 'Why the sudden interest?'], plain: ['Busy.', 'Not now.'], fam: ['Oh, so you do remember we exist.'],
    },
  },
  congrats: {
    good: {
      hot: ['Cheers. Took long enough, didn’t it?', 'Ta. Felt bloody good.'], cocky: ['Thanks. Was never in doubt, honestly.', 'Appreciate it. Get used to seeing me there.'],
      pro: ['Thanks. Hard work paid off.', 'Appreciate that. Means a lot coming from you.'], warm: ['Thank you!! Still can’t believe it.', 'Means so much, thank you x'],
      sly: ['Thanks. Some people weren’t so pleased.', 'Appreciated. I’ll remember who said it.'], plain: ['Cheers.', 'Thanks, appreciated.'], fam: ['We’re the ones who should be saying that to you!'],
    },
    bad: {
      hot: ['Don’t sound so surprised.', 'Bit late, aren’t you?'], cocky: ['Yeah, I know.', 'Course I did.'], pro: ['Thanks.', 'Noted.'], warm: ['Oh. Thanks, I suppose.'],
      sly: ['That’s not what you were saying last week.'], plain: ['Right. Thanks.'],
    },
  },
  console: {
    good: {
      hot: ['Cheers. It’s doing my head in, but I’ll be back.', 'Appreciate it. Fucking gutted.'], cocky: ['Thanks. Won’t keep me down long.', 'Kind of you. I’ll be back better.'],
      pro: ['Thanks. Taking it one day at a time.', 'Appreciate you checking in.'], warm: ['That really helps, thank you. Rough week.', 'You’re a good one. Thank you x'],
      sly: ['Thanks. You’re one of the few who asked.', 'I’ll remember that.'], plain: ['Thanks. I’ll be alright.', 'Cheers for asking.'], fam: ['We’re fine, love, don’t you worry about us.'],
    },
    bad: {
      hot: ['Save it.', 'I don’t need your pity.'], cocky: ['I’m fine. Worry about yourself.'], pro: ['I’m fine.'], warm: ['I’d rather not talk about it.'],
      sly: ['Checking I’m really down, are you?'], plain: ['I’m fine.'],
    },
  },
  advice: {
    good: {
      hot: ['Alright, listen.', 'Here’s the truth, and you won’t like it.'], cocky: ['Since you asked nicely.', 'Take notes.'], pro: ['Sure. Watched your last few back.', 'Since you asked:'],
      warm: ['Of course! Honestly?', 'Happy to help. Here’s what I’d do.'], sly: ['I’ll tell you, but you didn’t hear it from me.', 'Between us?'], plain: ['Here’s my take.', 'Alright.'],
      fam: ['I don’t know much about wrestling, love, but don’t let anyone push you around.'],
    },
    bad: {
      hot: ['Figure it out like I did.', 'Not my job.'], cocky: ['Why would I help the competition?'], pro: ['Ask your trainer.', 'I’m not the right person.'], warm: ['I don’t think I’m the one to ask, sorry.'],
      sly: ['What’s in it for me?'], plain: ['Can’t help, sorry.'],
    },
  },
  gossip: {
    bad: { hot: ['Not getting dragged into that.'], cocky: ['Why do you care?'], pro: ['Not getting into that.', 'Ask them yourself.'], warm: ['I don’t like talking about people behind their backs.'], sly: ['Wouldn’t you like to know.'], plain: ['No comment.'] },
  },
  word: {
    good: {
      hot: ['Leave it with me.', 'I’ll tell them. They’d be mad not to.'], cocky: ['I’ll mention you. My word carries weight.', 'Done. You owe me.'], pro: ['I’ll mention you to the right person.', 'Leave it with me.'],
      warm: ['Of course! I’ll talk you up.', 'Already on it x'], sly: ['I’ll put it in the right ear. Remember this.', 'Consider it done. Favours go both ways.'], plain: ['I’ll mention you.', 'Sure, I’ll say something.'],
    },
    bad: {
      hot: ['No chance.', 'I’ve got my own career to worry about.'], cocky: ['And have you take my spot? No.'], pro: ['Not my place, sorry.', 'I don’t do that.'], warm: ['I don’t think I can, sorry.'],
      sly: ['What would I get out of that?'], plain: ['Can’t, sorry.'],
    },
  },
  sorry: {
    good: {
      hot: ['…Fine. We’re good. Don’t do it again.', 'Alright. Water under the bridge.'], cocky: ['Apology accepted. I’m gracious like that.', 'Fine. Took you long enough.'],
      pro: ['Appreciated. Let’s move on.', 'Thanks for saying it. We’re fine.'], warm: ['Thank you for saying that. Means a lot x', 'Of course. Let’s put it behind us.'],
      sly: ['Accepted. For now.', 'We’ll see. But thanks.'], plain: ['Okay. We’re good.', 'Fair enough. Thanks.'], fam: ['Oh, love. You don’t need to apologise to us.'],
    },
    meh: { plain: ['For what?', 'Don’t worry about it.'], hot: ['Didn’t notice.'], warm: ['Don’t be silly, nothing to apologise for!'] },
    bad: {
      hot: ['Bit late for that.', 'Sorry doesn’t cut it.'], cocky: ['Sorry you got caught, you mean.'], pro: ['Words are cheap.', 'Show me, don’t tell me.'], warm: ['I need some time.'],
      sly: ['Sorry now you need something?'], plain: ['Not yet.'],
    },
  },
  goat: {
    good: { hot: ['Fair. I’ve been a dick.', 'Alright, alright. Point taken.'], pro: ['Fair point. I’ll sort it.'], warm: ['Oh no. I didn’t realise. Sorry.'], plain: ['Okay. Noted.'], cocky: ['Ha. Fair enough.'], sly: ['Noted.'] },
    meh: { hot: ['Whatever.'], cocky: ['Cute.', 'Did that make you feel better?'], pro: ['Noted.'], warm: ['That’s a bit much.'], sly: ['Interesting.'], plain: ['Right.'] },
    bad: {
      hot: ['Say that to my face. Go on.', 'You want a problem? You’ve got one.'], cocky: ['Says the one nobody’s heard of.', 'Bold, from you.'], pro: ['I’ll remember that.', 'We’re done talking.'],
      warm: ['Wow. Okay. Didn’t think you were like that.'], sly: ['That’s going to cost you.', 'Everyone will hear about this.'], plain: ['Right. Noted.', 'Fine. Be like that.'],
    },
  },
};

/** What they think of someone, when you ask (by how they feel about them). */
export const VIEW_OF: Record<'fond' | 'neutral' | 'cold', Bank> = {
  fond: {
    hot: ['{who}? Solid. Anyone has a go at them, they answer to me.'], cocky: ['{who}’s alright. Almost as good as me.'], pro: ['Good worker, {who}. Always on time.'],
    warm: ['Love {who}. One of the good ones.'], sly: ['{who} and I look out for each other. Remember that.'], plain: ['{who}’s sound.', 'Get on well with {who}.'],
  },
  neutral: {
    hot: ['{who}? Couldn’t care less.'], cocky: ['Who? Oh, {who}. Forgettable.'], pro: ['Don’t know {who} well. Seems fine.'], warm: ['Don’t really know {who}, to be honest.'],
    sly: ['{who}’s… fine. For now.'], plain: ['No strong feelings about {who}.'],
  },
  cold: {
    hot: ['{who} can go fuck themselves.', 'Don’t get me started on {who}.'], cocky: ['{who}? Massively overrated.'], pro: ['I’d rather not work with {who} again.'],
    warm: ['I try to see the best in people. With {who}, it’s hard.'], sly: ['Watch your back around {who}. That’s all I’ll say.'], plain: ['Not a fan of {who}.', 'Steer clear of {who}.'],
  },
};

/** What people send you unprompted. */
export const SENT: Record<'checkin' | 'title' | 'hurt' | 'signed' | 'advice' | 'dig', Bank> = {
  checkin: {
    hot: ['Still breathing? Haven’t heard from you.', 'Oi. You alright?'], cocky: ['Saw your last match. Not bad. For you.', 'Bored. Entertain me.'], pro: ['How’s training going?', 'Hope the road’s treating you okay.'],
    warm: ['Thinking of you! How’s things?', 'Just checking in. Miss you x'], sly: ['Heard anything interesting lately?', 'You’ll never guess what I’ve heard.'], plain: ['Alright? How’s it going?', 'How’s things?'],
    fam: ['Are you eating properly? Ring your mum.', 'Your nan’s been asking after you. Give her a call.', 'We watched your match! Well, the bits we could find online.'],
  },
  title: {
    hot: ['GOT IT. Fucking finally.'], cocky: ['Champion. Say it with me.'], pro: ['Won the title last night. Still sinking in.'], warm: ['I DID IT!!! I can’t believe it'],
    sly: ['Guess who’s holding gold?'], plain: ['Won the belt last night.'],
  },
  hurt: {
    hot: ['Out for weeks. Absolute bollocks.'], cocky: ['Doctor says I’m out. Doctors don’t know me.'], pro: ['Injured. Rehab starts Monday.'], warm: ['Bad news, I’m hurt. Gutted.'],
    sly: ['Well, that’s me out for a while. Funny how these things happen.'], plain: ['Injured. Out for a bit.'],
  },
  signed: {
    hot: ['Signed with {promo}. Watch me now.'], cocky: ['{promo} finally saw sense. Signed.'], pro: ['Just signed with {promo}. Wanted you to hear it from me.'], warm: ['I signed with {promo}!! Pinch me'],
    sly: ['Moving to {promo}. Keep it quiet a day or two.'], plain: ['Signed with {promo}.'],
  },
  advice: {
    hot: ['How do you handle a crowd that hates you? Mine’s doing my head in.'], cocky: ['Everyone says you know your stuff. Prove it: what am I missing?'], pro: ['Could I ask your advice on pacing? Mine’s off.'],
    warm: ['Hope this isn’t weird, but could I ask you for some advice?'], sly: ['Quick question, between us: how do you get the office on side?'], plain: ['Can I ask you something about my matches?'],
  },
  dig: {
    hot: ['Saw your match. Embarrassing.', 'Keep my name out of your mouth.'], cocky: ['Enjoy the opener spot.', 'Cute match. Did your mum book it?'], pro: ['You should hear what the office says about you.'],
    warm: ['I used to rate you. Not any more.'], sly: ['People are talking about you. Not nicely.', 'Careful who you trust back there.'], plain: ['Heard you’re struggling.', 'Not your night, was it.'],
  },
};

/** One line from a bank, in their voice (falling back to plain). */
export function pickLine(bank: Bank, v: PVoice, rnd: () => number, vars: Record<string, string> = {}): string {
  const xs = bank[v] ?? (v === 'fam' ? bank.warm : undefined) ?? bank.plain;
  const s = xs[Math.floor(rnd() * xs.length)]!;
  return s.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '');
}

// ------------------------------------------------------------------ plans (stage 3)

export type MeetKind = 'drinks' | 'meal' | 'night' | 'gym' | 'spots' | 'visit' | 'date' | 'wedding';
export const MEET_LABEL: Record<MeetKind, string> = { drinks: 'Drinks', meal: 'A meal', night: 'A night out', gym: 'The gym together', spots: 'Running spots', visit: 'Going round theirs', date: 'A date', wedding: 'A wedding' };

/** You asking. */
export const ASK: Record<MeetKind, string[]> = {
  drinks: ['Fancy a drink {when}?', 'Pint {when}? My shout if you’re quick.'],
  meal: ['Food {when}? I know a place.', 'Let’s get something to eat {when}.'],
  night: ['Night out {when}. You in?', 'We’re going out {when}. Properly. You coming?'],
  gym: ['Gym {when}? I need someone to push me.', 'Training {when}? Could use a partner.'],
  spots: ['Want to run some spots {when}? Ring’s free.', 'Ring time {when}? Let’s work some stuff.'],
  visit: ['Can I come round {when}?', 'I’ll pop round {when} if that’s alright.'],
  date: ['Dinner {when}? Just us.', 'Let me take you out {when}.'],
  wedding: ['See you at the wedding {when}.'],
};
/** Them answering an invitation. */
export const INVITE_ANSWER: Record<'yes' | 'no' | 'busy', Bank> = {
  yes: {
    hot: ['Go on then.', 'Yeah, alright. Don’t be late.'], cocky: ['If you insist.', 'Obviously. I’m great company.'], pro: ['Sounds good. See you then.', 'Works for me.'],
    warm: ['Yes!! Can’t wait x', 'Love that. See you then.'], sly: ['Why not. We should talk anyway.', 'Sure. I’ve got things to tell you.'], plain: ['Yeah, go on.', 'Sounds good.'],
    fam: ['Oh lovely! I’ll get the good biscuits in.', 'Course, love. We’ll be in.'],
  },
  no: {
    hot: ['Nah.', 'Not with you.'], cocky: ['I’m busy. Indefinitely.', 'Tempting. No.'], pro: ['Can’t, sorry. Another time maybe.', 'I’ll pass this time.'], warm: ['Aw, I can’t, sorry! Soon though?', 'Not this time, sorry x'],
    sly: ['Hm. Not this week.', 'Let me think about it. (No.)'], plain: ['Can’t, sorry.', 'Not this time.'], fam: ['Oh, we’re out that day, love. Another time?'],
  },
  busy: { plain: ['Can’t, I’m in {where} that day.', 'I’m away then. {where}.'], hot: ['I’m in {where}. Another time.'], warm: ['I’m in {where} then, sorry! Another time?'] },
};
/** After a good time. */
export const AFTER: Record<MeetKind, Bank> = {
  drinks: { plain: ['Good shout, that. Same again soon.'], hot: ['Head’s banging. Worth it.'], warm: ['Loved that. Thank you x'], cocky: ['You owe me a pint now. Them’s the rules.'], pro: ['Good to catch up properly.'], sly: ['Interesting chat. Very interesting.'], fam: ['Lovely to see you, love.'] },
  meal: { plain: ['Cracking food. Good to catch up.'], warm: ['That was so nice. Let’s do it again soon x'], hot: ['Best thing I’ve eaten in weeks.'], cocky: ['Next time I’ll pick somewhere decent.'], pro: ['Good food, good company.'], sly: ['We should do that more often.'], fam: ['You look thin, love. Come back soon.'] },
  night: { plain: ['What a night.', 'Never again. Until next week.'], hot: ['Can’t remember half of it. Brilliant.'], warm: ['Best night in ages!! x'], cocky: ['Legendary. Obviously.'], pro: ['Fun. Training’s going to hurt tomorrow.'], sly: ['I saw what you did. Your secret’s safe. For now.'] },
  gym: { plain: ['Good session.', 'Felt that. Same time next week?'], hot: ['Pushed you hard. You’ll thank me.'], warm: ['Great session! Proud of you x'], cocky: ['You kept up. Mostly.'], pro: ['Solid work today.'], sly: ['You’ve got a weakness on your left side. Just saying.'] },
  spots: { plain: ['That last sequence is money.', 'Good work. That’s going on telly.'], hot: ['Hit me harder next time.'], warm: ['That was so fun! We work well together.'], cocky: ['I made you look good. You’re welcome.'], pro: ['Tight. Let’s keep it.'], sly: ['Keep that finish to yourselves.'] },
  visit: { plain: ['Good to see you.'], warm: ['Come round any time x'], fam: ['House feels empty now you’ve gone. Ring us.'], hot: ['Don’t leave it so long next time.'], cocky: ['You can come again. Maybe.'], pro: ['Thanks for coming over.'], sly: ['Nice to have a proper talk.'] },
  date: { plain: ['Had a really good time tonight.', 'Same again soon?'], warm: ['Tonight was perfect x', 'Can’t stop smiling x'], hot: ['That was a lot better than I expected. In a good way.'], cocky: ['You’re lucky I’m so charming.'], pro: ['I really enjoyed tonight.'], sly: ['I think that went rather well, don’t you?'] },
  wedding: { plain: ['Thank you for being there. Means the world.'], warm: ['Best day of my life, and you were there x'], hot: ['Bloody brilliant day. Cheers for coming.'], cocky: ['Best wedding you’ll ever go to. Admit it.'], pro: ['Thank you for coming. It meant a lot.'], sly: ['Glad you came. Saw you dancing.'] },
};

// ------------------------------------------------------------------ romance (stage 4; it fades to black)

/** What you say. */
export const LOVE_SAY: Record<'flirt' | 'date' | 'commit' | 'movein' | 'propose' | 'split', Record<Tone, string[]>> = {
  flirt: {
    warm: ['You looked really good tonight. Just saying.', 'I always look forward to seeing you, you know.'],
    plain: ['Has anyone told you you’ve got a great smile?', 'You’re good company. Really good company.'],
    cocky: ['Not going to lie, you’re the best-looking person in that locker room. After me.', 'Admit it: you’ve been thinking about me.'],
    blunt: ['I fancy you. There. Said it.', 'I like you. Like, like you.'],
  },
  date: {
    warm: ['Would you let me take you out to dinner? A proper date.', 'I’d love to take you out. Just the two of us.'],
    plain: ['Do you want to go on a date with me?', 'Dinner? As a date.'],
    cocky: ['You, me, dinner. I’m a catch, you know.', 'Let me take you out. You won’t regret it.'],
    blunt: ['I want to take you on a date. Yes or no?', 'Go out with me.'],
  },
  commit: {
    warm: ['I don’t want to see anyone else. Do you want to make this official?', 'I think I’m falling for you. Be mine?'],
    plain: ['Are we a couple, then? I’d like us to be.', 'Shall we make it official?'],
    cocky: ['You’d be mad to let me get away. Official?', 'Let’s tell everyone. Officially.'],
    blunt: ['I want us to be together. Properly.', 'Are we doing this or not?'],
  },
  movein: {
    warm: ['I hate saying goodbye every night. Move in with me?', 'What if we got a place together?'],
    plain: ['Do you want to move in together?', 'Let’s get a place.'],
    cocky: ['Half your stuff’s at mine anyway. Make it official.', 'You’re here every night. Might as well pay rent.'],
    blunt: ['Move in with me.', 'I want to live with you.'],
  },
  propose: {
    warm: ['I want to spend the rest of my life with you. Will you marry me?'],
    plain: ['Will you marry me?'],
    cocky: ['I’ve decided you’re stuck with me. Marry me?'],
    blunt: ['Marry me.'],
  },
  split: {
    warm: ['I care about you, but this isn’t working. I think we should end it.'],
    plain: ['I think we should break up.'],
    cocky: ['It’s not me, it’s you. We’re done.'],
    blunt: ['It’s over.'],
  },
};
/** How they answer (yes or no). */
export const LOVE_ANSWER: Record<'flirt' | 'date' | 'commit' | 'movein' | 'propose', Record<'yes' | 'no', Bank>> = {
  flirt: {
    yes: { plain: ['Ha. You’re not so bad yourself.', 'Stop it. (Don’t stop it.)'], warm: ['You’re making me blush x', 'I was hoping you’d say something like that x'], hot: ['Took you long enough.'], cocky: ['I know. But it’s nice to hear.'], pro: ['Well. That’s a nice thing to hear.'], sly: ['Careful. I might take you seriously.'] },
    no: { plain: ['Ha. I’m flattered, but no.', 'That’s sweet. But no.'], warm: ['Aw, that’s kind. I don’t see you like that though.'], hot: ['Not happening.'], cocky: ['Everyone does. Get in the queue.'], pro: ['Let’s keep it professional.'], sly: ['Nice try.'] },
  },
  date: {
    yes: { plain: ['I’d like that.', 'Yes. Definitely yes.'], warm: ['Yes!! I’ve been hoping you’d ask x'], hot: ['About bloody time. Yes.'], cocky: ['Go on then. You’re paying.'], pro: ['I’d like that very much.'], sly: ['I thought you’d never ask.'] },
    no: { plain: ['I don’t think that’s a good idea.', 'Sorry. I don’t feel that way.'], warm: ['I’m so sorry, I just don’t feel that way x'], hot: ['No. Sorry.'], cocky: ['Out of your league, love.'], pro: ['I’d rather not, sorry.'], sly: ['I’m spoken for. Or I might as well be.'] },
  },
  commit: {
    yes: { plain: ['Yes. Officially.'], warm: ['YES. I’m so happy x'], hot: ['Course. Anyone else comes near you, they’re dead.'], cocky: ['Obviously.'], pro: ['I’d love that.'], sly: ['I was wondering when you’d ask.'] },
    no: { plain: ['I’m not ready for that.'], warm: ['Can we keep it like this for now? x'], hot: ['Slow down.'], cocky: ['Let’s not get carried away.'], pro: ['Not yet. Give it time.'], sly: ['Let’s see how things go.'] },
  },
  movein: {
    yes: { plain: ['Let’s do it.'], warm: ['Our own place!! Yes x'], hot: ['Finally. Your flat’s a tip though.'], cocky: ['I’ll bring the good furniture.'], pro: ['Yes. Let’s sort the details.'], sly: ['I’ve already looked at a few places.'] },
    no: { plain: ['Not yet. I like my own space.'], warm: ['I love you, but not yet x'], hot: ['Too soon.'], cocky: ['And give up my place? No.'], pro: ['Let’s wait a bit.'], sly: ['One step at a time.'] },
  },
  propose: {
    yes: { plain: ['Yes. Yes, yes, yes.'], warm: ['YES! Oh my god, yes x'], hot: ['Yes, you idiot. Yes.'], cocky: ['Knew you would. Yes.'], pro: ['Yes. Absolutely yes.'], sly: ['Took you long enough. Yes.'] },
    no: { plain: ['I… I can’t. I’m sorry.'], warm: ['I love you, but I’m not ready. I’m so sorry.'], hot: ['No. Not like this.'], cocky: ['That’s a no. Sorry.'], pro: ['I need more time.'], sly: ['Let’s talk about this properly.'] },
  },
};
/** What they send you. */
export const LOVE_SENT: Record<'flirt' | 'ask' | 'miss' | 'talk' | 'dump' | 'found', Bank> = {
  flirt: { plain: ['Can’t stop thinking about our last chat.', 'You were looking good on the show last night.'], warm: ['Is it weird that I miss you already? x'], hot: ['You. Me. Sometime.'], cocky: ['Bet you’re thinking about me right now.'], pro: ['I really enjoy spending time with you.'], sly: ['I have a confession to make. Another time.'] },
  ask: { plain: ['Would you go out with me? Properly.'], warm: ['I really like you. Dinner sometime? x'], hot: ['I’m taking you out. When are you free?'], cocky: ['I’m going to take you on the best date of your life.'], pro: ['I’d like to take you to dinner, if you’d like that.'], sly: ['How about dinner. Just us.'] },
  miss: { plain: ['Miss you.', 'Can’t wait to see you.'], warm: ['Missing you loads x', 'Counting the days x'], hot: ['When are you back? Hate this.'], cocky: ['You’re lucky I’m so patient.'], pro: ['Thinking of you. Good luck tonight.'], sly: ['Come home soon.'] },
  talk: { plain: ['We need to talk.', 'I feel like I never see you any more.'], warm: ['Are we okay? I feel like we’re drifting x'], hot: ['You’re never here. What is this?'], cocky: ['Do you even remember what I look like?'], pro: ['I think we need to talk about us.'], sly: ['Is there something you’re not telling me?'] },
  dump: { plain: ['I’m sorry. I think we should end it.'], warm: ['I don’t want to do this, but I think it’s over. I’m sorry x'], hot: ['We’re done.'], cocky: ['I’m ending this. You’ll get over it.'], pro: ['I’ve thought about this a lot. It’s over.'], sly: ['I think we both knew this was coming.'] },
  found: { plain: ['I know about them. How could you?'], warm: ['I trusted you. How could you do this to me?'], hot: ['You lying, cheating piece of shit.'], cocky: ['Seriously? Them? Over me?'], pro: ['I know what you did. Don’t contact me.'], sly: ['Did you really think I wouldn’t find out?'] },
};
/** Family news. */
export const FAMILY_SENT: Record<'ill' | 'died' | 'baby', Bank> = {
  ill: { plain: ['Bit of bad news, love. They’re keeping your {rel} in hospital for a bit.'], fam: ['Don’t panic, but your {rel}’s not well. They’re in hospital. Come and see them when you can.'] },
  died: { plain: ['I’m so sorry, love. Your {rel} passed away last night.'], fam: ['I don’t know how to say this. Your {rel} passed away last night. Ring me.'] },
  baby: { plain: ['It’s a {kid}! Mum and baby doing well.'], warm: ['WE HAD A {KID}!!! Come and meet them x'] },
};

/** Pulling out on the day. */
export const FLAKE: Bank = {
  plain: ['Sorry, something’s come up. Can’t make it.', 'Gutted, I can’t today. Rain check?'], hot: ['Can’t today. Don’t ask.'], cocky: ['Something better came up. Kidding. Sort of. Can’t make it.'],
  pro: ['Apologies, I have to cancel today.'], warm: ['I’m so sorry, I can’t make it today x'], sly: ['Can’t today. Tell you why another time.'], fam: ['Your dad’s not well, love, can we do another day?'],
};
/** Asked over the phone for something else. */
export const ASKED: Record<'gift_thanks' | 'borrow_yes' | 'borrow_no' | 'pay_yes' | 'pay_no' | 'share' | 'lend' | 'birthday', Bank> = {
  gift_thanks: { plain: ['You didn’t have to do that. Thank you.'], warm: ['Oh my god, thank you!! x'], hot: ['Ha. Cheers, that’s sound.'], cocky: ['Finally, someone who appreciates me.'], pro: ['Very kind. Thank you.'], sly: ['How thoughtful. What do you want?'], fam: ['Oh, you shouldn’t have, love! Thank you x'] },
  borrow_yes: { plain: ['Course. Pay me back when you can.'], warm: ['Of course! Don’t worry about it x'], hot: ['Fine. Don’t make me chase you.'], cocky: ['I’ll add it to the list of things you owe me.'], pro: ['Sure. Let’s say from your next few fees.'], sly: ['Happy to help. I’ll remember it.'], fam: ['Course we can, love. Just don’t tell your dad.'] },
  borrow_no: { plain: ['Can’t, sorry. Skint myself.'], warm: ['I wish I could, sorry x'], hot: ['No chance.'], cocky: ['Do I look like a bank?'], pro: ['I don’t lend money. Sorry.'], sly: ['Money ruins friendships. No.'], fam: ['We’re a bit stretched ourselves, love.'] },
  pay_yes: { plain: ['Sorry, should’ve done it sooner. Sent.'], warm: ['So sorry! Sending it now x'], hot: ['Alright, alright. Sent.'], cocky: ['Fine. Don’t spend it all at once.'], pro: ['Of course. Done.'], sly: ['There. We’re square.'] },
  pay_no: { plain: ['Bit tight at the minute. Soon, promise.'], warm: ['I know, I’m so sorry, next week? x'], hot: ['You’ll get it. Stop asking.'], cocky: ['What money?'], pro: ['I’ll sort it at the end of the month.'], sly: ['I thought that was a gift?'] },
  share: { plain: ['We’re both on {show}. Share a car? Halves on petrol.'], warm: ['Road trip to {show}?? Let’s share a car x'], hot: ['You driving to {show}? I’ll come with. Halves.'], cocky: ['I’ll let you drive me to {show}. Halves on fuel.'], pro: ['Want to share the drive to {show}? Saves us both.'], sly: ['Share a car to {show}? We can talk on the way.'] },
  lend: { plain: ['Bit awkward, but could you lend me {amount}? I’ll pay you back.'], warm: ['I hate asking, but could you lend me {amount}? x'], hot: ['Skint. Can you lend me {amount}? I’m good for it.'], cocky: ['Short-term liquidity issue. {amount}?'], pro: ['Could you lend me {amount} until my next fees come in?'], sly: ['Need a favour. {amount}. Between us.'] },
  birthday: { plain: ['It’s {them}’s birthday {when}.'] },
};
