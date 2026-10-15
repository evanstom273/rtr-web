import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');
createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
// Tell the boot rescue in index.html that the game started.
(window as { __rtrBooted?: boolean }).__rtrBooted = true;
try {
  sessionStorage.removeItem('rtr-rescue');
} catch {
  /* ignore */
}
