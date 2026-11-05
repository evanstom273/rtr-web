// Mail (Lyra's calls). A match result is a proper letter: the report card, your booker's verdict in their own
// voice, what it did for you, and what people said online. Wrestlers write (opponents, friends, rivals, mentors),
// your booker checks in every Monday, a digest of everything everywhere comes every Monday, and the press asks
// for interviews. You can reply to almost anything: replies move relationships, your personality, your fans and
// reputation, and your bookers' patience. Ignoring a rival or a friend sometimes costs you. A year is kept.
import { FAN_REGIONS, fansIn, fansTotal, findWrestler, fmtFans, PROMOTIONS, TITLES, type TraitId, worksFor } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import { activeWorld } from '../world/world';
import { bondsOf, bookerOf, kindOf, likeOf, type Bond } from '../world/people';
import { letter, person, promoName, setCareerHooks, type MailBefore } from './career';
import { addDays, daysBetween, fmtDay, weekday } from './dates';
import { leanTo } from './leans';
import { movePatience, patienceOf, showBooker } from './patience';
import { REGION_LABEL } from './places';
import { moveRelation, relLabel } from './relations';
import { noteCallout, publicSay, reach } from './social';
import {
  DIGEST_LINES, FEATURES, MAIL_BACKFIRE, MAIL_FRIEND_BOND, MAIL_FRIEND_STARS, MAIL_IGNORE_DAYS, MAIL_IGNORE_FRIEND, MAIL_IGNORE_RIVAL_FANS,
  MAIL_IGNORE_RIVAL_REP, MAIL_KEEP_DAYS, MAIL_MAX, MAIL_OPP_CHANCE, MAIL_PATIENCE, MAIL_POSTS, MAIL_PRESS_CHANCE, MAIL_PRESS_FANS, MAIL_PRESS_GAP,
  MAIL_PUBLIC, MAIL_REL,
} from './tuning';
import type { Bout, Career, Letter, MailReply, MatchReport, PlayerMatch, Show } from './types';
import { FAN_POSTS, fanHandle, fill, line, TIPS, voiceOf } from './voice';
import { archivedLabel, archivedName, archivedPeople, archivedSideOf, archivedWinner, archivedWon, type ArchivedBout } from '../world/history';
/** The winning side's lead (or the first lead, for a draw). */
const archivedLead = (b: ArchivedBout): string => { const i = archivedWon(b); return i < 0 ? b.a : b.sides?.[i]?.[0] ?? (i === 1 ? b.b : b.a); };

const P = () => activeWorld().people;
/** How the other one in a bond with you feels about you. */
const theirLike = (x: { other: string; bond: Bond }) => (x.bond.a === x.other ? x.bond.la : x.bond.lb);
const nameOf = (id: string | undefined): string => (id ? findWrestler(id)?.name ?? P()?.staff[id]?.name ?? id : '');
const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const stars = (s: number) => `${Number.isInteger(s) ? s : s.toFixed(2).replace(/0$/, '')}★`;

// ------------------------------------------------------------------ tabs

export type MailTab = 'needs' | 'results' | 'people' | 'news' | 'phone';
export const MAIL_TABS: { id: MailTab; label: string }[] = [
  { id: 'needs', label: 'Needs you' }, { id: 'results', label: 'Results' }, { id: 'people', label: 'People' }, { id: 'news', label: 'News' },
];
/** Waiting on you: an open decision, or a letter you'll pay for ignoring. */
export const waitingOnYou = (l: Letter): boolean => (!!l.action && !l.done) || (!!l.ignore && !l.replied && !l.done && l.ignore.kind !== 'press');
/**
 * The phone (Lyra's relationships redesign): anything from a person (a note, a call-out, someone backstage) lives in
 * your thread with them, not the mail. Mail keeps results, bookers, the press, offers and the digest.
 */
export const isPhoneLetter = (l: Letter): boolean => FEATURES.phone && !!l.fromId && (l.kind === 'person' || l.kind === 'event');
export function tabOf(l: Letter): MailTab {
  if (isPhoneLetter(l)) return 'phone';
  if (waitingOnYou(l)) return 'needs';
  if (l.kind === 'result') return 'results';
  if (l.kind === 'person' || l.kind === 'booker' || l.kind === 'press' || l.kind === 'offer' || l.kind === 'contract' || l.kind === 'event') return 'people';
  return 'news';
}

// ------------------------------------------------------------------ the match result

type Before = MailBefore;
/** Take stock just before your match is settled. */
export function before(c: Career, show: Show, opp: string): Before {
  const me = findWrestler(c.player)!;
  return { fans: { ...me.fans }, rep: person(c, c.player).rep, patience: patienceOf(c, showBooker(show)), bond: P() ? likeOf(P()!, opp, c.player) : 0, label: relLabel(c, opp) };
}

