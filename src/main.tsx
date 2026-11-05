import { FEATURES } from './career/tuning';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { bootWorld } from './world/world';
import './ui/styles.css';
import './ui/skins.css';

// Dev only: ?matches=0 turns the match overhaul off for this session (singles only, as before it).
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('matches') === '0') (FEATURES as { matches: boolean }).matches = false;
// Dev only: the career's insides for the browser-check scripts.
if (import.meta.env.DEV) void import('./devHooks').then((m) => m.install());

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

function render() {
  createRoot(root!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

// Load the world (the shared database) before anything reads it. If storage hangs, play on with the
// shipped database rather than sit on a blank screen.
let waiting = true;
const giveUp = new Promise((resolve) => window.setTimeout(resolve, 4000));
void Promise.race([bootWorld(() => waiting), giveUp]).catch(() => undefined).then(() => {
  waiting = false;
  render();
});
// Tell the boot rescue in index.html that the game started.
(window as { __rtrBooted?: boolean }).__rtrBooted = true;
try {
  sessionStorage.removeItem('rtr-rescue');
} catch {
  /* ignore */
}
