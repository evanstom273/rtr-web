// Life: plugs homes, getting about, borrowing, tax and the agent into the career's days, months and matches.
import { moveMarkets } from '../../world/lifeWorld';
import { letter, person, setCareerHooks, setIncomeHook, setLivingHook, setMod } from '../career';
import { addDays } from '../dates';
import { setLifeMood } from '../socialLife';
import { PRICE_BOOK as PB, REST_RECOVERY } from '../tuning';
import type { Career, Show } from '../types';
import { crewTrip, monthlyGarage, roadCrew, seizeVehicle } from './garage';
import { homeMood, homeName, homeRest, homeTrainPrice, monthlyHomes, rentWeek, seizeHome, weeklyHome } from './homes';
import { monthlyLoans } from './loans';
import { agentFinds, agentHandles, offIncome, pruneMonths } from './money';
import { dailyPA, monthlyStaff, payEntrance } from './staff';
import { monthlyWealth, richList } from './aiMoney';
import { monthlySchool, monthlyWorldSchools } from './school';
import { netWorth } from './worth';
import { monthlyFunds, monthlyInsurance, monthlyLuxury, monthlyStakes, monthlyVentures, seizeVenture } from './invest';
import { life, liveHome, on } from './state';
import { band, homeCountry, restOnTheRoad, roadVehicle } from './travel';
import { homeCity } from './state';

const money = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const active = (c: Career) => (on('homes') || on('money')) && !c.spectator;

/** The first day with Life on: you're renting where you live, at about what living costs were. */
function welcome(c: Career): void {
  const fresh = !c.life;
  const L = life(c);
  if (!fresh) return;
  const h = liveHome(c);
  letter(c, {
    kind: 'news', from: 'Home', subject: `Your ${homeName(h).toLowerCase()}`,
    body: [
      `You’re renting a ${homeName(h).toLowerCase()}: ${money(rentWeek(h.tier as 'room', h.city))} a week with bills, every Monday (it takes over from living costs).`,
      'Life is in the hub now: move somewhere better, buy a place (cash or a mortgage), get a car or a jet, and hire an agent. Tax comes off what you earn as it comes in.',
    ],
  });
  void L;
}

setIncomeHook(offIncome);
setLivingHook((c, day) => (on('homes') && !c.spectator ? weeklyHome(c, day) : false));

setCareerHooks({
  daily: (c) => {
    if (!active(c)) return;
    welcome(c);
    agentHandles(c);
    if (on('staff')) dailyPA(c);
  },
  monthly: (c) => {
    // Everyone's money, even with no one at the controls; the rich list every January.
    if (on('ai')) {
      const month = addDays(c.today, 1).slice(0, 7);
      monthlyWealth(c, month);
      if (month.endsWith('-01')) richList(c, month.slice(0, 4), c.spectator ? 0 : netWorth(c));
    }
    // The schools' names follow their graduates (every quarter).
    if (on('school') && /-(01|04|07|10)$/.test(addDays(c.today, 1).slice(0, 7))) monthlyWorldSchools();
    if (!active(c)) return;
    life(c);
    if (on('homes')) {
      moveMarkets(addDays(c.today, 1).slice(0, 7));
      monthlyHomes(c);
      monthlyGarage(c);
    }
    if (on('staff')) monthlyStaff(c);
    if (on('school')) monthlySchool(c);
    if (on('invest')) {
      const month = addDays(c.today, 1).slice(0, 7);
      monthlyVentures(c, month);
      monthlyFunds(c, month);
      monthlyStakes(c);
      monthlyLuxury(c, month);
      monthlyInsurance(c);
    }
    monthlyLoans(c, (cc, loan) => (loan.kind === 'mortgage' ? seizeHome(cc, loan.on) : loan.kind === 'business' ? seizeVenture(cc, loan.on) : seizeVehicle(cc, loan.on)));
    pruneMonths(c);
    agentFinds(c);
  },
  // On the road with the crew: closer every trip.
  mine: (c: Career, show: Show, bout) => {
    if (c.spectator) return;
    payEntrance(c, show, bout);
    if (!on('homes')) return;
    const v = roadVehicle(c);
    if (!v || PB.vehicles[v.tier].seats <= 4) return;
    const b = band({ country: homeCountry(c), city: homeCity(c) }, show);
    if (b === 'short' || b === 'long') crewTrip(c, roadCrew(c, PB.vehicles[v.tier].seats));
  },
  // On the tour bus, travel is rest.
  phase: (c, _ph, activity) => {
    if (activity !== 'travel' || !on('homes') || !restOnTheRoad(c)) return;
    const p = person(c, c.player);
    p.fatigue = Math.max(0, p.fatigue - REST_RECOVERY);
  },
});

// A better home: you sleep better; a home gym or a ring: training's cheaper.
setMod('recovery', (c, id) => (on('homes') && id === c.player && c.life ? 1 + homeRest(c) : 1));
setMod('trainPrice', (c, id) => (on('homes') && id === c.player && c.life ? homeTrainPrice(c) : 1));

// How your home sits with you; repayments you're missing weigh on you.
setLifeMood((c) => {
  if (!on('homes') || !c.life) return [];
  const out: [string, number][] = [];
  const h = liveHome(c), m = homeMood(c);
  if (m >= 3) out.push(['home_good', m]);
  if (!h.own && h.tier === 'room' && c.people[c.player]?.contract) out.push(['home_poor', PB.roomSigned]);
  if (c.life.loans.some((l) => l.missed > 0)) out.push(['debt', -6]);
  return out;
});