/** The result letter, after everything the match changed has changed. */
export function resultLetter(c: Career, show: Show, bout: Bout, m: PlayerMatch, out: { report?: { label: string; verdict: string; recap: string; grades: MatchReport['grades'] }; stars: number }, b: Before, paid: number, travel: number): void {
  const rnd = seededRng(hashSeed(c.seed, 'mail', show.id));
  const me = findWrestler(c.player)!, opp = findWrestler(m.opp)!;
  const key = showBooker(show);
  const bookerId = show.promo === 'TIS' ? (P()?.staff[key] ? key : undefined) : P() ? bookerOf(P()!, show.promo)?.id : undefined;
  const bv = voiceOf(bookerId);
  const sit = m.planned === 'off-script' ? 'bk_offscript' : m.planned === 'botched' ? 'bk_botched' : m.planned === 'upset' ? 'bk_upset' : m.stars >= 3.5 ? 'bk_good' : m.stars < 2.25 ? 'bk_poor' : 'bk_ok';
  const bookerLines = [line(bv, sit, rnd, { you: me.name })];
  if (m.planned === 'kept' && sit !== 'bk_poor') bookerLines.push(line(bv, 'bk_good', rnd));

  // What it did.
  const gains = FAN_REGIONS.map((r) => [r, fansIn(me, r) - (b.fans[r] ?? 0)] as const).filter(([, d]) => d !== 0).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const total = gains.reduce((t, [, d]) => t + d, 0);
  const sign = (n: number) => `${n >= 0 ? '+' : '−'}${fmtFans(Math.abs(n))}`;
  const pNow = patienceOf(c, key);
  const form = (person(c, c.player).recent ?? []).map((x) => (x ? 'W' : 'L')).join(' ');
  const effects: [string, string][] = [
    ['Paid', `£${paid.toLocaleString('en-GB')}${travel ? ` (travel £${travel.toLocaleString('en-GB')})` : ''}`],
    ['Fans', `${sign(total)} worldwide${gains.length ? ` · ${gains.slice(0, 3).map(([r, d]) => `${sign(d)} ${REGION_LABEL[r]}`).join(', ')}` : ''}`],
    ['Reputation', `${Math.round(b.rep)} → ${Math.round(person(c, c.player).rep)}`],
    ...(form ? [['Form', form] as [string, string]] : []),
    [opp.name, `${b.label}${relLabel(c, opp.id) !== b.label ? ` → ${relLabel(c, opp.id)}` : ''}`],
    ...(Math.round(pNow) !== Math.round(b.patience) ? [[`${show.promo === 'TIS' ? 'Promoter' : 'Booker'}’s patience`, `${Math.round(b.patience)} → ${Math.round(pNow)}`] as [string, string]] : []),
    ...(m.wonTitle ? [['Title', `Champion: ${TITLES.find((t) => t.id === m.title)?.name}`] as [string, string]] : m.title ? [['Title', m.result === 'win' ? 'Defended' : 'Not this time']] as [string, string][] : []),
  ];

  // The reaction online: more people talking about a better match.
  const n = Math.max(MAIL_POSTS[0], Math.min(MAIL_POSTS[1], Math.round(MAIL_POSTS[0] + ((m.stars - 2) / 2.5) * (MAIL_POSTS[1] - MAIL_POSTS[0]))));
  const winner = m.result === 'win' ? me.name : m.result === 'loss' ? opp.name : '';
  const vars = { you: me.name, opp: opp.name, show: show.name, city: show.city, stars: stars(m.stars), winner, title: TITLES.find((t) => t.id === m.title)?.name ?? '' };
  const bank = m.stars >= 4 ? FAN_POSTS.great : m.stars >= 3 ? FAN_POSTS.good : m.stars >= 2 ? FAN_POSTS.meh : FAN_POSTS.poor;
  const posts: MatchReport['posts'] = [];
  if (m.wonTitle || (m.title && m.result === 'loss' && bout.result?.newChamp)) posts.push({ who: fanHandle(rnd), text: fill(pick(rnd, FAN_POSTS.title), vars) });
  if (m.planned === 'upset' || m.planned === 'off-script') posts.push({ who: fanHandle(rnd), text: pick(rnd, FAN_POSTS.upset) });
  if (m.stars >= 3.5 || rnd() < 0.5) posts.push({ who: opp.name, id: opp.id, text: line(voiceOf(opp.id), 'post_after', rnd, vars) });
  const friend = P() ? bondsOf(P()!, c.player).filter((x) => theirLike(x) >= MAIL_FRIEND_BOND && x.other !== opp.id && findWrestler(x.other)).sort((x, y) => theirLike(y) - theirLike(x))[0] : undefined;
  if (friend && m.stars >= 3) posts.push({ who: nameOf(friend.other), id: friend.other, text: line(voiceOf(friend.other), 'friend_great', rnd, vars) });
  const used = new Set<string>();
  while (posts.length < n) {
    const t = pick(rnd, bank);
    if (used.has(t) && used.size < bank.length) continue;
    used.add(t);
    posts.push({ who: fanHandle(rnd), text: fill(t, vars) });
  }

  const outcome = m.result === 'win' ? 'You beat' : m.result === 'loss' ? 'You lost to' : 'A draw with';
  const report: MatchReport = {
    stars: m.stars, label: out.report?.label ?? '', verdict: out.report?.verdict ?? '', recap: out.report?.recap ?? '',
    grades: out.report?.grades ?? [], booker: { who: nameOf(bookerId) || (show.promo === 'TIS' ? 'The promoter' : `${show.promo} booker`), lines: bookerLines },
    effects, posts: posts.slice(0, MAIL_POSTS[1]),
  };
  letter(c, {
    kind: 'result', from: show.name, subject: `${outcome} ${opp.name}`,
    body: [`${stars(m.stars)}${m.move ? ` · ${m.move}` : ''} · ${Math.floor(m.t / 60)}:${String(Math.floor(m.t % 60)).padStart(2, '0')} · ${show.city}.`],
    report, fromId: bookerId ?? '', ctx: { booker: key, who: opp.id, show: show.id },
    replies: [
      { id: 'thank_bk', label: `Thank ${nameOf(bookerId) || 'them'} for the spot`, detail: 'Patience up · professional' },
      { id: 'bigger', label: 'Ask for a bigger spot', detail: 'Patience down · ambitious' },
      ...(m.result !== 'win' ? [{ id: 'rematch', label: `Ask for ${opp.name} again`, detail: 'Easier to get the match · patience down a little' }] : []),
    ],
  });
}

