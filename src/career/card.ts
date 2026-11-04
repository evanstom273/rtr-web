// Booker mode, stage 2 (Lyra's design): the card you book. Matches in order, who wins and how (clean, cheating, DQ,
// count-out or no contest), and segments between them (promos, run-ins, beat-downs, signings, debuts, celebrations,
// interviews). Every match is simmed with the full engine; you can watch any of yours play out, and play your own. The
// whole show's judged once it's over. Booking yourself is allowed, but the locker room and your opponents notice.
import { findWrestler, fansIn, PROMOTIONS, TITLES, WRESTLERS, type Wrestler } from '../data/rtr';
import { hashSeed, seededRng } from '../engine/rng';
import type { LogEntry, StipulationId } from '../engine/types';
import { activeWorld } from '../world/world';
import { feelPair } from '../world/people';
import { available, bookShow, setBookDefer } from './booker';
import { mergeRound, titleAllows } from './belts';
import { settleShow } from './books';
import { applyBout, boutJob, letter, scripted, setCareerHooks } from './career';
import { companyOf, isMajorTier, officeOf, playerRuns, roleIn } from './company';
import { addDays, daysBetween, fmtDay } from './dates';
import { moveRoom } from './politics';
import { startRumour } from './rumours';
import { simOne } from './sim';
import { BOND_LOG, FEATURES, PLANNED_RETRIES, SEGMENT, SELF_BOOK, SHOW_RATE, STORY } from './tuning';
import type { BookedFinish, Bout, Career, SegKind, Segment, Show, ShowRating } from './types';

export const FINISH_LABEL: Record<BookedFinish, string> = { clean: 'Clean', cheat: 'Cheats to win', dq: 'Disqualification', countout: 'Count-out', nocontest: 'No contest' };
export const SEG_LABEL: Record<SegKind, string> = { promo: 'Promo', runin: 'Run-in', beatdown: 'Beat-down', signing: 'Contract signing', debut: 'Debut', celebration: 'Celebration', interview: 'Interview', betrayal: 'Betrayal' };
/** How many people each segment takes: [fewest, most]. */
export const SEG_WHO: Record<SegKind, [number, number]> = { promo: [1, 2], runin: [1, 2], beatdown: [2, 2], signing: [2, 2], debut: [1, 1], celebration: [1, 1], interview: [1, 1], betrayal: [2, 2] };
export const STIPS: StipulationId[] = ['standard', 'no_dq', 'falls_count_anywhere', 'tables', 'ladder', 'steel_cage', 'last_man_standing', 'i_quit', 'submission', 'two_out_of_three', 'iron_man'];
export const CARD_MAX = { matches: 12, segments: 8 };

const W = (id: string): Wrestler | undefined => findWrestler(id);
const nameOf = (id: string): string => W(id)?.name ?? id;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ------------------------------------------------------------------ who you can book

/** Everyone booked on another show that night. */
function busyOn(c: Career, show: Show): Set<string> {
  const out = new Set<string>();
  for (const s of Object.values(c.shows)) if (s.id !== show.id && s.date === show.date && s.card) for (const b of s.card) { out.add(b.a); out.add(b.b); }
  return out;
}

/** Who you can put on a show: its roster and, for a small promotion, free agents in the region (a night at a time). You too. */
export function bookerPool(c: Career, show: Show): Wrestler[] {
  const co = companyOf(show.promo);
  const busy = busyOn(c, show);
  const free = (w: Wrestler) => !busy.has(w.id) && available(c.people[w.id], show.date);
  const roster = WRESTLERS.filter((w) => (w.promotion === show.promo || w.also?.includes(show.promo)) && w.id !== c.player && free(w));
  const local = co && !isMajorTier(co.tier)
    ? WRESTLERS.filter((w) => w.promotion === 'TIS' && w.id !== c.player && free(w) && fansIn(w, show.region) > 0).sort((a, b) => fansIn(b, show.region) - fansIn(a, show.region)).slice(0, 40)
    : [];
  const me = W(c.player);
  return [...(me && free(me) ? [me] : []), ...roster, ...local];
}

