import { open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Check, File, Folder, FolderOpen, Hash, LoaderCircle, Radio, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "../../components/Modal";
import { createTorrentFile } from "../../lib/api";
import { bytes } from "../../lib/format";
import type { CreateTorrentSummary } from "../../lib/types";

const POPULAR_TRACKERS = [
  "udp://zer0day.ch:1337/announce",
  "udp://tracker.publictracker.xyz:6969/announce",
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.wildkat.net:6969/announce",
  "udp://tracker.qu.ax:6969/announce",
  "udp://tracker.peerfect.org:6969/announce",
  "udp://tracker.opentrackr.com:6969/announce",
  "udp://tracker.linvk.com:6969/announce",
  "udp://tracker.ilibr.org:6969/announce",
  "udp://tracker.ducks.party:1984/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://tracker.bittor.pw:1337/announce",
];

type SourceKind = "file" | "folder";

export function CreateTorrentModal({ onClose, onCreated }: { onClose: () => void; onCreated: (message: string) => void }) {
  const [sourcePath, setSourcePath] = useState("");
  const [sourceKind, setSourceKind] = useState<SourceKind>("file");
  const [trackers, setTrackers] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateTorrentSummary | null>(null);
  const trackerList = useMemo(() => [...new Set(trackers.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))], [trackers]);

  const chooseSource = async (kind: SourceKind) => {
    const path = await open({ directory: kind === "folder", multiple: false });
    if (typeof path === "string") { setSourcePath(path); setSourceKind(kind); setError(""); }
  };
  const create = async () => {
    if (!sourcePath) return;
    const sourceName = sourcePath.split("/").filter(Boolean).pop() || "download";
    const output = await save({
      defaultPath: `${sourcePath}.torrent`,
      filters: [{ name: "BitTorrent metainfo", extensions: ["torrent"] }],
    });
    if (!output) return;
    setCreating(true); setError("");
    try {
      const created = await createTorrentFile(sourcePath, output, trackerList);
      setResult(created);
      onCreated(`Created ${sourceName}.torrent`);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setCreating(false);
    }
  };

  if (result) return <Modal title="Torrent created" subtitle="The metainfo file is ready to share." onClose={onClose}>
    <div className="modal-body create-success">
      <div className="create-success-mark"><Check size={24} /></div>
      <strong>{result.outputPath.split("/").pop()}</strong>
      <span>{bytes(result.totalBytes)} · {result.fileCount} {result.fileCount === 1 ? "file" : "files"} · {result.trackerCount} {result.trackerCount === 1 ? "tracker" : "trackers"}</span>
      <div className="create-hash"><Hash size={13} /><code>{result.infoHash}</code></div>
      <button className="button full" onClick={() => void revealItemInDir(result.outputPath)}><FolderOpen size={14} /> Reveal in Finder</button>
    </div>
    <footer className="modal-footer"><button className="button primary" onClick={onClose}>Done</button></footer>
  </Modal>;

  return <Modal title="Create a torrent" subtitle="Package a file or folder into shareable BitTorrent metadata." onClose={onClose} wide>
    <div className="modal-body create-torrent-body">
      <section className="create-section">
        <div className="create-section-heading"><span>01</span><div><strong>Choose content</strong><small>The original files stay exactly where they are.</small></div></div>
        {sourcePath ? <button className="create-source-selected" onClick={() => void chooseSource(sourceKind)}><span>{sourceKind === "folder" ? <Folder size={18} /> : <File size={18} />}</span><div><strong>{sourcePath.split("/").pop()}</strong><small>{sourcePath}</small></div><em>Change</em></button> : <div className="create-source-options">
          <button onClick={() => void chooseSource("file")}><File size={19} /><span><strong>Choose a file</strong><small>Create a single-file torrent</small></span></button>
          <button onClick={() => void chooseSource("folder")}><Folder size={19} /><span><strong>Choose a folder</strong><small>Include every file inside</small></span></button>
        </div>}
      </section>
      <section className="create-section">
        <div className="create-section-heading"><span>02</span><div><strong>Add trackers</strong><small>One URL per line. Trackers are optional when DHT is available.</small></div><div className="tracker-actions"><button onClick={() => setTrackers(POPULAR_TRACKERS.join("\n"))}><Sparkles size={12} /> Fill popular</button>{trackers && <button onClick={() => setTrackers("")}>Clear</button>}</div></div>
        <div className="tracker-editor"><Radio size={15} /><textarea value={trackers} onChange={(event) => setTrackers(event.target.value)} spellCheck={false} placeholder={"udp://tracker.example:6969/announce\nhttps://tracker.example/announce"} aria-label="Tracker URLs" /></div>
        <div className="tracker-count"><span>{trackerList.length} {trackerList.length === 1 ? "tracker" : "trackers"}</span><span>Public preset sourced from the actively maintained trackers list.</span></div>
      </section>
      {error && <p className="error-banner">{error}</p>}
    </div>
    <footer className="modal-footer"><button className="button quiet" onClick={onClose}>Cancel</button><button className="button primary" disabled={!sourcePath || creating} onClick={() => void create()}>{creating ? <LoaderCircle className="spin" size={14} /> : null}{creating ? "Hashing content…" : "Create torrent"}</button></footer>
  </Modal>;
}
