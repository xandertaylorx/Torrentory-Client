import { Check, FolderOpen, LoaderCircle, MoreHorizontal, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { bytes, progress, statusLabel } from "../../lib/format";
import type { TorrentItem } from "../../lib/types";

export function TorrentRow({ item, selected, mediaCount, loadingMedia, onSelect, onPlay, onPause, onResume, onRemove }: {
  item: TorrentItem; selected: boolean; mediaCount: number; loadingMedia: boolean; onSelect: () => void; onPlay: () => void; onPause: () => void; onResume: () => void;
  onRemove: (deleteFiles: boolean) => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => !menuRef.current?.contains(event.target as Node) && setMenu(false);
    addEventListener("mousedown", close); return () => removeEventListener("mousedown", close);
  }, []);
  const pct = progress(item.stats.progress_bytes, item.stats.total_bytes);
  const active = item.stats.state === "live";
  const seeding = item.stats.finished && active;
  const speed = seeding ? item.stats.live?.upload_speed.human_readable : item.stats.live?.download_speed.human_readable;
  const eta = item.stats.finished ? (active ? "Sharing with peers" : "Complete") : (item.stats.live?.time_remaining?.human_readable ?? "—");
  return <article className={`torrent-row ${selected ? "selected" : ""}`} onClick={onSelect} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect()}>
    <div className="row-primary">
      <div className={`status-mark ${seeding ? "seeding" : item.stats.finished ? "complete" : item.stats.state}`} aria-hidden="true">
        {item.stats.finished ? <Check size={14} /> : null}
      </div>
      <div className="torrent-name">
        <strong>{item.name || "Resolving metadata…"}</strong>
        <span>{statusLabel(item)} · {bytes(item.stats.total_bytes)}</span>
      </div>
    </div>
    <div className="row-progress">
      <div className={`progress-label ${seeding ? "seeding" : ""}`}><span>{seeding ? "Seeding" : `${pct.toFixed(pct === 100 ? 0 : 1)}%`}</span><span>{eta}</span></div>
      <div className={`progress-track ${seeding ? "seeding" : ""}`} role="progressbar" aria-label={seeding ? `${item.name} is seeding` : `${item.name} download progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
    <div className={`row-speed ${seeding ? "uploading" : ""}`}><span>{seeding ? "↑" : "↓"}</span> {active ? (speed ?? "—") : "—"}</div>
    <div className="row-play-slot">{mediaCount > 0 && <button className="row-play" disabled={loadingMedia} onClick={(event) => { event.stopPropagation(); onPlay(); }} aria-label={`Play media from ${item.name}`}>
      {loadingMedia ? <LoaderCircle className="spin" size={14} /> : <Play size={13} fill="currentColor" />}<span>{loadingMedia ? "Opening" : "Play"}{mediaCount > 1 && !loadingMedia ? ` · ${mediaCount}` : ""}</span>
    </button>}</div>
    <button className="icon-button row-action" onClick={(e) => { e.stopPropagation(); active ? onPause() : onResume(); }} aria-label={active ? (item.stats.finished ? "Pause seeding" : "Pause torrent") : (item.stats.finished ? "Resume seeding" : "Resume torrent")}>
      {active ? <Pause size={15} /> : <Play size={15} />}
    </button>
    <div className="menu-wrap" ref={menuRef}>
      <button className="icon-button row-action" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }} aria-label="More torrent actions" aria-expanded={menu}><MoreHorizontal size={17} /></button>
      {menu && <div className="context-menu" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => revealItemInDir(item.output_folder)}><FolderOpen size={14} /> Reveal in Finder</button>
        <button onClick={() => navigator.clipboard.writeText(`magnet:?xt=urn:btih:${item.info_hash}`)}>Copy magnet link</button>
        <hr />
        <button className="danger" onClick={() => onRemove(false)}><Trash2 size={14} /> Remove</button>
        <button className="danger" onClick={() => onRemove(true)}>Remove and delete files</button>
      </div>}
    </div>
  </article>;
}
