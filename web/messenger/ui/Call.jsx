import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store.js';
import { leaveCall, toggleMic, toggleCam, toggleScreen, setMinimized, getLocalStreams, joinCall, declineCall, callStats } from '../lib/session.js';
import { Avatar, useNow } from './common.jsx';
import { Icon } from './icons.jsx';
import { fmtTime } from '../lib/media.js';

// speaking indicator: writes --lvl on the element directly so React doesn't re-render 60×/s
let actx = null;
function useLevel(stream, ref) {
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length || !ref.current) return;
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    actx.resume().catch(() => {});
    const src = actx.createMediaStreamSource(stream);
    const an = actx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf, smooth = 0;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let s = 0;
      for (const v of buf) s += v * v;
      const lvl = Math.min(1, Math.sqrt(s / buf.length) * 6);
      smooth = smooth * 0.75 + lvl * 0.25;
      ref.current?.style.setProperty('--lvl', smooth.toFixed(3));
      ref.current?.classList.toggle('speaking', smooth > 0.08);
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); src.disconnect(); };
  }, [stream, ref]);
}

function Video({ stream, mirror, muted = true }) {
  const v = useRef(null);
  useEffect(() => { if (v.current && v.current.srcObject !== stream) v.current.srcObject = stream; }, [stream]);
  return <video ref={v} autoPlay playsInline muted={muted} className={mirror ? 'mirror' : ''} />;
}

function RemoteAudio({ stream }) {
  const a = useRef(null);
  useEffect(() => { if (a.current) { a.current.srcObject = stream; a.current.play().catch(() => {}); } }, [stream]);
  return <audio ref={a} autoPlay />;
}

function Tile({ member, audio, video, mirror, mic, label, screen, self, size }) {
  const ref = useRef(null);
  useLevel(audio, ref);
  return (
    <div className={`tile ${video ? 'has-video' : ''} ${screen ? 'screen' : ''} ${self ? 'me' : ''}`} ref={ref} style={size}>
      {video ? <Video stream={video} mirror={mirror} /> : (
        <div className="tile-av"><Avatar member={member} size={88} /></div>
      )}
      <div className="tile-label">
        {!mic && <Icon name="micOff" size={14} />}
        <span>{label}</span>
      </div>
    </div>
  );
}

// live connection readout: resolution, frame rate and delay, from WebRTC stats
function Quality() {
  const [q, setQ] = useState(null);
  useEffect(() => {
    let alive = true;
    const tick = async () => { try { const r = await callStats(); if (alive) setQ(r); } catch {} };
    tick();
    const t = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!q || q.ms == null) return null;
  const res = q.height ? `${q.height >= 1060 ? '1080p' : q.height >= 700 ? '720p' : q.height >= 520 ? '540p' : q.height + 'p'} · ${q.fps} fps · ` : '';
  const label = q.quality === 'good' ? 'Excellent connection' : q.quality === 'ok' ? 'Fair connection' : 'Weak connection';
  return (
    <span className={`call-quality ${q.quality}`} title={`${label}${q.loss ? ` · ${(q.loss * 100).toFixed(1)}% loss` : ''}`}>
      <i /><i /><i />{res}{q.ms} ms
    </span>
  );
}

// Zoom/Meet-style gallery: measure the call area, try every column count, and keep the one that
// gives the biggest tiles at a fixed shape (16:9, or 4:3 on portrait screens). Rows are centred, so
// an uneven last row (3 + 2, or 2 + 2 + 1) sits neatly in the middle. Two people use the
// one-to-one layout instead (them full screen, you in a corner).
function Gallery({ count, duo, children }) {
  const ref = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const measure = () => { const r = ref.current?.getBoundingClientRect(); if (r) setBox({ w: r.width - 24, h: r.height - 24 }); };
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    addEventListener('orientationchange', measure);
    return () => { ro.disconnect(); removeEventListener('orientationchange', measure); };
  }, []);
  let size;
  if (!duo && box?.w) {
    // landscape screens keep video's own 16:9; tall phone screens may also use 4:3 or square tiles,
    // whichever makes the picture biggest
    const gap = 8, ratios = box.h > box.w ? [16 / 9, 4 / 3, 1] : [16 / 9];
    let best = { area: 0 };
    for (const ratio of ratios) {
      for (let cols = 1; cols <= count; cols++) {
        const rows = Math.ceil(count / cols);
        const w = Math.min((box.w - gap * (cols - 1)) / cols, ((box.h - gap * (rows - 1)) / rows) * ratio);
        if (w > 0 && w * (w / ratio) > best.area) best = { area: w * (w / ratio), w, ratio };
      }
    }
    size = { width: Math.floor(best.w), height: Math.floor(best.w / best.ratio) };
  }
  return (
    <div ref={ref} className={`tiles ${duo ? 'duo' : 'gallery'}`}>
      {children(size)}
    </div>
  );
}

