// The hooks the day planner (day.ts) plugs into booking, kept here so booking code needn't import it
// (day.ts depends on the career loop, which depends on booking).
import type { Career, Show } from './types';

type Fits = (c: Career, show: Show) => { ok: boolean; why?: string };
let fitsFn: Fits = () => ({ ok: true });
let bookedFn: (c: Career, show: Show) => void = () => undefined;

export const setAvailability = (fits: Fits, booked: (c: Career, show: Show) => void): void => { fitsFn = fits; bookedFn = booked; };
/** Would the whole journey for this show fit around everything else you're doing? */
export const fitsTrip = (c: Career, show: Show): { ok: boolean; why?: string } => fitsFn(c, show);
/** You've just been booked on this show (a day job may need sorting). */
export const booked = (c: Career, show: Show): void => bookedFn(c, show);
