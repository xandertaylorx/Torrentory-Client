import {
  Captions, Film, Maximize2, Music2, Pause, Play, RotateCcw, RotateCw,
  Volume2, VolumeX, X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { mediaStreamUrl } from "../../lib/api";
import { extension, mediaKind, srtToVtt, subtitleLabel, type MediaKind } from "../../lib/media";
import type { TorrentFile, TorrentStatus } from "../../lib/types";
import { dragWindow } from "../../lib/window";

interface SubtitleChoice { file: TorrentFile; fileId: number }

export function MediaPlayer({ torrentId, torrentName, file, fileId, subtitles, torrentState, onResume, onClose }: {
  torrentId: number;
  torrentName?: string | null;
  file: TorrentFile;
  fileId: number;
  subtitles: SubtitleChoice[];
  torrentState: TorrentStatus;
  onResume: () => void;
  onClose: () => void;
}) {
  const kind = mediaKind(file.name) as MediaKind;
  const mediaRef = useRef<HTMLMediaElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef(0);
  const [url, setUrl] = useState("");
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ url: string; label: string }>>([]);
  const [caption, setCaption] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState("");
  const subtitleIds = subtitles.map(({ fileId: subtitleId }) => subtitleId).join(",");

  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");
    void mediaStreamUrl(torrentId, fileId)
      .then((value) => active && setUrl(value))
      .catch((reason) => active && setError(String(reason)));
    return () => { active = false; };
  }, [torrentId, fileId]);

  useEffect(() => {
    if (kind !== "video") return;
    let active = true;
    const objectUrls: string[] = [];
    void Promise.all(subtitles.map(async ({ file: subtitle, fileId: subtitleId }) => {
      const streamUrl = await mediaStreamUrl(torrentId, subtitleId);
      const response = await fetch(streamUrl);
      if (!response.ok) throw new Error(`Could not load ${subtitle.name}`);
      let text = await response.text();
      if (extension(subtitle.name) === "srt") text = srtToVtt(text);
      const objectUrl = URL.createObjectURL(new Blob([text], { type: "text/vtt" }));
      objectUrls.push(objectUrl);
      return { url: objectUrl, label: subtitleLabel(subtitle.name) };
    })).then((tracks) => { if (active) setSubtitleTracks(tracks); }).catch(() => undefined);
    return () => {
      active = false;
      objectUrls.forEach(URL.revokeObjectURL);
      setSubtitleTracks([]);
    };
  }, [kind, subtitleIds, torrentId]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    Array.from(media.textTracks).forEach((track, index) => { track.mode = index === caption ? "showing" : "disabled"; });
  }, [caption, subtitleTracks]);

  const ensureAnalyser = useCallback(() => {
    if (kind !== "audio" || !mediaRef.current || sourceNodeRef.current) return;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      const source = context.createMediaElementSource(mediaRef.current);
      source.connect(analyser);
      analyser.connect(context.destination);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      sourceNodeRef.current = source;
    } catch {
      analyserRef.current = null;
    }
  }, [kind]);

  const togglePlayback = useCallback(async () => {
    const media = mediaRef.current;
    if (!media) return;
    if (media.paused) {
      if (torrentState === "paused") onResume();
      ensureAnalyser();
      if (audioContextRef.current?.state === "suspended") await audioContextRef.current.resume();
      try { await media.play(); } catch (reason) { setError(String(reason)); }
    } else {
      media.pause();
    }
  }, [ensureAnalyser, onResume, torrentState]);

  const seekBy = useCallback((seconds: number) => {
    const media = mediaRef.current;
    if (media) media.currentTime = Math.max(0, Math.min(media.duration || 0, media.currentTime + seconds));
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) void stageRef.current?.requestFullscreen();
    else void document.exitFullscreen();
  }, []);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) onClose();
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Space") { event.preventDefault(); void togglePlayback(); }
      if (event.key === "ArrowLeft") seekBy(-10);
      if (event.key === "ArrowRight") seekBy(10);
      if (event.key.toLowerCase() === "m") setMuted((value) => !value);
      if (event.key.toLowerCase() === "f" && kind === "video") toggleFullscreen();
    };
    addEventListener("keydown", keyboard);
    return () => removeEventListener("keydown", keyboard);
  }, [kind, onClose, seekBy, toggleFullscreen, togglePlayback]);

  useEffect(() => {
    if (kind !== "audio") return;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, width, height);
      const analyser = analyserRef.current;
      const data = new Uint8Array(analyser?.frequencyBinCount ?? 64);
      analyser?.getByteFrequencyData(data);
      const bars = 54;
      const gap = 3 * ratio;
      const barWidth = Math.max(2 * ratio, (width - gap * (bars - 1)) / bars);
      const signal = getComputedStyle(document.documentElement).getPropertyValue("--signal").trim() || "#10b981";
      context.fillStyle = signal;
      for (let index = 0; index < bars; index += 1) {
        const sample = data[Math.floor(index / bars * data.length)] ?? 0;
        const idle = (Math.sin(performance.now() / 620 + index * 0.42) + 1) * 0.045;
        const strength = analyser && playing ? sample / 255 : idle;
        const barHeight = Math.max(3 * ratio, strength * height * 0.88);
        context.globalAlpha = 0.28 + Math.min(0.72, strength * 1.35);
        context.fillRect(index * (barWidth + gap), (height - barHeight) / 2, barWidth, barHeight);
      }
      context.globalAlpha = 1;
      animationRef.current = requestAnimationFrame(draw);
    };
    animationRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationRef.current);
  }, [kind, playing]);

  useEffect(() => () => { void audioContextRef.current?.close(); }, []);

  const updateProgress = () => {
    const media = mediaRef.current;
    if (!media) return;
    setCurrent(media.currentTime || 0);
    setDuration(Number.isFinite(media.duration) ? media.duration : 0);
    if (media.buffered.length) setBuffered(media.buffered.end(media.buffered.length - 1));
  };
  const changeVolume = (value: number) => {
    setVolume(value);
    if (mediaRef.current) mediaRef.current.volume = value;
    if (value > 0) setMuted(false);
  };
  const changeRate = (value: number) => {
    setRate(value);
    if (mediaRef.current) mediaRef.current.playbackRate = value;
  };

  return <div className="media-backdrop" role="dialog" aria-modal="true" aria-label={`Playing ${file.name}`}>
    <section className={`media-player media-${kind}`} ref={stageRef}>
      <header className="media-head" onMouseDown={dragWindow}>
        <div className="media-kind">{kind === "audio" ? <Music2 size={14} /> : <Film size={14} />}<span>{kind}</span></div>
        <div className="media-title"><strong>{file.name}</strong><small>{torrentName}</small></div>
        <button className="icon-button" onClick={onClose} aria-label="Close player"><X size={18} /></button>
      </header>
      <div className="media-stage">
        {kind === "video" ?
          <video ref={mediaRef as RefObject<HTMLVideoElement>} src={url} crossOrigin="anonymous" muted={muted} playsInline preload="metadata" onDoubleClick={toggleFullscreen} onClick={() => void togglePlayback()} onTimeUpdate={updateProgress} onProgress={updateProgress} onLoadedMetadata={() => { updateProgress(); setWaiting(false); }} onPlay={() => { setPlaying(true); setWaiting(false); }} onPause={() => setPlaying(false)} onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)} onError={() => setError("This video format or codec is not supported by macOS.")}>
            {subtitleTracks.map((track, index) => <track key={track.url} kind="subtitles" src={track.url} srcLang={track.label.toLowerCase()} label={track.label} default={index === caption} />)}
          </video> :
          <div className="audio-visual">
            <div className="audio-orbit"><Music2 size={36} /></div>
            <canvas ref={canvasRef} aria-label="Live audio waveform" />
            <audio ref={mediaRef as RefObject<HTMLAudioElement>} src={url} crossOrigin="anonymous" muted={muted} preload="metadata" onTimeUpdate={updateProgress} onProgress={updateProgress} onLoadedMetadata={() => { updateProgress(); setWaiting(false); }} onPlay={() => { setPlaying(true); setWaiting(false); }} onPause={() => setPlaying(false)} onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)} onError={() => setError("This audio format or codec is not supported by macOS.")} />
          </div>}
        {waiting && !error && <div className="media-buffering"><i /><span>{url ? "Buffering pieces…" : "Preparing stream…"}</span></div>}
        {error && <div className="media-error"><strong>Playback unavailable</strong><span>{error}</span></div>}
      </div>
      <div className="media-timeline">
        <div className="media-buffered" style={{ width: `${duration ? buffered / duration * 100 : 0}%` }} />
        <div className="media-played" style={{ width: `${duration ? current / duration * 100 : 0}%` }} />
        <input type="range" min={0} max={duration || 0} step="0.01" value={Math.min(current, duration || 0)} aria-label="Playback position" onChange={(event) => { const value = Number(event.target.value); if (mediaRef.current) mediaRef.current.currentTime = value; setCurrent(value); }} />
      </div>
      <footer className="media-controls">
        <div className="media-control-group">
          <button className="media-control primary" onClick={() => void togglePlayback()} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
          <button className="media-control" onClick={() => seekBy(-10)} aria-label="Back 10 seconds"><RotateCcw size={16} /><small>10</small></button>
          <button className="media-control" onClick={() => seekBy(10)} aria-label="Forward 10 seconds"><RotateCw size={16} /><small>10</small></button>
          <span className="media-time">{clock(current)} <i>/</i> {clock(duration)}</span>
        </div>
        <div className="media-control-group right">
          {kind === "video" && subtitleTracks.length > 0 && <label className="media-select"><Captions size={16} /><select value={caption} onChange={(event) => setCaption(Number(event.target.value))} aria-label="Subtitles"><option value={-1}>Off</option>{subtitleTracks.map((track, index) => <option key={track.url} value={index}>{track.label}</option>)}</select></label>}
          <label className="media-select rate"><select value={rate} onChange={(event) => changeRate(Number(event.target.value))} aria-label="Playback speed">{[0.75, 1, 1.25, 1.5, 2].map((value) => <option value={value} key={value}>{value}×</option>)}</select></label>
          <button className="media-control" onClick={() => setMuted((value) => !value)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          <input className="media-volume" type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={(event) => changeVolume(Number(event.target.value))} aria-label="Volume" />
          {kind === "video" && <button className="media-control" onClick={toggleFullscreen} aria-label="Full screen"><Maximize2 size={16} /></button>}
        </div>
      </footer>
    </section>
  </div>;
}

function clock(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return hours ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
