// The Test Bot behind /chat/test. It runs in a hidden iframe as a real second participant: its
// own identity, its own encrypted connection through the public relays, exactly like another
// device. So testing against it exercises the real path, not a mock.
//
// Calls: it answers automatically, sends an animated 720p test pattern, and echoes your audio
// back after one second, so you can hear how you sound to other people.
import { getState, subscribe } from './store.js';
import { saveSession, startApp, openChat, sendMessage, events, joinCall, typing, setActive } from './session.js';
import { waveform, fmtSize } from './media.js';

let ctx = null;          // the bot's audio graph (chime + echo, or "talking" in the group)
let echoDest = null;
let chatId = null;

// set from the iframe URL: ?bot=1&name=Ava&group=1&idx=0&count=3
const P = new URLSearchParams(location.search);
const OPTS = {
  name: P.get('name') || 'Test Bot',
  group: P.has('group'),
  idx: Number(P.get('idx') || 0),
  count: Number(P.get('count') || 1),
};
OPTS.hue = [150, 280, 25, 200][OPTS.idx % 4];

// ---------- synthetic camera and microphone ----------
function testPattern() {
  // group bots send a lighter 640x360 so a 4-person call in one tab stays smooth
  const W = OPTS.group ? 640 : 1280, H = OPTS.group ? 360 : 720, k = W / 1280;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const bars = ['#f5f5f5', '#facc15', '#22d3ee', '#22c55e', '#d946ef', '#ef4444', '#3b82f6', '#111'];
  let frame = 0;
  const draw = () => {
    frame++;
    const t = performance.now() / 1000;
    const g = x.createLinearGradient(0, 0, W, H);
    const base = OPTS.group ? OPTS.hue : t * 20;
    g.addColorStop(0, `hsl(${base % 360} 55% ${OPTS.group ? 26 : 18}%)`);
    g.addColorStop(1, `hsl(${(base + 140) % 360} 55% 10%)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // moving orb, so motion and smoothness are easy to judge
    const ox = W / 2 + Math.cos(t * 1.3 + OPTS.idx) * 380 * k, oy = H / 2 + Math.sin(t * 1.7 + OPTS.idx) * 160 * k;
    const og = x.createRadialGradient(ox, oy, 0, ox, oy, 120 * k);
    og.addColorStop(0, `hsla(${OPTS.group ? OPTS.hue : 158} 70% 60% / .95)`); og.addColorStop(1, `hsla(${OPTS.group ? OPTS.hue : 158} 70% 60% / 0)`);
    x.fillStyle = og; x.beginPath(); x.arc(ox, oy, 120 * k, 0, Math.PI * 2); x.fill();
    // a sweeping line shows dropped frames as jumps
    const sx = (t * 400 * k) % W;
    x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(sx, 0, 3, H - 60 * k);
    // colour bars + fine detail for sharpness
    bars.forEach((c, i) => { x.fillStyle = c; x.fillRect((W / bars.length) * i, H - 60 * k, W / bars.length, 60 * k); });
    x.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 64; i++) x.fillRect(40 * k + i * 6 * k, 40 * k, 1, 24 * k);
    x.fillStyle = '#fff';
    x.textAlign = OPTS.group ? 'center' : 'left';
    const tx = OPTS.group ? W / 2 : 40 * k;
    x.font = `600 ${64 * k * (OPTS.group ? 1.6 : 1)}px Geist, system-ui, sans-serif`;
    x.fillText(OPTS.name, tx, OPTS.group ? 130 : 150 * k);
    x.font = `500 ${120 * k}px "Geist Mono", ui-monospace, monospace`;
    const d = new Date();
    x.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(Math.floor(d.getMilliseconds() / 100))}`, tx, OPTS.group ? 205 : 300 * k);
    x.font = `400 ${28 * k * (OPTS.group ? 1.4 : 1)}px "Geist Mono", ui-monospace, monospace`;
    x.fillStyle = 'rgba(255,255,255,.7)';
    x.fillText(OPTS.group ? `${W}×${H} · frame ${frame}` : `1280×720 · frame ${frame} · you hear yourself 1 s later`, tx, OPTS.group ? 250 : 360 * k);
    x.textAlign = 'left';
  };
  draw();
  const fps = OPTS.group ? 24 : 30;
  setInterval(draw, 1000 / fps);
  const s = cv.captureStream(fps);
  s.getVideoTracks().forEach((tr) => { tr.contentHint = 'motion'; });
  return s;
}

