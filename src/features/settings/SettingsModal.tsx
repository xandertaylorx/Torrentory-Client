import { open } from "@tauri-apps/plugin-dialog";
import { disable, enable } from "@tauri-apps/plugin-autostart";
import { Folder } from "lucide-react";
import { useState } from "react";
import { Modal } from "../../components/Modal";
import { saveSettings } from "../../lib/api";
import type { Settings } from "../../lib/types";

const sections = ["General", "Downloads", "Bandwidth", "Network", "Appearance", "Advanced"] as const;
export function SettingsModal({ value, onChange, onClose }: { value: Settings; onChange: (settings: Settings) => void; onClose: () => void }) {
  const [section, setSection] = useState<typeof sections[number]>("General");
  const [draft, setDraft] = useState(value);
  const update = <K extends keyof Settings>(key: K, next: Settings[K]) => setDraft({ ...draft, [key]: next });
  const chooseFolder = async () => { const path = await open({ directory: true, defaultPath: draft.downloadLocation }); if (typeof path === "string") update("downloadLocation", path); };
  const done = async () => { await saveSettings(draft); draft.launchAtLogin ? await enable() : await disable(); onChange(draft); onClose(); };
  return <Modal title="Settings" subtitle="A few sensible defaults. Nothing you don't need." onClose={onClose} wide>
    <div className="settings-layout"><nav aria-label="Settings sections">{sections.map((name) => <button className={section === name ? "active" : ""} key={name} onClick={() => setSection(name)}>{name}</button>)}</nav><div className="settings-content">
      {section === "General" && <SettingsGroup title="General"><Toggle label="Launch at login" description="Open Torrentory when you sign in." value={draft.launchAtLogin} set={(v) => update("launchAtLogin", v)} /><Toggle label="Continue in background" description="Keep downloading after the main window closes." value={draft.continueInBackground} set={(v) => update("continueInBackground", v)} /><Toggle label="Completion notifications" description="Show a native notification when a download finishes." value={draft.completionNotifications} set={(v) => update("completionNotifications", v)} /></SettingsGroup>}
      {section === "Downloads" && <SettingsGroup title="Downloads"><button className="settings-folder" onClick={chooseFolder}><Folder size={16} /><span><strong>Default download location</strong><small>{draft.downloadLocation}</small></span><em>Change</em></button><Toggle label="Ask where to save" description="Choose a location before every download." value={draft.askWhereToSave} set={(v) => update("askWhereToSave", v)} /><Toggle label="Confirm removing torrents" value={draft.confirmRemove} set={(v) => update("confirmRemove", v)} /><Toggle label="Confirm deleting files" value={draft.confirmDeleteFiles} set={(v) => update("confirmDeleteFiles", v)} /></SettingsGroup>}
      {section === "Bandwidth" && <SettingsGroup title="Bandwidth"><NumberField label="Global download limit" suffix="KB/s · 0 is unlimited" value={draft.downloadLimitKbps} set={(v) => update("downloadLimitKbps", v)} /><NumberField label="Global upload limit" suffix="KB/s · 0 is unlimited" value={draft.uploadLimitKbps} set={(v) => update("uploadLimitKbps", v)} /></SettingsGroup>}
      {section === "Network" && <SettingsGroup title="Network"><NumberField label="Listening port" suffix="Changes apply after restart" value={draft.listeningPort} set={(v) => update("listeningPort", Math.min(65535, v))} /><Toggle label="Allow incoming connections" description="Improves connectivity with other peers." value={draft.incomingConnections} set={(v) => update("incomingConnections", v)} /></SettingsGroup>}
      {section === "Appearance" && <SettingsGroup title="Appearance"><div className="appearance-picker">{(["system", "light", "dark"] as const).map((theme) => <button className={draft.appearance === theme ? "active" : ""} onClick={() => update("appearance", theme)} key={theme}><span className={`theme-preview ${theme}`} />{theme}</button>)}</div></SettingsGroup>}
      {section === "Advanced" && <SettingsGroup title="Advanced"><div className="legal-note"><strong>Content-neutral by design</strong><p>Torrentory Client is intended for downloading and distributing content you are authorised to access. Remote access is disabled in this version.</p></div></SettingsGroup>}
    </div></div><footer className="modal-footer"><button className="button" onClick={onClose}>Cancel</button><button className="button primary" onClick={done}>Save settings</button></footer>
  </Modal>;
}
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) { return <section className="settings-group"><h3>{title}</h3>{children}</section>; }
function Toggle({ label, description, value, set }: { label: string; description?: string; value: boolean; set: (value: boolean) => void }) { return <label className="setting-row"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} /><i /></label>; }
function NumberField({ label, suffix, value, set }: { label: string; suffix: string; value: number; set: (value: number) => void }) { return <label className="number-field"><span><strong>{label}</strong><small>{suffix}</small></span><input type="number" min={0} value={value} onChange={(e) => set(Number(e.target.value))} /></label>; }
