# Torrentory Messenger

A Torrentory product, built and owned by Crooli. Same design system as torrentory.com. No accounts, no backend, no database: a room is just a link, and when everyone closes the tab the conversation is gone.

Lives at **torrentory.com/chat** (also **/messenger**). It's built with the rest of the site in `web/`:

```bash
cd web
npm ci
npm run dev      # then open http://127.0.0.1:5173/chat
npm run build
```

`web/messenger.html` is its own Vite entry, so the messenger's code and CSS never load on the marketing pages. `vercel.json` (and a small plugin in `vite.config.ts` for dev and preview) rewrite `/chat` and `/messenger` to it.

Mic, camera and calls need HTTPS (or localhost), so deploy it before using it between phones.

## Features

- **Many chats at once**: a Telegram-style list with previews, unread counts and call indicators. Every chat has its own keys and its own peer-to-peer room, and all stay connected.
- **Three-word join codes** (`src/lib/invite.js`): tap Invite and you get a code like `profit-glove-source`. Say it, text it, show the QR, or use the share sheet. The joiner types it (any case, any separators, first four letters of each word are enough) and *knocks*; you tap **Let in**. The code never contains the chat key: it opens a small lobby (keyed by a slow scrypt hash of the words), and the real key is only sent after you approve, directly device to device. Codes work while your tab is open, for 30 minutes. A shared link like `…/#c=profit-glove-source` does the same thing in one tap.
- **Direct links** still exist for private channels: they let people in without a knock, so only send them somewhere you trust.
- **Profiles**: a pixel-art critter generated from your name (slimes, cats, bears, bots, ghosts, frogs, chicks, with toppers), a shuffle for more, or your own photo (cropped, re-encoded). Kept in `sessionStorage` only, so refreshing keeps you in the room and closing the tab forgets you.
- **Presence**: who's online, who left, who's typing, who's in the call, read receipts with avatars.
- **Messages**: grouped bubbles, replies, reactions (double-click for ❤️), copy, delete for everyone, links, big emoji.
- **Voice messages**: live waveform while recording, review before sending, custom player with a scrubbable waveform, 1×/1.5×/2×. **Transcripts** are written live while you record, using the browser's on-device speech recognition, and travel with the note (signed and encrypted), so they just appear under the waveform. If the browser can't recognise speech on-device, the note simply has no transcript: audio is never sent to a speech service. Chrome downloads its language pack in the background the first time.
- **Test Bot at `/chat/test`**: opens a fresh chat with a bot that runs as a real second participant in a hidden iframe (own identity, own encrypted connection through the relays), so it tests the real path. Commands: `photo`, `blur`, `voice`, `video`, `file`, `long`, `help`; it also reports back on anything you send. It answers calls automatically with an animated 720p test pattern and echoes your audio back after 1 second. Code: `lib/bot.js`.
- **Files**: any file up to 50 MB (drop, paste or pick). Videos (mp4/webm/mov) play inline; everything else gets a download card.
- **Disappearing messages**: a per-chat timer (Off, 5 min, 1 hour, 1 day, 1 week) from the timer button by the message box or in Chat info. Everyone is told when it changes; each message carries its own signed timer and is removed from memory (and any saved copy) when it expires.
- **Photos**: drag-drop, paste or pick; optional **send blurred** (tap to reveal). Location and camera metadata are stripped by re-encoding.
- **Calls**: voice and video, group (mesh), mute, camera on/off, screen share, speaking indicator, minimize to a pill, ringtones made with WebAudio. Tuned for quality in `lib/rtc.js` (a tuned `RTCPeerConnection` handed to trystero): Opus at up to 128 kbps with in-band FEC and no DTX (RED where the browser enables it), cameras up to 1080p30 preferring hardware H.264 with a 2.5 Mbps budget that splits sensibly in group calls, screen share up to 1440p in VP9 that keeps resolution over frame rate, and a live quality readout (resolution · fps · delay) in the call header.
- **History without storage**: when someone joins or refreshes, people already in the room hand them recent history from memory. Every message is signed by its author, so a relayed copy can't be forged.
- **Keep a copy (opt-in, per chat)**: in Chat info. The chat, its photos and voice notes are saved in this browser's IndexedDB, encrypted with a passphrase only you know (scrypt N=2^16 → AES-256-GCM; `lib/vault.js`). **Everyone in the chat is told**: a notice line ("Alex is keeping a copy of this chat on their device") and a *Kept by* marker in the header, including for people who join later; they're told again if it's turned off. Next visit, a *Welcome back* screen asks for the passphrase and reopens kept chats with their history, under the same identity, so people still in the chat reconnect and anyone who rejoins gets the history back. The notice is honest about its limit: it covers everyone using this app, but nothing stops a screenshot or a modified client. There is no passphrase recovery; *Forgot it?* deletes the saved chats.
- **Burn session**: wipes the tab's memory, the session and any saved chats on this device.

## Encryption layers (`src/lib/crypto.js`)

1. **Ed25519** signature on every message by its author.
2. **XChaCha20-Poly1305** per pair of people, with a symmetric ratchet: a new key for every message, old keys erased.
3. **X25519** key exchange with fresh keys every join (forward secrecy between visits).
4. **AES-256-GCM** room layer keyed from the link, with length padding.
5. **WebRTC DTLS** (DTLS-SRTP for calls), direct device to device. Signaling goes through public Nostr relays (via [trystero](https://github.com/dmotz/trystero)), encrypted with a separate key from the link; relays only see a hash of the room.

**Safety codes** (Encryption sheet) let two people confirm nobody is in the middle.

## Honest limits

- Anyone with the link can join, so share it like a password.
- People in a room can see each other's IP address (that's how direct connections work).
- Without a TURN server, some strict networks (some corporate or mobile carriers) can't connect directly. Add one via `turnConfig` in `src/lib/session.js` if you need that.
- Calls are protected by WebRTC's DTLS-SRTP, not the extra message layers.
- Group calls are a mesh, which works well up to about 4 to 6 people.
