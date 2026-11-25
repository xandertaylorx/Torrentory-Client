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
- **Photos**: drag-drop, paste or pick; optional **send blurred** (tap to reveal). Location and camera metadata are stripped by re-encoding.
- **Calls**: voice and video, group (mesh), mute, camera on/off, screen share, speaking indicator, minimize to a pill, ringtones made with WebAudio.
- **History without storage**: when someone joins or refreshes, people already in the room hand them recent history from memory. Every message is signed by its author, so a relayed copy can't be forged.
- **Burn session**: wipes the tab's memory and session.

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
