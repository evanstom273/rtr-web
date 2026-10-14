import { wrestlerById } from '../../data/roster';
import { mkSide } from '../state';
import type { Side, SideKey } from '../types';

export function side(id: string, key: SideKey = 'you'): Side {
  const w = wrestlerById(id);
  if (!w) throw new Error(id);
  return mkSide(w, key);
}

export function move(s: Side, name: string) {
  const m = [...s.moves, s.sig, s.fin].find((x) => x.name === name);
  if (!m) throw new Error(`${s.name} has no ${name}`);
  return m;
}
