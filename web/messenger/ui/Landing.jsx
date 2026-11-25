import { useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { avatarSrc, randomSeeds } from '../lib/avatars.js';
import { squareAvatar } from '../lib/media.js';
import { unb64u, fromUtf8 } from '../lib/crypto.js';
import { loadSession, setProfile, startApp, openChat } from '../lib/session.js';
import { joinWithCode, normalizeCode, looksLikeCode } from '../lib/invite.js';
import { toast, setState } from '../lib/store.js';
import { HowItWorks } from './HowItWorks.jsx';

export function parseInvite(text) {
  const s = String(text || '').trim();
  const frag = s.includes('#') ? s.slice(s.indexOf('#') + 1) : s;
  const [secret, nameB64] = frag.split('.');
  if (!secret || secret.length < 22 || /[^A-Za-z0-9_-]/.test(secret)) return null;
  let name = '';
  try { if (nameB64) name = fromUtf8(unb64u(nameB64)); } catch {}
  return { secret, name };
}

export function ProfileEditor({ name, setName, avatar, setAvatar, compact }) {
  const fileRef = useRef(null);
  const [seeds, setSeeds] = useState(() => {
    const s = randomSeeds(13);
    return avatar?.startsWith('g:') ? [avatar.slice(2), ...s.slice(1)] : s;
  });
  const pickFile = async (f) => {
    if (!f) return;
    try { setAvatar(await squareAvatar(f)); } catch { toast('That image could not be read', 'warn'); }
  };
  const nameSeed = name.trim() || 'you';
  return (
    <div className={`profile-editor ${compact ? 'compact' : ''}`}>
      <div className="pe-top">
        <span className="pe-current"><img src={avatarSrc(avatar, nameSeed)} alt="" /></span>
        <label className="field grow">
          <span>Display name</span>
          <input type="text" value={name} maxLength={40} placeholder="What should people call you?" onChange={(e) => setName(e.target.value)} autoFocus={!compact} />
        </label>
      </div>
      <div className="pe-head">
        <span>Picture</span>
        <button className="link small" onClick={() => setSeeds(randomSeeds(13))}><Icon name="sparkle" size={13} /> Shuffle</button>
      </div>
      <div className="pe-grid" role="listbox" aria-label="Profile pictures">
        <button className={`pe-opt ${!avatar ? 'sel' : ''}`} onClick={() => setAvatar(null)} title="Made from your name" aria-label="Made from your name">
          <img src={avatarSrc(null, nameSeed)} alt="" />
          <span className="pe-tag">Aa</span>
        </button>
        {seeds.map((sd) => (
          <button key={sd} className={`pe-opt ${avatar === 'g:' + sd ? 'sel' : ''}`} onClick={() => setAvatar('g:' + sd)} aria-label="Generated picture">
            <img src={avatarSrc('g:' + sd)} alt="" />
          </button>
        ))}
        <button className={`pe-opt add ${avatar?.startsWith('data:') ? 'sel' : ''}`} onClick={() => fileRef.current.click()} aria-label="Upload a photo" title="Upload a photo">
          {avatar?.startsWith('data:') ? <img src={avatar} alt="" /> : <Icon name="upload" size={16} />}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickFile(e.target.files[0]); e.target.value = ''; }} />
    </div>
  );
}

// what the URL fragment asks for: a three-word code (#c=maple-orbit-stone) or a full key link
export function parseHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('c=')) { const code = normalizeCode(h.slice(2)); return code ? { code } : null; }
  return parseInvite(h);
}

export function Landing({ theme, toggleTheme }) {
  const session = loadSession();
  const target = parseHash();
  const [name, setName] = useState(session?.name || '');
  const [avatar, setAvatar] = useState(session?.avatar?.startsWith('p:') ? null : session?.avatar || null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (next) => {
    if (!name.trim()) { toast('Pick a name first', 'warn'); return; }
    setBusy(true);
    setProfile({ name: name.trim(), avatar });
    await startApp();
    history.replaceState(null, '', location.pathname);
    if (next?.code) joinWithCode(next.code);
    else if (next?.secret) await openChat(next);
    else if (next === 'new') setState({ sheet: 'new' });
  };

  return (
    <div className="landing">
      <header className="topbar">
        <a className="brand" href="/" title="Torrentory home"><BrandMark />Torrentory<span className="product">Messenger</span></a>
        <span className="spacer" />
        <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></button>
      </header>

      <main className="landing-main">
        <section className="hero">
          <span className="eyebrow"><b>Messenger</b> Peer-to-peer, end-to-end encrypted</span>
          <h1>Messages with nothing to keep.</h1>
          <p className="lede">No accounts, no servers, no database. Share a three-word code, and when everyone closes the tab the conversation is gone.</p>
        </section>

        <section className="panel setup">
          <div className="panel-bar">
            <span className="lights"><i /><i /><i /></span>
            <span className="panel-title">{target ? 'You have an invite' : 'Your profile'}</span>
            {target?.code && <span className="panel-note">{target.code}</span>}
          </div>
          <div className="panel-body">
            <ProfileEditor name={name} setName={setName} avatar={avatar} setAvatar={setAvatar} />
            <div className="divider" />
            {target ? (
              <button className="btn primary big" disabled={busy} onClick={() => go(target)}>
                {busy ? 'Connecting…' : target.code ? 'Continue and knock' : `Join ${target.name || 'chat'}`}
              </button>
            ) : (
              <>
                <div className="row">
                  <CodeInput value={code} onChange={setCode} onEnter={() => looksLikeCode(code) && go({ code })} />
                  <button className="btn primary" disabled={busy || !looksLikeCode(code)} onClick={() => go({ code })}>Join</button>
                </div>
                <div className="or"><span>or</span></div>
                <button className="btn big" disabled={busy} onClick={() => go('new')}>Start a new chat</button>
              </>
            )}
          </div>
          <div className="panel-foot"><span className="sig" />Your profile lives in this tab only</div>
        </section>

        <p className="specs">Ed25519 · XChaCha20-Poly1305 · X25519 · AES-256-GCM · WebRTC DTLS</p>
      </main>
      <HowItWorks floating />
      <footer className="landing-foot"><span>© Torrentory · Built by Crooli</span><span className="dim">Keys stay in this tab. Nothing is sent to a server.</span></footer>
    </div>
  );
}

export function CodeInput({ value, onChange, onEnter, autoFocus }) {
  const ok = looksLikeCode(value);
  return (
    <input
      type="text" className={`code-input ${ok ? 'ok' : ''}`} value={value} autoFocus={autoFocus}
      placeholder="Enter a code, like maple-orbit-stone" spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off"
      onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-/, ''))}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      onPaste={(e) => { const t = e.clipboardData.getData('text'); const m = t.match(/#c=([a-z-]+)/i); if (m) { e.preventDefault(); onChange(m[1].toLowerCase()); } }}
    />
  );
}

export function BrandMark({ size = 20 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path fill="currentColor" d="M30 10v25H12l18-25Z" />
      <path fill="currentColor" d="M34 8v27h18L34 8Z" />
      <path fill="currentColor" d="M9 39h46l-8 13H18L9 39Z" />
    </svg>
  );
}
