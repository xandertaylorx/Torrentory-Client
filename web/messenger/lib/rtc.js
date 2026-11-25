// Call quality tuning. Trystero builds every connection with `rtcPolyfill`, so we hand it a
// subclass of RTCPeerConnection that:
//   - rewrites our local SDP: Opus at up to 128 kbps with in-band FEC and no DTX, and a higher
//     starting bitrate for video so the picture is sharp from the first seconds
//   - orders codecs per track: RED+Opus for audio, H.264 first for cameras (hardware encoders
//     on most phones and laptops), VP9 first for screen share (crisp text)
//   - sets sender limits: bitrate, frame rate, priority and what to give up under pressure
// Everything here is a hint the browser may ignore; nothing breaks if a browser doesn't support it.

// ---------- capture constraints ----------
export const AUDIO_CONSTRAINTS = {
  echoCancellation: true, noiseSuppression: true, autoGainControl: true,
  channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 }, sampleSize: { ideal: 16 },
};
export const CAMERA_CONSTRAINTS = {
  width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 },
  aspectRatio: { ideal: 16 / 9 }, facingMode: 'user', resizeMode: 'none',
};
export const SCREEN_CONSTRAINTS = {
  video: { width: { max: 2560 }, height: { max: 1440 }, frameRate: { ideal: 30, max: 30 } },
  audio: false,
};

// ---------- budgets ----------
const AUDIO_BPS = 128_000;
const SCREEN_BPS = 4_000_000;
let others = 1; // people on the other end of the call; each gets their own copy of my video
const cameraBps = () => (others <= 1 ? 2_500_000 : others === 2 ? 1_500_000 : 1_000_000);

// ---------- SDP ----------
function fmtpFor(lines, pt) { return lines.findIndex((l) => l.startsWith(`a=fmtp:${pt} `)); }
function mergeParams(existing, add) {
  const map = new Map(existing.split(';').filter(Boolean).map((p) => { const [k, ...v] = p.split('='); return [k.trim(), v.join('=')]; }));
  for (const [k, v] of Object.entries(add)) map.set(k, String(v));
  return [...map].map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(';');
}
export function tuneSdp(sdp) {
  const lines = sdp.split('\r\n');
  const rtpmaps = lines.map((l) => l.match(/^a=rtpmap:(\d+) ([\w-]+)\/(\d+)/i)).filter(Boolean);
  for (const [, pt, codec] of rtpmaps) {
    const name = codec.toLowerCase();
    let add = null;
    if (name === 'opus') add = { minptime: 10, useinbandfec: 1, usedtx: 0, stereo: 0, 'sprop-stereo': 0, maxaveragebitrate: AUDIO_BPS, maxplaybackrate: 48000 };
    else if (['h264', 'vp8', 'vp9', 'av1'].includes(name)) add = { 'x-google-start-bitrate': 1200 };
    if (!add) continue;
    const i = fmtpFor(lines, pt);
    if (i >= 0) {
      const [head, ...rest] = lines[i].split(' ');
      lines[i] = `${head} ${mergeParams(rest.join(' '), add)}`;
    } else {
      const at = lines.findIndex((l) => l.startsWith(`a=rtpmap:${pt} `));
      lines.splice(at + 1, 0, `a=fmtp:${pt} ${mergeParams('', add)}`);
    }
  }
  return lines.join('\r\n');
}

// ---------- codec order ----------
function orderCodecs(kind, first) {
  const caps = RTCRtpReceiver.getCapabilities?.(kind)?.codecs;
  if (!caps) return null;
  const rank = (c) => { const i = first.indexOf(c.mimeType.toLowerCase().split('/')[1]); return i < 0 ? first.length : i; };
  // keep every codec (rtx, red, ulpfec matter for loss recovery), just move the preferred ones up
  return [...caps].sort((a, b) => rank(a) - rank(b));
}
const isScreen = (track) => track.contentHint === 'detail' || track.contentHint === 'text';

