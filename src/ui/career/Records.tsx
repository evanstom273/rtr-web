import { useMemo, useState } from 'react';
import { REGION_KEY, REGION_LABEL } from '../../career/places';
import { TraitChips } from './Traits';
import { FAN_REGIONS, fansTotal, findWrestler, fmtFans, getMove, globalScore, PROMOTIONS, TITLES, titlesHeldBy, WRESTLERS, worksFor } from '../../data/rtr';
import { askableIndieTitles, askableTitles, GOAL_TEXT, moodLabel, moodOf, person, promoName, readOf, relationOf, type Career } from '../../career';
import { bondsOf, kindOf } from '../../world/people';
import { homeOf, schoolOf } from '../../world/social';
import { ATTR_KEYS, ATTR_LONG, CLASS_NAME, divisionName } from '../../career/create';
import { daysBetween, fmtDay } from '../../career/dates';
import { stipulation } from '../../engine';
import { activeWorld } from '../../world/world';
import { promotionStory, reignsOf, titleLineage, wrestlerHistory, type ArchivedShow, type WorldEvent } from '../../world/history';
import { Head, money, Nm, Screen, useWords } from './parts';
import type { ReqRoute } from './Requests';

interface Props { c: Career; onBack: () => void; onMoveset: () => void; onNewCareer: () => void; onRequest: (r: ReqRoute) => void }

const ORDER = ['VWF', 'TCG', 'NWGP', 'ZWA', 'SLN', 'END', 'IVW', 'SSWC', 'UFC', 'AAWA', 'TIS'];
const REGION_ORDER = ['NORTH_AMERICA', 'SOUTH_AMERICA', 'EUROPE', 'ASIA', 'AFRICA', 'OCEANIA'];
const FINISH: Record<string, string> = {
  PINFALL: 'pinfall', SUBMISSION: 'submission', COUNT_OUT: 'count-out', DOUBLE_COUNT_OUT: 'double count-out', DISQUALIFICATION: 'DQ', TABLES: 'through a table',
  LADDER: 'ladder', CAGE_ESCAPE: 'escaped the cage', TEN_COUNT: 'ten count', I_QUIT: 'I quit', TIME_DECISION: 'time limit',
};
const PAGE = 40;
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const titleName = (id?: string) => TITLES.find((t) => t.id === id)?.name ?? id ?? '';
const promoLabel = (p: string) => (p === 'TIS' ? 'The Indie Scene' : promoName(p));
const initials = (name: string) => name.replace(/"[^"]*"\s*/g, '').split(' ').map((s) => s[0]).join('').slice(0, 2);

type Overlay = { k: 'show'; id: string } | { k: 'title'; id: string } | { k: 'wr'; id: string };

/**
 * Records (the database): today's rosters, and the world's history: every show, every title's lineage,
 * every promotion's story, and any wrestler's file. Read only, except your own moveset.
 */
/** The newer world events (retirements, cups, milestones...), worded to follow a name. */
function otherEvent(e: WorldEvent): { k: string; c: string; t: string } {
  const title = e.title ? TITLES.find((t) => t.id === e.title)?.name ?? e.title : '';
  switch (e.kind) {
    case 'retired': return { k: 'Retired', c: 'c-eff', t: `retired${e.what ? `, ${e.what}` : ''}` };
    case 'returned': return { k: 'Returned', c: 'c-eff up', t: 'came out of retirement' };
    case 'milestone': return { k: 'Milestone', c: 'c-eff gold', t: `reached a milestone: ${e.what ?? ''}` };
    case 'tournament': return { k: 'Cup', c: 'c-eff gold', t: `won ${e.what ?? 'a cup'}` };
    case 'breakthrough': return { k: 'Breakthrough', c: 'c-eff up', t: 'broke through, not long out of training' };
    case 'injured': return { k: 'Injured', c: 'c-eff dn', t: `injured as ${title} champion${e.what ? `, ${e.what}` : ''}` };
    default: return { k: 'Debut', c: 'c-eff', t: 'debuted on The Indie Scene' };
  }
}

const REGION_LABEL_F: Record<string, string> = { northAmerica: 'North America', southAmerica: 'South America', europe: 'Europe', asia: 'Asia', africa: 'Africa', oceania: 'Oceania' };