/** Why you can't book this show (null: you can). */
export function canBook(c: Career, show: Show | undefined): string | null {
  if (!FEATURES.booker) return 'Booker mode isn’t switched on yet.';
  if (!show) return 'There’s no such show.';
  if (!roleIn(c, show.promo)) return 'You don’t book it.';
  if (show.done || show.date < c.today) return 'It’s been and gone.';
  if (show.card?.some((b) => b.result)) return 'It’s already under way.';
  return null;
}

/** The titles that can be on the line on a show (its promotion's, still active). */
export const titlesFor = (show: Show) => TITLES.filter((t) => PROMOTIONS.find((p) => p.initials === show.promo)?.titles.includes(t.id) && !t.retired);
export { roundBouts } from './belts';

/** Book the card: matches in order and the segments between them. */
export function setCard(c: Career, showId: string, card: Bout[], segs: Segment[]): string {
  const show = c.shows[showId];
  const no = canBook(c, show);
  if (no) return no;
  if (card.length > CARD_MAX.matches) return `${CARD_MAX.matches} matches at most.`;
  if (segs.length > CARD_MAX.segments) return `${CARD_MAX.segments} segments at most.`;
  const pool = new Set(bookerPool(c, show!).map((w) => w.id));
  for (const b of show!.card ?? []) { pool.add(b.a); pool.add(b.b); }
  const seen = new Set<string>();
  for (const b of card) {
    if (b.a === b.b) return 'Someone can’t wrestle themselves.';
    for (const id of [b.a, b.b]) {
      if (!pool.has(id)) return `${nameOf(id)} isn’t free that night.`;
      if (seen.has(id)) return `${nameOf(id)} is on the card twice.`;
      seen.add(id);
    }
    if (W(b.a)?.gender !== W(b.b)?.gender) return 'Matches are men against men and women against women.';
    if (b.title) {
      const t = titlesFor(show!).find((x) => x.id === b.title);
      if (!t) return 'That title isn’t this promotion’s.';
      for (const id of [b.a, b.b]) { const no = W(id) ? titleAllows(t, W(id)!) : null; if (no) return no; }
      if (t.holder && t.holder !== b.a && t.holder !== b.b) return `The champion has to be in a ${t.name} match.`;
    }
    if (b.planned && b.planned !== b.a && b.planned !== b.b) return 'The winner has to be in the match.';
    if (b.finish && b.finish !== 'nocontest' && !b.planned) return 'Pick a winner for that finish.';
  }
  for (const g of segs) {
    const [lo, hi] = SEG_WHO[g.kind];
    if (g.who.length < lo || g.who.length > hi) return `A ${SEG_LABEL[g.kind].toLowerCase()} takes ${lo === hi ? lo : `${lo}–${hi}`}.`;
    if (g.who.some((id) => !pool.has(id))) return 'Someone in a segment isn’t free that night.';
    if (g.after < -1 || g.after >= Math.max(1, card.length)) return 'That segment’s out of place.';
  }
  // A match between two people in a storyline counts towards it.
  const storyOf = (b: Bout) => b.feud ?? c.feuds.find((f) => !f.done && f.promo === show!.promo && ((f.a === b.a && f.b === b.b) || (f.a === b.b && f.b === b.a)))?.id;
  show!.card = card.map((b) => {
    const feud = storyOf(b);
    return { a: b.a, b: b.b, ...(b.title ? { title: b.title } : {}), ...(b.stip && b.stip !== 'standard' ? { stip: b.stip } : {}), ...(b.planned ? { planned: b.planned } : {}), ...(b.finish && b.finish !== 'clean' ? { finish: b.finish } : {}), ...(feud ? { feud } : {}), ...(b.tourney ? { tourney: b.tourney } : {}) };
  });
  show!.segments = segs.map((g) => ({ kind: g.kind, who: [...g.who], after: g.after }));
  show!.booked = 'player';
  return `${show!.name} is booked.`;
}

