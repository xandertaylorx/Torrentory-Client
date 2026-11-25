// Torrentory Messenger crypto. Every packet is wrapped in layers, innermost first:
//
//   1. Ed25519 signature on every chat message by its author (survives relaying / history sync)
//   2. XChaCha20-Poly1305 with a per-pair, per-message key from a symmetric ratchet seeded by
//      an ephemeral X25519 exchange (fresh keys each join -> forward secrecy, old keys are deleted)
//   3. Length padding (hides message sizes) + AES-256-GCM with the room key from the invite link
//   4. WebRTC DTLS on the peer-to-peer channel; signaling is AES-GCM encrypted with a separate
//      key from the same link before it touches any public relay
//
// The room secret only ever lives in the URL fragment (#...), which browsers never send to a server.

import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';

const te = new TextEncoder();
const td = new TextDecoder();
export const utf8 = (s) => te.encode(s);
export const fromUtf8 = (b) => td.decode(b);
export const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export const b64u = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
export const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const cmp = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const readU32 = (b, o = 0) => new DataView(b.buffer, b.byteOffset + o, 4).getUint32(0);

// ---------- room (from the invite link) ----------
export const newRoomSecret = () => b64u(rand(32));

export async function deriveRoom(secretB64) {
  const secret = unb64u(secretB64);
  if (secret.length < 16) throw new Error('bad room link');
  const k = (info, n = 32) => hkdf(sha512, secret, utf8('crooli-messenger/v1'), utf8(info), n);
  const roomKeyBytes = k('room-layer');
  const roomKey = await crypto.subtle.importKey('raw', roomKeyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {
    roomId: hex(k('room-id', 20)),              // what relays see: a hash, not the secret
    signalPassword: b64u(k('signal-layer')),     // trystero encrypts SDP/ICE with this
    roomKey,
    pairSalt: k('pair-salt'),
  };
}

// ---------- identity (lives in sessionStorage only, gone when the tab closes) ----------
export function newIdentity() {
  const sk = ed25519.utils.randomSecretKey();
  return { sk: b64u(sk) };
}
export function loadIdentity(stored) {
  const sk = unb64u(stored.sk);
  const pk = ed25519.getPublicKey(sk);
  return { sk, pk, pkB64: b64u(pk), mid: midFromPk(pk) };
}
export const midFromPk = (pk) => hex(sha256(pk)).slice(0, 24);

export const sign = (sk, bytes) => ed25519.sign(bytes, sk);
export const verify = (sig, bytes, pk) => { try { return ed25519.verify(sig, bytes, pk); } catch { return false; } };

// ---------- layer 3: room AES-256-GCM + padding ----------
function pad(bytes) {
  // 4-byte length, then random filler up to a bucket so sizes leak little
  const n = bytes.length + 4;
  const bucket = n <= 256 ? 256 : n <= 1024 ? 1024 : n <= 4096 ? 4096 : Math.ceil(n / 16384) * 16384;
  const out = new Uint8Array(bucket);
  out.set(u32(bytes.length), 0);
  out.set(bytes, 4);
  if (bucket - n <= 65536) out.set(rand(bucket - n), n);
  return out;
}
const unpad = (b) => b.subarray(4, 4 + readU32(b));

export async function sealRoom(roomKey, inner) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: utf8('crooli/room') }, roomKey, pad(inner)));
  return concat(new Uint8Array([1]), iv, ct);
}
export async function openRoom(roomKey, frame) {
  if (frame[0] !== 1) throw new Error('unknown frame version');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: frame.subarray(1, 13), additionalData: utf8('crooli/room') }, roomKey, frame.subarray(13));
  return unpad(new Uint8Array(pt));
}

// ---------- layer 2: pairwise ratchet ----------
export function newEphemeral() {
  const sk = x25519.utils.randomSecretKey();
  return { sk, pk: x25519.getPublicKey(sk) };
}

