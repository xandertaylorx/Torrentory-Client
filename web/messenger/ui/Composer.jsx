import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { sendMessage, typing, setTtl, TTL_OPTIONS } from '../lib/session.js';
import { toast, useChat } from '../lib/store.js';
import { VoiceRecorder, decodeAudio, waveform, prepareImage, fmtTime, fmtSize, startTranscriber } from '../lib/media.js';
import { LiveWave, VoicePlayer } from './Voice.jsx';
import { Sheet } from './common.jsx';

export function Composer({ reply, clearReply, pendingFiles, clearFiles }) {
  const [text, setText] = useState('');
  const [rec, setRec] = useState(null); // { state: 'rec'|'review', t, levels, url, bin, dur, wave, mime }
  const [images, setImages] = useState(null);
  const [files, setFiles] = useState(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const ttl = useChat((c) => c.ttl || 0);
  const recorder = useRef(null);
  const scribe = useRef(null);
  const [live, setLive] = useState('');
  const input = useRef(null);
  const fileRef = useRef(null);
  const members = useChat((c) => c.members);
  const chatName = useChat((c) => c.name);

  useEffect(() => { if (reply) input.current?.focus(); }, [reply]);
  // photos go through the photo sheet (resize, strip metadata, optional blur); everything else is sent as a file
  const take = (list) => {
    const imgs = list.filter((f) => /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(f.type));
    const rest = list.filter((f) => !imgs.includes(f));
    const ok = rest.filter((f) => f.size <= MAX_FILE);
    if (ok.length < rest.length) toast(`Files can be up to ${fmtSize(MAX_FILE)} each`, 'warn');
    if (imgs.length) setImages(imgs);
    if (ok.length) setFiles(ok);
  };
  useEffect(() => { if (pendingFiles?.length) { take(pendingFiles); clearFiles(); } }, [pendingFiles, clearFiles]);

  // auto-grow textarea
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(160, el.scrollHeight) + 'px';
    el.style.overflowY = el.scrollHeight > 160 ? 'auto' : 'hidden'; // no stray scrollbar until it's needed
  }, [text]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    sendMessage({ kind: 'text', text: t, reply: reply?.id });
    setText('');
    clearReply();
  };

  const startRec = async () => {
    const r = new VoiceRecorder();
    recorder.current = r;
    const levels = Array(90).fill(0.04);
    let last = 0;
    try {
      await r.start((lvl, t) => {
        const now = performance.now();
        if (now - last < 70) return;
        last = now;
        levels.push(lvl); levels.shift();
        setRec({ state: 'rec', t, levels: [...levels] });
        if (t > 600) finishRec(true);
      });
      setRec({ state: 'rec', t: 0, levels: [...levels] });
      setLive('');
      startTranscriber(setLive).then((t) => { if (recorder.current === r) scribe.current = t; else t?.cancel(); });
    } catch {
      toast('Microphone access is needed for voice messages', 'warn');
      recorder.current = null;
    }
  };

  const finishRec = async (sendNow) => {
    const r = recorder.current;
    if (!r) return;
    recorder.current = null;
    const txP = scribe.current ? scribe.current.stop() : Promise.resolve('');
    scribe.current = null;
    const { blob, mime } = await r.stop();
    const tx = await txP;
    setLive('');
    const bin = new Uint8Array(await blob.arrayBuffer());
    let dur = 0, wave = [];
    try { const buf = await decodeAudio(bin); dur = buf.duration; wave = waveform(buf, 48); } catch {}
    if (dur < 0.4) { setRec(null); toast('Hold on a little longer to record', 'info', 2000); return; }
    const payload = { kind: 'voice', bin, mime, dur: Math.round(dur * 10) / 10, wave, reply: reply?.id, tx };
    if (sendNow) { sendMessage(payload); setRec(null); clearReply(); }
    else setRec({ state: 'review', ...payload, url: URL.createObjectURL(blob) });
  };

  const cancelRec = () => {
    recorder.current?.cancel();
    recorder.current = null;
    scribe.current?.cancel();
    scribe.current = null;
    setLive('');
    if (rec?.url) URL.revokeObjectURL(rec.url);
    setRec(null);
  };

  const sendReview = () => {
    const { url, state, ...payload } = rec;
    sendMessage(payload);
    URL.revokeObjectURL(url);
    setRec(null);
    clearReply();
  };

  const onPaste = (e) => {
    const pasted = [...e.clipboardData.files];
    if (pasted.length) { e.preventDefault(); take(pasted); }
  };

  const replyName = reply && (members[reply.mid]?.name || reply.name);

  return (
    <div className="composer-wrap">
      {reply && (
        <div className="reply-bar">
          <Icon name="reply" size={16} />
          <div><b>Replying to {replyName}</b><span>{reply.kind === 'image' ? 'Photo' : reply.kind === 'voice' ? 'Voice message' : reply.kind === 'file' ? reply.fname || 'File' : reply.text}</span></div>
          <button className="icon-btn sm" onClick={clearReply} aria-label="Cancel reply"><Icon name="x" size={16} /></button>
        </div>
      )}
      {rec?.state === 'rec' && live && <div className="live-tx">{live}</div>}
      <div className={`composer ${rec ? 'recording' : ''}`}>
        {!rec && (
          <>
            <button className="icon-btn" onClick={() => fileRef.current.click()} aria-label="Send a photo or file" title="Photo or file"><Icon name="attach" /></button>
            <div className="timer-wrap">
              <button className={`icon-btn timer-btn ${ttl ? 'on' : ''}`} onClick={() => setTimerOpen(!timerOpen)} aria-label="Disappearing messages" title="Disappearing messages">
                <Icon name="timer" />{ttl > 0 && <span className="timer-tag">{shortTtl(ttl)}</span>}
              </button>
              {timerOpen && <TimerMenu value={ttl} close={() => setTimerOpen(false)} />}
            </div>
            <textarea
              ref={input} rows={1} value={text} placeholder={`Message ${chatName}`} maxLength={8000}
              onChange={(e) => { setText(e.target.value); if (e.target.value) typing(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              onPaste={onPaste}
            />
            {text.trim() ? (
              <button className="send-btn" onClick={send} aria-label="Send"><Icon name="send" /></button>
            ) : (
              <button className="send-btn mic" onClick={startRec} aria-label="Record voice message"><Icon name="mic" /></button>
            )}
          </>
        )}
        {rec?.state === 'rec' && (
          <>
            <button className="icon-btn danger" onClick={cancelRec} aria-label="Discard"><Icon name="trash" /></button>
            <div className="rec-live">
              <span className="rec-dot" />
              <span className="rec-time">{fmtTime(rec.t)}</span>
              <LiveWave levels={rec.levels} />
            </div>
            <button className="icon-btn" onClick={() => finishRec(false)} aria-label="Stop and review"><Icon name="stop" /></button>
            <button className="send-btn" onClick={() => finishRec(true)} aria-label="Send voice message"><Icon name="send" /></button>
          </>
        )}
        {rec?.state === 'review' && (
          <>
            <button className="icon-btn danger" onClick={cancelRec} aria-label="Discard"><Icon name="trash" /></button>
            <div className="rec-review"><VoicePlayer url={rec.url} dur={rec.dur} wave={rec.wave} tx={rec.tx} mine compact /></div>
            <button className="send-btn" onClick={sendReview} aria-label="Send voice message"><Icon name="send" /></button>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) take(f); }} />
      {ttl > 0 && !rec && <div className="ttl-note"><Icon name="timer" size={12} /> New messages disappear after {TTL_OPTIONS.find(([v]) => v === ttl)?.[1]}</div>}
      {images && <ImageSend files={images} onClose={() => setImages(null)} reply={reply} clearReply={clearReply} />}
      {files && <FileSend files={files} onClose={() => setFiles(null)} reply={reply} clearReply={clearReply} />}
    </div>
  );
}

function ImageSend({ files, onClose, reply, clearReply }) {
  const [items, setItems] = useState([]);
  const [caption, setCaption] = useState('');
  const [blur, setBlur] = useState(false);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let dead = false;
    const urls = [];
    Promise.all(files.slice(0, 10).map(async (f) => {
      try {
        const p = await prepareImage(f);
        const url = URL.createObjectURL(new Blob([p.bin], { type: p.mime }));
        urls.push(url);
        return { ...p, url };
      } catch { return null; }
    })).then((list) => { if (!dead) { setItems(list.filter(Boolean)); setBusy(false); } });
    return () => { dead = true; urls.forEach(URL.revokeObjectURL); };
  }, [files]);

  const send = () => {
    items.forEach((it, i) => sendMessage({ kind: 'image', bin: it.bin, mime: it.mime, w: it.w, hgt: it.hgt, blur, text: i === items.length - 1 ? caption.trim() : '', reply: i === 0 ? reply?.id : undefined }));
    clearReply();
    onClose();
  };

  return (
    <Sheet title={items.length > 1 ? `Send ${items.length} photos` : 'Send photo'} onClose={onClose}>
      <div className={`img-send-grid n${Math.min(items.length, 4)}`}>
        {busy && <div className="img-send-busy">Preparing…</div>}
        {items.map((it, i) => (
          <div key={i} className={`img-send-item ${blur ? 'blurred' : ''}`}>
            <img src={it.url} alt="" />
            {blur && <span className="blur-badge">Blurred</span>}
          </div>
        ))}
      </div>
      <label className={`toggle-row ${blur ? 'on' : ''}`}>
        <span className="toggle-text"><b>Send blurred</b><small>People tap to reveal it. Good for spoilers or anything sensitive.</small></span>
        <input type="checkbox" checked={blur} onChange={(e) => setBlur(e.target.checked)} />
        <span className="switch" />
      </label>
      <p className="hint small">Location and camera data are removed before sending.</p>
      <div className="row">
        <input type="text" value={caption} placeholder="Add a caption" maxLength={2000} onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && send()} autoFocus />
        <button className="btn primary" disabled={busy || !items.length} onClick={send}>Send</button>
      </div>
    </Sheet>
  );
}

