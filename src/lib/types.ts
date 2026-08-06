export type TorrentStatus = "initializing" | "live" | "paused" | "error";

export interface Speed { mbps: number; human_readable: string }
export interface TorrentStats {
  state: TorrentStatus;
  error?: string | null;
  progress_bytes: number;
  uploaded_bytes: number;
  total_bytes: number;
  finished: boolean;
  file_progress: number[];
  live?: {
    download_speed: Speed;
    upload_speed: Speed;
    time_remaining?: { human_readable: string } | null;
  } | null;
}

export interface TorrentItem {
  id: number;
  info_hash: string;
  name?: string | null;
  output_folder: string;
  stats: TorrentStats;
}

export interface TorrentFile {
  name: string;
  components: string[];
  length: number;
  included: boolean;
}

export interface PeerSummary {
  connected: number;
  connecting: number;
  queued: number;
  known: number;
}

export interface TorrentDetails extends TorrentItem {
  files: TorrentFile[];
  trackers?: string[];
  peers?: unknown[] | Record<string, unknown>;
  peer_summary?: PeerSummary;
}

export interface TorrentSource {
  kind: "magnet" | "file";
  value: string;
}

export interface Inspection {
  id: null;
  output_folder: string;
  details: {
    info_hash: string;
    name?: string | null;
    files: TorrentFile[];
  };
}

export type Appearance = "system" | "light" | "dark";
export interface Settings {
  downloadLocation: string;
  askWhereToSave: boolean;
  launchAtLogin: boolean;
  continueInBackground: boolean;
  completionNotifications: boolean;
  defaultClientPromptDismissed: boolean;
  confirmRemove: boolean;
  confirmDeleteFiles: boolean;
  downloadLimitKbps: number;
  uploadLimitKbps: number;
  listeningPort: number;
  incomingConnections: boolean;
  appearance: Appearance;
}

export interface DefaultClientStatus {
  supported: boolean;
  isDefault: boolean;
  currentHandler?: string | null;
}
