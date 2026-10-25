import { Download, RefreshCw } from "lucide-react";
import { Modal } from "../../components/Modal";
import { useUpdater } from "./useUpdater";

export function AppUpdater() {
  const updater = useUpdater("__TAURI_INTERNALS__" in window);
  const label = updater.phase === "checking" ? "Checking for updates…" : updater.update ? "Update available" : "Check for updates";
  return <>
    <button className="update-check" onClick={() => void updater.checkNow()} disabled={updater.phase === "checking" || updater.working}>
      <RefreshCw size={11} /> {label}
    </button>
    {updater.open && <Modal title={updater.phase === "current" ? "You're up to date" : updater.phase === "checking" ? "Checking for updates" : "Update Torrentory"}
      subtitle={updater.update ? `Version ${updater.update.version} is available` : "Torrentory checks for updates each time it opens."}
      onClose={updater.dismiss} dismissible={!updater.working}>
      <div className="update-content" aria-live="polite">
        {updater.phase === "available" && <>
          <p>Install the latest version without leaving the app. Torrentory will download the update, verify its signature and restart automatically.</p>
          <p className="muted">Active transfers will briefly pause during the restart.</p>
          {updater.update?.body && <p className="update-notes">{updater.update.body}</p>}
        </>}
        {updater.phase === "checking" && <p>Looking for the latest release…</p>}
        {updater.phase === "current" && <p>You have the latest version of Torrentory Client.</p>}
        {updater.working && <>
          <p>{updater.phase === "downloading" ? "Downloading update…" : updater.phase === "installing" ? "Verifying and installing update…" : "Restarting Torrentory…"}</p>
          <progress aria-label="Update progress" max={100} value={updater.progress ?? undefined} />
          {updater.progress !== null && <small>{updater.progress}% downloaded</small>}
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
