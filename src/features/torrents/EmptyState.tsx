import { Link2, Plus } from "lucide-react";
import { Logo } from "../../components/Logo";

export function EmptyState({ onAdd, onPaste }: { onAdd: () => void; onPaste: () => void }) {
  return <section className="empty-state" data-tour="library">
    <div className="empty-mark"><Logo wordmark={false} /></div>
    <h2>Your downloads, kept simple.</h2>
    <p>Add a magnet link or torrent file. Torrentory handles the rest and keeps your progress here.</p>
    <div className="empty-actions">
      <button className="button primary" onClick={onAdd}><Plus size={15} /> Add torrent</button>
      <button className="button" onClick={onPaste}><Link2 size={15} /> Paste magnet link</button>
    </div>
    <span className="drop-note">You can also drop a .torrent file anywhere in this window</span>
  </section>;
}