export function CallOverlay() {
  const call = useStore((s) => s.call);
  const info = useStore((s) => (s.call ? s.chats[s.call.chat]?.callInfo : null));
  const members = useStore((s) => (s.call ? s.chats[s.call.chat]?.members : null)) || {};
  const me = useStore((s) => s.me);
  const room = useStore((s) => (s.call ? s.chats[s.call.chat] : null)) || { name: '' };
  const now = useNow(1000);
  if (!call) return null;
  const local = getLocalStreams();
  const others = Object.keys(info?.parts || {}).filter((x) => x !== me.mid);
  const audios = Object.values(call.remote).map((r) => r.audio).filter(Boolean);
  const dur = fmtTime((now - call.since) / 1000);

  if (call.minimized) {
    return (
      <div className="call-pill">
        {audios.map((s) => <RemoteAudio key={s.id} stream={s} />)}
        <span className="sig" />
        <button className="pill-main" onClick={() => setMinimized(false)}>
          <b>{others.length ? `In call · ${others.length + 1}` : 'Calling…'}</b><span>{dur}</span>
        </button>
        <button className={`round sm ${call.mic ? '' : 'off'}`} onClick={toggleMic} aria-label="Mute"><Icon name={call.mic ? 'mic' : 'micOff'} size={16} /></button>
        <button className="round sm end" onClick={leaveCall} aria-label="Leave call"><Icon name="phoneDown" size={16} /></button>
      </div>
    );
  }

  const tiles = [
    { key: 'me', member: members[me.mid] || me, audio: local.audio, video: local.screen || local.cam, mirror: !local.screen, mic: call.mic, label: 'You', screen: !!local.screen, self: true },
    ...others.map((mid) => {
      const r = call.remote[mid] || {};
      const p = info.parts[mid] || {};
      return { key: mid, member: members[mid], audio: r.audio, video: (p.screen && r.screen) || (p.cam && r.cam) || null, mic: p.mic !== false, label: members[mid]?.name || 'Someone', screen: !!(p.screen && r.screen) };
    }),
  ];

  return (
    <div className="call">
      {audios.map((s) => <RemoteAudio key={s.id} stream={s} />)}
      <header className="call-head">
        <div>
          <b>{room.name}</b>
          <span>{others.length ? dur : 'Ringing'} · Direct, encrypted</span>
        </div>
        <span className="spacer" />
        {others.length > 0 && <Quality />}
        <button className="round ghost" onClick={() => setMinimized(true)} aria-label="Minimize"><Icon name="minimize" size={18} /></button>
      </header>
      <Gallery count={tiles.length} duo={tiles.length === 2}>
        {(size) => (
          <>
            {tiles.map(({ key, ...t }) => <Tile key={key} {...t} size={size} />)}
            {others.length === 0 && <div className="waiting">Waiting for others to pick up…</div>}
          </>
        )}
      </Gallery>
      <footer className="call-controls">
        <button className={`round ${call.mic ? '' : 'off'}`} onClick={toggleMic} aria-label={call.mic ? 'Mute' : 'Unmute'}><Icon name={call.mic ? 'mic' : 'micOff'} /></button>
        <button className={`round ${call.cam ? '' : 'off'}`} onClick={toggleCam} aria-label="Camera"><Icon name={call.cam ? 'video' : 'videoOff'} /></button>
        {navigator.mediaDevices?.getDisplayMedia && <button className={`round ${call.screen ? 'active' : ''}`} onClick={toggleScreen} aria-label="Share screen"><Icon name="screen" /></button>}
        <button className="round end wide" onClick={leaveCall} aria-label="Leave call"><Icon name="phoneDown" /></button>
      </footer>
    </div>
  );
}

export function IncomingCall() {
  const ringing = useStore((s) => s.ringing);
  const chat = useStore((s) => (s.ringing ? s.chats[s.ringing.chat] : null));
  if (!ringing || !chat) return null;
  const from = chat.members[ringing.from];
  return (
    <div className="incoming">
      <div className="incoming-card">
        <Avatar member={from} size={64} />
        <b>{from?.name || 'Someone'}</b>
        <span className="hint">{ringing.video ? 'Video' : 'Voice'} call · {chat.name}</span>
        <div className="incoming-actions">
          <button className="round end" onClick={declineCall} aria-label="Decline"><Icon name="phoneDown" /></button>
          {ringing.video && <button className="round accept" onClick={() => joinCall(false)} aria-label="Answer with audio only"><Icon name="phone" /></button>}
          <button className="round accept" onClick={() => joinCall(ringing.video)} aria-label="Answer"><Icon name={ringing.video ? 'video' : 'phone'} /></button>
        </div>
      </div>
    </div>
  );
}
