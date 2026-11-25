// The network engine. Every chat is its own serverless WebRTC room with its own keys and peers;
// all of them stay connected at once. Nothing touches disk except sessionStorage (profile,
// identity key and the list of chat keys), which the browser wipes when the tab closes.
import { joinRoom } from 'trystero';
import {
  b64u, unb64u, utf8, concat, rand, deriveRoom, loadIdentity, newIdentity, midFromPk, sign, verify, fromUtf8,
  sealRoom, openRoom, newEphemeral, PairSession, packPayload, unpackPayload, messageSigBytes, safetyCode, chatIdOf,
} from './crypto.js';
import { getState, setState, subscribe, updateChat, updateMember, updateMessage, bumpChat, newChat, toast } from './store.js';
import { ring, ringback, stopTones, blip } from './tones.js';
import { saveChat, forgetChat, deleteVault, isUnlocked, saveProfile } from './vault.js';
import { TunedPeerConnection, AUDIO_CONSTRAINTS, CAMERA_CONSTRAINTS, SCREEN_CONSTRAINTS, setCallSize, readStats } from './rtc.js';

export const APP_ID = 'torrentory-messenger-v1';
const SESSION_KEY = 'torrentory.messenger.session';

export const BOT = new URLSearchParams(location.search).has('bot');
const mem = new Map();
const store = BOT ? { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), clear: () => mem.clear() } : sessionStorage;
export const events = new EventTarget(); // 'message', 'peer', 'stream': used by the test bot

let ident = null;          // { sk, pk, pkB64, mid }
const conns = new Map();   // chat id -> { room, action, keys, eph, peers, bins, chains, seenSent }
let local = { audio: null, cam: null, screen: null };

// ---------- session (sessionStorage only) ----------
export function loadSession() {
  try { const raw = store.getItem(SESSION_KEY); if (raw) return JSON.parse(raw); } catch {}
  return null;
}
export function saveSession(patch) {
  const cur = loadSession() || { id: newIdentity(), chats: [] };
  const next = { ...cur, ...(typeof patch === 'function' ? patch(cur) : patch) };
  store.setItem(SESSION_KEY, JSON.stringify(next));
  return next;
}
export function ensureIdentity() {
  const s = saveSession({});
  ident = loadIdentity(s.id);
  return s;
}
export const myMid = () => ident?.mid;

// called once a name is picked: open the app and reconnect every chat from this tab's session,
// plus any chats restored from the vault (with their saved history)
export async function startApp({ saved = [] } = {}) {
  const s = ensureIdentity();
  const me = { mid: ident.mid, name: s.name, avatar: s.avatar, pkB64: ident.pkB64 };
  setState({ phase: 'app', me });
  for (const snap of saved) await openChat({ secret: snap.secret, name: snap.name }, { focus: false, saved: snap });
  for (const c of s.chats || []) await openChat(c, { focus: false });
  setState((st) => ({ order: [...st.order].sort((a, b) => (st.chats[b]?.lastTs || 0) - (st.chats[a]?.lastTs || 0)) }));
  if (!getState().active && getState().order.length) setActive(getState().order[0]);
  window.addEventListener('focus', () => markSeen());
  document.addEventListener('visibilitychange', () => markSeen());
}

export const linkFor = (secret, name) => `${location.origin}${location.pathname}#${secret}${name ? '.' + b64u(utf8(name)) : ''}`;

export async function openChat({ secret, name }, { focus = true, saved = null, ephemeral = false, test = false } = {}) {
  const id = chatIdOf(secret);
  if (conns.has(id)) { if (focus) setActive(id); return id; }
  const keys = await deriveRoom(secret);
  const chat = { ...newChat(id, secret, name), link: linkFor(secret, name) };
  const bins = new Map();
  if (saved) restoreSnapshot(chat, saved, bins);
  chat.members[ident.mid] = { ...getState().me, online: true, self: true, peerIds: [], joinedAt: Date.now() };
  setState((s) => ({ chats: { ...s.chats, [id]: chat }, order: s.order.includes(id) ? s.order : [id, ...s.order] }));
  if (test) chat.test = true;
  // test chats aren't remembered: a refresh makes a fresh one with a fresh bot
  if (!ephemeral && !test) saveSession((cur) => ({ chats: [...(cur.chats || []).filter((c) => c.secret !== secret), { secret, name: name || '' }] }));

  const room = joinRoom({ appId: APP_ID, password: keys.signalPassword, identity: 'none', maxReceiveBytes: 96 * 1024 * 1024, rtcPolyfill: TunedPeerConnection }, keys.roomId);
  const action = room.makeAction('x');
  const c = { id, room, action, keys, eph: newEphemeral(), peers: new Map(), bins, chains: new Map(), seenSent: 0 };
  conns.set(id, c);

  room.ready?.then(() => updateChat(id, (x) => (x.net === 'connecting' ? { net: 'online' } : {}))).catch(() => updateChat(id, { net: 'error' }));
  setTimeout(() => updateChat(id, (x) => (x.net === 'connecting' ? { net: 'online' } : {})), 2500);
  room.onPeerJoin(({ peerId }) => sendHello(c, peerId));
  room.onPeerLeave(({ peerId }) => dropPeer(c, peerId));
  action.onMessage((data, { peerId }) => onFrame(c, toBytes(data), peerId));
  action.onReceiveProgress((pct, { peerId, metadata }) => {
    if (!metadata?.big) return;
    updateChat(id, (x) => ({ incoming: { ...x.incoming, [peerId]: pct >= 1 ? undefined : pct } }));
  });
  room.onPeerStream((stream, { peerId, metadata }) => onRemoteStream(c, stream, peerId, metadata));
  room.onError((e) => {
    if (e.code === 'peer-connect-failed') toast('Could not reach someone directly (strict network). They may need another Wi-Fi.', 'warn', 7000);
  });
  if (focus) setActive(id);
  return id;
}

