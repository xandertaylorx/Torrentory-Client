import { createRoot } from 'react-dom/client';
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist-mono/400.css';
import './styles.css';
import App from './App.jsx';
import { parseHash } from './ui/Landing.jsx';
import { loadSession, saveSession, startApp, openChat, BOT } from './lib/session.js';
import { joinWithCode } from './lib/invite.js';
import { getState, setState } from './lib/store.js';
import { hasVault, resumeVault } from './lib/vault.js';
import { newRoomSecret } from './lib/crypto.js';

const TEST = /\/chat\/test\/?$/.test(location.pathname);

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

// /chat/test: a fresh chat with the Test Bot, which runs as a second participant in a hidden iframe
async function bootTest() {
  if (!loadSession()?.name) saveSession({ name: 'You' });
  await boot();
  if (getState().phase !== 'app') await startApp();
  const secret = newRoomSecret();
  await openChat({ secret, name: 'Test Bot' }, { test: true });
  const frame = document.createElement('iframe');
  frame.src = `${location.pathname}?bot=1#${secret}`;
  frame.allow = 'autoplay';
  frame.title = 'Test Bot';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-10px;top:-10px';
  document.body.appendChild(frame);
}

if (BOT) {
  // inside the hidden iframe: no UI, just the bot
  import('./lib/bot.js').then(({ runBot }) => runBot(location.hash.slice(1)));
} else {
  if (TEST) bootTest(); else boot();
  window.addEventListener('hashchange', () => { if (loadSession()?.name) boot(); });
  createRoot(document.getElementById('root')).render(<App />);
}