function audioGraph() {
  if (ctx) return;
  ctx = new AudioContext();
  echoDest = ctx.createMediaStreamDestination();
  // a soft two-note chime every few seconds, so there's always something to hear
  const chime = () => {
    const t0 = ctx.currentTime + 0.05;
    [[659, 0], [988, 0.18]].forEach(([f, dt]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + dt);
      g.gain.linearRampToValueAtTime(0.12, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dt + 0.6);
      o.connect(g).connect(echoDest);
      o.start(t0 + dt); o.stop(t0 + dt + 0.7);
    });
  };
  if (!OPTS.group) { setInterval(() => { if (getState().call) chime(); }, 5000); return; }
  // group bots take turns "talking": a hummed, syllable-like sound at their own pitch,
  // so the active-speaker highlight moves around the call
  const f0 = [140, 210, 175, 120][OPTS.idx % 4];
  const talk = () => {
    if (!getState().call) return;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f0;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 700; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 4;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(echoDest);
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < 9; i++) {
      const a = t0 + i * 0.2;
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.55, a + 0.04); g.gain.linearRampToValueAtTime(0.08, a + 0.16);
      o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.25), a);
    }
    g.gain.linearRampToValueAtTime(0, t0 + 1.9);
    o.start(t0); o.stop(t0 + 2);
  };
  const period = 2400 * Math.max(OPTS.count, 1);
  setTimeout(() => { talk(); setInterval(talk, period); }, 600 + OPTS.idx * 2400);
}

function installFakeMedia() {
  navigator.mediaDevices.getUserMedia = async (c) => {
    if (c?.video) return testPattern();
    audioGraph();
    await ctx.resume().catch(() => {});
    // a clone, so hanging up (which stops the call's tracks) doesn't silence the next call
    return new MediaStream([echoDest.stream.getAudioTracks()[0].clone()]);
  };
  navigator.mediaDevices.getDisplayMedia = async () => testPattern();
}

// your voice comes back through a 1 s delay
function echo(stream) {
  if (OPTS.group || !stream.getAudioTracks().length) return;
  audioGraph();
  // Chrome only feeds remote WebRTC audio into Web Audio if a (muted) element is playing it too
  const el = new Audio();
  el.muted = true; el.srcObject = stream; el.play().catch(() => {});
  const src = ctx.createMediaStreamSource(stream);
  const delay = ctx.createDelay(2);
  delay.delayTime.value = 1;
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  src.connect(delay).connect(gain).connect(echoDest);
}

// ---------- generated content ----------
async function makePhoto(label = 'Test photo') {
  const cv = document.createElement('canvas');
  cv.width = 1600; cv.height = 1000;
  const x = cv.getContext('2d');
  const h = Math.floor(Math.random() * 360);
  const g = x.createLinearGradient(0, 0, 1600, 1000);
  g.addColorStop(0, `hsl(${h} 70% 62%)`); g.addColorStop(1, `hsl(${(h + 70) % 360} 60% 32%)`);
  x.fillStyle = g; x.fillRect(0, 0, 1600, 1000);
  for (let i = 0; i < 9; i++) {
    x.fillStyle = `hsla(${(h + i * 40) % 360} 80% 70% / .55)`;
    x.beginPath(); x.arc(150 + i * 170, 500 + Math.sin(i) * 220, 110 - i * 6, 0, Math.PI * 2); x.fill();
  }
  x.fillStyle = '#fff'; x.font = '600 96px Geist, system-ui, sans-serif'; x.fillText(label, 90, 180);
  x.font = '400 40px "Geist Mono", monospace'; x.fillText('1600 × 1000 · sent by the Test Bot', 90, 250);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.88));
  return { bin: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', w: 1600, hgt: 1000 };
}

