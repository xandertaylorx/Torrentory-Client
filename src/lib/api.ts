import { invoke } from "@tauri-apps/api/core";
import type { CreateTorrentSummary, DefaultClientStatus, Inspection, Settings, TorrentDetails, TorrentItem, TorrentSource } from "./types";

export async function listTorrents(): Promise<TorrentItem[]> {
  const value = await invoke<{ torrents: TorrentItem[] }>("list_torrents");
  return value.torrents;
}
export const inspectTorrent = (source: TorrentSource, destination: string) =>
  invoke<Inspection>("inspect_torrent", { source, destination });
export const addTorrent = (source: TorrentSource, destination: string, fileIndices: number[]) =>
  invoke("add_torrent", { request: { source, destination, fileIndices } });
export const pauseTorrent = (id: number) => invoke("pause_torrent", { id });
export const resumeTorrent = (id: number) => invoke("resume_torrent", { id });
export const removeTorrent = (id: number, deleteFiles: boolean) =>
  invoke("remove_torrent", { id, deleteFiles });
export const torrentDetails = (id: number) => invoke<TorrentDetails>("torrent_details", { id });
export const mediaStreamUrl = (id: number, fileId: number) =>
  invoke<string>("media_stream_url", { id, fileId });
export const createTorrentFile = (sourcePath: string, outputPath: string, trackers: string[]) =>
  invoke<CreateTorrentSummary>("create_torrent_file", { request: { sourcePath, outputPath, trackers } });
export const getSettings = () => invoke<Settings>("get_settings");
export const saveSettings = (settings: Settings) => invoke("save_settings", { settings });

export const getDefaultClientStatus = () =>
  invoke<DefaultClientStatus>("get_default_client_status");
export const makeDefaultTorrentClient = () =>
  invoke<DefaultClientStatus>("make_default_torrent_client");
export const takePendingOpenSources = () =>
  invoke<string[]>("take_pending_open_sources");
