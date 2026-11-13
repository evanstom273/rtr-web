// The big cut (Lyra's call) hid a lot of the game behind switches, with the code kept. Tests of that code bring it all
// back for their run, so it keeps working if a switch is ever flipped back on.
import { CUT_CLAUSES, FEATURES, LIFE_PARTS } from './tuning';

/** Everything the cut hid, back on. Returns a function that puts the cut back. */
export function bringBack(): () => void {
  const f = { ...FEATURES }, l = { ...LIFE_PARTS }, cl = [...CUT_CLAUSES];
  Object.assign(FEATURES, { social: true, jobs: true, phone: true, bookerMode: true, romance: true, politics: true, checkIns: true, press: true, playSegments: true });
  for (const k of Object.keys(LIFE_PARTS) as (keyof typeof LIFE_PARTS)[]) LIFE_PARTS[k] = true;
  CUT_CLAUSES.length = 0;
  return () => { Object.assign(FEATURES, f); Object.assign(LIFE_PARTS, l); CUT_CLAUSES.length = 0; CUT_CLAUSES.push(...cl); };
}