/** After your match: maybe a word from your opponent, and from a friend if it was big. */
export function afterMatchMail(c: Career, show: Show, m: PlayerMatch): void {
  if (!FEATURES.mail) return;
  const rnd = seededRng(hashSeed(c.seed, 'mail-people', show.id));
  const me = findWrestler(c.player)!, opp = findWrestler(m.opp);
  if (opp && rnd() < MAIL_OPP_CHANCE) {
    const v = voiceOf(opp.id);
    const body = [line(v, m.result === 'loss' ? 'opp_won' : 'opp_lost', rnd, { you: me.name })];
    if (m.stars >= 4) body.push(line(v, 'opp_great', rnd));
    letter(c, { kind: 'person', from: opp.name, fromId: opp.id, subject: m.result === 'loss' ? 'About last night' : 'That match', body, ctx: { who: opp.id }, replies: personReplies(opp.name) });
  }
  if (m.wonTitle || m.stars >= MAIL_FRIEND_STARS) {
    const f = P() ? bondsOf(P()!, c.player).filter((x) => theirLike(x) >= MAIL_FRIEND_BOND && x.other !== m.opp && findWrestler(x.other)).sort((x, y) => theirLike(y) - theirLike(x))[0] : undefined;
    if (f) {
      letter(c, {
        kind: 'person', from: nameOf(f.other), fromId: f.other, subject: m.wonTitle ? 'CHAMPION' : 'Your match', body: [line(voiceOf(f.other), m.wonTitle ? 'friend_title' : 'friend_great', rnd, { you: me.name })],
        ctx: { who: f.other }, replies: friendReplies(), ignore: { by: addDays(c.today, MAIL_IGNORE_DAYS.friend), kind: 'friend' },
      });
    }
  }
}

/** Someone's called you out (online, or by letter): answer it, or they'll say you're scared. */
export function calledOut(c: Career, who: string, said?: string): void {
  const rnd = seededRng(hashSeed(c.seed, 'callout', who, c.today));
  const w = findWrestler(who);
  if (!w) return;
  letter(c, {
    kind: 'person', from: w.name, fromId: who, subject: 'You’re being called out', body: [said ?? line(voiceOf(who), 'rival_callout', rnd), 'Everyone can see it.'],
    ctx: { who }, ignore: { by: addDays(c.today, MAIL_IGNORE_DAYS.rival), kind: 'rival' },
    replies: [
      { id: 'accept', label: 'Accept: name the night', detail: 'Public · easier to get the match · can backfire' },
      { id: 'laugh', label: 'Laugh it off', detail: 'Public · cocky · can backfire' },
      { id: 'high', label: 'Take the high road', detail: 'Public · a few fans · professional' },
    ],
  });
}