export class PairSession {
  constructor(myEph, theirEphPk, pairSalt) {
    const shared = x25519.getSharedSecret(myEph.sk, theirEphPk);
    const meFirst = cmp(myEph.pk, theirEphPk) < 0;
    const [lo, hi] = meFirst ? [myEph.pk, theirEphPk] : [theirEphPk, myEph.pk];
    const okm = hkdf(sha256, shared, pairSalt, concat(utf8('crooli/pair/v1'), lo, hi), 64);
    this.sendCk = meFirst ? okm.slice(0, 32) : okm.slice(32);
    this.recvCk = meFirst ? okm.slice(32) : okm.slice(0, 32);
    this.sendN = 0;
    this.recvN = 0;
    this.skipped = new Map();
    shared.fill(0);
    okm.fill(0);
  }
  static step(ck) {
    const mk = hmac(sha256, ck, new Uint8Array([1]));
    const next = hmac(sha256, ck, new Uint8Array([2]));
    ck.fill(0);
    return [mk, next];
  }
  seal(plain) {
    const n = this.sendN++;
    const [mk, next] = PairSession.step(this.sendCk);
    this.sendCk = next;
    const nonce = rand(24);
    const header = concat(new Uint8Array([2]), u32(n));
    const ct = xchacha20poly1305(mk, nonce, header).encrypt(plain);
    mk.fill(0);
    return concat(header, nonce, ct);
  }
  open(packet) {
    const header = packet.subarray(0, 5);
    const n = readU32(packet, 1);
    const nonce = packet.subarray(5, 29);
    const ct = packet.subarray(29);
    let mk;
    if (n < this.recvN) {
      mk = this.skipped.get(n);
      if (!mk) throw new Error('replayed or expired message');
      this.skipped.delete(n);
    } else {
      if (n - this.recvN > 4000) throw new Error('too far ahead');
      while (this.recvN < n) {
        const [skip, next] = PairSession.step(this.recvCk);
        this.recvCk = next;
        this.skipped.set(this.recvN++, skip);
      }
      const [k, next] = PairSession.step(this.recvCk);
      this.recvCk = next;
      this.recvN++;
      mk = k;
    }
    const pt = xchacha20poly1305(mk, nonce, header).decrypt(ct);
    mk.fill(0);
    return pt;
  }
  destroy() {
    this.sendCk.fill(0);
    this.recvCk.fill(0);
    for (const k of this.skipped.values()) k.fill(0);
    this.skipped.clear();
  }
}

// ---------- payload: JSON + optional binary ----------
export function packPayload(obj, bin) {
  const j = utf8(JSON.stringify(obj));
  return concat(u32(j.length), j, bin || new Uint8Array(0));
}
export function unpackPayload(bytes) {
  const n = readU32(bytes);
  const obj = JSON.parse(fromUtf8(bytes.subarray(4, 4 + n)));
  const bin = bytes.length > 4 + n ? bytes.slice(4 + n) : null;
  return [obj, bin];
}

// ---------- layer 1: message signatures ----------
export function messageSigBytes(m, bin) {
  const binHash = bin ? hex(sha256(bin)) : '';
  return utf8(JSON.stringify(['crooli/msg/v1', m.id, m.ts, m.kind, m.text || '', m.mime || '', m.blur ? 1 : 0, m.dur || 0, m.reply || '', m.wave || [], binHash, m.mid, m.tx || '']));
}

// ---------- safety numbers ----------
const EMOJI = ['🍎','🍋','🍇','🍑','🥝','🍒','🥥','🌽','🥕','🍄','🌵','🌻','🌙','⭐','⚡','🔥','🌊','❄️','🌈','☂️','🎈','🎲','🎧','🎸','🚀','⛵','🚲','🏔️','🐙','🦊','🐼','🦉','🐝','🐢','🐳','🦋','🐸','🦄','🐧','🦒','🔑','💎','🧭','⏳','📎','🧩','🪐','🎯'];
export function safetyCode(pkA, pkB) {
  const [lo, hi] = cmp(pkA, pkB) < 0 ? [pkA, pkB] : [pkB, pkA];
  const h = sha512(concat(utf8('crooli/safety/v1'), lo, hi));
  const digits = [];
  for (let i = 0; i < 6; i++) digits.push(String(readU32(h, i * 4) % 100000).padStart(5, '0'));
  const emoji = Array.from(h.subarray(24, 30), (b) => EMOJI[b % EMOJI.length]);
  return { digits, emoji };
}

// local id for a chat (never sent anywhere)
export const chatIdOf = (secret) => hex(sha256(utf8('chat-id:' + secret))).slice(0, 16);
