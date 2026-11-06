// The pay rework's rescale-on-load (rev 12): career/economy plugs it in here, a leaf module, so the world never
// imports career code (and there's no import cycle at load).
import type { Career } from '../career/types';

let rescale: ((c: Career) => void) | null = null;
export const setRescalePay = (f: (c: Career) => void): void => { rescale = f; };
export const rescalePay = (c: Career): void => { rescale?.(c); };
