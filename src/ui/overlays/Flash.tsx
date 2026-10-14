/** Big gold word across the screen. Remounting (new key) restarts the animation. */
export function Flash({ text }: { text: string }) {
  return (
    <div id="flash" className="go">
      {text}
    </div>
  );
}