const personReplies = (name: string): MailReply[] => [
  { id: 'gracious', label: 'Gracious', detail: `${name} warms to you · professional` },
  { id: 'cocky', label: 'Cocky', detail: `${name} cools on you · egotistical` },
  { id: 'fire', label: 'Fire back', detail: `Makes it personal · hot-headed · easier to get the match` },
];
const friendReplies = (): MailReply[] => [
  { id: 'thanks', label: 'Thank them', detail: 'Closer · loyal' },
  { id: 'brag', label: 'Brag a bit', detail: 'Still friends · showboat' },
  { id: 'short', label: 'Keep it short', detail: 'Cools a little' },
];

// ------------------------------------------------------------------ replies

type Effect = (c: Career, l: Letter) => string;
const rel = (c: Career, id: string | undefined, d: number, why: string, kind?: 'rival') => { if (id) moveRelation(c, id, d, why, kind); };
const say = (c: Career, l: Letter, kind: keyof typeof MAIL_PUBLIC): string => {
  const r = publicSay(c, MAIL_PUBLIC[kind], MAIL_BACKFIRE[kind], `${l.id}-${kind}`);
  return r.backfired ? `It backfired: ${fmtFans(-r.fans)} fans lost, and a little reputation.` : r.fans ? `+${fmtFans(r.fans)} fans.` : 'Nobody much noticed.';
};
const lean = (c: Career, t: TraitId, n: number) => leanTo(c, t, n);
const EFFECTS: Record<string, Effect> = {
  gracious: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.warm, 'A gracious note'); lean(c, 'professional', 2); return 'They’ll remember that.'; },
  cocky: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.cocky, 'A cocky reply'); lean(c, 'egotistical', 3); return 'They didn’t love that.'; },
  fire: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.hot, 'You fired back', 'rival'); lean(c, 'hot_headed', 4); if (l.ctx?.who) noteCallout(c, l.ctx.who); return 'It’s personal now.'; },
  thanks: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.warm, 'You thanked them'); lean(c, 'loyal', 2); return 'Closer than ever.'; },
  brag: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.respect, 'You bragged a bit'); lean(c, 'showboat', 2); return 'They laughed. Mostly.'; },
  short: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.cold, 'A short reply'); return 'Noted.'; },
  accept: (c, l) => { if (l.ctx?.who) noteCallout(c, l.ctx.who); rel(c, l.ctx?.who, -2, 'You accepted their challenge', 'rival'); lean(c, 'ambitious', 2); return `On. ${say(c, l, 'cocky')}`; },
  laugh: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.cocky, 'You laughed them off'); lean(c, 'showboat', 3); return say(c, l, 'cocky'); },
  high: (c, l) => { rel(c, l.ctx?.who, MAIL_REL.respect, 'You took the high road'); lean(c, 'professional', 3); return say(c, l, 'humble'); },
  understood: (c, l) => { movePatience(c, l.ctx?.booker ?? '', MAIL_PATIENCE.thanks, 'Took the notes'); lean(c, 'professional', 2); return 'Patience up.'; },
  more: (c, l) => { movePatience(c, l.ctx?.booker ?? '', MAIL_PATIENCE.push, 'Pushed for more'); lean(c, 'ambitious', 3); return 'They’ve heard you. Patience down.'; },
  complain: (c, l) => { movePatience(c, l.ctx?.booker ?? '', MAIL_PATIENCE.complain, 'Complained'); lean(c, 'rebellious', 4); return 'That went down badly.'; },
  thank_bk: (c, l) => { movePatience(c, l.ctx?.booker ?? '', MAIL_PATIENCE.thanks, 'Thanked them for the spot'); lean(c, 'professional', 2); return 'Patience up.'; },
  bigger: (c, l) => { movePatience(c, l.ctx?.booker ?? '', MAIL_PATIENCE.push, 'Asked for a bigger spot'); lean(c, 'ambitious', 3); return 'Noted. Patience down.'; },
  rematch: (c, l) => { if (l.ctx?.who) noteCallout(c, l.ctx.who); movePatience(c, l.ctx?.booker ?? '', -1, 'Asked for a rematch'); lean(c, 'ambitious', 2); return 'They’ll think about it: easier to ask for now.'; },
  humble: (c, l) => { lean(c, 'professional', 2); return say(c, l, 'humble'); },
  i_cocky: (c, l) => { lean(c, 'egotistical', 3); lean(c, 'showboat', 2); return say(c, l, 'cocky'); },
  i_callout: (c, l) => { const t = l.ctx?.target; rel(c, t, MAIL_REL.hot, 'You called them out in the press', 'rival'); if (t) noteCallout(c, t); lean(c, 'hot_headed', 4); return say(c, l, 'hot'); },
  decline: () => 'You passed.',
  deny: (c, l) => { movePatience(c, l.ctx?.booker ?? '', MAIL_PATIENCE.deny, 'Denied the rumours'); lean(c, 'loyal', 3); return 'Your booker appreciated that.'; },
  coy: (c) => { lean(c, 'politician', 3); return 'Everyone’s guessing.'; },
  confirm: (c, l) => { movePatience(c, l.ctx?.booker ?? '', MAIL_PATIENCE.confirm, 'Talked up other offers'); lean(c, 'mercenary', 3); return `Your booker read it. ${say(c, l, 'cocky')}`; },
  congrats: (c, l) => { rel(c, l.ctx?.target, MAIL_REL.warm, 'You congratulated them'); lean(c, 'team_player', 2); return say(c, l, 'humble'); },
  shot: (c, l) => { const t = l.ctx?.target; rel(c, t, MAIL_REL.hot, 'You took a shot at them', 'rival'); if (t) noteCallout(c, t); lean(c, 'hot_headed', 3); return say(c, l, 'hot'); },
  wish: (c, l) => { rel(c, l.ctx?.target, MAIL_REL.warm, 'You wished them well'); lean(c, 'loyal', 2); return 'A kind word.'; },
  share: (c, l) => { lean(c, 'showboat', 1); return say(c, l, 'humble'); },
};

