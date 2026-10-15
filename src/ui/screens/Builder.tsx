import { useCallback, useMemo, useState } from 'react';
import { CLASS_LABEL } from '../../data/commentary';
import { TITLES, WRESTLERS, findWrestler, getPromotion, type Wrestler } from '../../data/rtr';
import type { Hit } from '../../storage/greatestHits';
import { useBackLayer } from '../backStack';
import { Profile } from '../builder/Profile';
import {
  CLASSES, COUNTRIES, NO_FILTERS, PROMOTION_LIST, SORTS, TITLE_LIST, activeFilterCount, filterRoster, sortValue, type Filters, type SortMode,
} from '../builder/roster';
import { MAX_TEAM, type BuilderState } from '../builder/state';
import { useDragSort, type DragItem, type DropTarget, type TeamKey } from '../builder/useDragSort';
import { Name } from '../common/Name';
import { buzz, classNames } from '../format';
import { GreatestHits } from '../GreatestHits';

interface Props {
  state: BuilderState;
  hits: Hit[];
  onChange: (s: BuilderState) => void;
  onStart: () => void;
}

const CLOCKS = [10, 15, 20, 25, 30];
const OTHER: Record<TeamKey, TeamKey> = { A: 'B', B: 'A' };

/** The promotion whose titles can be on the line. */
function titleHost(s: BuilderState): string {
  if (s.event !== 'auto') return s.event;
  const a = findWrestler(s.teams.A[0] ?? ''), b = findWrestler(s.teams.B[0] ?? '');
  if (a && b) return a.promotion === b.promotion ? a.promotion : 'TIS';
  return '';
}

function holderName(promotionInitials: string, holderId: number): string {
  if (!holderId) return 'Vacant';
  const w = WRESTLERS.find((x) => x.promotion === promotionInitials && x.wrestlerId === holderId);
  return w ? `held by ${w.name}` : 'Vacant';
}

