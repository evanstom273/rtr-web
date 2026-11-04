import { useMemo, useState } from 'react';
import { baseCountry, hireable, hireFee, ownBudget, putOnShow, venues, type Career } from '../../career';
import { fansIn, fmtFans } from '../../data/rtr';
import { addDays, fmtDay, weekday } from '../../career/dates';
import { CITIES, REGION_OF, regionOfCountry } from '../../career/places';
import { OWN_SHOW } from '../../career/tuning';
import { commit, Head, money, Screen, useToast, useWords } from './parts';

/** Put on your own show (Lyra's call: light first): when, where, the venue, your opponent and a few hires. */
export function OwnShow({ c, onBack }: { c: Career; onBack: () => void }) {
  const { skin, w } = useWords();
  const [toast, say] = useToast();
  const region = regionOfCountry(baseCountry(c));
  const countries = Object.keys(REGION_OF).filter((x) => REGION_OF[x] === region && CITIES[x]);
  const dates = useMemo(() => {
    let d = addDays(c.today, OWN_SHOW.minLead);
    while (weekday(d) !== 6) d = addDays(d, 1);
    return Array.from({ length: 6 }, (_, i) => addDays(d, i * 7));
  }, [c.today]);
  const [date, setDate] = useState(dates[0]!);
  const [place, setPlace] = useState(() => { const k = countries.includes(baseCountry(c)) ? baseCountry(c) : countries[0]!; return `${k}|${CITIES[k]![0]}`; });
  const [country, city] = place.split('|') as [string, string];
  const [venue, setVenue] = useState('hall');
  const pool = useMemo(() => hireable(c, country, date), [c, country, date]);
  const [opp, setOpp] = useState('');
  const [hires, setHires] = useState<string[]>([]);
  const [price, setPrice] = useState(OWN_SHOW.ticket);
  const oppId = opp && pool.some((x) => x.id === opp) ? opp : pool[0]?.id ?? '';
  const crew = hires.filter((id) => id !== oppId && pool.some((x) => x.id === id));
  const plan = { date, country, city, venue, opp: oppId, hires: crew, price };
  const b = oppId ? ownBudget(c, plan) : null;
  const r = regionOfCountry(country);
  const book = () => {
    const s = putOnShow(c, plan);
    commit();
    say(s);
    if (/Presents/.test(s)) window.setTimeout(onBack, 900);
  };

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Your Own Show' : 'PUT ON A SHOW'} meta={w(fmtDay(c.today, 'long'), fmtDay(c.today))} onBack={onBack} />
      <div className="c-body">
        {b && (
          <div className="c-start">
            <div className="c-facts">
              <span className="c-fact"><span className="c-lab">{w('Draw')}</span><b>~{b.draw}</b></span>
              <span className="c-fact"><span className="c-lab">{w('Seats')}</span><b>{b.cap}</b></span>
              <span className="c-fact"><span className="c-lab">{w('Takings')}</span><b>{money(b.tickets)}</b></span>
              <span className="c-fact"><span className="c-lab">{w('Costs')}</span><b>{money(b.costs)}</b></span>
            </div>
            <span className="c-val">Projected <b className={b.profit >= 0 ? 'c-amt pos' : 'c-amt neg'}>{b.profit >= 0 ? 'profit' : 'loss'} {money(Math.abs(b.profit))}</b>. Venue {money(b.venue)}, ring and crew {money(OWN_SHOW.production)}, wrestlers {money(b.fees)}{b.travel ? `, travel ${money(b.travel)}` : ''}. Tickets {money(price)}; the night can go 15% either way.{c.hustle?.hype ? ` Your following: ${Math.round((1 + c.hustle.hype) * 100)}%.` : ''}</span>
          </div>
        )}
        <span className="c-sec">{w('When')}</span>
        <div className="c-chips">{dates.map((d) => <button key={d} className={`c-chip${d === date ? ' on' : ''}`} onClick={() => setDate(d)}>{fmtDay(d, 'dm')}</button>)}</div>
        <span className="c-sec">{w('Where')}</span>
        <select className="c-fld" value={place} onChange={(e) => setPlace(e.target.value)} aria-label="City">
          {countries.map((k) => <optgroup key={k} label={k}>{CITIES[k]!.map((ct) => <option key={ct} value={`${k}|${ct}`}>{ct}</option>)}</optgroup>)}
        </select>
        <span className="c-sec">{w('Venue')}</span>
        <div className="c-chips">{venues.map((v) => <button key={v.id} className={`c-chip${v.id === venue ? ' on' : ''}`} onClick={() => setVenue(v.id)}>{w(`${v.name} · ${v.cap} · ${money(v.cost)}`)}</button>)}</div>
        <span className="c-sec">{w('Tickets')}</span>
        <div className="c-chips">{OWN_SHOW.prices.map((x) => <button key={x} className={`c-chip${x === price ? ' on' : ''}`} onClick={() => setPrice(x)}>{money(x)}</button>)}</div>
        <span className="c-sec">{w('Main event: you against')}</span>
        <select className="c-fld" value={oppId} onChange={(e) => setOpp(e.target.value)} aria-label="Opponent">
          {pool.map((x) => <option key={x.id} value={x.id}>{x.name} · {fmtFans(fansIn(x, r))} fans here · {money(hireFee(x, r))}</option>)}
        </select>
        <span className="c-sec">{w('Undercard')} · {crew.length} of {OWN_SHOW.hires}</span>
        <div className="c-chips">
          {pool.filter((x) => x.id !== oppId).slice(0, 12).map((x) => {
            const on = crew.includes(x.id);
            return <button key={x.id} className={`c-chip${on ? ' on' : ''}`} onClick={() => setHires(on ? crew.filter((id) => id !== x.id) : crew.length >= OWN_SHOW.hires ? crew : [...crew, x.id])}>{x.name} · {money(hireFee(x, r))}</button>;
          })}
        </div>
        <span className="c-note">Hires wrestle each other in pairs, so pick two or four. Everyone’s fans in the region bring people in; a big name helps, but not as much as you’d hope.</span>
      </div>
      <div className="c-nav">
        <button className="c-b2" onClick={onBack}>{w('‹ Back')}</button>
        <button className="c-b1" disabled={!b || crew.length % 2 === 1} onClick={book}>{crew.length % 2 ? w('Pick an even number') : w(`Book it · ${b && b.profit < 0 ? '−' : ''}${money(Math.abs(b?.profit ?? 0))}`)}</button>
      </div>
      {toast}
    </Screen>
  );
}