/** More ways to answer (the phone's replies to what people send you). */
export function registerReplies(more: Record<string, Effect>): void { Object.assign(EFFECTS, more); }

/** Answer a letter. Returns what came of it. */
export function replyTo(c: Career, id: string, reply: string): string {
  const l = c.letters.find((x) => x.id === id);
  const r = l?.replies?.find((x) => x.id === reply);
  if (!l || !r || l.replied || l.done) return '';
  const said = EFFECTS[r.id]?.(c, l) ?? '';
  l.replied = r.label;
  l.outcome = said;
  l.read = true;
  return said;
}

// ------------------------------------------------------------------ Mondays: the check-in and the digest

function checkIn(c: Career): void {
  const k = c.people[c.player]?.contract;
  const since = addDays(c.today, -7);
  const recent = c.history.filter((m) => m.day >= addDays(c.today, -28));
  // Signed: your booker. Free agent: the indie promoter you've worked for most this month.
  let key: string | undefined, who: string | undefined, org: string;
  if (k && P()) { const b = bookerOf(P()!, k.promo); key = k.promo; who = b?.id; org = promoName(k.promo); } else {
    const counts = new Map<string, number>();
    for (const m of recent.filter((x) => x.indie)) { const s = c.shows[m.show]; if (s) { const kk = showBooker(s); counts.set(kk, (counts.get(kk) ?? 0) + 1); } }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (!top || !P()?.staff[top[0]]) return;
    key = top[0]; who = top[0]; org = 'The Indie Scene';
  }
  const rnd = seededRng(hashSeed(c.seed, 'checkin', c.today));
  const v = voiceOf(who);
  const week = c.history.filter((m) => m.day > since && m.day <= c.today);
  const avg = (xs: PlayerMatch[]) => (xs.length ? xs.reduce((t, m) => t + m.stars, 0) / xs.length : 0);
  const now = avg(recent.filter((m) => m.day > addDays(c.today, -14))), was = avg(recent.filter((m) => m.day <= addDays(c.today, -14)));
  const sit = !week.length ? 'ci_quiet' : was && now - was >= 0.4 ? 'ci_up' : was && was - now >= 0.4 ? 'ci_down' : 'ci_steady';
  const body = [line(v, sit, rnd)];
  if (recent.some((m) => m.planned === 'off-script')) body.push(line(v, 'ci_grudge', rnd));
  // What they want: the weakest part of your recent report cards.
  const graded = recent.filter((m) => m.grades?.length);
  if (graded.length && sit !== 'ci_quiet') {
    const sums = [0, 1, 2, 3, 4].map((i) => graded.reduce((t, m) => t + (m.grades![i] ?? 0), 0));
    body.push(`What I want from you: ${TIPS[sums.indexOf(Math.min(...sums))]!.charAt(0).toLowerCase()}${TIPS[sums.indexOf(Math.min(...sums))]!.slice(1)}`);
  }
  const terms: [string, string][] = [
    ['This week', week.length ? week.map((m) => `${m.result === 'win' ? 'W' : m.result === 'loss' ? 'L' : 'D'} ${stars(m.stars)}`).join(' · ') : 'No matches'],
    ['Last four weeks', recent.length ? `${recent.length} match${recent.length === 1 ? '' : 'es'}, average ${stars(Math.round(avg(recent) * 4) / 4)}` : 'No matches'],
    ['Patience', `${Math.round(patienceOf(c, key!))} of 100`],
  ];
  if (k) {
    const t = TITLES.find((x) => x.id === PROMOTIONS.find((p) => p.initials === k.promo)?.titles[0]);
    if (t) terms.push(['Top title', t.holder ? `${nameOf(t.holder)}${t.holder === c.player ? ' (you)' : ''}` : 'Vacant']);
  }
  letter(c, {
    kind: 'booker', from: nameOf(who), fromId: who ?? '', subject: sit === 'ci_quiet' ? 'Quiet week' : `Your week at ${org}`, body, terms, ctx: { booker: key! },
    replies: [
      { id: 'understood', label: 'Understood', detail: 'Patience up · professional' },
      { id: 'more', label: 'I want more', detail: 'Patience down · ambitious' },
      { id: 'complain', label: 'Complain', detail: 'Patience well down · rebellious' },
    ],
  });
}

