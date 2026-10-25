# Distribution

The desktop client lives at the repository root; the standalone website lives in `web/`. The original torrent catalogue is not included.

## Current release

The initial website/installer update reuses the original v0.1.7 binaries from this repository. Their desktop source is commit `02fafd98d615cf8149b2803f63889d1593e35322`. The macOS DMG has a valid stapled notarisation ticket and its application is signed by **Developer ID Application: Xander Taylor (7XX5D66UT5)**. The Windows build is unsigned.

The original asset names remain available for existing users. Added stable aliases are byte-for-byte copies:

- `Torrentory-Client-macos-arm64.dmg`
- `Torrentory-Client-windows-x64.exe`

`latest.json`, `SHA256SUMS` and `install.sh` are also attached to the release. Installers always use a version-specific DMG URL after reading `latest.json`, so a newly published release cannot change the download halfway through an install.

## Prepare another release

1. Update the version in `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json`, and `web/package.json` / `web/package-lock.json`. Update the website's fallback version in `web/src/main.tsx`.
2. Run desktop checks and `npm ci --prefix web && npm run build --prefix web`.
3. Build a macOS Apple Silicon DMG with your Developer ID identity and Apple notarisation credentials using Tauri's [macOS signing instructions](https://v2.tauri.app/distribute/sign/macos/). Never commit credentials or certificates. The existing Developer ID team is `7XX5D66UT5`.
4. Build a Windows x64 NSIS installer on Windows (`npm ci && npm run tauri -- build --bundles nsis`), or run the manual **Build Windows installer** workflow and download its artifact. Smoke-test the result on Windows.
5. On macOS, prepare the release directory:

   ```sh
   node scripts/prepare-release.mjs /absolute/path/to/client.dmg /absolute/path/to/setup.exe
   ```

   Preparation rejects a DMG unless its notarisation ticket, publisher signature, Gatekeeper assessment and app version pass. It generates stable filenames, `latest.json`, `SHA256SUMS` and a copy of the installer. The Windows binary must be supplied from the corresponding version's build.
6. Commit and push the matching source. Create a **draft** release with all files in `release-assets/`, review it, then publish it. For example:

   ```sh
   gh release create vVERSION release-assets/* --draft --title 'Torrentory Client VERSION' --notes-file /path/to/release-notes.md
   gh release edit vVERSION --draft=false --latest
   ```

   Substitute the actual version. Do not publish a release before all its assets are uploaded. GitHub's `/releases/latest/download/` links follow the latest published stable release; tags and assets must agree.

## macOS installer

The recommended command is:

```sh
curl -fsSL https://github.com/xandertaylorx/Torrentory-Client/releases/latest/download/install.sh | /bin/bash
```

The installer requires macOS 12+ on Apple Silicon, verifies SHA-256, pins the Apple developer team and bundle identifier, and requires Gatekeeper to accept the application. It installs to `~/Applications/Torrentory Client.app` without sudo. Quit the running client before an update. To choose another writable absolute directory, run a downloaded script with `TORRENTORY_INSTALL_DIR=/path/to/Applications /bin/bash install.sh`.

For a verification-only run without installing:

```sh
/bin/bash scripts/install.sh --check
```

The installer does not remove quarantine, disable Gatekeeper, or automatically launch the application. macOS can still show its normal first-launch confirmation. Direct DMG installation uses the same signed, notarised build. Signing and notarisation—not curl alone—provide Apple's trusted distribution checks: [Apple's guidance](https://support.apple.com/en-us/102445).

The checksum detects corruption and mismatched assets; the publisher signature independently checks the macOS signing identity. The installer script and release metadata still depend on trusting this GitHub repository and its maintainers.
