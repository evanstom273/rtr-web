// Dev only (never in a build): the career's insides on window.__rtrDev, so the browser-check scripts can set up a
// night worth looking at (a tag match tonight, a Rumble on the card, a booker's office) without clicking through
// months of the calendar.
import * as career from './career';
import * as bouts from './career/bouts';
import { FEATURES } from './career/tuning';
import * as matchWorld from './world/matchWorld';
import * as world from './world/world';
import * as data from './data/rtr';
import * as homes from './career/life/homes';
import * as garage from './career/life/garage';
import * as lifeMoney from './career/life/money';
import * as lifeState from './career/life/state';

export function install(): void {
  (window as unknown as { __rtrDev: unknown }).__rtrDev = { career, bouts, matchWorld, world, data, FEATURES, life: { homes, garage, money: lifeMoney, state: lifeState } };
}