export function setActive(id) {
  setState({ active: id, sheet: null });
  updateChat(id, { unread: 0 });
  const chat = getState().chats[id];
  if (chat) history.replaceState(null, '', location.pathname);
  markSeen(id);
}

export async function leaveChat(id = getState().active) {
  const c = conns.get(id);
  if (!c) return;
  if (getState().call?.chat === id) await leaveCall();
  try { await c.room.leave(); } catch {}
  for (const p of c.peers.values()) p.pair?.destroy();
  for (const m of getState().chats[id]?.messages || []) if (m.url) URL.revokeObjectURL(m.url);
  conns.delete(id);
  const secret = getState().chats[id]?.secret;
  if (getState().chats[id]?.kept) forgetChat(id);
  saveSession((cur) => ({ chats: (cur.chats || []).filter((x) => x.secret !== secret) }));
  setState((s) => {
    const chats = { ...s.chats };
    delete chats[id];
    const order = s.order.filter((x) => x !== id);
    const codes = { ...s.codes };
    delete codes[id];
    return { chats, order, codes, active: s.active === id ? order[0] || null : s.active, sheet: null };
  });
}

export async function burnAll() {
  for (const id of [...conns.keys()]) await leaveChat(id);
  await deleteVault();
  store.clear();
  location.replace(location.pathname);
}

// ---------- wire ----------
const toBytes = (d) => (d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(0));
const helloSigBytes = (c, b) => utf8(JSON.stringify(['torrentory/hello/v1', c.keys.roomId, b.pk, b.eph, b.ts]));

async function sendHello(c, peerId) {
  const p = c.peers.get(peerId) || { queue: [] };
  c.peers.set(peerId, p);
  if (p.helloSent) return;
  p.helloSent = true;
  const body = { v: 1, pk: ident.pkB64, eph: b64u(c.eph.pk), ts: Date.now() };
  body.sig = b64u(sign(ident.sk, helloSigBytes(c, body)));
  await c.action.send(await sealRoom(c.keys.roomKey, concat(new Uint8Array([1]), utf8(JSON.stringify(body)))), { target: peerId });
}

// frames from one peer are processed strictly in arrival order (the hello must land before sealed packets)
function onFrame(c, frame, peerId) {
  const next = (c.chains.get(peerId) || Promise.resolve()).then(() => processFrame(c, frame, peerId)).catch(() => {});
  c.chains.set(peerId, next);
}

async function processFrame(c, frame, peerId) {
  if (!conns.has(c.id)) return;
  let inner;
  try { inner = await openRoom(c.keys.roomKey, frame); } catch { return; }
  if (inner[0] === 1) return onHello(c, JSON.parse(fromUtf8(inner.subarray(1))), peerId);
  if (inner[0] !== 2) return;
  const p = c.peers.get(peerId);
  if (!p?.pair) return;
  let obj, bin;
  try { [obj, bin] = unpackPayload(p.pair.open(inner)); } catch { return; }
  handle(c, obj, bin, peerId, p.mid);
}

async function onHello(c, body, peerId) {
  const pk = unb64u(body.pk);
  if (!verify(unb64u(body.sig), helloSigBytes(c, body), pk)) return;
  const mid = midFromPk(pk);
  if (mid === ident.mid) return;
  let p = c.peers.get(peerId);
  if (!p) { p = { queue: [] }; c.peers.set(peerId, p); }
  p.pair?.destroy();
  p.mid = mid;
  p.pair = new PairSession(c.eph, unb64u(body.eph), c.keys.pairSalt);
  await sendHello(c, peerId);

  const prev = getState().chats[c.id]?.members[mid];
  const peerIds = [...new Set([...(prev?.peerIds || []), peerId])];
  updateMember(c.id, mid, { pk: body.pk, online: true, peerIds, joinedAt: prev?.joinedAt || Date.now(), safety: safetyCode(ident.pk, pk), name: prev?.name || 'Someone' });

  for (const q of p.queue.splice(0)) await sendTo(c, peerId, q.obj, q.bin, q.opts);
  events.dispatchEvent(new CustomEvent('peer', { detail: { chatId: c.id, mid, peerId } }));
  const st = getState();
  const chat = st.chats[c.id];
  await sendTo(c, peerId, { t: 'profile', name: st.me.name, avatar: st.me.avatar });
  await sendTo(c, peerId, { t: 'room', name: chat.name, ts: chat.nameTs });
  if (chat.kept) await sendTo(c, peerId, { t: 'keep', on: true });
  if (chat.ttlTs) await sendTo(c, peerId, { t: 'ttl', v: chat.ttl || 0, ts: chat.ttlTs });
  for (const m of chat.messages.slice(-400)) if (!m.deleted && m.kind !== 'system') await sendTo(c, peerId, { ...wireMsg(m), h: 1 }, c.bins.get(m.id), { big: (c.bins.get(m.id)?.length || 0) > 200000 });
  if (st.call?.chat === c.id) await sendTo(c, peerId, { t: 'call', a: 'join', cid: st.call.cid, video: st.call.video, mic: st.call.mic, cam: st.call.cam, screen: st.call.screen, quiet: 1 });
}

