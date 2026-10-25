#!/bin/bash
# Torrentory Client — signed, notarised macOS installer. No sudo or quarantine removal.
set -euo pipefail

fail() { printf 'Torrentory: %s\n' "$*" >&2; exit 1; }
check_only=false
case "${1:-}" in
  "") ;;
  --check) check_only=true ;;
  *) fail "Usage: install.sh [--check]" ;;
esac
[ "$(uname -s)" = Darwin ] || fail "This installer requires macOS. Windows: https://github.com/xandertaylorx/Torrentory-Client/releases/latest"
[ "$(uname -m)" = arm64 ] || fail "This release requires an Apple Silicon Mac. Intel Macs are not currently packaged."
os_major=$(/usr/bin/sw_vers -productVersion | /usr/bin/cut -d. -f1)
[ "$os_major" -ge 12 ] || fail "macOS 12 or newer is required."

repo='https://github.com/xandertaylorx/Torrentory-Client'
work_dir=$(/usr/bin/mktemp -d)
mounted=false
staged_app=''
backup_app=''
destination=''
stage_dir=''
cleanup() {
  if [ "$mounted" = true ]; then /usr/bin/hdiutil detach "$work_dir/volume" -quiet || true; fi
  if [ -n "$staged_app" ] && [ -d "$staged_app" ]; then /bin/rm -rf "$staged_app"; fi
  if [ -n "$backup_app" ] && [ -d "$backup_app" ]; then
    if [ ! -e "$destination" ]; then /bin/mv "$backup_app" "$destination"; else /bin/rm -rf "$backup_app"; fi
  fi
  if [ -n "$stage_dir" ] && [ -d "$stage_dir" ]; then /bin/rmdir "$stage_dir" 2>/dev/null || true; fi
  /bin/rm -rf "$work_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
fetch() { /usr/bin/curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --retry 3 --connect-timeout 15 "$1" -o "$2"; }
printf 'Fetching the latest Torrentory Client release…\n'
fetch "$repo/releases/latest/download/latest.json" "$work_dir/latest.json"
version=$(/usr/bin/plutil -extract version raw -o - "$work_dir/latest.json")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Invalid release version."
expected=$(/usr/bin/plutil -extract platforms.macos-arm64.sha256 raw -o - "$work_dir/latest.json")
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || fail "Invalid release checksum."
notarized=$(/usr/bin/plutil -extract platforms.macos-arm64.notarized raw -o - "$work_dir/latest.json")
[ "$notarized" = true ] || fail "This release is not marked notarised. Download and inspect it manually."
fetch "$repo/releases/download/v$version/Torrentory-Client-macos-arm64.dmg" "$work_dir/client.dmg"
printf '%s  %s\n' "$expected" "$work_dir/client.dmg" | /usr/bin/shasum -a 256 -c - || fail "Checksum verification failed."
/usr/bin/hdiutil attach -readonly -nobrowse -quiet -mountpoint "$work_dir/volume" "$work_dir/client.dmg"
mounted=true
source_app="$work_dir/volume/Torrentory Client.app"
[ -d "$source_app" ] || fail "The download does not contain Torrentory Client."
bundle_version=$(/usr/bin/plutil -extract CFBundleShortVersionString raw -o - "$source_app/Contents/Info.plist")
[ "$bundle_version" = "$version" ] || fail "The application version does not match the release."
# Pin the publisher identity, not just the presence of any valid signature.
/usr/bin/codesign --verify --deep --strict -R '=identifier "com.torrentory.client" and anchor apple generic and certificate leaf[subject.OU] = "7XX5D66UT5"' "$source_app" || fail "Apple signature verification failed."
/usr/sbin/spctl --assess --type execute "$source_app" || fail "Gatekeeper did not accept this release. No security settings were changed."
printf 'Verified Torrentory Client %s (checksum, publisher signature, and Gatekeeper).\n' "$version"
if [ "$check_only" = true ]; then exit 0; fi
if /usr/bin/pgrep -x torrentory-client >/dev/null; then fail "Quit Torrentory Client and run the installer again."; fi
install_dir="${TORRENTORY_INSTALL_DIR:-$HOME/Applications}"
[[ "$install_dir" = /* ]] || fail "TORRENTORY_INSTALL_DIR must be an absolute path."
/bin/mkdir -p "$install_dir"
destination="$install_dir/Torrentory Client.app"
[ ! -L "$destination" ] || fail "Refusing to replace an application symlink."
if [ -e "$destination" ]; then
  [ -d "$destination" ] || fail "An unexpected file exists at $destination."
  existing_id=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$destination/Contents/Info.plist")
  [ "$existing_id" = com.torrentory.client ] || fail "Refusing to replace a different application."
fi
stage_dir=$(/usr/bin/mktemp -d "$install_dir/.torrentory-install.XXXXXX")
staged_app="$stage_dir/Torrentory Client.app"
# ditto preserves the signed application bundle.
/usr/bin/ditto "$source_app" "$staged_app"
/usr/bin/codesign --verify --deep --strict "$staged_app"
if [ -d "$destination" ]; then backup_app="$stage_dir/previous.app"; /bin/mv "$destination" "$backup_app"; fi
/bin/mv "$staged_app" "$destination"
staged_app=''
if [ -n "$backup_app" ]; then /bin/rm -rf "$backup_app"; backup_app=''; fi
/bin/rmdir "$stage_dir"
printf 'Installed to %s\nOpen Torrentory Client from Finder when you are ready.\n' "$destination"
