import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { disable, enable } from "@tauri-apps/plugin-autostart";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight, CheckCircle2, Folder, Gauge, Globe, Info, Palette, RefreshCw, Settings as SettingsIcon, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { Logo } from "../../components/Logo";
import { makeDefaultTorrentClient, saveSettings } from "../../lib/api";
import { limitLabel } from "../../lib/format";
import { applyAppearance } from "../../lib/theme";
import type { DefaultClientStatus, Settings } from "../../lib/types";
import { CHECK_FOR_UPDATES_EVENT } from "../updates/AppUpdater";

const sections: { name: string; icon: LucideIcon }[] = [
  { name: "General", icon: SettingsIcon },
  { name: "Downloads", icon: Folder },
  { name: "Bandwidth", icon: Gauge },
  { name: "Network", icon: Globe },
  { name: "Appearance", icon: Palette },
  { name: "About", icon: Info },
];
type SectionName = typeof sections[number]["name"];
const SITE = "https://www.torrentory.com";
const REPO = "https://github.com/xandertaylorx/Torrentory-Client";
const MIN_PORT = 1024;
const speedPresets = [0, 1024, 5120, 10240, 51200];

/** Returns a user-facing problem with the settings, or null when they can be saved. */
export function validateSettings(settings: Settings): string | null {
  if (!Number.isInteger(settings.listeningPort) || settings.listeningPort < MIN_PORT || settings.listeningPort > 65535) return `Listening port must be between ${MIN_PORT} and 65535.`;
  if (!Number.isInteger(settings.downloadLimitKbps) || settings.downloadLimitKbps < 0) return "The download limit must be 0 or a positive whole number.";
  if (!Number.isInteger(settings.uploadLimitKbps) || settings.uploadLimitKbps < 0) return "The upload limit must be 0 or a positive whole number.";
  return null;
}

