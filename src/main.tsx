import { render } from 'preact';
import { App } from './ui/App';
import './styles.css';

// After an update, an old open screen may try to load a part of the app that the
// new version replaced. Reload once to pick up the new version instead of failing.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  reloadOnce();
});

export function reloadOnce(): void {
  try {
    const last = Number(sessionStorage.getItem('yawmi-reloaded') ?? 0);
    if (Date.now() - last < 30_000) return; // avoid reload loops
    sessionStorage.setItem('yawmi-reloaded', String(Date.now()));
  } catch {
    /* storage blocked: still reload once */
  }
  location.reload();
}

render(<App />, document.getElementById('app')!);
