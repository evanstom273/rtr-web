/** Back pressed mid-match: make sure before throwing the match away. */
export function LeavePrompt({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <div className="ov leave" onClick={onStay}>
      <div className="inner" onClick={(e) => e.stopPropagation()}>
        <div className="mt-kicker">Mid-match</div>
        <div className="mt-title">Leave the match?</div>
        <p className="pin-sub">It won't be finished or rated.</p>
        <div className="sc-actions">
          <button className="sc-btn work" onClick={onStay}>
            <span className="pl">Keep wrestling</span>
            <span className="ps">Back to the ring. (Back again does this too.)</span>
          </button>
          <button className="sc-btn tap" onClick={onLeave}>
            <span className="pl">Leave</span>
            <span className="ps">Return to the roster.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
