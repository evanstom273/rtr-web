import { useMemo, useState } from 'react';
import {
  companyOf, companyTier, foundingProblem, foundPromotion, isMajorTier, nightRule, officeNeed, officeOf, ownerName, perWeek, promoName, rolesOf, rosterSummary, scheduleOf, setSchedule, setSlots,
  slotLabel, TIER_LABEL, type Career, type Founding, type PhaseName, type Rule,
} from '../../career';
import { addDays, fmtDay } from '../../career/dates';
import { CITIES, regionOfCountry, REGION_LABEL } from '../../career/places';
import { COMPANY, FOUND } from '../../career/tuning';
import { commit, Head, money, Screen, shortMoney, useToast, useWords } from './parts';
import { OfficeCard } from './OfficeCard';
import { OfficeStories, OfficeTitles } from './OfficeStories';
import { OfficeBooks } from './OfficeBooks';
import { OfficeRoster, OfficeSignings, OfficeStaff } from './OfficeRoster';
import { Boss, TakeOn } from './OfficeTakeOn';

const TAB_LABEL = { overview: 'Overview', card: 'Card', stories: 'Stories', titles: 'Titles', roster: 'Roster', signings: 'Signings', staff: 'Staff', books: 'Books', schedule: 'Schedule' } as const;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const NTH = ['', 'First', 'Second', 'Third', 'Fourth'];

/** A schedule rule in words: "Every Saturday", "First Sunday of the month", "Every 21–49 days". */
export function whenText(r: Rule): string {
  const w = r.when as Record<string, unknown> & { every?: string; day?: string; nth?: number | 'last'; month?: string; date?: number };
  if (w.every) return `Every ${w.every}`;
  if ('everyN' in w) { const e = w.everyN as { day: string; weeks: number }; return e.weeks === 2 ? `Every other ${e.day}` : `Every ${e.weeks} weeks, ${e.day}`; }
  if (w.nth !== undefined) return `${w.nth === 'last' ? 'Last' : NTH[w.nth] ?? `${w.nth}th`} ${w.day} ${w.month === 'every' ? 'of the month' : `in ${w.month}`}`;
  if (w.date !== undefined) return `${w.date} ${w.month}`;
  if ('irregular' in w) { const x = w.irregular as { minGapDays: number; maxGapDays: number }; return `Every ${x.minGapDays}–${x.maxGapDays} days`; }
  if ('touringMonths' in w) return 'Touring, every other month';
  if ('tour' in w) return `On tour before ${(w.tour as { leadsTo: string }).leadsTo}`;
  if ('dates' in w) return 'Set dates in the year';
  return 'Now and then';
}