/** Hand it to the staff: they draw up a card the way the AI does, and add a segment or two. */
export function autoBook(c: Career, showId: string): string {
  const show = c.shows[showId];
  const no = canBook(c, show);
  if (no) return no;
  show!.card = bookShow(c, show!, WRESTLERS);
  show!.booked = 'staff';
  mergeRound(c, show!);
  staffSegments(c, show!);
  return `Your staff have booked ${show!.name}.`;
}

/** What staff put between the matches: the main eventers have their say, the champion an interview. */
function staffSegments(_c: Career, show: Show): void {
  const card = show.card ?? [];
  if (!card.length) return;
  const main = card[card.length - 1]!;
  const segs: Segment[] = [{ kind: 'promo', who: [main.a], after: -1 }];
  const champ = card.slice(0, -1).find((b) => b.title);
  if (champ) segs.push({ kind: 'interview', who: [champ.planned ?? champ.a], after: card.indexOf(champ) });
  show.segments = segs;
}

/** What's wrong with a card, as the crowd would see it (warnings, not rules). */
export function cardIssues(c: Career, show: Show, card: Bout[] = show.card ?? [], segs: Segment[] = show.segments ?? []): string[] {
  const out: string[] = [];
  if (!card.length) return ['No matches yet.'];
  const score = (b: Bout) => (W(b.a) ? fansIn(W(b.a)!, show.region) : 0) + (W(b.b) ? fansIn(W(b.b)!, show.region) : 0);
  const main = card[card.length - 1]!;
  if (card.some((b) => score(b) > score(main) * 1.5)) out.push('The main event isn’t your biggest draw.');
  const slot = SHOW_RATE.slot[show.kind] ?? 120;
  const mins = card.length * 12 + segs.length * SHOW_RATE.segMinutes;
  if (mins > slot * SHOW_RATE.over) out.push('That’s a lot for one night: it’ll run long.');
  if (mins < slot * SHOW_RATE.under) out.push('That’s a short night for a paying crowd.');
  const screwy = card.filter((b) => b.finish === 'dq' || b.finish === 'countout' || b.finish === 'nocontest').length;
  if (screwy > Math.max(1, card.length * SHOW_RATE.screwyMax)) out.push('Too many screwy finishes: the crowd will feel cheated.');
  for (let i = -1; i < card.length; i++) if (segs.filter((g) => g.after === i).length >= SHOW_RATE.segsInARow) { out.push('Three segments in a row: they’ll want a match.'); break; }
  if (card.some((b) => b.a === c.player || b.b === c.player)) {
    const mine = card.find((b) => b.a === c.player || b.b === c.player)!;
    if (mine.planned === c.player) out.push('You’re booking yourself to win: the locker room will notice.');
  }
  for (const g of segs) {
    if (g.kind === 'celebration' && !TITLES.some((t) => t.holder === g.who[0])) out.push(`${nameOf(g.who[0]!)} has nothing to celebrate.`);
    if (g.kind === 'runin' && g.after < 0) out.push('A run-in needs a match to run in on.');
  }
  return out;
}

// ------------------------------------------------------------------ judging it

/** Feuding (on the books) or real heat between two people. */
function heatBetween(c: Career, a: string, b: string): boolean {
  if (c.feuds.some((f) => !f.done && ((f.a === a && f.b === b) || (f.a === b && f.b === a)))) return true;
  const P = activeWorld().people;
  const x = P?.bonds[a < b ? `${a}|${b}` : `${b}|${a}`];
  return !!x && Math.min(x.la, x.lb) <= -40;
}