async function makeVoice() {
  const sr = 48000, secs = 4.5;
  const off = new OfflineAudioContext(1, sr * secs, sr);
  [523, 659, 784, 1047, 784, 659, 523].forEach((f, i) => {
    const o = off.createOscillator(), g = off.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    const t = 0.2 + i * 0.58;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(off.destination); o.start(t); o.stop(t + 0.55);
  });
  const buf = await off.startRendering();
  const d = buf.getChannelData(0);
  const wav = new ArrayBuffer(44 + d.length * 2), v = new DataView(wav);
  const w = (o, str) => [...str].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + d.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  return { bin: new Uint8Array(wav), mime: 'audio/wav', dur: secs, wave: waveform(buf, 48), tx: 'This is a test voice note from the Test Bot. If you can read this, transcripts travel with voice notes.' };
}

async function makeVideo() {
  if (!window.MediaRecorder) return null;
  const stream = testPattern();
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return null;
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start(200);
  await new Promise((r) => setTimeout(r, 3000));
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: type.split(';')[0] });
  return { bin: new Uint8Array(await blob.arrayBuffer()), mime: blob.type, fname: `test-clip.${blob.type.includes('mp4') ? 'mp4' : 'webm'}` };
}

const GROUP_HELP = `This is a group with four bots: Ava, Kai, Noor and Theo. With you that's five, so you can see how an uneven group looks. Each one is a separate participant with its own connection.
• Send a message: one of us answers each time, taking turns
• everyone: we all reply
• photo, voice, video, file work here too
• Call the group (voice or video): we join one by one and take turns talking, so you can see how group calls look and who's speaking.`;

const HELP = `Things to try:
• photo, blur: I send a photo (blurred, for "blur")
• voice: a voice note with a transcript
• video: a 3-second video file
• file: a small text file
• long: a long message
• Or send me anything: text, photos, voice notes, files
• Call me (voice or video). I answer, show a test pattern, and play your voice back 1 second later.
• Turn on the timer next to the message box to try disappearing messages.`;

// ---------- conversation ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function say(text, extra = {}) {
  setActive(chatId);
  typing();
  await wait(Math.min(1400, 350 + text.length * 8));
  await sendMessage({ kind: 'text', text, ...extra }, chatId);
}

const BOT_NAMES = ['Test Bot', 'Ava', 'Kai', 'Noor', 'Theo'];
const hashStr = (str) => [...str].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

