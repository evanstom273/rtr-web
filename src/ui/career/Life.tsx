import { useState } from 'react';
import { relocate } from '../../career/day';
import { buyVehicle, garageValue, roadCrew, sellVehicle, vehicleName, vehicleValue, VEHICLE_TIERS } from '../../career/life/garage';
import { addGym, billsOf, BUY_TIERS, buyHome, buyPrice, cancelSale, homeName, homesValue, homeValue, letHome, letsFor, RENT_TIERS, rentWeek, sellHome, stopLetting, switchTo, tierName } from '../../career/life/homes';
import { canBorrow, creditWord, depositFor, monthlyFor, payOff, rateFor } from '../../career/life/loans';
import { AGENT_TIERS, agentTakes, fireAgent, hireAgent } from '../../career/life/money';
import { cityPrice, countryOfCity, life, liveHome, on, type FlyClass } from '../../career/life/state';
import { buyGear, buyKit, clinicOffer, goToClinic, hire, letGo, seeSurgeon, setGearUse, STAFF_ROLES, surgeonOffer, wageOf } from '../../career/life/staff';
import { CITIES, REGION_LABEL, regionOfCountry } from '../../career/places';
import { COST_INDEX, PRICE_BOOK as PB } from '../../career/tuning';
import type { Career } from '../../career/types';
import { commit, Head, money, Screen, shortMoney, useToast, useWords } from './parts';
import { InvestTab } from './LifeInvest';
import { SchoolTab } from './LifeSchool';
import { investedValue } from '../../career/life/invest';
import { netWorth } from '../../career/life/worth';
import { flaunt, FLAUNTS, flauntWhat, type FlauntKind } from '../../career/life/status';
import { kidCost, kidsOf, partnerIn } from '../../career/life/family';
import { isBust, overdraftOf } from '../../career/life/fall';
import { comeback, isRetired } from '../../career/life/afterlife';
import { richRank } from '../../career/life/aiMoney';
import { lifeWorld } from '../../world/lifeWorld';
import { fansTotal, findWrestler } from '../../data/rtr';

interface Props { c: Career; onBack: () => void }

const FLAUNT_LABEL: Record<FlauntKind, string> = { home: 'Post the house', car: 'Post the car', jet: 'Turn up in the jet', luxury: 'Show off the good stuff', party: 'Throw a party' };
const TABS = ['Home', 'Getting about', 'Your team', 'Invest', 'School', 'Money'] as const;

/** Every city, by country (for moving and buying). */
function CityPick({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <select className="c-fld" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {(Object.keys(REGION_LABEL) as (keyof typeof REGION_LABEL)[]).map((reg) => (
        <optgroup key={reg} label={REGION_LABEL[reg]}>
          {Object.entries(CITIES).filter(([k]) => regionOfCountry(k) === reg).flatMap(([k, cs]) => cs.map((x) => <option key={x} value={x}>{x}, {k}</option>))}
        </optgroup>
      ))}
    </select>
  );
}

