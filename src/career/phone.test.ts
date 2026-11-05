// The phone (Lyra's relationships redesign, stage 2): threads, topics and tones, how it lands, what people send
// you, person letters moving out of the mail, and standing orders answering texts while you skip.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findWrestler, WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondOf, ensureBond, likeOf } from '../world/people';
import { ordersOf, answerForMe } from './away';
import { ctxFor, fire, eventLibrary } from './events';
import { isPhoneLetter, tabOf } from './mail';
import { contacts, markRead, phoneUnread, preview, send, threadList, threadOf, topicsFor } from './phone';
import { replyTo } from './mail';
import { begin, day, quick } from './testkit';
import { FEATURES, PHONE_IN } from './tuning';
import type { Career } from './types';

const P = () => activeWorld().people!;
/** Someone you know, set to how they feel about you and how well you know each other. */
function someone(c: Career, like: number, fam: number, traits?: string[]): string {
  const w = WRESTLERS.find((x) => x.id !== c.player && !bondOf(P(), c.player, x.id) && !c.people[x.id]?.retired)!;
  if (traits) w.traits = traits as never;
  const b = ensureBond(P(), c.player, w.id, c.today);
  if (b.a === w.id) b.la = like; else b.lb = like;
  b.f = fam;
  return w.id;
}