function digest(c: Career): void {
  const from = addDays(c.today, -7);
  const H = activeWorld().history;
  const ev = H.events.filter((e) => e.day >= from && e.day < c.today);
  const shows = H.shows.filter((s) => s.date >= from && s.date < c.today);
  const cap = (xs: string[]) => (xs.length > DIGEST_LINES ? [...xs.slice(0, DIGEST_LINES), `…and ${xs.length - DIGEST_LINES} more.`] : xs);
  const sections: { h: string; lines: string[] }[] = [];
  const add = (h: string, xs: string[]) => { if (xs.length) sections.push({ h, lines: cap(xs) }); };
  const me = findWrestler(c.player)!;

  const mine = c.history.filter((m) => m.day >= from && m.day < c.today);
  const money = c.ledger.filter((e) => e.day >= from && e.day < c.today).reduce((t, e) => t + e.amount, 0);
  add('Your week', [
    ...mine.map((m) => `${m.result === 'win' ? 'Beat' : m.result === 'loss' ? 'Lost to' : 'Drew with'} ${m.oppName} · ${stars(m.stars)} · ${m.showName}`),
    `${fmtFans(fansTotal(me))} fans · ${money >= 0 ? '+' : '−'}£${Math.abs(Math.round(money)).toLocaleString('en-GB')} this week`,
  ]);
  const bouts = shows.flatMap((s) => s.bouts.map((b) => ({ s, b }))).sort((x, y) => y.b.stars - x.b.stars);
  const motw = bouts[0];
  if (motw) add('Match of the week', [`${archivedLabel(motw.b)} · ${stars(motw.b.stars)} · ${motw.s.name}, ${motw.s.city}`]);
  add('Best matches', bouts.slice(1, 6).filter((x) => x.b.stars >= 4).map((x) => `${archivedLabel(x.b)} · ${stars(x.b.stars)} · ${x.s.promo === 'TIS' ? 'indie' : x.s.promo}`));
  add('Title changes', ev.filter((e) => e.kind === 'title').map((e) => `${e.name} won the ${TITLES.find((t) => t.id === e.title)?.name ?? 'title'} at ${e.show}`));
  add('Moves', ev.filter((e) => e.kind === 'signed' || e.kind === 'poached' || e.kind === 'released' || e.kind === 'expired').map((e) =>
    e.kind === 'released' ? `${e.name} released by ${e.promo}` : e.kind === 'expired' ? `${e.name}’s ${e.promo} deal ran out` : `${e.name} signed with ${e.promo}${e.from ? ` from ${e.from}` : ''}`));
  add('Comings and goings', ev.filter((e) => e.kind === 'debut' || e.kind === 'retired' || e.kind === 'returned').map((e) => `${e.name} ${e.kind === 'debut' ? 'debuted' : e.kind === 'retired' ? (e.what ?? 'retired') : 'is back'}`));
  add('Milestones', ev.filter((e) => e.kind === 'milestone' || e.kind === 'breakthrough' || e.kind === 'tournament').map((e) => `${e.name}: ${e.what ?? e.kind}`));
  // The news desk's own stories, less what the sections above already cover (titles, moves, retirements).
  const box = c.mailBox ?? [];
  const covered = /champion$|^New .* champion|signs with|leaves |retires|to retire|is back|New face/;
  add('Injuries', [...ev.filter((e) => e.kind === 'injured').map((e) => `${e.name}${e.what ? `: ${e.what}` : ''}`), ...box.filter((x) => x.kind === 'injury').map((x) => x.subject)]);
  add('Business', ev.filter((e) => e.kind === 'hired' || e.kind === 'left' || e.kind === 'founded' || e.kind === 'closed').map((e) => `${e.name}: ${e.what ?? e.kind}${e.promo ? ` (${e.promo})` : ''}`));
  add('Headlines', box.filter((x) => x.kind !== 'injury' && !covered.test(x.subject)).map((x) => x.subject));
  // Power rankings: the last 30 days, wins and stars.
  const score = new Map<string, { n: string; s: number; w: number; best: number }>();
  for (const s of H.shows.filter((x) => x.date >= addDays(c.today, -30))) for (const b of s.bouts) for (const id of archivedPeople(b)) {
    const won = archivedWon(b) >= 0 && archivedWon(b) === archivedSideOf(b, id);
    const x = score.get(id) ?? { n: archivedName(b, id), s: 0, w: 0, best: 0 };
    x.s += b.stars + (won ? 2 : 0); x.w += won ? 1 : 0; x.best = Math.max(x.best, b.stars);
    score.set(id, x);
  }
  add('Power rankings', [...score].sort((a, b) => b[1].s - a[1].s).slice(0, DIGEST_LINES).map(([id, x], i) => `${i + 1}. ${x.n}${id === c.player ? ' (you)' : ''} · ${x.w} win${x.w === 1 ? '' : 's'}, best ${stars(x.best)}`));
  add('Online', (c.social?.feed ?? []).filter((p) => p.day >= from && p.who !== c.player).slice(0, 5).map((p) => `${nameOf(p.who)}: ${p.text}`));
  c.mailBox = [];
  const champ = ev.find((e) => e.kind === 'title' && e.who !== c.player);
  const d = letter(c, {
    kind: 'digest', from: 'The Weekly', subject: `The week to ${fmtDay(addDays(c.today, -1), 'dm')}`, body: [motw ? `Match of the week: ${archivedLabel(motw.b)}, ${stars(motw.b.stars)}.` : 'A quiet week.'], sections,
    ctx: { ...(motw ? { motw: archivedLead(motw.b) } : {}), ...(champ ? { champ: champ.who } : {}) },
    replies: [
      ...(motw && !archivedPeople(motw.b).includes(c.player) ? [{ id: 'congrats', label: `Congratulate ${archivedWinner(motw.b) ?? motw.b.an}`, detail: 'Public · a few fans · team player' }] : []),
      ...(champ ? [{ id: 'shot', label: `Take a shot at ${champ.name}`, detail: 'Public · makes a rival · can backfire' }] : []),
    ],
  });
  // Point the replies at the right people.
  if (d.replies?.[0]?.id === 'congrats') d.ctx = { ...d.ctx, target: d.ctx!.motw! };
  if (champ) d.ctx = { ...d.ctx, target: d.replies?.length === 1 ? champ.who : d.ctx!.target!, champ: champ.who };
}

