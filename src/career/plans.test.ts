// Plans and activities (Lyra's relationships redesign, stage 3): making plans from the phone, the half-day they take,
// going (or being stood up), cancelling, gifts, borrowing and lending, sharing the drive, invitations, standing orders.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bringBack } from './cut.testkit';
import { WRESTLERS } from '../data/rtr';
import { activeWorld } from '../world/world';
import { bondOf, ensureBond, likeOf } from '../world/people';
import { answerForMe, ordersOf } from './away';
import { phaseHooks } from './career';
import { activityAt, runPhase } from './day';
import { eligible, ctxFor, eventLibrary } from './events';
import { replyTo } from './mail';
import { cancelMeet, freeSlots, meetsOf, upcoming, type Meet } from './plans';
import { send, threadOf, topicsFor } from './phone';
import { addDays } from './dates';
import { begin, day, quick } from './testkit';
import type { Career } from './types';

// The big cut hid this; the tests bring it back so the code keeps working.
let putBack = (): void => {};
beforeEach(() => { putBack = bringBack(); });
afterEach(() => putBack());

const P = () => activeWorld().people!;
function friend(c: Career, like = 80, fam = 70): string {
  const me = WRESTLERS.find((w) => w.id === c.player)!;
  const w = WRESTLERS.find((x) => x.id !== c.player && x.country === me.country && !bondOf(P(), c.player, x.id) && !c.people[x.id]?.retired)!;
  const b = ensureBond(P(), c.player, w.id, c.today);
  if (b.a === w.id) b.la = like; else b.lb = like;
  b.f = fam;
  return w.id;
}
const meetOn = (c: Career, id: string, kind: 'drinks' | 'meal' | 'gym' = 'meal') => {
  const m: Meet = { id: `m${++c.seq}`, day: c.today, ph: 'pm', with: id, kind, by: 'me', status: 'on' };
  meetsOf(c).push(m);
  return m;
};

