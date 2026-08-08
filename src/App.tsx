import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { Check, Plus, Search, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "./components/Logo";
import { AddTorrentModal } from "./features/torrents/AddTorrentModal";
import { DetailPanel } from "./features/torrents/DetailPanel";
import { EmptyState } from "./features/torrents/EmptyState";
import { MediaPlayer } from "./features/torrents/MediaPlayer";
import { TorrentRow } from "./features/torrents/TorrentRow";
import { SettingsModal } from "./features/settings/SettingsModal";
import { getDefaultClientStatus, getSettings, listTorrents, makeDefaultTorrentClient, pauseTorrent, removeTorrent, resumeTorrent, saveSettings, torrentDetails } from "./lib/api";
import { mediaKind, subtitlesFor } from "./lib/media";
import type { DefaultClientStatus, Settings, TorrentDetails, TorrentFile, TorrentItem, TorrentSource } from "./lib/types";
import { dragWindow } from "./lib/window";
import "./styles/app.css";

type Filter = "all" | "downloading" | "completed";
interface PlaybackSelection { item: TorrentItem; details: TorrentDetails; file: TorrentFile; fileId: number }
const isTauri = "__TAURI_INTERNALS__" in window;
const previewSettings: Settings = {
  downloadLocation: "/Users/you/Downloads", askWhereToSave: true, launchAtLogin: false,
  continueInBackground: true, completionNotifications: true, defaultClientPromptDismissed: false, confirmRemove: true,
  confirmDeleteFiles: true, downloadLimitKbps: 0, uploadLimitKbps: 0,
  listeningPort: 4240, incomingConnections: true, appearance: "system",
};
export default function App() {
  const [items, setItems] = useState<TorrentItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(isTauri ? null : previewSettings);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [incoming, setIncoming] = useState<TorrentSource | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultClient, setDefaultClient] = useState<DefaultClientStatus | null>(null);
  const [makingDefault, setMakingDefault] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [playback, setPlayback] = useState<PlaybackSelection | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<number | null>(null);
  const [detailsByTorrent, setDetailsByTorrent] = useState<Record<number, TorrentDetails | null>>({});
  const inspectedTorrents = useRef(new Set<number>());
  const [toast, setToast] = useState("");

  const refresh = () => listTorrents().then(setItems).catch((error) => setToast(String(error)));
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") { event.preventDefault(); setAddOpen(true); }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") { event.preventDefault(); setSettingsOpen(true); }
      if (event.key === "Escape") setSelected(null);
    };
    addEventListener("keydown", keyboard);
    if (!isTauri) return () => removeEventListener("keydown", keyboard);
    void refresh(); void getSettings().then(setSettings); void getDefaultClientStatus().then(setDefaultClient).catch(() => undefined);
    const unlistenSnapshot = listen<{ torrents: TorrentItem[] }>("torrentory://snapshot", ({ payload }) => setItems(payload.torrents));
    const unlistenSource = listen<string>("torrentory://open-source", ({ payload }) => {
      setIncoming({ kind: payload.startsWith("magnet:") ? "magnet" : "file", value: payload }); setAddOpen(true);
    });
    const unlistenDrop = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop") {
        const path = event.payload.paths.find((candidate) => candidate.toLowerCase().endsWith(".torrent"));
        if (path) { setIncoming({ kind: "file", value: path }); setAddOpen(true); }
      }
    });
    return () => { void unlistenSnapshot.then((fn) => fn()); void unlistenSource.then((fn) => fn()); void unlistenDrop.then((fn) => fn()); removeEventListener("keydown", keyboard); };
  }, []);
  useEffect(() => {
    if (!settings) return;
    const dark = settings.appearance === "dark" || (settings.appearance === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [settings]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const present = new Set(items.map(({ id }) => id));
    inspectedTorrents.current.forEach((id) => { if (!present.has(id)) inspectedTorrents.current.delete(id); });
    items.forEach((item) => {
      if (!item.name || inspectedTorrents.current.has(item.id)) return;
      inspectedTorrents.current.add(item.id);
      setDetailsByTorrent((current) => ({ ...current, [item.id]: null }));
      void torrentDetails(item.id)
        .then((details) => setDetailsByTorrent((current) => ({ ...current, [item.id]: details })))
        .catch(() => inspectedTorrents.current.delete(item.id));
    });
  }, [items]);

  const filtered = useMemo(() => items.filter((item) => {
    const matchesFilter = filter === "all" || (filter === "completed" ? item.stats.finished : !item.stats.finished && item.stats.state === "live");
    return matchesFilter && (item.name || "").toLowerCase().includes(query.toLowerCase());
  }), [items, filter, query]);
  const selectedItem = items.find((item) => item.id === selected);
  const showDefaultClientPrompt = Boolean(settings && defaultClient?.supported && !defaultClient.isDefault && !settings.defaultClientPromptDismissed);
  const mutate = async (action: () => Promise<unknown>) => { try { await action(); await refresh(); } catch (error) { setToast(String(error)); } };
  const makeDefault = async () => {
    setMakingDefault(true);
    try {
      const status = await makeDefaultTorrentClient();
      setDefaultClient(status);
      setToast(status.isDefault ? "Torrentory is now your default torrent client." : "Could not change the default torrent client.");
    } catch (error) {
      setToast(String(error));
    } finally {
      setMakingDefault(false);
    }
  };
  const dismissDefaultPrompt = async () => {
    if (!settings) return;
    const next = { ...settings, defaultClientPromptDismissed: true };
    setSettings(next);
    try { await saveSettings(next); } catch (error) { setToast(String(error)); }
  };

  const remove = (item: TorrentItem, deleteFiles: boolean) => {
    if (settings?.confirmRemove && !confirm(deleteFiles ? `Remove “${item.name}” and delete its downloaded files?` : `Remove “${item.name}” from Torrentory?`)) return;
    void mutate(() => removeTorrent(item.id, deleteFiles)); setSelected(null);
  };

  const playFile = (item: TorrentItem, details: TorrentDetails, file: TorrentFile, fileId: number) => {
    setPlayback({ item, details, file, fileId });
  };
  const playTorrent = async (item: TorrentItem) => {
    setLoadingMedia(item.id);
    try {
      const details = detailsByTorrent[item.id] ?? await torrentDetails(item.id);
      const firstPlayable = details.files
        .map((file, fileId) => ({ file, fileId }))
        .filter(({ file }) => file.included && mediaKind(file.name))
        .sort((a, b) => b.file.length - a.file.length)[0];
      if (!firstPlayable) {
        setToast("This torrent does not contain playable audio or video.");
        return;
      }
      playFile(item, details, firstPlayable.file, firstPlayable.fileId);
    } catch (error) {
      setToast(String(error));
    } finally {
      setLoadingMedia(null);
    }
  };

  return <div className={`app-shell ${selectedItem ? "with-detail" : ""}`}>
    <header className="titlebar" data-tauri-drag-region onMouseDown={dragWindow}><div className="traffic-space" data-tauri-drag-region /><div className="titlebar-brand" data-tauri-drag-region><Logo /></div><div className="title-actions"><button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Open settings"><SettingsIcon size={16} /></button><button className="button primary compact" onClick={() => { setIncoming(null); setAddOpen(true); }}><Plus size={14} /> Add torrent</button></div></header>
    <main className={`main-view ${showDefaultClientPrompt ? "has-default-client-banner" : ""}`}>
      {showDefaultClientPrompt && <section className="default-client-banner" aria-label="Default torrent client setup"><div className="default-client-icon"><Check size={15} /></div><div><strong>Make Torrentory your default torrent client</strong><span>Open .torrent files directly in Torrentory.</span></div><div className="default-client-actions"><button className="button quiet" onClick={() => void dismissDefaultPrompt()}>Not now</button><button className="button primary" disabled={makingDefault} onClick={() => void makeDefault()}>{makingDefault ? "Setting…" : "Make default"}</button></div></section>}
      <div className="toolbar"><div className="segments" role="tablist">{(["all", "downloading", "completed"] as Filter[]).map((name) => <button role="tab" aria-selected={filter === name} className={filter === name ? "active" : ""} key={name} onClick={() => setFilter(name)}>{name}<span>{name === "all" ? items.length : name === "completed" ? items.filter((i) => i.stats.finished).length : items.filter((i) => !i.stats.finished && i.stats.state === "live").length}</span></button>)}</div>{items.length > 4 && <label className="search"><Search size={14} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search torrents" /></label>}</div>
      {items.length === 0 ? <EmptyState onAdd={() => setAddOpen(true)} onPaste={async () => { const value = await navigator.clipboard.readText(); setIncoming({ kind: "magnet", value }); setAddOpen(true); }} /> : <section className="torrent-list" aria-label="Torrents">{filtered.map((item) => { const mediaCount = detailsByTorrent[item.id]?.files.filter((file) => file.included && mediaKind(file.name)).length ?? 0; return <TorrentRow key={item.id} item={item} selected={selected === item.id} mediaCount={mediaCount} loadingMedia={loadingMedia === item.id} onSelect={() => setSelected(item.id)} onPlay={() => void playTorrent(item)} onPause={() => void mutate(() => pauseTorrent(item.id))} onResume={() => void mutate(() => resumeTorrent(item.id))} onRemove={(deleteFiles) => remove(item, deleteFiles)} />; })}{filtered.length === 0 && <div className="no-results">No torrents match this view.</div>}</section>}
      <footer className="statusbar"><span><i className={items.some((item) => item.stats.state === "live") ? "online" : ""} /> {items.some((item) => item.stats.state === "live") ? "Connected" : "Ready"}</span><span>{items.filter((item) => item.stats.state === "live").length} active</span></footer>
    </main>
    {selectedItem && <DetailPanel item={selectedItem} onClose={() => setSelected(null)} onPlayFile={(details, file, fileId) => playFile(selectedItem, details, file, fileId)} onPause={() => void mutate(() => pauseTorrent(selectedItem.id))} onResume={() => void mutate(() => resumeTorrent(selectedItem.id))} />}
    {addOpen && settings && <AddTorrentModal initialSource={incoming} defaultDestination={settings.downloadLocation} onClose={() => { setAddOpen(false); setIncoming(null); }} onAdded={refresh} />}
    {settingsOpen && settings && <SettingsModal value={settings} defaultClient={defaultClient} onDefaultClientChange={setDefaultClient} valueMakingDefault={makingDefault} onMakingDefaultChange={setMakingDefault} onToast={setToast} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    {playback && <MediaPlayer torrentId={playback.item.id} torrentName={playback.item.name} file={playback.file} fileId={playback.fileId} playlist={playback.details.files.map((file, fileId) => ({ file, fileId })).filter(({ file }) => file.included && mediaKind(file.name))} subtitles={subtitlesFor(playback.details.files, playback.file)} torrentState={playback.item.stats.state} onSelect={(file, fileId) => playFile(playback.item, playback.details, file, fileId)} onResume={() => void mutate(() => resumeTorrent(playback.item.id))} onClose={() => setPlayback(null)} />}
    {toast && <div className="toast" role="alert">{toast}</div>}
  </div>;
}