export function Builder({ state: s, hits, onChange, onStart }: Props) {
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [profile, setProfile] = useState<Wrestler | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [info, setInfo] = useState(false);
  useBackLayer(showRules, () => setShowRules(false));
  const list = useMemo(() => filterRoster(f), [f]);
  const teamOf = useCallback((id: string): TeamKey | null => (s.teams.A.includes(id) ? 'A' : s.teams.B.includes(id) ? 'B' : null), [s.teams]);
  const set = (patch: Partial<BuilderState>) => onChange({ ...s, ...patch });

  const place = useCallback((id: string, to: TeamKey | null, index: number | null = null) => {
    const teams = { A: s.teams.A.filter((x) => x !== id), B: s.teams.B.filter((x) => x !== id) };
    const from = teamOf(id);
    if (from && s.locked[from]) return buzz(40);
    if (to) {
      if (s.locked[to]) return buzz(40);
      if (teams[to].length >= MAX_TEAM) return buzz(40);
      const at = index === null ? teams[to].length : Math.min(index - (from === to && s.teams[to].indexOf(id) < index ? 1 : 0), teams[to].length);
      teams[to].splice(Math.max(0, at), 0, id);
    }
    onChange({ ...s, teams });
  }, [s, onChange, teamOf]);

  const onTap = useCallback((item: DragItem) => setProfile(findWrestler(item.id) ?? null), []);
  const onDrop = useCallback((item: DragItem, target: DropTarget | null) => {
    if (!target) return;
    if (target.zone === 'roster') {
      if (item.from !== 'roster') place(item.id, null);
      return;
    }
    place(item.id, target.zone, target.index);
  }, [place]);
  const { drag, handle } = useDragSort(onTap, onDrop);

  const pickRandom = (exclude: Set<string>) => {
    const pool = list.filter((w) => !exclude.has(w.id));
    const from = pool.length ? pool : WRESTLERS.filter((w) => !exclude.has(w.id));
    return from[Math.floor(Math.random() * from.length)]!.id;
  };
  const randomTeam = (t: TeamKey, base = s) => {
    if (base.locked[t]) return base;
    const id = pickRandom(new Set(base.teams[OTHER[t]]));
    return { ...base, teams: { ...base.teams, [t]: [id] } };
  };
  const randomMatch = () => onChange(randomTeam('B', randomTeam('A')));

  const a = s.teams.A, b = s.teams.B;
  const status = !a.length ? 'Team A needs one wrestler.' : !b.length ? 'Team B needs one wrestler.'
    : a.length > 1 || b.length > 1 ? 'Tag matches aren’t in yet — one wrestler per team for now.' : '';
  const ready = !status;
  const host = titleHost(s);
  const hostPromo = getPromotion(host);
  const titles = hostPromo ? hostPromo.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t): t is NonNullable<typeof t> => !!t) : [];
  const titleValid = !s.titleId || titles.some((t) => t.id === s.titleId);
  const nFilters = activeFilterCount(f);
  const eventLabel = s.event === 'auto' ? 'Auto event' : s.event === '' ? 'Independent' : s.event;
  const titleName = titleValid && s.titleId ? titles.find((t) => t.id === s.titleId)?.name : '';
  const summary = `${s.countOuts ? `Count-outs (${s.countOutLimit})` : 'No count-outs'} · ${s.actionClock}s · ${eventLabel}${titleName ? ` · ${titleName}` : ''}`;
  const sortShort = SORTS.find((x) => x.id === f.sort)?.short;

  const team = (t: TeamKey) => (
    <div className={`bd-team t${t}${s.locked[t] ? ' locked' : ''}${drag?.target?.zone === t ? ' over' : ''}`} data-drop={t}>
      <div className="bd-team-head">
        <span className="bd-team-name">
          Team {t} <small>{t === 'A' ? 'you' : 'AI'}</small>
        </span>
        <button className={`bd-lock${s.locked[t] ? ' on' : ''}`} aria-pressed={s.locked[t]} onClick={() => set({ locked: { ...s.locked, [t]: !s.locked[t] } })}>
          {s.locked[t] ? 'Locked' : 'Lock'}
        </button>
      </div>
      <ol className="bd-members">
        {s.teams[t].map((id, i) => {
          const w = findWrestler(id);
          if (!w) return null;
          const dragging = drag?.item.id === id;
          return (
            <li key={id} data-drop-index={i} className={`bd-member${dragging ? ' ghosted' : ''}${drag?.target?.zone === t && drag.target.index === i ? ' insert' : ''}`}
              {...handle({ id, from: t })}>
              <span className="bd-num">{i + 1}</span>
              <Name w={w} side={t === 'A' ? 'you' : 'them'} />
              <button className="bd-x" aria-label={`Remove ${w.name}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => place(id, null)} disabled={s.locked[t]}>
                ✕
              </button>
            </li>
          );
        })}
        {!s.teams[t].length && <li className="bd-empty">Drop a wrestler here</li>}
      </ol>
    </div>
  );

  return (
    <section id="setup" className={`builder${drag ? ' is-dragging' : ''}`}>
        <header className="bd-top">
          <h1 className="bd-title">
            Match <span>builder</span>
          </h1>
          <button className={`bd-sum${showRules ? ' on' : ''}`} onClick={() => setShowRules((x) => !x)} aria-expanded={showRules}>
            {summary}
          </button>
          <button className="ghost sm bd-info" onClick={() => setInfo(true)}>
            Info
          </button>
        </header>

        {showRules && (
        <div className="bd-panel bd-rules">
          <div className="bd-row">
            <span className="bd-label">Rules</span>
            <span className="bd-fixed">Standard</span>
            <label className="tog">
              <input type="checkbox" checked={s.countOuts} onChange={(e) => set({ countOuts: e.target.checked })} />
              Count-outs
            </label>
            <label className="bd-limit">
              Count to
              <input type="number" min={5} max={20} value={s.countOutLimit} disabled={!s.countOuts}
                onChange={(e) => set({ countOutLimit: Math.max(5, Math.min(20, Number(e.target.value) || 10)) })} />
            </label>
            <label className="bd-limit">
              Clock step
              <select value={s.actionClock} onChange={(e) => set({ actionClock: Number(e.target.value) })}>
                {CLOCKS.map((c) => (
                  <option key={c} value={c}>
                    {c} sec
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="bd-row">
            <span className="bd-label">Event</span>
            <select value={s.event} onChange={(e) => set({ event: e.target.value, titleId: '' })} aria-label="Presenting promotion">
              <option value="auto">Auto — their promotion, or a dream match</option>
              <option value="">Independent — no presenting promotion</option>
              {PROMOTION_LIST.map((p) => (
                <option key={p.initials} value={p.initials}>
                  {p.initials} — {p.name}
                </option>
              ))}
            </select>
            <select value={titleValid ? s.titleId : ''} onChange={(e) => set({ titleId: e.target.value })} disabled={!titles.length} aria-label="Title on the line">
              <option value="">Non-title match</option>
              {titles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {holderName(host, t.holderId)}
                </option>
              ))}
            </select>
          </div>
        </div>

        )}

        <div className="bd-main">
          <div className="bd-panel bd-roster">
            <input type="search" className="bd-search" placeholder="Search name, country, region, class, face/heel, title…" value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Search wrestlers" />
            <div className="bd-tools">
              <button className={`ghost sm${nFilters ? ' on' : ''}`} onClick={() => setShowFilters((x) => !x)} aria-expanded={showFilters}>
                Filters{nFilters ? ` (${nFilters})` : ''}
              </button>
              <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as SortMode })} aria-label="Sort">
                {SORTS.map((o) => (
                  <option key={o.id} value={o.id}>
                    Sort: {o.label}
                  </option>
                ))}
              </select>
            </div>
            {showFilters && (
              <div className="bd-filters">
                <select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} aria-label="Country">
                  <option value="">All countries</option>
                  {COUNTRIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select value={f.cls} onChange={(e) => setF({ ...f, cls: e.target.value as Filters['cls'] })} aria-label="Class">
                  <option value="">All classes</option>
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>
                      {CLASS_LABEL[c]}
                    </option>
                  ))}
                </select>
                <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as Filters['gender'] })} aria-label="Gender">
                  <option value="">All genders</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
                <select value={f.promotion} onChange={(e) => setF({ ...f, promotion: e.target.value })} aria-label="Promotion">
                  <option value="">All promotions</option>
                  {PROMOTION_LIST.map((p) => (
                    <option key={p.initials} value={p.initials}>
                      {p.initials} — {p.name}
                    </option>
                  ))}
                </select>
                <select value={f.disposition} onChange={(e) => setF({ ...f, disposition: e.target.value as Filters['disposition'] })} aria-label="Face or heel">
                  <option value="">Face or heel</option>
                  <option value="FACE">Face</option>
                  <option value="HEEL">Heel</option>
                </select>
                <select value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Title status">
                  <option value="">All title status</option>
                  <option value="champ">Champions only</option>
                  <option value="non">Non-champions</option>
                  {TITLE_LIST.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {nFilters > 0 && (
                  <button className="ghost sm" onClick={() => setF({ ...NO_FILTERS, q: f.q, sort: f.sort })}>
                    Clear filters
                  </button>
                )}
              </div>
            )}
            <p className="count">
              {list.length} {list.length === 1 ? 'wrestler' : 'wrestlers'} · tap: profile · hold: drag
            </p>
            <ul className={`bd-list${drag?.target?.zone === 'roster' && drag.item.from !== 'roster' ? ' over' : ''}`} data-drop="roster" data-autoscroll>
              {list.map((w) => {
                const t = teamOf(w.id);
                const v = sortValue(w, f.sort);
                return (
                  <li key={w.id} className={`bd-row-w${drag?.item.id === w.id ? ' ghosted' : ''}`} {...handle({ id: w.id, from: 'roster' })}
                    role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setProfile(w)}>
                    <span className="bd-w">
                      <Name w={w} />
                      <small>
                        {w.promotion} · {classNames(w.classes)} · {w.country}
                      </small>
                    </span>
                    {v !== null && (
                      <span className="bd-stat">
                        {sortShort} <b>{v}</b>
                      </span>
                    )}
                    {t && <span className={`bd-badge t${t}`}>{t}</span>}
                  </li>
                );
              })}
              {!list.length && <li className="bd-empty">No wrestlers match these filters</li>}
            </ul>
          </div>

          <div className="bd-dock">
            <div className="bd-teams">
              {team('A')}
              {team('B')}
            </div>
            <p className={`bd-status${ready ? ' ok' : ''}`}>
              {ready ? `${findWrestler(a[0]!)!.name} vs ${findWrestler(b[0]!)!.name}` : status}
            </p>
            <div className="bd-actions">
              <button className="ghost sm" onClick={randomMatch}>
                Random match
              </button>
              <button className="ghost sm" onClick={() => onChange(randomTeam('A'))} disabled={s.locked.A}>
                Random A
              </button>
              <button className="ghost sm" onClick={() => onChange(randomTeam('B'))} disabled={s.locked.B}>
                Random B
              </button>
              <button className="primary bd-start" disabled={!ready} onClick={onStart}>
                Ring the bell
              </button>
            </div>
          </div>
        </div>


      {drag && (
        <div className="bd-ghost" style={{ transform: `translate(${drag.x}px, ${drag.y}px)` }}>
          {findWrestler(drag.item.id)?.name}
          <small>
            {drag.target?.zone === 'A' || drag.target?.zone === 'B'
              ? s.locked[drag.target.zone] ? `Team ${drag.target.zone} is locked` : `→ Team ${drag.target.zone}`
              : drag.item.from !== 'roster' && drag.target?.zone === 'roster' ? 'Remove from team' : 'Drop on a team'}
          </small>
        </div>
      )}
      {info && <InfoSheet hits={hits} onClose={() => setInfo(false)} />}
      {profile && (
        <Profile w={profile} team={teamOf(profile.id)} locked={s.locked}
          onAdd={(t) => { place(profile.id, t); setProfile(null); }}
          onRemove={() => { place(profile.id, null); setProfile(null); }}
          onClose={() => setProfile(null)} />
      )}
    </section>
  );
}

/** How it works and greatest hits, out of the way of the builder. */
function InfoSheet({ hits, onClose }: { hits: Hit[]; onClose: () => void }) {
  useBackLayer(true, onClose);
  return (
    <div className="wheel-ov" onClick={onClose}>
      <div className="movepanel info-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mp-head">
          <span />
          <h3>How it works</h3>
          <button className="ghost sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="howto">
          <ul>
            <li>Tap a wrestler for their profile. Hold and drag them into Team A (you) or Team B (the AI) — or use the buttons in the profile. Drag a team member back to the roster to remove them. Lock a team to keep it when you hit Random.</li>
              <li>Every wrestler has a position, orientation, area and motion. Moves only work from the right ones — use Setup to get there.</li>
              <li>Moves come off the radial wheel, grouped by type. Pick a body part to focus and work it over: six parts, each wears down.</li>
              <li>Every move and contested setup is a contested roll: the attacker rolls a d20, the defender a d16, and both add modifiers — the right attribute for the move, momentum, exhaustion, body-part damage, position. Highest wins, the attacker wins ties. A natural 20 is a critical, a natural 16 on defence is a reversal, and a natural 1 is a botch.</li>
              <li>Setting someone up, or catching them off the ropes, staggering or still rising, is +2 on your roll. Advantage (roll two, keep the best) only comes from spending 20 momentum to push. Repeat the same move and the defender sees it coming and gets advantage for free.</li>
              <li>50 momentum banks your signature; 100 banks a finisher. Land your signature and you can cash in 50 momentum for a finisher. Each is one use.</li>
              <li>Land a hold and choose: go for the tap (win it, or they escape and take over) or work the hold for guaranteed limb damage and keep control. Technicians are best at it.</li>
              <li>Land a pin combo and choose whether to hook the leg — the card shows your real chance of the three. Pinned? Hold, then let go in the gold before three. In a hold? Mash — eight taps a second is the cap.</li>
              <li>Kickouts come from condition: a fresh wrestler kicks out of nearly anything; wear them down first.</li>
              <li>Your first 100 momentum earns a one-use Resiliency: burn it to survive a three or a tap.</li>
            </ul>
        </div>
        <div className="hits">
          <GreatestHits hits={hits} title="Greatest hits" />
        </div>
      </div>
    </div>
  );
}