const MAX_FILE = 50 * 1024 * 1024;
export const shortTtl = (v) => (v >= 604800 ? '1w' : v >= 86400 ? '1d' : v >= 3600 ? '1h' : `${Math.round(v / 60)}m`);

function TimerMenu({ value, close }) {
  const ref = useRef(null);
  useEffect(() => {
    const off = (e) => { if (!ref.current?.contains(e.target)) close(); };
    const esc = (e) => e.key === 'Escape' && close();
    setTimeout(() => document.addEventListener('pointerdown', off), 0);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', off); document.removeEventListener('keydown', esc); };
  }, [close]);
  return (
    <div className="timer-menu" ref={ref} role="menu">
      <b>Disappearing messages</b>
      <small>Applies to everyone in this chat. Everyone is told when it changes.</small>
      {TTL_OPTIONS.map(([v, label]) => (
        <button key={v} role="menuitemradio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => { setTtl(v); close(); }}>
          {label}{value === v && <Icon name="check" size={14} />}
        </button>
      ))}
    </div>
  );
}

const extOf = (name) => (name.includes('.') ? name.split('.').pop().slice(0, 4).toUpperCase() : 'FILE');

function FileSend({ files, onClose, reply, clearReply }) {
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const total = files.reduce((n, f) => n + f.size, 0);
  const send = async () => {
    setBusy(true);
    for (const [i, f] of files.entries()) {
      const bin = new Uint8Array(await f.arrayBuffer());
      sendMessage({ kind: 'file', bin, mime: f.type || 'application/octet-stream', fname: f.name.slice(0, 200), text: i === files.length - 1 ? caption.trim() : '', reply: i === 0 ? reply?.id : undefined });
    }
    clearReply();
    onClose();
  };
  return (
    <Sheet title={files.length > 1 ? `Send ${files.length} files` : 'Send file'} onClose={onClose}>
      <ul className="file-send">
        {files.map((f, i) => (
          <li key={i}><span className="file-ext">{extOf(f.name)}</span><span className="file-name"><b>{f.name}</b><small>{fmtSize(f.size)}{f.type ? ` · ${f.type}` : ''}</small></span></li>
        ))}
      </ul>
      <p className="hint small">Sent directly and end-to-end encrypted{files.length > 1 ? ` · ${fmtSize(total)} total` : ''}. Files stay in the chat only as long as someone has it open.</p>
      <div className="row">
        <input type="text" value={caption} placeholder="Add a message" maxLength={2000} onChange={(e) => setCaption(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !busy && send()} autoFocus />
        <button className="btn primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
    </Sheet>
  );
}