// ------------------------------------------------------------------ the press

function press(c: Career): void {
  const me = findWrestler(c.player)!;
  if (fansTotal(me) < MAIL_PRESS_FANS || (c.pressAt && daysBetween(c.pressAt, c.today) < MAIL_PRESS_GAP)) return;
  const rnd = seededRng(hashSeed(c.seed, 'press', c.today));
  if (rnd() >= MAIL_PRESS_CHANCE) return;
  c.pressAt = c.today;
  const k = c.people[c.player]?.contract;
  const offer = c.offers.find((o) => o.status === 'open');
  const outlets = ['The Squared Circle Podcast', 'Ringside Weekly', 'The Bump Card', 'Mat Talk', 'Turnbuckle Radio'];
  // A rumour when another promotion's sniffing around and you're signed; otherwise an interview.
  if (offer && k && offer.promo !== k.promo) {
    letter(c, {
      kind: 'press', from: pick(rnd, outlets), subject: `${promoName(offer.promo)} interested?`, body: [`Word is ${promoName(offer.promo)} have been asking about you. Care to comment before we run it?`],
      ctx: { booker: k.promo }, ignore: { by: addDays(c.today, MAIL_IGNORE_DAYS.press), kind: 'press' },
      replies: [
        { id: 'deny', label: 'Deny it', detail: `${k.promo} patience up · loyal` },
        { id: 'coy', label: 'Play coy', detail: 'Politician' },
        { id: 'confirm', label: 'Talk it up', detail: `${k.promo} patience down · public · mercenary` },
      ],
    });
    return;
  }
  const last = c.history[0];
  const rival = P() ? bondsOf(P()!, c.player).filter((x) => { const k = kindOf(x.bond, c.today); return k === 'rival' || k === 'enemy' || theirLike(x) <= -30; }).map((x) => x.other).find((id) => findWrestler(id)) : undefined;
  const target = rival ?? TITLES.find((t) => t.holder && worksFor(findWrestler(t.holder)!, k?.promo ?? me.promotion))?.holder ?? undefined;
  letter(c, {
    kind: 'press', from: pick(rnd, outlets), subject: 'Twenty minutes?', fromId: '',
    body: [last ? `We’d love twenty minutes about ${last.result === 'win' ? `beating ${last.oppName}` : last.wonTitle ? 'the title' : 'where you go from here'}.` : 'We’d love twenty minutes about your career so far.', 'What do you want to say?'],
    ctx: target ? { target } : {}, ignore: { by: addDays(c.today, MAIL_IGNORE_DAYS.press), kind: 'press' },
    replies: [
      { id: 'humble', label: 'Humble and grateful', detail: 'Public · a few fans · professional' },
      { id: 'i_cocky', label: 'Cocky', detail: 'Public · more fans · can backfire' },
      ...(target ? [{ id: 'i_callout', label: `Call out ${nameOf(target)}`, detail: 'Public · most fans · makes a rival · can backfire' }] : []),
      { id: 'decline', label: 'No comment' },
    ],
  });
}

