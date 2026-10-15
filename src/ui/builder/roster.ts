// Match builder roster: the Godot filters and sorts (match_setup_popup.gd), over the imported data.
import { CLASS_LABEL } from '../../data/commentary';
import { PROMOTIONS, TITLES, WRESTLERS, getPromotion, isChampion, titlesHeldBy, type Popularity, type Wrestler, type WrestlerClass } from '../../data/rtr';

export type SortMode =
  | 'alpha' | 'alpha-desc' | 'strength' | 'speed' | 'stamina' | 'skill' | 'striking' | 'charisma'
  | 'pop-global' | 'pop-northAmerica' | 'pop-southAmerica' | 'pop-europe' | 'pop-asia' | 'pop-africa' | 'pop-oceania';

export const SORTS: { id: SortMode; label: string; short?: string }[] = [
  { id: 'alpha', label: 'Alphabetical A–Z' },
  { id: 'alpha-desc', label: 'Alphabetical Z–A' },
  { id: 'strength', label: 'Strength', short: 'STR' },
  { id: 'speed', label: 'Speed', short: 'SPD' },
  { id: 'stamina', label: 'Stamina', short: 'STA' },
  { id: 'skill', label: 'Skill', short: 'SKL' },
  { id: 'striking', label: 'Striking', short: 'STK' },
  { id: 'charisma', label: 'Charisma', short: 'CHA' },
  { id: 'pop-global', label: 'Global popularity', short: 'POP' },
  { id: 'pop-northAmerica', label: 'North America pop.', short: 'N.AM' },
  { id: 'pop-southAmerica', label: 'South America pop.', short: 'S.AM' },
  { id: 'pop-europe', label: 'Europe pop.', short: 'EUR' },
  { id: 'pop-asia', label: 'Asia pop.', short: 'ASIA' },
  { id: 'pop-africa', label: 'Africa pop.', short: 'AFR' },
  { id: 'pop-oceania', label: 'Oceania pop.', short: 'OCE' },
];

export interface Filters {
  q: string;
  country: string;
  cls: WrestlerClass | '';
  gender: '' | 'MALE' | 'FEMALE';
  promotion: string;
  disposition: '' | 'FACE' | 'HEEL';
  /** '' all, 'champ', 'non', or a title id. */
  title: string;
  sort: SortMode;
}

export const NO_FILTERS: Filters = { q: '', country: '', cls: '', gender: '', promotion: '', disposition: '', title: '', sort: 'alpha' };

export const activeFilterCount = (f: Filters): number =>
  [f.country, f.cls, f.gender, f.promotion, f.disposition, f.title].filter(Boolean).length;

export const COUNTRIES = [...new Set(WRESTLERS.map((w) => w.country).filter(Boolean))].sort((a, b) => a.localeCompare(b));
export const CLASSES = Object.keys(CLASS_LABEL) as WrestlerClass[];
export const PROMOTION_LIST = [...PROMOTIONS].sort((a, b) => a.initials.localeCompare(b.initials));
export const TITLE_LIST = [...TITLES].sort((a, b) => a.name.localeCompare(b.name));

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Names sort without their nickname quotes, so "Macho" Martínez files under M. */
const sortName = (w: Wrestler) => fold(w.name.replace(/^"[^"]*"\s*/, '').replace(/"/g, ''));

const searchText = new Map<string, string>();
function haystack(w: Wrestler): string {
  let t = searchText.get(w.id);
  if (!t) {
    const promo = getPromotion(w.promotion);
    t = fold([
      w.name, w.gimmick, w.gimmickDescription, w.country, w.regionLabel, w.promotion, promo?.name ?? '',
      ...w.classes.map((c) => CLASS_LABEL[c]), w.disposition === 'HEEL' ? 'heel' : 'face',
      w.gender === 'FEMALE' ? 'female women womens' : 'male men mens',
      ...titlesHeldBy(w).map((x) => x.name), isChampion(w) ? 'champion' : '',
    ].join(' '));
    searchText.set(w.id, t);
  }
  return t;
}

export function sortValue(w: Wrestler, sort: SortMode): number | null {
  if (sort === 'alpha' || sort === 'alpha-desc') return null;
  if (sort.startsWith('pop-')) return w.popularity[sort.slice(4) as keyof Popularity];
  return w.stats[sort as keyof Wrestler['stats']];
}

export function filterRoster(f: Filters): Wrestler[] {
  const terms = fold(f.q.trim()).split(/\s+/).filter(Boolean);
  const list = WRESTLERS.filter((w) =>
    (!f.country || w.country === f.country)
    && (!f.cls || w.classes.includes(f.cls))
    && (!f.gender || w.gender === f.gender)
    && (!f.promotion || w.promotion === f.promotion)
    && (!f.disposition || w.disposition === f.disposition)
    && (!f.title || (f.title === 'champ' ? isChampion(w) : f.title === 'non' ? !isChampion(w) : titlesHeldBy(w).some((t) => t.id === f.title)))
    && terms.every((t) => haystack(w).includes(t)),
  );
  const byName = (a: Wrestler, b: Wrestler) => sortName(a).localeCompare(sortName(b));
  if (f.sort === 'alpha') return list.sort(byName);
  if (f.sort === 'alpha-desc') return list.sort((a, b) => byName(b, a));
  return list.sort((a, b) => (sortValue(b, f.sort) ?? 0) - (sortValue(a, f.sort) ?? 0) || byName(a, b));
}