/** A segment, scored: who's in it, the heat, the crowd, what kind it is, and a little luck. */
export function rateSegment(c: Career, show: Show, g: Segment): { score: number; note: string } {
  const rnd = seededRng(hashSeed(c.seed, 'seg', show.id, g.kind, g.after, g.who.join('|')));
  const ws = g.who.map(W).filter((x): x is Wrestler => !!x);
  if (!ws.length) return { score: 0, note: 'Nobody turned up.' };
  const cha = ws.reduce((t, w) => t + w.stats.charisma, 0) / ws.length;
  const fans = Math.max(...ws.map((w) => fansIn(w, show.region)));
  let s = SEGMENT.base + (cha - 50) * SEGMENT.perCharisma + Math.min(SEGMENT.crowdMax, Math.max(0, Math.log10(Math.max(1, fans) / SEGMENT.crowdFrom)) * SEGMENT.crowdPerDecade);
  if (ws.length === 2 && heatBetween(c, ws[0]!.id, ws[1]!.id)) s += SEGMENT.heat;
  s += SEGMENT.kind[g.kind] ?? 0;
  // A celebration with nothing to celebrate, a run-in with nothing to run in on, a "debut" from someone who's been here before.
  if (g.kind === 'celebration' && !TITLES.some((t) => t.holder === ws[0]!.id)) s -= 0.9;
  if (g.kind === 'runin' && g.after < 0) s -= 0.6;
  if (g.kind === 'debut' && activeWorld().history.shows.some((x) => x.promo === show.promo && x.bouts.some((b) => b.a === ws[0]!.id || b.b === ws[0]!.id))) s -= 0.9;
  s += (rnd() * 2 - 1) * SEGMENT.luck;
  const score = r2(clamp(s, 0, 5));
  const note = score >= 4 ? 'The building came unglued.' : score >= 3.25 ? 'Went down a storm.' : score >= 2.5 ? 'Did its job.' : score >= 1.5 ? 'The crowd went for a drink.' : 'Died on its arse.';
  return { score, note };
}

/** The whole show, judged (Lyra's call): the matches by slot, the segments, the flow, the payoffs, the stars, the time. */
export function rateShow(c: Career, show: Show): ShowRating {
  const card = (show.card ?? []).filter((b) => b.result);
  const segs = (show.segments ?? []).filter((g) => g.score !== undefined);
  const parts: [string, number][] = [];
  const notes: string[] = [];
  if (!card.length) return { score: 0, parts: [], notes: ['Nothing happened.'] };
  const weight = (i: number) => (i === card.length - 1 ? SHOW_RATE.mainWeight : i === 0 ? SHOW_RATE.openerWeight : 1);
  let tw = 0, ts = 0;
  card.forEach((b, i) => { tw += weight(i); ts += b.result!.stars * weight(i); });
  const matches = ts / tw;
  parts.push(['Matches', r2(matches)]);
  let score = matches;
  if (segs.length) {
    const seg = segs.reduce((t, g) => t + g.score!, 0) / segs.length;
    parts.push(['Segments', r2(seg)]);
    score = (ts + seg * SHOW_RATE.segWeight * segs.length) / (tw + SHOW_RATE.segWeight * segs.length);
  }
  let flow = 0;
  const best = Math.max(...card.map((b) => b.result!.stars));
  if (card.length > 1 && card[card.length - 1]!.result!.stars < best - SHOW_RATE.mainNotBest) { flow -= SHOW_RATE.mainNotBestCost; notes.push('The main event wasn’t the best thing on.'); }
  if (card.length > 2 && card[0]!.result!.stars < SHOW_RATE.flatOpener) { flow -= SHOW_RATE.flatOpenerCost; notes.push('A flat opener.'); }
  for (let i = 1; i < card.length; i++) if (card[i]!.result!.t > SHOW_RATE.longMatch && card[i - 1]!.result!.t > SHOW_RATE.longMatch && !(show.segments ?? []).some((g) => g.after === i - 1)) { flow -= SHOW_RATE.backToBackCost; notes.push('Two long matches back to back.'); }
  for (let i = -1; i < card.length; i++) if ((show.segments ?? []).filter((g) => g.after === i).length >= SHOW_RATE.segsInARow) { flow -= SHOW_RATE.segsInARowCost; notes.push('Too much talking in one go.'); break; }
  const screwy = card.filter((b) => ['DISQUALIFICATION', 'COUNT_OUT', 'DOUBLE_COUNT_OUT', 'NO_CONTEST'].includes(b.result!.finish)).length;
  if (screwy > Math.max(1, card.length * SHOW_RATE.screwyMax)) { flow -= SHOW_RATE.screwyCost; notes.push('Too many screwy finishes.'); }
  if (flow) parts.push(['Flow', r2(flow)]);
  // A blow-off pays by its heat (storylines, stage 3); the booker's own feuds count as warm.
  const paying = c.feuds.filter((f) => f.payoff === show.id && card.some((b) => (b.a === f.a && b.b === f.b) || (b.a === f.b && b.b === f.a)));
  const payoffs = paying.length;
  const pay = r2(Math.min(STORY.payoffRate, paying.reduce((t, f) => t + (f.heat ?? 50) / 100 * STORY.payoffRate, 0), Math.max(SHOW_RATE.payoffMax, STORY.payoffRate)));
  if (pay) { parts.push(['Payoffs', r2(pay)]); notes.push(payoffs > 1 ? 'Feuds paid off.' : 'A feud paid off.'); }
  const fans = [...new Set(card.flatMap((b) => [b.a, b.b]))].map((id) => (W(id) ? fansIn(W(id)!, show.region) : 0)).sort((a, b) => b - a).slice(0, 3);
  const top = fans.reduce((t, x) => t + x, 0) / Math.max(1, fans.length);
  const stars = Math.min(SHOW_RATE.starMax, Math.max(0, Math.log10(Math.max(1, top) / SHOW_RATE.starFrom)) * SHOW_RATE.starPerDecade * 10);
  if (stars > 0.01) parts.push(['Star power', r2(stars)]);
  const slot = SHOW_RATE.slot[show.kind] ?? 120;
  const mins = card.reduce((t, b) => t + b.result!.t / 60, 0) + (show.segments?.length ?? 0) * SHOW_RATE.segMinutes;
  let time = 0;
  if (mins > slot * SHOW_RATE.over) { time = -SHOW_RATE.timeCost; notes.push('It ran long.'); }
  else if (mins < slot * SHOW_RATE.under) { time = -SHOW_RATE.timeCost; notes.push('A short night for the money.'); }
  if (time) parts.push(['Time', r2(time)]);
  score = r2(clamp(score + flow + pay + stars + time, 0, 5));
  if (!notes.length) notes.push(score >= 4 ? 'People will be talking about this one.' : score >= 3 ? 'A good night out.' : 'It was a show.');
  return { score, parts, notes };
}