async function reply(m) {
  if (OPTS.group) {
    if (BOT_NAMES.includes(m.name)) return; // bots don't answer bots
    const t = (m.text || '').trim().toLowerCase();
    if (t === 'everyone' || t === 'all') {
      await wait(400 + OPTS.idx * 900);
      return say(`${OPTS.name} here. ${['Hearing you loud and clear.', 'All good on my end.', 'Present!', 'Here and listening.'][OPTS.idx % 4]}`);
    }
    if (hashStr(m.id) % OPTS.count !== OPTS.idx) return; // one bot answers each message, taking turns
  }
  const ttlNote = m.ttl ? ` It will disappear in ${m.ttl >= 3600 ? Math.round(m.ttl / 3600) + ' h' : Math.round(m.ttl / 60) + ' min'}.` : '';
  if (m.kind === 'image') return say(`Got your photo: ${m.w || '?'}×${m.hgt || '?'}, ${fmtSize(m.size || 0)}${m.blur ? ', sent blurred' : ''}.${ttlNote}`);
  if (m.kind === 'voice') return say(`Got your ${Math.round(m.dur || 0)} s voice note (${fmtSize(m.size || 0)}).${m.tx ? ` Transcript: "${m.tx.slice(0, 140)}"` : ' No transcript (your browser can’t transcribe on-device).'}${ttlNote}`);
  if (m.kind === 'file') return say(`Got your file: ${m.fname || 'untitled'} (${fmtSize(m.size || 0)}, ${m.mime || 'unknown type'}).${ttlNote}`);
  const t = (m.text || '').trim().toLowerCase();
  if (t === 'help' || t === '?') return say(OPTS.group ? GROUP_HELP : HELP);
  if (t === 'photo' || t === 'pic' || t === 'blur') {
    typing();
    return sendMessage({ kind: 'image', ...(await makePhoto(t === 'blur' ? 'Blurred test' : 'Test photo')), blur: t === 'blur', text: t === 'blur' ? 'Tap to reveal' : '' }, chatId);
  }
  if (t === 'voice') return sendMessage({ kind: 'voice', ...(await makeVoice()) }, chatId);
  if (t === 'video') {
    await say('Recording a 3-second clip…');
    const v = await makeVideo();
    return v ? sendMessage({ kind: 'file', ...v }, chatId) : say('This browser can’t record video, sorry.');
  }
  if (t === 'file') {
    const text = `Torrentory Messenger test file\nSent: ${new Date().toISOString()}\nIf you can open this, file transfer works end to end.\n`;
    return sendMessage({ kind: 'file', bin: new TextEncoder().encode(text), mime: 'text/plain', fname: 'torrentory-test.txt' }, chatId);
  }
  if (t === 'long') return say('Here is a longer message to check wrapping and scrolling. '.repeat(12).trim());
  return say(`You said: “${(m.text || '').slice(0, 200)}” (${(m.text || '').length} characters, encrypted end to end).${ttlNote} Type help for more.`);
}

export async function runBot(secret) {
  installFakeMedia();
  saveSession({ name: OPTS.name, avatar: OPTS.group ? null : 'g:testbot-3' });
  await startApp();
  chatId = await openChat({ secret, name: OPTS.group ? 'Test Group' : 'Test Bot' }, { ephemeral: true });
  const greeted = new Set();
  let groupGreeted = false;
  events.addEventListener('peer', (e) => {
    if (e.detail.chatId !== chatId || greeted.has(e.detail.mid)) return;
    greeted.add(e.detail.mid);
    // the name arrives just after the connection, so wait a moment before deciding who this is
    setTimeout(() => {
      const name = getState().chats[chatId]?.members[e.detail.mid]?.name;
      if (BOT_NAMES.includes(name)) return; // don't greet the other bots
      if (OPTS.group) {
        if (groupGreeted) return;
        groupGreeted = true;
        if (OPTS.idx === 0) say(`Hi! ${GROUP_HELP}`);
        else setTimeout(() => say(['', 'Hey 👋', 'Hi, Noor here.', 'Theo here, hello!'][OPTS.idx] || 'Hi!'), 2000 + OPTS.idx * 1200);
        return;
      }
      say(`Hi, I’m the Test Bot. I’m a real second device running inside this page, so everything goes through the same encryption and connection as any other chat.\n\n${HELP}`);
    }, 1500);
  });
  events.addEventListener('message', (e) => { if (e.detail.chatId === chatId) reply(e.detail.m).catch(() => {}); });
  events.addEventListener('stream', (e) => { if (e.detail.chatId === chatId && e.detail.kind === 'audio') echo(e.detail.stream); });
  // answer calls after a short ring
  let answering = false;
  subscribe(() => {
    const r = getState().ringing;
    if (!r || answering || getState().call) return;
    answering = true;
    // in the group, bots pick up one after another
    setTimeout(async () => { try { await joinCall(r.video); } finally { answering = false; } }, 1500 + (OPTS.group ? OPTS.idx * 1800 : 0));
  });
}
