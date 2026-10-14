import type { Wrestler } from '../engine/types';
import { M } from './moves';

export const ROSTER: readonly Wrestler[] = [
  {
    id: 'vale', name: 'Ezra Vale', nick: 'The Last Purist', promo: 'VWF', from: 'Pittsburgh', align: 'face', cls: ['tech', 'striker'],
    st: { str: 70, spd: 68, tec: 92, strk: 75, cha: 72, sta: 85 },
    sig: M('Purity Test', 'grapple', 'standing', 'standing', 'head', 9, 1, 'grounded', null, { sig: true }),
    fin: M('Vale Lock', 'hold', 'standing', 'grounded', 'leg', 7, 0, 'grounded', null, { fin: true, sub: true }),
    bio: "Wrestles like it's 1997 and still keeps score in his head.",
  },
  {
    id: 'grist', name: 'Marlowe Grist', nick: "Steel City's Problem", promo: 'ENDEAVOUR', from: 'Sheffield', align: 'heel', cls: ['striker', 'hardcore'],
    st: { str: 78, spd: 62, tec: 60, strk: 90, cha: 80, sta: 82 },
    sig: M('Bad Pint', 'strike', 'standing', 'standing', 'head', 9, 1, 'grounded', null, { sig: true }),
    fin: M('Last Orders', 'strike', 'standing', 'standing', 'head', 13, 1, 'grounded', null, { fin: true }),
    bio: 'Throws hands like closing time. Has never once left quietly.',
  },
  {
    id: 'sol', name: 'Sol Valentina', nick: 'La Golondrina', promo: 'SLN', from: 'Guadalajara', align: 'face', cls: ['flyer'],
    st: { str: 52, spd: 95, tec: 74, strk: 70, cha: 86, sta: 80 },
    sig: M('Ala Rota', 'air', 'standing', 'standing', 'head', 9, 1, 'grounded', null, { sig: true }),
    fin: M('Golondrina', 'air', 'top', 'grounded', 'body', 13, 2, 'grounded', null, { fin: true, selfRes: 'standing' }),
    bio: 'Third generation. Her abuela still rates her moonsault a seven.',
  },
  {
    id: 'barr', name: 'Hollis Barr', nick: 'The Northern Wall', promo: 'TCG', from: 'Thunder Bay', align: 'face', cls: ['power'],
    st: { str: 95, spd: 45, tec: 62, strk: 70, cha: 64, sta: 78 },
    sig: M('Iron Range', 'grapple', 'standing', 'standing', 'body', 10, 1, 'grounded', null, { sig: true }),
    fin: M('Tundra Bomb', 'grapple', 'standing', 'standing', 'body', 13, 1, 'grounded', null, { fin: true }),
    bio: 'Former logger. Lifts people the way other people lift shopping.',
  },
  {
    id: 'renjo', name: 'Kaito Renjo', nick: 'The Quiet Storm', promo: 'NWGP', from: 'Sendai', align: 'heel', cls: ['striker', 'tech'],
    st: { str: 72, spd: 75, tec: 85, strk: 92, cha: 58, sta: 88 },
    sig: M('Raijin Kick', 'strike', 'standing', 'standing', 'head', 9, 1, 'grounded', null, { sig: true }),
    fin: M('Hagane', 'grapple', 'standing', 'standing', 'head', 13, 1, 'grounded', null, { fin: true }),
    bio: "Hasn't said a word on camera in three years. Hasn't needed to.",
  },
  {
    id: 'thorne', name: 'Silas Thorne', nick: 'The Lantern Man', promo: 'IVW', from: 'The Black Forest', align: 'heel', cls: ['hardcore', 'power'],
    st: { str: 88, spd: 50, tec: 64, strk: 74, cha: 90, sta: 84 },
    sig: M('Wick', 'grapple', 'standing', 'standing', 'body', 10, 1, 'grounded', null, { sig: true }),
    fin: M('Snuff', 'grapple', 'standing', 'standing', 'head', 14, 1, 'grounded', null, { fin: true }),
    bio: "Walks out in the dark carrying one lantern. Blows it out when he's done with you.",
  },
  {
    id: 'rook', name: 'Isla Rook', nick: 'The Rook', promo: 'ENDEAVOUR', from: 'Glasgow', align: 'face', cls: ['tech'],
    st: { str: 60, spd: 72, tec: 95, strk: 66, cha: 76, sta: 90 },
    sig: M('Castling', 'grapple', 'standing', 'standing', 'head', 9, 1, 'grounded', null, { sig: true }),
    fin: M('Checkmate', 'hold', 'standing', 'grounded', 'arm', 7, 0, 'grounded', null, { fin: true, sub: true }),
    bio: 'Thinks four moves ahead. The fourth one usually bends your arm the wrong way.',
  },
  {
    id: 'juno', name: 'Juno Vance', nick: 'The Highlight', promo: 'VWF', from: 'Los Angeles', align: 'heel', cls: ['flyer', 'striker'],
    st: { str: 58, spd: 90, tec: 66, strk: 84, cha: 92, sta: 76 },
    sig: M('Clip It', 'strike', 'standing', 'standing', 'head', 9, 1, 'grounded', null, { sig: true }),
    fin: M('Gone Viral', 'air', 'top', 'grounded', 'body', 13, 2, 'grounded', null, { fin: true, selfRes: 'standing' }),
    bio: 'Four million followers. Has filmed a reaction video to her own entrance.',
  },
];

export const DEFAULT_YOU = 'rook';
export const DEFAULT_THEM = 'juno';

export function wrestlerById(id: string): Wrestler | undefined {
  return ROSTER.find((w) => w.id === id);
}