async function sendTo(c, peerId, obj, bin, opts = {}) {
  const p = c.peers.get(peerId);
  if (!p?.pair) { p?.queue.push({ obj, bin, opts }); return; }
  const frame = await sealRoom(c.keys.roomKey, p.pair.seal(packPayload(obj, bin)));
  return c.action.send(frame, { target: peerId, metadata: opts.big ? { big: 1 } : undefined, onProgress: opts.onProgress });
}
async function broadcast(c, obj, bin, opts = {}) {
  if (!c) return 0;
  const ids = [...c.peers.entries()].filter(([, p]) => p.pair).map(([id]) => id);
  let done = 0;
  await Promise.all(ids.map((id) => sendTo(c, id, obj, bin, {
    ...opts,
    onProgress: opts.onProgress && ((pct) => opts.onProgress((done + pct) / ids.length)),
  }).then(() => { done++; }).catch(() => {})));
  return ids.length;
}
const conn = (id) => conns.get(id ?? getState().active);

function dropPeer(c, peerId) {
  const p = c.peers.get(peerId);
  c.peers.delete(peerId);
  c.chains.delete(peerId);
  p?.pair?.destroy();
  updateChat(c.id, (x) => ({ incoming: { ...x.incoming, [peerId]: undefined } }));
  if (!p?.mid) return;
  const m = getState().chats[c.id]?.members[p.mid];
  if (!m) return;
  const peerIds = m.peerIds.filter((x) => x !== peerId);
  updateMember(c.id, p.mid, { peerIds, online: peerIds.length > 0, typingUntil: 0 });
  if (!peerIds.length) removeFromCall(c.id, p.mid);
}

// ---------- incoming packets ----------
function handle(c, o, bin, peerId, mid) {
  const chat = getState().chats[c.id];
  if (!chat) return;
  switch (o.t) {
    case 'profile':
      updateMember(c.id, mid, { name: String(o.name || 'Someone').slice(0, 40), avatar: typeof o.avatar === 'string' && o.avatar.length < 300000 ? o.avatar : null });
      break;
    case 'room':
      if ((o.ts || 0) > (chat.nameTs || 0) && o.name) setChatNameLocal(c.id, String(o.name).slice(0, 60), o.ts);
      break;
    case 'msg': return onMsg(c, o, bin, mid);
    case 'react': {
      const m = chat.messages.find((x) => x.id === o.id);
      if (!m) return;
      const r = { ...(m.r || {}) };
      const list = new Set(r[o.e] || []);
      o.on ? list.add(mid) : list.delete(mid);
      if (list.size) r[o.e] = [...list]; else delete r[o.e];
      updateMessage(c.id, o.id, { r });
      break;
    }
    case 'del': {
      const m = chat.messages.find((x) => x.id === o.id);
      if (m && m.mid === mid) { if (m.url) URL.revokeObjectURL(m.url); c.bins.delete(m.id); updateMessage(c.id, o.id, { deleted: true, text: '', url: null }); }
      break;
    }
    case 'ttl': {
      const v = Number(o.v) || 0;
      if (!(o.ts > (chat.ttlTs || 0)) || !TTL_OPTIONS.some(([x]) => x === v)) break;
      updateChat(c.id, { ttl: v, ttlTs: o.ts });
      const who = chat.members[mid]?.name || 'Someone';
      systemLine(c.id, v ? `${who} set messages to disappear after ${ttlLabel(v)}` : `${who} turned off disappearing messages`, 'timer');
      break;
    }
    case 'keep': {
      const was = !!chat.keepers[mid];
      if (!!o.on === was) break;
      const keepers = { ...chat.keepers };
      if (o.on) keepers[mid] = true; else delete keepers[mid];
      updateChat(c.id, { keepers });
      const who = chat.members[mid]?.name || 'Someone';
      systemLine(c.id, o.on ? `${who} is keeping a copy of this chat on their device` : `${who} stopped keeping a copy`, o.on ? 'keep' : 'unkeep');
      if (o.on && getState().active !== c.id) toast(`${who} is keeping a copy of ${chat.name}`);
      break;
    }
    case 'typing': updateMember(c.id, mid, { typingUntil: Date.now() + 3800 }); break;
    case 'seen': updateMember(c.id, mid, { seenTs: Math.max(chat.members[mid]?.seenTs || 0, o.ts || 0) }); break;
    case 'call': return onCallPacket(c, o, peerId, mid);
  }
}

