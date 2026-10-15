/** The 3-2-1 that precedes every timing interaction. */
export function Countdown({ label }: { label: string }) {
  return (
    <div className="cd" aria-live="assertive">
      <span key={label} className="cd-n">
        {label}
      </span>
    </div>
  );
}
