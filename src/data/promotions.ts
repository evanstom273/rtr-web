import type { PromoId, Promotion } from '../engine/types';

export const PROMOS: Readonly<Record<PromoId, Promotion>> = {
  VWF: { event: 'VWF Overdrive', cities: ['New York', 'Chicago', 'Los Angeles'], title: 'VWF Championship' },
  ENDEAVOUR: { event: 'ENDEAVOUR: Heavy Weather', cities: ['Leeds', 'Glasgow', 'Cardiff', 'Sheffield'], title: 'British Heavyweight Championship' },
  SLN: { event: 'SLN Noche de Fuego', cities: ['Mexico City', 'Guadalajara'], title: 'Anillo Mundial' },
  TCG: { event: 'TCG Cold Open', cities: ['Calgary', 'Montreal', 'Toronto'], title: 'TCG Heavyweight Championship' },
  NWGP: { event: 'NWGP Wrestle Ascension', cities: ['Osaka', 'Tokyo'], title: 'NWGP Global Championship' },
  IVW: { event: 'IVW Untergrund', cities: ['Berlin', 'Hamburg'], title: 'King of Europe Championship' },
};

/** Cross-promotion matches. */
export const DREAM_MATCH = {
  event: 'The Indie Scene: Dream Match',
  title: 'World Independent Championship',
};
