import { useEffect, useState } from 'react';
import { useStore } from './lib/store.js';
import { Landing } from './ui/Landing.jsx';
import { Chat } from './ui/Chat.jsx';
import { CallOverlay, IncomingCall } from './ui/Call.jsx';

const THEME_KEY = 'torrentory.messenger.theme';

export default function App() {
  const phase = useStore((s) => s.phase);
  const toasts = useStore((s) => s.toasts);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { sessionStorage.setItem(THEME_KEY, theme); } catch {}
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'dark' ? '#090909' : '#fafafa');
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  return (
    <>
      {phase === 'setup' ? <Landing theme={theme} toggleTheme={toggleTheme} /> : <Chat theme={theme} toggleTheme={toggleTheme} />}
      <CallOverlay />
      <IncomingCall />
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
      </div>
    </>
  );
}