export function Records({ c, onBack, onMoveset, onNewCareer, onRequest }: Props) {
  const { skin, w } = useWords();
  const H = activeWorld().history;
  const mine = WRESTLERS.find((x) => x.id === c.player)!;
  const [tab, setTab] = useState(0);
  const [pi, setPi] = useState(() => Math.max(0, ORDER.indexOf(mine.promotion)));
  const [sf, setSf] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [pr, setPr] = useState(() => Math.max(0, ORDER.indexOf(mine.promotion)));
  const [stack, setStack] = useState<Overlay[]>([]);
  const [wtab, setWtab] = useState(0);
  const open = (o: Overlay) => { if (o.k === 'wr') setWtab(0); setStack([...stack, o]); };
  const close = () => setStack(stack.slice(0, -1));
  const top = stack[stack.length - 1];
  const vs = skin === 'paper' ? 'v.' : 'VS';
  const tabs = ['Rosters', 'Shows', 'Titles', 'Promotions'];

  // ---- Rosters (as the world stands today) ----
  const promo = PROMOTIONS.find((p) => p.initials === ORDER[pi])!;
  const roster = useMemo(() => WRESTLERS.filter((x) => worksFor(x, promo.initials) && !c.people[x.id]?.retired)
    .sort((a, b) => Number(titlesHeldBy(b).length > 0) - Number(titlesHeldBy(a).length > 0) || globalScore(b) - globalScore(a)), [promo, c.today]);
  const champs = promo.titles.map((id) => TITLES.find((t) => t.id === id)).filter((t) => t?.holder);

  // ---- Shows ----
  const filters = ['ALL', ...ORDER];
  const filt = filters[sf]!;
  const shows = useMemo(() => H.shows.filter((s) => filt === 'ALL' || s.promo === filt || s.promos?.includes(filt)).reverse(), [H.shows.length, filt]);

  // ---- Promotions ----
  const prKey = ORDER[pr]!;
  const story = useMemo(() => promotionStory(H, prKey), [H.events.length, prKey]);
  const prShows = useMemo(() => H.shows.filter((s) => s.promo === prKey || s.promos?.includes(prKey)), [H.shows.length, prKey]);
  const bestBouts = useMemo(() => prShows.flatMap((s) => s.bouts.map((b) => ({ s, b }))).sort((x, y) => y.b.stars - x.b.stars).slice(0, 3), [prShows]);

  const eventLine = (e: WorldEvent): { k: string; c: string; t: string } => {
    switch (e.kind) {
      case 'title': return { k: 'Title', c: 'c-eff gold', t: `${e.name} won the ${titleName(e.title)} at ${e.show}` };
      case 'signed': return { k: 'Signed', c: 'c-eff up', t: `${e.name} signed with ${e.promo}${e.from ? ` from ${e.from}` : ' from The Indie Scene'}` };
      case 'poached': return { k: 'Arrived', c: 'c-eff up', t: e.promo === prKey ? `${e.name} arrived from ${e.from}` : `${e.name} left for ${e.promo}` };
      case 'released': return { k: 'Released', c: 'c-eff dn', t: `${e.name} left ${e.promo}` };
      case 'expired': return { k: 'Left', c: 'c-eff dn', t: `${e.name}’s contract with ${e.promo} ran out` };
      default: { const m = otherEvent(e); return { k: m.k, c: m.c, t: `${e.name} ${m.t}` }; }
    }
  };

  const showRow = (s: ArchivedShow) => {
    const main = s.bouts[s.bouts.length - 1]!;
    const best = Math.max(...s.bouts.map((b) => b.stars));
    const changes = s.bouts.filter((b) => b.newChamp).map((b) => `New champion: ${b.w === 'a' ? b.an : b.bn} (${titleName(b.title)})`);
    return (
      <button key={s.id} className="c-ans" onClick={() => open({ k: 'show', id: s.id })} style={{ padding: '8px 10px' }}>
        <span className="c-rowsb">
          <span className="c-lab">{fmtDay(s.date, 'dm')} {s.date.slice(0, 4)} · {s.promo === 'TIS' ? 'INDIE' : s.promo} · {s.city}</span>
          <span className="c-effs">{s.tag ? <span className="c-eff gold">{s.tag.split(':')[0]}</span> : (s.kind === 'special' || s.kind === 'flagship') && <span className="c-eff gold">{w(s.kind)}</span>}<span className="c-hint">{w('Best')} {best}★</span></span>
        </span>
        <b className="c-at">{s.name}</b>
        <span className="c-vs"><span className="c-hint">{w('Main event:')}</span><Nm id={main.a} name={main.an} plain /><span className="c-vsx">{vs}</span><Nm id={main.b} name={main.bn} plain /></span>
        {changes.length > 0 && <span className="c-ad">{changes.join(' · ')}</span>}
      </button>
    );
  };

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Records' : 'DATABASE'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-steps cols4" style={{ marginTop: 10 }}>
        {tabs.map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t)}</button>)}
      </div>

      {tab === 0 && (
        <>
          <div className="c-cyc" style={{ marginTop: 8 }}>
            <button className="c-stepb" onClick={() => setPi((pi + ORDER.length - 1) % ORDER.length)} aria-label="Previous promotion">‹</button>
            <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{promo.initials === 'TIS' ? w('The Indie Scene') : promo.initials}</b><span className="c-hint">{promo.initials === 'TIS' ? 'Free agents' : promo.name} · {roster.length} wrestlers{promo.popularity !== undefined && promo.initials !== 'TIS' ? ` · popularity ${Math.round(promo.popularity)}` : ''}</span></div>
            <button className="c-stepb" onClick={() => setPi((pi + 1) % ORDER.length)} aria-label="Next promotion">›</button>
          </div>
          <div className="c-body">
            <span className="c-sec">{w('The champions', 'Champions')}</span>
            {champs.map((t) => <button key={t!.id} className="c-rowsb" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => open({ k: 'title', id: t!.id })}><span className="c-lab">{t!.name}</span><Nm id={t!.holder!} /></button>)}
            <div className="c-rowsb"><span className="c-sec c-grow">{w('The roster', 'Roster')}</span><span className="c-hint">{roster.length}</span></div>
            {roster.map((y) => (
              <button key={y.id} className={y.id === c.player ? 'c-ans on' : 'c-ans'} onClick={() => open({ k: 'wr', id: y.id })} style={{ padding: '7px 10px' }}>
                <span className="c-rowsb"><Nm w={y} /><span className="c-hint">{fmtFans(fansTotal(y))} fans</span></span>
                <span className="c-ad">{y.gimmick} · {divisionName(y)} · {y.classes.map((k) => CLASS_NAME[k]).join(' · ')} · {y.country}{person(c, y.id).injury ? ' · injured' : ''}</span>
              </button>
            ))}
            <button className="c-b3" style={{ minHeight: 36 }} onClick={onNewCareer}>{w('Start a new career…')}</button>
          </div>
        </>
      )}

      {tab === 1 && (
        <>
          <div className="c-cyc" style={{ marginTop: 8 }}>
            <button className="c-stepb" onClick={() => { setSf((sf + filters.length - 1) % filters.length); setLimit(PAGE); }} aria-label="Previous promotion">‹</button>
            <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{filt === 'ALL' ? w('Every promotion', 'All promotions') : filt === 'TIS' ? w('The Indie Scene') : filt}</b><span className="c-hint">{shows.length} shows · newest first</span></div>
            <button className="c-stepb" onClick={() => { setSf((sf + 1) % filters.length); setLimit(PAGE); }} aria-label="Next promotion">›</button>
          </div>
          <div className="c-body">
            {shows.length === 0 && <span className="c-note">No shows on record yet. Every show the world puts on is kept here once it’s happened.</span>}
            {shows.slice(0, limit).map(showRow)}
            {shows.length > limit && <button className="c-b3" onClick={() => setLimit(limit + PAGE)}>{w(`Older shows (${shows.length - limit} more)`)}</button>}
          </div>
        </>
      )}

      {tab === 2 && (
        <div className="c-body">
          {ORDER.map((p) => {
            const ts = TITLES.filter((t) => (PROMOTIONS.find((x) => x.id === t.promotionId)?.initials ?? '') === p);
            if (!ts.length) return null;
            // The indie scene's: the worldwide titles, then each region's two.
            const groups: [string | null, typeof ts][] = p === 'TIS'
              ? [[null, ts.filter((t) => !t.region)], ...REGION_ORDER.map((r): [string, typeof ts] => [REGION_LABEL[REGION_KEY[r]!], ts.filter((t) => t.region === r)])]
              : [[null, ts]];
            return (
              <div key={p} style={{ display: 'contents' }}>
                <span className="c-sec">{promoLabel(p)}</span>
                {groups.map(([label, list]) => (<div key={label ?? 'all'} style={{ display: 'contents' }}>
                {label && <span className="c-lab" style={{ marginTop: 6 }}>{w(label)}</span>}
                {list.map((t) => {
                  const line = titleLineage(H, t.id);
                  const cur = line[0];
                  return (
                    <button key={t.id} className="c-ans" onClick={() => open({ k: 'title', id: t.id })} style={{ padding: '7px 10px' }}>
                      <span className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{t.name}</b><span className="c-hint">{line.length} {line.length === 1 ? 'reign' : 'reigns'}</span></span>
                      <span className="c-vs">{t.holder ? <Nm id={t.holder} /> : <span className="c-nl">Vacant</span>}{cur && <span className="c-hint">since {fmtDay(cur.from, 'dm')} · {daysBetween(cur.from, c.today)} {daysBetween(cur.from, c.today) === 1 ? 'day' : 'days'}</span>}</span>
                    </button>
                  );
                })}
                </div>))}
              </div>
            );
          })}
        </div>
      )}

      {tab === 3 && (
        <>
          <div className="c-cyc" style={{ marginTop: 8 }}>
            <button className="c-stepb" onClick={() => setPr((pr + ORDER.length - 1) % ORDER.length)} aria-label="Previous promotion">‹</button>
            <div className="c-fld mid"><b className="c-big" style={{ fontSize: 18 }}>{prKey === 'TIS' ? w('The Indie Scene') : prKey}</b><span className="c-hint">{promoLabel(prKey)}</span></div>
            <button className="c-stepb" onClick={() => setPr((pr + 1) % ORDER.length)} aria-label="Next promotion">›</button>
          </div>
          <div className="c-body">
            <div className="c-statg">
              {[[prShows.length, 'Shows'], [story.filter((e) => e.kind === 'title').length, 'Title changes'], [story.filter((e) => ['signed', 'poached', 'released', 'expired', 'retired', 'returned'].includes(e.kind)).length, 'Roster moves']].map(([v, l]) => (
                <div key={l} className="c-statc"><b className="c-sbig" style={{ fontSize: 22 }}>{v}</b><span className="c-lab">{w(String(l))}</span></div>
              ))}
            </div>
            <span className="c-sec">{w('Best matches')}</span>
            {bestBouts.length === 0 && <span className="c-note">Nothing on record yet.</span>}
            {bestBouts.map(({ s, b }, i) => (
              <button key={i} className="c-led" style={{ gridTemplateColumns: '54px minmax(0, 1fr) auto', background: 'none', border: 0, textAlign: 'left', color: 'inherit' }} onClick={() => open({ k: 'show', id: s.id })}>
                <span className="c-hint">{fmtDay(s.date, 'dm')}</span>
                <span style={{ display: 'flex', flexDirection: 'column' }}><span className="c-vs"><Nm id={b.a} name={b.an} plain /><span className="c-vsx">{vs}</span><Nm id={b.b} name={b.bn} plain /></span><span className="c-hint">{s.name}</span></span>
                <b className="c-big" style={{ fontSize: 16 }}>{b.stars}★</b>
              </button>
            ))}
            <span className="c-sec">{w('The story so far', 'Timeline')}</span>
            {story.length === 0 && <span className="c-note">No title changes or roster moves yet.</span>}
            {story.slice(0, 60).map((e, i) => {
              const x = eventLine(e);
              return (
                <button key={i} className="c-led" style={{ gridTemplateColumns: '54px minmax(0, 1fr)', background: 'none', border: 0, textAlign: 'left', color: 'inherit' }} onClick={() => open(e.kind === 'title' && e.title ? { k: 'title', id: e.title } : { k: 'wr', id: e.who })}>
                  <span className="c-hint">{fmtDay(e.day, 'dm')}</span>
                  <span className="c-val"><span className={x.c}>{w(x.k)}</span> {x.t}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={() => open({ k: 'wr', id: c.player })}>{w('My history')}</button></div>

      {top?.k === 'show' && <ShowCard id={top.id} onClose={close} onWrestler={(id) => open({ k: 'wr', id })} />}
      {top?.k === 'title' && <Lineage id={top.id} today={c.today} onClose={close} onWrestler={(id) => open({ k: 'wr', id })}
        onAsk={askableTitles(c).some((t) => t.id === top.id) ? () => onRequest({ req: 'title', title: top.id })
          : askableIndieTitles(c).some((t) => t.id === top.id) ? () => onRequest({ req: 'title', title: top.id, indie: true }) : undefined} />}
      {top?.k === 'wr' && <File id={top.id} c={c} tab={wtab} setTab={setWtab} onClose={close} onShow={(id) => open({ k: 'show', id })} onTitle={(id) => open({ k: 'title', id })} onMoveset={onMoveset}
        onChallenge={() => onRequest({ req: 'challenge', target: top.id })} />}
    </Screen>
  );
}

/** A past show's full card and results. */
function ShowCard({ id, onClose, onWrestler }: { id: string; onClose: () => void; onWrestler: (id: string) => void }) {
  const { skin, w } = useWords();
  const s = activeWorld().history.shows.find((x) => x.id === id);
  if (!s) return null;
  const vs = skin === 'paper' ? 'v.' : 'VS';
  return (
    <div className="c-ovl">
      <div className="c-top"><button className="c-back" onClick={onClose} aria-label="Back">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'The Card' : 'SHOW'}</div><span className="c-meta">{fmtDay(s.date, 'dm')}</span></div>
      <div className="c-mast">The Card</div>
      <div className="c-start" style={{ marginTop: 10 }}><span className="c-lab">{w(`${promoLabel(s.promo)} · ${s.kind}`)}</span><b className="c-sbig">{s.name}</b><span className="c-val">{s.city}, {s.country} · {fmtDay(s.date, 'long')}</span></div>
      <div className="c-body">
        {s.bouts.map((b, i) => {
          const winner = b.w === 'a' ? b.an : b.w === 'b' ? b.bn : null;
          return (
            <div key={i} className={b.newChamp ? 'c-ans on' : 'c-ans'}>
              <div className="c-rowsb">
                <span className="c-lab">{w(i === s.bouts.length - 1 ? 'Main event' : i === 0 ? 'Opener' : `Match ${i + 1}`)}</span>
                <span className="c-effs">
                  {b.title && <span className="c-eff gold">{titleName(b.title)}</span>}
                  {b.newChamp && <span className="c-eff up">{w('New champion')}</span>}
                  {b.stip && <span className="c-eff">{stipulation(b.stip).name}</span>}
                </span>
              </div>
              <span className="c-vs">
                <button style={{ background: 'none', border: 0, padding: 0 }} onClick={() => onWrestler(b.a)}><Nm id={b.a} name={b.an} plain /></button>
                <span className="c-vsx">{vs}</span>
                <button style={{ background: 'none', border: 0, padding: 0 }} onClick={() => onWrestler(b.b)}><Nm id={b.b} name={b.bn} plain /></button>
              </span>
              <span className="c-ad">{winner ? `${winner} wins` : 'Draw'} · {FINISH[b.finish] ?? b.finish} · {clock(b.t)} · {b.stars}★{b.move ? ` · ${b.move}` : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onClose}>{w('‹ Back')}</button><button className="c-b1" onClick={onClose}>{w('Done')}</button></div>
    </div>
  );
}

/** A title's lineage: every reign since records began. */
function Lineage({ id, today, onClose, onWrestler, onAsk }: { id: string; today: string; onClose: () => void; onWrestler: (id: string) => void; onAsk?: () => void }) {
  const { skin, w } = useWords();
  const t = TITLES.find((x) => x.id === id);
  const line = titleLineage(activeWorld().history, id);
  if (!t) return null;
  const p = PROMOTIONS.find((x) => x.id === t.promotionId)?.initials ?? '';
  const began = line[line.length - 1]?.from;
  return (
    <div className="c-ovl">
      <div className="c-top"><button className="c-back" onClick={onClose} aria-label="Back">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'The Lineage' : 'TITLE HISTORY'}</div><span className="c-meta">{p}</span></div>
      <div className="c-mast">The Lineage</div>
      <div className="c-start" style={{ marginTop: 10 }}>
        <span className="c-lab">{promoLabel(p)}</span>
        <b className="c-sbig">{t.name}</b>
        <span className="c-val">{line.length} {line.length === 1 ? 'reign' : 'reigns'}{began ? ` since records began (${fmtDay(began, 'long')})` : ''} · champion now: {t.holder ? findWrestler(t.holder)?.name : 'vacant'}</span>
      </div>
      <div className="c-body">
        {line.map((r, i) => {
          const held = daysBetween(r.from, r.to ?? today);
          return (
            <button key={i} className={i === 0 ? 'c-ans on' : 'c-ans'} onClick={() => onWrestler(r.holder)}>
              <div className="c-rowsb">{i === 0 ? <Nm id={r.holder} name={r.name} /> : <Nm id={r.holder} name={r.name} plain />}<span className="c-hint">{held} days</span></div>
              <span className="c-ad">{fmtDay(r.from, 'long')} → {r.to ? fmtDay(r.to, 'long') : 'now'}</span>
              <span className="c-effs">
                <span className="c-eff">{r.defences} {r.defences === 1 ? 'defence' : 'defences'}</span>
                <span className={r.won ? 'c-eff' : 'c-eff gold'}>{r.won ? `${w('Won from')} ${r.won.fromName ?? 'vacant'} · ${r.won.show}` : w('Champion when records began')}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onClose}>{w('‹ Back')}</button>{onAsk ? <button className="c-b1" onClick={onAsk}>{w('Ask for a shot ›')}</button> : <button className="c-b1" onClick={onClose}>{w('Done')}</button>}</div>
    </div>
  );
}

/** Any wrestler's file: today's profile, and their matches, title reigns and moves on record. */
/**
 * Their life (Lyra's call: news and profiles): where they live and trained, what they're after, how they seem
 * (if you know them well enough to tell), and who they're close to, compete with and can't stand.
 */
function Life({ c, id }: { c: Career; id: string }) {
  const { w } = useWords();
  const x = findWrestler(id)!;
  const W = activeWorld();
  const P = W.people;
  const life = P?.lives?.[id];
  const me = id === c.player;
  const home = homeOf(W.seed, id, x.country, life);
  const school = schoolOf(W.seed, id, x.country);
  const nameOf = (o: string) => findWrestler(o)?.name ?? P?.staff[o]?.name ?? P?.folk?.[o]?.name ?? o;
  const list = (want: (k: ReturnType<typeof kindOf>, theirs: number) => boolean) => (P ? bondsOf(P, id) : [])
    .filter((b) => !P!.folk?.[b.other] && want(kindOf(b.bond, c.today), b.bond.a === id ? b.bond.la : b.bond.lb))
    .sort((a, b) => Math.abs((b.bond.a === id ? b.bond.la : b.bond.lb)) - Math.abs((a.bond.a === id ? a.bond.la : a.bond.lb))).slice(0, 4).map((b) => nameOf(b.other));
  const close = list((k) => k === 'best_friend' || k === 'friend');
  const rivals = list((k) => k === 'rival');
  const hates = list((_k, l) => l <= -60);
  const mentor = P ? bondsOf(P, id).find((b) => b.bond.mentor) : undefined;
  const goal = me ? undefined : life?.goal;
  const read = me ? 'clear' : readOf(relationOf(c, id));
  return (
    <>
      <span className="c-sec">{w('Life')}</span>
      <div className="c-kv">
        <span className="c-lab">{w('Lives in')}</span><span className="c-val">{home ? `${home}, ` : ''}{me ? c.base ?? x.country : x.country}</span>
        <span className="c-lab">{w('Trained at')}</span><span className="c-val">{school.name}</span>
        {goal && <><span className="c-lab">{w('After')}</span><span className="c-val">{GOAL_TEXT[goal.kind]}{goal.kind === 'even' && goal.on ? `: ${nameOf(goal.on)}` : ''}</span></>}
        <span className="c-lab">{w(me ? 'Wellbeing' : 'Seems')}</span><span className="c-val">{read === 'none' ? 'Hard to say: you don’t know them well enough' : moodLabel(moodOf(id))}</span>
        {close.length > 0 && <><span className="c-lab">{w('Close to')}</span><span className="c-val">{close.join(', ')}</span></>}
        {rivals.length > 0 && <><span className="c-lab">{w('Rivals')}</span><span className="c-val">{rivals.join(', ')}</span></>}
        {hates.length > 0 && <><span className="c-lab">{w('Can’t stand')}</span><span className="c-val">{hates.join(', ')}</span></>}
        {mentor && <><span className="c-lab">{w(mentor.bond.mentor === id ? 'Mentoring' : 'Mentored by')}</span><span className="c-val">{nameOf(mentor.other)}</span></>}
      </div>
    </>
  );
}

function File({ id, c, tab, setTab, onClose, onShow, onTitle, onMoveset, onChallenge }: {
  id: string; c: Career; tab: number; setTab: (n: number) => void; onClose: () => void; onShow: (id: string) => void; onTitle: (id: string) => void; onMoveset: () => void; onChallenge: () => void;
}) {
  const { skin, w } = useWords();
  const x = findWrestler(id);
  const H = activeWorld().history;
  const matches = useMemo(() => wrestlerHistory(H, id), [H.shows.length, id]);
  if (!x) return null;
  const p = person(c, id);
  const reigns = reignsOf(H, id).reverse();
  const moves = H.events.filter((e) => e.who === id && e.kind !== 'title').reverse();
  const wins = matches.filter((m) => m.result === 'win').length, losses = matches.filter((m) => m.result === 'loss').length;
  const avg = matches.length ? (matches.reduce((t, m) => t + m.stars, 0) / matches.length).toFixed(1) : '—';
  const best = Math.max(...ATTR_KEYS.map((k) => x.stats[k]));
  const tabs = ['Matches', 'Titles', 'Moves', 'Profile'];
  return (
    <div className="c-ovl">
      <div className="c-top"><button className="c-back" onClick={onClose} aria-label="Back">{skin === 'paper' ? '‹ Back' : '‹'}</button><div className="c-ttl">{skin === 'paper' ? 'The File' : 'WRESTLER'}</div><span className="c-meta">{x.promotion}</span></div>
      <div className="c-mast">The File</div>
      <div className="c-who">
        <div className="c-ini">{initials(x.name)}</div>
        <div className="c-whot">
          <span className="c-tag">{x.disposition} · {divisionName(x)} · {x.classes.map((k) => CLASS_NAME[k]).join(' · ')}</span>
          <Nm w={x} cls="c-nm" />
          <span className="c-sub"><i>{x.gimmick}</i> · {x.age} · {x.country}</span>
          <TraitChips traits={x.traits} />
          <span className="c-status">{p.retired ? `Retired${p.retiredOn ? ` ${fmtDay(p.retiredOn, 'dm')} ${p.retiredOn.slice(0, 4)}` : ''}` : p.retiring ? `Retiring after ${fmtDay(p.retiring, 'dm')}` : x.promotion === 'TIS' ? 'Free agent' : `Signed to ${x.promotion}${p.contract ? ` to ${fmtDay(p.contract.end, 'dm')} ${p.contract.end.slice(0, 4)}` : ''}`}{p.injury ? ` · injured to ${fmtDay(p.injury.until, 'dm')}` : ''} · {matches.length} matches on file</span>
        </div>
      </div>
      <div className="c-statg" style={{ marginTop: 8 }}>
        {[[`${wins}–${losses}`, 'Record'], [`${avg}★`, 'Average'], [String(reigns.length), 'Title reigns']].map(([v, l]) => (
          <div key={l} className="c-statc"><b className="c-sbig" style={{ fontSize: 22 }}>{v}</b><span className="c-lab">{w(l!)}</span></div>
        ))}
      </div>
      <div className="c-steps cols4" style={{ marginTop: 8 }}>
        {tabs.map((t, i) => <button key={t} className={i === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(i)}>{w(t)}</button>)}
      </div>
      <div className="c-body">
        {tab === 0 && (matches.length ? matches.slice(0, 200).map((m, i) => (
          <button key={i} className="c-led" style={{ gridTemplateColumns: '54px minmax(0, 1fr) auto', background: 'none', border: 0, textAlign: 'left', color: 'inherit' }} onClick={() => onShow(m.showId)}>
            <span className="c-hint">{fmtDay(m.day, 'dm')}</span>
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="c-vs"><span className={m.result === 'win' ? 'c-eff up' : m.result === 'loss' ? 'c-eff dn' : 'c-eff'}>{w(m.result === 'win' ? 'beat' : m.result === 'loss' ? 'lost to' : 'drew')}</span><Nm id={m.opp} name={m.oppName} plain /></span>
              <span className="c-hint">{m.show}{m.title ? ` · ${titleName(m.title)}` : ''}</span>
            </span>
            <b className="c-big" style={{ fontSize: 16 }}>{m.stars}★</b>
          </button>
        )) : <span className="c-note">No matches on file yet.</span>)}
        {tab === 1 && (reigns.length ? reigns.map((r, i) => (
          <button key={i} className={r.to === null ? 'c-ans on' : 'c-ans'} onClick={() => onTitle(r.title)}>
            <div className="c-rowsb"><b className="c-at" style={{ fontSize: 15 }}>{titleName(r.title)}</b><span className="c-hint">{daysBetween(r.from, r.to ?? c.today)} days</span></div>
            <span className="c-ad">{fmtDay(r.from, 'long')} → {r.to ? fmtDay(r.to, 'long') : 'now'} · {r.defences} {r.defences === 1 ? 'defence' : 'defences'}</span>
            <span className="c-effs"><span className={r.won ? 'c-eff' : 'c-eff gold'}>{r.won ? `Won from ${r.won.fromName ?? 'vacant'} · ${r.won.show}` : 'Champion when records began'}</span></span>
          </button>
        )) : <span className="c-note">No title reigns on file.</span>)}
        {tab === 2 && (moves.length ? moves.map((e, i) => (
          <div key={i} className="c-led" style={{ gridTemplateColumns: '54px minmax(0, 1fr)' }}>
            <span className="c-hint">{fmtDay(e.day, 'dm')}</span>
            <span className="c-val">{e.kind === 'signed' ? `Signed with ${e.promo}${e.from ? ` from ${e.from}` : ''}` : e.kind === 'poached' ? `Moved from ${e.from} to ${e.promo}` : e.kind === 'released' ? `Left ${e.promo}` : e.kind === 'expired' ? `Contract with ${e.promo} ran out` : (() => { const t = otherEvent(e).t; return t[0]!.toUpperCase() + t.slice(1); })()}</span>
          </div>
        )) : <span className="c-note">No moves since records began.</span>)}
        {tab === 3 && (
          <>
            {titlesHeldBy(x).length > 0 && <div className="c-warn">Holds the {titlesHeldBy(x).map((t) => t.name).join(' and the ')}</div>}
            <span className="c-sec">{w('Attributes')}</span>
            {ATTR_KEYS.map((k, i) => <div key={k} className="c-frow" style={{ gridTemplateColumns: '90px minmax(0, 1fr) 28px' }}><span className="c-lab">{ATTR_LONG[i]}</span><span className="c-bar"><i className={x.stats[k] === best ? 'c-fill best' : 'c-fill'} style={{ width: `${x.stats[k]}%` }} /></span><b className="c-big">{x.stats[k]}</b></div>)}
            <div className="c-kv">
              <span className="c-lab">{w('Fans')}</span><span className="c-val">{fmtFans(fansTotal(x))} worldwide · most in {REGION_LABEL_F[FAN_REGIONS.reduce((a, b) => (x.fans[b] > x.fans[a] ? b : a))]}</span>
              <span className="c-lab">{w('Reputation')}</span><span className="c-val">{Math.round(p.rep)}</span>
              <span className="c-lab">{w('Finishers')}</span><span className="c-val">{x.finishers.map((m) => getMove(m).name).join(', ')}</span>
              <span className="c-lab">{w('Signatures')}</span><span className="c-val">{x.signatures.map((m) => getMove(m).name).join(', ')}</span>
              {x.id === c.player && <><span className="c-lab">{w('Bank')}</span><span className="c-val">{money(c.money)}</span></>}
            </div>
            <Life c={c} id={x.id} />
          </>
        )}
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onClose}>{w('‹ Back')}</button>
        {x.id === c.player ? <button className="c-b1" onClick={onMoveset}>{w('Edit your moveset ›', 'Edit moveset ›')}</button> : <button className="c-b1" onClick={onChallenge}>{w('Challenge ›')}</button>}
      </div>
    </div>
  );
}
