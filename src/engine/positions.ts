import type { Move, Side } from './types';

export const costMult = (a: Side): number => 1.3 - a.st.sta / 200;

export const avgHP = (d: Side): number => (d.hp.head + d.hp.body + d.hp.arm + d.hp.leg) / 4;

/** Can attacker `a` do move `m` to defender `d` from where they both are? */
export function posOk(a: Pick<Side, 'pos'>, d: Pick<Side, 'pos'>, m: Move): boolean {
  return m.self === a.pos && (m.tgt === d.pos || (m.tgt === 'standing' && d.pos === 'corner' && m.cat === 'strike'));
}

/** Signature needs sigReady, finisher needs a banked finisher. */
export function ready(a: Side, m: Move): boolean {
  return m.sig ? a.sigReady : m.fin ? a.finStock > 0 : true;
}

export const pinOk = (a: Side, d: Side): boolean => a.pos === 'standing' && d.pos === 'grounded';
