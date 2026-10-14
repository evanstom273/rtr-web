import { MOVES } from '../data/moves';
import { DREAM_MATCH, PROMOS } from '../data/promotions';
import { HEAT_WORDS, PHASES } from '../data/commentary';
import { format } from './commentary';
import { pick, type Rng } from './rng';
import type { MatchState, MatchStats, MatchView, Side, SideKey, SideView, Stakes, Wrestler } from './types';

export function mkSide(w: Wrestler, key: SideKey): Side {
  return {
    key, w, name: w.name, cls: w.cls, st: w.st, align: w.align, sig: w.sig, fin: w.fin,
    hp: { head: 100, body: 100, arm: 100, leg: 100 }, stamina: 100, momentum: 0, sigReady: false, finStock: 0, pos: 'standing',
    used: {}, lastMove: null, recentParts: [], partHits: { head: 0, body: 0, arm: 0, leg: 0 }, fkAbsorbed: 0, firedUp: false, comeback: 0,
    cheapCd: 0, tauntCd: 0, setupRun: 0, landed: 0, focus: null,
    moves: MOVES.filter((m) => !m.cls || m.cls.some((c) => w.cls.includes(c))),
  };
}

export function eventFor(rnd: Rng, a: Wrestler, b: Wrestler): { event: string; venue: string; titleName: string } {
  if (a.promo === b.promo) {
    const p = PROMOS[a.promo];
    return { event: p.event, venue: pick(rnd, p.cities), titleName: p.title };
  }
  const p = PROMOS[pick(rnd, [a.promo, b.promo])];
  return { event: DREAM_MATCH.event, venue: pick(rnd, p.cities), titleName: DREAM_MATCH.title };
}

function emptyStats(): MatchStats {
  return {
    heatSum: 0, heatN: 0, heatPeak: 0, reversals: 0, finRev: 0, nf: 0, fk: 0, crashes: 0, high: 0, spots: 0, rest: 0, repeats: 0,
    maxStreak: { you: 0, them: 0 }, heatSeg: null, comeback: null, fireUp: null, pins: 0, earlyPins: 0, subs: 0, limbPayoff: false, finAttemptsSeen: false,
  };
}

let nextId = 1;

export function createState(rnd: Rng, you: Wrestler, them: Wrestler, stakes: Stakes): MatchState {
  const ev = eventFor(rnd, you, them);
  const S: MatchState = {
    id: nextId++,
    you: mkSide(you, 'you'),
    them: mkSide(them, 'them'),
    t: 0, beat: 0, ctrl: null, over: false,
    heat: stakes === 'title' ? 45 : 35,
    stats: emptyStats(),
    streak: { who: null, n: 0 },
    event: ev.event, venue: ev.venue, title: stakes === 'title', titleName: ev.titleName,
    meterDir: 1, lastLanded: null, outsideBeats: 0, miles: [],
    result: null, rating: null,
    pending: { kind: 'idle' },
    log: [], events: [],
    view: undefined as unknown as MatchView,
    seq: 0,
  };
  S.view = snapshot(S);
  return S;
}

/* ---------- view ---------- */

export function phase(S: MatchState): string {
  const st = S.stats, mins = S.t / 60;
  if (S.over) return PHASES.over;
  if (mins >= 16 || st.finAttemptsSeen) return PHASES.finishing;
  if (st.comeback) return PHASES.comeback;
  if (st.heatSeg) return format(PHASES.control, { x: S[st.heatSeg].name.split(' ')[0] ?? '' });
  if (mins < 4) return PHASES.feelingOut;
  return PHASES.backAndForth;
}

export function heatWord(h: number): string {
  for (const [lim, word] of HEAT_WORDS) if (h < lim) return word;
  return HEAT_WORDS[HEAT_WORDS.length - 1]?.[1] ?? '';
}

function sideView(w: Side): SideView {
  return {
    key: w.key, name: w.name, cls: w.cls, align: w.align, hp: { ...w.hp }, stamina: w.stamina, momentum: w.momentum,
    sigReady: w.sigReady, finStock: w.finStock, pos: w.pos,
  };
}

export function snapshot(S: MatchState): MatchView {
  return { t: S.t, heat: S.heat, ctrl: S.ctrl, over: S.over, phase: phase(S), sides: { you: sideView(S.you), them: sideView(S.them) } };
}
