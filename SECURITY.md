# Security

Torrent metadata and peer traffic are untrusted input.

## Implemented controls

- Only `magnet:` sources with an `xt` value are accepted.
- `.torrent` sources must be absolute, readable paths with the correct extension and a maximum metadata size of 10 MB.
- Download destinations must be absolute and cannot contain parent traversal components.
- `librqbit` performs its own metainfo validation and rejects traversal in torrent names and file components before filesystem storage is initialized.
- No shell commands or arbitrary command execution are exposed.
- No local or remote HTTP server is created.
- Tauri permissions allow only the native dialogs, notifications, autostart state, deep links, and opening/revealing paths needed by the UI.
- The production CSP limits code and resources to the bundled application and Tauri IPC.
- Removing downloaded files is a distinct engine command with a user confirmation.
- Settings are written atomically to reduce corruption after interruption.
- Remote access is absent.

## Trust boundaries

The embedded torrent engine opens outbound peer/tracker connections and, when configured, a listening peer port. Downloaded content is never executed or previewed by Torrentory Client. Reveal in Finder passes an engine-owned absolute destination to Tauri's opener plugin.

## Reporting

Do not include private tracker credentials, magnet links, downloaded filenames, or user paths in a public report. Provide the application version, macOS version, and a minimal reproduction using legal public content.

## Release checklist

Before public distribution, run `npm audit`, `cargo audit` (installed separately), TypeScript checks, Clippy, unit tests, macOS signing/notarisation, and a legal end-to-end restart test.
