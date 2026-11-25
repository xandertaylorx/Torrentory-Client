import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, useChat, getState, setState, toast } from '../lib/store.js';
import { react, deleteMessage, markSeen } from '../lib/session.js';
import { Avatar, timeOf, dayOf, useNow } from './common.jsx';
import { Icon } from './icons.jsx';
import { VoicePlayer } from './Voice.jsx';
import { fmtSize } from '../lib/media.js';

const QUICK = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
const GROUP_MS = 5 * 60 * 1000;

export function MessageList({ onReply, onOpenImage }) {
  const messages = useChat((c) => c.messages);
  const members = useChat((c) => c.members);
  const me = useStore((s) => s.me);
  const incoming = useChat((c) => c.incoming);
  const now = useNow(1500);
  const scroller = useRef(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [menuFor, setMenuFor] = useState(null);

  const typers = Object.values(members).filter((m) => !m.self && m.typingUntil > now);
  const receiving = Object.entries(incoming).filter(([, v]) => v !== undefined);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, typers.length, receiving.length]);

  useEffect(() => { if (stick.current) markSeen(); }, [messages.length]);

  const onScroll = () => {
    const el = scroller.current;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stick.current = near;
    setShowJump(!near);
    if (near) markSeen();
  };
  const jump = () => { const el = scroller.current; el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); };

  // who has seen my latest message
  const lastMine = [...messages].reverse().find((m) => m.mid === me.mid && !m.deleted && m.kind !== 'system');
  const seers = lastMine ? Object.values(members).filter((m) => !m.self && (m.seenTs || 0) >= lastMine.ts) : [];

  const visible = messages;
  return (
    <div className="messages" ref={scroller} onScroll={onScroll} onClick={() => menuFor && setMenuFor(null)}>
      <div className="messages-inner">
        <EmptyState show={visible.length === 0} />
        {visible.map((m, i) => {
          const prev = visible[i - 1]?.kind === 'system' ? null : visible[i - 1], next = visible[i + 1]?.kind === 'system' ? null : visible[i + 1];
          const newDay = i === 0 || dayOf(visible[i - 1].ts) !== dayOf(m.ts);
          const first = newDay || !prev || prev.mid !== m.mid || m.ts - prev.ts > GROUP_MS;
          const last = !next || next.mid !== m.mid || next.ts - m.ts > GROUP_MS || dayOf(next.ts) !== dayOf(m.ts);
          const author = members[m.mid] || { mid: m.mid, name: m.name };
          return (
            <Fragment key={m.id}>
              {newDay && <div className="day"><span>{dayOf(m.ts)}</span></div>}
              {m.kind === 'system' ? <div className={`sys-line ${m.tone || ''}`}><span>{m.text}</span></div> : <Message
                m={m} author={author} mine={m.mid === me.mid} first={first} last={last}
                menuOpen={menuFor === m.id} setMenu={(v) => setMenuFor(v ? m.id : null)}
                onReply={onReply} onOpenImage={onOpenImage}
                seers={lastMine?.id === m.id ? seers : null}
                replyTo={m.reply ? messages.find((x) => x.id === m.reply) : null}
                members={members}
              />}
            </Fragment>
          );
        })}
        {receiving.map(([peerId, pct]) => {
          const mem = Object.values(members).find((x) => x.peerIds?.includes(peerId));
          return (
            <div key={peerId} className="msg theirs first last">
              <div className="msg-av"><Avatar member={mem} size={30} /></div>
              <div className="msg-body"><div className="bubble receiving">Receiving · {Math.round(pct * 100)}%<span className="rx-bar"><i style={{ width: `${pct * 100}%` }} /></span></div></div>
            </div>
          );
        })}
        {typers.length > 0 && (
          <div className="msg theirs first last typing-row">
            <div className="msg-av"><Avatar member={typers[0]} size={30} /></div>
            <div className="msg-body">
              <div className="bubble typing"><i /><i /><i /></div>
              <span className="typing-name">{typers.map((t) => t.name).join(', ')} {typers.length > 1 ? 'are' : 'is'} typing</span>
            </div>
          </div>
        )}
      </div>
      {showJump && <button className="jump" onClick={jump} aria-label="Jump to latest"><Icon name="arrowDown" size={18} /></button>}
    </div>
  );
}

function EmptyState({ show }) {
  const online = useChat((c) => Object.values(c.members).filter((m) => m.online && !m.self).length);
  if (!show) return null;
  return (
    <div className="empty">
      <h3>{online ? 'No messages yet' : 'Nobody else is here yet'}</h3>
      <p>{online ? 'Messages are end-to-end encrypted and only kept in the memory of open tabs.' : 'Invite someone with a three-word code. Anything you send now reaches people who join while you’re here.'}</p>
      {!online && <button className="btn sm primary" onClick={() => setState({ sheet: 'invite' })}>Invite people</button>}
    </div>
  );
}

