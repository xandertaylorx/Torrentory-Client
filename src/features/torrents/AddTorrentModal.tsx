import { open } from "@tauri-apps/plugin-dialog";
import { Check, ChevronLeft, File, Folder, Link2, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { bytes } from "../../lib/format";
import { addTorrent, inspectTorrent } from "../../lib/api";
import type { Inspection, TorrentSource } from "../../lib/types";

export function AddTorrentModal({ initialSource, defaultDestination, onClose, onAdded }: {
  initialSource?: TorrentSource | null; defaultDestination: string; onClose: () => void; onAdded: () => void;
}) {
  const [source, setSource] = useState<TorrentSource | null>(initialSource ?? null);
  const [magnet, setMagnet] = useState(initialSource?.kind === "magnet" ? initialSource.value : "");
  const [destination, setDestination] = useState(defaultDestination);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const inspect = async (nextSource: TorrentSource) => {
    setSource(nextSource); setLoading(true); setError("");
    try {
      const result = await inspectTorrent(nextSource, destination);
      setInspection(result); setSelected(new Set(result.details.files.map((_, index) => index)));
    } catch (reason) { setError(String(reason)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (initialSource) void inspect(initialSource); }, []); // intentional one-time handoff
  const chooseFile = async () => {
    const path = await open({ multiple: false, filters: [{ name: "BitTorrent metainfo", extensions: ["torrent"] }] });
    if (typeof path === "string") void inspect({ kind: "file", value: path });
  };
  const chooseDestination = async () => {
    const path = await open({ directory: true, multiple: false, defaultPath: destination });
    if (typeof path === "string") setDestination(path);
  };
  const total = useMemo(() => inspection?.details.files.reduce((sum, file, index) => selected.has(index) ? sum + file.length : sum, 0) ?? 0, [inspection, selected]);
  const start = async () => {
    if (!source) return; setLoading(true); setError("");
    try { await addTorrent(source, destination, [...selected]); onAdded(); onClose(); }
    catch (reason) { setError(String(reason)); setLoading(false); }
  };

  return <Modal title={inspection ? "Ready to download" : "Add a torrent"} subtitle={inspection ? "Review the essentials before starting." : "Choose a magnet link or a .torrent file."} onClose={onClose} wide={Boolean(inspection)}>
    {!inspection ? <div className="modal-body add-source">
      <label className="field-label" htmlFor="magnet">Magnet link</label>
      <div className="input-with-icon"><Link2 size={15} /><input id="magnet" autoFocus value={magnet} onChange={(e) => setMagnet(e.target.value)} placeholder="magnet:?xt=urn:btih:…" onKeyDown={(e) => e.key === "Enter" && magnet && inspect({ kind: "magnet", value: magnet })} /></div>
      <button className="button primary full" disabled={!magnet.trim() || loading} onClick={() => inspect({ kind: "magnet", value: magnet })}>{loading ? <LoaderCircle className="spin" size={15} /> : null} Continue</button>
      <div className="or"><span>or</span></div>
      <button className="file-choice" onClick={chooseFile}><span><File size={19} /></span><div><strong>Open a torrent file</strong><small>Choose a .torrent file from your computer</small></div></button>
      {error && <p className="error-banner">{error}</p>}
    </div> : <>
      <div className="modal-body review-body">
        <div className="review-title"><div className="file-symbol"><File size={20} /></div><div><strong>{inspection.details.name || "Untitled torrent"}</strong><span>{bytes(total)} · {selected.size} of {inspection.details.files.length} files</span></div></div>
        <button className="destination" onClick={chooseDestination}><Folder size={16} /><span><small>Download to</small><strong>{destination}</strong></span><span>Change</span></button>
        <div className="file-list-head"><strong>Included files</strong><button onClick={() => setSelected(selected.size === inspection.details.files.length ? new Set() : new Set(inspection.details.files.map((_, i) => i)))}>{selected.size === inspection.details.files.length ? "Deselect all" : "Select all"}</button></div>
        <div className="file-list">
          {inspection.details.files.map((file, index) => <label key={`${file.name}-${index}`} className="file-row">
            <input type="checkbox" checked={selected.has(index)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; })} />
            <span className="check"><Check size={11} /></span><span title={file.name}>{file.name}</span><small>{bytes(file.length)}</small>
          </label>)}
        </div>
        {error && <p className="error-banner">{error}</p>}
      </div>
      <footer className="modal-footer"><button className="button quiet" onClick={() => { setInspection(null); setSource(null); }}><ChevronLeft size={14} /> Back</button><button className="button primary" disabled={!selected.size || loading} onClick={start}>{loading && <LoaderCircle className="spin" size={15} />} Start download</button></footer>
    </>}
  </Modal>;
}