function onMsg(c, o, bin, fromMid) {
  const chat = getState().chats[c.id];
  if (chat.messages.some((m) => m.id === o.id)) {
    if (o.h && o.r) updateMessage(c.id, o.id, (m) => ({ r: { ...o.r, ...(m.r || {}) } }));
    return;
  }
  const pk = unb64u(o.pk || '');
  if (midFromPk(pk) !== o.mid || !verify(unb64u(o.sig || ''), messageSigBytes(o, bin), pk)) return;
  if (!o.h && o.mid !== fromMid) return;
  const m = {
    id: o.id, ts: Math.min(o.ts, Date.now() + 60000), mid: o.mid, kind: o.kind, text: o.text || '', mime: o.mime, blur: !!o.blur,
    dur: o.dur, wave: o.wave, reply: o.reply, name: o.name, r: o.r || {}, verified: true, w: o.w, hgt: o.hgt, tx: typeof o.tx === 'string' ? o.tx.slice(0, 8000) : undefined,
    pk: o.pk, sig: o.sig, // kept so this message can be passed on to people who join later
    fname: typeof o.fname === 'string' ? o.fname.slice(0, 200) : undefined,
    ttl: Number.isFinite(o.ttl) && o.ttl > 0 ? Math.min(o.ttl, 2592000) : undefined,

  };
  if (bin) {
    c.bins.set(m.id, bin);
    m.url = URL.createObjectURL(new Blob([bin], { type: o.mime || 'application/octet-stream' }));
    m.size = bin.length;
  }
  if (!chat.members[o.mid]) updateMember(c.id, o.mid, { name: o.name || 'Someone', online: false, peerIds: [], pk: o.pk, safety: safetyCode(ident.pk, pk) });
  if (m.ttl && m.ts + m.ttl * 1000 <= Date.now()) return; // already expired
  insertMessage(c.id, m, !o.h);
  if (!o.h) {
    events.dispatchEvent(new CustomEvent('message', { detail: { chatId: c.id, m } }));
    updateMember(c.id, o.mid, { typingUntil: 0 });
    const st = getState();
    if (st.active !== c.id || document.hidden) { updateChat(c.id, (x) => ({ unread: x.unread + 1 })); blip(); }
    markSeen(c.id);
  }
}

function insertMessage(id, m, bump) {
  updateChat(id, (c) => {
    const list = [...c.messages, m];
    list.sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1));
    return { messages: list, lastTs: Math.max(c.lastTs, m.ts) };
  });
  if (bump) bumpChat(id);
  else setState((s) => ({ order: [...s.order].sort((a, b) => (s.chats[b]?.lastTs || 0) - (s.chats[a]?.lastTs || 0)) }));
}

// ---------- outgoing (default: the open chat) ----------
const wireMsg = (m) => ({ t: 'msg', id: m.id, ts: m.ts, mid: m.mid, kind: m.kind, text: m.text, mime: m.mime, blur: m.blur, dur: m.dur, wave: m.wave, reply: m.reply, name: m.name, pk: m.pk, sig: m.sig, r: m.r, w: m.w, hgt: m.hgt, tx: m.tx, fname: m.fname, ttl: m.ttl });

export async function sendMessage({ kind = 'text', text = '', bin = null, mime, blur, dur, wave, reply, w, hgt, tx, fname }, chatId = getState().active) {
  const c = conn(chatId);
  if (!c) return;
  const ttl = getState().chats[chatId]?.ttl || undefined;
  const m = {
    id: b64u(rand(12)), ts: Date.now(), mid: ident.mid, kind, text, mime, blur: !!blur, dur, wave, reply, w, hgt, tx: tx || undefined, fname: fname || undefined, ttl,
    name: getState().me.name, pk: ident.pkB64, r: {}, verified: true, status: 'sending', progress: 0,
  };
  m.sig = b64u(sign(ident.sk, messageSigBytes(m, bin)));
  if (bin) {
    c.bins.set(m.id, bin);
    m.url = URL.createObjectURL(new Blob([bin], { type: mime }));
    m.size = bin.length;
  }
  insertMessage(chatId, m, true);
  const big = (bin?.length || 0) > 200000;
  let last = 0;
  const n = await broadcast(c, wireMsg(m), bin, {
    big,
    onProgress: big ? (p) => { if (p - last > 0.04 || p >= 1) { last = p; updateMessage(chatId, m.id, { progress: p }); } } : undefined,
  });
  updateMessage(chatId, m.id, { status: n ? 'sent' : 'local', progress: 1 });
  return m.id;
}

export function react(msgId, e) {
  const id = getState().active;
  const m = getState().chats[id]?.messages.find((x) => x.id === msgId);
  if (!m) return;
  const mine = (m.r?.[e] || []).includes(ident.mid);
  const r = { ...(m.r || {}) };
  const list = new Set(r[e] || []);
  mine ? list.delete(ident.mid) : list.add(ident.mid);
  if (list.size) r[e] = [...list]; else delete r[e];
  updateMessage(id, msgId, { r });
  broadcast(conn(id), { t: 'react', id: msgId, e, on: !mine });
}

export function deleteMessage(msgId) {
  const id = getState().active;
  const m = getState().chats[id]?.messages.find((x) => x.id === msgId);
  if (!m || m.mid !== ident.mid) return;
  if (m.url) URL.revokeObjectURL(m.url);
  conn(id)?.bins.delete(msgId);
  updateMessage(id, msgId, { deleted: true, text: '', url: null });
  broadcast(conn(id), { t: 'del', id: msgId });
}