// ------------------------------------------------------------------ watching one

/**
 * Watch a match on a show you book (Lyra's call): it's wrestled now, in the full engine, as the night would (the
 * wrestlers try to follow the plan), and what you watch is what happened. Returns the commentary to play back.
 */
export function watchBout(c: Career, showId: string, index: number): { log: LogEntry[]; text: string } | string {
  const show = c.shows[showId];
  const b = show?.card?.[index];
  if (!show || !b) return 'There’s no such match.';
  if (!roleIn(c, show.promo)) return 'You don’t book it.';
  if (show.date !== c.today) return 'You can watch it on the night.';
  if (b.result) return 'It’s already happened.';
  if (b.a === c.player || b.b === c.player) return 'That’s your match: wrestle it.';
  const job = boutJob(c, show, b, index);
  let r = simOne(job);
  const want = b.planned && (!b.finish || b.finish === 'clean' || b.finish === 'cheat') ? (b.planned === b.a ? 'you' : 'them') : null;
  for (let i = 1; want && r.out.winner !== want && i <= PLANNED_RETRIES; i++) r = simOne({ ...job, seed: hashSeed(job.seed, 'again', i) });
  const out = scripted(b, r.out, true);
  applyBout(c, show, index, out, true, 'simmed');
  const res = b.result!;
  const text = res.winner ? `${nameOf(res.winner)} wins${res.finish === 'DISQUALIFICATION' ? ' by disqualification' : res.finish === 'COUNT_OUT' ? ' by count-out' : ''} · ${res.stars}★` : `${res.finish === 'NO_CONTEST' ? 'No contest' : 'A draw'} · ${res.stars}★`;
  return { log: r.engine.state.log, text };
}

// ------------------------------------------------------------------ the night after

