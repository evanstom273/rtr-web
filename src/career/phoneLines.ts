// The phone's words (Lyra's call: grown-up and sweary where it fits; romance fades to black, and isn't here yet).
// What you say (each topic in four tones), how they answer (by their voice, and how they took it), and what people
// send you unprompted. Family have their own voice. {them} is their first name, {who} someone you both know,
// {promo} a promotion, {you} your name.
import type { Voice } from './voice';

export type Tone = 'warm' | 'plain' | 'cocky' | 'blunt';
export type Topic = 'catchup' | 'congrats' | 'console' | 'advice' | 'gossip' | 'word' | 'sorry' | 'goat';
export type Reaction = 'good' | 'meh' | 'bad';
/** Voices on the phone: everyone's from voice.ts, plus family. */
export type PVoice = Voice | 'fam';
type Bank = Partial<Record<PVoice, string[]>> & { plain: string[] };

export const TONE_LABEL: Record<Tone, string> = { warm: 'Warm', plain: 'Straight', cocky: 'Cheeky', blunt: 'Blunt' };
export const TOPIC_LABEL: Record<Topic, string> = {
  catchup: 'Catch up', congrats: 'Congratulate them', console: 'Check they’re alright', advice: 'Ask their advice', gossip: 'Ask about someone',
  word: 'Ask them to put a word in', sorry: 'Apologise', goat: 'Have a go at them',
};

/** What you say. */
export const SAY: Record<Topic, Record<Tone, string[]>> = {
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
export const ANSWER: Record<Topic, Partial<Record<Reaction, Bank>>> = {
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
