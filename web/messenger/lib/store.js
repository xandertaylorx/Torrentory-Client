// Tiny global store: one state object, shallow updates, React hooks via useSyncExternalStore.
import { useSyncExternalStore } from 'react';

let state = {
  phase: 'setup',        // setup (pick a name) | app
  me: null,              // { mid, name, avatar, pkB64 }
  chats: {},             // id -> chat (see newChat)
  order: [],             // chat ids, most recent activity first
  active: null,          // open chat id
  call: null,            // my own call: { chat, cid, video, since, mic, cam, screen, minimized, remote: { mid: { audio, cam, screen } } }
  ringing: null,         // { chat, cid, from, video }
  codes: {},             // chat id -> { code, expires } (invite codes I'm hosting)
  knocks: [],            // [{ id, chat, name, avatar }] people asking to join through my codes
  joining: null,         // { code, status: 'deriving'|'searching'|'waiting'|'denied'|'notfound', chatName, hostName }
  toasts: [],
  sheet: null,
  vault: 'none',         // none | locked | unlocked  (saved chats on this device)
};

export const newChat = (id, secret, name) => ({
  id, secret, name: name || 'New chat', nameTs: 0, link: '', net: 'connecting',
  members: {}, messages: [], incoming: {}, callInfo: null, unread: 0, lastTs: 0,
  kept: false,           // I'm keeping a copy of this chat in my vault
  keepers: {},           // mid -> true for other people who said they keep a copy
});

const subs = new Set();
export const getState = () => state;
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  subs.forEach((f) => f());
}
export const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useStore = (sel) => useSyncExternalStore(subscribe, () => sel(state));
const EMPTY = {};
// select from the open chat
export const useChat = (sel) => useSyncExternalStore(subscribe, () => { const c = state.chats[state.active]; return c ? sel(c) : sel(EMPTY); });

export function updateChat(id, patch) {
  setState((s) => {
    const c = s.chats[id];
    if (!c) return {};
    return { chats: { ...s.chats, [id]: { ...c, ...(typeof patch === 'function' ? patch(c) : patch) } } };
  });
}
export function updateMember(id, mid, patch) {
  updateChat(id, (c) => ({ members: { ...c.members, [mid]: { ...(c.members[mid] || { mid, peerIds: [] }), ...patch } } }));
}
export function updateMessage(id, msgId, patch) {
  updateChat(id, (c) => ({ messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) }));
}
export function bumpChat(id) {
  setState((s) => ({ order: [id, ...s.order.filter((x) => x !== id)] }));
}

let toastN = 0;
export function toast(text, kind = 'info', ms = 4200) {
  const id = ++toastN;
  setState((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
  setTimeout(() => setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}
