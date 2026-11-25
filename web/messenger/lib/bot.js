// The Test Bot behind /chat/test. It runs in a hidden iframe as a real second participant: its
// own identity, its own encrypted connection through the public relays, exactly like another
// device. So testing against it exercises the real path, not a mock.
//
// Calls: it answers automatically, sends an animated 720p test pattern, and echoes your audio
// back after one second, so you can hear how you sound to other people.
import { getState, subscribe } from './store.js';
import { saveSession, startApp, openChat, sendMessage, events, joinCall, typing, setActive } from './session.js';
import { waveform, fmtSize } from './media.js';

let ctx = null;          // the bot's audio graph (chime + echo)
let echoDest = null;
let chatId = null;

// ---------- synthetic camera and microphone ----------
function testPattern() {
  const W = 1280, H = 720;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const bars = ['#f5f5f5', '#facc15', '#22d3ee', '#22c55e', '#d946ef', '#ef4444', '#3b82f6', '#111'];
  let frame = 0;
  const draw = () => {
    frame++;
    const t = performance.now() / 1000;
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `hsl(${(t * 20) % 360} 55% 18%)`);
    g.addColorStop(1, `hsl(${(t * 20 + 140) % 360} 55% 10%)`);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // moving orb, so motion and smoothness are easy to judge
    const ox = W / 2 + Math.cos(t * 1.3) * 380, oy = H / 2 + Math.sin(t * 1.7) * 160;
    const og = x.createRadialGradient(ox, oy, 0, ox, oy, 120);
    og.addColorStop(0, 'rgba(53,214,153,.95)'); og.addColorStop(1, 'rgba(53,214,153,0)');
    x.fillStyle = og; x.beginPath(); x.arc(ox, oy, 120, 0, Math.PI * 2); x.fill();
    // a sweeping line shows dropped frames as jumps
    const sx = (t * 400) % W;
    x.fillStyle = 'rgba(255,255,255,.5)'; x.fillRect(sx, 0, 3, H - 60);
    // colour bars + fine detail for sharpness
    bars.forEach((c, i) => { x.fillStyle = c; x.fillRect((W / bars.length) * i, H - 60, W / bars.length, 60); });
    x.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 64; i++) x.fillRect(40 + i * 6, 40, 1, 24);
    x.fillStyle = '#fff';
    x.font = '600 64px Geist, system-ui, sans-serif';
    x.fillText('Test Bot', 40, 150);
    x.font = '500 120px "Geist Mono", ui-monospace, monospace';
    const d = new Date();
    x.fillText(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(Math.floor(d.getMilliseconds() / 100))}`, 40, 300);
    x.font = '400 28px "Geist Mono", ui-monospace, monospace';
    x.fillStyle = 'rgba(255,255,255,.7)';
    x.fillText(`1280×720 · frame ${frame} · you hear yourself 1 s later`, 40, 360);
  };
  draw();
  setInterval(draw, 1000 / 30);
  const s = cv.captureStream(30);
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
  setInterval(() => { if (getState().call) chime(); }, 5000);
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
  if (!stream.getAudioTracks().length) return;
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

async function reply(m) {
  const ttlNote = m.ttl ? ` It will disappear in ${m.ttl >= 3600 ? Math.round(m.ttl / 3600) + ' h' : Math.round(m.ttl / 60) + ' min'}.` : '';
  if (m.kind === 'image') return say(`Got your photo: ${m.w || '?'}×${m.hgt || '?'}, ${fmtSize(m.size || 0)}${m.blur ? ', sent blurred' : ''}.${ttlNote}`);
  if (m.kind === 'voice') return say(`Got your ${Math.round(m.dur || 0)} s voice note (${fmtSize(m.size || 0)}).${m.tx ? ` Transcript: "${m.tx.slice(0, 140)}"` : ' No transcript (your browser can’t transcribe on-device).'}${ttlNote}`);
  if (m.kind === 'file') return say(`Got your file: ${m.fname || 'untitled'} (${fmtSize(m.size || 0)}, ${m.mime || 'unknown type'}).${ttlNote}`);
  const t = (m.text || '').trim().toLowerCase();
  if (t === 'help' || t === '?') return say(HELP);
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
  saveSession({ name: 'Test Bot', avatar: 'g:testbot-3' });
  await startApp();
  chatId = await openChat({ secret, name: 'Test Bot' }, { ephemeral: true });
  const greeted = new Set();
  events.addEventListener('peer', (e) => {
    if (e.detail.chatId !== chatId || greeted.has(e.detail.mid)) return;
    greeted.add(e.detail.mid);
    setTimeout(() => say(`Hi, I’m the Test Bot. I’m a real second device running inside this page, so everything goes through the same encryption and connection as any other chat.\n\n${HELP}`), 700);
  });
  events.addEventListener('message', (e) => { if (e.detail.chatId === chatId) reply(e.detail.m).catch(() => {}); });
  events.addEventListener('stream', (e) => { if (e.detail.chatId === chatId && e.detail.kind === 'audio') echo(e.detail.stream); });
  // answer calls after a short ring
  let answering = false;
  subscribe(() => {
    const r = getState().ringing;
    if (!r || answering || getState().call) return;
    answering = true;
    setTimeout(async () => { try { await joinCall(r.video); } finally { answering = false; } }, 1500);
  });
}
