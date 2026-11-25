import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useStore, useChat, setState, getState, toast } from '../lib/store.js';
import { leaveChat, startCall, joinCall, renameChat, setProfile, setActive, openChat, burnAll, setKeep, currentProfile, saveSession, setTtl, TTL_OPTIONS } from '../lib/session.js';
import { createVault, unlockVault, lockVault, isUnlocked } from '../lib/vault.js';
import { shareCode, regenerateCode, answerKnock, joinWithCode, cancelJoin, shareText, looksLikeCode } from '../lib/invite.js';
import { newRoomSecret } from '../lib/crypto.js';
import { Avatar, Sheet, useNow, timeOf } from './common.jsx';
import { Icon } from './icons.jsx';
import { MessageList } from './Messages.jsx';
import { Composer } from './Composer.jsx';
import { ProfileEditor, BrandMark, CodeInput } from './Landing.jsx';
import { fmtTime } from '../lib/media.js';
import { avatarSrc } from '../lib/avatars.js';
import { HowItWorks } from './HowItWorks.jsx';

export function Chat({ theme, toggleTheme }) {
  const active = useStore((s) => s.active);
  const sheet = useStore((s) => s.sheet);
  const [lightbox, setLightbox] = useState(null);
  const [drag, setDrag] = useState(false);
  const [dropped, setDropped] = useState(null);
  const clearFiles = useCallback(() => setDropped(null), []);

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const files = [...e.dataTransfer.files];
    if (files.length && active) setDropped(files);
  };

  return (
    <div className="app" onDragOver={(e) => { if (active && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDrag(true); } }} onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDrag(false)} onDrop={onDrop}>
      <div className={`window ${active ? 'has-active' : ''}`}>
        <div className="window-body">
          <ChatList theme={theme} toggleTheme={toggleTheme} />
          <section className="main">
            {active ? (
              <Conversation key={active} onOpenImage={setLightbox} dropped={dropped} clearFiles={clearFiles} />
            ) : (
              <NoChat />
            )}
          </section>
        </div>
        <StatusBar />
      </div>
      <Knocks />
      {drag && <div className="drop-zone">Drop photos or files to send</div>}
      {lightbox && <Lightbox m={lightbox} close={() => setLightbox(null)} />}
      {sheet === 'new' && <NewChatSheet />}
      {sheet === 'invite' && <InviteSheet />}
      {sheet === 'info' && <InfoSheet />}
      {sheet === 'profile' && <ProfileSheet />}
      {sheet === 'burn' && <BurnSheet />}
      {sheet === 'vault' && <VaultSheet />}
      <JoiningSheet />
    </div>
  );
}

// ---------- chat list ----------
function ChatList({ theme, toggleTheme }) {
  const order = useStore((s) => s.order);
  const chats = useStore((s) => s.chats);
  const active = useStore((s) => s.active);
  const me = useStore((s) => s.me);
  return (
    <aside className="sidebar">
      <div className="side-top">
        <a className="brand" href="/" title="Torrentory home"><BrandMark size={18} />Torrentory<span className="product">Messenger</span></a>
        <span className="spacer" />
        <button className="icon-btn sm" onClick={toggleTheme} aria-label="Toggle theme"><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} /></button>
        <button className="btn sm square" onClick={() => setState({ sheet: 'new' })} aria-label="New chat or join" title="New chat or join with a code"><Icon name="edit" size={14} /></button>
      </div>
      <LockedVaultRow />
      <ul className="chat-list">
        {order.map((id) => chats[id] && <ChatRow key={id} chat={chats[id]} active={id === active} me={me} />)}
        {order.length === 0 && (
          <li className="list-empty">
            <p>No chats yet.</p>
            <button className="btn sm primary" onClick={() => setState({ sheet: 'new' })}>New chat</button>
          </li>
        )}
      </ul>
      <div className="me-row">
        <button className="me-btn" onClick={() => setState({ sheet: 'profile' })}>
          <Avatar member={me} size={28} />
          <span>{me.name}</span>
        </button>
        <button className="icon-btn sm" onClick={() => setState({ sheet: 'burn' })} aria-label="Burn session" title="Burn session"><Icon name="flame" size={15} /></button>
      </div>
    </aside>
  );
}