let lastTyping = 0;
export function typing() {
  if (Date.now() - lastTyping < 2200) return;
  lastTyping = Date.now();
  broadcast(conn(), { t: 'typing' });
}

export function markSeen(id = getState().active) {
  const c = conn(id);
  if (document.hidden || !c || getState().active !== id) return;
  updateChat(id, (x) => (x.unread ? { unread: 0 } : {}));
  const msgs = getState().chats[id]?.messages || [];
  const last = msgs[msgs.length - 1];
  if (!last || last.ts <= c.seenSent) return;
  c.seenSent = last.ts;
  broadcast(c, { t: 'seen', ts: last.ts });
}

export function setProfile({ name, avatar }) {
  const s = saveSession({ name, avatar });
  saveProfile({ id: s.id, name: s.name, avatar: s.avatar }).catch(() => {});
  const st = getState();
  if (!st.me) return;
  setState({ me: { ...st.me, name: s.name, avatar: s.avatar } });
  for (const c of conns.values()) {
    updateMember(c.id, ident.mid, { name: s.name, avatar: s.avatar });
    broadcast(c, { t: 'profile', name: s.name, avatar: s.avatar });
  }
}

function setChatNameLocal(id, name, ts) {
  const chat = getState().chats[id];
  if (!chat) return;
  updateChat(id, { name, nameTs: ts, link: linkFor(chat.secret, name) });
  saveSession((cur) => ({ chats: (cur.chats || []).map((x) => (x.secret === chat.secret ? { ...x, name } : x)) }));
}
export function renameChat(name, id = getState().active) {
  const ts = Date.now();
  setChatNameLocal(id, name, ts);
  broadcast(conn(id), { t: 'room', name, ts });
}

// ---------- calls (one at a time, in any chat) ----------
const peerIdsOf = (chatId, mid) => getState().chats[chatId]?.members[mid]?.peerIds || [];
const setCallInfo = (chatId, info) => {
  updateChat(chatId, { callInfo: info });
  if (getState().call?.chat === chatId) setCallSize(Object.keys(info?.parts || {}).length - 1);
};

function onCallPacket(c, o, peerId, mid) {
  const st = getState();
  const chat = st.chats[c.id];
  const mine = st.call?.chat === c.id ? st.call : null;
  if (o.a === 'ring' || o.a === 'join') {
    if (chat.callInfo && chat.callInfo.cid !== o.cid) {
      if (o.cid > chat.callInfo.cid) return;
      if (mine) {
        if (Object.keys(chat.callInfo.parts).some((x) => x !== ident.mid)) return;
        switchCall(c, o.cid, o.video);
      } else { setCallInfo(c.id, null); if (st.ringing?.chat === c.id) setState({ ringing: null }); }
    }
    const info = getState().chats[c.id].callInfo || { cid: o.cid, video: o.video, startedAt: Date.now(), parts: {} };
    setCallInfo(c.id, { ...info, parts: { ...info.parts, [mid]: { mic: o.mic !== false, cam: !!o.cam, screen: !!o.screen } } });
    const cur = getState();
    if (cur.call?.chat === c.id && cur.call.cid === o.cid) {
      stopTones();
      addLocalStreamsTo(c, [peerId]);
    } else if (!cur.call && o.a === 'ring' && !o.quiet && !cur.ringing) {
      setState({ ringing: { chat: c.id, cid: o.cid, from: mid, video: o.video } });
      ring();
      setTimeout(() => { if (getState().ringing?.cid === o.cid) { setState({ ringing: null }); stopTones(); } }, 40000);
    }
  } else if (o.a === 'state') {
    if (!chat.callInfo || chat.callInfo.cid !== o.cid) return;
    setCallInfo(c.id, { ...chat.callInfo, parts: { ...chat.callInfo.parts, [mid]: { mic: o.mic !== false, cam: !!o.cam, screen: !!o.screen } } });
    if (mine && (!o.cam || !o.screen)) {
      const r = { ...(mine.remote[mid] || {}) };
      if (!o.cam) delete r.cam;
      if (!o.screen) delete r.screen;
      setState((s) => ({ call: s.call && { ...s.call, remote: { ...s.call.remote, [mid]: r } } }));
    }
  } else if (o.a === 'leave') {
    removeFromCall(c.id, mid, o.cid);
  } else if (o.a === 'decline') {
    if (mine) toast(`${chat.members[mid]?.name || 'Someone'} declined`, 'info', 2500);
  }
}

function removeFromCall(chatId, mid, cid) {
  const st = getState();
  const info = st.chats[chatId]?.callInfo;
  if (!info || (cid && info.cid !== cid) || !info.parts[mid]) return;
  const parts = { ...info.parts };
  delete parts[mid];
  const empty = Object.keys(parts).length === 0;
  setCallInfo(chatId, empty ? null : { ...info, parts });
  setState((s) => ({
    ringing: s.ringing?.chat === chatId && empty ? null : s.ringing,
    call: s.call && s.call.chat === chatId ? { ...s.call, remote: Object.fromEntries(Object.entries(s.call.remote).filter(([k]) => k !== mid)) } : s.call,
  }));
  if (!getState().call && !getState().ringing) stopTones();
  if (st.call?.chat === chatId) {
    blip(true);
    if (Object.keys(parts).every((x) => x === ident.mid)) leaveCall();
  }
}

