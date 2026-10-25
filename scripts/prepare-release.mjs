// Prepare a release from a signed/notarised DMG and a Windows x64 installer.
// Usage: node scripts/prepare-release.mjs /path/to/client.dmg /path/to/setup.exe
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [dmgArg, exeArg] = process.argv.slice(2);
if (!dmgArg || !exeArg) throw new Error('Usage: node scripts/prepare-release.mjs /path/to/client.dmg /path/to/setup.exe');
const dmg = resolve(dmgArg), exe = resolve(exeArg);
if (!existsSync(dmg) || !existsSync(exe)) throw new Error('Both installer files must exist.');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a stable semantic version.');
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' });
const work = mkdtempSync(join(tmpdir(), 'torrentory-verify-'));
const mount = join(work, 'volume');
let mounted = false;
try {
  run('/usr/bin/xcrun', ['stapler', 'validate', dmg]);
  run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-quiet', '-mountpoint', mount, dmg]);
  mounted = true;
  const app = join(mount, 'Torrentory Client.app');
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '-R', '=identifier "com.torrentory.client" and anchor apple generic and certificate leaf[subject.OU] = "7XX5D66UT5"', app]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', app]);
  const bundledVersion = run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(app, 'Contents/Info.plist')]).trim();
  if (bundledVersion !== version) throw new Error(`DMG version ${bundledVersion} does not match source ${version}.`);
} finally {
  if (mounted) run('/usr/bin/hdiutil', ['detach', '-quiet', mount]);
  rmSync(work, { recursive: true, force: true });
}
const out = join(root, 'release-assets');
mkdirSync(out, { recursive: true });
const repo = 'https://github.com/xandertaylorx/Torrentory-Client';
const assets = [
  [dmg, 'Torrentory-Client-macos-arm64.dmg'],
  [exe, 'Torrentory-Client-windows-x64.exe'],
  [join(root, 'scripts/install.sh'), 'install.sh'],
];
for (const [source, name] of assets) copyFileSync(source, join(out, name));
const sha256 = name => createHash('sha256').update(readFileSync(join(out, name))).digest('hex');
const platform = (name, minimum, extra) => ({ minimum_os_version: minimum, file_name: name, download_url: `${repo}/releases/download/v${version}/${name}`, size_bytes: statSync(join(out, name)).size, sha256: sha256(name), ...extra });
const manifest = {
  version,
  platforms: {
    'macos-arm64': platform(assets[0][1], '12.0', { signed: true, notarized: true }),
    'windows-x64': platform(assets[1][1], '10', { signed: false }),
  },
};
writeFileSync(join(out, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
const names = [...assets.map(([, name]) => name), 'latest.json'];
writeFileSync(join(out, 'SHA256SUMS'), names.map(name => `${sha256(name)}  ${name}\n`).join(''));
console.log(`Verified macOS publisher, Gatekeeper and notarisation; prepared v${version} assets in ${out}`);
