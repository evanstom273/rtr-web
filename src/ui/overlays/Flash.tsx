/** Big word across the screen. Remounting (new key) restarts the animation. */
export function Flash({ text, strong }: { text: string; strong?: boolean }) {
  return (
    <div id="flash" className={`go${strong ? ' strong' : ''}`}>
      {text}
    </div>
  );
}
