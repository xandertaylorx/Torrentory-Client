import { Copy, Folder, Pause, Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { bytes, progress, statusLabel } from "../../lib/format";
import { torrentDetails } from "../../lib/api";
import type { TorrentDetails, TorrentItem } from "../../lib/types";

export function DetailPanel({ item, onClose, onPause, onResume }: { item: TorrentItem; onClose: () => void; onPause: () => void; onResume: () => void }) {
  const [details, setDetails] = useState<TorrentDetails | null>(null);
  const [tab, setTab] = useState<"files" | "trackers" | "peers">("files");
  useEffect(() => { torrentDetails(item.id).then(setDetails).catch(() => setDetails(null)); }, [item.id, item.stats.progress_bytes]);
  const pct = progress(item.stats.progress_bytes, item.stats.total_bytes);
  const paused = item.stats.state === "paused";
  return <aside className="detail-panel" aria-label="Torrent details">
    <header className="detail-head"><span className="eyebrow">Torrent details</span><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={17} /></button></header>
    <div className="detail-scroll">
      <h2>{item.name}</h2><p className="detail-hash">{item.info_hash}</p>
      <div className="detail-progress-label"><strong>{pct.toFixed(1)}%</strong><span>{statusLabel(item)}</span></div><div className="progress-track large"><span style={{ width: `${pct}%` }} /></div>
      <div className="stats-grid">
        <div><small>Downloaded</small><strong>{bytes(item.stats.progress_bytes)}</strong></div><div><small>Uploaded</small><strong>{bytes(item.stats.uploaded_bytes)}</strong></div>
        <div><small>Download</small><strong>{item.stats.live?.download_speed.human_readable ?? "—"}</strong></div><div><small>Upload</small><strong>{item.stats.live?.upload_speed.human_readable ?? "—"}</strong></div>
        <div><small>Remaining</small><strong>{item.stats.live?.time_remaining?.human_readable ?? "—"}</strong></div><div><small>Ratio</small><strong>{item.stats.progress_bytes ? (item.stats.uploaded_bytes / item.stats.progress_bytes).toFixed(2) : "0.00"}</strong></div>
      </div>
      <div className="location-block"><Folder size={15} /><span><small>Save location</small><strong>{item.output_folder}</strong></span><button aria-label="Copy save location" onClick={() => navigator.clipboard.writeText(item.output_folder)}><Copy size={14} /></button></div>
      <div className="detail-tabs" role="tablist">{(["files", "trackers", "peers"] as const).map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>{name}</button>)}</div>
      <div className="detail-tab-content">
        {tab === "files" && (details?.files?.map((file, index) => <div className="detail-file" key={`${file.name}-${index}`}><span>{file.name}</span><small>{bytes(file.length)}</small></div>) ?? <p className="muted">Loading files…</p>)}
        {tab === "trackers" && (details?.trackers?.length ? details.trackers.map((tracker) => <div className="detail-file" key={tracker}><span>{tracker}</span></div>) : <p className="muted">Tracker details are not available yet.</p>)}
        {tab === "peers" && <p className="muted">Peer data is available while the torrent is actively transferring. {details?.peers ? "The engine is connected." : "No active peers."}</p>}
      </div>
    </div>
    <footer className="detail-footer"><button className="button full" disabled={item.stats.finished} onClick={paused ? onResume : onPause}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "Resume" : "Pause"}</button></footer>
  </aside>;
}
