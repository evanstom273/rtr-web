import { useMemo, useState } from 'react';
import { FEATURES } from '../../career/tuning';
import {
  alliancesOf, companyOf, createTitle, cupPairs, cupRoundName, cupsOf, DIVISION_LABEL, dispositionLabel, dropStory, formAlliance, isMajorTier, renameTitle, retireTitle, setDivision, setPayoff,
  showsToBook, startCup, startStory, storiesOf, storyLabel, titleLimit, titlesOf, turn, unifyTitles, vacateTitle, type Career, type Division,
} from '../../career';
import { fansIn, findWrestler, WRESTLERS, type Disposition, type Wrestler } from '../../data/rtr';
import { fmtDay } from '../../career/dates';
import { regionOfCountry } from '../../career/places';
import { activeWorld } from '../../world/world';
import { commit, useWords } from './parts';

const nm = (id: string | null | undefined) => (id ? findWrestler(id)?.name ?? id : 'Vacant');

/** Everyone who works a promotion's shows: its roster and, for a small one, free agents from its home region. */
function peopleFor(c: Career, promo: string): Wrestler[] {
  const co = companyOf(promo);
  const region = co?.home ? regionOfCountry(co.home.country) : Object.values(c.shows).find((s) => s.promo === promo)?.region;
  const small = co && !isMajorTier(co.tier);
  return WRESTLERS.filter((w) => !c.people[w.id]?.retired && (w.promotion === promo || w.also?.includes(promo) || w.id === c.player || (small && w.promotion === 'TIS' && !!region && fansIn(w, region) > 0)))
    .sort((a, b) => (region ? fansIn(b, region) - fansIn(a, region) : 0)).slice(0, 80);
}

function Pick({ value, set, pool, label, blank }: { value: string; set: (v: string) => void; pool: Wrestler[]; label: string; blank?: string }) {
  return (
    <select className="c-fld" value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
      {blank !== undefined && <option value="">{blank}</option>}
      {pool.map((w) => <option key={w.id} value={w.id}>{w.name} ({dispositionLabel(w.disposition).toLowerCase()})</option>)}
    </select>
  );
}

