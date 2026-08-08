import {
  Captions, Film, ListVideo, Maximize2, Minimize2, Music2, Pause, Play, RotateCcw, RotateCw,
  Volume2, VolumeX, X,
} from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { mediaStreamUrl } from "../../lib/api";
import { bytes } from "../../lib/format";
import { extension, mediaKind, srtToVtt, subtitleLabel, type MediaKind } from "../../lib/media";
import type { TorrentFile, TorrentStatus } from "../../lib/types";
import { dragWindow } from "../../lib/window";

interface MediaChoice { file: TorrentFile; fileId: number }
interface SubtitleChoice extends MediaChoice {}

export function MediaPlayer({ torrentId, torrentName, file, fileId, playlist, subtitles, torrentState, onSelect, onResume, onClose }: {
  torrentId: number;
  torrentName?: string | null;
  file: TorrentFile;
  fileId: number;
  playlist: MediaChoice[];
  subtitles: SubtitleChoice[];
  torrentState: TorrentStatus;
  onSelect: (file: TorrentFile, fileId: number) => void;
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
  const [fullscreen, setFullscreen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const currentPlaylistIndex = playlist.findIndex(({ fileId: choiceId }) => choiceId === fileId);
  const subtitleIds = subtitles.map(({ fileId: subtitleId }) => subtitleId).join(",");

  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");
    setWaiting(true);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
    setCaption(-1);
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

  const toggleFullscreen = useCallback(async () => {
    try {
      if ("__TAURI_INTERNALS__" in window) {
        const appWindow = getCurrentWindow();
        const next = !(await appWindow.isFullscreen());
        await appWindow.setFullscreen(next);
        setFullscreen(next);
      } else if (!document.fullscreenElement) {
        await stageRef.current?.requestFullscreen();
        setFullscreen(true);
      } else {
        await document.exitFullscreen();
        setFullscreen(false);
      }
    } catch (reason) {
      setError(`Could not change full screen mode: ${String(reason)}`);
    }
  }, []);

  const closePlayer = useCallback(async () => {
    if (fullscreen && "__TAURI_INTERNALS__" in window) {
      await getCurrentWindow().setFullscreen(false).catch(() => undefined);
    } else if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  }, [fullscreen, onClose]);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) {
      const syncBrowserFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
      document.addEventListener("fullscreenchange", syncBrowserFullscreen);
      return () => document.removeEventListener("fullscreenchange", syncBrowserFullscreen);
    }
    const appWindow = getCurrentWindow();
    let active = true;
    void appWindow.isFullscreen().then((value) => active && setFullscreen(value));
    const unlisten = appWindow.onResized(() => {
      void appWindow.isFullscreen().then((value) => active && setFullscreen(value));
    });
    return () => { active = false; void unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (fullscreen) { event.preventDefault(); void toggleFullscreen(); }
        else onClose();
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      if (event.code === "Space") { event.preventDefault(); void togglePlayback(); }
      if (event.key === "ArrowLeft") seekBy(-10);
      if (event.key === "ArrowRight") seekBy(10);
      if (event.key.toLowerCase() === "m") setMuted((value) => !value);
      if (event.key.toLowerCase() === "f" && kind === "video") toggleFullscreen();
    };
    addEventListener("keydown", keyboard);
    return () => removeEventListener("keydown", keyboard);
  }, [fullscreen, kind, onClose, seekBy, toggleFullscreen, togglePlayback]);

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
      const signal = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#111111";
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
    <section className={`media-player media-${kind} ${fullscreen ? "is-fullscreen" : ""}`} ref={stageRef}>
      <header className="media-head" data-tauri-drag-region onMouseDown={dragWindow}>
        <div className="media-kind" data-tauri-drag-region>{kind === "audio" ? <Music2 size={14} /> : <Film size={14} />}<span data-tauri-drag-region>{kind}</span></div>
        <div className="media-title" data-tauri-drag-region><strong data-tauri-drag-region>{file.name}</strong><small data-tauri-drag-region>{torrentName}</small></div>
        <div className="media-head-actions" data-no-drag>
          {playlist.length > 1 && <button className={`media-queue-trigger ${playlistOpen ? "active" : ""}`} onClick={() => setPlaylistOpen((value) => !value)} aria-label="Show media queue" aria-expanded={playlistOpen}><ListVideo size={15} /><span>{currentPlaylistIndex + 1} of {playlist.length}</span></button>}
          <button className="icon-button" onClick={() => void closePlayer()} aria-label="Close player"><X size={18} /></button>
        </div>
      </header>
      <div className="media-stage">
        {kind === "video" ?
          <video ref={mediaRef as RefObject<HTMLVideoElement>} src={url} crossOrigin="anonymous" muted={muted} playsInline autoPlay preload="metadata" onDoubleClick={() => void toggleFullscreen()} onClick={() => void togglePlayback()} onTimeUpdate={updateProgress} onProgress={updateProgress} onLoadedMetadata={() => { updateProgress(); setWaiting(false); }} onPlay={() => { setPlaying(true); setWaiting(false); }} onPause={() => setPlaying(false)} onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)} onError={() => setError("This video format or codec is not supported by macOS.")}>
            {subtitleTracks.map((track, index) => <track key={track.url} kind="subtitles" src={track.url} srcLang={track.label.toLowerCase()} label={track.label} default={index === caption} />)}
          </video> :
          <div className="audio-visual">
            <div className="audio-orbit"><Music2 size={36} /></div>
            <canvas ref={canvasRef} aria-label="Live audio waveform" />
            <audio ref={mediaRef as RefObject<HTMLAudioElement>} src={url} crossOrigin="anonymous" muted={muted} autoPlay preload="metadata" onTimeUpdate={updateProgress} onProgress={updateProgress} onLoadedMetadata={() => { updateProgress(); setWaiting(false); }} onPlay={() => { ensureAnalyser(); setPlaying(true); setWaiting(false); }} onPause={() => setPlaying(false)} onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)} onError={() => setError("This audio format or codec is not supported by macOS.")} />
          </div>}
        {!playing && !waiting && !error && <button className="media-stage-play" onClick={() => void togglePlayback()} aria-label="Play"><Play size={24} fill="currentColor" /></button>}
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
          {kind === "video" && <button className="media-control" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
        </div>
      </footer>
      {playlist.length > 1 && playlistOpen && <aside className="media-queue" aria-label="Media in this torrent">
        <header><div><strong>Media queue</strong><span>{playlist.length} playable files</span></div><button className="icon-button" onClick={() => setPlaylistOpen(false)} aria-label="Close media queue"><X size={16} /></button></header>
        <div className="media-queue-list">{playlist.map((choice, index) => { const choiceKind = mediaKind(choice.file.name); const active = choice.fileId === fileId; return <button className={active ? "active" : ""} key={`${choice.fileId}-${choice.file.name}`} onClick={() => { onSelect(choice.file, choice.fileId); setPlaylistOpen(false); }}><span className="media-queue-index">{active ? <Play size={11} fill="currentColor" /> : String(index + 1).padStart(2, "0")}</span><span className="media-queue-name"><strong>{choice.file.name}</strong><small>{choiceKind} · {bytes(choice.file.length)}</small></span></button>; })}</div>
      </aside>}
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
