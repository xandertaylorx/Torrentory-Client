// Image re-encoding (strips EXIF/location), voice recording, waveform extraction.

export async function prepareImage(file, max = 2048) {
  if (file.type === 'image/gif' && file.size < 12e6) {
    const bmp = await createImageBitmap(file);
    const out = { bin: new Uint8Array(await file.arrayBuffer()), mime: 'image/gif', w: bmp.width, hgt: bmp.height };
    bmp.close();
    return out;
  }
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  return { bin: new Uint8Array(await blob.arrayBuffer()), mime: blob.type, w, hgt: h };
}

export async function squareAvatar(file, size = 192) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close();
  let url = canvas.toDataURL('image/webp', 0.82);
  if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.82);
  return url;
}

// ---------- voice ----------
const pickMime = () => ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';

export class VoiceRecorder {
  async start(onLevel) {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const mime = pickMime();
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250);
    this.t0 = performance.now();
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 1024;
    src.connect(this.an);
    const buf = new Float32Array(this.an.fftSize);
    const tick = () => {
      if (!this.an) return;
      this.an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      onLevel?.(Math.min(1, Math.sqrt(sum / buf.length) * 4.5), (performance.now() - this.t0) / 1000);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  async stop() {
    const done = new Promise((r) => { this.rec.onstop = r; });
    this.rec.stop();
    await done;
    this.cleanup();
    const blob = new Blob(this.chunks, { type: this.rec.mimeType || 'audio/webm' });
    return { blob, mime: blob.type.split(';')[0] };
  }
  cancel() { try { this.rec?.stop(); } catch {} this.cleanup(); }
  cleanup() {
    cancelAnimationFrame(this.raf);
    this.an = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
  }
}

export async function decodeAudio(bytes) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try { return await ctx.decodeAudioData(bytes.slice(0).buffer); } finally { ctx.close().catch(() => {}); }
}

export function waveform(audioBuffer, bars = 56) {
  const data = audioBuffer.getChannelData(0);
  const step = Math.floor(data.length / bars) || 1;
  const peaks = [];
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) sum += data[j] * data[j];
    peaks.push(Math.sqrt(sum / step));
  }
  const max = Math.max(...peaks, 0.0001);
  return peaks.map((p) => Math.round(Math.max(0.06, Math.pow(p / max, 0.8)) * 100) / 100);
}

// 16 kHz mono Float32 for the speech model
export async function to16kMono(audioBuffer) {
  const len = Math.ceil(audioBuffer.duration * 16000);
  const off = new OfflineAudioContext(1, len, 16000);
  const src = off.createBufferSource();
  src.buffer = audioBuffer;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

export const fmtTime = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const fmtSize = (n) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

// ---------- live transcript while recording ----------
// Uses the browser's own speech recognition, on-device only (Chrome downloads the language pack
// once, in the background). If this browser can't do it on-device, there's simply no transcript:
// audio is never sent to a speech service.
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

export async function startTranscriber(onText) {
  if (!SR?.available) return null;
  const lang = navigator.language || 'en-US';
  try {
    const status = await SR.available({ langs: [lang], processLocally: true });
    if (status !== 'available') {
      if (status === 'downloadable') SR.install?.({ langs: [lang], processLocally: true }).catch(() => {});
      return null;
    }
  } catch { return null; }

  let finals = '';
  let interim = '';
  let active = true;
  let ended = null;
  const r = new SR();
  r.lang = lang;
  r.continuous = true;
  r.interimResults = true;
  r.processLocally = true;
  r.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finals += (finals && !/\s$/.test(finals) ? ' ' : '') + t.trim();
      else interim += t;
    }
    onText?.((finals + ' ' + interim).trim());
  };
  r.onerror = () => {};
  r.onend = () => { if (active) { try { r.start(); } catch {} } else ended?.(); };
  try { r.start(); } catch { return null; }

  return {
    async stop() {
      active = false;
      const done = new Promise((res) => { ended = res; setTimeout(res, 1500); });
      try { r.stop(); } catch {}
      await done;
      const text = (finals + ' ' + interim).trim();
      return text ? text[0].toUpperCase() + text.slice(1) : '';
    },
    cancel() { active = false; try { r.abort(); } catch {} },
  };
}
