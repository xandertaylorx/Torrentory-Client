import { createRoot } from 'react-dom/client';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist-mono/400.css';
import './styles.css';
import App from './App.jsx';
import { parseHash } from './ui/Landing.jsx';
import { loadSession, startApp, openChat } from './lib/session.js';
import { joinWithCode } from './lib/invite.js';
import { getState, setState } from './lib/store.js';
import { hasVault, resumeVault } from './lib/vault.js';

// already set up in this tab (e.g. a refresh): reconnect every chat, then follow any link that was opened
async function boot() {
  let saved = [];
  if (getState().vault === 'none' && await hasVault()) {
    const r = await resumeVault();       // this tab unlocked earlier: no need to ask again
    if (r) { saved = r.chats; setState({ vault: 'unlocked' }); } else setState({ vault: 'locked' });
  }
  const s = loadSession();
  if (!s?.name) return;
  const target = parseHash();
  if (getState().phase !== 'app') await startApp({ saved });
  history.replaceState(null, '', location.pathname);
  if (target?.code) joinWithCode(target.code);
  else if (target?.secret) await openChat(target);
}
boot();
window.addEventListener('hashchange', () => { if (loadSession()?.name) boot(); });

createRoot(document.getElementById('root')).render(<App />);