/** The Stories tab (booker mode, stage 3): storylines and their heat, turns, alliances. */
export function OfficeStories({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const pool = useMemo(() => peopleFor(c, promo), [c, promo]);
  const stories = storiesOf(c, promo);
  const ended = c.feuds.filter((f) => f.promo === promo && f.by === 'player' && f.done).slice(-3).reverse();
  const shows = showsToBook(c, promo, 70);
  const [a, setA] = useState(pool[1]?.id ?? '');
  const [b, setB] = useState(pool[2]?.id ?? '');
  const [who, setWho] = useState(pool[0]?.id ?? '');
  const [x, setX] = useState(pool[3]?.id ?? '');
  const [y, setY] = useState(pool[4]?.id ?? '');
  const act = (s: string) => { say(s); commit(); };
  const allies = alliancesOf(c, promo).filter((al) => !al.broke);
  return (
    <>
      <span className="c-sec">{w('Storylines')} · {stories.length}</span>
      {stories.length ? stories.map((f) => (
        <div key={f.id} className="c-ans" style={{ padding: '6px 8px' }}>
          <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{storyLabel(f)}</b><span className="c-hint">heat {f.heat ?? 0}</span></span>
          <span className="c-meter" style={{ display: 'block', height: 6, background: 'var(--cr-panel2)', margin: '4px 0' }}><span style={{ display: 'block', height: 6, width: `${f.heat ?? 0}%`, background: (f.heat ?? 0) >= 60 ? 'var(--cr-bad)' : (f.heat ?? 0) >= 30 ? 'var(--cr-hi)' : 'var(--cr-dim)' }} /></span>
          {(f.beats ?? []).slice(0, 2).map((x2, i) => <span key={i} className="c-ad">{fmtDay(x2.day, 'dm')} · {x2.t}{x2.d ? ` (${x2.d > 0 ? '+' : ''}${x2.d})` : ''}</span>)}
          <span className="c-rowsb" style={{ marginTop: 4, gap: 6 }}>
            <select className="c-fld" value={f.payoff ?? ''} onChange={(e) => act(setPayoff(c, f.id, e.target.value || null))} aria-label="Pays off at" style={{ flex: 1 }}>
              <option value="">{w('No payoff set')}</option>
              {shows.map((s) => <option key={s.id} value={s.id}>Pays off: {s.name} · {fmtDay(s.date, 'dm')}</option>)}
            </select>
            <button className="c-chip" onClick={() => act(dropStory(c, f.id))}>{w('Drop')}</button>
          </span>
        </div>
      )) : <span className="c-note">No storylines. Start one: segments and matches between them build the heat; a week with nothing cools it.</span>}
      {ended.map((f) => <span key={f.id} className="c-hint">{storyLabel(f)} · {f.ended === 'blowoff' ? 'paid off' : f.ended === 'cold' ? 'went cold' : 'dropped'}</span>)}
      <span className="c-sec">{w('Start a storyline')}</span>
      <Pick value={a} set={setA} pool={pool} label="First" />
      <Pick value={pool.some((p) => p.id === b && p.gender === findWrestler(a)?.gender) ? b : ''} set={setB} pool={pool.filter((p) => p.id !== a && p.gender === findWrestler(a)?.gender)} label="Second" blank="Against…" />
      <button className="c-b3" onClick={() => act(startStory(c, promo, a, b))}>{w('Start it ›')}</button>

      <span className="c-sec">{w('Turns')}</span>
      <Pick value={who} set={setWho} pool={pool} label="Who turns" />
      <div className="c-chips">
        {(['FACE', 'HEEL', 'NONE'] as Disposition[]).map((d) => <button key={d} className="c-chip" disabled={findWrestler(who)?.disposition === d} onClick={() => act(turn(c, promo, who, d))}>{w(`Turn ${dispositionLabel(d).toLowerCase()}`)}</button>)}
      </div>
      <span className="c-note">Show it on the next show (a promo, a run-in, a betrayal) and it lands. Turn the same person back and forth and the crowd stops caring.</span>

      <span className="c-sec">{w('Alliances')} · {allies.length}</span>
      {allies.map((al) => <span key={al.id} className="c-val">{nm(al.a)} & {nm(al.b)} · since {fmtDay(al.since, 'dm')}</span>)}
      <Pick value={x} set={setX} pool={pool} label="Ally one" />
      <Pick value={y} set={setY} pool={pool.filter((p) => p.id !== x)} label="Ally two" />
      <button className="c-b3" onClick={() => act(formAlliance(c, promo, x, y))}>{w('Team them up')}</button>
      <span className="c-note">Book a Betrayal segment between them to break it up: a storyline starts red hot.</span>
    </>
  );
}

const DIVS = Object.keys(DIVISION_LABEL) as Division[];

/** The Titles tab (booker mode, stage 3): your belts, new ones, unifying, tournaments. */
export function OfficeTitles({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const titles = titlesOf(promo);
  const reigns = activeWorld().history.reigns;
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [div, setDiv] = useState<Division>('world');
  const [kind, setKind] = useState<'singles' | 'tag' | 'trios' | 'hardcore'>('singles');
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState('');
  const [keep, setKeep] = useState(titles[0]?.id ?? '');
  const [absorb, setAbsorb] = useState(titles[1]?.id ?? '');
  const [cupName, setCupName] = useState('');
  const [size, setSize] = useState<4 | 8>(8);
  const [cupGender, setCupGender] = useState<'MALE' | 'FEMALE'>('MALE');
  const [cupTeams, setCupTeams] = useState(false);
  const [prize, setPrize] = useState('');
  const act = (s: string) => { say(s); commit(); };
  const cups = cupsOf(c, promo).slice(-3);
  return (
    <>
      <span className="c-sec">{w('Titles')} · {titles.length} of {titleLimit(promo)}</span>
      {titles.length ? titles.map((t) => {
        const r = reigns[t.id]?.find((x) => x.to === null);
        return (
          <div key={t.id} className="c-ans" style={{ padding: '6px 8px' }}>
            <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{t.name}</b><span className="c-hint">{DIVISION_LABEL[t.division ?? (t.gender === 'FEMALE' ? 'women' : 'world')]}</span></span>
            <span className="c-ad">{t.holder ? `${nm(t.holder)}${r ? ` · since ${fmtDay(r.from, 'dm')} · ${r.defences} defence${r.defences === 1 ? '' : 's'}` : ''}` : 'Vacant'}</span>
            {editing === t.id ? (
              <>
                <input className="c-fld" value={rename} maxLength={50} onChange={(e) => setRename(e.target.value)} aria-label="New name" />
                <div className="c-chips">{DIVS.map((d) => <button key={d} className={`c-chip${t.division === d ? ' on' : ''}`} onClick={() => act(setDivision(c, t.id, d))}>{w(DIVISION_LABEL[d])}</button>)}</div>
                <div className="c-chips">
                  <button className="c-chip" onClick={() => { act(renameTitle(c, t.id, rename)); setEditing(null); }}>{w('Rename')}</button>
                  <button className="c-chip" disabled={!t.holder} onClick={() => act(vacateTitle(c, t.id))}>{w('Vacate')}</button>
                  <button className="c-chip" onClick={() => { act(retireTitle(c, t.id)); setEditing(null); }}>{w('Retire it')}</button>
                  <button className="c-chip" onClick={() => setEditing(null)}>{w('Done')}</button>
                </div>
              </>
            ) : <button className="c-chip" style={{ marginTop: 4 }} onClick={() => { setEditing(t.id); setRename(t.name); }}>{w('Change ›')}</button>}
          </div>
        );
      }) : <span className="c-note">No titles yet.</span>}

      <span className="c-sec">{w('A new title')}</span>
      <input className="c-fld" value={name} maxLength={50} placeholder="Championship name" onChange={(e) => setName(e.target.value)} aria-label="Title name" />
      <div className="c-chips">{(['MALE', 'FEMALE'] as const).map((g) => <button key={g} className={`c-chip${gender === g ? ' on' : ''}`} onClick={() => setGender(g)}>{w(g === 'MALE' ? 'Men' : 'Women')}</button>)}</div>
      <div className="c-chips">{DIVS.map((d) => <button key={d} className={`c-chip${div === d ? ' on' : ''}`} onClick={() => setDiv(d)}>{w(DIVISION_LABEL[d])}</button>)}</div>
      {FEATURES.matches && <div className="c-chips">{(['singles', 'tag', 'trios', 'hardcore'] as const).map((k) => <button key={k} className={`c-chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{w(KIND_LABEL[k])}</button>)}</div>}
      <button className="c-b3" onClick={() => { act(createTitle(c, promo, { name, gender, division: div, kind })); setName(''); }}>{w('Create it ›')}</button>

      {titles.length > 1 && (
        <>
          <span className="c-sec">{w('Unify two')}</span>
          <select className="c-fld" value={keep} onChange={(e) => setKeep(e.target.value)} aria-label="Keep">{titles.map((t) => <option key={t.id} value={t.id}>Keep: {t.name}</option>)}</select>
          <select className="c-fld" value={absorb} onChange={(e) => setAbsorb(e.target.value)} aria-label="Fold in">{titles.filter((t) => t.id !== keep).map((t) => <option key={t.id} value={t.id}>Fold in: {t.name}</option>)}</select>
          <button className="c-b3" onClick={() => act(unifyTitles(c, keep, absorb))}>{w('Unify')}</button>
        </>
      )}

      <span className="c-sec">{w('Tournaments')}</span>
      {cups.map((cup) => (
        <div key={cup.id} className="c-ans" style={{ padding: '6px 8px' }}>
          <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{cup.name}</b><span className="c-hint">{cup.winner ? `Won by ${nm(cup.winner)}` : `${cup.size} in`}</span></span>
          {Array.from({ length: cup.size === 8 ? 3 : 2 }, (_, r) => (
            <span key={r} className="c-ad">{cupRoundName(cup, r)} ({c.shows[cup.shows[r]!] ? fmtDay(c.shows[cup.shows[r]!]!.date, 'dm') : '—'}): {cupPairs(cup, r).map(([p, q], i) => `${p ? nm(p) : 'TBD'} v ${q ? nm(q) : 'TBD'}${cup.won[r]?.[i] ? ` → ${nm(cup.won[r]![i])}` : ''}`).join(' · ') || 'to come'}</span>
          ))}
        </div>
      ))}
      <input className="c-fld" value={cupName} maxLength={40} placeholder="Tournament name" onChange={(e) => setCupName(e.target.value)} aria-label="Tournament name" />
      <div className="c-chips">
        {([4, 8] as const).map((n) => <button key={n} className={`c-chip${size === n ? ' on' : ''}`} onClick={() => setSize(n)}>{n} {w('in')}</button>)}
        {(['MALE', 'FEMALE'] as const).map((g) => <button key={g} className={`c-chip${cupGender === g ? ' on' : ''}`} onClick={() => setCupGender(g)}>{w(g === 'MALE' ? 'Men' : 'Women')}</button>)}
        {FEATURES.matches && <button className={`c-chip${cupTeams ? ' on' : ''}`} onClick={() => { setCupTeams(!cupTeams); setPrize(''); }}>{w('Tag teams')}</button>}
      </div>
      <select className="c-fld" value={prize} onChange={(e) => setPrize(e.target.value)} aria-label="Prize">
        <option value="">{w('For bragging rights')}</option>
        {titles.filter((t) => (t.gender === 'FEMALE') === (cupGender === 'FEMALE') && (t.kind === 'tag') === cupTeams).map((t) => <option key={t.id} value={t.id}>{t.holder ? `A shot at the ${t.name}` : `The vacant ${t.name}`}</option>)}
      </select>
      <button className="c-b3" onClick={() => act(startCup(c, promo, { name: cupName || `${promo} ${cupTeams ? 'Tag Cup' : 'Cup'}`, size, gender: cupGender, prize: prize || undefined, teams: cupTeams }))}>{w('Start it ›')}</button>
      <span className="c-note">A round on each of your next shows: the biggest names in the division go in, seeded. The cup matches go first on each card.</span>
    </>
  );
}

const KIND_LABEL = { singles: 'Singles', tag: 'Tag team', trios: 'Trios', hardcore: 'Hardcore' } as const;
