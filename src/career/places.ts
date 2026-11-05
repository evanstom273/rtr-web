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

/** Regions next door, for who travels where. */
export const NEIGHBOURS: Record<PopRegion, PopRegion[]> = {
  northAmerica: ['southAmerica'], southAmerica: ['northAmerica'], europe: ['africa', 'asia'], africa: ['europe'], asia: ['oceania', 'europe'], oceania: ['asia'],
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

/** Life: where each city is (latitude, longitude), for how far a trip is. */
export const CITY_GEO: Record<string, [number, number]> = {
  Philadelphia: [39.95, -75.17], Chicago: [41.88, -87.63], Brooklyn: [40.68, -73.94], Atlanta: [33.75, -84.39], 'Las Vegas': [36.17, -115.14], Houston: [29.76, -95.37],
  Toronto: [43.65, -79.38], Montreal: [45.5, -73.57], Calgary: [51.05, -114.07], Vancouver: [49.28, -123.12], Winnipeg: [49.9, -97.14],
  'Mexico City': [19.43, -99.13], Monterrey: [25.69, -100.32], Guadalajara: [20.67, -103.35], Tijuana: [32.51, -117.04], Puebla: [19.04, -98.21],
  'Buenos Aires': [-34.6, -58.38], Córdoba: [-31.42, -64.18], Rosario: [-32.94, -60.65], Mendoza: [-32.89, -68.83],
  'São Paulo': [-23.55, -46.63], 'Rio de Janeiro': [-22.91, -43.17], 'Belo Horizonte': [-19.92, -43.94], Recife: [-8.05, -34.9],
  Santiago: [-33.45, -70.67], Valparaíso: [-33.05, -71.62], Concepción: [-36.83, -73.05],
  London: [51.51, -0.13], Glasgow: [55.86, -4.25], Leeds: [53.8, -1.55], Manchester: [53.48, -2.24], Cardiff: [51.48, -3.18], Belfast: [54.6, -5.93],
  Madrid: [40.42, -3.7], Barcelona: [41.39, 2.17], Valencia: [39.47, -0.38], Seville: [37.39, -5.98],
  Paris: [48.86, 2.35], Lyon: [45.76, 4.84], Marseille: [43.3, 5.37], Lille: [50.63, 3.06],
  Berlin: [52.52, 13.4], Hamburg: [53.55, 9.99], Cologne: [50.94, 6.96], Munich: [48.14, 11.58],
  Rome: [41.9, 12.5], Milan: [45.46, 9.19], Naples: [40.85, 14.27], Turin: [45.07, 7.69],
  Tokyo: [35.68, 139.69], Osaka: [34.69, 135.5], Nagoya: [35.18, 136.91], Sapporo: [43.06, 141.35], Fukuoka: [33.59, 130.4],
  Shanghai: [31.23, 121.47], Beijing: [39.9, 116.41], Guangzhou: [23.13, 113.26], Chengdu: [30.57, 104.07], Shenzhen: [22.54, 114.06],
  Seoul: [37.57, 126.98], Busan: [35.18, 129.08], Incheon: [37.46, 126.71],
  Mumbai: [19.08, 72.88], Delhi: [28.7, 77.1], Bengaluru: [12.97, 77.59], Kolkata: [22.57, 88.36],
  Lagos: [6.52, 3.38], Abuja: [9.08, 7.4], Ibadan: [7.38, 3.95], Cairo: [30.04, 31.24], Alexandria: [31.2, 29.92], Giza: [30.01, 31.21], Luxor: [25.69, 32.64],
  Accra: [5.6, -0.19], Kumasi: [6.69, -1.62], Johannesburg: [-26.2, 28.05], 'Cape Town': [-33.92, 18.42], Durban: [-29.86, 31.02],
  Sydney: [-33.87, 151.21], Melbourne: [-37.81, 144.96], Brisbane: [-27.47, 153.03], Perth: [-31.95, 115.86],
  Auckland: [-36.85, 174.76], Wellington: [-41.29, 174.78], Christchurch: [-43.53, 172.64], Apia: [-13.83, -171.76],
};

/** A city for a country (its first), or the region's first city for countries without any (the 'Other'). */
export function cityFor(country: string): string {
  const own = CITIES[country]?.[0];
  if (own) return own;
  const region = REGION_OF[country] ?? 'europe';
  const near = Object.keys(CITIES).find((k) => REGION_OF[k] === region);
  return near ? CITIES[near]![0]! : 'London';
}

/** How far apart two cities are (km, great circle). Unknown cities count as their country's first. */
export function cityKm(a: string, b: string): number {
  if (a === b) return 0;
  const p = CITY_GEO[a], q = CITY_GEO[b];
  if (!p || !q) return 0;
  const r = Math.PI / 180, dLat = (q[0] - p[0]) * r, dLon = (q[1] - p[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p[0] * r) * Math.cos(q[0] * r) * Math.sin(dLon / 2) ** 2;
  return Math.round(12742 * Math.asin(Math.min(1, Math.sqrt(h))));
}
