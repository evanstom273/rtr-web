// Career mode: everything the screens need. Importing this also switches on the offers rules.
import './offers';
import './requests';
import './relations';
import './events';
import './eventLibrary';
import './specials';
import './worldEvents';
import './indieScene';
import './personality';
import './staff';
import './promoPopularity';
import './social';
import './day';
import './exclusive';
import './creative';

export * from './career';
export * from './contracts';
export * from './offers';
export * from './requests';
export * from './relations';
export { answerEvent, eventChoices, eventLibrary, eligible, eventChance, fire, ctxFor } from './events';
export { EVENT_IDS } from './eventLibrary';
export { arrangeFarewell, cupLabel, makeSpecial } from './specials';
export { roundName, tourneyOf, tourneyPairs } from './tourney';
export { patienceOf, patienceLog, promoOfBooker, bookerKey, indieKey, showBooker } from './patience';
export * from './types';
export { drawCalendar } from './calendar';
export { CLAUSES, C, BUDGET, budgetOf, attitude, BONUS_TRIGGERS, CHARACTER, GROUPS, PACKAGES, PLAYER_PACKAGES, tierOf, triggerSlots, type BonusTrigger, type ClauseId, type PackageId } from './clauses';
export { dealsOf, dealWith, exclusivityOf, sideWork } from './deals';
export { nonExclusive } from './exclusive';
export { CREATIVE_LABEL, creativeAsk, creativeBlock, creativeBouts, creativeOdds, creativeTier, opponentsFor, vetoNext, type CreativeKind, type CreativeReq } from './creative';
export { trainingPrice, attributeTotal, contractFee, indieFee, matchPay, travelCost } from './economy';
export { buyBlock, buyTrait, offerAt, offerDue, traitPrice, lean } from './personality';
export { handover, promisesOnHandover } from './staff';
export { nextMatch, reach as socialReach, socialAct, socialPreview, weekCap as socialWeekCap, type SocialKind, type SocialPost } from './social';
export { activityAt, advancePhase, baseCountry, bookings, defaultRoutine, fits, isShift, jobBoard, phaseOf, pkey, quitJob, relocate, relocateCost, routineOf, shiftPay, takeJob, timeOff, trainSession, type Activity } from './day';
export { baseRegion, livingCost } from './economy';
export { skip, type SkipTarget } from './skip';
export { answerForMe, defaultOrders, ordersOf } from './away';
export { developMonth, ensurePotential, rollRoom } from './development';
export { addNobody, backdate, careerFrom, debuts, dropNobody, NOBODY, simulateTo, startSpectator } from './worldSim';
export { beginHistory, checkpoint, debutYear, headline, historyOf, onesToWatch, runHistoryYear, summarise, type Summary } from './historySim';
export { MAIL_TABS, replyTo, tabOf, waitingOnYou, type MailTab } from './mail';
export {
  blocked as hustleBlocked, bookConvention, buyStock, classFee, conventionsAhead, conventionTake, dropGig, fundTotal, hireable, hireFee, hustleOf, isCoaching,
  merchUnits, ownBudget, ownDraw, putOnShow, recentSessions, setCoaching, showWorkPay, subsHeading, subsTarget, venues, workShow, type Gig, type HustleState, type OwnPlan,
} from './hustle';