function Message({ m, author, mine, first, last, menuOpen, setMenu, onReply, onOpenImage, seers, replyTo, members }) {
  const press = useRef(null);
  const reactions = Object.entries(m.r || {}).filter(([, l]) => l.length);
  const me = getState().me;
  const startPress = () => { press.current = setTimeout(() => setMenu(true), 420); };
  const endPress = () => clearTimeout(press.current);

  const bubble = m.deleted ? (
    <div className="bubble deleted">Message deleted</div>
  ) : m.kind === 'image' ? (
    <ImageBubble m={m} onOpen={onOpenImage} />
  ) : m.kind === 'voice' ? (
    <div className="bubble voice-bubble"><VoicePlayer url={m.url} dur={m.dur} wave={m.wave} tx={m.tx} mine={mine} /></div>
  ) : m.kind === 'file' ? (
    <FileBubble m={m} />
  ) : (
    <div className={`bubble ${isEmojiOnly(m.text) ? 'jumbo' : ''}`}><Linkified text={m.text} /></div>
  );

  return (
    <div id={`m-${m.id}`} className={`msg ${mine ? 'mine' : 'theirs'} ${first ? 'first' : ''} ${last ? 'last' : ''} ${menuOpen ? 'menu-open' : ''}`}>
      {!mine && <div className="msg-av">{last && <Avatar member={author} size={30} />}</div>}
      <div className="msg-body">
        {first && !mine && <div className="msg-name">{author.name || 'Someone'}</div>}
        {replyTo && (
          <button className="quote" onClick={() => document.getElementById(`m-${replyTo.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <b>{members[replyTo.mid]?.name || replyTo.name}</b>
            <span>{replyTo.deleted ? 'Message deleted' : replyTo.kind === 'image' ? 'Photo' : replyTo.kind === 'voice' ? 'Voice message' : replyTo.kind === 'file' ? replyTo.fname || 'File' : replyTo.text.slice(0, 120)}</span>
          </button>
        )}
        <div className="bubble-wrap" onTouchStart={startPress} onTouchEnd={endPress} onTouchMove={endPress} onDoubleClick={() => !m.deleted && react(m.id, '❤️')}>
          {bubble}
          {!m.deleted && (
            <div className="msg-tools">
              <button onClick={(e) => { e.stopPropagation(); setMenu(!menuOpen); }} aria-label="React"><Icon name="smile" size={17} /></button>
              <button onClick={() => onReply(m)} aria-label="Reply"><Icon name="reply" size={17} /></button>
              {m.kind === 'text' && <button onClick={() => { navigator.clipboard.writeText(m.text); toast('Copied', 'ok', 1500); }} aria-label="Copy"><Icon name="copy" size={17} /></button>}
              {mine && <button onClick={() => deleteMessage(m.id)} aria-label="Delete for everyone"><Icon name="trash" size={17} /></button>}
            </div>
          )}
          {menuOpen && (
            <div className="react-pop" onClick={(e) => e.stopPropagation()}>
              {QUICK.map((e) => <button key={e} className={(m.r?.[e] || []).includes(me.mid) ? 'mine' : ''} onClick={() => { react(m.id, e); setMenu(false); }}>{e}</button>)}
              <button className="pop-reply" onClick={() => { onReply(m); setMenu(false); }} aria-label="Reply"><Icon name="reply" size={16} /></button>
              {m.kind === 'text' && <button className="pop-reply" onClick={() => { navigator.clipboard.writeText(m.text); toast('Copied', 'ok', 1500); setMenu(false); }} aria-label="Copy"><Icon name="copy" size={16} /></button>}
              {mine && <button className="pop-reply pop-del" onClick={() => { deleteMessage(m.id); setMenu(false); }} aria-label="Delete for everyone"><Icon name="trash" size={16} /></button>}
            </div>
          )}
        </div>
        {reactions.length > 0 && (
          <div className="reactions">
            {reactions.map(([e, l]) => (
              <button key={e} className={l.includes(me.mid) ? 'mine' : ''} onClick={() => react(m.id, e)} title={l.map((x) => members[x]?.name || 'Someone').join(', ')}>
                {e}{l.length > 1 && <b>{l.length}</b>}
              </button>
            ))}
          </div>
        )}
        {last && (
          <div className="msg-meta">
            <span>{timeOf(m.ts)}</span>
            {m.ttl > 0 && <Expiry m={m} />}
            {mine && !m.deleted && <Status m={m} seen={seers?.length > 0} />}
            {seers?.length > 0 && <span className="seers">{seers.slice(0, 5).map((s) => <Avatar key={s.mid} member={s} size={14} />)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function Status({ m, seen }) {
  if (m.status === 'sending') return <span className="status" title="Sending"><Icon name="clock" size={13} />{m.progress > 0 && m.progress < 1 ? ` ${Math.round(m.progress * 100)}%` : ''}</span>;
  if (m.status === 'local') return <span className="status" title="Nobody else is here yet"><Icon name="check" size={13} /></span>;
  return <span className={`status ${seen ? 'seen' : ''}`} title={seen ? 'Seen' : 'Delivered'}><Icon name={seen ? 'checks' : 'check'} size={14} /></span>;
}

// Image bubble sizing, in CSS pixels:
// - big photos fit inside MAX_W x MAX_H, keeping their shape
// - small images are enlarged at most MAX_UP times their real size, so they never look smeared
// - the bubble itself is never smaller than MIN_W x MIN_H; if the image can't fill it (tiny, or a
//   very wide/tall shape), it sits centred on a blurred copy of itself instead of being stretched
const MAX_W = 380, MAX_H = 440, MIN_W = 200, MIN_H = 140, MAX_UP = 1.5;
export function imageLayout(w, h) {
  if (!w || !h) return { fw: 280, fh: 210, iw: 280, ih: 210 };
  const scale = Math.min(MAX_W / w, MAX_H / h, MAX_UP);
  const iw = Math.round(w * scale), ih = Math.round(h * scale);
  const fw = Math.min(MAX_W, Math.max(MIN_W, iw)), fh = Math.min(MAX_H, Math.max(MIN_H, ih));
  return { fw, fh, iw: Math.min(iw, fw), ih: Math.min(ih, fh) };
}

function ImageBubble({ m, onOpen }) {
  const [revealed, setRevealed] = useState(!m.blur);
  const [dims, setDims] = useState(m.w && m.hgt ? [m.w, m.hgt] : null);
  const { fw, fh, iw, ih } = imageLayout(dims?.[0], dims?.[1]);
  const boxed = iw < fw - 1 || ih < fh - 1;
  const open = () => (revealed ? onOpen(m) : setRevealed(true));
  return (
    <div className={`bubble image-bubble ${m.text ? 'has-caption' : ''}`} style={{ width: fw }}>
      <div className={`img-frame ${revealed ? '' : 'blurred'} ${boxed ? 'boxed' : ''}`} style={{ aspectRatio: `${fw} / ${fh}` }}>
        {m.url && boxed && <img className="img-fill" src={m.url} alt="" aria-hidden="true" draggable="false" />}
        {m.url && (
          <img
            className="img-main" src={m.url} alt="" draggable="false" onClick={open}
            style={{ width: `${(iw / fw) * 100}%`, height: `${(ih / fh) * 100}%` }}
            onLoad={(e) => !dims && setDims([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])}
          />
        )}
        {!revealed && (
          <button className="reveal" onClick={() => setRevealed(true)}>
            <span>Tap to view</span>
          </button>
        )}
        {revealed && m.blur && <button className="rehide" onClick={() => setRevealed(false)} aria-label="Blur again"><Icon name="eyeOff" size={15} /></button>}
        {m.status === 'sending' && m.progress < 1 && (
          <div className="img-progress"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><circle cx="18" cy="18" r="15" className="p" style={{ strokeDashoffset: 94.2 * (1 - (m.progress || 0)) }} /></svg></div>
        )}
        {m.size && <span className="img-size">{dims ? `${dims[0]}×${dims[1]} · ` : ''}{fmtSize(m.size)}</span>}
      </div>
      {m.text && <div className="caption"><Linkified text={m.text} /></div>}
    </div>
  );
}

// time left on a disappearing message
function Expiry({ m }) {
  const now = useNow(1000);
  const left = Math.max(0, m.ts + m.ttl * 1000 - now) / 1000;
  const label = left >= 86400 ? `${Math.ceil(left / 86400)}d` : left >= 3600 ? `${Math.ceil(left / 3600)}h` : left >= 60 ? `${Math.ceil(left / 60)}m` : `${Math.ceil(left)}s`;
  return <span className="expiry" title="Disappears automatically"><Icon name="timer" size={11} />{label}</span>;
}

const extOf = (name = '') => (name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE');
const PLAYABLE = /^video\/(mp4|webm|quicktime|ogg)$/;

function FileBubble({ m }) {
  const playable = PLAYABLE.test(m.mime || '') && m.url;
  return (
    <div className={`bubble file-bubble ${playable ? 'has-video' : ''}`}>
      {playable && <video className="file-video" src={m.url} controls playsInline preload="metadata" />}
      <div className="file-card">
        <span className="file-ext">{extOf(m.fname)}</span>
        <span className="file-name"><b title={m.fname}>{m.fname || 'File'}</b><small>{fmtSize(m.size || 0)}</small></span>
        {m.url && <a className="file-dl" href={m.url} download={m.fname || 'file'} aria-label={`Download ${m.fname || 'file'}`} title="Download"><Icon name="download" size={16} /></a>}
      </div>
      {m.text && <div className="caption"><Linkified text={m.text} /></div>}
    </div>
  );
}

const isEmojiOnly = (t) => t && t.length <= 12 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && !/^[\d#*\s]+$/.test(t);

function Linkified({ text }) {
  const parts = String(text).split(/(https?:\/\/[^\s<]+[^\s<.,:;"')\]!?])/g);
  return parts.map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow">{p}</a> : <Fragment key={i}>{p}</Fragment>));
}