/** Career → Life: where you live and what you own, how you get about, and the money side (tax, credit, the agent). */
export function Life({ c, onBack }: Props) {
  const { skin, w } = useWords();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Home');
  const [toast, say] = useToast();
  const [, bump] = useState(0);
  const L = life(c);
  const [rentCity, setRentCity] = useState(L.city);
  const [buyCity, setBuyCity] = useState(L.city);
  const done = (s: string) => { say(s); commit(); bump((n) => n + 1); };
  const h = liveHome(c);
  const owed = L.loans.reduce((t, l) => t + l.left, 0);
  const invested = on('invest') ? investedValue(c) : 0;
  const worth = netWorth(c);
  const me = findWrestler(c.player)!;
  const region = regionOfCountry(h.country);

  return (
    <Screen>
      <Head title={skin === 'paper' ? 'Your Life' : 'LIFE'} meta={`${h.city}, ${h.country}`} onBack={onBack} />
      <div className="c-start">
        <span className="c-lab">{w('What you’re worth')}</span>
        <b className="c-sbig" style={{ fontSize: 32 }}>{money(worth)}</b>
        <div className="c-facts" style={{ gridTemplateColumns: `repeat(${invested ? 5 : 4}, minmax(0, 1fr))` }}>
          <span className="c-fact"><span className="c-lab">{w('Bank')}</span><b>{shortMoney(c.money)}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Homes')}</span><b>{shortMoney(homesValue(c))}</b></span>
          <span className="c-fact"><span className="c-lab">{w('Garage')}</span><b>{shortMoney(garageValue(c))}</b></span>
          {invested > 0 && <span className="c-fact"><span className="c-lab">{w('Invested')}</span><b>{shortMoney(invested)}</b></span>}
          <span className="c-fact"><span className="c-lab">{w('Owed')}</span><b className={owed ? 'c-amt neg' : ''}>{shortMoney(owed)}</b></span>
        </div>
      </div>
      <div className="c-steps cols3" style={{ marginTop: 8 }}>
        {TABS.filter((t) => (t !== 'Invest' || on('invest')) && (t !== 'School' || on('school'))).map((t) => <button key={t} className={t === tab ? 'c-st on' : 'c-st'} style={{ border: 0 }} onClick={() => setTab(t)}>{w(t)}</button>)}
      </div>
      <div className="c-body">
        {!on('homes') && <span className="c-note">Life is switched off.</span>}

        {tab === 'Home' && on('homes') && (
          <>
            <div className="c-start">
              <span className="c-lab">{w('You live in')}</span>
              <b className="c-sbig" style={{ fontSize: 24 }}>{homeName(h)}</b>
              <span className="c-val">
                {h.own ? `Yours · worth ${money(homeValue(h))} · bills ${money(billsOf(h))} a week` : `Renting · ${money(rentWeek(h.tier as 'room', h.city))} a week with bills`}
                {c.home ? ' · shared' : ''}
              </span>
              {c.moving && <span className="c-val c-hot">Moving to {c.moving.city ?? c.moving.to}: there on {c.moving.until}.</span>}
            </div>

            {on('after') && isRetired(c) && (
              <>
                <span className="c-sec">{w('Retired')}</span>
                <span className="c-note">All of this is still yours to run: your homes and businesses, your school, the Office if you book. Wrestlers will ask you to train them. Or there’s one more time…</span>
                {(L.clients ?? []).length > 0 && (
                  <div className="c-kv">
                    {(L.clients ?? []).map((k) => [<span key={`${k.id}l`} className="c-lab">{w('Training')}</span>, <span key={`${k.id}v`} className="c-val">{findWrestler(k.id)?.name ?? k.id} · {money(k.fee)} a month until {k.until}</span>])}
                  </div>
                )}
                <div className="c-chips">
                  <button className="c-chip" onClick={() => done(comeback(c, 'one'))}>Come back: one night only</button>
                  <button className="c-chip" onClick={() => done(comeback(c, 'run'))}>Come back: a short run</button>
                </div>
              </>
            )}
            {L.comeback && <span className="c-note">{L.comeback.kind === 'one' ? 'Back for one night only: you retire again after your next match.' : `Back for a run, until ${L.comeback.until}.`}</span>}
            {on('status') && (() => {
              const can = FLAUNTS.filter((k) => flauntWhat(c, k));
              return (
                <>
                  <span className="c-sec">{w('Show it off')}</span>
                  <span className="c-note">It only counts if people see it. A heel gets heat for it, a face can look out of touch, and the locker room notices either way. Once a week.</span>
                  {can.length ? <div className="c-chips">{can.map((k) => <button key={k} className="c-chip" onClick={() => done(flaunt(c, k))}>{FLAUNT_LABEL[k]}</button>)}</div> : <span className="c-note">Nothing worth showing off yet.</span>}
                </>
              );
            })()}

            {L.homes.some((x) => x.own) && <span className="c-sec">{w('What you own')}</span>}
            {L.homes.filter((x) => x.own).map((x) => {
              const loan = L.loans.find((l) => l.on === x.id);
              return (
                <div key={x.id} className="c-kv">
                  <span className="c-lab">{w(tierName(x))}</span>
                  <span className="c-val">
                    <b>{x.city}</b> · worth {money(homeValue(x))}{loan ? ` · ${money(loan.left)} owed` : ''} · {x.use === 'live' ? 'you live here' : x.use === 'let' ? `let at ${money(letsFor(x))} a week${x.letAgent ? ' (agent)' : ''}` : x.selling ? `for sale (sells by ${x.selling})` : 'empty'}
                    {x.gym ? ` · ${x.gym === 'ring' ? 'your own ring' : 'home gym'}` : ''}
                  </span>
                  <span className="c-lab" />
                  <span className="c-chips">
                    {x.use !== 'live' && !x.selling && <button className="c-chip" onClick={() => done(switchTo(c, x.id))}>Live here</button>}
                    {x.use === 'empty' && !x.selling && x.tier !== 'mansion' && <button className="c-chip" onClick={() => done(letHome(c, x.id, true))}>Let it (agent)</button>}
                    {x.use === 'empty' && !x.selling && x.tier !== 'mansion' && <button className="c-chip" onClick={() => done(letHome(c, x.id, false))}>Let it yourself</button>}
                    {x.use === 'let' && <button className="c-chip" onClick={() => done(stopLetting(c, x.id))}>Stop letting</button>}
                    {x.use !== 'live' && (x.selling ? <button className="c-chip" onClick={() => done(cancelSale(c, x.id))}>Take off the market</button> : <button className="c-chip" onClick={() => done(sellHome(c, x.id))}>Sell</button>)}
                    {x.tier !== 'flat' && !x.gym && <button className="c-chip" onClick={() => done(addGym(c, x.id, 'gym'))}>Home gym · {shortMoney(PB.homeGym.price)}</button>}
                    {(x.tier === 'house' || x.tier === 'mansion') && x.gym !== 'ring' && <button className="c-chip" onClick={() => done(addGym(c, x.id, 'ring'))}>A ring · {shortMoney(PB.ring.price)}</button>}
                  </span>
                </div>
              );
            })}

            <span className="c-sec">{w('Rent somewhere')}</span>
            <div className="c-start"><CityPick value={rentCity} onChange={setRentCity} label="Rent in which city" /></div>
            {RENT_TIERS.map((t) => {
              const here = !h.own && h.tier === t && h.city === rentCity;
              return (
                <button key={t} className={`c-ans${here ? ' dis' : ''}`} style={{ padding: '8px 10px' }} disabled={here || !!c.moving} onClick={() => done(relocate(c, countryOfCity(rentCity), 0, { city: rentCity, tier: t }))}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{PB.rent[t].name}</b><span className="c-eff">{money(rentWeek(t, rentCity))} a week</span></span>
                  <span className="c-ad">{here ? 'Where you live now' : `${PB.rent[t].rest ? `Sleep ${Math.round(PB.rent[t].rest * 100)}% better` : 'Somewhere to sleep'}${PB.rent[t].mood ? ` · wellbeing +${PB.rent[t].mood}` : ''} · moving takes three days`}</span>
                </button>
              );
            })}

            <span className="c-sec">{w('Buy somewhere')}</span>
            <div className="c-start"><CityPick value={buyCity} onChange={setBuyCity} label="Buy in which city" /></div>
            <span className="c-note">You can borrow up to {money(canBorrow(c))} ({creditWord(c).toLowerCase()} credit: {Math.round(depositFor(c, 'mortgage') * 100)}% down, {(rateFor(c, 'mortgage') * 100).toFixed(1)}% over 25 years). Buying costs 5% in fees.</span>
            {BUY_TIERS.map((t) => {
              const price = buyPrice(t, buyCity), dep = Math.round(price * depositFor(c, 'mortgage'));
              const monthly = Math.round(monthlyFor(price - dep, rateFor(c, 'mortgage'), PB.loans.mortgage.years));
              return (
                <div key={t} className="c-ans" style={{ padding: '8px 10px' }}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{PB.buy[t].name}</b><span className="c-eff gold">{money(price)}</span></span>
                  <span className="c-ad">Sleep {Math.round(PB.buy[t].rest * 100)}% better · wellbeing +{PB.buy[t].mood} · upkeep {money(price * PB.buy[t].upkeep)} a year{PB.buy[t].lets ? ` · lets for ${money(PB.buy[t].lets * cityPrice(buyCity))} a week` : ''}</span>
                  <span className="c-chips" style={{ marginTop: 6 }}>
                    <button className="c-chip" onClick={() => done(buyHome(c, buyCity, t, false).text)}>Cash · {shortMoney(price * 1.05)}</button>
                    <button className="c-chip" onClick={() => done(buyHome(c, buyCity, t, true).text)}>Mortgage · {shortMoney(dep + price * 0.05)} down, {money(monthly)}/month</button>
                  </span>
                </div>
              );
            })}
            <span className="c-note">A home you own is yours empty: live there (switching between your own homes is instant), let it, or sell it later. Prices follow each city’s market.</span>
          </>
        )}

        {tab === 'Getting about' && on('homes') && (
          <>
            {L.cars.length > 0 && <span className="c-sec">{w('Your garage')}</span>}
            {L.cars.map((v) => {
              const loan = L.loans.find((l) => l.on === v.id);
              return (
                <div key={v.id} className="c-kv">
                  <span className="c-lab">{w(vehicleName(v))}</span>
                  <span className="c-val">Worth {money(vehicleValue(c, v))} · {money(PB.vehicles[v.tier].monthly)} a month to run{loan ? ` · ${money(loan.left)} owed` : ''}</span>
                  <span className="c-lab" />
                  <span className="c-chips"><button className="c-chip" onClick={() => done(sellVehicle(c, v.id))}>Sell</button></span>
                </div>
              );
            })}
            {L.cars.some((v) => PB.vehicles[v.tier].seats > 4) && (
              <div className="c-kv">
                <span className="c-lab">{w('Road crew')}</span>
                <span className="c-val">{L.crewOn ? (roadCrew(c, 8).map((id) => findWrestler(id)?.name).filter(Boolean).join(', ') || 'No friends to take yet') : 'Just you'}</span>
                <span className="c-lab" />
                <span className="c-chips"><button className="c-chip" onClick={() => { L.crewOn = !L.crewOn; done(L.crewOn ? 'Your mates ride with you: they chip in, and the road does the friendship good.' : 'Travelling alone.'); }}>{L.crewOn ? 'Go alone' : 'Take your mates'}</button></span>
              </div>
            )}
            <span className="c-sec">{w('Flying abroad')}</span>
            <div className="c-chips">
              {(Object.keys(PB.fly) as FlyClass[]).map((k) => (
                <button key={k} className={`c-chip${L.fly === k ? ' on' : ''}`} onClick={() => { L.fly = k; done(`You’ll fly ${PB.fly[k].name.toLowerCase()} from now on.`); }}>{PB.fly[k].name} · {money(PB.fly[k].cost)}</button>
              ))}
            </div>
            <span className="c-note">Economy: the whole day before and the next day home, fatigue {PB.fly.economy.fatigue}. A chartered jet (or your own) gets you there in half a day each way. With a Travel clause the promotion pays economy; you pay for the upgrade.</span>
            <span className="c-sec">{w('Buy')}</span>
            {VEHICLE_TIERS.map((t) => {
              const v = PB.vehicles[t], have = L.cars.some((x) => x.tier === t);
              const what = t === 'tour_bus' ? 'Sleep on board: road trips are rest. Eight seats.' : t === 'jet' ? 'Abroad in half a day each way, any time.' : t === 'jet_share' ? 'Abroad in half a day each way (50 hours a year).' : t === 'van' ? 'Six seats: take your mates.' : v.fatigue < 0 ? 'Road trips tire you less.' : v.fatigue > 0 ? 'Cheap road trips, but you drive.' : 'Cheaper road trips.';
              return (
                <div key={t} className={`c-ans${have ? ' dis' : ''}`} style={{ padding: '8px 10px' }}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{v.name}</b><span className="c-eff gold">{money(v.price)}</span></span>
                  <span className="c-ad">{what} {money(v.monthly)} a month to run.</span>
                  {!have && (
                    <span className="c-chips" style={{ marginTop: 6 }}>
                      <button className="c-chip" onClick={() => done(buyVehicle(c, t, false).text)}>Cash</button>
                      <button className="c-chip" onClick={() => done(buyVehicle(c, t, true).text)}>Finance · {shortMoney(v.price * depositFor(c, t === 'jet' || t === 'jet_share' ? 'jet' : 'car'))} down</button>
                    </span>
                  )}
                </div>
              );
            })}
          </>
        )}

        {tab === 'Your team' && on('staff') && (
          <>
            <span className="c-sec">{w('Personal staff')}</span>
            {STAFF_ROLES.map((r) => {
              const s = L.staff?.find((x) => x.role === r);
              return (
                <div key={r} className="c-ans" style={{ padding: '8px 10px' }}>
                  <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{PB.staff[r].name}{s ? ` · ${s.name}` : ''}</b><span className="c-eff">{money(wageOf(c, r))}/month</span></span>
                  <span className="c-ad">{PB.staff[r].does}</span>
                  <span className="c-chips" style={{ marginTop: 6 }}>
                    {s ? <button className="c-chip" onClick={() => done(letGo(c, r))}>Let them go</button> : <button className="c-chip" onClick={() => done(hire(c, r))}>Hire</button>}
                  </span>
                </div>
              );
            })}
            <span className="c-sec">{w('Medical')}</span>
            {(() => {
              const sur = surgeonOffer(c), cl = clinicOffer(c);
              return (
                <div className="c-kv">
                  <span className="c-lab">{w('Injured')}</span>
                  <span className="c-val">{c.people[c.player]?.injury ? `${c.people[c.player]!.injury!.what}, back ${c.people[c.player]!.injury!.until}` : 'Fit'}</span>
                  {(sur || cl) && <span className="c-lab" />}
                  {(sur || cl) && (
                    <span className="c-chips">
                      {sur && <button className="c-chip" onClick={() => done(seeSurgeon(c))}>Private surgeon · {shortMoney(sur.cost)} · {sur.days} days sooner</button>}
                      {cl && <button className="c-chip" onClick={() => done(goToClinic(c))}>Rehab clinic · {shortMoney(cl.cost)} · {cl.days} days sooner</button>}
                    </span>
                  )}
                  <span className="c-lab">{w('Recovery kit')}</span>
                  <span className="c-val">{L.kit ? `Yours · ${money(PB.medical.kit.monthly)} a month` : `Cryo and hyperbaric at home: wear fades faster, you recover quicker · ${money(PB.medical.kit.price)}`}</span>
                  {!L.kit && <span className="c-lab" />}
                  {!L.kit && <span className="c-chips"><button className="c-chip" onClick={() => done(buyKit(c))}>Buy it</button></span>}
                </div>
              );
            })()}
            <span className="c-sec">{w('Your entrance')}</span>
            <span className="c-note">It sets the crowd’s heat at the bell (at most +{PB.entrance.max}). Pyro needs the top of the card or the entrance term in your contract; a set needs a big show too.</span>
            <div className="c-chips">
              {!L.gear?.theme && <button className="c-chip" onClick={() => done(buyGear(c, 'theme'))}>Your own theme · {shortMoney(PB.entrance.theme.price)} · +{PB.entrance.theme.heat}</button>}
              {!L.gear?.video && <button className="c-chip" onClick={() => done(buyGear(c, 'video'))}>Entrance video · {shortMoney(PB.entrance.video.price)} · +{PB.entrance.video.heat}</button>}
              {PB.entrance.gear.map((g, i) => ((L.gear?.gear ?? 0) <= i ? <button key={g.name} className="c-chip" onClick={() => done(buyGear(c, (i + 1) as 1 | 2 | 3))}>{g.name} · {shortMoney(g.price)} · +{g.heat}</button> : null))}
            </div>
            <div className="c-kv">
              <span className="c-lab">{w('You have')}</span>
              <span className="c-val">{[L.gear?.theme ? 'your own theme' : '', L.gear?.video ? 'a video' : '', L.gear?.gear ? PB.entrance.gear[L.gear.gear - 1]!.name.toLowerCase() : ''].filter(Boolean).join(', ') || 'Nothing yet: you walk out to whatever they play'}</span>
              <span className="c-lab">{w('Pyro')}</span>
              <span className="c-chips"><button className={`c-chip${L.gear?.pyro ? ' on' : ''}`} onClick={() => { setGearUse(c, 'pyro', !L.gear?.pyro); done(L.gear?.pyro ? `Pyro where you’re allowed it: ${money(PB.entrance.pyro.cost)} a show, +${PB.entrance.pyro.heat}.` : 'No pyro.'); }}>{L.gear?.pyro ? 'On' : 'Off'} · {money(PB.entrance.pyro.cost)} a show</button></span>
              <span className="c-lab">{w('Set piece')}</span>
              <span className="c-chips"><button className={`c-chip${L.gear?.set ? ' on' : ''}`} onClick={() => { setGearUse(c, 'set', !L.gear?.set); done(L.gear?.set ? `A set on the big shows: ${money(PB.entrance.set.cost)} a time, +${PB.entrance.set.heat}.` : 'No set.'); }}>{L.gear?.set ? 'On' : 'Off'} · {money(PB.entrance.set.cost)} a show</button></span>
            </div>
          </>
        )}

        {tab === 'Invest' && on('invest') && <InvestTab c={c} done={done} />}
        {tab === 'School' && on('school') && <SchoolTab c={c} done={done} />}

        {tab === 'Money' && (
          <>
            {on('money') && (
              <>
                <span className="c-sec">{w('Tax')} · {L.tax.year}</span>
                <div className="c-kv">
                  <span className="c-lab">{w('Earned')}</span><span className="c-val">{money(L.tax.earned)}</span>
                  <span className="c-lab">{w('Tax paid')}</span><span className="c-val">{money(L.tax.paid)}{L.tax.earned ? ` · ${Math.round((L.tax.paid / L.tax.earned) * 100)}%` : ''}</span>
                  <span className="c-lab">{w('Where')}</span><span className="c-val">{REGION_LABEL[region]}: nothing on the first {money(PB.taxBands[0]![0] * COST_INDEX[region])}, then {PB.taxBands.slice(1).map(([, r]) => `${Math.round(r * PB.taxRegion[region] * 100)}%`).join(', ')} as you earn more</span>
                </div>
              </>
            )}
            <span className="c-sec">{w('Credit and borrowing')}</span>
            <div className="c-kv">
              <span className="c-lab">{w('Credit')}</span><span className="c-val">{L.credit} · {creditWord(c)}</span>
              <span className="c-lab">{w('Can borrow')}</span><span className="c-val">{money(canBorrow(c))}</span>
              {on('risk') && <><span className="c-lab">{w('Overdraft')}</span><span className="c-val">Down to −{money(overdraftOf(c))}; past that, the bank makes you sell things</span></>}
              {on('risk') && isBust(c) && <><span className="c-lab">{w('Bankrupt')}</span><span className="c-val c-hot">Until {L.bust}: no borrowing, and deals are worse</span></>}
            </div>
            {L.loans.map((l) => (
              <div key={l.id} className="c-kv">
                <span className="c-lab">{w(l.what)}</span>
                <span className="c-val">{money(l.left)} owed · {money(l.monthly)} a month · {(l.rate * 100).toFixed(1)}%{l.missed ? ` · ${l.missed} missed` : ''}</span>
                <span className="c-lab" />
                <span className="c-chips"><button className="c-chip" onClick={() => done(payOff(c, l.id))}>Pay it off</button></span>
              </div>
            ))}
            {on('family') && (() => {
              const kids = kidsOf(c), inn = partnerIn(c);
              if (!inn && !kids.length) return null;
              return (
                <>
                  <span className="c-sec">{w('Family')}</span>
                  <div className="c-kv">
                    {inn > 0 && [<span key="pl" className="c-lab">{w('Your partner')}</span>, <span key="pv" className="c-val">Puts in {money(inn)} a month. Married, what’s yours is theirs: a divorce splits it down the middle.</span>]}
                    {kids.map((k) => [<span key={`${k.id}l`} className="c-lab">{k.name.split(' ')[0]}</span>, <span key={`${k.id}v`} className="c-val">{k.age} · {kidCost(c, k.age) ? `${money(kidCost(c, k.age))} a month` : 'grown up'}</span>])}
                  </div>
                </>
              );
            })()}
            {on('ai') && (() => {
              const R = lifeWorld().rich?.at(-1), now = richRank(c);
              return (
                <>
                  <span className="c-sec">{w('The rich list')}{R ? ` · ${R.year}` : ''}</span>
                  {R ? (
                    <div className="c-kv">
                      {R.top.map(([id, v], i) => [
                        <span key={`${id}l`} className="c-lab">{i + 1}</span>,
                        <span key={`${id}v`} className="c-val">{id === c.player ? <b>You</b> : findWrestler(id)?.name ?? id} · {shortMoney(v)}</span>,
                      ])}
                    </div>
                  ) : <span className="c-note">The rich list comes out every January.</span>}
                  <span className="c-note">Today you’d be number {now.rank} of {now.of.toLocaleString('en-GB')}.</span>
                </>
              );
            })()}
            {on('money') && (
              <>
                <span className="c-sec">{w('Your agent')}</span>
                {L.agent ? (
                  <div className="c-kv">
                    <span className="c-lab">{w(PB.agents[L.agent.tier].name)}</span>
                    <span className="c-val"><b>{L.agent.name}</b> · {Math.round(PB.agents[L.agent.tier].cut * 100)}% of contract money · deals about {Math.round(PB.agents[L.agent.tier].deals * 100)}% better</span>
                    <span className="c-lab">{w('Deals')}</span>
                    <span className="c-chips">
                      <button className={`c-chip${L.agent.mode === 'advise' ? ' on' : ''}`} onClick={() => { L.agent!.mode = 'advise'; done('You’ll do the haggling; they’ll tell you what’s realistic.'); }}>I negotiate</button>
                      <button className={`c-chip${L.agent.mode === 'handle' ? ' on' : ''}`} onClick={() => { L.agent!.mode = 'handle'; done('They’ll do the haggling and tell you where it lands.'); }}>They handle it</button>
                      <button className="c-chip" onClick={() => done(fireAgent(c))}>Let them go</button>
                    </span>
                  </div>
                ) : <span className="c-note">No agent: you do your own deals. An agent takes a cut of contract money (never indie fees or side earners), gets you more, and finds you offers.</span>}
                {AGENT_TIERS.filter((t) => t !== L.agent?.tier).map((t) => {
                  const a = PB.agents[t], ok = agentTakes(c, t);
                  return (
                    <button key={t} className={`c-ans${ok ? '' : ' dis'}`} style={{ padding: '8px 10px' }} disabled={!ok} onClick={() => done(hireAgent(c, t))}>
                      <span className="c-rowsb"><b className="c-at" style={{ fontSize: 16 }}>{a.name}</b><span className="c-eff">{Math.round(a.cut * 100)}% · +{Math.round(a.deals * 100)}%</span></span>
                      <span className="c-ad">{ok ? (t === 'super' ? 'Offers from anywhere; warns you off bad deals.' : t === 'established' ? 'Offers from the majors; spots a bad clause.' : 'An extra offer now and then.') : `Wants ${a.fans.toLocaleString('en-GB')}+ fans (you have about ${fansTotal(me).toLocaleString('en-GB')}).`}</span>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}
      </div>
      <div className="c-nav"><button className="c-b2" onClick={onBack}>{w('‹ Back')}</button><button className="c-b1" onClick={onBack}>{w('Done')}</button></div>
      {toast}
    </Screen>
  );
}