/** The Office (booker mode, Lyra's design): the promotions you run, and founding your own. */
export function Office({ c, onBack }: { c: Career; onBack: () => void }) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const roles = rolesOf(c);
  const [sel, setSel] = useState<string | null>(roles[0]?.promo ?? null);
  const [tab, setTab] = useState<keyof typeof TAB_LABEL>('overview');
  const [founding, setFounding] = useState(!roles.length);
  const indieFree = !roles.some((r) => !isMajorTier(companyTier(r.promo)));
  const majorFree = !roles.some((r) => isMajorTier(companyTier(r.promo)));
  const promo = sel && roles.some((r) => r.promo === sel) ? sel : roles[0]?.promo ?? null;

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'The Office' : 'THE OFFICE'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        {(roles.length > 0 || indieFree || majorFree) && (
          <div className="c-chips">
            {roles.map((r) => <button key={r.promo} className={`c-chip${!founding && r.promo === promo ? ' on' : ''}`} onClick={() => { setSel(r.promo); setFounding(false); }}>{r.promo}</button>)}
            {(indieFree || majorFree) && <button className={`c-chip${founding ? ' on' : ''}`} onClick={() => setFounding(true)}>{w('+ Take one on')}</button>}
          </div>
        )}
        {founding || !promo ? <TakeOn c={c} say={say} found={indieFree ? <Found c={c} say={say} onDone={(ini) => { setSel(ini); setFounding(false); setTab('overview'); }} /> : <span className="c-note">You already run an indie: one at a time.</span>} />
          : (
            <>
              <div className="c-chips">
                {(Object.keys(TAB_LABEL) as (keyof typeof TAB_LABEL)[]).map((t) => <button key={t} className={`c-chip${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>{w(TAB_LABEL[t])}</button>)}
              </div>
              {tab === 'overview' ? <Overview c={c} promo={promo} say={say} />
                : tab === 'card' ? <OfficeCard key={promo} c={c} promo={promo} say={say} />
                : tab === 'stories' ? <OfficeStories key={promo} c={c} promo={promo} say={say} />
                : tab === 'titles' ? <OfficeTitles key={promo} c={c} promo={promo} say={say} />
                : tab === 'books' ? <OfficeBooks key={promo} c={c} promo={promo} say={say} />
                : tab === 'roster' ? <OfficeRoster key={promo} c={c} promo={promo} say={say} />
                : tab === 'signings' ? <OfficeSignings key={promo} c={c} promo={promo} say={say} />
                : tab === 'staff' ? <OfficeStaff key={promo} c={c} promo={promo} say={say} />
                : <Schedule key={promo} c={c} promo={promo} say={say} />}
            </>
          )}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button></div>
      {toast}
    </Screen>
  );
}

function Overview({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const co = companyOf(promo)!;
  const role = rolesOf(c).find((r) => r.promo === promo)!;
  const r = rosterSummary(promo);
  const next = Object.values(c.shows).filter((s) => s.promo === promo && !s.done && s.date >= c.today).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 5);
  const o = officeOf(c);
  const need = officeNeed(c);
  const on = (d: number, p: PhaseName) => o.slots.some(([x, y]) => x === d && y === p);
  const toggle = (d: number, p: PhaseName) => {
    const slots: [number, PhaseName][] = on(d, p) ? o.slots.filter(([x, y]) => !(x === d && y === p)) : [...o.slots, [d, p]];
    say(setSlots(c, slots));
    commit();
  };
  return (
    <>
      <div className="c-start">
        <b className="c-at">{promoName(promo)}</b>
        <span className="c-val">{role.as === 'owner' ? 'You own it and book it.' : `You book it for ${ownerName(promo)}, who owns it.`} Since {fmtDay(role.since, 'long')}.</span>
        <div className="c-facts">
          <span className="c-fact"><span className="c-lab">{w('Tier')}</span><b>{TIER_LABEL[co.tier]}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Bank')}</span><b>{shortMoney(co.bank)}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Signed')}</span><b>{r.signed}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Champions')}</span><b>{r.champs}</b></span>
        </div>
        {co.home && <span className="c-hint">Based in {co.home.city}, {co.home.country}{co.tier === 'local' ? ': every show’s there' : ''}.</span>}
      </div>
      <span className="c-sec">{w('Coming up')}</span>
      {next.length ? next.map((s) => (
        <div key={s.id} className="c-rowsb"><span className="c-val">{s.name}</span><span className="c-hint">{fmtDay(s.date, 'dm')} · {s.city}{s.card ? ` · ${s.card.length} matches` : ''}</span></div>
      )) : <span className="c-note">Nothing on the calendar. Set a schedule.</span>}
      {r.signed === 0 && <span className="c-note">No one’s signed yet: each show books free agents from the region, a night at a time.</span>}
      <span className="c-sec">{w('Office hours')} · {o.slots.length} of {need} needed</span>
      <div className="c-chips">
        {[1, 2, 3, 4, 5, 6, 0].flatMap((d) => (['am', 'pm'] as const).map((p) => (
          <button key={`${d}${p}`} className={`c-chip${on(d, p) ? ' on' : ''}`} onClick={() => toggle(d, p)}>{slotLabel([d, p])}</button>
        )))}
      </div>
      <Boss c={c} promo={promo} say={say} />
      <span className="c-note">Booking takes {need} half-day{need === 1 ? '' : 's'} a week ({rolesOf(c).map((x) => `${x.promo} ${COMPANY.officeDays[companyTier(x.promo)]}`).join(', ')}). Miss them for shows, travel or plans and your staff cover{o.short ? `: last week they covered ${o.short}` : ''}.</span>
    </>
  );
}

function Schedule({ c, promo, say }: { c: Career; promo: string; say: (s: string) => void }) {
  const { w } = useWords();
  const co = companyOf(promo)!;
  const [rules, setRules] = useState<Rule[]>(() => structuredClone(scheduleOf(promo)));
  const [name, setName] = useState('');
  const [every, setEvery] = useState<'weekly' | 'fortnightly' | 'monthly'>('weekly');
  const [day, setDay] = useState('Saturday');
  const [kind, setKind] = useState<'weekly' | 'special' | 'flagship'>('weekly');
  const max = COMPANY.showsPerWeek[co.tier];
  const load = perWeek(rules);
  const add = () => {
    const n = name.trim() || `${promo} ${day}${every === 'monthly' ? ' Special' : ''}`;
    setRules([...rules, nightRule(n, every, day, addDays(c.today, 7), kind)]);
    setName('');
  };
  return (
    <>
      <span className="c-sec">{w('Shows')} · {load.toFixed(load % 1 ? 2 : 0)} a week of {max}</span>
      {rules.length ? rules.map((r, i) => (
        <div key={`${r.name}${i}`} className="c-rowsb">
          <span className="c-val">{r.name}<span className="c-hint"> · {whenText(r)} · {r.kind}</span></span>
          <button className="c-chip" onClick={() => setRules(rules.filter((_, j) => j !== i))}>{w('Drop')}</button>
        </div>
      )) : <span className="c-note">No regular shows.</span>}
      <span className="c-sec">{w('Add a show')}</span>
      <input className="c-fld" value={name} maxLength={40} placeholder="Show name" onChange={(e) => setName(e.target.value)} aria-label="Show name" />
      <div className="c-chips">{(['weekly', 'fortnightly', 'monthly'] as const).map((x) => <button key={x} className={`c-chip${every === x ? ' on' : ''}`} onClick={() => setEvery(x)}>{w(x === 'weekly' ? 'Every week' : x === 'fortnightly' ? 'Every other week' : 'Once a month')}</button>)}</div>
      <div className="c-chips">{DAYS.map((d) => <button key={d} className={`c-chip${day === d ? ' on' : ''}`} onClick={() => setDay(d)}>{d.slice(0, 3)}</button>)}</div>
      <div className="c-chips">{(['weekly', 'special', 'flagship'] as const).map((k) => <button key={k} className={`c-chip${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>{w(k === 'weekly' ? 'Regular show' : k === 'special' ? 'Special' : 'Flagship')}</button>)}</div>
      <button className="c-b3" onClick={add}>{w('Add it ›')}</button>
      <span className="c-note">A {TIER_LABEL[co.tier].toLowerCase()} promotion runs {max} show{max > 1 ? 's' : ''} a week at most. Shows in the next seven days stay as they are; everything after is redrawn.</span>
      <button className="c-b1" onClick={() => { say(setSchedule(c, promo, rules)); commit(); }}>{w('Save the schedule')}</button>
    </>
  );
}

function Found({ c, say, onDone }: { c: Career; say: (s: string) => void; onDone: (initials: string) => void }) {
  const { w } = useWords();
  const home = c.base ?? 'UK';
  const countries = useMemo(() => Object.keys(CITIES).sort(), []);
  const [name, setName] = useState('');
  const [ini, setIni] = useState('');
  const [country, setCountry] = useState(CITIES[home] ? home : countries[0]!);
  const [city, setCity] = useState(CITIES[country]?.[0] ?? '');
  const [capital, setCapital] = useState(Math.min(Math.max(FOUND.minCapital, Math.floor(c.money / 2 / 500) * 500), Math.max(FOUND.minCapital, c.money)));
  const [every, setEvery] = useState<'weekly' | 'fortnightly' | 'monthly'>('monthly');
  const [day, setDay] = useState('Saturday');
  const f: Founding = { name, initials: ini, country, city, capital, night: { every, day } };
  const problem = foundingProblem(c, f);
  const steps = [FOUND.minCapital, 5000, 10_000, 25_000, 50_000, 100_000].filter((x) => x <= Math.max(c.money, FOUND.minCapital));
  return (
    <>
      <span className="c-note">Your own promotion: you own it and book it. It starts local (one town, free agents booked a night at a time) and grows as far as you can take it. You can run one indie and one major at once, and keep wrestling the whole time.</span>
      <span className="c-sec">{w('Name')}</span>
      <input className="c-fld" value={name} maxLength={FOUND.nameMax} placeholder="Northern Lights Wrestling" onChange={(e) => setName(e.target.value)} aria-label="Promotion name" />
      <span className="c-sec">{w('Initials')}</span>
      <input className="c-fld" value={ini} maxLength={FOUND.initials[1]} placeholder="NLW" onChange={(e) => setIni(e.target.value.toUpperCase())} aria-label="Initials" />
      <span className="c-sec">{w('Home town')}</span>
      <select className="c-fld" value={country} onChange={(e) => { setCountry(e.target.value); setCity(CITIES[e.target.value]?.[0] ?? ''); }} aria-label="Country">
        {countries.map((k) => <option key={k} value={k}>{k} · {REGION_LABEL[regionOfCountry(k)]}</option>)}
      </select>
      <select className="c-fld" value={city} onChange={(e) => setCity(e.target.value)} aria-label="City">
        {(CITIES[country] ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="c-sec">{w('Its regular night')}</span>
      <div className="c-chips">{(['weekly', 'fortnightly', 'monthly'] as const).map((x) => <button key={x} className={`c-chip${every === x ? ' on' : ''}`} onClick={() => setEvery(x)}>{w(x === 'weekly' ? 'Every week' : x === 'fortnightly' ? 'Every other week' : 'Once a month')}</button>)}</div>
      <div className="c-chips">{DAYS.map((d) => <button key={d} className={`c-chip${day === d ? ' on' : ''}`} onClick={() => setDay(d)}>{d.slice(0, 3)}</button>)}</div>
      <span className="c-sec">{w('Put in')} · {w('you have')} {money(c.money)}</span>
      <div className="c-chips">{steps.map((x) => <button key={x} className={`c-chip${capital === x ? ' on' : ''}`} onClick={() => setCapital(x)}>{money(x)}</button>)}</div>
      <span className="c-note">That’s the company’s money from now on, kept apart from yours.</span>
      <button className="c-b1" disabled={!!problem} onClick={() => { const s = foundPromotion(c, f); commit(); say(s); if (/open for business/.test(s)) onDone(ini.trim().toUpperCase()); }}>{problem ?? w(`Found ${ini.trim().toUpperCase() || 'it'} ›`)}</button>
    </>
  );
}
