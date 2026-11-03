import { findWrestler } from '../../data/rtr';
import { surname } from '../model';
import type { Skin } from '../skin';

/** The top of the match builder, in each skin's dress. */
export function BuilderHead({ skin, a, b }: { skin: Skin; a?: string; b?: string }) {
  const wa = a ? findWrestler(a) : undefined, wb = b ? findWrestler(b) : undefined;
  if (skin === 'paper') {
    return (
      <div className="bh-paper">
        <div className="pp-dateline">
          <span>Booking desk</span>
          <span>Tonight's card</span>
        </div>
        <h1 className="pp-mast">The Ringside Report</h1>
      </div>
    );
  }
  if (skin === 'broadcast') {
    return (
      <div className="bh-broadcast">
        <h1 className="bh-slant">Make the match</h1>
        <span className="bh-live">
          <i />
          Pre-show
        </span>
      </div>
    );
  }
  return (
    <div className="bh-building">
      <span className="bh-tonight">Tonight</span>
      <h1 className="bh-matchup">
        {wa ? surname(wa) : '???'} <span>vs</span> {wb ? surname(wb) : '???'}
      </h1>
    </div>
  );
}
