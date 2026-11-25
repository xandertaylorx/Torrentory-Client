import { useEffect, useRef, useState } from 'react';

const STEPS = [
  ['A chat is a key', 'Made on your device and shared only with the people in the chat. No account, no server holding anything.'],
  ['Invite with three words', 'They type the code and knock. You let them in, and the key goes straight to their device.'],
  ['Messages go device to device', 'Locked in five layers of encryption and signed by whoever wrote them. Relays only help you find each other.'],
  ['Close the tab and it’s gone', 'Unless someone keeps a copy, locked with their passphrase on their own device. Then everyone in the chat is told.'],
];

function Diagram() {
  return (
    <svg className="hiw-diagram" viewBox="0 0 280 72" aria-hidden="true">
      <path d="M58 46 H222" className="hiw-line" />
      <path d="M58 40 Q140 2 222 40" className="hiw-relay" />
      <text x="140" y="15" className="hiw-small">relays: just to say hello</text>
      <g transform="translate(140 46)">
        <rect x="-11" y="-11" width="22" height="22" rx="6" className="hiw-lock-bg" />
        <path d="M-4 -1v-3a4 4 0 0 1 8 0v3M-6 -1h12v8h-12z" className="hiw-lock" />
      </g>
      <g transform="translate(34 46)"><rect x="-22" y="-16" width="44" height="32" rx="8" className="hiw-dev" /><text y="4" className="hiw-label">You</text></g>
      <g transform="translate(246 46)"><rect x="-22" y="-16" width="44" height="32" rx="8" className="hiw-dev" /><text y="4" className="hiw-label">Them</text></g>
    </svg>
  );
}

export function HowItWorks({ floating }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (e.type === 'keydown' ? e.key === 'Escape' : !ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div className={`hiw ${floating ? 'floating' : ''}`} ref={ref}>
      <button className={`hiw-btn ${open ? 'on' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="hiw-q">?</span>How it works
      </button>
      {open && (
        <div className="hiw-pop" role="dialog" aria-label="How it works">
          <Diagram />
          <ol>
            {STEPS.map(([t, d], i) => (
              <li key={i}><span className="hiw-n">{i + 1}</span><div><b>{t}</b><p>{d}</p></div></li>
            ))}
          </ol>
          <p className="hiw-foot">To be sure nobody is listening in the middle, compare the emoji safety code with each person in Chat info.</p>
        </div>
      )}
    </div>
  );
}
