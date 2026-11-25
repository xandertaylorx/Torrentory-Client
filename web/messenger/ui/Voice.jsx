import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { fmtTime } from '../lib/media.js';

// one voice note plays at a time across the whole app
let current = null;

export function VoicePlayer({ url, dur = 0, wave = [], mine, tx, compact }) {
  const audio = useRef(null);
  const bars = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [rate, setRate] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const peaks = wave?.length ? wave : Array.from({ length: 48 }, (_, i) => 0.25 + 0.2 * Math.sin(i * 0.9));
  const total = dur || audio.current?.duration || 0;
  const frac = total ? Math.min(1, t / total) : 0;

  useEffect(() => {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    audio.current = a;
    let raf;
    const tick = () => { setT(a.currentTime); raf = requestAnimationFrame(tick); };
    a.onplay = () => { setPlaying(true); raf = requestAnimationFrame(tick); };
    a.onpause = () => { setPlaying(false); cancelAnimationFrame(raf); setT(a.currentTime); };
    a.onended = () => { setPlaying(false); cancelAnimationFrame(raf); setT(0); a.currentTime = 0; };
    return () => { cancelAnimationFrame(raf); a.pause(); a.src = ''; if (current === a) current = null; };
  }, [url]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      if (current && current !== a) current.pause();
      current = a;
      a.playbackRate = rate;
      a.play().catch(() => {});
    } else a.pause();
  };

  const seekAt = (clientX) => {
    const r = bars.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const a = audio.current;
    if (!a || !total) return;
    a.currentTime = f * total;
    setT(f * total);
  };
  const onDown = (e) => {
    e.preventDefault();
    seekAt(e.clientX);
    const move = (ev) => seekAt(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const cycleRate = () => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };


  return (
    <div className={`voice ${mine ? 'mine' : ''} ${playing ? 'playing' : ''} ${compact ? 'compact' : ''}`}>
      <div className="voice-row">
        <button className="vp-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          <span className="vp-icon"><Icon name={playing ? 'pause' : 'play'} size={18} /></span>
        </button>
        <div className="vp-bars" ref={bars} onPointerDown={onDown} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(t)}>
          {peaks.map((p, i) => {
            const pos = (i + 0.5) / peaks.length;
            return <i key={i} className={pos <= frac ? 'on' : ''} style={{ height: `${Math.max(12, p * 100)}%`, animationDelay: `${(i % 7) * 90}ms` }} />;
          })}
          <span className="vp-knob" style={{ left: `${frac * 100}%` }} />
        </div>
      </div>
      <div className="voice-meta">
        <span className="vp-time">{fmtTime(playing || t ? t : total)}</span>
        <button className="vp-rate" onClick={cycleRate} aria-label="Playback speed">{rate}×</button>
      </div>
      {tx && !compact && (
        <p className={`voice-tx ${expanded ? 'open' : ''}`} onClick={() => setExpanded(!expanded)} title={expanded ? 'Collapse' : 'Expand'}>{tx}</p>
      )}
    </div>
  );
}

// live bars while recording
export function LiveWave({ levels }) {
  return (
    <div className="live-wave">
      {levels.map((l, i) => <i key={i} style={{ height: `${Math.max(8, l * 100)}%` }} />)}
    </div>
  );
}
