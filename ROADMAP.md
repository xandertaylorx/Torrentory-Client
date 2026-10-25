# Roadmap

## Milestone 1 — Working vertical slice

- [x] Native Tauri application and Torrentory visual language
- [x] Real magnet and `.torrent` metadata inspection
- [x] Destination and file selection
- [x] Real rqbit download with event-driven progress and speed
- [x] Pause, resume, persistence, remove, delete files, and Finder reveal
- [x] Settings persistence, native dialogs and notifications
- [x] Single-instance, deep-link/file-association configuration, and window restoration

## Milestone 2 — Native polish

- [ ] Menu-bar/tray background lifecycle
- [ ] Dock/taskbar progress and native application menu
- [x] Runtime global bandwidth limits
- [ ] Per-torrent basic limits
- [ ] Move completed or paused torrent data safely
- [ ] Richer tracker and peer summaries
- [ ] Per-file priority levels after start
- [ ] First-run legal note and dedicated About window

## Milestone 3 — Distribution

- [ ] macOS signing, hardened runtime, notarisation, and updater
- [ ] Automated Tauri command integration harness
- [ ] Windows CI, installer, protocol/file associations, and taskbar progress
- [ ] Crash/restart soak tests and large multi-file torrent testing