describe('plans and activities', () => {
  it('making plans from the phone: what, when (a free half-day this week, both around), who pays', () => {
    const c = begin('jamie_mercer', 7);
    const id = friend(c, 100, 80);
    const opt = topicsFor(c, id).find((x) => x.topic === 'invite')!;
    expect(opt.blocked).toBeUndefined();
    expect(opt.groups!.map((g) => g.name)).toEqual(['What', 'When', 'Who pays']);
    const slot = opt.groups![1]!.options[0]!.id;
    const reply = send(c, id, 'invite', 'warm', `meal|${slot}|me`)!;
    expect(reply).toBeTruthy();
    const made = upcoming(c, id);
    if (reply.note!.includes('your week')) {
      expect(made.length).toBe(1);
      expect(made[0]!.pay).toBe(true);
      const [d, ph] = slot.split('@');
      expect(activityAt(c, d!, ph as 'am' | 'pm')).toBe('social');
      expect(freeSlots(c, id).some((s) => `${s.day}@${s.ph}` === slot)).toBe(false);
    } else expect(made.length).toBe(0);
  });

  it('on the day you go: it costs what it costs, you get closer, and it’s in your thread (unless they flake)', () => {
    const c = begin('jamie_mercer', 7);
    const id = friend(c, 60, 50);
    c.phase = 'pm';
    const m = meetOn(c, id, 'meal');
    expect(activityAt(c, c.today, 'pm')).toBe('social');
    const money = c.money, like = likeOf(P(), id, c.player);
    runPhase(c, 'pm');
    expect(['done', 'flaked']).toContain(m.status);
    if (m.status === 'done') {
      expect(c.money).toBeLessThan(money);
      expect(likeOf(P(), id, c.player)).toBeGreaterThan(like);
      expect(threadOf(c, id).some((x) => x.msg?.sys)).toBe(true);
    }
  });

  it('standing someone up, or cancelling at the last minute, costs you', () => {
    const c = begin('jamie_mercer', 7);
    const a = friend(c, 50, 50), b = friend(c, 50, 50);
    const m = meetOn(c, a);
    phaseHooks(c, 'pm', 'show');
    expect(m.status).toBe('missed');
    expect(likeOf(P(), a, c.player)).toBeLessThan(50);
    const n = meetOn(c, b);
    cancelMeet(c, n.id);
    expect(n.status).toBe('off');
    expect(likeOf(P(), b, c.player)).toBeLessThan(50);
  });

  it('gifts cost money and warm people; borrowing and lending, and getting it back', () => {
    const c = begin('jamie_mercer', 7);
    const id = friend(c, 50, 60);
    const money = c.money;
    send(c, id, 'gift', 'warm', '50');
    expect(c.money).toBeLessThan(money);
    expect(likeOf(P(), id, c.player)).toBeGreaterThan(50);
    // A friend asks to borrow: you lend; when it's due, they pay you back (if they're the sort).
    const lend = { id: `l${++c.seq}`, day: c.today, kind: 'person' as const, from: 'x', fromId: id, subject: 'Lend me?', body: ['Lend me £400?'], read: false, ctx: { who: id, amount: '400' }, replies: [{ id: 'lend_yes', label: 'Lend' }, { id: 'lend_no', label: 'No' }] };
    c.letters.unshift(lend);
    const before = c.money;
    replyTo(c, lend.id, 'lend_yes');
    expect(c.money).toBe(before - 400);
    expect(c.lent!.length).toBe(1);
    c.lent![0]!.repay = true; c.lent![0]!.due = c.today;
    expect(topicsFor(c, id).find((x) => x.topic === 'payback')!.blocked).toBeUndefined();
    send(c, id, 'payback', 'plain');
    expect(c.lent!.length).toBe(0);
    expect(c.money).toBe(before);
  });

  it('sharing the drive to an indie show halves your travel', () => {
    const c = begin('@indie', 7);
    const id = friend(c, 50, 50);
    const show = { id: 'sh1', promo: 'TIS', name: 'Road Trip', kind: 'indie' as const, date: addDays(c.today, 2), country: 'USA', city: 'Chicago', region: 'northAmerica' as const, done: false, card: [{ a: c.player, b: id }] };
    c.shows[show.id] = show;
    c.indie[show.id] = { fee: 300, travel: 200 };
    const opt = topicsFor(c, id).find((x) => x.topic === 'share')!;
    expect(opt.groups![0]!.options[0]!.id).toBe('sh1');
    const l = { id: `l${++c.seq}`, day: c.today, kind: 'person' as const, from: 'x', fromId: id, subject: 'Share?', body: ['Share?'], read: false, ctx: { who: id, show: 'sh1' }, replies: [{ id: 'share_yes', label: 'Yes' }, { id: 'share_no', label: 'No' }] };
    c.letters.unshift(l);
    replyTo(c, l.id, 'share_yes');
    expect(c.indie.sh1!.travel).toBe(100);
  });

  it('people invite you, within the phone’s weekly cap; standing orders say yes to people you’re close to', async () => {
    const c = begin('jamie_mercer', 7);
    for (let i = 0; i < 5; i++) friend(c, 70, 60);
    let invites = 0;
    for (let i = 0; i < 35; i++) {
      await day(c, quick, 'simmed');
      invites += c.letters.filter((l) => l.day === c.today && l.replies?.some((r) => r.id === 'meet_yes')).length;
    }
    expect(invites).toBeGreaterThan(0);
    const open = c.letters.filter((l) => l.replies?.some((r) => r.id === 'meet_yes') && !l.replied && !l.done);
    ordersOf(c).on = true;
    answerForMe(c);
    for (const l of open) expect(l.replied ?? l.done).toBeTruthy();
  });

  it('the old plan-shaped cards are plans now: no more introduction or running-spots cards', () => {
    const c = begin('jamie_mercer', 7);
    const x = ctxFor(c);
    const ids = eligible(x).map((e) => e.d.id);
    expect(eventLibrary().length).toBeGreaterThan(ids.length);
    for (const gone of ['introduction', 'help_prepare', 'private_session', 'mentor_checkin', 'protege_ask']) expect(ids).not.toContain(gone);
  });
});