// best camera the device offers up to 1080p30; some cameras reject resizeMode, so retry without it
async function getCamera() {
  let s;
  try { s = await navigator.mediaDevices.getUserMedia({ video: CAMERA_CONSTRAINTS }); }
  catch (e) {
    if (e?.name !== 'OverconstrainedError') throw e;
    const { resizeMode, aspectRatio, ...rest } = CAMERA_CONSTRAINTS;
    s = await navigator.mediaDevices.getUserMedia({ video: rest });
  }
  s.getVideoTracks().forEach((t) => { t.contentHint = 'motion'; });
  return s;
}

// connection quality of my current call, for the call header
export async function callStats() {
  const call = getState().call;
  const c = call && conns.get(call.chat);
  if (!c) return null;
  const parts = Object.keys(getState().chats[call.chat]?.callInfo?.parts || {});
  const pcs = Object.entries(c.room.getPeers()).filter(([pid]) => parts.includes(c.peers.get(pid)?.mid)).map(([, p]) => p.connection);
  return readStats(pcs);
}

async function getMedia(video) {
  try {
    const audio = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
    audio.getAudioTracks().forEach((t) => { t.contentHint = 'speech'; });
    let cam = null;
    if (video) {
      try { cam = await getCamera(); }
      catch { toast('Camera unavailable, joining with audio', 'warn'); }
    }
    return { audio, cam, screen: null };
  } catch (e) {
    toast('Microphone access is needed for calls', 'warn');
    throw e;
  }
}

function addLocalStreamsTo(c, targets) {
  const call = getState().call;
  if (!c || !targets.length || !call) return;
  for (const k of ['audio', 'cam', 'screen']) if (local[k]) c.room.addStream(local[k], { target: targets, metadata: { k, cid: call.cid } }).catch(() => {});
}

export async function startCall(video, chatId = getState().active) {
  const st = getState();
  if (st.call) return;
  if (st.chats[chatId]?.callInfo) return joinCall(video, chatId);
  const c = conn(chatId);
  const cid = Date.now().toString(36) + b64u(rand(6));
  local = await getMedia(video);
  setState({ call: { chat: chatId, cid, video, since: Date.now(), mic: true, cam: !!local.cam, screen: false, minimized: false, remote: {} } });
  setCallInfo(chatId, { cid, video, startedAt: Date.now(), parts: { [ident.mid]: { mic: true, cam: !!local.cam, screen: false } } });
  ringback();
  setTimeout(() => { const s = getState(); if (s.call?.cid === cid && Object.keys(s.chats[chatId]?.callInfo?.parts || {}).length <= 1) stopTones(); }, 30000);
  broadcast(c, { t: 'call', a: 'ring', cid, video, mic: true, cam: !!local.cam, screen: false });
}

export async function joinCall(withVideo, chatId = getState().ringing?.chat || getState().active) {
  const st = getState();
  const info = st.chats[chatId]?.callInfo;
  if (!info || st.call) return;
  stopTones();
  const video = withVideo ?? info.video;
  local = await getMedia(video);
  setState({ ringing: null, call: { chat: chatId, cid: info.cid, video, since: Date.now(), mic: true, cam: !!local.cam, screen: false, minimized: false, remote: {} } });
  const fresh = getState().chats[chatId].callInfo;
  setCallInfo(chatId, { ...fresh, parts: { ...fresh.parts, [ident.mid]: { mic: true, cam: !!local.cam, screen: false } } });
  const c = conn(chatId);
  addLocalStreamsTo(c, Object.keys(info.parts).filter((x) => x !== ident.mid).flatMap((m) => peerIdsOf(chatId, m)));
  broadcast(c, { t: 'call', a: 'join', cid: info.cid, video, mic: true, cam: !!local.cam, screen: false });
}

function switchCall(c, cid, video) {
  const cur = getState().call;
  setState({ call: { ...cur, cid, video: cur.video || video, remote: {} } });
  setCallInfo(c.id, { cid, video, startedAt: Date.now(), parts: { [ident.mid]: { mic: cur.mic, cam: cur.cam, screen: cur.screen } } });
  broadcast(c, { t: 'call', a: 'join', cid, video, mic: cur.mic, cam: cur.cam, screen: cur.screen });
}

export function declineCall() {
  const r = getState().ringing;
  stopTones();
  setState({ ringing: null });
  if (r) for (const pid of peerIdsOf(r.chat, r.from)) sendTo(conn(r.chat), pid, { t: 'call', a: 'decline', cid: r.cid });
}

