// Join codes: three short words, like "maple-orbit-stone".
//
// A code is easy to say out loud, but three words are guessable in a way a 256-bit key is not.
// So a code never carries the chat key. It only opens a small "lobby" room (keyed by a slow
// scrypt hash of the words) where the newcomer knocks. Someone already in the chat sees
// "Sam wants to join" and taps Let in; only then is the real key sent, directly between the
// two devices over the encrypted P2P channel. A code works while its creator's tab is open,
// for 30 minutes at most.
import { joinRoom } from 'trystero';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { b64u, utf8, fromUtf8, rand, deriveRoom, sealRoom, openRoom } from './crypto.js';
import { getState, setState, toast } from './store.js';
import { APP_ID, openChat } from './session.js';
import { blip } from './tones.js';

const CODE_TTL = 30 * 60 * 1000;
const hosting = new Map();  // chat id -> { code, room, action, keys, timer, seen: Map(peerId -> ts) }
let joiner = null;          // { room, action, keys, timer }

// ---------- codes ----------
export function newCode() {
  const r = rand(6);
  const idx = [0, 2, 4].map((i) => ((r[i] << 8) | r[i + 1]) & 2047);
  return idx.map((i) => wordlist[i]).join('-');
}

// forgiving input: any separators, any case, and the first 4 letters of each word are enough
export function normalizeCode(input) {
  const parts = String(input || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  const words = parts.map((p) => (wordlist.includes(p) ? p : p.length >= 4 ? wordlist.find((w) => w.startsWith(p.slice(0, 4))) : null));
  return words.every(Boolean) ? words.join('-') : null;
}
export const looksLikeCode = (s) => normalizeCode(s) !== null;

async function lobbyKeys(code) {
  const key = await scryptAsync(utf8(code), utf8('torrentory-messenger/lobby/v1'), { N: 2 ** 15, r: 8, p: 1, dkLen: 32 });
  return deriveRoom(b64u(key));
}
const send = async (ctx, obj, peerId) => ctx.action.send(await sealRoom(ctx.keys.roomKey, utf8(JSON.stringify(obj))), { target: peerId });
async function read(ctx, data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  try { return JSON.parse(fromUtf8(await openRoom(ctx.keys.roomKey, bytes))); } catch { return null; }
}
const lobbyRoom = (keys) => joinRoom({ appId: APP_ID, password: keys.signalPassword, identity: 'none', maxReceiveBytes: 64 * 1024 }, 'lobby-' + keys.roomId);

// ---------- host: share a code for a chat ----------
export async function shareCode(chatId) {
  const existing = getState().codes[chatId];
  if (existing && existing.expires > Date.now()) return existing.code;
  return regenerateCode(chatId);
}

export async function regenerateCode(chatId) {
  stopHosting(chatId);
  const code = newCode();
  const expires = Date.now() + CODE_TTL;
  setState((s) => ({ codes: { ...s.codes, [chatId]: { code, expires, ready: false } } }));
  const keys = await lobbyKeys(code);
  if (getState().codes[chatId]?.code !== code) return code;
  const room = lobbyRoom(keys);
  const ctx = { code, room, action: room.makeAction('k'), keys, seen: new Map() };
  ctx.timer = setTimeout(() => stopHosting(chatId), CODE_TTL);
  hosting.set(chatId, ctx);
  setState((s) => ({ codes: { ...s.codes, [chatId]: { code, expires, ready: true } } }));

  room.onPeerJoin(({ peerId }) => {
    const chat = getState().chats[chatId];
    if (chat) send(ctx, { t: 'host', chat: chat.name, host: getState().me.name }, peerId);
  });
  room.onPeerLeave(({ peerId }) => setState((s) => ({ knocks: s.knocks.filter((k) => k.peerId !== peerId) })));
  ctx.action.onMessage(async (data, { peerId }) => {
    const o = await read(ctx, data);
    if (o?.t !== 'knock') return;
    // a little rate limiting: at most 3 waiting, and one knock per person per 10 s
    const now = Date.now();
    if ((ctx.seen.get(peerId) || 0) > now - 10000) return;
    ctx.seen.set(peerId, now);
    const st = getState();
    if (st.knocks.filter((k) => k.chat === chatId).length >= 3) return;
    const knock = { id: b64u(rand(8)), chat: chatId, peerId, name: String(o.name || 'Someone').slice(0, 40), avatar: typeof o.avatar === 'string' && o.avatar.length < 300000 ? o.avatar : null, at: now };
    setState((s) => ({ knocks: [...s.knocks.filter((k) => k.peerId !== peerId), knock] }));
    blip();
  });
  return code;
}

export function stopHosting(chatId) {
  const h = hosting.get(chatId);
  if (h) { clearTimeout(h.timer); h.room.leave().catch(() => {}); hosting.delete(chatId); }
  setState((s) => {
    const codes = { ...s.codes };
    delete codes[chatId];
    return { codes, knocks: s.knocks.filter((k) => k.chat !== chatId) };
  });
}

export async function answerKnock(knockId, allow) {
  const k = getState().knocks.find((x) => x.id === knockId);
  setState((s) => ({ knocks: s.knocks.filter((x) => x.id !== knockId) }));
  const h = k && hosting.get(k.chat);
  const chat = k && getState().chats[k.chat];
  if (!h || !chat) return;
  await send(h, allow ? { t: 'ok', secret: chat.secret, name: chat.name } : { t: 'no' }, k.peerId);
  if (allow) toast(`Letting ${k.name} in`);
}

// ---------- joiner: enter a code ----------
export async function joinWithCode(input) {
  const code = normalizeCode(input);
  if (!code) { toast("That code doesn't look right. It's three words.", 'warn'); return; }
  cancelJoin();
  setState({ joining: { code, status: 'deriving' } });
  const keys = await lobbyKeys(code);
  if (getState().joining?.code !== code) return;
  const room = lobbyRoom(keys);
  const ctx = { room, action: room.makeAction('k'), keys, code };
  joiner = ctx;
  setState({ joining: { code, status: 'searching' } });
  ctx.timer = setTimeout(() => { if (getState().joining?.code === code && getState().joining.status === 'searching') setState({ joining: { code, status: 'notfound' } }); }, 25000);

  ctx.action.onMessage(async (data, { peerId }) => {
    if (joiner !== ctx) return;
    const o = await read(ctx, data);
    if (!o) return;
    if (o.t === 'host') {
      setState({ joining: { code, status: 'waiting', chatName: String(o.chat || '').slice(0, 60), hostName: String(o.host || '').slice(0, 40) } });
      const me = getState().me;
      send(ctx, { t: 'knock', name: me.name, avatar: me.avatar }, peerId);
    } else if (o.t === 'ok' && typeof o.secret === 'string') {
      cancelJoin();
      await openChat({ secret: o.secret, name: o.name });
      toast(`You're in ${o.name || 'the chat'}`);
    } else if (o.t === 'no') {
      setState({ joining: { ...getState().joining, status: 'denied' } });
    }
  });
}

export function cancelJoin() {
  if (joiner) { clearTimeout(joiner.timer); joiner.room.leave().catch(() => {}); joiner = null; }
  setState({ joining: null });
}

export const shareText = (code) => `Join me on Torrentory Messenger with the code ${code}\n${location.origin}${location.pathname}#c=${code}`;