/** Your show's over: segments scored, the whole show judged, and what booking yourself cost (or earned). */
function showDone(c: Career, show: Show): void {
  if (!FEATURES.booker || !playerRuns(show.promo) || !show.card?.some((b) => b.result)) return;
  for (const g of show.segments ?? []) {
    if (g.score !== undefined) continue;
    const r = rateSegment(c, show, g);
    g.score = r.score; g.note = r.note;
    for (const id of g.who) {
      const w = W(id);
      if (w?.fans) w.fans[show.region] = Math.max(0, Math.round(w.fans[show.region] * (1 + (r.score - 2.5) * SEGMENT.fans)));
    }
  }
  show.rating = rateShow(c, show);
  settleShow(c, show);
  selfBooking(c, show);
  if (roleIn(c, show.promo)) {
    const best = [...(show.card ?? [])].filter((b) => b.result).sort((a, b) => b.result!.stars - a.result!.stars)[0];
    letter(c, {
      kind: 'news', from: `${show.promo} · the office`, subject: `${show.name}: ${show.rating.score}★`,
      body: [...show.rating.notes, ...(show.books ? [`${show.books.sold.toLocaleString('en-GB')} in the ${show.books.venue.toLowerCase()} (${show.books.cap.toLocaleString('en-GB')}). Took £${show.books.in.toLocaleString('en-GB')}, spent £${show.books.out.toLocaleString('en-GB')}.`] : []), ...(best ? [`Match of the night: ${nameOf(best.a)} vs ${nameOf(best.b)}, ${best.result!.stars}★.`] : []), ...(show.segments ?? []).filter((g) => g.score !== undefined).slice(0, 3).map((g) => `${SEG_LABEL[g.kind]} (${g.who.map(nameOf).join(' and ')}): ${g.score}★. ${g.note}`)],
      terms: show.rating.parts.map(([k, v]) => [k, `${v > 0 && k !== 'Matches' && k !== 'Segments' ? '+' : ''}${v}`] as [string, string]),
    });
  }
}

/** Booking yourself (Lyra's call): win, and the room and your opponent mind; put someone over, and they don't. */
function selfBooking(c: Career, show: Show): void {
  const b = show.card?.find((x) => (x.a === c.player || x.b === c.player) && x.result);
  if (!b) return;
  const opp = b.a === c.player ? b.b : b.a;
  const P = activeWorld().people!;
  const won = b.result!.winner === c.player;
  if (won && b.planned === c.player) {
    moveRoom(c, show.promo, SELF_BOOK.winRoom + (b.result!.newChamp ? SELF_BOOK.titleRoom : 0));
    feelPair(P, opp, c.player, [SELF_BOOK.oppLike, 0], [0, 0], 'Booked themselves to beat me', c.today, { keep: BOND_LOG.mine });
    const o = officeOf(c);
    o.selfWins = [...(o.selfWins ?? []).filter((d) => daysBetween(d, c.today) <= SELF_BOOK.gloryDays), c.today];
    if (o.selfWins.length >= SELF_BOOK.gloryWins) startRumour(c, { kind: 'glory', a: c.player, promo: show.promo, truth: true, by: opp }, [opp]);
  } else if (!won && b.planned === opp) {
    moveRoom(c, show.promo, SELF_BOOK.loseRoom);
    feelPair(P, opp, c.player, [SELF_BOOK.oppPutOver[0], SELF_BOOK.oppPutOver[1]], [0, 0], 'Booked me to beat them, on their own show', c.today, { keep: BOND_LOG.mine });
  }
}

setBookDefer((_c, s) => FEATURES.booker && playerRuns(s.promo), (c, s) => { mergeRound(c, s); staffSegments(c, s); });
setCareerHooks({ show: showDone });

/** Your shows coming up (for the Office), soonest first. */
export function showsToBook(c: Career, promo: string, days = 35): Show[] {
  const until = addDays(c.today, days);
  return Object.values(c.shows).filter((s) => s.promo === promo && !s.done && s.date >= c.today && s.date <= until).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
/** Your shows that are over (for results), latest first. */
export const showsDone = (c: Career, promo: string): Show[] => Object.values(c.shows).filter((s) => s.promo === promo && s.done).sort((a, b) => (a.date < b.date ? 1 : -1));
export const describeShow = (s: Show): string => `${s.name} · ${fmtDay(s.date, 'dm')} · ${s.city}`;
