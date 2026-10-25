# Distribution and updates

The desktop client lives at the repository root; the standalone Vercel website lives in `web/`. GitHub Releases hosts downloads and update metadata.

## Build and publish a release

1. Update the desktop version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
2. Run `npm test`, `npm run build`, Rust checks/tests, and `npm run build --prefix web`.
3. Build the Apple Silicon macOS app with Developer ID signing and the existing updater private key:

   ```sh
   APPLE_SIGNING_IDENTITY='Developer ID Application: Xander Taylor (7XX5D66UT5)' \
   TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/torrentory-client-updater.key" \
   TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' npm run tauri -- build
   ```

   New builds are **not notarised**. Do not supply Apple notarisation credentials. The DMG is Developer ID signed, and the `.app.tar.gz` is separately signed for Tauri's updater. Keep the private key backed up securely: replacing it strands existing installations on the old key.
4. Push the matching source to `main`, run **Build Windows installer** in Actions, and download its `torrentory-windows-x64` artifact. The workflow uses the `TAURI_SIGNING_PRIVATE_KEY` repository secret. It produces the versioned `.exe` and adjacent `.exe.sig`. The Windows installer does not have an Authenticode signature; its Tauri updater signature is mandatory.
5. Prepare assets on macOS, supplying installers from the same source/version:

   ```sh
   node scripts/prepare-release.mjs /path/to/client.dmg /path/to/Torrentory-Client_VERSION_x64-setup.exe '/path/to/Torrentory Client.app.tar.gz'
   ```

   Both updater signatures must exist beside their artifacts. Preparation checks the macOS publisher and version. If a DMG has a stapled notarisation ticket, it also requires Gatekeeper acceptance and marks `notarized: true`; otherwise the manifest explicitly records `false`.
6. Verify the updater signatures using the embedded key:

   ```sh
   cargo run --manifest-path src-tauri/Cargo.toml --example verify_update -- /path/to/update-artifact
   ```

   Run this for both the `.app.tar.gz` and `.exe`; each must have an adjacent `.sig`.
7. Create a draft release with the matching source commit and **all** files in `release-assets/`, then publish only when uploads and checks have completed:

   ```sh
   gh release create vVERSION release-assets/* --draft --target COMMIT --title 'Torrentory Client VERSION' --notes-file /path/to/notes.md
   gh release edit vVERSION --draft=false --latest
   ```

`latest.json` serves the curl installer; `updater.json` uses Tauri's `darwin-aarch64` and `windows-x86_64` platform keys and contains updater signatures and version-specific asset URLs. Keep the two manifests separate. `SHA256SUMS` covers every distributed file. Never publish a partial release.

## Installation

```sh
curl -fsSL https://github.com/xandertaylorx/Torrentory-Client/releases/latest/download/install.sh | /bin/bash
```

The macOS installer verifies SHA-256, the Developer ID publisher (`7XX5D66UT5`) and bundle identifier, and the version. It installs to `/Applications/Torrentory Client.app`. Administrator permission is requested only if that folder is not writable; network downloads and signature checks happen without elevation. A verified duplicate from the earlier `~/Applications` installer is moved to Trash after successful installation. Quit a running client before reinstalling.

For test installs, use `TORRENTORY_INSTALL_DIR=/absolute/writable/path /bin/bash scripts/install.sh`. Use `--check` to download and verify without installing. The installer never removes quarantine or disables Gatekeeper. A build without notarisation can still trigger a macOS warning, especially when downloaded in a browser.

## In-app updates

Version 0.1.8 checks once on launch and shows **Update and restart** when a newer release exists. Download progress is displayed; Tauri verifies the update signature before replacing the app and restarting. Active transfers briefly pause across the restart. Offline launch failures do not interrupt the app; **Check for updates** allows manual retry. Installation failures leave a retry action, and a failed restart can be retried without reinstalling.

The original 0.1.7 build has no updater, so those users must install 0.1.8 once. Subsequent versions use the in-app flow. On locked-down machines macOS may require its standard administrator prompt to replace an application in `/Applications`.