describe('the phone', () => {
  const was = FEATURES.phone;
  beforeEach(() => { FEATURES.phone = true; });
  afterEach(() => { FEATURES.phone = was; });

  it('you message someone: you say it, they answer in their voice, and how they feel moves', () => {
    const c = begin('jamie_mercer', 7);
    const id = someone(c, 45, 60, ['team_player']);
    const before = likeOf(P(), id, c.player);
    const reply = send(c, id, 'catchup', 'warm')!;
    expect(reply).toBeTruthy();
    const t = threadOf(c, id);
    expect(t.length).toBe(2);
    expect(t[0]!.msg!.me).toBe(true);
    expect(t[1]!.msg!.text.length).toBeGreaterThan(0);
    expect(t[1]!.msg!.note).toBeTruthy();
    expect(likeOf(P(), id, c.player)).toBeGreaterThan(before);
    // Three in a day is too many.
    send(c, id, 'catchup', 'warm');
    const mid = likeOf(P(), id, c.player);
    send(c, id, 'catchup', 'warm');
    expect(likeOf(P(), id, c.player)).toBeLessThan(mid);
  });

  it('what you can talk about depends on what’s happened: no congratulations without news, no apology without a grievance', () => {
    const c = begin('jamie_mercer', 7);
    const id = someone(c, 20, 40);
    const t = topicsFor(c, id);
    expect(t.find((x) => x.topic === 'congrats')!.blocked).toBeTruthy();
    expect(t.find((x) => x.topic === 'sorry')!.blocked).toBeTruthy();
    expect(send(c, id, 'congrats', 'warm')).toBeNull();
    const sour = someone(c, -40, 40);
    expect(topicsFor(c, sour).find((x) => x.topic === 'sorry')!.blocked).toBeUndefined();
    const was = likeOf(P(), sour, c.player);
    send(c, sour, 'sorry', 'warm');
    expect(likeOf(P(), sour, c.player)).toBeGreaterThan(was);
  });

  it('a tone lands by who they are: cheek goes down badly with a hot-head who doesn’t know you, fine with a friend who likes banter', () => {
    const c = begin('jamie_mercer', 7);
    const hot = someone(c, 0, 60, ['hot_headed']);
    const mate = someone(c, 60, 70, ['showboat']);
    const h0 = likeOf(P(), hot, c.player), m0 = likeOf(P(), mate, c.player);
    send(c, hot, 'catchup', 'cocky');
    send(c, mate, 'catchup', 'cocky');
    expect(likeOf(P(), hot, c.player) - h0).toBeLessThan(likeOf(P(), mate, c.player) - m0);
  });

  it('you can only guess how it’ll land if you know them', () => {
    const c = begin('jamie_mercer', 7);
    const stranger = someone(c, 0, 12);
    const friend = someone(c, 50, 70, ['team_player']);
    expect(preview(c, stranger, 'catchup', 'warm').guess).toBe('unknown');
    expect(['good', 'fine']).toContain(preview(c, friend, 'catchup', 'warm').guess);
    expect(preview(c, friend, 'catchup', 'warm').text.length).toBeGreaterThan(0);
  });

  it('asking about someone you both know tells you what they make of them', () => {
    const c = begin('jamie_mercer', 7);
    const id = someone(c, 40, 60, ['team_player']);
    const other = WRESTLERS.find((x) => x.id !== c.player && x.id !== id && !bondOf(P(), c.player, x.id) && !bondOf(P(), id, x.id))!;
    const mine = ensureBond(P(), c.player, other.id, c.today); mine.f = 30;
    const theirs = ensureBond(P(), id, other.id, c.today); theirs.f = 40;
    if (theirs.a === id) theirs.la = -70; else theirs.lb = -70;
    const g = topicsFor(c, id).find((x) => x.topic === 'gossip')!;
    expect(g.about).toContain(other.id);
    const reply = send(c, id, 'gossip', 'plain', other.id)!;
    if (!reply.note!.includes('Hard to tell')) expect(reply.note).toContain(`can’t stand ${other.name}`);
  });

  it('a friend on another roster can put a word in: that promotion hears of you', () => {
    const c = begin('@indie', 7);
    const w = WRESTLERS.find((x) => x.promotion === 'IVW' && !bondOf(P(), c.player, x.id))!;
    const b = ensureBond(P(), c.player, w.id, c.today);
    if (b.a === w.id) { b.la = 100; b.ra = 100; } else { b.lb = 100; b.rb = 100; }
    b.f = 80;
    const t = topicsFor(c, w.id).find((x) => x.topic === 'word')!;
    expect(t.about).toContain('IVW');
    send(c, w.id, 'word', 'warm', 'IVW');
    // It's a chance (90% at best): either way they won't be asked again for a while.
    expect(topicsFor(c, w.id).find((x) => x.topic === 'word')!.blocked).toBeTruthy();
    if (c.scout?.IVW?.known) expect(c.scout.IVW.how).toContain('put a word in');
  });

  it('having a go makes rivals; a hot-head comes back at you', () => {
    const c = begin('jamie_mercer', 7);
    const id = someone(c, 0, 50, ['hot_headed']);
    send(c, id, 'goat', 'blunt');
    expect(likeOf(P(), id, c.player)).toBeLessThan(-10);
    expect(bondOf(P(), c.player, id)!.riv).toBe(c.today);
  });

  it('person letters and moments with someone live in your thread with them, not the mail; with the phone off, they stay in the mail', () => {
    const c = begin('jamie_mercer', 7);
    const id = someone(c, 50, 60);
    const def = eventLibrary().find((d) => d.id === 'veteran_advice')!;
    const l = fire(ctxFor(c), def, { who: id })!;
    expect(l.fromId).toBe(id);
    expect(isPhoneLetter(l)).toBe(true);
    expect(tabOf(l)).toBe('phone');
    expect(threadOf(c, id).some((x) => x.letter?.id === l.id)).toBe(true);
    expect(phoneUnread(c)).toBeGreaterThan(0);
    markRead(c, id);
    expect(threadList(c).find((x) => x.id === id)!.unread).toBe(0);
    FEATURES.phone = false;
    expect(tabOf(l)).not.toBe('phone');
  });

  it('people message you, paced by closeness and never more than the weekly cap (news aside); replies and standing orders work', async () => {
    const c = begin('jamie_mercer', 7);
    for (let i = 0; i < 6; i++) someone(c, 60, 70, ['team_player']);
    const weeks = new Map<string, number>();
    for (let i = 0; i < 42; i++) {
      await day(c, quick, 'simmed');
      // What the cap covers: check-ins, digs, asks for advice. News (a title, a move, an injury: "happy" or
      // "there" among the replies) doesn't wait on it, though it shares the "brief" reply.
      const mine = c.letters.filter((l) => l.kind === 'person' && l.day === c.today && l.replies?.some((r) => ['chat', 'brief', 'tease', 'rise', 'fire_back', 'laugh_off', 'help', 'tip', 'brush'].includes(r.id))
        && !l.replies.some((r) => r.id === 'happy' || r.id === 'there'));
      const wk = c.phone?.week ?? '';
      weeks.set(wk, (weeks.get(wk) ?? 0) + mine.length);
    }
    const total = [...weeks.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(2);
    for (const n of weeks.values()) expect(n).toBeLessThanOrEqual(PHONE_IN.weekCap);
    const l = c.letters.find((x) => x.kind === 'person' && x.replies?.some((r) => r.id === 'chat') && !x.replied)!;
    if (l) {
      const who = l.ctx!.who!;
      const before = likeOf(P(), who, c.player);
      expect(replyTo(c, l.id, 'chat')).toBeTruthy();
      expect(likeOf(P(), who, c.player)).toBeGreaterThan(before);
    }
    // Standing orders answer them while you're away.
    const o = ordersOf(c);
    o.on = true; o.people = 'gracious';
    const open = c.letters.filter((x) => x.kind === 'person' && x.replies?.length && !x.replied && !x.done).length;
    answerForMe(c);
    expect(c.letters.filter((x) => x.kind === 'person' && x.replies?.length && !x.replied && !x.done).length).toBeLessThan(Math.max(1, open));
    expect(contacts(c).length).toBeGreaterThan(5);
    expect(findWrestler(c.player)).toBeTruthy();
  });
});
