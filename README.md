# Torrentory Client

Torrentory Client is a minimal native BitTorrent client for macOS, built as the desktop companion to Torrentory. It uses Tauri, React, TypeScript, Rust, and the real `librqbit` engine. The application is content-neutral and intended for downloading and distributing content you are authorised to access.

## Current feature status

Working in the first vertical slice:

- Add and inspect magnet links
- Open, drop, and register `.torrent` files
- Choose a destination and included files before downloading
- Start real BitTorrent transfers through `librqbit`
- Live progress, download/upload speeds, and ETA through Tauri events
- In-app audio and video streaming while files download, with waveform visualization, seeking, playback speed, volume, fullscreen video, and SRT/WebVTT subtitles
- Pause, resume, remove, and remove with downloaded files
- Reveal downloads in Finder and copy a magnet URI
- Persistent torrent session with fast resume after restart
- Persistent settings, light/dark/system appearance, native file dialogs, notifications, single instance, deep links, and restored window state
- Minimal detail view for files, trackers, peer state, transfer totals, ratio, and location

Speed-limit fields and incoming-connection settings are persisted, but changing engine rate limits at runtime is not yet wired. Changing the listening port takes effect after restart. Relocating an already-started torrent, dock progress, signed/notarised distribution, and Windows packaging remain planned.

## Architecture

The React UI invokes a narrow typed Tauri command layer. Commands depend on the `TorrentEngine` trait rather than rqbit directly. `RqbitEngine` embeds one native `librqbit::Session`; there is no localhost HTTP server. The session stores metadata and fast-resume state under the application data directory and emits a serialized snapshot every 750 ms. Settings use an atomic temporary-file-and-rename write.

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [SECURITY.md](./SECURITY.md).

## Prerequisites

- macOS 12 or newer
- Xcode Command Line Tools (`xcode-select --install`)
- Node.js 20 or newer (tested with Node 26)
- Rust stable (tested with Rust 1.97)
- npm

`librqbit` is pure Rust, so Homebrew, CMake, and a separately installed libtorrent are not required.

## Development

```bash
cd /Users/user/Developer/TESTS/Torrentory-Client
npm install
npm run tauri dev
```

Useful checks:

```bash
npm run typecheck
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

## Build the macOS app

```bash
cd /Users/user/Developer/TESTS/Torrentory-Client
npm install
npm run tauri build
```

Unsigned local output is written under `src-tauri/target/release/bundle/macos/` and the DMG under `src-tauri/target/release/bundle/dmg/`. Public distribution requires an Apple Developer identity, signing, and notarisation.

## Legal manual test

Use only a legal, redistributable test torrent. A Linux distribution torrent from the distribution's official download page is suitable.

1. Download an official Ubuntu `.torrent` from `https://ubuntu.com/download/alternative-downloads`.
2. Open Torrentory Client and add that file.
3. Select a temporary destination and start the download.
4. Verify live speed/progress, pause for ten seconds, resume, and restart the app.
5. Confirm progress is restored, then use Reveal in Finder.
6. Remove the torrent without files, add it again, then test “Remove and delete files” and its confirmation.

The same native-engine flow has an opt-in automated smoke test:

```bash
TORRENTORY_TEST_TORRENT=/absolute/path/to/legal-linux.iso.torrent \
  cargo test --manifest-path src-tauri/Cargo.toml --test legal_network_smoke -- --ignored --nocapture
```

## Known limitations

- BitTorrent v1 is the primary supported metadata format in the embedded engine.
- File priorities are include/exclude in the add flow; per-file priority levels after start are not exposed yet.
- Runtime global/per-torrent bandwidth enforcement is planned.
- Peer data is deliberately summarized rather than presented as a dense utility table.
- Background-only tray behavior and dock progress need a later macOS integration pass.
- Windows configuration is kept portable, but Windows packaging and file-association testing are not complete.

See [ROADMAP.md](./ROADMAP.md) for the next milestones.