function LockedVaultRow() {
  const vault = useStore((s) => s.vault);
  if (vault !== 'locked') return null;
  return (
    <button className="vault-locked" onClick={() => setState({ sheet: 'vault', vaultFor: null })}>
      <Icon name="lock" size={15} />
      <span><b>Saved chats are locked</b><small>Enter your passphrase to open them</small></span>
      <span className="vault-locked-go">Unlock</span>
    </button>
  );
}

function ChatRow({ chat, active, me }) {
  const last = chat.messages[chat.messages.length - 1];
  const who = last && (last.mid === me.mid ? 'You' : (chat.members[last.mid]?.name || last.name));
  const here = Object.values(chat.members).filter((m) => m.online && !m.self).map((m) => m.name);
  const preview = !last ? (here.length ? `${here.slice(0, 2).join(', ')}${here.length > 2 ? ` +${here.length - 2}` : ''} ${here.length === 1 ? 'is' : 'are'} here` : 'Waiting for people to join')
    : last.kind === 'system' ? last.text
    : last.deleted ? 'Message deleted'
    : `${who}: ${last.kind === 'image' ? 'Photo' : last.kind === 'voice' ? 'Voice message' : last.kind === 'file' ? last.fname || 'File' : last.text}`;
  return (
    <li>
      <button className={`chat-row ${active ? 'active' : ''}`} onClick={() => setActive(chat.id)}>
        <ChatGlyph chat={chat} />
        <span className="cr-main">
          <span className="cr-top">
            <b>{chat.name}</b>
            <span className="cr-time">{last ? timeOf(last.ts) : ''}</span>
          </span>
          <span className="cr-bottom">
            <span className="cr-preview">{chat.callInfo && <span className="cr-call">Call · </span>}{preview}</span>
            {chat.unread > 0 && <span className="badge">{chat.unread > 99 ? '99+' : chat.unread}</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

function ChatGlyph({ chat, size = 40 }) {
  const others = Object.values(chat.members).filter((m) => !m.self);
  const online = others.some((m) => m.online);
  return (
    <span className="glyph" style={{ width: size, height: size }}>
      <img src={avatarSrc(null, 'chat:' + chat.secret.slice(0, 12))} alt="" draggable="false" />
      {others.length > 0 && <i className={`dot ${online ? 'on' : ''}`} />}
    </span>
  );
}

function NoChat() {
  return (
    <div className="no-chat">
      <h3>Pick a chat, or start one</h3>
      <p>Each chat has its own keys. Invite people with a three-word code.</p>
      <div className="row center">
        <button className="btn sm primary" onClick={() => setState({ sheet: 'new' })}>New chat</button>
        <button className="btn sm" onClick={() => setState({ sheet: 'new' })}>Join with a code</button>
      </div>
    </div>
  );
}

function StatusBar() {
  const n = useStore((s) => s.order.length);
  const net = useChat((c) => c.net);
  const online = useChat((c) => (c.members ? Object.values(c.members).filter((m) => m.online).length : 0));
  return (
    <footer className="statusbar">
      <HowItWorks />
      <span className="sep">·</span>
      <span className={`sig ${net || 'online'}`} />
      <span>{net === 'connecting' ? 'Connecting' : net === 'error' ? 'Offline' : 'Connected'}</span>
      <span className="sep hide-sm">·</span>
      <span className="hide-sm">{n} {n === 1 ? 'chat' : 'chats'}{net ? ` · ${online} online here` : ''}</span>
      <span className="spacer" />
      <span className="hide-sm">Torrentory, built by Crooli</span>
    </footer>
  );
}

// ---------- conversation ----------
function Conversation({ onOpenImage, dropped, clearFiles }) {
  const [reply, setReply] = useState(null);
  return (
    <>
      <ChatHeader />
      <CallBanner />
      <MessageList onReply={setReply} onOpenImage={onOpenImage} />
      <Composer reply={reply} clearReply={() => setReply(null)} pendingFiles={dropped} clearFiles={clearFiles} />
    </>
  );
}

function ChatHeader() {
  const chat = useStore((s) => s.chats[s.active]);
  const name = chat.name;
  const members = useChat((c) => c.members);
  const call = useStore((s) => s.call);
  const info = useChat((c) => c.callInfo);
  const now = useNow(2000);
  const others = Object.values(members).filter((m) => !m.self && m.online);
  const typers = others.filter((m) => m.typingUntil > now);
  const sub = typers.length ? `${typers.map((t) => t.name).join(', ')} typing…` : others.length ? others.map((m) => m.name).join(', ') : 'Only you so far';
  return (
    <header className="chat-head">
      <button className="icon-btn sm only-mobile" onClick={() => setState({ active: null })} aria-label="Back to chats"><Icon name="back" size={18} /></button>
      <span className="head-glyph"><ChatGlyph chat={chat} size={32} /></span>
      <button className="head-text" onClick={() => setState({ sheet: 'info' })} title="Chat info">
        <b>{name}</b>
        <span className={typers.length ? 'typing' : ''}>{sub}</span>
      </button>
      {chat.test && <span className="test-chip" title="The Test Bot runs as a real second device inside this page">Test</span>}
      <span className="spacer" />
      <KeptChip chat={chat} />
      <button className="btn sm" onClick={() => setState({ sheet: 'invite' })}><Icon name="users" size={14} /> Invite</button>
      <button className="btn sm square" disabled={!!call || !others.length} onClick={() => (info ? joinCall(false) : startCall(false))} aria-label="Voice call" title="Voice call"><Icon name="phone" size={15} /></button>
      <button className="btn sm square" disabled={!!call || !others.length} onClick={() => (info ? joinCall(true) : startCall(true))} aria-label="Video call" title="Video call"><Icon name="video" size={15} /></button>
    </header>
  );
}

function keptNames(chat) {
  const names = Object.keys(chat.keepers || {}).map((mid) => chat.members[mid]?.name || 'Someone');
  if (chat.kept) names.unshift('you');
  return names;
}

function KeptChip({ chat }) {
  const names = keptNames(chat);
  if (!names.length) return null;
  const label = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names[0]} +${names.length - 1}`;
  return (
    <button className="kept-chip" onClick={() => setState({ sheet: 'info' })} title="People keeping a copy of this chat on their device">
      <Icon name="save" size={13} /> Kept by {label}
    </button>
  );
}

function CallBanner() {
  const info = useChat((c) => c.callInfo);
  const members = useChat((c) => c.members);
  const call = useStore((s) => s.call);
  const ringing = useStore((s) => s.ringing);
  const now = useNow(1000);
  if (!info || call || ringing) return null;
  const who = Object.keys(info.parts).map((m) => members[m]).filter(Boolean);
  return (
    <div className="call-banner">
      <span className="sig" />
      <span>Call in progress with {who.map((m) => m.name).join(', ')}</span>
      <span className="mono dim">{fmtTime((now - info.startedAt) / 1000)}</span>
      <span className="spacer" />
      <button className="btn sm" onClick={() => joinCall(false)}>Join</button>
      <button className="btn sm primary" onClick={() => joinCall(true)}>Join with video</button>
    </div>
  );
}

// ---------- knocks (people asking to join through my codes) ----------
function Knocks() {
  const knocks = useStore((s) => s.knocks);
  const chats = useStore((s) => s.chats);
  if (!knocks.length) return null;
  return (
    <div className="knocks">
      {knocks.map((k) => (
        <div className="knock" key={k.id}>
          <Avatar member={{ name: k.name, avatar: k.avatar, mid: k.id }} size={32} />
          <div className="knock-text">
            <b>{k.name} wants to join</b>
            <span>{chats[k.chat]?.name}</span>
          </div>
          <button className="btn sm" onClick={() => answerKnock(k.id, false)}>Deny</button>
          <button className="btn sm primary" onClick={() => answerKnock(k.id, true)}>Let in</button>
        </div>
      ))}
    </div>
  );
}

function JoiningSheet() {
  const j = useStore((s) => s.joining);
  if (!j) return null;
  const title = j.status === 'waiting' ? `Knocking on ${j.chatName || 'a chat'}` : j.status === 'denied' ? 'Not let in' : j.status === 'notfound' ? 'No one is sharing this code' : 'Looking for the chat';
  return (
    <Sheet title={title} onClose={cancelJoin}>
      <div className="joining">
        <code className="code-chip">{j.code}</code>
        {(j.status === 'deriving' || j.status === 'searching') && <p><span className="spin" />Finding whoever shared this code…</p>}
        {j.status === 'waiting' && <p><span className="spin" />Waiting for {j.hostName || 'them'} to let you in.</p>}
        {j.status === 'notfound' && <p>Check the three words. A code only works while the person who shared it has the chat open, for 30 minutes. Still listening in case they come back.</p>}
        {j.status === 'denied' && <p>{j.hostName || 'They'} didn't let you in. Ask them for a new code if that was a mistake.</p>}
      </div>
      <div className="row end">
        <button className="btn" onClick={cancelJoin}>{j.status === 'denied' ? 'Close' : 'Cancel'}</button>
        {(j.status === 'denied' || j.status === 'notfound') && <button className="btn primary" onClick={() => joinWithCode(j.code)}>Try again</button>}
      </div>
    </Sheet>
  );
}

// ---------- sheets ----------
function NewChatSheet() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const close = () => setState({ sheet: null });
  const create = async () => {
    await openChat({ secret: newRoomSecret(), name: name.trim() || 'New chat' });
    setState({ sheet: 'invite' });
  };
  const join = () => { if (looksLikeCode(code)) { close(); joinWithCode(code); } };
  return (
    <Sheet title="New chat" onClose={close}>
      <label className="field"><span>Name</span>
        <div className="row tight">
          <input type="text" value={name} maxLength={60} placeholder="Weekend plans" autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          <button className="btn primary" onClick={create}>Create</button>
        </div>
      </label>
      <div className="or"><span>or join one</span></div>
      <label className="field"><span>Code</span>
        <div className="row tight">
          <CodeInput value={code} onChange={setCode} onEnter={join} />
          <button className="btn" disabled={!looksLikeCode(code)} onClick={join}>Join</button>
        </div>
      </label>
    </Sheet>
  );
}

function InviteSheet() {
  const active = useStore((s) => s.active);
  const chat = useStore((s) => s.chats[s.active]);
  const entry = useStore((s) => s.codes[s.active]);
  const now = useNow(1000);
  const [qr, setQr] = useState('');
  const [showLink, setShowLink] = useState(false);
  useEffect(() => { if (active) shareCode(active); }, [active]);
  const code = entry?.code;
  const codeLink = code ? `${location.origin}${location.pathname}#c=${code}` : '';
  useEffect(() => {
    if (!codeLink) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    QRCode.toDataURL(codeLink, { margin: 0, width: 440, color: { dark: dark ? '#f5f5f5' : '#111111', light: '#00000000' } }).then(setQr);
  }, [codeLink]);
  if (!chat) return null;
  const left = entry ? Math.max(0, entry.expires - now) : 0;
  const copy = (text, msg) => { navigator.clipboard.writeText(text); toast(msg); };

  return (
    <Sheet title={`Invite to ${chat.name}`} onClose={() => setState({ sheet: null })}>
      <p className="sheet-lede">Give them this code. When they enter it, you'll be asked to let them in.</p>
      <div className="code-big" aria-live="polite">
        {code ? code.split('-').map((w, i) => <span key={i}>{w}</span>) : <span className="dim">…</span>}
      </div>
      <p className="code-meta">{entry?.ready ? `Works for ${fmtTime(left / 1000)} while this chat is open` : 'Getting the code ready…'}</p>
      <div className="row">
        <button className="btn grow" disabled={!code} onClick={() => copy(code, 'Code copied')}><Icon name="copy" size={14} /> Copy code</button>
        {navigator.share
          ? <button className="btn grow primary" disabled={!code} onClick={() => navigator.share({ text: shareText(code) }).catch(() => {})}>Share…</button>
          : <button className="btn grow primary" disabled={!code} onClick={() => copy(shareText(code), 'Invite message copied')}>Copy invite message</button>}
      </div>
      <div className="invite-qr">
        {qr && <img src={qr} alt="QR code for the join code" />}
        <div>
          <b>In the same room?</b>
          <span>They scan this with their phone camera, then knock the same way.</span>
          <button className="link small" onClick={() => regenerateCode(active)}>New code</button>
        </div>
      </div>
      <div className="direct">
        <button className="link small" onClick={() => setShowLink(!showLink)}>{showLink ? 'Hide direct link' : 'Or use a direct link'}</button>
        {showLink && (
          <>
            <p>A direct link lets people in without asking you. Only send it somewhere private.</p>
            <div className="row tight">
              <input type="text" readOnly value={chat.link} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => copy(chat.link, 'Direct link copied')}>Copy</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function InfoSheet() {
  const chat = useStore((s) => s.chats[s.active]);
  const [name, setName] = useState(chat?.name || '');
  const [howOpen, setHowOpen] = useState(false);
  if (!chat) return null;
  const list = Object.values(chat.members).sort((a, b) => (b.self - a.self) || (b.online - a.online));
  return (
    <Sheet title="Chat info" onClose={() => setState({ sheet: null })} wide>
      <label className="field"><span>Name</span>
        <input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== chat.name && renameChat(name.trim())}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      </label>
      <div className="field ttl-field"><span>Disappearing messages</span>
        <div className="seg" role="radiogroup" aria-label="Disappearing messages">
          {TTL_OPTIONS.map(([v, label]) => (
            <button key={v} role="radio" aria-checked={(chat.ttl || 0) === v} className={(chat.ttl || 0) === v ? 'on' : ''} onClick={() => setTtl(v, chat.id)}>{label.replace(' minutes', ' min')}</button>
          ))}
        </div>
      </div>
      <KeepSection chat={chat} />
      <div className="side-label flush">People <span>{list.length}</span></div>
      <ul className="members">
        {list.map((m) => (
          <li key={m.mid} className={m.online ? '' : 'away'}>
            <Avatar member={m} size={32} online={m.online} />
            <div className="who">
              <b>{m.name || 'Someone'}{m.self && <em> you</em>}</b>
              {!m.self && m.safety && <span className="safety-line" title="Compare this with them to make sure nobody is in the middle">{m.safety.emoji.join(' ')} <code>{m.safety.digits.slice(0, 3).join(' ')}</code></span>}
            </div>
            <span className="who-state">{chat.callInfo?.parts[m.mid] ? 'In call' : m.online ? (m.self ? '' : 'Online') : 'Left'}</span>
          </li>
        ))}
      </ul>
      <p className="hint small">Safety codes: compare the emoji with each person on a call or in person. If they match, nobody is listening in the middle.</p>
      <button className="link small" onClick={() => setHowOpen(!howOpen)}>{howOpen ? 'Hide' : 'How this chat is encrypted'}</button>
      {howOpen && (
        <ol className="layer-list">
          <li><span className="n">1</span><div><b>Ed25519 signatures</b><small>Each message is signed by its author, so relayed history can't be forged.</small></div></li>
          <li><span className="n">2</span><div><b>XChaCha20-Poly1305, per person, per message</b><small>A ratchet gives every message a new key and deletes the old one.</small></div></li>
          <li><span className="n">3</span><div><b>X25519, fresh keys every visit</b><small>A key stolen later can't unlock earlier conversations.</small></div></li>
          <li><span className="n">4</span><div><b>AES-256-GCM chat layer + padding</b><small>Keyed from this chat's secret; sizes are padded.</small></div></li>
          <li><span className="n">5</span><div><b>WebRTC DTLS, device to device</b><small>Connection setup through public relays is encrypted too. Calls use DTLS-SRTP.</small></div></li>
        </ol>
      )}
      <div className="row end">
        <button className="btn danger" onClick={() => leaveChat(chat.id)}>{chat.kept ? 'Leave and delete saved copy' : 'Leave chat'}</button>
      </div>
    </Sheet>
  );
}

function KeepSection({ chat }) {
  const others = Object.keys(chat.keepers || {}).map((mid) => chat.members[mid]?.name || 'Someone');
  const toggle = async () => {
    if (chat.kept) { await setKeep(false, chat.id); return; }
    if (!isUnlocked()) { setState({ sheet: 'vault', vaultFor: chat.id }); return; }
    await setKeep(true, chat.id);
  };
  return (
    <div className="keep-box">
      <label className={`toggle-row ${chat.kept ? 'on' : ''}`}>
        <span className="toggle-text">
          <b>Keep a copy on this device</b>
          <small>Saves this chat, its photos and voice notes in this browser, locked with your passphrase, so you can reopen it later. Everyone in the chat is told.</small>
        </span>
        <input type="checkbox" checked={!!chat.kept} onChange={toggle} />
        <span className="switch" />
      </label>
      {others.length > 0 && <p className="keep-note"><Icon name="save" size={13} /> {others.join(', ')} {others.length === 1 ? 'is' : 'are'} keeping a copy.</p>}
      <p className="hint small">The notice works for everyone using this app. It can't stop a screenshot or a modified app, so only share what you're comfortable with.</p>
    </div>
  );
}

function VaultSheet() {
  const chatId = useStore((s) => s.vaultFor);
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const vault = useStore((s) => s.vault);
  const unlocking = vault === 'locked';
  const strong = pass.length >= 10 ? 'good' : pass.length >= 8 ? 'ok' : 'short';
  const submit = async () => {
    setErr('');
    if (!unlocking) {
      if (pass.length < 8) { setErr('Use at least 8 characters.'); return; }
      if (pass !== again) { setErr("Those don't match."); return; }
    }
    setBusy(true);
    try {
      if (unlocking) {
        const { profile } = await unlockVault(pass);
        // saved chats belong to the vault's identity: switch to it and reload, which restores them
        saveSession({ id: profile.id, name: profile.name, avatar: profile.avatar });
        location.replace(location.pathname);
        return;
      }
      await createVault(pass, currentProfile());
      setState({ vault: 'unlocked', sheet: 'info' });
      if (chatId) await setKeep(true, chatId);
    } catch (e) { setErr(e.message || 'Something went wrong'); setBusy(false); }
  };
  return (
    <Sheet title={unlocking ? 'Unlock saved chats' : 'Choose a passphrase'} onClose={() => setState({ sheet: chatId ? 'info' : null })}>
      <p className="sheet-lede">{unlocking
        ? 'Enter the passphrase for the chats saved on this device.'
        : 'Saved chats are encrypted with this passphrase. You’ll need it to open them again. There is no way to recover it, so pick something you’ll remember.'}</p>
      <label className="field"><span>Passphrase</span>
        <input type="password" className="pass-input" value={pass} autoFocus onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (unlocking ? submit() : null)} />
      </label>
      {!unlocking && (
        <>
          <div className={`pass-meter ${strong}`}><i /><i /><i /></div>
          <label className="field"><span>Type it again</span>
            <input type="password" className="pass-input" value={again} onChange={(e) => setAgain(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </label>
        </>
      )}
      {err && <p className="form-err">{err}</p>}
      <div className="row end">
        <button className="btn" onClick={() => setState({ sheet: chatId ? 'info' : null })}>Cancel</button>
        <button className="btn primary" disabled={busy || !pass} onClick={submit}>{busy ? 'Working…' : unlocking ? 'Unlock' : 'Save and keep this chat'}</button>
      </div>
    </Sheet>
  );
}

function ProfileSheet() {
  const me = useStore((s) => s.me);
  const vault = useStore((s) => s.vault);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const save = () => { if (name.trim()) { setProfile({ name: name.trim(), avatar }); setState({ sheet: null }); } };
  return (
    <Sheet title="Your profile" onClose={() => setState({ sheet: null })}>
      <ProfileEditor name={name} setName={setName} avatar={avatar} setAvatar={setAvatar} compact />
      {vault === 'unlocked' && (
        <div className="vault-row">
          <span><Icon name="save" size={14} /> Saved chats are unlocked in this tab.</span>
          <button className="btn sm" onClick={() => { lockVault(); sessionStorage.clear(); location.replace(location.pathname); }}>Lock and close</button>
        </div>
      )}
      <div className="row end"><button className="btn primary" onClick={save}>Save</button></div>
    </Sheet>
  );
}

function BurnSheet() {
  const n = getState().order.length;
  return (
    <Sheet title="Burn this session?" onClose={() => setState({ sheet: null })}>
      <p>This leaves all {n} {n === 1 ? 'chat' : 'chats'}, wipes every message and photo from this tab's memory, deletes any chats saved on this device, and forgets your profile and keys. Other people keep what's on their screens until they close them.</p>
      <div className="row end">
        <button className="btn" onClick={() => setState({ sheet: null })}>Cancel</button>
        <button className="btn danger" onClick={burnAll}>Burn everything</button>
      </div>
    </Sheet>
  );
}

function Lightbox({ m, close }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && close(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [close]);
  return (
    <div className="lightbox" onClick={close}>
      <img src={m.url} alt="" onClick={(e) => e.stopPropagation()} />
      <div className="lb-bar" onClick={(e) => e.stopPropagation()}>
        {m.text && <span>{m.text}</span>}
        <span className="spacer" />
        <a className="btn sm" href={m.url} download={`photo-${m.id.slice(0, 6)}.${(m.mime || 'image/jpeg').split('/')[1]}`}>Save</a>
        <button className="btn sm" onClick={close}>Close</button>
      </div>
    </div>
  );
}