export function SettingsModal({ value, defaultClient, onDefaultClientChange, valueMakingDefault, onMakingDefaultChange, onToast, onChange, onClose, onStartTour }: { value: Settings; defaultClient: DefaultClientStatus | null; onDefaultClientChange: (status: DefaultClientStatus) => void; valueMakingDefault: boolean; onMakingDefaultChange: (value: boolean) => void; onToast: (message: string) => void; onChange: (settings: Settings) => void; onClose: () => void; onStartTour: () => void }) {
  const [section, setSection] = useState<SectionName>("General");
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState("");
  const update = <K extends keyof Settings>(key: K, next: Settings[K]) => setDraft((current) => ({ ...current, [key]: next }));
  const problem = validateSettings(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(value);
  useEffect(() => { void getVersion().then(setVersion).catch(() => undefined); }, []);
  // Preview the chosen theme immediately; cancelling restores the saved one.
  useEffect(() => { applyAppearance(draft.appearance); }, [draft.appearance]);
  const cancel = () => { applyAppearance(value.appearance); onClose(); };
  const chooseFolder = async () => { const path = await open({ directory: true, defaultPath: draft.downloadLocation }); if (typeof path === "string") update("downloadLocation", path); };
  const done = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      await saveSettings(draft);
      try { draft.launchAtLogin ? await enable() : await disable(); } catch { onToast("Settings saved, but launch at login could not be changed."); }
      onChange(draft);
      onClose();
    } catch (error) {
      onToast(`Could not save settings. ${String(error)}`);
      setSaving(false);
    }
  };
  const makeDefault = async () => {
    onMakingDefaultChange(true);
    try {
      const status = await makeDefaultTorrentClient();
      onDefaultClientChange(status);
      if (status.isDefault) {
        const next = { ...draft, defaultClientPromptDismissed: false };
        setDraft(next);
        onChange(next);
        await saveSettings(next);
      }
      onToast(status.isDefault ? "Torrentory is now your default torrent client." : "Could not change the default torrent client.");
    } catch (error) {
      onToast(String(error));
    } finally {
      onMakingDefaultChange(false);
    }
  };
  const checkForUpdates = () => { cancel(); setTimeout(() => dispatchEvent(new Event(CHECK_FOR_UPDATES_EVENT)), 0); };
  return <Modal title="Settings" subtitle="A few sensible defaults. Nothing you don't need." onClose={cancel} wide>
    <div className="settings-layout"><nav aria-label="Settings sections">{sections.map(({ name, icon: Icon }) => <button className={section === name ? "active" : ""} aria-current={section === name ? "page" : undefined} key={name} onClick={() => setSection(name)}><Icon size={14} />{name}</button>)}</nav><div className="settings-content">
      {section === "General" && <SettingsGroup title="General" hint="How Torrentory starts and behaves."><DefaultClientSetting status={defaultClient} busy={valueMakingDefault} onMakeDefault={() => void makeDefault()} /><Toggle label="Launch at login" description="Open Torrentory when you sign in." value={draft.launchAtLogin} set={(v) => update("launchAtLogin", v)} /><Toggle label="Continue in background" description="Keep downloading after the main window closes." value={draft.continueInBackground} set={(v) => update("continueInBackground", v)} /><Toggle label="Completion notifications" description="Show a native notification when a download finishes." value={draft.completionNotifications} set={(v) => update("completionNotifications", v)} /></SettingsGroup>}
      {section === "Downloads" && <SettingsGroup title="Downloads" hint="Where files go, and when Torrentory checks with you."><button className="settings-folder" onClick={chooseFolder}><Folder size={16} /><span><strong>Default download location</strong><small>{draft.downloadLocation}</small></span><em>Change</em></button><Toggle label="Ask where to save" description="Choose a location before every download." value={draft.askWhereToSave} set={(v) => update("askWhereToSave", v)} /><Toggle label="Confirm removing torrents" description="Ask before a torrent is removed from the list." value={draft.confirmRemove} set={(v) => update("confirmRemove", v)} /><Toggle label="Confirm deleting files" description="Ask before downloaded files are deleted from disk." value={draft.confirmDeleteFiles} set={(v) => update("confirmDeleteFiles", v)} /></SettingsGroup>}
      {section === "Bandwidth" && <SettingsGroup title="Bandwidth" hint="Applies to all torrents together, immediately after you save."><SpeedLimit label="Download limit" value={draft.downloadLimitKbps} set={(v) => update("downloadLimitKbps", v)} /><SpeedLimit label="Upload limit" value={draft.uploadLimitKbps} set={(v) => update("uploadLimitKbps", v)} /></SettingsGroup>}
      {section === "Network" && <SettingsGroup title="Network" hint="How other peers reach you."><NumberField label="Listening port" suffix={`${MIN_PORT}–65535 · applies after restart`} value={draft.listeningPort} min={MIN_PORT} max={65535} set={(v) => update("listeningPort", v)} invalid={draft.listeningPort < MIN_PORT || draft.listeningPort > 65535} /><Toggle label="Allow incoming connections" description="Improves connectivity with other peers." value={draft.incomingConnections} set={(v) => update("incomingConnections", v)} /></SettingsGroup>}
      {section === "Appearance" && <SettingsGroup title="Appearance" hint="Changes preview instantly."><div className="appearance-picker" role="radiogroup" aria-label="Theme">{(["system", "light", "dark"] as const).map((theme) => <button role="radio" aria-checked={draft.appearance === theme} className={draft.appearance === theme ? "active" : ""} onClick={() => update("appearance", theme)} key={theme}><span className={`theme-preview ${theme}`} />{theme}</button>)}</div></SettingsGroup>}
      {section === "About" && <SettingsGroup title="About">
        <div className="about-card"><div className="about-mark"><Logo wordmark={false} /></div><div><strong>Torrentory Client</strong><small>{version ? `Version ${version}` : "Version unavailable"} · MIT licensed</small></div><button className="button" onClick={checkForUpdates}><RefreshCw size={13} /> Check for updates</button></div>
        <div className="tour-setting"><div><strong>New to Torrentory?</strong><small>A quick guided tour of the essentials. Unsaved settings will be discarded.</small></div><button className="button" disabled={saving} onClick={() => { cancel(); onStartTour(); }}>Run tour</button></div>
        <div className="about-links">
          <button onClick={() => void openUrl(SITE)}>Website <ArrowUpRight size={12} /></button>
          <button onClick={() => void openUrl(`${SITE}/releases`)}>Release notes <ArrowUpRight size={12} /></button>
          <button onClick={() => void openUrl(REPO)}>Source code <ArrowUpRight size={12} /></button>
          <button onClick={() => void openUrl(`${SITE}/legal`)}>Legal <ArrowUpRight size={12} /></button>
        </div>
        <div className="legal-note"><strong>Content-neutral by design</strong><p>Torrentory Client is intended for downloading and distributing content you are authorised to access. It has no accounts, no telemetry and no remote access.</p></div>
      </SettingsGroup>}
    </div></div><footer className="modal-footer">{problem ? <span className="settings-problem" role="alert"><SlidersHorizontal size={12} /> {problem}</span> : changed ? <span className="settings-dirty">Unsaved changes</span> : null}<button className="button" onClick={cancel}>Cancel</button><button className="button primary" onClick={() => void done()} disabled={!changed || Boolean(problem) || saving}>{saving ? "Saving…" : "Save settings"}</button></footer>
  </Modal>;
}
function DefaultClientSetting({ status, busy, onMakeDefault }: { status: DefaultClientStatus | null; busy: boolean; onMakeDefault: () => void }) {
  if (!status?.supported) return null;
  return <div className="default-client-setting"><span className={status.isDefault ? "default-client-check active" : "default-client-check"}><CheckCircle2 size={16} /></span><div><strong>Default torrent client</strong><small>{status.isDefault ? "Torrentory opens .torrent files by default." : "Another app currently opens .torrent files."}</small></div>{status.isDefault ? <em>Default</em> : <button className="button" disabled={busy} onClick={onMakeDefault}>{busy ? "Setting…" : "Make default"}</button>}</div>;
}
function SettingsGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) { return <section className="settings-group"><h3>{title}</h3>{hint && <p className="settings-hint">{hint}</p>}{children}</section>; }
function Toggle({ label, description, value, set }: { label: string; description?: string; value: boolean; set: (value: boolean) => void }) { return <label className="setting-row"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" role="switch" checked={value} onChange={(e) => set(e.target.checked)} /><i /></label>; }
function NumberField({ label, suffix, value, set, min = 0, max, invalid = false }: { label: string; suffix: string; value: number; set: (value: number) => void; min?: number; max?: number; invalid?: boolean }) { return <label className="number-field"><span><strong>{label}</strong><small>{suffix}</small></span><input type="number" min={min} max={max} step={1} inputMode="numeric" aria-invalid={invalid || undefined} className={invalid ? "invalid" : ""} value={Number.isFinite(value) ? value : ""} onChange={(e) => set(e.target.value === "" ? Number.NaN : Math.trunc(Number(e.target.value)))} /></label>; }
function SpeedLimit({ label, value, set }: { label: string; value: number; set: (value: number) => void }) {
  const invalid = !Number.isInteger(value) || value < 0;
  return <div className="speed-limit">
    <NumberField label={label} suffix={invalid ? "Enter 0 or a positive number" : value === 0 ? "Unlimited · enter KB/s to set a cap" : `${limitLabel(value)} · in KB/s`} value={value} set={set} invalid={invalid} />
    <div className="speed-presets" role="group" aria-label={`${label} presets`}>{speedPresets.map((preset) => <button key={preset} className={value === preset ? "active" : ""} onClick={() => set(preset)}>{preset === 0 ? "Unlimited" : limitLabel(preset)}</button>)}</div>
  </div>;
}