function setCodecOrder(pc, sender, track) {
  const t = pc.getTransceivers?.().find((x) => x.sender === sender);
  if (!t?.setCodecPreferences) return;
  const order = track.kind === 'audio' ? orderCodecs('audio', ['red', 'opus'])
    : isScreen(track) ? orderCodecs('video', ['vp9', 'h264', 'av1', 'vp8'])
    : orderCodecs('video', ['h264', 'vp9', 'vp8', 'av1']);
  try { if (order) t.setCodecPreferences(order); } catch {}
}

// ---------- sender limits ----------
const senders = new Set(); // { sender, track }
async function applyLimits({ sender, track }) {
  if (!sender.track) return;
  try {
    const p = sender.getParameters();
    if (!p.encodings?.length) p.encodings = [{}];
    const e = p.encodings[0];
    if (track.kind === 'audio') {
      Object.assign(e, { maxBitrate: AUDIO_BPS, priority: 'high', networkPriority: 'high' });
    } else if (isScreen(track)) {
      Object.assign(e, { maxBitrate: SCREEN_BPS, maxFramerate: 30, scaleResolutionDownBy: 1, priority: 'medium', networkPriority: 'medium' });
      p.degradationPreference = 'maintain-resolution';
    } else {
      Object.assign(e, { maxBitrate: cameraBps(), maxFramerate: 30, scaleResolutionDownBy: 1, priority: 'medium', networkPriority: 'medium' });
      p.degradationPreference = 'maintain-framerate';
    }
    await sender.setParameters(p);
  } catch { /* some browsers only accept this once the connection is negotiated; retried then */ }
}
function track(pc, sender, t) {
  const entry = { sender, track: t };
  senders.add(entry);
  setCodecOrder(pc, sender, t);
  applyLimits(entry);
  const again = () => { if (pc.signalingState === 'stable') applyLimits(entry); };
  pc.addEventListener('signalingstatechange', again);
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'connected') applyLimits(entry);
    if (pc.connectionState === 'closed') senders.delete(entry);
  });
}

// how many people I'm sending video to: split the upload sensibly in group calls
export function setCallSize(n) {
  const next = Math.max(1, n);
  if (next === others) return;
  others = next;
  for (const e of senders) { if (!e.sender.track) senders.delete(e); else if (e.track.kind === 'video') applyLimits(e); }
}

// ---------- the connection class ----------
export class TunedPeerConnection extends RTCPeerConnection {
  async setLocalDescription(desc) {
    if (desc?.type === 'rollback') return super.setLocalDescription(desc);
    let d = desc;
    if (!d?.sdp) {
      const answering = this.signalingState === 'have-remote-offer' || this.signalingState === 'have-local-pranswer';
      d = answering ? await this.createAnswer() : await this.createOffer();
    }
    let sdp = d.sdp;
    try { sdp = tuneSdp(d.sdp); } catch { /* fall back to the browser's own SDP */ }
    try { return await super.setLocalDescription({ type: d.type, sdp }); }
    catch { return super.setLocalDescription({ type: d.type, sdp: d.sdp }); }
  }
  addTrack(t, ...streams) {
    const sender = super.addTrack(t, ...streams);
    try { track(this, sender, t); } catch {}
    return sender;
  }
}

// ---------- live stats for the call header ----------
export async function readStats(pcs) {
  let width = 0, height = 0, fps = 0, rtt = 0, lost = 0, recv = 0, n = 0;
  for (const pc of pcs) {
    if (!pc || pc.connectionState !== 'connected') continue;
    const stats = await pc.getStats();
    stats.forEach((s) => {
      if (s.type === 'inbound-rtp' && s.kind === 'video' && s.frameWidth) {
        if (s.frameWidth * s.frameHeight > width * height) { width = s.frameWidth; height = s.frameHeight; fps = Math.round(s.framesPerSecond || 0); }
      }
      if (s.type === 'inbound-rtp') { lost += s.packetsLost || 0; recv += s.packetsReceived || 0; }
      if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && s.currentRoundTripTime != null) { rtt += s.currentRoundTripTime; n++; }
    });
  }
  const ms = n ? Math.round((rtt / n) * 1000) : null;
  const loss = recv + lost ? lost / (recv + lost) : 0;
  const quality = ms == null ? null : ms > 300 || loss > 0.05 ? 'poor' : ms > 150 || loss > 0.02 ? 'ok' : 'good';
  return { width, height, fps, ms, loss, quality };
}
