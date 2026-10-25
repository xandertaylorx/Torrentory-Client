#!/bin/bash
# Torrentory Client — Developer ID signed macOS installer. Installs to /Applications without changing quarantine or Gatekeeper.
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
installer_privileges=()
run_install() { "${installer_privileges[@]}" "$@"; }
cleanup() {
  if [ "$mounted" = true ]; then /usr/bin/hdiutil detach "$work_dir/volume" -quiet || true; fi
  if [ -n "$staged_app" ] && [ -d "$staged_app" ]; then run_install /bin/rm -rf "$staged_app"; fi
  if [ -n "$backup_app" ] && [ -d "$backup_app" ]; then
    if [ ! -e "$destination" ]; then run_install /bin/mv "$backup_app" "$destination"; else run_install /bin/rm -rf "$backup_app"; fi
  fi
  if [ -n "$stage_dir" ] && [ -d "$stage_dir" ]; then run_install /bin/rmdir "$stage_dir" 2>/dev/null || true; fi
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
[[ "$notarized" = true || "$notarized" = false ]] || fail "Invalid notarisation metadata."
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
if [ "$notarized" = true ]; then
  /usr/sbin/spctl --assess --type execute "$source_app" || fail "Gatekeeper did not accept this notarised release."
fi
printf 'Verified Torrentory Client %s (checksum and Apple publisher signature).\n' "$version"
if [ "$check_only" = true ]; then exit 0; fi
if /usr/bin/pgrep -x torrentory-client >/dev/null; then fail "Quit Torrentory Client and run the installer again."; fi
install_dir="${TORRENTORY_INSTALL_DIR:-/Applications}"
[[ "$install_dir" = /* ]] || fail "TORRENTORY_INSTALL_DIR must be an absolute path."
if [ ! -d "$install_dir" ]; then /bin/mkdir -p "$install_dir" || fail "Could not create $install_dir."; fi
if [ ! -w "$install_dir" ]; then
  printf 'macOS requires administrator permission to install in %s.\n' "$install_dir"
  /usr/bin/sudo -v </dev/tty || fail "Administrator permission is required to install in $install_dir."
  installer_privileges=(/usr/bin/sudo)
fi
destination="$install_dir/Torrentory Client.app"
[ ! -L "$destination" ] || fail "Refusing to replace an application symlink."
if [ -e "$destination" ]; then
  [ -d "$destination" ] || fail "An unexpected file exists at $destination."
  existing_id=$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "$destination/Contents/Info.plist")
  [ "$existing_id" = com.torrentory.client ] || fail "Refusing to replace a different application."
fi
stage_dir=$(run_install /usr/bin/mktemp -d "$install_dir/.torrentory-install.XXXXXX")
staged_app="$stage_dir/Torrentory Client.app"
# ditto preserves the signed application bundle.
run_install /usr/bin/ditto "$source_app" "$staged_app"
run_install /usr/sbin/chown -R "$(/usr/bin/id -u):$(/usr/bin/id -g)" "$stage_dir"
/usr/bin/codesign --verify --deep --strict "$staged_app"
if [ -d "$destination" ]; then backup_app="$stage_dir/previous.app"; run_install /bin/mv "$destination" "$backup_app"; fi
run_install /bin/mv "$staged_app" "$destination"
staged_app=''
if [ -n "$backup_app" ]; then run_install /bin/rm -rf "$backup_app"; backup_app=''; fi
run_install /bin/rmdir "$stage_dir"
# Retire the old per-user installation so Finder cannot keep launching that copy.
legacy_app="$HOME/Applications/Torrentory Client.app"
if [ "$install_dir" = /Applications ] && [ -d "$legacy_app" ] && [ ! -L "$legacy_app" ]; then
  if /usr/bin/codesign --verify --deep --strict -R '=identifier "com.torrentory.client" and anchor apple generic and certificate leaf[subject.OU] = "7XX5D66UT5"' "$legacy_app" 2>/dev/null; then
    /bin/mkdir -p "$HOME/.Trash"
    legacy_backup="$HOME/.Trash/Torrentory Client (previous $(/bin/date +%s)-$$).app"
    /bin/mv "$legacy_app" "$legacy_backup" || printf 'Could not move the old ~/Applications copy to Trash. You can remove that duplicate in Finder.\n' >&2
  fi
fi
register='/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister'
if [ -x "$register" ]; then "$register" -f "$destination" || true; fi
printf 'Installed to %s\nOpen Torrentory Client from Applications when you are ready.\n' "$destination"
