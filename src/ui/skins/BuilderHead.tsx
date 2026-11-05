import { findWrestler } from '../../data/rtr';
import { surname } from '../model';
import type { Skin } from '../skin';

/** The top of the match builder, in each skin's dress. */
/** `label`: a match with more than two people ("Rumble · 21", "Tag team"), shown in place of "A vs B". */
export function BuilderHead({ skin, a, b, label }: { skin: Skin; a?: string; b?: string; label?: string }) {
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
        {label ?? <>{wa ? surname(wa) : '???'} <span>vs</span> {wb ? surname(wb) : '???'}</>}
      </h1>
    </div>
  );
}
