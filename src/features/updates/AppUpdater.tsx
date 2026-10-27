import { ArrowRight, Check, Download, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { Modal } from "../../components/Modal";
import { bytes as formatBytes, plainNotes } from "../../lib/format";
import { useUpdater } from "./useUpdater";

/** Other parts of the app (for example Settings → About) ask for a manual check with this event. */
export const CHECK_FOR_UPDATES_EVENT = "torrentory:check-for-updates";

export function AppUpdater({ tourActive = false }: { tourActive?: boolean }) {
  const updater = useUpdater("__TAURI_INTERNALS__" in window);
  const { checkNow } = updater;
  useEffect(() => {
    const request = () => void checkNow();
    addEventListener(CHECK_FOR_UPDATES_EVENT, request);
    return () => removeEventListener(CHECK_FOR_UPDATES_EVENT, request);
  });
  const checking = updater.phase === "checking";
  const label = checking ? "Checking for updates…" : updater.update ? "Update available" : "Check for updates";
  const notes = plainNotes(updater.update?.body);
  const from = updater.update?.currentVersion;
  return <>
    <button data-tour="updates" className={`update-check ${updater.update ? "has-update" : ""}`} onClick={() => void updater.checkNow()} disabled={checking || updater.working}
      title={updater.update ? `Version ${updater.update.version} is ready to install` : undefined}>
      {updater.update ? <i className="update-dot" aria-hidden="true" /> : <RefreshCw size={11} className={checking ? "spin" : ""} />} {label}
    </button>
    {updater.open && !tourActive && <Modal title={updater.phase === "current" ? "You're up to date" : checking ? "Checking for updates" : "Update Torrentory"}
      subtitle={updater.update ? `Version ${updater.update.version} is available` : "Torrentory checks for updates each time it opens."}
      onClose={updater.dismiss} dismissible={!updater.working}>
      <div className="update-content" aria-live="polite">
        {updater.phase === "available" && <>
          {from && <div className="update-versions"><code>{from}</code><ArrowRight size={14} /><code className="new">{updater.update?.version}</code></div>}
          <p>Torrentory will download the update, verify its signature and restart. Active transfers pause briefly and resume automatically.</p>
          {notes && <><h4 className="update-notes-title">What's new</h4><p className="update-notes">{notes}</p></>}
        </>}
        {checking && <p>Looking for the latest release…</p>}
        {updater.phase === "current" && <div className="update-current"><span><Check size={16} /></span><p>You have the latest version of Torrentory Client.</p></div>}
        {updater.working && <>
          <p>{updater.phase === "downloading" ? "Downloading update…" : updater.phase === "installing" ? "Verifying and installing…" : "Restarting Torrentory…"}</p>
          <div className={`update-bar ${updater.progress === null ? "indeterminate" : ""}`} role="progressbar" aria-label="Update progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={updater.progress ?? undefined}>
            <span style={updater.progress === null ? undefined : { width: `${updater.progress}%` }} />
          </div>
          <div className="update-bar-meta">
            <span>{updater.progress !== null ? `${updater.progress}%` : "Starting…"}</span>
            {updater.bytes.total > 0 && <span>{formatBytes(updater.bytes.done)} of {formatBytes(updater.bytes.total)}</span>}
          </div>
        </>}
        {updater.error && <p className="update-error" role="alert">{updater.error}</p>}
      </div>
      <footer className="modal-footer">
        {!updater.working && <button className="button" onClick={updater.dismiss}>{updater.update ? "Later" : "Close"}</button>}
        {(updater.update || updater.installed) && <button className="button primary" disabled={updater.working} onClick={() => void updater.install()}>
          <Download size={14} /> {updater.working ? "Updating…" : updater.installed ? "Restart now" : updater.phase === "error" ? "Retry update" : "Update and restart"}
        </button>}
        {updater.phase === "error" && !updater.update && <button className="button primary" onClick={() => void updater.checkNow()}>Try again</button>}
      </footer>
    </Modal>}
  </>;
}