// ------------------------------------------------------------------ ignoring, keeping, the daily round

function lapse(c: Career): void {
  for (const l of c.letters) {
    if (!l.ignore || l.replied || l.done || c.today <= l.ignore.by) continue;
    l.done = 'expired';
    if (l.ignore.kind === 'rival' && l.ctx?.who) {
      const me = findWrestler(c.player)!;
      const loss = Math.round(reach(me) * MAIL_IGNORE_RIVAL_FANS);
      const total = FAN_REGIONS.reduce((t, r) => t + fansIn(me, r) + 1, 0);
      for (const r of FAN_REGIONS) me.fans[r] = Math.max(0, me.fans[r] - Math.round((loss * (fansIn(me, r) + 1)) / total));
      person(c, c.player).rep = Math.max(0, person(c, c.player).rep + MAIL_IGNORE_RIVAL_REP);
      l.outcome = `You never answered. ${nameOf(l.ctx.who)} is telling everyone you’re scared.`;
      (c.mailBox ??= []).push({ day: c.today, subject: `${nameOf(l.ctx.who)} says ${findWrestler(c.player)!.name} is scared of them`, body: '', kind: 'news' });
    } else if (l.ignore.kind === 'friend' && l.ctx?.who) {
      moveRelation(c, l.ctx.who, MAIL_IGNORE_FRIEND, 'You never wrote back');
      l.outcome = 'You never wrote back. They noticed.';
    } else l.outcome = 'The chance went.';
  }
}

/** A year of mail, newest first. */
function keep(c: Career): void {
  const cut = addDays(c.today, -MAIL_KEEP_DAYS);
  c.letters = c.letters.filter((l) => l.day >= cut || (l.action && !l.done)).slice(0, MAIL_MAX);
}

/** Mentors write now and then with something to work on. */
function mentorNote(c: Career): void {
  const m = P() ? bondsOf(P()!, c.player).find((x) => !!x.bond.mentor && x.bond.mentor !== c.player && findWrestler(x.other)) : undefined;
  const graded = c.history.filter((x) => x.grades?.length && x.day >= addDays(c.today, -28));
  if (!m || !graded.length) return;
  const rnd = seededRng(hashSeed(c.seed, 'mentor', c.today));
  if (rnd() >= 0.5) return;
  const sums = [0, 1, 2, 3, 4].map((i) => graded.reduce((t, x) => t + (x.grades![i] ?? 0), 0));
  letter(c, {
    kind: 'person', from: nameOf(m.other), fromId: m.other, subject: 'Something to work on', body: [line(voiceOf(m.other), 'mentor_open', rnd), TIPS[sums.indexOf(Math.min(...sums))]!],
    ctx: { who: m.other }, replies: friendReplies(), ignore: { by: addDays(c.today, MAIL_IGNORE_DAYS.friend), kind: 'friend' },
  });
}

function daily(c: Career): void {
  if (!FEATURES.mail || c.spectator) return;
  lapse(c);
  if (weekday(c.today) === 1) {
    if (c.digestAt !== c.today) { c.digestAt = c.today; digest(c); }
    if (c.checkinAt !== c.today) { c.checkinAt = c.today; checkIn(c); }
    mentorNote(c);
  }
  press(c);
  keep(c);
}


/** With mail on, the news desk's stories about other people wait for Monday's digest. */
function toDigest(c: Career, l: Pick<Letter, 'kind' | 'from' | 'subject' | 'body'>): boolean {
  if (!FEATURES.mail) return false;
  // News about you or your promotion stays a letter.
  const k = c.people[c.player]?.contract;
  const text = `${l.subject} ${l.body.join(' ')}`;
  const mine = /^Your /.test(l.subject) || text.includes(findWrestler(c.player)?.name ?? '\u0000') || (!!k && (text.includes(k.promo) || text.includes(promoName(k.promo))));
  const world = !mine && ((l.kind === 'news' && l.from === 'The news desk') || (l.kind === 'injury' && l.from !== 'The doctor'));
  if (!world) return false;
  (c.mailBox ??= []).push({ day: c.today, subject: l.subject, body: l.body[0] ?? '', kind: l.kind === 'injury' ? 'injury' : 'news' });
  return true;
}

setCareerHooks({ daily, mail: { route: toDigest, before, result: resultLetter, after: afterMatchMail } });