export async function leaveCall() {
  const st = getState();
  stopTones();
  if (!st.call) return;
  const c = conn(st.call.chat);
  for (const k of ['audio', 'cam', 'screen']) {
    const s = local[k];
    if (!s) continue;
    try { c?.room.removeStream(s); } catch {}
    s.getTracks().forEach((t) => t.stop());
  }
  local = { audio: null, cam: null, screen: null };
  if (c) broadcast(c, { t: 'call', a: 'leave', cid: st.call.cid });
  const info = st.chats[st.call.chat]?.callInfo;
  const parts = { ...(info?.parts || {}) };
  delete parts[ident.mid];
  setState({ call: null });
  if (info) setCallInfo(st.call.chat, Object.keys(parts).length ? { ...info, parts } : null);
}

function pushCallState() {
  const call = getState().call;
  if (!call) return;
  const info = getState().chats[call.chat]?.callInfo;
  if (info) setCallInfo(call.chat, { ...info, parts: { ...info.parts, [ident.mid]: { mic: call.mic, cam: call.cam, screen: call.screen } } });
  broadcast(conn(call.chat), { t: 'call', a: 'state', cid: call.cid, mic: call.mic, cam: call.cam, screen: call.screen });
}

export function toggleMic() {
  const call = getState().call;
  if (!call || !local.audio) return;
  const mic = !call.mic;
  local.audio.getAudioTracks().forEach((t) => { t.enabled = mic; });
  setState({ call: { ...call, mic } });
  pushCallState();
}

function callTargets() {
  const call = getState().call;
  const info = getState().chats[call.chat]?.callInfo;
  return Object.keys(info?.parts || {}).filter((x) => x !== ident.mid).flatMap((m) => peerIdsOf(call.chat, m));
}

export async function toggleCam() {
  const call = getState().call;
  if (!call) return;
  const c = conn(call.chat);
  if (call.cam && local.cam) {
    try { c.room.removeStream(local.cam); } catch {}
    local.cam.getTracks().forEach((t) => t.stop());
    local.cam = null;
    setState({ call: { ...getState().call, cam: false } });
  } else {
    try { local.cam = await getCamera(); }
    catch { toast('Camera unavailable', 'warn'); return; }
    setState({ call: { ...getState().call, cam: true } });
    const t = callTargets();
    if (t.length) c.room.addStream(local.cam, { target: t, metadata: { k: 'cam', cid: call.cid } }).catch(() => {});
  }
  pushCallState();
}

export async function toggleScreen() {
  const call = getState().call;
  if (!call) return;
  const c = conn(call.chat);
  if (call.screen && local.screen) {
    try { c.room.removeStream(local.screen); } catch {}
    local.screen.getTracks().forEach((t) => t.stop());
    local.screen = null;
    setState({ call: { ...getState().call, screen: false } });
  } else {
    try {
      local.screen = await navigator.mediaDevices.getDisplayMedia(SCREEN_CONSTRAINTS);
      local.screen.getVideoTracks().forEach((t) => { t.contentHint = 'detail'; });
    }
    catch { return; }
    local.screen.getVideoTracks()[0].addEventListener('ended', () => { if (getState().call?.screen) toggleScreen(); });
    setState({ call: { ...getState().call, screen: true } });
    const t = callTargets();
    if (t.length) c.room.addStream(local.screen, { target: t, metadata: { k: 'screen', cid: call.cid } }).catch(() => {});
  }
  pushCallState();
}

export const getLocalStreams = () => local;
export function setMinimized(v) { const call = getState().call; if (call) setState({ call: { ...call, minimized: v } }); }

function onRemoteStream(c, stream, peerId, meta) {
  const p = c.peers.get(peerId);
  const call = getState().call;
  if (!p?.mid || !call || call.chat !== c.id || (meta?.cid && meta.cid !== call.cid)) {
    if (!call) stream.getTracks().forEach((t) => t.stop());
    return;
  }
  const k = meta?.k || (stream.getVideoTracks().length ? 'cam' : 'audio');
  const mid = p.mid;
  events.dispatchEvent(new CustomEvent('stream', { detail: { chatId: c.id, mid, kind: k, stream } }));
  setState((s) => (s.call ? { call: { ...s.call, remote: { ...s.call.remote, [mid]: { ...(s.call.remote[mid] || {}), [k]: stream } } } } : {}));
  const prune = () => {
    if (stream.getTracks().some((t) => t.readyState === 'live')) return;
    setState((s) => {
      if (!s.call?.remote[mid] || s.call.remote[mid][k] !== stream) return {};
      const r = { ...s.call.remote[mid] };
      delete r[k];
      return { call: { ...s.call, remote: { ...s.call.remote, [mid]: r } } };
    });
  };
  stream.addEventListener('removetrack', prune);
  stream.getTracks().forEach((t) => t.addEventListener('ended', prune));
}

window.addEventListener('beforeunload', () => {
  const call = getState().call;
  if (call) broadcast(conn(call.chat), { t: 'call', a: 'leave', cid: call.cid });
});

// ---------- keeping a copy ----------
function systemLine(chatId, text, tone) {
  insertMessage(chatId, { id: 'sys-' + b64u(rand(6)), ts: Date.now(), kind: 'system', mid: 'system', text, tone }, false);
}

