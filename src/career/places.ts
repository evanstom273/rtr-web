// Where shows happen: countries, their regions (for popularity and travel) and host cities.
import type { PopRegion } from './types';

export const REGION_OF: Record<string, PopRegion> = {
  USA: 'northAmerica', Canada: 'northAmerica', Mexico: 'northAmerica',
  Argentina: 'southAmerica', Brazil: 'southAmerica', Chile: 'southAmerica',
  UK: 'europe', Spain: 'europe', France: 'europe', Germany: 'europe', Italy: 'europe', Other: 'europe',
  Japan: 'asia', China: 'asia', 'South Korea': 'asia', India: 'asia',
  Nigeria: 'africa', Egypt: 'africa', Ghana: 'africa', 'South Africa': 'africa',
  Australia: 'oceania', 'New Zealand': 'oceania', Samoa: 'oceania',
};

/** Promotion regions in the data ('NORTH_AMERICA'…) as popularity keys. */
export const REGION_KEY: Record<string, PopRegion> = {
  NORTH_AMERICA: 'northAmerica', SOUTH_AMERICA: 'southAmerica', EUROPE: 'europe', ASIA: 'asia', AFRICA: 'africa', OCEANIA: 'oceania',
};

export const REGION_LABEL: Record<PopRegion, string> = {
  northAmerica: 'North America', southAmerica: 'South America', europe: 'Europe', asia: 'Asia', africa: 'Africa', oceania: 'Oceania',
};

export const CITIES: Record<string, string[]> = {
  USA: ['Philadelphia', 'Chicago', 'Brooklyn', 'Atlanta', 'Las Vegas', 'Houston'],
  Canada: ['Toronto', 'Montreal', 'Calgary', 'Vancouver', 'Winnipeg'],
  Mexico: ['Mexico City', 'Monterrey', 'Guadalajara', 'Tijuana', 'Puebla'],
  Argentina: ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza'],
  Brazil: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Recife'],
  Chile: ['Santiago', 'Valparaíso', 'Concepción'],
  UK: ['London', 'Glasgow', 'Leeds', 'Manchester', 'Cardiff', 'Belfast'],
  Spain: ['Madrid', 'Barcelona', 'Valencia', 'Seville'],
  France: ['Paris', 'Lyon', 'Marseille', 'Lille'],
  Germany: ['Berlin', 'Hamburg', 'Cologne', 'Munich'],
  Italy: ['Rome', 'Milan', 'Naples', 'Turin'],
  Japan: ['Tokyo', 'Osaka', 'Nagoya', 'Sapporo', 'Fukuoka'],
  China: ['Shanghai', 'Beijing', 'Guangzhou', 'Chengdu', 'Shenzhen'],
  'South Korea': ['Seoul', 'Busan', 'Incheon'],
  India: ['Mumbai', 'Delhi', 'Bengaluru', 'Kolkata'],
  Nigeria: ['Lagos', 'Abuja', 'Ibadan'],
  Egypt: ['Cairo', 'Alexandria', 'Giza', 'Luxor'],
  Ghana: ['Accra', 'Kumasi'],
  'South Africa': ['Johannesburg', 'Cape Town', 'Durban'],
  Australia: ['Sydney', 'Melbourne', 'Brisbane', 'Perth'],
  'New Zealand': ['Auckland', 'Wellington', 'Christchurch'],
  Samoa: ['Apia'],
};

/** Each promotion's touring countries (the first is home). */
export const PROMO_COUNTRIES: Record<string, string[]> = {
  VWF: ['USA'],
  TCG: ['Canada'],
  SLN: ['Mexico'],
  END: ['UK'],
  IVW: ['UK', 'Germany', 'France', 'Spain', 'Italy'],
  NWGP: ['Japan'],
  ZWA: ['China'],
  UFC: ['Samoa', 'New Zealand', 'Australia'],
  SSWC: ['Argentina', 'Chile', 'Brazil'],
  AAWA: ['Egypt', 'Nigeria', 'Ghana', 'South Africa'],
};

export const regionOfCountry = (c: string): PopRegion => REGION_OF[c] ?? 'europe';
