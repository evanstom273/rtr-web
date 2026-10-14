import type { BodyPart, Position, WrestlerClass } from '../engine/types';

export const CLS: Readonly<Record<WrestlerClass, string>> = {
  flyer: 'High Flyer', power: 'Powerhouse', tech: 'Technician', striker: 'Striker', hardcore: 'Hardcore',
};
export const POS: Readonly<Record<Position, string>> = {
  standing: 'On their feet', grounded: 'Down on the mat', corner: 'Trapped in the corner', top: 'Up on the top rope', outside: 'Out on the floor',
};
export const PL: Readonly<Record<BodyPart, string>> = { head: 'head', body: 'midsection', arm: 'arm', leg: 'leg' };
