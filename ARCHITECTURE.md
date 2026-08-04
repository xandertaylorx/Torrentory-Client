# Architecture

## Boundaries

```text
React UI
  → typed invoke wrappers (`src/lib/api.ts`)
  → Tauri commands (`src-tauri/src/commands.rs`)
  → `TorrentEngine` trait
  → embedded `RqbitEngine`
  → BitTorrent peers, DHT, and trackers
```

The engine is embedded in the Tauri Rust process. Torrentory Client does not start an HTTP service, expose a remote API, or implement BitTorrent itself.

## Frontend

`src/features/torrents/` owns the add flow, torrent list, and details panel. `src/features/settings/` owns the concise settings surface. Brand tokens live in `src/styles/app.css`, adapted directly from the Torrentory website: `#fafafa`/`#090909` backgrounds, monochrome panels, `#10b981` status signal, Geist/SF typography, thin neutral borders, and the ship mark.

The initial list is loaded with a Tauri command. After that, the backend emits `torrentory://snapshot` events every 750 ms so progress does not depend on UI polling. Native open/drop/deep-link events are normalized to `TorrentSource`.

## Native layer

`TorrentEngine` is an async object-safe trait. The current adapter wraps `librqbit::Api`, which gives stable serializable details and action types while keeping rqbit-specific types out of commands and UI.

The rqbit session enables JSON persistence and fast resume. Individual torrents may use their own absolute destination. Torrent metadata inspection uses rqbit's `list_only` mode, so the confirmation flow sees real metadata and does not create a fake download.

## Storage and recovery

- Torrent session: application data directory `/session`, maintained by rqbit
- Settings: application data directory `/settings.json`
- Window geometry: Tauri window-state plugin

Settings writes use `settings.json.tmp` followed by an atomic rename. rqbit periodically persists session metadata and fast-resume data. Shutdown is owned by the Tauri process and rqbit cancellation lifecycle.

## Adding another engine

Implement `TorrentEngine`, map engine state to the same serialized contract, and construct that implementation in `lib.rs`. No React component or Tauri command signature needs to change.