// turn "keep a copy" on or off for a chat; everyone in it is told either way
export async function setKeep(on, id = getState().active) {
  const chat = getState().chats[id];
  if (!chat || !!chat.kept === !!on) return;
  if (on && !isUnlocked()) throw new Error('vault locked');
  updateChat(id, { kept: !!on });
  systemLine(id, on ? 'You’re keeping a copy of this chat. Everyone here was told.' : 'You stopped keeping a copy. It was deleted from this device.', on ? 'keep' : 'unkeep');
  broadcast(conn(id), { t: 'keep', on: !!on });
  if (on) await saveChat(snapshot(id)); else await forgetChat(id);
}

const mediaCache = new Map(); // message id -> base64, so autosave doesn't re-encode photos every time
function snapshot(id) {
  const chat = getState().chats[id];
  const c = conns.get(id);
  const media = {};
  for (const m of chat.messages) {
    if (m.deleted || !c?.bins.has(m.id)) continue;
    if (!mediaCache.has(m.id)) mediaCache.set(m.id, b64u(c.bins.get(m.id)));
    media[m.id] = mediaCache.get(m.id);
  }
  const keepFields = ['id', 'ts', 'mid', 'kind', 'text', 'mime', 'blur', 'dur', 'wave', 'reply', 'name', 'pk', 'sig', 'r', 'w', 'hgt', 'tx', 'deleted', 'size', 'tone', 'fname', 'ttl'];
  const messages = chat.messages.map((m) => Object.fromEntries(keepFields.filter((k) => m[k] !== undefined).map((k) => [k, m[k]])));
  const members = Object.fromEntries(Object.values(chat.members).filter((m) => !m.self).map((m) => [m.mid, { mid: m.mid, name: m.name, avatar: m.avatar, pk: m.pk }]));
  return { v: 1, id, secret: chat.secret, name: chat.name, nameTs: chat.nameTs, lastTs: chat.lastTs, ttl: chat.ttl || 0, ttlTs: chat.ttlTs || 0, savedAt: Date.now(), messages, members, media };
}

function restoreSnapshot(chat, snap, bins) {
  chat.kept = true;
  chat.name = snap.name || chat.name;
  chat.nameTs = snap.nameTs || 0;
  chat.lastTs = snap.lastTs || 0;
  chat.ttl = snap.ttl || 0;
  chat.ttlTs = snap.ttlTs || 0;
  for (const [mid, m] of Object.entries(snap.members || {})) {
    let safety;
    try { safety = m.pk ? safetyCode(ident.pk, unb64u(m.pk)) : undefined; } catch {}
    chat.members[mid] = { ...m, online: false, peerIds: [], safety };
  }
  chat.messages = (snap.messages || []).filter((m) => m.tone !== 'reopen' && m.text !== 'Reopened from your saved copy').map((m) => {
    const out = { ...m, status: 'sent', verified: true };
    const b = snap.media?.[m.id];
    if (b) {
      const bin = unb64u(b);
      bins.set(m.id, bin);
      mediaCache.set(m.id, b);
      out.url = URL.createObjectURL(new Blob([bin], { type: m.mime || 'application/octet-stream' }));
    }
    return out;
  });
  chat.messages.push({ id: 'sys-' + b64u(rand(6)), ts: Date.now(), kind: 'system', mid: 'system', text: 'Reopened from your saved copy', tone: 'reopen' });
}

// autosave kept chats shortly after they change
let lastSaved = new Map();
let saveTimer = null;
subscribe(() => {
  if (!isUnlocked()) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const st = getState();
    for (const chat of Object.values(st.chats)) {
      if (!chat.kept || lastSaved.get(chat.id) === chat.messages && lastSaved.get(chat.id + ':n') === chat.name) continue;
      lastSaved.set(chat.id, chat.messages);
      lastSaved.set(chat.id + ':n', chat.name);
      saveChat(snapshot(chat.id)).catch(() => {});
    }
  }, 1200);
});

export function currentProfile() {
  const s = loadSession();
  return { id: s.id, name: s.name, avatar: s.avatar };
}

// ---------- disappearing messages ----------
export const TTL_OPTIONS = [[0, 'Off'], [300, '5 minutes'], [3600, '1 hour'], [86400, '1 day'], [604800, '1 week']];
export const ttlLabel = (v) => TTL_OPTIONS.find(([x]) => x === v)?.[1] || `${v}s`;

export function setTtl(v, id = getState().active) {
  const chat = getState().chats[id];
  if (!chat || (chat.ttl || 0) === v) return;
  const ts = Date.now();
  updateChat(id, { ttl: v, ttlTs: ts });
  systemLine(id, v ? `You set messages to disappear after ${ttlLabel(v)}` : 'You turned off disappearing messages', 'timer');
  broadcast(conn(id), { t: 'ttl', v, ts });
}

// remove expired messages everywhere: memory, media, and (through autosave) the vault
setInterval(() => {
  const now = Date.now();
  for (const chat of Object.values(getState().chats)) {
    const gone = chat.messages.filter((m) => m.ttl && m.ts + m.ttl * 1000 <= now);
    if (!gone.length) continue;
    const c = conns.get(chat.id);
    for (const m of gone) { if (m.url) URL.revokeObjectURL(m.url); c?.bins.delete(m.id); mediaCache.delete(m.id); }
    const ids = new Set(gone.map((m) => m.id));
    updateChat(chat.id, (x) => ({ messages: x.messages.filter((m) => !ids.has(m.id)) }));
  }
}, 1000);
