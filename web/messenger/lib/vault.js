// The vault: chats someone chose to keep, saved in this browser's IndexedDB and encrypted with
// a passphrase only they know (scrypt -> AES-256-GCM). Nothing is ever sent anywhere.
// Records:  meta        { v, salt, check, profile }   profile = { id, name, avatar } (encrypted)
//           chat:<id>   { iv, ct }                     a whole chat snapshot (encrypted)
// While unlocked, the derived key is kept in this tab's sessionStorage so a refresh doesn't ask
// again; closing the tab (or Lock) forgets it.
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { b64u, unb64u, utf8, fromUtf8, rand } from './crypto.js';

const DB = 'torrentory-messenger';
const STORE = 'vault';
const KEY_SLOT = 'torrentory.messenger.vk';
let key = null;

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { d.close(); resolve(out?.result); };
    t.onerror = () => { d.close(); reject(t.error); };
  });
}
const get = (k) => tx('readonly', (s) => s.get(k));
const put = (k, v) => tx('readwrite', (s) => s.put(v, k));
const del = (k) => tx('readwrite', (s) => s.delete(k));
const keys = () => tx('readonly', (s) => s.getAllKeys());

async function importKey(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function seal(obj) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(JSON.stringify(obj))));
  return { iv: b64u(iv), ct: b64u(ct) };
}
async function open(rec, k = key) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(rec.iv) }, k, unb64u(rec.ct));
  return JSON.parse(fromUtf8(new Uint8Array(pt)));
}
const derive = (pass, salt) => scryptAsync(utf8(pass.normalize('NFKC')), salt, { N: 2 ** 16, r: 8, p: 1, dkLen: 32 });

export async function hasVault() { try { return !!(await get('meta')); } catch { return false; } }
export const isUnlocked = () => !!key;

export async function createVault(pass, profile) {
  const salt = rand(16);
  const raw = await derive(pass, salt);
  key = await importKey(raw);
  sessionStorage.setItem(KEY_SLOT, b64u(raw));
  await put('meta', { v: 1, salt: b64u(salt), check: await seal('ok'), profile: await seal(profile) });
}

export async function unlockVault(pass) {
  const meta = await get('meta');
  if (!meta) throw new Error('No saved chats on this device');
  const raw = await derive(pass, unb64u(meta.salt));
  const k = await importKey(raw);
  try { if ((await open(meta.check, k)) !== 'ok') throw 0; } catch { throw new Error('Wrong passphrase'); }
  key = k;
  sessionStorage.setItem(KEY_SLOT, b64u(raw));
  return readAll(meta);
}

// a refresh in a tab that already unlocked: reuse the key from sessionStorage
export async function resumeVault() {
  const raw = sessionStorage.getItem(KEY_SLOT);
  const meta = raw && (await get('meta').catch(() => null));
  if (!meta) return null;
  try {
    const k = await importKey(unb64u(raw));
    if ((await open(meta.check, k)) !== 'ok') return null;
    key = k;
    return readAll(meta);
  } catch { return null; }
}

async function readAll(meta) {
  const profile = await open(meta.profile);
  const chats = [];
  for (const k of await keys()) if (String(k).startsWith('chat:')) { try { chats.push(await open(await get(k))); } catch {} }
  return { profile, chats };
}

export async function saveProfile(profile) {
  if (!key) return;
  const meta = await get('meta');
  if (meta) await put('meta', { ...meta, profile: await seal(profile) });
}
export async function saveChat(snapshot) { if (key) await put('chat:' + snapshot.id, await seal(snapshot)); }
export async function forgetChat(id) { await del('chat:' + id).catch(() => {}); }

export function lockVault() { key = null; sessionStorage.removeItem(KEY_SLOT); }
export async function deleteVault() {
  lockVault();
  await new Promise((resolve) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => resolve(); });
}
